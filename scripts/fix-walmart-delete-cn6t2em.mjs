/**
 * Borra las filas cn6t2em de fact_ventas_walmart (ventas en moneda local, no USD)
 * y muestra el total que queda por mes/año.
 */
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

// Contar antes
const before = await pool.query(`
  SELECT COUNT(*) AS filas, ROUND(SUM(ventas_valor)::numeric,2) AS total
  FROM fact_ventas_walmart
  WHERE EXTRACT(YEAR FROM fecha)=2026 AND EXTRACT(MONTH FROM fecha)=5
`)
console.log(`Antes  — mayo 2026: ${before.rows[0].filas} filas | $${Number(before.rows[0].total).toLocaleString('en-US',{minimumFractionDigits:2})}`)

// Contar cuántas filas serán borradas
const toDelete = await pool.query(`
  SELECT COUNT(*) AS filas, ROUND(SUM(ventas_valor)::numeric,2) AS total
  FROM fact_ventas_walmart
  WHERE archivo_origen ILIKE 'cn6t2em%'
`)
console.log(`A borrar (cn6t2em): ${toDelete.rows[0].filas} filas | $${Number(toDelete.rows[0].total).toLocaleString('en-US',{minimumFractionDigits:2})}`)

// Borrar
const del = await pool.query(`DELETE FROM fact_ventas_walmart WHERE archivo_origen ILIKE 'cn6t2em%'`)
console.log(`Borradas: ${del.rowCount} filas`)

// Total que queda por año/mes
const after = await pool.query(`
  SELECT EXTRACT(YEAR FROM fecha)::int AS ano, EXTRACT(MONTH FROM fecha)::int AS mes,
         COUNT(*) AS filas, ROUND(SUM(ventas_valor)::numeric,2) AS total
  FROM fact_ventas_walmart
  GROUP BY 1,2 ORDER BY 1,2
`)
console.log('\n=== fact_ventas_walmart restante por mes ===')
for (const r of after.rows) console.log(`  ${r.ano}-${String(r.mes).padStart(2,'0')}: ${r.filas} filas | $${Number(r.total).toLocaleString('en-US',{minimumFractionDigits:2})}`)

console.log('\n=== Mayo 2026 por cadena/pais (lo que queda) ===')
const cadenasAfter = await pool.query(`
  SELECT cadena, pais, COUNT(*) AS filas, ROUND(SUM(ventas_valor)::numeric,2) AS total
  FROM fact_ventas_walmart
  WHERE EXTRACT(YEAR FROM fecha)=2026 AND EXTRACT(MONTH FROM fecha)=5
  GROUP BY cadena, pais ORDER BY total DESC
`)
for (const r of cadenasAfter.rows) console.log(`  ${r.pais} | ${r.cadena}: ${r.filas} filas | $${Number(r.total).toLocaleString('en-US',{minimumFractionDigits:2})}`)

await pool.end()
