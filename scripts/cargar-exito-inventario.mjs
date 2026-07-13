/**
 * cargar-exito-inventario.mjs
 * Carga la pestaña "Inventario" del archivo BASE_COLOMBIA_Sellout_2026.xlsx
 * a la tabla inventario_exito.
 *
 * Uso:
 *   node scripts/cargar-exito-inventario.mjs [ruta_archivo]
 *   (por defecto usa OneDrive local)
 */
import pg from 'pg'
import XLSX from 'xlsx'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, basename } from 'path'

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

const INPUT = process.argv[2] || 'C:/Users/IAN/OneDrive - BL Foods Corporation SA/BASE_COLOMBIA_Sellout_2026.xlsx'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 })

// dim_producto_co (primario) + dim_producto (fallback)
console.log('📥 dim_producto_co + dim_producto…')
const dimMap = new Map()
const dimCoRes = await pool.query(`SELECT ean13 AS codigo_barras, sku, descripcion, categoria, subcategoria FROM dim_producto_co WHERE ean13 IS NOT NULL`)
for (const r of dimCoRes.rows) dimMap.set(r.codigo_barras, r)
const nCo = dimMap.size
const dimRes = await pool.query(`SELECT codigo_barras, sku, descripcion, categoria, subcategoria FROM dim_producto WHERE codigo_barras IS NOT NULL`)
for (const r of dimRes.rows) if (!dimMap.has(r.codigo_barras)) dimMap.set(r.codigo_barras, r)
console.log(`   ${nCo} de dim_producto_co + ${dimMap.size - nCo} de dim_producto`)

// precios_exito para levantar tasa promedio COP→USD del sellout
console.log('📥 tasa cambio promedio…')
const tR = await pool.query(`
  SELECT AVG(NULLIF(tasa_cambio, 0)) AS avg_tasa
  FROM fact_ventas_exito
  WHERE pais='CO' AND tasa_cambio > 0 AND fecha_snapshot_synthetic <= NOW() OR ano=2026 AND mes>=6
`).catch(async () => {
  return await pool.query(`SELECT AVG(NULLIF(tasa_cambio, 0)) AS avg_tasa FROM fact_ventas_exito WHERE pais='CO' AND tasa_cambio > 0 AND ano=2026 AND mes >= 6`)
})
const tasaProm = Number(tR.rows[0]?.avg_tasa) || 4300
console.log(`   Tasa promedio COP/USD reciente: ${tasaProm.toFixed(2)}`)

// Match UPC → dim (con override + búsqueda con dígito extra)
const UPC_OVERRIDE = {}
const matchDim = (raw) => {
  if (!raw) return null
  const s = String(raw).trim()
  const stripped = s.replace(/^0+/, '')
  if (UPC_OVERRIDE[stripped]) return dimMap.get(UPC_OVERRIDE[stripped]) ?? null
  if (dimMap.has(stripped)) return dimMap.get(stripped)
  if (dimMap.has(s)) return dimMap.get(s)
  for (let d = 0; d <= 9; d++) if (dimMap.has(stripped + String(d))) return dimMap.get(stripped + String(d))
  return null
}

// ── Leer archivo ──────────────────────────────────────────────────────
console.log(`\n📂 ${basename(INPUT)}`)
const wb = XLSX.readFile(INPUT)
const ws = wb.Sheets['Inventario']
if (!ws) throw new Error('No existe pestaña "Inventario"')
const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
console.log(`   ${rows.length} filas`)

// ── Procesar ─────────────────────────────────────────────────────────
const filas = []
const sinCross = new Set()
const fechasArchivo = new Set()
const puntosVenta = new Set()

