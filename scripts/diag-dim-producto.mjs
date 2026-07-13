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

// Sample of codigo_barras with their length and characters
const sample = await pool.query(`
  SELECT codigo_barras, LENGTH(codigo_barras::text) as len, sku, descripcion
  FROM dim_producto
  WHERE codigo_barras IS NOT NULL
  ORDER BY random()
  LIMIT 20
`)
console.log('=== Muestra dim_producto.codigo_barras ===')
for (const r of sample.rows) console.log(`  [${r.len}] "${r.codigo_barras}"  sku=${r.sku}  ${r.descripcion?.slice(0,40)}`)

// Buscar substrings: tomar últimos N dígitos
const tests = [
  '5300000043', '5300000051', '5300006886', '5300006829',
  '745210597001', '745210597010',
  '744113401782',
]
console.log('\n=== Buscar coincidencias parciales ===')
for (const t of tests) {
  const r = await pool.query(
    `SELECT codigo_barras, sku, descripcion FROM dim_producto
     WHERE codigo_barras::text LIKE $1 LIMIT 5`,
    [`%${t}%`]
  )
  console.log(`  "${t}" → ${r.rows.length} matches`)
  for (const row of r.rows) console.log(`     codigo_barras="${row.codigo_barras}" sku=${row.sku}`)
}

await pool.end()
