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
const f = (n) => Number(n ?? 0).toLocaleString('en-US')

const tabs = ['fact_ventas_unisuper', 'fact_ventas_walmart', 'fact_ventas_selectos']

console.log('=== Conteos ANTES del TRUNCATE ===')
for (const t of tabs) {
  const r = await pool.query(`SELECT COUNT(*) AS n FROM ${t}`)
  console.log(`  ${t}: ${f(r.rows[0].n)} filas`)
}

console.log('\n🗑️  Ejecutando TRUNCATE...')
const t0 = Date.now()
await pool.query(`TRUNCATE TABLE fact_ventas_unisuper, fact_ventas_walmart, fact_ventas_selectos RESTART IDENTITY`)
console.log(`   ✅ TRUNCATE completado en ${((Date.now() - t0)/1000).toFixed(1)}s`)

console.log('\n=== Conteos DESPUÉS del TRUNCATE ===')
for (const t of tabs) {
  const r = await pool.query(`SELECT COUNT(*) AS n FROM ${t}`)
  console.log(`  ${t}: ${f(r.rows[0].n)} filas`)
}

await pool.end()
