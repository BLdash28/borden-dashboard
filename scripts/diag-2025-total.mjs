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

const Q = (s) => `'${s}'`
const f = (n) => Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })

// ── 1. Totales por tabla en 2025 ─────────────────────────────────────────
const tabs = ['fact_ventas_unisuper', 'fact_ventas_walmart', 'fact_ventas_selectos']
for (const t of tabs) {
  const r = await pool.query(`
    SELECT
      COUNT(*) AS n,
      ROUND(SUM(ventas_valor)::numeric, 0) AS usd,
      MIN(fecha) AS mn,
      MAX(fecha) AS mx
    FROM ${t}
    WHERE fecha >= '2025-01-01' AND fecha < '2026-01-01'
  `)
  const x = r.rows[0]
  console.log(`[${t}] 2025: ${f(x.n)} filas, $${f(x.usd)} (${x.mn} a ${x.mx})`)
}

// ── 2. mv_sellout_mensual 2025 ───────────────────────────────────────────
console.log('\n--- mv_sellout_mensual 2025 ---')
try {
  const r = await pool.query(`
    SELECT cliente, COUNT(*) AS n, ROUND(SUM(ventas_valor)::numeric, 0) AS usd
    FROM mv_sellout_mensual
    WHERE ano = 2025
    GROUP BY cliente
    ORDER BY 3 DESC
  `)
  for (const x of r.rows) console.log(`  ${x.cliente}: ${f(x.n)} filas · $${f(x.usd)}`)
} catch (e) { console.log(`  (no se pudo: ${e.message})`) }

// ── 3. mv_ventas_agg 2025 ────────────────────────────────────────────────
console.log('\n--- mv_ventas_agg 2025 ---')
try {
  const cols = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'mv_ventas_agg' ORDER BY ordinal_position
  `)
  console.log('  cols:', cols.rows.map(c => c.column_name).join(', '))
  const r = await pool.query(`
    SELECT COUNT(*) AS n, ROUND(SUM(ventas_valor)::numeric, 0) AS usd
    FROM mv_ventas_agg
    WHERE ano = 2025
  `)
  const x = r.rows[0]
  console.log(`  total 2025: ${f(x.n)} filas, $${f(x.usd)}`)
  const r2 = await pool.query(`
    SELECT cliente, COUNT(*) AS n, ROUND(SUM(ventas_valor)::numeric, 0) AS usd
    FROM mv_ventas_agg
    WHERE ano = 2025
    GROUP BY cliente
    ORDER BY 3 DESC
  `)
  for (const x of r2.rows) console.log(`  ${x.cliente}: ${f(x.n)} filas · $${f(x.usd)}`)
} catch (e) { console.log(`  (no se pudo: ${e.message})`) }

// ── 4. Walmart: BORDEN vs total ──────────────────────────────────────────
console.log('\n--- fact_ventas_walmart 2025: BORDEN vs no-BORDEN ---')
const r3 = await pool.query(`
  SELECT
    CASE WHEN descripcion ILIKE '%BORDEN%' THEN 'BORDEN' ELSE 'OTROS' END AS marca,
    COUNT(*) AS n,
    ROUND(SUM(ventas_valor)::numeric, 0) AS usd
  FROM fact_ventas_walmart
  WHERE fecha >= '2025-01-01' AND fecha < '2026-01-01'
  GROUP BY 1
`)
for (const x of r3.rows) console.log(`  ${x.marca}: ${f(x.n)} filas · $${f(x.usd)}`)

await pool.end()
