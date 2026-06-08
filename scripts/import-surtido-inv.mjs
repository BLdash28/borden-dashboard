/**
 * import-surtido-inv.mjs
 * Importa el reporte "Surtido-Inv" de RetailLink a fact_inventario_walmart_pdv
 * Uso: node scripts/import-surtido-inv.mjs <ruta_al_archivo.xls>
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

// ── Mapeo rptcode → cadena ────────────────────────────────────────────────
const CADENA_MAP = {
  HM: 'WALMART',
  ME: 'MAS X MENOS',
  MI: 'MAXI PALI',
  PI: 'PALI',
  DF: 'DESPENSA FAMILIAR',
  LJ: 'LA DESPENSA DON JUAN',
  PZ: 'PAIZ',
  LN: 'LA UNION',
  MX: 'MAXI DESPENSA',
  LP: 'LA TORRE',
}

// Columnas del reporte (row index 33, 0-based)
// 0:Country, 1:RptCode, 2:StoreNbr, 3:StoreName, 4:ItemNbr, 5:UPC
// 6:Desc, 7:Status, 8:Type, 9:SubType, 10:OrderBook
// 11:OnHand, 12:OnOrder, 13:InTransit, 14:InWhse
// 15:MBMCode, 16:Traited, 17:ValidComb, 18:ModEffDate, 19:ModDiscontDate, 20:ConsumerID

const filePath = process.argv[2]
if (!filePath) {
  console.error('Uso: node scripts/import-surtido-inv.mjs <archivo.xls>')
  process.exit(1)
}

console.log('📂 Leyendo:', filePath)
const wb = XLSX.readFile(filePath)
const ws = wb.Sheets[wb.SheetNames[0]]
const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

// Encontrar la fila de headers (contiene "Country Code")
let headerIdx = -1
for (let i = 0; i < allRows.length; i++) {
  if (allRows[i][0] === 'Country Code') { headerIdx = i; break }
}
if (headerIdx < 0) { console.error('No se encontró fila de headers'); process.exit(1) }

const dataRows = allRows.slice(headerIdx + 1).filter(r => r[0] && r[0].length === 2)
console.log(`✅ ${dataRows.length} filas de datos encontradas`)

// Agrupar por país para mostrar resumen
const byPais = {}
for (const r of dataRows) byPais[r[0]] = (byPais[r[0]] || 0) + 1
console.log('Por país:', byPais)

// Extraer semana WM del nombre de archivo o usar hoy
const today = new Date()
const wmWeek = null // se calculará del archivo si hay fecha

// Fecha snapshot: usar hoy
const fechaSnap = today.toISOString().slice(0, 10)
console.log('Fecha snapshot:', fechaSnap)

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

// ── Borrar datos del mismo día para permitir reimportación ──────────────
await pool.query(`DELETE FROM fact_inventario_walmart_pdv WHERE fecha = $1`, [fechaSnap])
console.log(`🗑️  Registros anteriores de ${fechaSnap} eliminados`)

// ── Insertar en lotes de 500 ────────────────────────────────────────────
const BATCH = 500
let inserted = 0

const parseDate = (v) => {
  if (!v || v === '') return null
  // RetailLink format: MM/DD/YYYY
  const parts = String(v).split('/')
  if (parts.length === 3) return `${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`
  return null
}

for (let i = 0; i < dataRows.length; i += BATCH) {
  const batch = dataRows.slice(i, i + BATCH)
  const values = []
  const params = []
  let p = 1

  for (const r of batch) {
    const pais       = String(r[0]).trim()
    const rptCode    = String(r[1]).trim()
    const cadena     = CADENA_MAP[rptCode] ?? rptCode
    const storeNbr   = String(r[2]).trim()
    const storeName  = String(r[3]).trim()
    const itemNbr    = String(r[4]).trim()
    const upc        = String(r[5]).trim()
    const desc       = String(r[6]).trim()
    // status r[7], skip
    const onHand     = Number(r[11]) || 0
    const onOrder    = Number(r[12]) || 0
    const inTransit  = Number(r[13]) || 0
    const inWhse     = Number(r[14]) || 0
    const traited    = Number(r[16]) === 1
    const validComb  = Number(r[17]) === 1
    const modEff     = parseDate(r[18])
    const modDiscont = parseDate(r[19])

    values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`)
    params.push(
      fechaSnap, pais, cadena, storeName, itemNbr, upc, desc, null,
      onHand, inTransit, onOrder, inWhse,
      traited, validComb, modEff, modDiscont
    )
  }

  await pool.query(`
    INSERT INTO fact_inventario_walmart_pdv
      (fecha, pais, cadena, punto_venta, sku, codigo_barras, descripcion, categoria,
       inv_mano, inv_transito, inv_orden, inv_bodega,
       traited, valid_comb, modular_eff_date, modular_discont_date)
    VALUES ${values.join(',')}
  `, params)

  inserted += batch.length
  process.stdout.write(`\r⬆️  Insertando... ${inserted}/${dataRows.length}`)
}

console.log(`\n✅ ${inserted} registros importados a fact_inventario_walmart_pdv`)

// Actualizar store_nbr por separado (no cambia el rendimiento de inserción)
await pool.query(`
  UPDATE fact_inventario_walmart_pdv t
  SET store_nbr = s.nbr
  FROM (VALUES ${dataRows.map((r, i) => `($${i*2+1}, $${i*2+2})`).join(',')}) AS s(name, nbr)
  WHERE t.punto_venta = s.name AND t.fecha = $${dataRows.length*2+1}
`, [...dataRows.flatMap(r => [String(r[3]).trim(), String(r[2]).trim()]), fechaSnap]).catch(() => {})

// ── Resumen final ────────────────────────────────────────────────────────
const summary = await pool.query(`
  SELECT pais, cadena,
    COUNT(DISTINCT punto_venta) AS tiendas,
    COUNT(DISTINCT sku)         AS skus,
    SUM(inv_mano)               AS total_mano,
    SUM(CASE WHEN traited THEN 1 ELSE 0 END) AS combos_traited
  FROM fact_inventario_walmart_pdv
  WHERE fecha = $1
  GROUP BY pais, cadena ORDER BY pais, cadena
`, [fechaSnap])

console.log('\n=== Resumen por país/cadena ===')
for (const r of summary.rows)
  console.log(`  ${r.pais} ${r.cadena}: ${r.tiendas} tiendas · ${r.skus} SKUs · ${Number(r.total_mano).toLocaleString()} uds mano · ${r.combos_traited} traited`)

await pool.end()
