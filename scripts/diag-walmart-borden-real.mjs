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

console.log('=== Walmart por archivo_origen ===')
const r = await pool.query(`
  SELECT archivo_origen, COUNT(*) AS n, ROUND(SUM(ventas_valor)::numeric, 0) AS usd
  FROM fact_ventas_walmart
  GROUP BY archivo_origen
  ORDER BY 2 DESC
`)
for (const x of r.rows) console.log(`  ${x.archivo_origen ?? '(null)'}: ${f(x.n)} filas · $${f(x.usd)}`)

console.log('\n=== Walmart por mes 2025 (todas vs BORDEN solo) ===')
const r2 = await pool.query(`
  SELECT
    EXTRACT(MONTH FROM fecha)::int AS mes,
    COUNT(*) AS total,
    SUM(CASE WHEN archivo_origen LIKE '%Borden%' THEN 1 ELSE 0 END) AS borden_n,
    ROUND(SUM(ventas_valor)::numeric, 0) AS total_usd,
    ROUND(SUM(CASE WHEN archivo_origen LIKE '%Borden%' THEN ventas_valor ELSE 0 END)::numeric, 0) AS borden_usd
  FROM fact_ventas_walmart
  WHERE fecha >= '2025-01-01' AND fecha < '2026-01-01'
  GROUP BY 1 ORDER BY 1
`)
for (const x of r2.rows) console.log(`  M${x.mes}: total ${f(x.total)}/$${f(x.total_usd)}  · BORDEN ${f(x.borden_n)}/$${f(x.borden_usd)}`)

console.log('\n=== UNISUPER por mes 2025: BORDEN solo (marca = BORDEN) ===')
const r3 = await pool.query(`
  SELECT
    EXTRACT(MONTH FROM fecha)::int AS mes,
    COUNT(*) AS n,
    ROUND(SUM(ventas_valor)::numeric, 0) AS usd
  FROM fact_ventas_unisuper
  WHERE fecha >= '2025-01-01' AND fecha < '2026-01-01' AND UPPER(marca) = 'BORDEN'
  GROUP BY 1 ORDER BY 1
`)
for (const x of r3.rows) console.log(`  M${x.mes}: ${f(x.n)} · $${f(x.usd)}`)

console.log('\n=== SELECTOS 2025 (marca BORDEN) ===')
const r4 = await pool.query(`
  SELECT
    COUNT(*) AS n,
    ROUND(SUM(ventas_valor)::numeric, 0) AS usd
  FROM fact_ventas_selectos
  WHERE fecha >= '2025-01-01' AND fecha < '2026-01-01' AND UPPER(marca) = 'BORDEN'
`)
console.log(`  ${f(r4.rows[0].n)} filas · $${f(r4.rows[0].usd)}`)

await pool.end()
