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

console.log('=== Top 10 · Todos los períodos — agrupado por (sku, descripcion) ===')
const r = await pool.query(`
  SELECT m.sku,
         m.descripcion,
         MIN(m.categoria)     AS categoria,
         MIN(m.codigo_barras) AS codigo_barras,
         ROUND(SUM(m.ventas_valor)::numeric,2)    AS ventas_valor,
         ROUND(SUM(m.ventas_unidades)::numeric,0) AS ventas_unidades
  FROM (SELECT sku, descripcion, categoria, codigo_barras, ventas_valor, ventas_unidades
        FROM mv_sellout_mensual
        WHERE ano > 2000 AND sku IS NOT NULL AND sku != '') m
  GROUP BY m.sku, m.descripcion
  ORDER BY ventas_valor DESC LIMIT 10
`)
for (const [i, row] of r.rows.entries())
  console.log(`  ${i+1}. SKU ${row.sku.padEnd(10)} | ${row.codigo_barras?.padEnd(15)} | ${(row.descripcion||'').slice(0,38).padEnd(38)} | $${Number(row.ventas_valor).toLocaleString('en-US',{minimumFractionDigits:2})} | ${Number(row.ventas_unidades).toLocaleString()} uds`)

await pool.end()
