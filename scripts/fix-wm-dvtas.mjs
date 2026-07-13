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

// Borrar DVTAS4W de mayo 2026
const del = await pool.query(`
  DELETE FROM fact_ventas_walmart
  WHERE archivo_origen = 'DVTAS4W.txt'
    AND EXTRACT(YEAR FROM fecha)=2026 AND EXTRACT(MONTH FROM fecha)=5
`)
console.log(`Borradas DVTAS4W mayo 2026: ${del.rowCount} filas`)

// Verificar mayo 2026
const check = await pool.query(`
  SELECT pais, COUNT(*) AS filas, ROUND(SUM(ventas_valor)::numeric,2) AS total
  FROM fact_ventas_walmart
  WHERE EXTRACT(YEAR FROM fecha)=2026 AND EXTRACT(MONTH FROM fecha)=5
  GROUP BY pais ORDER BY pais
`)
console.log('\nMayo 2026 por país:')
let gran = 0
for (const r of check.rows) {
  console.log(`  ${r.pais}: ${r.filas} filas | $${Number(r.total).toLocaleString('en-US',{minimumFractionDigits:2})}`)
  gran += Number(r.total)
}
console.log(`  TOTAL: $${gran.toLocaleString('en-US',{minimumFractionDigits:2})}`)
console.log(`  ESPERADO: $172,818.21`)

// Refrescar MV
console.log('\nRefrescando mv_sellout_mensual...')
await pool.query('REFRESH MATERIALIZED VIEW mv_sellout_mensual')
console.log('✅ mv_sellout_mensual actualizado')

await pool.end()
