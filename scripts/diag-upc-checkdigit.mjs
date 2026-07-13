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

const d = await pool.query(`SELECT codigo_barras, sku, descripcion FROM dim_producto WHERE codigo_barras IS NOT NULL`)
const dimMap = new Map()
for (const r of d.rows) dimMap.set(r.codigo_barras, r)

const wb = XLSX.readFile('C:/Users/IAN/Downloads/Sin título - Tabla simple - 12 de junio de 2026.xlsx')
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
const upcs = new Map()
for (let i = 1; i < rows.length; i++) {
  const upc = String(rows[i][4] ?? '').trim()
  const desc = String(rows[i][5] ?? '').trim()
  if (!upcs.has(upc)) upcs.set(upc, desc)
}

// Estrategia: para cada UPC Qlik, probar UPC + dígito 0-9 (check digit)
let hits = 0, misses = []
const mapping = []
for (const [u, desc] of upcs) {
  let found = null
  for (let dig = 0; dig <= 9; dig++) {
    const candidate = u + String(dig)
    if (dimMap.has(candidate)) { found = candidate; break }
  }
  if (found) {
    hits++
    const dim = dimMap.get(found)
    mapping.push({ qlik: u, dim: found, sku: dim.sku, desc_qlik: desc.slice(0,40), desc_dim: dim.descripcion?.slice(0,40) })
  } else {
    misses.push({ u, desc })
  }
}

console.log(`Match con check-digit: ${hits}/${upcs.size}`)
console.log(`\n=== Mapping ===`)
for (const m of mapping) console.log(`  Qlik ${m.qlik} → dim ${m.dim} (SKU ${m.sku}) · ${m.desc_dim}`)
console.log(`\n=== Misses (${misses.length}) ===`)
for (const m of misses) console.log(`  "${m.u}" · ${m.desc}`)

await pool.end()
