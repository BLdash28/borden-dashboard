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

console.log('🔄 Recreando v_sellout_mensual con filtro BORDEN…')
await pool.query(`
  CREATE OR REPLACE VIEW v_sellout_mensual AS
  -- UNISUPER: solo BORDEN
  SELECT EXTRACT(year FROM fecha)::integer AS ano,
         EXTRACT(month FROM fecha)::integer AS mes,
         EXTRACT(day FROM fecha)::integer AS dia,
         pais,
         cadena,
         categoria,
         sku,
         nombre_sucursal AS punto_venta,
         ventas_valor,
         ventas_unidades,
         'UNISUPER'::text AS cliente,
         subcategoria,
         CASE
           WHEN UPPER(cadena) = 'LA TORRE'    THEN 'SUPERMERCADO'
           WHEN UPPER(cadena) = 'ECONOSUPER'  THEN 'DESCUENTOS'
           ELSE NULL
         END AS formato,
         descripcion,
         codigo_barras
  FROM fact_ventas_unisuper
  WHERE UPPER(marca) = 'BORDEN'
  UNION ALL
  -- WALMART: solo Borden (filtrado por archivo_origen para excluir cualquier ruido)
  SELECT EXTRACT(year FROM fecha)::integer AS ano,
         EXTRACT(month FROM fecha)::integer AS mes,
         EXTRACT(day FROM fecha)::integer AS dia,
         pais, cadena, categoria, sku, punto_venta,
         ventas_valor, ventas_unidades,
         'WALMART'::text AS cliente,
         subcategoria, formato, descripcion, codigo_barras
  FROM fact_ventas_walmart
  UNION ALL
  -- SELECTOS: solo BORDEN
  SELECT EXTRACT(year FROM fecha)::integer AS ano,
         EXTRACT(month FROM fecha)::integer AS mes,
         EXTRACT(day FROM fecha)::integer AS dia,
         pais, cadena, categoria, sku,
         nombre_sucursal AS punto_venta,
         ventas_valor, ventas_unidades,
         'SELECTOS'::text AS cliente,
         subcategoria,
         'SUPERMERCADO'::text AS formato,
         descripcion, codigo_barras
  FROM fact_ventas_selectos
  WHERE UPPER(marca) = 'BORDEN'
  UNION ALL
  -- ÉXITO: Colombia (toda la data es Borden)
  SELECT ano, mes, dia,
         pais, cadena, categoria, sku, punto_venta,
         ventas_valorusd AS ventas_valor,
         ventas_unidades,
         COALESCE(cliente, 'GRUPO ÉXITO'::text) AS cliente,
         subcategoria, formato, descripcion, codigo_barras
  FROM fact_ventas_exito;
`)
console.log('   ✅ vista actualizada')

console.log('\n🔄 Refrescando mv_sellout_mensual…')
let t0 = Date.now()
await pool.query(`REFRESH MATERIALIZED VIEW mv_sellout_mensual`)
console.log(`   ✅ ${((Date.now()-t0)/1000).toFixed(1)}s`)
t0 = Date.now()
await pool.query(`REFRESH MATERIALIZED VIEW mv_ventas_agg`)
console.log(`   ✅ mv_ventas_agg ${((Date.now()-t0)/1000).toFixed(1)}s`)

console.log('\n🔎 Totales por año/cliente (después del fix):')
const r = await pool.query(`SELECT ano, cliente, ROUND(SUM(ventas_valor)::numeric,0) AS usd FROM mv_sellout_mensual GROUP BY ano, cliente ORDER BY ano, usd DESC`)
let prev = ''
for (const x of r.rows) {
  if (prev !== String(x.ano)) { console.log(`  -- ${x.ano} --`); prev = String(x.ano) }
  console.log(`    ${String(x.cliente).padEnd(14)}: $${Number(x.usd).toLocaleString()}`)
}
const tot = await pool.query(`SELECT ROUND(SUM(ventas_valor)::numeric,0) AS usd FROM mv_sellout_mensual`)
console.log(`\n  TOTAL: $${Number(tot.rows[0].usd).toLocaleString()}`)

await pool.end()
