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

// 1. Unificar cliente a 'GRUPO ÉXITO' (con tilde)
console.log('🔄 Unificando cliente → GRUPO ÉXITO…')
const c = await pool.query(`
  UPDATE fact_ventas_exito
  SET cliente = 'GRUPO ÉXITO'
  WHERE pais = 'CO' AND cliente <> 'GRUPO ÉXITO'
`)
console.log(`   ${c.rowCount.toLocaleString()} filas`)

// 2. Formato = HIPERMERCADO (uniforme para todo Colombia)
console.log('\n🔄 Formato = HIPERMERCADO para todo Colombia…')
const f = await pool.query(`
  UPDATE fact_ventas_exito
  SET formato = 'HIPERMERCADO'
  WHERE pais = 'CO'
`)
console.log(`   ${f.rowCount.toLocaleString()} filas`)

// 3. Asignar subformato según valor actual (CARULLA EXPRESS, TURBO CARULLA, etc.)
//    Los subformatos válidos son: CARULLA EXPRESS, TURBO CARULLA, CARULLA, EXITO,
//    SURTIMAYORISTA, SURTIMAX, SUPER INTER, ÉXITO EXPRESS
//    Mapear desde formato/subformato original o desde cadena
console.log('\n🔄 Normalizando subformato (UPPER + trim)…')
const s = await pool.query(`
  UPDATE fact_ventas_exito
  SET subformato = CASE
    WHEN UPPER(TRIM(COALESCE(subformato, ''))) = 'EXITO EXPRESS'   THEN 'ÉXITO EXPRESS'
    WHEN UPPER(TRIM(COALESCE(subformato, ''))) = 'TURBO EXITO'     THEN 'TURBO EXITO'
    WHEN UPPER(TRIM(COALESCE(subformato, ''))) = 'CARULLA EXPRESS' THEN 'CARULLA EXPRESS'
    WHEN UPPER(TRIM(COALESCE(subformato, ''))) = 'TURBO CARULLA'   THEN 'TURBO CARULLA'
    WHEN UPPER(TRIM(COALESCE(subformato, ''))) = 'CARULLA'         THEN 'CARULLA'
    WHEN UPPER(TRIM(COALESCE(subformato, ''))) = 'EXITO'           THEN 'EXITO'
    WHEN UPPER(TRIM(COALESCE(subformato, ''))) = 'SURTIMAYORISTA'  THEN 'SURTIMAYORISTA'
    WHEN UPPER(TRIM(COALESCE(subformato, ''))) = 'SURTIMAX'        THEN 'SURTIMAX'
    WHEN UPPER(TRIM(COALESCE(subformato, ''))) = 'MI SURTI'        THEN 'MI SURTI'
    WHEN UPPER(TRIM(COALESCE(subformato, ''))) = 'SUPER INTER'     THEN 'SUPER INTER'
    ELSE subformato
  END
  WHERE pais = 'CO'
`)
console.log(`   ${s.rowCount.toLocaleString()} filas`)

console.log('\n🔄 Refrescando MVs…')
for (const mv of ['mv_sellout_mensual', 'mv_ventas_agg']) {
  const t0 = Date.now()
  try {
    await pool.query(`REFRESH MATERIALIZED VIEW ${mv}`)
    console.log(`   ✅ ${mv} (${((Date.now()-t0)/1000).toFixed(1)}s)`)
  } catch (e) { console.log(`   ⚠️  ${mv}: ${e.message}`) }
}

console.log('\n🔎 Verificación Colombia (cliente / cadena / formato):')
const r = await pool.query(`
  SELECT cliente, cadena, formato, COUNT(*) AS n
  FROM mv_sellout_mensual
  WHERE pais='CO'
  GROUP BY cliente, cadena, formato
  ORDER BY cliente, cadena
`)
for (const x of r.rows) console.log(`   ${x.cliente.padEnd(14)} ${String(x.cadena).padEnd(16)} ${String(x.formato).padEnd(15)} ${Number(x.n).toLocaleString()}`)

console.log('\n🔎 Subformatos Colombia:')
const r2 = await pool.query(`
  SELECT cadena, subformato, COUNT(*) AS n
  FROM fact_ventas_exito
  WHERE pais='CO'
  GROUP BY cadena, subformato
  ORDER BY cadena, subformato
`)
for (const x of r2.rows) console.log(`   ${String(x.cadena).padEnd(16)} ${String(x.subformato).padEnd(18)} ${Number(x.n).toLocaleString()}`)

await pool.end()
