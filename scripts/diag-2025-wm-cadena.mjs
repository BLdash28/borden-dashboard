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

// Qlik reference
const QLIK = {
  CR: { 'MAS X MENOS': 229609, 'MAXI PALI': 256308, 'PALI': 419, 'WALMART': 271627, total: 757964 },
  GT: { 'DESPENSA FAMILIAR': 53, 'PALI': 94868, 'WALMART': 67158, total: 162079 },
  HN: { 'MAXI DESPENSA': 17300, 'PALI': 38091, 'WALMART': 37903, total: 93294 },
  NI: { 'MAXI PALI': 12164, 'LA UNION': 7348, 'WALMART': 5950, total: 25462 },
  SV: { 'LA DESPENSA DON JUAN': 16288, 'MAXI DESPENSA': 5312, 'WALMART': 8596, total: 30196 },
}

console.log('=== Walmart 2025 por país × cadena: BD vs Qlik ===\n')
const r = await pool.query(`
  SELECT pais, cadena,
         ROUND(SUM(ventas_valor)::numeric, 0) AS usd
  FROM fact_ventas_walmart
  WHERE fecha >= '2025-01-01' AND fecha < '2026-01-01'
  GROUP BY pais, cadena ORDER BY pais, cadena
`)
const bd = {}
for (const x of r.rows) {
  if (!bd[x.pais]) bd[x.pais] = {}
  bd[x.pais][x.cadena] = Number(x.usd)
}

let totalBD = 0, totalQ = 0
for (const pais of Object.keys(QLIK).sort()) {
  console.log(`\n[${pais}]`)
  console.log(`  Cadena               |   BD ($)    |  Qlik ($)   | Diff`)
  console.log(`  ---------------------|-------------|-------------|------`)
  const allCad = new Set([...Object.keys(QLIK[pais]).filter(k => k !== 'total'), ...Object.keys(bd[pais] ?? {})])
  let subBD = 0, subQ = 0
  for (const cad of [...allCad].sort()) {
    const b = bd[pais]?.[cad] ?? 0
    const q = QLIK[pais]?.[cad] ?? 0
    const d = b - q
    console.log(`  ${cad.padEnd(20)} | ${f(b).padStart(11)} | ${f(q).padStart(11)} | ${d >= 0 ? '+' : ''}${f(d)}`)
    subBD += b; subQ += q
  }
  console.log(`  TOTAL ${pais.padEnd(15)} | ${f(subBD).padStart(11)} | ${f(QLIK[pais].total).padStart(11)} | ${(subBD - QLIK[pais].total) >= 0 ? '+' : ''}${f(subBD - QLIK[pais].total)}`)
  totalBD += subBD; totalQ += QLIK[pais].total
}
console.log(`\n=== TOTAL WM 2025: BD $${f(totalBD)} · Qlik $${f(totalQ)} · Diff ${(totalBD - totalQ) >= 0 ? '+' : ''}$${f(totalBD - totalQ)} ===`)

await pool.end()
