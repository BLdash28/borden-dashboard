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

// Schema check
for (const t of ['fact_ventas_unisuper','fact_ventas_walmart','fact_ventas_selectos','dim_producto']) {
  const r = await pool.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = $1 ORDER BY ordinal_position
  `, [t])
  console.log(`\n[${t}]`)
  for (const c of r.rows) console.log(`  ${c.column_name} (${c.data_type})`)
}

await pool.end()
