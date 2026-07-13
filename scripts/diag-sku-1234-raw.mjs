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

// Detalle crudo en fact_ventas_walmart para SKU 1234, mayo 2026
const raw = await pool.query(`
  SELECT cadena, punto_venta, fecha, ventas_unidades, ventas_valor,
         COALESCE(archivo_origen, '(null)') AS archivo_origen
  FROM fact_ventas_walmart
  WHERE codigo_barras = '7441134017824'
    AND EXTRACT(YEAR FROM fecha)=2026 AND EXTRACT(MONTH FROM fecha)=5
  ORDER BY cadena, punto_venta, fecha
  LIMIT 50
`)
console.log('=== fact_ventas_walmart — cod_barras 7441134017824, mayo 2026 ===')
for (const r of raw.rows)
  console.log(`  ${r.cadena} | ${r.punto_venta} | ${String(r.fecha).slice(0,10)} | ${r.ventas_unidades} uds | $${Number(r.ventas_valor).toFixed(2)} | ${r.archivo_origen}`)

// Resumen por cadena + archivo_origen
const resumen = await pool.query(`
  SELECT cadena, COALESCE(archivo_origen,'(null)') AS origen,
         COUNT(*) AS filas,
         ROUND(SUM(ventas_valor)::numeric,2) AS total,
         ROUND(SUM(ventas_unidades)::numeric,0) AS uds
  FROM fact_ventas_walmart
  WHERE codigo_barras = '7441134017824'
    AND EXTRACT(YEAR FROM fecha)=2026 AND EXTRACT(MONTH FROM fecha)=5
  GROUP BY cadena, origen ORDER BY total DESC
`)
console.log('\n=== Resumen por cadena/origen ===')
for (const r of resumen.rows)
  console.log(`  ${r.cadena} | ${r.origen}: ${r.filas} filas | $${Number(r.total).toLocaleString('en-US',{minimumFractionDigits:2})} | ${r.uds} uds`)

await pool.end()
