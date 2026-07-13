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

// Sample: fechas 2025-08-15 (que debería tener data Borden cargada)
console.log('=== UNISUPER 2025-08-15 - filas existentes con codigo_barras de un Borden conocido ===')
const r = await pool.query(`
  SELECT DISTINCT codigo_barras FROM dim_producto WHERE is_active = true LIMIT 5
`)
const barras = r.rows.map(x => x.codigo_barras)
console.log('  Códigos Borden ejemplo:', barras.join(', '))

for (const cb of barras.slice(0, 2)) {
  console.log(`\n--- codigo_barras=${cb} en fact_ventas_unisuper 2025-08 ---`)
  const r2 = await pool.query(`
    SELECT fecha, nombre_sucursal, marca, sku, descripcion, ventas_valor
    FROM fact_ventas_unisuper
    WHERE codigo_barras = $1 AND fecha >= '2025-08-01' AND fecha < '2025-09-01'
    ORDER BY fecha, nombre_sucursal LIMIT 10
  `, [cb])
  for (const x of r2.rows) console.log(' ', x.fecha.toISOString().slice(0,10), '|', x.nombre_sucursal, '|', x.marca, '|', x.sku, '|', x.descripcion?.slice(0, 40), '| $', x.ventas_valor)
}

console.log('\n=== UNISUPER 2025-08: marcas presentes (¿hay BORDEN escondido como otra cosa?) ===')
const r3 = await pool.query(`
  SELECT DISTINCT marca
  FROM fact_ventas_unisuper f
  WHERE fecha >= '2025-08-01' AND fecha < '2025-09-01'
    AND EXISTS (SELECT 1 FROM dim_producto d WHERE d.codigo_barras = f.codigo_barras)
  ORDER BY 1
`)
for (const x of r3.rows) console.log(`  marca: "${x.marca}"`)

console.log('\n=== SELECTOS: ¿qué tenía antes de mi carga? Conteo total + por marca ===')
const r4 = await pool.query(`
  SELECT COALESCE(NULLIF(TRIM(marca),''), '(vacía)') AS marca, COUNT(*) AS n
  FROM fact_ventas_selectos
  GROUP BY 1
  ORDER BY 2 DESC LIMIT 20
`)
for (const x of r4.rows) console.log(`  ${x.marca}: ${Number(x.n).toLocaleString()}`)

await pool.end()
