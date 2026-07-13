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

// Query actual de la API — todos los períodos
console.log('=== Top 10 SKUs · Todos los períodos (mv_sellout_mensual, by codigo_barras) ===')
const r = await pool.query(`
  SELECT m.codigo_barras,
         MAX(m.sku)         AS sku,
         MAX(m.descripcion) AS descripcion,
         MIN(m.categoria)   AS categoria,
         ROUND(SUM(m.ventas_valor)::numeric,2)    AS ventas_valor,
         ROUND(SUM(m.ventas_unidades)::numeric,0) AS ventas_unidades
  FROM (SELECT codigo_barras, sku, descripcion, categoria, ventas_valor, ventas_unidades
        FROM mv_sellout_mensual
        WHERE ano > 2000 AND codigo_barras IS NOT NULL AND codigo_barras != '') m
  GROUP BY m.codigo_barras ORDER BY ventas_valor DESC LIMIT 10
`)
for (const [i, row] of r.rows.entries())
  console.log(`  ${i+1}. ${row.codigo_barras} | SKU ${row.sku} | ${row.descripcion?.slice(0,40)} | $${Number(row.ventas_valor).toLocaleString('en-US',{minimumFractionDigits:2})} | ${Number(row.ventas_unidades).toLocaleString()} uds`)

// ¿Qué hay en mv_ventas_agg (la versión anterior)?
console.log('\n=== Top 10 por SKU (mv_ventas_agg) ===')
const r2 = await pool.query(`
  SELECT m.sku,
         MAX(m.descripcion) AS descripcion,
         MIN(m.categoria)   AS categoria,
         MIN(p.codigo_barras) AS codigo_barras,
         ROUND(SUM(m.ventas_valor)::numeric,2)    AS ventas_valor,
         ROUND(SUM(m.ventas_unidades)::numeric,0) AS ventas_unidades
  FROM (SELECT sku, descripcion, categoria, ventas_valor, ventas_unidades
        FROM mv_ventas_agg WHERE ano > 2000) m
  LEFT JOIN dim_producto p USING (sku)
  GROUP BY m.sku ORDER BY ventas_valor DESC LIMIT 10
`)
for (const [i, row] of r2.rows.entries())
  console.log(`  ${i+1}. SKU ${row.sku} | ${row.codigo_barras} | ${row.descripcion?.slice(0,40)} | $${Number(row.ventas_valor).toLocaleString('en-US',{minimumFractionDigits:2})} | ${Number(row.ventas_unidades).toLocaleString()} uds`)

// Revisar cuántos barcodes distintos hay en mv_sellout_mensual sin codigo_barras
console.log('\n=== Filas sin codigo_barras en mv_sellout_mensual ===')
const r3 = await pool.query(`
  SELECT cliente, COUNT(*) AS filas, ROUND(SUM(ventas_valor)::numeric,2) AS total
  FROM mv_sellout_mensual WHERE (codigo_barras IS NULL OR codigo_barras = '') AND ano > 2000
  GROUP BY cliente ORDER BY total DESC
`)
for (const row of r3.rows)
  console.log(`  ${row.cliente}: ${row.filas} filas | $${Number(row.total).toLocaleString('en-US',{minimumFractionDigits:2})}`)

await pool.end()
