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

const r = await pool.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema='public' AND (table_name LIKE '%exito%' OR table_name LIKE '%colombia%' OR table_name LIKE '%grupo%')
  ORDER BY table_name
`)
console.log('Tablas:')
for (const x of r.rows) console.log(`  ${x.table_name}`)

// Si hay alguna, mostrar esquema
for (const x of r.rows) {
  const cols = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`, [x.table_name])
  console.log(`\n[${x.table_name}]:`)
  for (const c of cols.rows) console.log(`  ${c.column_name} (${c.data_type})`)
}

// Buscar en mv_sellout_mensual cómo aparece GRUPO ÉXITO
const e = await pool.query(`
  SELECT DISTINCT cliente, pais FROM mv_sellout_mensual
  WHERE pais = 'CO' OR cliente ILIKE '%éxito%' OR cliente ILIKE '%exito%'
`)
console.log('\nGRUPO ÉXITO en mv_sellout_mensual:')
for (const x of e.rows) console.log(`  cliente="${x.cliente}", pais="${x.pais}"`)

await pool.end()
