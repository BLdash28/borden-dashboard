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

console.log('=== Conteo ANTES del DELETE ===')
for (const tab of ['fact_ventas_unisuper', 'fact_ventas_selectos']) {
  const r = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE UPPER(marca) = 'BORDEN') AS borden,
      COUNT(*) FILTER (WHERE UPPER(marca) <> 'BORDEN' OR marca IS NULL) AS otros,
      COUNT(*) AS total
    FROM ${tab}
  `)
  console.log(`  ${tab}: BORDEN=${f(r.rows[0].borden)} · otros/null=${f(r.rows[0].otros)} · total=${f(r.rows[0].total)}`)
}

console.log('\n🗑️  Borrando no-BORDEN de fact_ventas_unisuper…')
const d1 = await pool.query(`DELETE FROM fact_ventas_unisuper WHERE UPPER(marca) <> 'BORDEN' OR marca IS NULL`)
console.log(`   ${f(d1.rowCount)} filas borradas`)

console.log('\n🗑️  Borrando no-BORDEN de fact_ventas_selectos…')
const d2 = await pool.query(`DELETE FROM fact_ventas_selectos WHERE UPPER(marca) <> 'BORDEN' OR marca IS NULL`)
console.log(`   ${f(d2.rowCount)} filas borradas`)

console.log('\n🔄 Refrescando MVs…')
for (const mv of ['mv_sellout_mensual', 'mv_ventas_agg']) {
  const t0 = Date.now()
  try {
    await pool.query(`REFRESH MATERIALIZED VIEW ${mv}`)
    console.log(`   ✅ ${mv} ${((Date.now()-t0)/1000).toFixed(1)}s`)
  } catch (e) { console.log(`   ⚠️  ${mv}: ${e.message}`) }
}

console.log('\n🔎 Totales finales mv_sellout_mensual:')
const r = await pool.query(`
  SELECT ano, cliente, ROUND(SUM(ventas_valor)::numeric,0) AS usd
  FROM mv_sellout_mensual
  GROUP BY ano, cliente ORDER BY ano, usd DESC
`)
let prev = ''
for (const x of r.rows) {
  if (prev !== String(x.ano)) { console.log(`  -- ${x.ano} --`); prev = String(x.ano) }
  console.log(`    ${String(x.cliente).padEnd(14)}: $${Number(x.usd).toLocaleString()}`)
}
const tot = await pool.query(`SELECT ano, ROUND(SUM(ventas_valor)::numeric,0) AS usd FROM mv_sellout_mensual GROUP BY ano ORDER BY ano`)
console.log('\n  Totales por año:')
let grand = 0
for (const x of tot.rows) { console.log(`    ${x.ano}: $${Number(x.usd).toLocaleString()}`); grand += Number(x.usd) }
console.log(`\n  GRAN TOTAL: $${grand.toLocaleString()}`)

await pool.end()
