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

// Tablas con "inventario" o "walmart"
const r = await pool.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema='public'
    AND (table_name ILIKE '%inventario%' OR table_name ILIKE '%inv_%' OR table_name ILIKE '%walmart%' OR table_name ILIKE '%stock%')
  ORDER BY table_name
`)
console.log('=== Tablas relevantes ===')
for (const x of r.rows) console.log(`  ${x.table_name}`)

// Para cada tabla de inventario, mostrar conteo + rango de fechas + cols clave
for (const tab of r.rows) {
  const t = tab.table_name
  const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`, [t])
  const colNames = cols.rows.map(c => c.column_name)
  const hasFecha = colNames.includes('fecha')
  const hasAno = colNames.includes('ano') && colNames.includes('mes')
  if (!hasFecha && !hasAno) continue

  let countQ
  if (hasFecha) {
    countQ = `SELECT COUNT(*) AS n, MIN(fecha) AS mn, MAX(fecha) AS mx FROM ${t}`
  } else {
    countQ = `SELECT COUNT(*) AS n, MIN(ano||'-'||LPAD(mes::text,2,'0')) AS mn, MAX(ano||'-'||LPAD(mes::text,2,'0')) AS mx FROM ${t}`
  }
  try {
    const c = await pool.query(countQ)
    console.log(`\n[${t}]`)
    console.log(`  ${colNames.join(', ')}`)
    console.log(`  Filas: ${Number(c.rows[0].n).toLocaleString()} · ${c.rows[0].mn} → ${c.rows[0].mx}`)
    // Por país si lo tiene
    if (colNames.includes('pais')) {
      const p = await pool.query(`SELECT pais, COUNT(*) AS n FROM ${t} GROUP BY pais ORDER BY pais`)
      console.log(`  Por país: ${p.rows.map(x => `${x.pais}:${Number(x.n).toLocaleString()}`).join(', ')}`)
    }
  } catch (e) {
    console.log(`  ⚠️  ${e.message}`)
  }
}

await pool.end()
