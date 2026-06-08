/**
 * import-dcd-cedi.mjs
 * Importa el reporte DCD de RetailLink a fact_inventario_walmart_cedi e inventario_cedi
 * Uso: node scripts/import-dcd-cedi.mjs <ruta_al_archivo.xls>
 */
import pg from 'pg'
import XLSX from 'xlsx'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = readFileSync(join(__dirname, '../.env.local'), 'utf8')
for (const raw of env.split(/\r?\n/)) {
  const line = raw.trim()
  if (!line || line.startsWith('#')) continue
  const eq = line.indexOf('=')
  if (eq < 0) continue
  process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
}
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

// DCD columns (header row 31, 0-based):
// 0:Country, 1:UPC, 2:ItemNbr, 3:Desc, 4:Type, 5:SubType, 6:AcctDept
// 7:BrandID, 8:BrandDesc, 9:VendorNbr, 10:VendorName
// 11:VNPK, 12:WHPK, 13:WHOnHand, 14:WMWeek, 15:WHOnOrder, 16:Status

const filePath = process.argv[2]
if (!filePath) {
  console.error('Uso: node scripts/import-dcd-cedi.mjs <archivo.xls>')
  process.exit(1)
}

console.log('📂 Leyendo:', filePath)
const wb = XLSX.readFile(filePath)
const ws = wb.Sheets[wb.SheetNames[0]]
const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

// Encontrar la fila de headers
let headerIdx = -1
for (let i = 0; i < allRows.length; i++) {
  if (allRows[i][0] === 'Country Code') { headerIdx = i; break }
}
if (headerIdx < 0) { console.error('No se encontró fila de headers'); process.exit(1) }

const dataRows = allRows.slice(headerIdx + 1).filter(r => r[0] && r[0].length === 2)
console.log(`✅ ${dataRows.length} filas encontradas`)

const wmWeek  = Number(dataRows[0]?.[14]) || 0
const byPais  = {}
for (const r of dataRows) byPais[r[0]] = (byPais[r[0]] || 0) + 1
console.log('Por país:', byPais)
console.log('WM Week:', wmWeek)

// Fecha: WM Week YYYYWW → calcular lunes de esa semana
function wmWeekToDate(yw) {
  const y = Math.floor(yw / 100)
  const w = yw % 100
  // Walmart fiscal year starts first Friday of February
  // Aproximación: usar ISO week
  const jan4 = new Date(y, 0, 4)
  const dayOfWeek = jan4.getDay() || 7
  const isoMonday = new Date(jan4)
  isoMonday.setDate(jan4.getDate() - (dayOfWeek - 1))
  isoMonday.setDate(isoMonday.getDate() + (w - 1) * 7)
  return isoMonday.toISOString().slice(0, 10)
}
const fechaSnap = wmWeekToDate(wmWeek)
console.log('Fecha snapshot (aprox.):', fechaSnap)

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

// ── Mapeo SKU desde dim_producto ─────────────────────────────────────────
const skuMap = await pool.query(`
  SELECT codigo_barras, sku, categoria, subcategoria FROM dim_producto
`)
const barcode2sku     = {}
const barcode2cat     = {}
const barcode2subcat  = {}
for (const r of skuMap.rows) {
  // Normalizar barcode: quitar zeros a la izquierda
  const norm = String(r.codigo_barras).replace(/^0+/, '')
  barcode2sku[norm]    = r.sku
  barcode2cat[norm]    = r.categoria
  barcode2subcat[norm] = r.subcategoria
}

function normBarcode(upc) {
  return String(upc).replace(/^0+/, '')
}

// ── Borrar semana existente ──────────────────────────────────────────────
await pool.query(`DELETE FROM fact_inventario_walmart_cedi WHERE wm_week = $1 AND wm_week IS NOT NULL`, [wmWeek])
await pool.query(`DELETE FROM inventario_cedi WHERE wm_week = $1`, [wmWeek])
console.log(`🗑️  Datos semana ${wmWeek} eliminados`)

// ── Deduplicar por (pais, upc) — keep last ───────────────────────────────
const seen = new Map()
for (const r of dataRows) seen.set(`${r[0]}|${r[1]}`, r)
const dedupRows = Array.from(seen.values())
console.log(`Dedup: ${dataRows.length} → ${dedupRows.length} filas únicas`)

