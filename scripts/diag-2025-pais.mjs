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

console.log('=== 2025 por PAÍS y cliente (USD) ===\n')

// Walmart por país
console.log('-- WALMART por país --')
const w = await pool.query(`
  SELECT pais, COUNT(*) AS n,
         ROUND(SUM(ventas_unidades)::numeric, 0) AS und,
         ROUND(SUM(ventas_valor)::numeric, 0) AS usd
  FROM fact_ventas_walmart
  WHERE fecha >= '2025-01-01' AND fecha < '2026-01-01'
  GROUP BY pais ORDER BY pais
`)
let twN = 0, twU = 0, twV = 0
for (const x of w.rows) {
  console.log(`  ${x.pais}: ${f(x.n).padStart(7)} filas · ${f(x.und).padStart(10)} und · $${f(x.usd).padStart(10)}`)
  twN += Number(x.n); twU += Number(x.und); twV += Number(x.usd)
}
console.log(`  TOTAL WM: ${f(twN)} filas · ${f(twU)} und · $${f(twV)}`)

// Unisuper por país
console.log('\n-- UNISUPER por país --')
const u = await pool.query(`
  SELECT pais, COUNT(*) AS n,
         ROUND(SUM(ventas_unidades)::numeric, 0) AS und,
         ROUND(SUM(ventas_valor)::numeric, 0) AS usd
  FROM fact_ventas_unisuper
  WHERE fecha >= '2025-01-01' AND fecha < '2026-01-01'
  GROUP BY pais ORDER BY pais
`)
let tuN = 0, tuU = 0, tuV = 0
for (const x of u.rows) {
  console.log(`  ${x.pais}: ${f(x.n).padStart(7)} filas · ${f(x.und).padStart(10)} und · $${f(x.usd).padStart(10)}`)
  tuN += Number(x.n); tuU += Number(x.und); tuV += Number(x.usd)
}
console.log(`  TOTAL UNI: ${f(tuN)} filas · ${f(tuU)} und · $${f(tuV)}`)

// Selectos por país
console.log('\n-- SELECTOS por país --')
const s = await pool.query(`
  SELECT pais, COUNT(*) AS n,
         ROUND(SUM(ventas_unidades)::numeric, 0) AS und,
         ROUND(SUM(ventas_valor)::numeric, 0) AS usd
  FROM fact_ventas_selectos
  WHERE fecha >= '2025-01-01' AND fecha < '2026-01-01'
  GROUP BY pais ORDER BY pais
`)
let tsN = 0, tsU = 0, tsV = 0
for (const x of s.rows) {
  console.log(`  ${x.pais}: ${f(x.n).padStart(7)} filas · ${f(x.und).padStart(10)} und · $${f(x.usd).padStart(10)}`)
  tsN += Number(x.n); tsU += Number(x.und); tsV += Number(x.usd)
}
console.log(`  TOTAL SEL: ${f(tsN)} filas · ${f(tsU)} und · $${f(tsV)}`)

// Por país total (suma de las 3 tablas)
console.log('\n=== TOTAL por país (WM + UNI + SEL, 2025, sin Colombia) ===')
const totals = {}
for (const x of w.rows) totals[x.pais] = (totals[x.pais] ?? 0) + Number(x.usd)
for (const x of u.rows) totals[x.pais] = (totals[x.pais] ?? 0) + Number(x.usd)
for (const x of s.rows) totals[x.pais] = (totals[x.pais] ?? 0) + Number(x.usd)
let grandUSD = 0
for (const p of Object.keys(totals).sort()) {
  console.log(`  ${p}: $${f(totals[p])}`)
  grandUSD += totals[p]
}
console.log(`  TOTAL: $${f(grandUSD)}`)

console.log('\n=== Qlik referencia (lo que reportó el usuario, 2025) ===')
console.log(`  CR: 757,964`)
console.log(`  GT: 162,079`)
console.log(`  HN:  93,294`)
console.log(`  NI:  25,462`)
console.log(`  SV:  30,196`)
console.log(`  TOTAL: 1,068,995`)

await pool.end()
