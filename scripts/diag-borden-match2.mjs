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

console.log('=== UNISUPER BORDEN: estado del match dim_producto ===')
for (const t of ['fact_ventas_unisuper','fact_ventas_walmart','fact_ventas_selectos']) {
  const cond = t === 'fact_ventas_walmart'
    ? `f.descripcion ILIKE '%BORDEN%'`
    : `UPPER(f.marca) = 'BORDEN'`
  const r = await pool.query(`
    WITH x AS (
      SELECT
        f.sku AS f_sku, f.categoria AS f_cat, f.subcategoria AS f_sub,
        d.sku AS d_sku, d.categoria AS d_cat, d.subcategoria AS d_sub
      FROM ${t} f
      LEFT JOIN dim_producto d ON d.codigo_barras = f.codigo_barras
      WHERE ${cond}
    )
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN d_sku IS NULL THEN 1 ELSE 0 END) AS sin_match,
      SUM(CASE WHEN COALESCE(TRIM(f_cat), '') = '' THEN 1 ELSE 0 END) AS sin_cat,
      SUM(CASE WHEN COALESCE(TRIM(f_sub), '') = '' THEN 1 ELSE 0 END) AS sin_sub,
      SUM(CASE WHEN COALESCE(TRIM(f_sku), '') = '' THEN 1 ELSE 0 END) AS sin_sku,
      SUM(CASE WHEN d_sku IS NOT NULL AND COALESCE(TRIM(f_sku), '') <> COALESCE(TRIM(d_sku), '') THEN 1 ELSE 0 END) AS sku_mismatch,
      SUM(CASE WHEN d_cat IS NOT NULL AND COALESCE(TRIM(f_cat), '') <> COALESCE(TRIM(d_cat), '') THEN 1 ELSE 0 END) AS cat_mismatch
    FROM x
  `)
  const x = r.rows[0]
  console.log(`\n[${t}]`)
  console.log(`  total BORDEN: ${f(x.total)}`)
  console.log(`  sin match dim_producto (por codigo_barras): ${f(x.sin_match)}`)
  console.log(`  filas sin categoria poblada: ${f(x.sin_cat)}`)
  console.log(`  filas sin subcategoria poblada: ${f(x.sin_sub)}`)
  console.log(`  filas sin sku poblado: ${f(x.sin_sku)}`)
  console.log(`  filas con sku distinto al de dim_producto: ${f(x.sku_mismatch)}`)
  console.log(`  filas con categoria distinta a la de dim_producto: ${f(x.cat_mismatch)}`)
}

await pool.end()
