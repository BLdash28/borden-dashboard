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

// Tasas 2025 actualizadas
const TASA = { 1:7.74831, 2:7.72591, 3:7.74430, 4:7.71282, 5:7.69750, 6:7.70466, 7:7.69288, 8:7.67259, 9:7.67382, 10:7.67425, 11:7.68441, 12:7.68575 }

console.log('Tasas a aplicar:')
for (const [m, t] of Object.entries(TASA)) console.log(`  M${m}: ${t}`)

console.log('\n🔄 Actualizando fact_ventas_unisuper (pais=GT, cadena=LA TORRE, 2025)…')
const r = await pool.query(`
  UPDATE fact_ventas_unisuper
  SET ventas_valor = ROUND((ventas_valor_gtq / CASE EXTRACT(MONTH FROM fecha)
    WHEN 1 THEN 7.74831::numeric
    WHEN 2 THEN 7.72591::numeric
    WHEN 3 THEN 7.74430::numeric
    WHEN 4 THEN 7.71282::numeric
    WHEN 5 THEN 7.69750::numeric
    WHEN 6 THEN 7.70466::numeric
    WHEN 7 THEN 7.69288::numeric
    WHEN 8 THEN 7.67259::numeric
    WHEN 9 THEN 7.67382::numeric
    WHEN 10 THEN 7.67425::numeric
    WHEN 11 THEN 7.68441::numeric
    WHEN 12 THEN 7.68575::numeric
  END)::numeric, 2)
  WHERE pais='GT' AND cadena='LA TORRE' AND fecha >= '2025-01-01' AND fecha < '2026-01-01'
`)
console.log(`   ${r.rowCount.toLocaleString()} filas actualizadas`)

console.log('\n🔄 Refrescando MVs…')
for (const mv of ['mv_sellout_mensual', 'mv_ventas_agg']) {
  const t0 = Date.now()
  try {
    await pool.query(`REFRESH MATERIALIZED VIEW ${mv}`)
    console.log(`   ✅ ${mv} (${((Date.now()-t0)/1000).toFixed(1)}s)`)
  } catch (e) { console.log(`   ⚠️  ${mv}: ${e.message}`) }
}

console.log('\n🔎 Verificación por mes:')
const ver = await pool.query(`
  SELECT EXTRACT(MONTH FROM fecha)::int AS mes,
         ROUND(SUM(ventas_valor_gtq)::numeric, 0) AS gtq,
         ROUND(SUM(ventas_valor)::numeric, 0) AS usd
  FROM fact_ventas_unisuper
  WHERE pais='GT' AND cadena='LA TORRE' AND fecha >= '2025-01-01' AND fecha < '2026-01-01'
  GROUP BY mes ORDER BY mes
`)
let TG = 0, TV = 0
for (const x of ver.rows) {
  console.log(`   M${String(x.mes).padStart(2)}: GTQ ${Number(x.gtq).toLocaleString()} · $${Number(x.usd).toLocaleString()}`)
  TG += Number(x.gtq); TV += Number(x.usd)
}
console.log(`   TOT: GTQ ${TG.toLocaleString()} · $${TV.toLocaleString()}`)

await pool.end()
console.log('\n🎉 Tasas actualizadas')
