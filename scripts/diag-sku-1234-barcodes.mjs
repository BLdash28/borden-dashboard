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

// Todos los códigos de barras bajo sku='1234' en fact_ventas_walmart, mayo 2026
const r = await pool.query(`
  SELECT COALESCE(codigo_barras, '(null)') AS barcode,
         MAX(descripcion) AS descripcion,
         COUNT(*) AS filas,
         ROUND(SUM(ventas_valor)::numeric,2) AS total,
         ROUND(SUM(ventas_unidades)::numeric,0) AS uds
  FROM fact_ventas_walmart
  WHERE sku = '1234'
    AND EXTRACT(YEAR FROM fecha) = 2026
    AND EXTRACT(MONTH FROM fecha) = 5
  GROUP BY 1
  ORDER BY total DESC
`)
console.log('=== SKU 1234 — barcodes en fact_ventas_walmart mayo 2026 ===')
for (const row of r.rows)
  console.log(`  ${row.barcode} | ${row.descripcion?.slice(0,45)} | ${row.filas} filas | $${Number(row.total).toLocaleString('en-US',{minimumFractionDigits:2})} | ${row.uds} uds`)

await pool.end()
