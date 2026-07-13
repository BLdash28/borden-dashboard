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

const baseline = await pool.query(`SELECT MAX(id) AS m FROM bot_runs`)
const baseId = Number(baseline.rows[0].m || 0)
console.log(`Baseline: bot_runs max id = ${baseId}. Monitoreando…`)

const start = Date.now()
const TIMEOUT = 8 * 60 * 1000  // 8 min
let last = baseId

while (Date.now() - start < TIMEOUT) {
  const r = await pool.query(`SELECT id, source_file, fecha_desde::date AS fd, fecha_hasta::date AS fh, rows_inserted, status, started_at, finished_at FROM bot_runs WHERE id > $1 ORDER BY id DESC LIMIT 1`, [baseId])
  if (r.rows.length) {
    const x = r.rows[0]
    if (x.id !== last) {
      last = x.id
      console.log(`\n🆕 Nuevo run #${x.id}:`)
      console.log(`   file: ${x.source_file}`)
      console.log(`   rango: ${new Date(x.fd).toISOString().slice(0,10)} → ${new Date(x.fh).toISOString().slice(0,10)}`)
      console.log(`   filas insertadas: ${Number(x.rows_inserted ?? 0).toLocaleString()}`)
      console.log(`   status: ${x.status}`)
    }
    if (x.finished_at) {
      console.log(`\n✅ Terminó: ${new Date(x.finished_at).toISOString().slice(0,19)} · ${x.status}`)
      // verificar fact_ventas_walmart actualizado
      const v = await pool.query(`SELECT MAX(fecha)::date AS f FROM fact_ventas_walmart WHERE pais='CR'`)
      console.log(`   fact_ventas_walmart CR última fecha: ${new Date(v.rows[0].f).toISOString().slice(0,10)}`)
      process.exit(0)
    }
  }
  await new Promise(r => setTimeout(r, 15000))
  process.stdout.write('.')
}
console.log('\n⏱️  Timeout 8min sin run nuevo')
await pool.end()