for (const r of rows) {
  const ano = parseInt(r['Año']) || parseInt(r['Ano'])
  const mes = parseInt(r['Mes'])
  const dia = parseInt(r['Dia']) || parseInt(r['Día'])
  if (!ano || !mes || !dia) continue

  const fecha = `${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`
  fechasArchivo.add(fecha)

  const gln = String(r['Gln'] ?? '').trim()
  const pv  = String(r['Punto de Venta'] ?? '').trim()
  const ean = String(r['Ean Producto'] ?? '').trim()
  const plu = String(r['Código Interno (PLU)'] ?? r['Codigo Interno (PLU)'] ?? '').trim()
  const prod = String(r['Producto'] ?? '').trim()
  const marca = String(r['Marca'] ?? '').trim()
  const invQ = Number(r['Inventario (Q)']) || 0
  const invCOP = Number(r['Inventario ($)']) || 0

  if (!pv || !ean) continue
  puntosVenta.add(pv)

  const dim = matchDim(ean)
  if (!dim) sinCross.add(ean)

  const invUSD = invCOP > 0 ? Math.round((invCOP / tasaProm) * 100) / 100 : null

  filas.push({
    fecha_snapshot:  fecha,
    pais:            'CO',
    cliente:         'GRUPO ÉXITO',
    cadena:          null,                        // se enriquece luego cruzando con base_punto_venta
    gln:             gln || null,
    punto_venta:     pv,
    ean13:           ean,
    plu:             plu || null,
    sku:             dim?.sku ?? null,
    descripcion:     dim?.descripcion ?? prod,
    marca:           marca || 'BORDEN',
    categoria:       dim?.categoria ?? null,
    subcategoria:    dim?.subcategoria ?? null,
    inv_unidades:    invQ,
    inv_valor_cop:   invCOP,
    inv_valor_usd:   invUSD,
    archivo_origen:  'BASE_COLOMBIA_Sellout_2026.xlsx',
  })
}

console.log(`   Válidas: ${filas.length}`)
console.log(`   Fechas: ${[...fechasArchivo].sort().join(', ')}`)
console.log(`   PDVs únicos: ${puntosVenta.size}`)
if (sinCross.size) console.log(`   UPCs sin match dim_producto (${sinCross.size}): ${[...sinCross].slice(0,10).join(', ')}...`)

// ── UPSERT ────────────────────────────────────────────────────────────
console.log('\n📥 UPSERT a inventario_exito…')
const COLS = ['fecha_snapshot','pais','cliente','cadena','gln','punto_venta','ean13','plu','sku','descripcion','marca','categoria','subcategoria','inv_unidades','inv_valor_cop','inv_valor_usd','archivo_origen']
const upsertSql = `
  INSERT INTO inventario_exito (${COLS.join(',')})
  VALUES %VALS%
  ON CONFLICT (fecha_snapshot, punto_venta, ean13) DO UPDATE SET
    inv_unidades  = EXCLUDED.inv_unidades,
    inv_valor_cop = EXCLUDED.inv_valor_cop,
    inv_valor_usd = EXCLUDED.inv_valor_usd,
    sku           = COALESCE(EXCLUDED.sku, inventario_exito.sku),
    categoria     = COALESCE(EXCLUDED.categoria, inventario_exito.categoria),
    subcategoria  = COALESCE(EXCLUDED.subcategoria, inventario_exito.subcategoria)
`
const BATCH = 500
for (let i = 0; i < filas.length; i += BATCH) {
  const chunk = filas.slice(i, i + BATCH)
  const vals = [], params = []
  let p = 1
  for (const r of chunk) {
    vals.push('(' + COLS.map(() => `$${p++}`).join(',') + ')')
    for (const c of COLS) params.push(r[c])
  }
  await pool.query(upsertSql.replace('%VALS%', vals.join(',')), params)
  process.stdout.write(`\r   ${i + chunk.length}/${filas.length}`)
}
console.log('\n   ✅')

// Enriquecer geografía completa desde "base punto de venta"
// tanto en inventario_exito como en fact_ventas_exito.
// Match tolerante: normaliza acentos, ñ→n, encoding corrupto (Â/Ã),
// espacios y guiones. Si el match por nombre falla, cae al código numérico
// que aparece al inicio del nombre (ej. "4851 - TURBO CARULLA ISERRA 100").
const normPv = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase()
  .replace(/Ñ/g, 'N')
  .replace(/[ÂÃ]/g, '')
  .replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim()
const codePv = (s) => {
  const m = String(s || '').match(/^\s*(\d+)/)
  return m ? m[1] : null
}
// Quita el prefijo numérico "4753-" o "4753 - " del inicio del nombre.
const stripCode = (s) => String(s || '').replace(/^\s*\d+\s*-\s*/, '')

