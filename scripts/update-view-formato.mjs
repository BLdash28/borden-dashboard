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

console.log('🔄 Recreando v_sellout_mensual con CASE para formato…')
await pool.query(`
  CREATE OR REPLACE VIEW v_sellout_mensual AS
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
  UNION ALL
  SELECT EXTRACT(year FROM fecha)::integer AS ano,
         EXTRACT(month FROM fecha)::integer AS mes,
         EXTRACT(day FROM fecha)::integer AS dia,
         pais, cadena, categoria, sku, punto_venta,
         ventas_valor, ventas_unidades,
         'WALMART'::text AS cliente,
         subcategoria, formato, descripcion, codigo_barras
  FROM fact_ventas_walmart
  UNION ALL
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
  UNION ALL
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
const t0 = Date.now()
await pool.query(`REFRESH MATERIALIZED VIEW mv_sellout_mensual`)
console.log(`   ✅ ${((Date.now()-t0)/1000).toFixed(1)}s`)

console.log('\n🔎 Verificación: cadena/formato en mv_sellout_mensual:')
const r = await pool.query(`
  SELECT cliente, cadena, formato, COUNT(*) AS n
  FROM mv_sellout_mensual
  GROUP BY cliente, cadena, formato
  ORDER BY cliente, cadena
`)
for (const x of r.rows) console.log(`   ${x.cliente.padEnd(12)} ${String(x.cadena).padEnd(22)} ${String(x.formato).padEnd(15)} ${Number(x.n).toLocaleString()}`)

await pool.end()
