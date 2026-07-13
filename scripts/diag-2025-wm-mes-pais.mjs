import pg from 'pg'
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
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
const f = (n) => Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })

const QLIK = {
  CR: { 5: 25071, 6: 90293, 7: 91083, 8: 84952, 9: 94948, 10: 114631, 11: 118069, 12: 138916, total: 757963 },
  GT: { 7: 9514, 8: 29959, 9: 43898, 10: 19320, 11: 16341, 12: 43047, total: 162079 },
  HN: { 6: 5901, 7: 16447, 8: 16926, 9: 11495, 10: 4126, 11: 10093, 12: 28386, total: 93374 },
  NI: { 5: 203, 6: 2740, 7: 2357, 8: 2325, 9: 3635, 10: 4646, 11: 5263, 12: 4293, total: 25462 },
  SV: { 6: 666, 7: 2758, 8: 3115, 9: 8465, 10: 5757, 11: 6646, 12: 2790, total: 30197 },
}

console.log('=== Walmart 2025 por país × mes calendario: BD vs Qlik (WM Month) ===\n')
console.log('Nota: Qlik usa WM Month (períodos 4-5-4 Walmart), no mes calendario.\n')

for (const pais of ['CR', 'GT', 'HN', 'NI', 'SV']) {
  console.log(`\n[${pais}]`)
  console.log(`  Mes |   BD ($)    |  Qlik ($)   | Diff`)
  console.log(`  ----|-------------|-------------|------`)
  const r = await pool.query(`
    SELECT EXTRACT(MONTH FROM fecha)::int AS mes,
           ROUND(SUM(ventas_valor)::numeric, 0) AS usd
    FROM fact_ventas_walmart
    WHERE fecha >= '2025-01-01' AND fecha < '2026-01-01' AND pais = $1
    GROUP BY mes ORDER BY mes
  `, [pais])
  const bd = new Map()
  for (const x of r.rows) bd.set(Number(x.mes), Number(x.usd))
  let subBD = 0, subQ = 0
  for (let m = 1; m <= 12; m++) {
    const b = bd.get(m) ?? 0
    const q = QLIK[pais][m] ?? 0
    if (b === 0 && q === 0) continue
    const d = b - q
    console.log(`  M${String(m).padEnd(2)} | ${f(b).padStart(11)} | ${f(q).padStart(11)} | ${d >= 0 ? '+' : ''}${f(d)}`)
    subBD += b; subQ += q
  }
  console.log(`  TOT | ${f(subBD).padStart(11)} | ${f(QLIK[pais].total).padStart(11)} | ${(subBD - QLIK[pais].total) >= 0 ? '+' : ''}${f(subBD - QLIK[pais].total)}`)
}

// Buscar duplicados en CR - mismos (fecha, sku, punto_venta) con dos ventas
console.log('\n\n=== Buscar duplicados en CR Walmart 2025 ===')
const dup = await pool.query(`
  SELECT fecha, punto_venta, codigo_barras, COUNT(*) AS n
  FROM fact_ventas_walmart
  WHERE pais = 'CR' AND fecha >= '2025-01-01' AND fecha < '2026-01-01'
  GROUP BY fecha, punto_venta, codigo_barras
  HAVING COUNT(*) > 1
  ORDER BY n DESC LIMIT 10
`)
console.log(`  Duplicados (fecha+pv+codigo_barras) en CR: ${dup.rows.length} keys con >1`)
for (const x of dup.rows.slice(0, 5)) console.log(`    ${x.fecha.toISOString().slice(0,10)} | ${x.punto_venta} | ${x.codigo_barras}: ${x.n}`)

console.log('\n=== CR: distribución por archivo_origen ===')
const ao = await pool.query(`
  SELECT archivo_origen, COUNT(*) AS n, ROUND(SUM(ventas_valor)::numeric, 0) AS usd
  FROM fact_ventas_walmart
  WHERE pais = 'CR' AND fecha >= '2025-01-01' AND fecha < '2026-01-01'
  GROUP BY archivo_origen ORDER BY 2 DESC
`)
for (const x of ao.rows) console.log(`  ${x.archivo_origen ?? '(null)'}: ${f(x.n)} filas · $${f(x.usd)}`)

await pool.end()
