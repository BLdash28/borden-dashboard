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

// Top 10 SKUs todos los períodos (misma query que la API)
const r = await pool.query(`
  SELECT m.sku, MAX(m.descripcion) AS descripcion, MIN(m.categoria) AS categoria,
         MIN(p.codigo_barras) AS codigo_barras,
         ROUND(SUM(m.ventas_valor)::numeric,2) AS ventas_valor,
         ROUND(SUM(m.ventas_unidades)::numeric,0) AS ventas_unidades
  FROM (SELECT sku, descripcion, categoria, ventas_valor, ventas_unidades
        FROM mv_ventas_agg WHERE ano > 2000) m
  LEFT JOIN dim_producto p USING (sku)
  GROUP BY m.sku ORDER BY ventas_valor DESC LIMIT 10
`)
console.log('=== Top 10 SKUs · Todos los períodos ===')
for (const row of r.rows) {
  console.log(`  ${row.sku} | ${row.descripcion?.slice(0,40)} | $${Number(row.ventas_valor).toLocaleString('en-US',{minimumFractionDigits:2})} | ${Number(row.ventas_unidades).toLocaleString()} uds`)
}

// Total general
const total = await pool.query(`SELECT ROUND(SUM(ventas_valor)::numeric,2) AS total FROM mv_ventas_agg WHERE ano > 2000`)
console.log(`\nTotal general: $${Number(total.rows[0].total).toLocaleString('en-US',{minimumFractionDigits:2})}`)

// Resumen por año
const byAno = await pool.query(`
  SELECT ano, ROUND(SUM(ventas_valor)::numeric,2) AS total
  FROM mv_ventas_agg WHERE ano > 2000
  GROUP BY ano ORDER BY ano
`)
console.log('\n=== Por año ===')
for (const r of byAno.rows) console.log(`  ${r.ano}: $${Number(r.total).toLocaleString('en-US',{minimumFractionDigits:2})}`)

await pool.end()
