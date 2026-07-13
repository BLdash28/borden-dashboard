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

// Cadena vs formato distinct combos
const r = await pool.query(`
  SELECT DISTINCT cadena, formato
  FROM mv_sellout_mensual
  WHERE cadena IS NOT NULL
  ORDER BY cadena, formato
`)
console.log('=== Cadena × Formato en mv_sellout_mensual ===')
for (const x of r.rows) console.log(`  "${x.cadena}"  |  "${x.formato}"`)

await pool.end()
