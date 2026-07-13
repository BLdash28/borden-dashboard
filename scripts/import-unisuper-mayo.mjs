/**
 * Carga UNISUPER_SELLOUTMAY2026.xlsx → fact_ventas_unisuper (Mayo 2026)
 * Cadenas: 2 ECONOSUPER, LA TORRE (GT)
 * Uso: node scripts/import-unisuper-mayo.mjs
 */
import pg   from 'pg'
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
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

const XLSX_PATH = 'C:/Users/IAN/Downloads/UNISUPER_SELLOUTMAY2026.xlsx'
const BATCH     = 500

function parseNum(v) {
  if (v === null || v === undefined || v === '') return 0
  return parseFloat(String(v).replace(/[$,\s]/g, '')) || 0
}

console.log(`📂 Leyendo: ${XLSX_PATH}`)
const wb   = XLSX.readFile(XLSX_PATH)
const ws   = wb.Sheets[wb.SheetNames[0]]
const raw  = XLSX.utils.sheet_to_json(ws, { defval: null })
console.log(`   ${raw.length} filas encontradas`)

// Detect column names (have surrounding spaces)
const sampleKeys = Object.keys(raw[0] || {})
const usdKey = sampleKeys.find(k => /venta.*valor.*usd/i.test(k.trim()))
const gtqKey = sampleKeys.find(k => /ventas.*valor.*gtq/i.test(k.trim()))
console.log(`   Columna USD: "${usdKey}"`)
console.log(`   Columna GTQ: "${gtqKey}"`)

const rows = []
let omitidas = 0

for (const r of raw) {
  const ano  = parseInt(r.ano  || 0)
  const mes  = parseInt(r.mes  || 0)
  const dia  = parseInt(r.dia  || 1) || 1
  const pais = String(r.pais || '').trim()
  if (!pais || !ano || !mes) { omitidas++; continue }

  const unidades = parseNum(r.ventas_unidades)
  const valorUSD = usdKey ? parseNum(r[usdKey]) : 0
  const valorGTQ = gtqKey ? parseNum(r[gtqKey]) : 0
  if (unidades === 0 && valorUSD === 0) { omitidas++; continue }

  rows.push([
    `${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`,
    pais,
    String(r.cadena   || '').trim(),
    null,                                                     // codigo_sucursal
    String(r.punto_venta  || '').trim() || null,              // nombre_sucursal
    String(r.categoria    || '').trim() || null,
    String(r.subcategoria || '').trim() || null,
    null,                                                     // marca
    String(r.sku          || '').trim(),
    r.codigo_barras != null ? String(r.codigo_barras) : null,
    String(r.descripcion  || '').trim() || null,
    unidades,
    valorUSD,
    valorGTQ,
  ])
}

console.log(`   ${rows.length} filas válidas | Omitidas: ${omitidas}`)

// Limpiar mayo 2026 para combos pais|cadena presentes
const combos = [...new Set(rows.map(r => `${r[1]}|${r[2]}`))]
console.log(`Limpiando Mayo 2026 para: ${combos.join(', ')}`)
for (const combo of combos) {
  const [pais, cadena] = combo.split('|')
  const { rowCount } = await pool.query(
    `DELETE FROM fact_ventas_unisuper
     WHERE pais = $1 AND cadena = $2
       AND EXTRACT(YEAR  FROM fecha) = 2026
       AND EXTRACT(MONTH FROM fecha) = 5`,
    [pais, cadena]
  )
  console.log(`  Eliminadas ${rowCount} filas previas de ${pais}/${cadena} May-2026`)
}

// Insert in batches
const COLS = [
  'fecha','pais','cadena','codigo_sucursal','nombre_sucursal',
  'categoria','subcategoria','marca','sku','codigo_barras',
  'descripcion','ventas_unidades','ventas_valor','ventas_valor_gtq',
]
let inserted = 0

for (let b = 0; b < rows.length; b += BATCH) {
  const batch = rows.slice(b, b + BATCH)
  const vals  = batch.map((_, i) => {
    const base = i * COLS.length
    return `(${COLS.map((_, j) => `$${base + j + 1}`).join(',')})`
  }).join(',')

  try {
    const res = await pool.query(
      `INSERT INTO fact_ventas_unisuper (${COLS.join(',')}) VALUES ${vals}`,
      batch.flat()
    )
    inserted += res.rowCount ?? 0
  } catch (err) {
    console.error(`\nError en batch ${b}:`, err.message)
    console.error('Primer row:', JSON.stringify(batch[0]))
    throw err
  }

  process.stdout.write(`\r   Procesados: ${b + batch.length}/${rows.length}`)
}
console.log(`\n✅ Insertadas: ${inserted} filas en fact_ventas_unisuper`)

// Verificar
const { rows: check } = await pool.query(`
  SELECT cadena, COUNT(*) AS filas, ROUND(SUM(ventas_valor)::numeric,2) AS total_usd
  FROM fact_ventas_unisuper
  WHERE EXTRACT(YEAR FROM fecha) = 2026 AND EXTRACT(MONTH FROM fecha) = 5
  GROUP BY cadena ORDER BY cadena
`)
console.log(`\n📊 Mayo 2026 en fact_ventas_unisuper:`)
for (const row of check) {
  console.log(`   ${row.cadena}: ${row.filas} filas | $${Number(row.total_usd).toLocaleString('en-US',{minimumFractionDigits:2})} USD`)
}

await pool.end()
console.log('\n🏁 Listo.')
