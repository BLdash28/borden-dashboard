// scripts/import-precios-colombia.mjs
// Uso: node scripts/import-precios-colombia.mjs [archivo.xlsx]
//
// Columnas esperadas en el Excel (nombres flexibles):
//   COD BARRAS | EAN | EAN PRODUCTO
//   COD INTERNO | PLU | CODIGO INTERNO
//   DESCRIPCION | PRODUCTO | DESCRIPCION MAESTRA
//   CADENA            (opcional — si no existe aplica a todas)
//   FORMATO           (opcional)
//   PRECIO COMPRA | PC | P COMPRA
//   PRECIO COMPARABLE | P COMPARABLE | COMPARABLE
//   PRECIO VENTA | PV | P VENTA

import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'

// ── Cargar .env.local ──────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir   = join(__dirname, '..')
const envPath   = join(rootDir, '.env.local')

const envVars = {}
for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const eq = t.indexOf('=')
  if (eq === -1) continue
  envVars[t.substring(0, eq).trim()] = t.substring(eq + 1).trim()
}

const SUPABASE_URL     = envVars['NEXT_PUBLIC_SUPABASE_URL']
const SERVICE_ROLE_KEY = envVars['SUPABASE_SERVICE_ROLE_KEY']
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌  Variables NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no encontradas en .env.local')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// ── Archivo Excel ──────────────────────────────────────────────────────────
const defaultFiles = ['PRECIOS_COLOMBIA.xlsx', 'PRECIOS_CO.xlsx', 'precios_colombia.xlsx']
let filePath = process.argv[2] ? join(rootDir, process.argv[2]) : null
if (!filePath) {
  for (const name of defaultFiles) {
    const c = join(rootDir, name)
    if (existsSync(c)) { filePath = c; break }
  }
}
if (!filePath || !existsSync(filePath)) {
  console.error('❌  No se encontró el archivo Excel.')
  console.error('    Nombres aceptados en la raíz del proyecto:')
  defaultFiles.forEach(n => console.error('    -', n))
  console.error('    O pasa la ruta: node scripts/import-precios-colombia.mjs MiArchivo.xlsx')
  process.exit(1)
}

console.log('📂  Leyendo:', filePath)
const wb = XLSX.readFile(filePath)
console.log('📋  Hojas:', wb.SheetNames.join(', '))
const ws  = wb.Sheets[wb.SheetNames[0]]
const raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
console.log(`📊  Filas leídas: ${raw.length}`)
if (raw.length === 0) { console.error('❌  Hoja vacía.'); process.exit(1) }
console.log('🔍  Columnas:', Object.keys(raw[0]).join(' | '))

// ── Helpers ────────────────────────────────────────────────────────────────
function col(row, ...names) {
  for (const n of names) {
    if (row[n] !== undefined && row[n] !== '') return row[n]
  }
  return ''
}

function toNum(val) {
  return parseFloat(String(val ?? '').replace(/[^0-9.,-]/g, '').replace(',', '.')) || 0
}

function normalizeEan(raw) {
  const s = String(raw ?? '').replace(/\D/g, '')
  if (!s || s.length < 2) return String(raw ?? '').trim()
  return s.length >= 13 ? s.slice(0, 13) : s.padStart(13, '0')
}

// ── Mapeo de filas ─────────────────────────────────────────────────────────
const rows = raw.map(r => {
  const rawEan = String(col(r,
    'COD BARRAS', 'EAN', 'EAN PRODUCTO', 'Ean Producto', 'cod_barras', 'ean'
  ) ?? '').trim()

  return {
    cod_barras:        rawEan ? normalizeEan(rawEan) : '',
    cod_interno:       String(col(r, 'COD INTERNO', 'PLU', 'CODIGO INTERNO', 'Código Interno (PLU)', 'cod_interno') ?? '').trim(),
    descripcion:       String(col(r, 'DESCRIPCION', 'DESCRIPCION MAESTRA', 'PRODUCTO', 'Producto', 'descripcion') ?? '').trim(),
    cadena:            String(col(r, 'CADENA', 'Cadena', 'cadena') ?? '').trim() || null,
    formato:           String(col(r, 'FORMATO', 'Formato', 'formato') ?? '').trim() || null,
    precio_compra:     toNum(col(r, 'PRECIO COMPRA', 'PC', 'P COMPRA', 'precio_compra')),
    precio_comparable: toNum(col(r, 'PRECIO COMPARABLE', 'P COMPARABLE', 'COMPARABLE', 'precio_comparable')),
    precio_venta:      toNum(col(r, 'PRECIO VENTA', 'PV', 'P VENTA', 'precio_venta')),
    vigente_desde:     String(col(r, 'VIGENTE DESDE', 'FECHA', 'vigente_desde') ?? '').trim() || null,
  }
}).filter(r => r.cod_barras || r.cod_interno)

console.log(`✅  Filas válidas: ${rows.length}`)
if (rows.length === 0) {
  console.error('❌  Sin filas válidas. Verifica que las columnas coincidan.')
  process.exit(1)
}
console.log('🔍  Muestra:', JSON.stringify(rows.slice(0, 2), null, 2))

// ── Confirmar ──────────────────────────────────────────────────────────────
console.log('\n⚠️   Se borrarán TODOS los precios existentes en precios_colombia.')
console.log('    Ctrl+C para cancelar, o espera 3 segundos...')
await new Promise(r => setTimeout(r, 3000))

// ── Borrar y recargar ──────────────────────────────────────────────────────
const { error: delErr } = await supabase.from('precios_colombia').delete().neq('id', 0)
if (delErr) console.warn('⚠️   Delete:', delErr.message)

const BATCH = 500
let inserted = 0
for (let i = 0; i < rows.length; i += BATCH) {
  const { error } = await supabase.from('precios_colombia').insert(rows.slice(i, i + BATCH))
  if (error) { console.error(`\n❌  Error lote ${i}:`, error.message); process.exit(1) }
  inserted += Math.min(BATCH, rows.length - i)
  process.stdout.write(`\r⬆️   Insertando... ${inserted}/${rows.length}`)
}

console.log(`\n🎉  Importación completada: ${inserted} precios en precios_colombia`)
