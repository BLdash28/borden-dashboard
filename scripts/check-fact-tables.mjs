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
  WHERE table_schema='public'
    AND (table_name LIKE 'fact_%' OR table_name LIKE 'fact_ventas%' OR table_name LIKE 'fact_sales%')
  ORDER BY table_name
`)
console.log('=== Tablas fact ===')
for (const x of r.rows) console.log('  ' + x.table_name)

// Para cada tabla relevante de sellout, sacar columnas y conteo por cliente/año
const targets = ['fact_sales_sellout', 'fact_ventas_unisuper', 'fact_ventas_walmart', 'fact_ventas_selectos']
for (const t of targets) {
  const exists = r.rows.find(x => x.table_name === t)
  if (!exists) { console.log(`\n[${t}]: NO EXISTE`); continue }
  const cols = await pool.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name=$1 ORDER BY ordinal_position
  `, [t])
  console.log(`\n[${t}] columnas:`)
  for (const c of cols.rows) console.log(`  ${c.column_name} (${c.data_type})`)
  try {
    const cnt = await pool.query(`SELECT ano, COUNT(*) AS n, ROUND(SUM(ventas_valor)::numeric, 0) AS usd FROM ${t} GROUP BY ano ORDER BY ano`)
    console.log(`  Conteo por año:`)
    for (const x of cnt.rows) console.log(`    ${x.ano}: ${Number(x.n).toLocaleString()} filas · $${Number(x.usd).toLocaleString()}`)
  } catch (e) {
    console.log(`  (no se pudo contar: ${e.message})`)
  }
}

await pool.end()