const wsPdv = wb.Sheets['base punto de venta']
if (wsPdv) {
  console.log('\n📥 Enriqueciendo geografía desde "base punto de venta"…')
  const pdvRows = XLSX.utils.sheet_to_json(wsPdv, { defval: '' })
  const byNorm = new Map()
  const byCode = new Map()
  const byBare = new Map()   // por nombre sin código: 'SURTIMAYORISTA CURUMANI'
  for (const r of pdvRows) {
    const pv = String(r['PUNTO DE VENTA'] ?? '').trim()
    if (!pv) continue
    byNorm.set(normPv(pv), r)
    byBare.set(normPv(stripCode(pv)), r)
    const c = codePv(pv)
    if (c && !byCode.has(c)) byCode.set(c, r)
  }

  // Colectar PDVs distintos en BD y aplicar match normalizado + fallback por código
  const pdvsInv = await pool.query(`SELECT DISTINCT punto_venta FROM inventario_exito WHERE pais='CO'`)
  const pdvsFact = await pool.query(`SELECT DISTINCT punto_venta FROM fact_ventas_exito WHERE pais='CO'`)

  const applyUpdate = async (rows, table) => {
    let updates = 0, unmatched = 0
    for (const {punto_venta: pv} of rows) {
      const rec = byNorm.get(normPv(pv))
                  || byCode.get(codePv(pv) || '')
                  || byBare.get(normPv(stripCode(pv)))
      if (!rec) { unmatched++; continue }
      const cadena       = String(rec['CADENA']      ?? '').trim() || null
      const gln          = String(rec['GLN']         ?? '').trim() || null
      const subcadena    = String(rec['SUBCADENA']   ?? '').trim() || null
      const departamento = String(rec['DEPARTAMENTO']?? '').trim() || null
      const ciudad       = String(rec['CIUDAD']      ?? '').trim() || null

      const sql = table === 'inventario_exito'
        ? `UPDATE inventario_exito SET
             cadena       = COALESCE(NULLIF(cadena,''), $1),
             subcadena    = COALESCE(subcadena, $2),
             departamento = COALESCE(departamento, $3),
             ciudad       = COALESCE(ciudad, $4),
             gln          = COALESCE(gln, $5)
           WHERE punto_venta = $6`
        : `UPDATE fact_ventas_exito SET
             subcadena    = COALESCE(subcadena, $2),
             departamento = COALESCE(departamento, $3),
             ciudad       = COALESCE(ciudad, $4),
             gln          = COALESCE(gln, $5)
           WHERE punto_venta = $6 AND pais = 'CO'
             AND ($1 IS NOT NULL OR TRUE)`
      const params = [cadena, subcadena, departamento, ciudad, gln, pv]
      const r = await pool.query(sql, params)
      updates += r.rowCount
    }
    return { updates, unmatched }
  }

  const rInv  = await applyUpdate(pdvsInv.rows, 'inventario_exito')
  const rFact = await applyUpdate(pdvsFact.rows, 'fact_ventas_exito')
  console.log(`   inventario: ${rInv.updates} filas · ${rInv.unmatched} PDVs sin match en base`)
  console.log(`   fact_ventas: ${rFact.updates} filas · ${rFact.unmatched} PDVs sin match en base`)
}

// ── Resumen ─────────────────────────────────────────────────────────
console.log('\n🔎 Resumen inventario_exito:')
const s = await pool.query(`
  SELECT fecha_snapshot, cadena,
         COUNT(*) AS combinaciones,
         COUNT(*) FILTER (WHERE inv_unidades > 0) AS con_stock,
         COUNT(*) FILTER (WHERE inv_unidades = 0) AS quiebres,
         ROUND(SUM(inv_unidades)::numeric,0) AS uds,
         ROUND(SUM(inv_valor_cop)::numeric,0) AS cop,
         ROUND(SUM(inv_valor_usd)::numeric,2) AS usd
  FROM inventario_exito GROUP BY fecha_snapshot, cadena ORDER BY fecha_snapshot, cadena
`)
for (const x of s.rows) {
  const f = new Date(x.fecha_snapshot).toISOString().slice(0,10)
  console.log(`  ${f} · ${(x.cadena??'—').padEnd(15)} · ${x.combinaciones} combos (${x.con_stock} con stock, ${x.quiebres} quiebres) · ${Number(x.uds).toLocaleString()} und · COP ${Number(x.cop).toLocaleString()} · $${Number(x.usd).toLocaleString()}`)
}

await pool.end()
console.log('\n🎉 Carga inventario Éxito completa')
