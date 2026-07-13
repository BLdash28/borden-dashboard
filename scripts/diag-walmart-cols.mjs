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

// Columnas de fact_ventas_walmart
const cols = await pool.query(`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'fact_ventas_walmart'
  ORDER BY ordinal_position
`)
console.log('=== Columnas fact_ventas_walmart ===')
for (const r of cols.rows) console.log(`  ${r.column_name} (${r.data_type})`)
console.log()

// Muestra de filas CR para ver valores ventas_valor vs ventas_valor_usd
const sample = await pool.query(`
  SELECT pais, cadena, fecha, ventas_unidades, ventas_valor,
         ventas_valor_usd
  FROM fact_ventas_walmart
  WHERE pais = 'CR' AND EXTRACT(YEAR FROM fecha)=2026 AND EXTRACT(MONTH FROM fecha)=5
  LIMIT 5
`)
console.log('=== Muestra CR mayo 2026 ===')
for (const r of sample.rows) console.log(r)

await pool.end()
