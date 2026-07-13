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

// mv_ventas_agg — SKU 1234 mayo 2026, desglosado por cliente/pais/cadena
const agg = await pool.query(`
  SELECT ano, mes, pais, cadena, cliente, formato,
         ROUND(SUM(ventas_valor)::numeric,2) AS ventas_valor,
         ROUND(SUM(ventas_unidades)::numeric,0) AS ventas_unidades
  FROM mv_ventas_agg
  WHERE sku = '1234' AND ano = 2026 AND mes = 5
  GROUP BY ano, mes, pais, cadena, cliente, formato
  ORDER BY ventas_valor DESC
`)
console.log('=== mv_ventas_agg — SKU 1234, mayo 2026 ===')
for (const r of agg.rows)
  console.log(`  ${r.pais} | ${r.cadena} | ${r.cliente} | ${r.formato} → $${Number(r.ventas_valor).toLocaleString('en-US',{minimumFractionDigits:2})} | ${r.ventas_unidades} uds`)

// Totales
const tot = await pool.query(`
  SELECT ROUND(SUM(ventas_valor)::numeric,2) AS total_usd, ROUND(SUM(ventas_unidades)::numeric,0) AS total_uds
  FROM mv_ventas_agg WHERE sku = '1234' AND ano = 2026 AND mes = 5
`)
console.log(`\nTOTAL: $${Number(tot.rows[0].total_usd).toLocaleString('en-US',{minimumFractionDigits:2})} | ${tot.rows[0].total_uds} uds`)

// mv_sellout_mensual — mismo SKU, directo en las tablas fuente
const src = await pool.query(`
  SELECT cadena, pais, cliente, COUNT(*) AS filas,
         ROUND(SUM(ventas_valor)::numeric,2) AS ventas_valor,
         ROUND(SUM(ventas_unidades)::numeric,0) AS ventas_unidades
  FROM mv_sellout_mensual
  WHERE sku = '1234' AND ano = 2026 AND mes = 5
  GROUP BY cadena, pais, cliente ORDER BY ventas_valor DESC
`)
console.log('\n=== mv_sellout_mensual — SKU 1234, mayo 2026 ===')
for (const r of src.rows)
  console.log(`  ${r.pais} | ${r.cadena} | ${r.cliente}: ${r.filas} filas | $${Number(r.ventas_valor).toLocaleString('en-US',{minimumFractionDigits:2})} | ${r.ventas_unidades} uds`)

await pool.end()
