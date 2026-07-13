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
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const f = (n) => Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })

console.log('=== Duplicados fact_ventas_walmart CR rango ingestado 2026-05-23 → 2026-06-19 ===')

// Por (fecha, punto_venta, codigo_barras)
const r1 = await pool.query(`
  SELECT COUNT(*) AS dup_keys, SUM(n) AS dup_filas, SUM(n - 1) AS extra
  FROM (
    SELECT fecha, punto_venta, codigo_barras, COUNT(*) AS n
    FROM fact_ventas_walmart
    WHERE pais='CR' AND fecha BETWEEN '2026-05-23' AND '2026-06-19'
    GROUP BY fecha, punto_venta, codigo_barras
    HAVING COUNT(*) > 1
  ) t
`)
console.log(`Claves duplicadas (fecha, pv, codigo_barras): ${f(r1.rows[0].dup_keys)} · filas extras: ${f(r1.rows[0].extra)}`)

// Por (fecha, punto_venta, sku)
const r2 = await pool.query(`
  SELECT COUNT(*) AS dup_keys, SUM(n - 1) AS extra
  FROM (
    SELECT fecha, punto_venta, sku, COUNT(*) AS n
    FROM fact_ventas_walmart
    WHERE pais='CR' AND fecha BETWEEN '2026-05-23' AND '2026-06-19' AND sku IS NOT NULL AND sku<>''
    GROUP BY fecha, punto_venta, sku
    HAVING COUNT(*) > 1
  ) t
`)
console.log(`Claves duplicadas (fecha, pv, sku): ${f(r2.rows[0].dup_keys)} · filas extras: ${f(r2.rows[0].extra)}`)

// Top 5 ejemplos
const r3 = await pool.query(`
  SELECT fecha, punto_venta, codigo_barras, COUNT(*) AS n, ARRAY_AGG(DISTINCT archivo_origen) AS archivos
  FROM fact_ventas_walmart
  WHERE pais='CR' AND fecha BETWEEN '2026-05-23' AND '2026-06-19'
  GROUP BY fecha, punto_venta, codigo_barras
  HAVING COUNT(*) > 1
  ORDER BY n DESC LIMIT 5
`)
if (r3.rows.length) {
  console.log('\nTop 5 duplicados:')
  for (const x of r3.rows) console.log(`  ${new Date(x.fecha).toISOString().slice(0,10)} · ${x.punto_venta} · ${x.codigo_barras} → ${x.n} filas · ${x.archivos}`)
}

// Conteo de filas por archivo_origen en el rango
console.log('\n=== Filas por archivo_origen en el rango ===')
const r4 = await pool.query(`
  SELECT archivo_origen, COUNT(*) AS n, SUM(ventas_unidades) AS und, ROUND(SUM(ventas_valor)::numeric,0) AS usd
  FROM fact_ventas_walmart
  WHERE pais='CR' AND fecha BETWEEN '2026-05-23' AND '2026-06-19'
  GROUP BY archivo_origen ORDER BY n DESC
`)
for (const x of r4.rows) console.log(`  ${x.archivo_origen}: ${f(x.n)} filas · ${f(x.und)} und · $${f(x.usd)}`)

await pool.end()
