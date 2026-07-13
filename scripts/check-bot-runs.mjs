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

const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='bot_runs' ORDER BY ordinal_position`)
console.log('bot_runs cols:', cols.rows.map(c => c.column_name).join(', '))

const r = await pool.query(`
  SELECT * FROM bot_runs
  ORDER BY started_at DESC LIMIT 15
`)
console.log(`\nÚltimos runs sellout/walmart:`)
for (const x of r.rows) console.log(' ', JSON.stringify(x))

await pool.end()
