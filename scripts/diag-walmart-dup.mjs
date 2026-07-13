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

// 1. Definición real de v_sellout_mensual
const vDef = await pool.query(`SELECT definition FROM pg_views WHERE viewname = 'v_sellout_mensual'`)
console.log('=== DEFINICION v_sellout_mensual ===')
console.log(vDef.rows[0]?.definition ?? 'no encontrado')
console.log()

// 2. Total por tabla fuente en mayo 2026
const tables = ['fact_ventas_walmart', 'fact_ventas_unisuper', 'fact_ventas_selectos']
for (const t of tables) {
  try {
    const r = await pool.query(`SELECT COUNT(*) AS filas, ROUND(SUM(ventas_valor)::numeric,2) AS total FROM ${t} WHERE EXTRACT(YEAR FROM fecha)=2026 AND EXTRACT(MONTH FROM fecha)=5`)
    console.log(`${t}: ${r.rows[0].filas} filas | $${Number(r.rows[0].total).toLocaleString('en-US',{minimumFractionDigits:2})}`)
  } catch (e) { console.log(`${t}: ERROR - ${e.message}`) }
}

// 3. mv_sellout_mensual total mayo 2026
const mv = await pool.query(`SELECT COUNT(*) AS filas, ROUND(SUM(ventas_valor)::numeric,2) AS total FROM mv_sellout_mensual WHERE ano=2026 AND mes=5`)
console.log(`mv_sellout_mensual: ${mv.rows[0].filas} filas | $${Number(mv.rows[0].total).toLocaleString('en-US',{minimumFractionDigits:2})}`)
console.log()

// 4. mv_sellout_mensual por cadena mayo 2026
const cadenas = await pool.query(`
  SELECT cadena, pais, COUNT(*) AS filas, ROUND(SUM(ventas_valor)::numeric,2) AS total
  FROM mv_sellout_mensual WHERE ano=2026 AND mes=5
  GROUP BY cadena, pais ORDER BY total DESC
`)
console.log('=== mv_sellout_mensual cadenas mayo 2026 ===')
for (const r of cadenas.rows) console.log(`  ${r.pais} | ${r.cadena}: ${r.filas} filas | $${Number(r.total).toLocaleString('en-US',{minimumFractionDigits:2})}`)
console.log()

// 5. fact_ventas_walmart por pais/cadena mayo 2026
const wm = await pool.query(`
  SELECT pais, COUNT(*) AS filas, ROUND(SUM(ventas_valor)::numeric,2) AS total, MIN(fecha)::date AS min_f, MAX(fecha)::date AS max_f
  FROM fact_ventas_walmart WHERE EXTRACT(YEAR FROM fecha)=2026 AND EXTRACT(MONTH FROM fecha)=5
  GROUP BY pais ORDER BY total DESC
`)
console.log('=== fact_ventas_walmart mayo 2026 ===')
for (const r of wm.rows) console.log(`  ${r.pais}: ${r.filas} filas | $${Number(r.total).toLocaleString('en-US',{minimumFractionDigits:2})} | ${r.min_f} → ${r.max_f}`)

await pool.end()
