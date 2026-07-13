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
for (const t of ['fact_ventas_unisuper','fact_ventas_walmart','fact_ventas_selectos']) {
  const r = await pool.query(`
    SELECT con.conname, pg_get_constraintdef(con.oid) as def
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = $1 AND con.contype IN ('u','p')
  `, [t])
  console.log(`\n[${t}]`)
  for (const x of r.rows) console.log(`  ${x.conname}: ${x.def}`)
}
await pool.end()
