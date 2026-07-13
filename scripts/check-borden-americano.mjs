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

// Buscar el EAN 53000003502
const r1 = await pool.query(`
  SELECT sku, codigo_barras, descripcion, categoria, subcategoria, presentacion
  FROM dim_producto WHERE codigo_barras::text = '53000003502'
`)
console.log('Buscando codigo_barras = 53000003502:')
console.log(r1.rows.length === 0 ? '  NO existe' : '  ' + JSON.stringify(r1.rows[0]))

// Buscar productos Borden con AMERICANO
const r2 = await pool.query(`
  SELECT sku, codigo_barras, descripcion, categoria, subcategoria, presentacion
  FROM dim_producto
  WHERE descripcion ILIKE '%AMERIC%' OR descripcion ILIKE '%REBANAD%'
  ORDER BY codigo_barras
`)
console.log('\nProductos Borden con descripción AMERIC/REBANAD:')
for (const x of r2.rows) console.log(`  ${x.codigo_barras} | sku=${x.sku} | ${x.descripcion} | ${x.categoria} / ${x.subcategoria} | ${x.presentacion}`)

await pool.end()
