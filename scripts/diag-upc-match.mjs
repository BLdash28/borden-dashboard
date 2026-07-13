import pg from 'pg'
import XLSX from 'xlsx'
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

// dim_producto samples
const d = await pool.query(`SELECT codigo_barras, sku, descripcion FROM dim_producto WHERE codigo_barras IS NOT NULL ORDER BY codigo_barras LIMIT 20`)
console.log('=== dim_producto (primeros 20) ===')
for (const r of d.rows) console.log(`  "${r.codigo_barras}" (len=${r.codigo_barras.length}) · ${r.sku} · ${r.descripcion?.slice(0,40)}`)

// Qlik UPCs únicos
const wb = XLSX.readFile('C:/Users/IAN/Downloads/Sin título - Tabla simple - 12 de junio de 2026.xlsx')
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
const upcs = new Map()
for (let i = 1; i < rows.length; i++) {
  const upc = String(rows[i][4] ?? '').trim()
  const desc = String(rows[i][5] ?? '').trim()
  if (!upcs.has(upc)) upcs.set(upc, desc)
}
console.log(`\n=== UPCs únicos en Qlik (${upcs.size}) — primeros 20 ===`)
const upcArr = [...upcs.keys()].sort()
for (const u of upcArr.slice(0, 20)) console.log(`  "${u}" (len=${u.length}) · ${upcs.get(u).slice(0,40)}`)

// Probar: ¿algún UPC matchea contra dim_producto en cualquier forma?
console.log(`\n=== Intentando match con stripping leading zeros y add-13 ===`)
const dimSet = new Set(d.rows.map(r => r.codigo_barras))
let hits = 0
for (const u of upcArr) {
  // Try padded 13 / 12 / strip leading zeros
  const candidates = [u, u.replace(/^0+/, ''), u.padStart(12, '0'), u.padStart(13, '0'), '0' + u, '00' + u]
  for (const c of candidates) {
    if (dimSet.has(c)) { hits++; console.log(`  Qlik "${u}" → dim "${c}"`); break }
  }
}
console.log(`\n  ${hits} de ${upcArr.length} UPCs encontraron candidato en dim_producto`)

await pool.end()