// ── Insertar en fact_inventario_walmart_cedi ─────────────────────────────
const vals1 = []
const params1 = []
let p = 1
for (const r of dedupRows) {
  const upc   = String(r[1]).trim()
  const norm  = normBarcode(upc)
  const sku   = String(r[2]).trim()
  const desc  = String(r[3]).trim()
  const cat   = barcode2cat[norm] ?? null
  const cajas = Number(r[13]) || 0
  const orden = Number(r[15]) || 0
  const est   = String(r[16]).trim()

  vals1.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`)
  params1.push(fechaSnap, r[0], sku, upc, desc, cat, cajas, orden, wmWeek, est, filePath.split(/[\\/]/).pop())
}

await pool.query(`
  INSERT INTO fact_inventario_walmart_cedi
    (fecha, pais, sku, codigo_barras, descripcion, categoria, inv_cajas, inv_orden_cajas, wm_week, estado, archivo_origen)
  VALUES ${vals1.join(',')}
  ON CONFLICT (fecha, pais, codigo_barras)
  DO UPDATE SET
    sku = EXCLUDED.sku, descripcion = EXCLUDED.descripcion, categoria = EXCLUDED.categoria,
    inv_cajas = EXCLUDED.inv_cajas, inv_orden_cajas = EXCLUDED.inv_orden_cajas,
    wm_week = EXCLUDED.wm_week, estado = EXCLUDED.estado, archivo_origen = EXCLUDED.archivo_origen
`, params1)
console.log(`✅ ${dataRows.length} filas → fact_inventario_walmart_cedi`)

// ── Insertar en inventario_cedi ──────────────────────────────────────────
const vals2 = []
const params2 = []
p = 1
for (const r of dedupRows) {
  const upc   = String(r[1]).trim()
  const norm  = normBarcode(upc)
  const sku   = barcode2sku[norm] ?? String(r[2]).trim()
  const cat   = barcode2cat[norm] ?? null
  const sub   = barcode2subcat[norm] ?? null

  vals2.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`)
  params2.push(
    fechaSnap, r[0],
    upc, String(r[2]).trim(), String(r[3]).trim(),
    String(r[7]).trim(), String(r[8]).trim(),
    String(r[9]).trim(), String(r[10]).trim(),
    Number(r[13]) || 0, Number(r[15]) || 0,
    wmWeek, String(r[16]).trim(),
    sku, cat, sub
  )
}

await pool.query(`
  INSERT INTO inventario_cedi
    (fecha, pais, upc, item_nbr, descripcion, marca_id, marca, proveedor_nbr, proveedor,
     inv_mano_cajas, inv_orden_cajas, wm_week, estado, sku, categoria, subcategoria)
  VALUES ${vals2.join(',')}
  ON CONFLICT DO NOTHING
`, params2).catch(e => {
  // inventario_cedi may have different constraints; try without ON CONFLICT
  return pool.query(`
    INSERT INTO inventario_cedi
      (fecha, pais, upc, item_nbr, descripcion, marca_id, marca, proveedor_nbr, proveedor,
     inv_mano_cajas, inv_orden_cajas, wm_week, estado, sku, categoria, subcategoria)
    VALUES ${vals2.join(',')}
  `, params2)
})
console.log(`✅ ${dataRows.length} filas → inventario_cedi`)

// ── Resumen ──────────────────────────────────────────────────────────────
const s = await pool.query(`
  SELECT pais,
    COUNT(*) AS skus,
    SUM(CASE WHEN estado = 'A' THEN 1 ELSE 0 END) AS activos,
    SUM(CASE WHEN estado = 'I' THEN 1 ELSE 0 END) AS inactivos,
    SUM(inv_cajas) AS total_cajas,
    SUM(inv_orden_cajas) AS total_orden
  FROM fact_inventario_walmart_cedi WHERE wm_week = $1
  GROUP BY pais ORDER BY pais
`, [wmWeek])
console.log('\n=== Resumen CEDI por país ===')
for (const r of s.rows)
  console.log(`  ${r.pais}: ${r.skus} SKUs (A:${r.activos} I:${r.inactivos}) · ${Number(r.total_cajas).toLocaleString()} cj mano · ${Number(r.total_orden).toLocaleString()} cj en orden`)

await pool.end()
