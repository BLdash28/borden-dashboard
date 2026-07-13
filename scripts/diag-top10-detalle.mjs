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

// ¿Cuántas filas tiene mv_sellout_mensual y cuántas tienen codigo_barras null/vacío?
const r0 = await pool.query(`
  SELECT
    COUNT(*) AS total,
    COUNT(codigo_barras) FILTER (WHERE codigo_barras IS NULL OR codigo_barras = '') AS sin_barcode,
    COUNT(DISTINCT codigo_barras) FILTER (WHERE codigo_barras IS NOT NULL AND codigo_barras != '') AS barcodes_distintos
  FROM mv_sellout_mensual WHERE ano > 2000
`)
console.log('=== mv_sellout_mensual stats ===')
console.log(r0.rows[0])

// Por cliente: total y cuánto tiene barcode
const r1 = await pool.query(`
  SELECT cliente,
         COUNT(*) AS total_filas,
         COUNT(*) FILTER (WHERE codigo_barras IS NULL OR codigo_barras = '') AS sin_barcode,
         ROUND(SUM(ventas_valor) FILTER (WHERE codigo_barras IS NULL OR codigo_barras = '')::numeric,2) AS valor_sin_barcode,
         ROUND(SUM(ventas_valor)::numeric,2) AS valor_total
  FROM mv_sellout_mensual WHERE ano > 2000
  GROUP BY cliente ORDER BY valor_total DESC
`)
console.log('\n=== Por cliente (filas sin barcode) ===')
for (const r of r1.rows)
  console.log(`  ${r.cliente}: ${r.total_filas} filas | sin barcode: ${r.sin_barcode} (${Number(r.valor_sin_barcode||0).toLocaleString('en-US',{minimumFractionDigits:2})}) | total: $${Number(r.valor_total).toLocaleString('en-US',{minimumFractionDigits:2})}`)

// Top 20 por barcode (no 10) para ver si hay duplicaciones extrañas
console.log('\n=== Top 20 SKUs todos los períodos (mv_sellout_mensual, by barcode) ===')
const r2 = await pool.query(`
  SELECT m.codigo_barras,
         MAX(m.sku)         AS sku,
         MAX(m.descripcion) AS descripcion,
         COUNT(DISTINCT m.cliente) AS n_clientes,
         ROUND(SUM(m.ventas_valor)::numeric,2)    AS ventas_valor,
         ROUND(SUM(m.ventas_unidades)::numeric,0) AS ventas_unidades
  FROM (SELECT codigo_barras, sku, descripcion, cliente, ventas_valor, ventas_unidades
        FROM mv_sellout_mensual
        WHERE ano > 2000 AND codigo_barras IS NOT NULL AND codigo_barras != '') m
  GROUP BY m.codigo_barras ORDER BY ventas_valor DESC LIMIT 20
`)
for (const [i, row] of r2.rows.entries())
  console.log(`  ${i+1}. ${row.codigo_barras} | SKU ${row.sku} | ${(row.descripcion||'').slice(0,38).padEnd(38)} | clientes:${row.n_clientes} | $${Number(row.ventas_valor).toLocaleString('en-US',{minimumFractionDigits:2})} | ${Number(row.ventas_unidades).toLocaleString()} uds`)

await pool.end()
