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

const r = await pool.query(`
  SELECT COALESCE(archivo_origen, '(null)') AS origen,
         COUNT(*) AS filas, ROUND(SUM(ventas_valor)::numeric,2) AS total
  FROM fact_ventas_walmart
  WHERE EXTRACT(YEAR FROM fecha)=2026 AND EXTRACT(MONTH FROM fecha)=5
  GROUP BY 1 ORDER BY total DESC
`)
for (const row of r.rows)
  console.log(`  ${row.origen}: ${row.filas} filas | $${Number(row.total).toLocaleString('en-US',{minimumFractionDigits:2})}`)

await pool.end()
