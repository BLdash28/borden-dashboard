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
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

// Antes — mayo 2026
const before = await pool.query(`
  SELECT SUM(ventas_valor) AS total, COUNT(*) AS filas
  FROM mv_ventas_agg WHERE ano = 2026 AND mes = 5
`)
console.log(`Antes — mayo 2026: $${Number(before.rows[0].total||0).toLocaleString('en-US',{minimumFractionDigits:2})} (${before.rows[0].filas} filas)`)

console.log('Refrescando mv_ventas_agg...')
await pool.query('REFRESH MATERIALIZED VIEW mv_ventas_agg')
console.log('✅ mv_ventas_agg actualizado')

// Después — mayo 2026 por cliente
const after = await pool.query(`
  SELECT cliente, SUM(ventas_valor) AS total, COUNT(*) AS filas
  FROM mv_ventas_agg WHERE ano = 2026 AND mes = 5
  GROUP BY cliente ORDER BY total DESC
`)
console.log('\n=== Después — mayo 2026 por cliente ===')
let gran = 0
for (const r of after.rows) {
  const t = Number(r.total)
  gran += t
  console.log(`  ${r.cliente}: $${t.toLocaleString('en-US',{minimumFractionDigits:2})} (${r.filas} filas)`)
}
console.log(`  TOTAL: $${gran.toLocaleString('en-US',{minimumFractionDigits:2})}`)

// Total 2026 por mes
const byMes = await pool.query(`
  SELECT mes, SUM(ventas_valor) AS total
  FROM mv_ventas_agg WHERE ano = 2026
  GROUP BY mes ORDER BY mes
`)
console.log('\n=== 2026 por mes ===')
for (const r of byMes.rows) console.log(`  ${r.mes}: $${Number(r.total).toLocaleString('en-US',{minimumFractionDigits:2})}`)

await pool.end()
