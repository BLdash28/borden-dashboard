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

// Mapeo definitivo cadena → subformatos válidos:
//   CARULLA:         CARULLA EXPRESS, TURBO CARULLA, CARULLA
//   EXITO:           EXITO, SURTIMAYORISTA, CARULLA, ÉXITO EXPRESS
//   SUPER INTER:     SUPER INTER
//   SURTIMAX:        SURTIMAX
//   SURTIMAYORISTA:  CARULLA, SURTIMAYORISTA
//
// Correcciones:
//   1. CARULLA + EXITO subformato (29)        → CARULLA + CARULLA
//   2. EXITO + TURBO EXITO (276)              → EXITO + EXITO
//   3. SUPER INTER + SUPER INTER EXPRESS (39) → SUPER INTER + SUPER INTER
//   4. SURTIMAX + MI SURTI (307)              → SURTIMAX + SURTIMAX
//   5. SURTIMAX + SURTIMAYORISTA (3,586)      → cadena=SURTIMAYORISTA, subformato=SURTIMAYORISTA

console.log('🔄 Aplicando correcciones de subformato Colombia…')

const ops = [
  { name: 'CARULLA+EXITO→CARULLA',          sql: `UPDATE fact_ventas_exito SET subformato='CARULLA' WHERE pais='CO' AND cadena='CARULLA' AND UPPER(subformato)='EXITO'` },
  { name: 'EXITO+TURBO EXITO→EXITO',        sql: `UPDATE fact_ventas_exito SET subformato='EXITO' WHERE pais='CO' AND cadena='EXITO' AND UPPER(subformato)='TURBO EXITO'` },
  { name: 'SUPER INTER EXPRESS→SUPER INTER',sql: `UPDATE fact_ventas_exito SET subformato='SUPER INTER' WHERE pais='CO' AND cadena='SUPER INTER' AND UPPER(subformato)='SUPER INTER EXPRESS'` },
  { name: 'SURTIMAX+MI SURTI→SURTIMAX',     sql: `UPDATE fact_ventas_exito SET subformato='SURTIMAX' WHERE pais='CO' AND cadena='SURTIMAX' AND UPPER(subformato)='MI SURTI'` },
  { name: 'SURTIMAX+SURTIMAYORISTA→cadena=SURTIMAYORISTA',
    sql: `UPDATE fact_ventas_exito SET cadena='SURTIMAYORISTA', subformato='SURTIMAYORISTA' WHERE pais='CO' AND cadena='SURTIMAX' AND UPPER(subformato)='SURTIMAYORISTA'` },
]
for (const op of ops) {
  const r = await pool.query(op.sql)
  console.log(`   • ${op.name}: ${r.rowCount.toLocaleString()} filas`)
}

console.log('\n🔄 Refrescando MVs…')
for (const mv of ['mv_sellout_mensual', 'mv_ventas_agg']) {
  const t0 = Date.now()
  try {
    await pool.query(`REFRESH MATERIALIZED VIEW ${mv}`)
    console.log(`   ✅ ${mv} (${((Date.now()-t0)/1000).toFixed(1)}s)`)
  } catch (e) { console.log(`   ⚠️  ${mv}: ${e.message}`) }
}

console.log('\n🔎 Subformatos finales Colombia:')
const r = await pool.query(`
  SELECT cadena, subformato, COUNT(*) AS n,
         ROUND(SUM(ventas_valorusd)::numeric, 0) AS usd
  FROM fact_ventas_exito
  WHERE pais='CO'
  GROUP BY cadena, subformato
  ORDER BY cadena, subformato
`)
let prev = ''
for (const x of r.rows) {
  if (prev !== x.cadena) { console.log(`   ─ ${x.cadena}`); prev = x.cadena }
  console.log(`      ${String(x.subformato).padEnd(20)} ${Number(x.n).toLocaleString().padStart(8)} filas · $${Number(x.usd).toLocaleString()}`)
}

await pool.end()
