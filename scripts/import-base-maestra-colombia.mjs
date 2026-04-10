// scripts/import-base-maestra-colombia.mjs
// Uso: node scripts/import-base-maestra-colombia.mjs [archivo.xlsx]
//
// Columnas esperadas (BASE MAESTRA BORDEN COLOMBIA):
//   CLIENTE, CADENA, SUBCADENA, FORMATO, NO TIENDA, TIENDA, EMPRESA
//   ean_point_sale, PUNTO DE VENTA, CEDI, CIUDAD DEP
//   Ean Producto, PLU, COD. CENTURION, PRODUCTO CENTURION, Producto

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
const defaultFiles = [
  'BASE MAESTRA BORDEN COLOMBIA.xlsx',
  'BASE_MAESTRA_BORDEN_COLOMBIA.xlsx',
  'base_maestra_borden_colombia.xlsx',
  'BASE MAESTRA COLOMBIA.xlsx',
]
let filePath = process.argv[2] ? join(rootDir, process.argv[2]) : null
if (!filePath) {
  for (const name of defaultFiles) {
    const c = join(rootDir, name)
    if (existsSync(c)) { filePath = c; break }
  }
}
if (!filePath || !existsSync(filePath)) {
  console.error('❌  No se encontró el archivo Excel.')
  defaultFiles.forEach(n => console.error('    -', n))
  console.error('    O pasa la ruta: node scripts/import-base-maestra-colombia.mjs MiArchivo.xlsx')
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

function str(val) {
  return String(val ?? '').trim()
}

function normalizeEan(raw) {
  const s = String(raw ?? '').replace(/\D/g, '')
  if (!s || s.length < 2) return String(raw ?? '').trim()
  return s.length >= 13 ? s.slice(0, 13) : s.padStart(13, '0')
}

function splitCiudadDep(val) {
  // "BOGOTA, CUNDINAMARCA" → { ciudad: 'BOGOTA', departamento: 'CUNDINAMARCA' }
  const s = str(val)
  const comma = s.indexOf(',')
  if (comma === -1) return { ciudad: s, departamento: '' }
  return {
    ciudad:       s.substring(0, comma).trim(),
    departamento: s.substring(comma + 1).trim(),
  }
}

// ── Mapeo de filas ─────────────────────────────────────────────────────────
const rows = raw.map(r => {
  const ciudadDep = splitCiudadDep(col(r, 'CIUDAD, DEP', 'CIUDAD DEP', 'CIUDAD,DEP', 'CIUDAD/DEP', 'CIUDAD', 'ciudad_dep'))
  const rawEan    = str(col(r, 'Ean Producto', 'EAN PRODUCTO', 'EAN', 'ean_producto'))
  const rawEanPdv = str(col(r, 'ean_point_sale', 'EAN PUNTO VENTA', 'ean_punto_venta', 'EAN PDV'))

  return {
    cliente:            str(col(r, 'CLIENTE', 'Cliente', 'cliente')) || null,
    cadena:             str(col(r, 'CADENA', 'Cadena', 'cadena')) || null,
    subcadena:          str(col(r, 'SUBCADENA', 'Subcadena', 'subcadena')) || null,
    formato:            str(col(r, 'FORMATO', 'Formato', 'formato')) || null,
    no_tienda:          str(col(r, 'NO TIENDA', 'No Tienda', 'NO_TIENDA', 'no_tienda')) || null,
    tienda:             str(col(r, 'TIENDA', 'Tienda', 'tienda')) || null,
    empresa:            str(col(r, 'EMPRESA', 'Empresa', 'empresa')) || null,
    ean_punto_venta:    rawEanPdv ? normalizeEan(rawEanPdv) : null,
    punto_venta:        str(col(r, 'PUNTO DE VENTA', 'Punto de Venta', 'PUNTO VENTA', 'punto_venta')) || null,
    cedi:               str(col(r, 'CEDI', 'Cedi', 'cedi')) || null,
    ciudad:             ciudadDep.ciudad || null,
    departamento:       ciudadDep.departamento || null,
    ean_producto:       rawEan ? normalizeEan(rawEan) : null,
    plu:                str(col(r, 'PLU', 'Plu', 'plu')) || null,
    cod_centurion:      str(col(r, 'COD. CENTURION', 'COD CENTURION', 'cod_centurion')) || null,
    producto_centurion: str(col(r, 'PRODUCTO CENTURION', 'producto_centurion')) || null,
    producto:           str(col(r, 'Producto', 'PRODUCTO', 'producto')) || null,
  }
}).filter(r => r.ean_producto || r.plu || r.punto_venta)

console.log(`✅  Filas válidas: ${rows.length}`)
if (rows.length === 0) {
  console.error('❌  Sin filas válidas. Verifica que las columnas coincidan.')
  process.exit(1)
}
console.log('🔍  Muestra:', JSON.stringify(rows.slice(0, 2), null, 2))

// ── Confirmar ──────────────────────────────────────────────────────────────
console.log('\n⚠️   Se borrarán TODOS los registros existentes en base_maestra_colombia.')
console.log('    Ctrl+C para cancelar, o espera 3 segundos...')
await new Promise(r => setTimeout(r, 3000))

// ── Borrar y recargar ──────────────────────────────────────────────────────
const { error: delErr } = await supabase.from('base_maestra_colombia').delete().neq('id', 0)
if (delErr) console.warn('⚠️   Delete:', delErr.message)

const BATCH = 500
let inserted = 0
for (let i = 0; i < rows.length; i += BATCH) {
  const { error } = await supabase.from('base_maestra_colombia').insert(rows.slice(i, i + BATCH))
  if (error) { console.error(`\n❌  Error lote ${i}:`, error.message); process.exit(1) }
  inserted += Math.min(BATCH, rows.length - i)
  process.stdout.write(`\r⬆️   Insertando... ${inserted}/${rows.length}`)
}

console.log(`\n🎉  Importación completada: ${inserted} registros en base_maestra_colombia`)
