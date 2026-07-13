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

// dim_producto completo
const d = await pool.query(`SELECT codigo_barras, sku, descripcion FROM dim_producto WHERE codigo_barras IS NOT NULL`)
const dimSet = new Set(d.rows.map(r => r.codigo_barras))
const dimByLen = {}
for (const r of d.rows) {
  const L = r.codigo_barras.length
  if (!dimByLen[L]) dimByLen[L] = []
  dimByLen[L].push(r.codigo_barras)
}
console.log(`dim_producto: ${dimSet.size} total · longitudes: ${Object.entries(dimByLen).map(([k,v]) => `${k}:${v.length}`).join(', ')}`)

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
console.log(`\nQlik UPCs únicos: ${upcs.size}`)

// Probar patrones de mapeo
const tryMatch = (u) => {
  const candidates = [
    u,                              // exact
    u.replace(/^0+/, ''),           // strip leading 0
    u.padStart(11, '0'),            // pad to 11
    u.padStart(12, '0'),            // pad to 12
    u.padStart(13, '0'),            // pad to 13
    '0' + u,                        // prefix 0
    '00' + u,                       // prefix 00
    u.slice(0, 5) + '0' + u.slice(5),  // insert 0 at pos 5 (53000 + 0 + xxxxx)
    u.slice(0, 6) + '0' + u.slice(6),  // insert 0 at pos 6
    u.slice(0, 4) + '0' + u.slice(4),  // insert 0 at pos 4
    '0' + u.slice(0, 5) + '0' + u.slice(5),  // prefix 0 + insert 0 at pos 5
  ]
  for (const c of candidates) {
    if (dimSet.has(c)) return { match: c, via: candidates.indexOf(c) }
  }
  return null
}

let hits = 0, misses = []
for (const [u, desc] of upcs) {
  const m = tryMatch(u)
  if (m) hits++
  else misses.push({ u, desc })
}
console.log(`\nMatch: ${hits}/${upcs.size}`)
console.log(`\nMisses (${misses.length}):`)
for (const m of misses.slice(0, 40)) console.log(`  "${m.u}" · ${m.desc.slice(0,55)}`)

// Mostrar dim_producto de 11 chars que empiecen con 53000
console.log(`\n=== dim_producto 11-chars empezando con 5300 ===`)
const dim11 = (dimByLen[11] || []).filter(x => x.startsWith('53000')).sort()
for (const x of dim11.slice(0, 25)) console.log(`  "${x}"`)
console.log(`  ... total: ${dim11.length}`)

// Mostrar dim_producto de 10 chars
console.log(`\n=== dim_producto 10-chars ===`)
const dim10 = (dimByLen[10] || []).sort()
for (const x of dim10.slice(0, 15)) console.log(`  "${x}"`)
console.log(`  ... total: ${dim10.length}`)

await pool.end()
