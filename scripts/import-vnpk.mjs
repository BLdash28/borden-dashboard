/**
 * Importa VNPK Qty desde el reporte DCD de RetailLink a dim_producto.
 * Uso: node scripts/import-vnpk.mjs <ruta-archivo.xlsx>
 *
 * Columnas esperadas (nombre flexible):
 *   UPC  |  Signing Desc  |  VNPK Qty  |  Current WHSE On Hand Cases
 */
import pg   from 'pg'
import XLSX from 'xlsx'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const env = readFileSync(join(__dirname, '../.env.local'), 'utf8')
  for (const raw of env.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
  }
} catch {}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

const archivo = process.argv[2]
if (!archivo) {
  console.error('Uso: node scripts/import-vnpk.mjs <ruta-archivo.xlsx>')
  process.exit(1)
}

// ── Leer Excel ────────────────────────────────────────────────────────────────
const raw  = readFileSync(archivo)
const wb   = XLSX.read(raw)
const ws   = wb.Sheets[wb.SheetNames[0]]
const data = XLSX.utils.sheet_to_json(ws, { defval: '' })

if (data.length === 0) { console.error('Excel vacío'); process.exit(1) }

const norm = s => String(s).toLowerCase().replace(/[\s_\-\.]/g, '')
const keys = Object.keys(data[0])
const find = (...opts) => keys.find(k => opts.some(o => norm(k) === norm(o))) ?? null

const colUpc  = find('UPC', 'upc', 'codigo_barras', 'codigobarras', 'Upc')
const colVnpk = find('VNPK Qty', 'VNPK_Qty', 'vnpkqty', 'vnpk_qty', 'Multiplicador', 'UnidxCaja', 'unidades_caja')

console.log(`Archivo : ${archivo}`)
console.log(`Filas   : ${data.length}`)
console.log(`Col UPC : ${colUpc}`)
console.log(`Col VNPK: ${colVnpk}`)

if (!colUpc)  { console.error('No se encontró columna UPC');      process.exit(1) }
if (!colVnpk) { console.error('No se encontró columna VNPK Qty'); process.exit(1) }

// ── Normalizar UPC ────────────────────────────────────────────────────────────
// RetailLink exporta 14 dígitos (GTIN-14). dim_producto.codigo_barras puede tener
// 12, 13 o 14 dígitos. Normalizamos a los 12 dígitos internos (sin check digit,
// sin padding) para comparar de forma flexible.
function upcCore(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (!digits) return null
  // Quitar último dígito (check digit) y leading zeros
  return digits.slice(0, -1).replace(/^0+/, '') || '0'
}

const rows = data
  .map(r => ({ upc: String(r[colUpc] ?? '').trim(), vnpk: parseInt(String(r[colVnpk] ?? '0')) || 0 }))
  .filter(r => r.upc && r.vnpk > 0)

console.log(`\nFilas válidas: ${rows.length}`)

// ── Hacer merge con dim_producto ──────────────────────────────────────────────
// Estrategia: match por codigo_barras con variantes de 12/13/14 dígitos.
// Para cada UPC del Excel generamos las variantes posibles y usamos OR.
let totalUpdated = 0
let notFound = 0
const missed = []

for (const row of rows) {
  const digits = String(row.upc).replace(/\D/g, '')
  if (!digits) continue

  // dim_producto.codigo_barras is stored without leading zeros and without the check digit.
  // The inventory tables and RetailLink exports use 13-digit padded UPCs.
  // The same join used in inventory queries:
  //   LPAD(LEFT(codigo_barras, LENGTH(codigo_barras)-1), 13, '0') = upc_13
  // Also try direct match (some entries may already be padded).
  const upc13 = digits.padStart(13, '0')

  const res = await pool.query(
    `UPDATE dim_producto
     SET vnpk_qty = $1
     WHERE LPAD(LEFT(codigo_barras, LENGTH(codigo_barras) - 1), 13, '0') = $2
        OR codigo_barras = $2
        OR codigo_barras = $3`,
    [row.vnpk, upc13, digits]
  )

  if (res.rowCount === 0) {
    notFound++
    missed.push({ upc: row.upc, vnpk: row.vnpk })
  } else {
    totalUpdated += res.rowCount
  }
}

console.log(`\n✅ Actualizados : ${totalUpdated} registros en dim_producto`)
console.log(`⚠️  Sin match    : ${notFound} UPCs`)

if (missed.length > 0 && missed.length <= 20) {
  console.log('\nSin match (primeros 20):')
  missed.forEach(m => console.log(`  UPC=${m.upc}  VNPK=${m.vnpk}`))
}

// ── Resumen por SKU ───────────────────────────────────────────────────────────
const { rows: resumen } = await pool.query(`
  SELECT vnpk_qty, COUNT(*) n
  FROM dim_producto
  WHERE vnpk_qty IS NOT NULL AND vnpk_qty > 1
  GROUP BY vnpk_qty ORDER BY vnpk_qty
`)
console.log('\nDistribución vnpk_qty en dim_producto:')
resumen.forEach(r => console.log(`  vnpk_qty=${r.vnpk_qty}  → ${r.n} productos`))

await pool.end()
