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

// Distribución de ventas_valor para CR mayo 2026
const dist = await pool.query(`
  SELECT
    COUNT(*) AS total_filas,
    ROUND(AVG(ventas_valor)::numeric,2) AS avg_valor,
    MIN(ventas_valor) AS min_valor,
    MAX(ventas_valor) AS max_valor,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ventas_valor) AS mediana,
    PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY ventas_valor) AS p90
  FROM fact_ventas_walmart
  WHERE pais = 'CR' AND EXTRACT(YEAR FROM fecha)=2026 AND EXTRACT(MONTH FROM fecha)=5
`)
console.log('=== Distribución ventas_valor CR mayo 2026 ===')
console.log(dist.rows[0])
console.log()

// Top 5 valores más altos
const top = await pool.query(`
  SELECT fecha, cadena, punto_venta, codigo_barras, descripcion, ventas_unidades, ventas_valor
  FROM fact_ventas_walmart
  WHERE pais = 'CR' AND EXTRACT(YEAR FROM fecha)=2026 AND EXTRACT(MONTH FROM fecha)=5
  ORDER BY ventas_valor DESC LIMIT 5
`)
console.log('=== Top 5 filas por ventas_valor CR mayo ===')
for (const r of top.rows) console.log(r)
console.log()

// Muestra de 5 filas típicas (cerca de la mediana)
const sample = await pool.query(`
  SELECT fecha, cadena, punto_venta, codigo_barras, descripcion, ventas_unidades, ventas_valor, archivo_origen
  FROM fact_ventas_walmart
  WHERE pais = 'CR' AND EXTRACT(YEAR FROM fecha)=2026 AND EXTRACT(MONTH FROM fecha)=5
  ORDER BY ventas_valor
  OFFSET 15000 LIMIT 5
`)
console.log('=== Muestra de filas típicas CR mayo ===')
for (const r of sample.rows) console.log(r)
console.log()

// Fechas distintas en CR mayo 2026
const fechas = await pool.query(`
  SELECT MIN(fecha) AS min_f, MAX(fecha) AS max_f, COUNT(DISTINCT fecha) AS dias_distintos
  FROM fact_ventas_walmart
  WHERE pais = 'CR' AND EXTRACT(YEAR FROM fecha)=2026 AND EXTRACT(MONTH FROM fecha)=5
`)
console.log('=== Fechas CR mayo 2026 ===')
console.log(fechas.rows[0])

await pool.end()
