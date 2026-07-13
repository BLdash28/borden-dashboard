/**
 * diag-mv-ventas-agg.mjs - desglose mensual GT UNISUPER 2025 BD vs Excel
 */
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

// Mes por mes GT UNISUPER 2025
const r1 = await pool.query(`
  SELECT mes, ROUND(SUM(ventas_valor)::numeric, 0) AS usd, ROUND(SUM(ventas_unidades)::numeric, 0) AS unidades
  FROM mv_ventas_agg
  WHERE ano = 2025 AND pais = 'GT' AND cliente = 'UNISUPER'
  GROUP BY mes ORDER BY mes
`)
console.log('=== BD: GT UNISUPER 2025 mes por mes ===')
console.log('Mes  | USD            | Unidades')
let totBd = 0
for (const x of r1.rows) {
  const u = Number(x.usd)
  totBd += u
  console.log(`${String(x.mes).padStart(2)}   | $${u.toLocaleString().padStart(12)} | ${Number(x.unidades).toLocaleString().padStart(8)}`)
}
console.log(`\nTotal BD GT UNISUPER 2025: $${totBd.toLocaleString()}`)

// SV SELECTOS 2025
const r2 = await pool.query(`
  SELECT mes, ROUND(SUM(ventas_valor)::numeric, 0) AS usd, ROUND(SUM(ventas_unidades)::numeric, 0) AS unidades
  FROM mv_ventas_agg
  WHERE ano = 2025 AND pais = 'SV' AND cliente = 'SELECTOS'
  GROUP BY mes ORDER BY mes
`)
console.log('\n=== BD: SV SELECTOS 2025 mes por mes ===')
console.log('Mes  | USD            | Unidades')
let totBd2 = 0
for (const x of r2.rows) {
  const u = Number(x.usd)
  totBd2 += u
  console.log(`${String(x.mes).padStart(2)}   | $${u.toLocaleString().padStart(12)} | ${Number(x.unidades).toLocaleString().padStart(8)}`)
}
console.log(`\nTotal BD SV SELECTOS 2025: $${totBd2.toLocaleString()}`)

await pool.end()
