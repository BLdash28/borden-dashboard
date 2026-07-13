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

// Definición de mv_sellout_mensual
const def = await pool.query(`SELECT definition FROM pg_matviews WHERE matviewname = 'mv_sellout_mensual'`)
console.log('=== mv_sellout_mensual definition ===')
console.log(def.rows[0]?.definition ?? 'NOT FOUND')

// SKU 1234 en mv_sellout_mensual — desglose por cadena/cliente/formato
const mv = await pool.query(`
  SELECT cadena, pais, cliente, formato,
         COUNT(*) AS filas,
         ROUND(SUM(ventas_valor)::numeric,2) AS ventas_valor,
         ROUND(SUM(ventas_unidades)::numeric,0) AS uds
  FROM mv_sellout_mensual
  WHERE sku = '1234' AND ano = 2026 AND mes = 5
  GROUP BY cadena, pais, cliente, formato ORDER BY ventas_valor DESC
`)
console.log('\n=== mv_sellout_mensual — SKU 1234 mayo 2026 ===')
for (const r of mv.rows)
  console.log(`  ${r.pais} | ${r.cadena} | ${r.cliente} | ${r.formato}: ${r.filas} filas | $${Number(r.ventas_valor).toLocaleString('en-US',{minimumFractionDigits:2})} | ${r.uds} uds`)

const tot = await pool.query(`
  SELECT ROUND(SUM(ventas_valor)::numeric,2) AS total, ROUND(SUM(ventas_unidades)::numeric,0) AS uds
  FROM mv_sellout_mensual WHERE sku = '1234' AND ano = 2026 AND mes = 5
`)
console.log(`\nTOTAL: $${Number(tot.rows[0].total).toLocaleString('en-US',{minimumFractionDigits:2})} | ${tot.rows[0].uds} uds`)

await pool.end()
