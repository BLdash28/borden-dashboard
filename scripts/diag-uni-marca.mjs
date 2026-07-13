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

console.log('=== fact_ventas_unisuper 2025 por marca ===')
const r = await pool.query(`
  SELECT
    COALESCE(NULLIF(TRIM(marca), ''), '(vacía)') AS marca,
    COUNT(*) AS n,
    ROUND(SUM(ventas_valor)::numeric, 0) AS usd,
    ROUND(SUM(ventas_valor_gtq)::numeric, 0) AS gtq
  FROM fact_ventas_unisuper
  WHERE fecha >= '2025-01-01' AND fecha < '2026-01-01'
  GROUP BY 1
  ORDER BY 3 DESC NULLS LAST
  LIMIT 30
`)
for (const x of r.rows) {
  console.log(`  ${String(x.marca).padEnd(30)}  ${f(x.n).padStart(10)} filas · $${f(x.usd)} · GTQ ${f(x.gtq)}`)
}

console.log('\n=== fact_ventas_unisuper 2025: filas con categoria vacía/sku vacío ===')
const r2 = await pool.query(`
  SELECT
    SUM(CASE WHEN COALESCE(TRIM(categoria), '') = '' THEN 1 ELSE 0 END) AS sin_cat,
    SUM(CASE WHEN COALESCE(TRIM(subcategoria), '') = '' THEN 1 ELSE 0 END) AS sin_sub,
    SUM(CASE WHEN COALESCE(TRIM(sku::text), '') = '' OR sku = 0 THEN 1 ELSE 0 END) AS sin_sku,
    COUNT(*) AS total
  FROM fact_ventas_unisuper
  WHERE fecha >= '2025-01-01' AND fecha < '2026-01-01' AND UPPER(marca) = 'BORDEN'
`)
console.log(`  total BORDEN 2025: ${f(r2.rows[0].total)}`)
console.log(`  sin categoria: ${f(r2.rows[0].sin_cat)}`)
console.log(`  sin subcategoria: ${f(r2.rows[0].sin_sub)}`)
console.log(`  sin sku: ${f(r2.rows[0].sin_sku)}`)

console.log('\n=== muestra BORDEN 2025 (primeras 5) ===')
const r3 = await pool.query(`
  SELECT fecha, pais, cadena, nombre_sucursal, categoria, subcategoria, sku, codigo_barras, descripcion, ventas_valor
  FROM fact_ventas_unisuper
  WHERE UPPER(marca) = 'BORDEN' AND fecha >= '2025-06-01'
  ORDER BY fecha LIMIT 5
`)
for (const x of r3.rows) console.log(' ', x)

await pool.end()
