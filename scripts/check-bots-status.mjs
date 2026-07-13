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

const t = await pool.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema='public' AND (table_name ILIKE '%bot%' OR table_name ILIKE '%workflow%' OR table_name ILIKE '%action%' OR table_name ILIKE '%sellout%')
`)
console.log('Tablas relacionadas a bots/workflows/sellout:')
for (const x of t.rows) console.log(' ', x.table_name)

for (const name of ['bots_status', 'bot_status', 'workflow_status', 'sellout_log']) {
  try {
    const r = await pool.query(`SELECT * FROM ${name} ORDER BY 1 DESC LIMIT 5`)
    console.log(`\n[${name}] últimas 5:`)
    for (const x of r.rows) console.log(' ', JSON.stringify(x))
  } catch (e) {
    if (!e.message.includes('does not exist')) console.log(`[${name}] error: ${e.message}`)
  }
}

await pool.end()
