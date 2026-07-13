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

const tables = [
  { name: 'fact_ventas_walmart',  skuCol: 'sku', fechaCol: 'fecha' },
  { name: 'fact_ventas_unisuper', skuCol: 'sku', fechaCol: 'fecha' },
  { name: 'fact_ventas_selectos', skuCol: 'sku', fechaCol: 'fecha' },
  { name: 'fact_ventas_exito',    skuCol: 'sku', fechaCol: null },
]

for (const t of tables) {
  try {
    let q
    if (t.fechaCol) {
      q = await pool.query(`
        SELECT COUNT(*) AS filas,
               ROUND(SUM(ventas_valor)::numeric,2) AS total,
               ROUND(SUM(ventas_unidades)::numeric,0) AS uds
        FROM ${t.name}
        WHERE ${t.skuCol} = '1234'
          AND EXTRACT(YEAR FROM ${t.fechaCol}) = 2026
          AND EXTRACT(MONTH FROM ${t.fechaCol}) = 5
      `)
    } else {
      q = await pool.query(`
        SELECT COUNT(*) AS filas,
               ROUND(SUM(ventas_valorusd)::numeric,2) AS total,
               ROUND(SUM(ventas_unidades)::numeric,0) AS uds
        FROM ${t.name}
        WHERE ${t.skuCol} = '1234' AND ano = 2026 AND mes = 5
      `)
    }
    const r = q.rows[0]
    console.log(`${t.name}: ${r.filas} filas | $${Number(r.total||0).toLocaleString('en-US',{minimumFractionDigits:2})} | ${r.uds||0} uds`)
  } catch (e) {
    console.log(`${t.name}: ERROR — ${e.message}`)
  }
}

await pool.end()
