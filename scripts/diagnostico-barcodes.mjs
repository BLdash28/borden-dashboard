// scripts/diagnostico-barcodes.mjs
// Muestra los valores exactos de codigo_barras en ambas tablas
// para diagnosticar por qué la correlación es 0%.
//
// Uso: node scripts/diagnostico-barcodes.mjs

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { Pool } from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir   = join(__dirname, '..')

const envContent = readFileSync(join(rootDir, '.env.local'), 'utf8')
const envVars = {}
for (const line of envContent.split(/\r?\n/)) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx === -1) continue
  envVars[trimmed.substring(0, eqIdx).trim()] = trimmed.substring(eqIdx + 1).trim()
}

const pool = new Pool({ connectionString: envVars['DATABASE_URL_NEON'] + '?sslmode=verify-full' })

console.log('\n── dim_producto (primeros 10) ──────────────────────')
const { rows: prod } = await pool.query(
  `SELECT sku, codigo_barras,
          LENGTH(codigo_barras)      AS len,
          ASCII(LEFT(codigo_barras,1)) AS primer_ascii
   FROM dim_producto LIMIT 10`)
prod.forEach(r =>
  console.log(`  SKU=${r.sku.padEnd(8)} | BARRAS="${r.codigo_barras}" | len=${r.len} | ascii0=${r.primer_ascii}`)
)

console.log('\n── fact_sales_sellout (10 barcodes distintos) ──────')
const { rows: fact } = await pool.query(
  `SELECT DISTINCT codigo_barras,
          LENGTH(codigo_barras)      AS len,
          ASCII(LEFT(codigo_barras,1)) AS primer_ascii
   FROM fact_sales_sellout
   WHERE codigo_barras IS NOT NULL AND codigo_barras <> ''
   LIMIT 10`)
fact.forEach(r =>
  console.log(`  BARRAS="${r.codigo_barras}" | len=${r.len} | ascii0=${r.primer_ascii}`)
)

console.log('\n── Intento de match (varias estrategias) ───────────')
const { rows: test } = await pool.query(`
  SELECT
    -- Estrategia A: exacto
    COUNT(*) FILTER (WHERE TRIM(p.codigo_barras) = TRIM(f.codigo_barras))
      AS match_exacto,
    -- Estrategia B: strip leading zeros
    COUNT(*) FILTER (WHERE
      TRIM(LEADING '0' FROM TRIM(p.codigo_barras)) =
      TRIM(LEADING '0' FROM TRIM(f.codigo_barras)))
      AS match_strip_zeros,
    -- Estrategia C: LEFT 12 con LPAD
    COUNT(*) FILTER (WHERE
      LEFT(LPAD(TRIM(p.codigo_barras),13,'0'),12) =
      LEFT(LPAD(TRIM(f.codigo_barras),13,'0'),12))
      AS match_left12,
    -- Estrategia D: LEFT 11
    COUNT(*) FILTER (WHERE
      LEFT(LPAD(TRIM(p.codigo_barras),13,'0'),11) =
      LEFT(LPAD(TRIM(f.codigo_barras),13,'0'),11))
      AS match_left11,
    -- Estrategia E: barras de ventas CONTAINS barras de catálogo (sin zeros)
    COUNT(*) FILTER (WHERE
      TRIM(f.codigo_barras) LIKE '%' || TRIM(LEADING '0' FROM TRIM(p.codigo_barras)) || '%')
      AS match_contains,
    COUNT(DISTINCT f.codigo_barras) AS total_ventas_barcodes
  FROM fact_sales_sellout f
  CROSS JOIN dim_producto p
  WHERE f.codigo_barras IS NOT NULL AND f.codigo_barras <> ''
    AND p.is_active = TRUE
`)
const t = test[0]
console.log(`  Exacto             : ${t.match_exacto}`)
console.log(`  Strip leading 0s   : ${t.match_strip_zeros}`)
console.log(`  LEFT 12 + LPAD     : ${t.match_left12}`)
console.log(`  LEFT 11 + LPAD     : ${t.match_left11}`)
console.log(`  CONTAINS           : ${t.match_contains}`)
console.log(`  Total barcodes ventas: ${t.total_ventas_barcodes}`)

await pool.end()
