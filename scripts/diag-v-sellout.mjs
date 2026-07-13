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

// Definición de v_sellout_mensual
const def = await pool.query(`SELECT definition FROM pg_views WHERE viewname = 'v_sellout_mensual'`)
console.log('=== v_sellout_mensual definition ===')
console.log(def.rows[0]?.definition ?? 'NOT FOUND')

// Listar todas las vistas que mencionen walmart o sellout
const views = await pool.query(`
  SELECT viewname, LEFT(definition, 200) AS preview
  FROM pg_views
  WHERE schemaname = 'public'
    AND (viewname ILIKE '%sellout%' OR viewname ILIKE '%walmart%' OR viewname ILIKE '%ventas%')
  ORDER BY viewname
`)
console.log('\n=== Vistas relevantes ===')
for (const r of views.rows) console.log(`\n${r.viewname}:\n  ${r.preview}`)

await pool.end()
