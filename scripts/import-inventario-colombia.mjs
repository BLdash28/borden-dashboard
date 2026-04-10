// scripts/import-inventario-colombia.mjs
// Uso: node scripts/import-inventario-colombia.mjs [archivo.xlsx]
//
// Lee el Excel de inventario Colombia e inserta los registros
// en la tabla inventario_colombia de Supabase.
//
// Columnas esperadas en el Excel:
//   Año | Mes | Dia | ean_point_sale | Punto de Venta | Marca |
//   Código Interno (PLU) | Ean Producto | Producto | Inventario (Q) | Inventario (COP)

import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'

// ── Cargar .env.local ──────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir   = join(__dirname, '..')
const envPath   = join(rootDir, '.env.local')

const envContent = readFileSync(envPath, 'utf8')
const envVars = {}
for (const line of envContent.split(/\r?\n/)) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx === -1) continue
  envVars[trimmed.substring(0, eqIdx).trim()] = trimmed.substring(eqIdx + 1).trim()
}

const SUPABASE_URL     = envVars['NEXT_PUBLIC_SUPABASE_URL']
const SERVICE_ROLE_KEY = envVars['SUPABASE_SERVICE_ROLE_KEY']

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌  Variables NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no encontradas en .env.local')
  process.exit(1)
}

console.log('✅  Supabase URL:', SUPABASE_URL.substring(0, 40) + '...')
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// ── Archivo Excel ──────────────────────────────────────────────────────────
// Acepta nombre de archivo como argumento o busca el default
const defaultFiles = ['INVENTARIO_COLOMBIA.xlsx', 'INVENTARIO_CO.xlsx', 'inventario_colombia.xlsx']
let filePath = process.argv[2] ? join(rootDir, process.argv[2]) : null

if (!filePath) {
  for (const name of defaultFiles) {
    const candidate = join(rootDir, name)
    if (existsSync(candidate)) { filePath = candidate; break }
  }
}

if (!filePath || !existsSync(filePath)) {
  console.error('❌  No se encontró el archivo Excel.')
  console.error('    Coloca el archivo en la raíz del proyecto con uno de estos nombres:')
  defaultFiles.forEach(n => console.error('    -', n))
  console.error('    O pasa la ruta como argumento: node scripts/import-inventario-colombia.mjs MiArchivo.xlsx')
  process.exit(1)
}

console.log('📂  Leyendo:', filePath)
const wb = XLSX.readFile(filePath)

// Muestra hojas disponibles para ayudar si el nombre no coincide
console.log('📋  Hojas disponibles:', wb.SheetNames.join(', '))

// Toma la primera hoja (o ajusta el nombre si es necesario)
const sheetName = wb.SheetNames[0]
console.log('📊  Usando hoja:', sheetName)

const ws  = wb.Sheets[sheetName]
const raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
console.log(`📊  Filas leídas: ${raw.length}`)

if (raw.length === 0) {
  console.error('❌  La hoja está vacía.')
  process.exit(1)
}

// Muestra las primeras columnas para verificar el mapeo
console.log('🔍  Columnas detectadas:', Object.keys(raw[0]).join(' | '))

// ── Normalizar EAN (misma lógica que fn_ean_normalize en Neon) ─────────────
function normalizeEan(raw) {
  const s = String(raw ?? '').replace(/\D/g, '')
  if (!s || s.length < 2) return String(raw ?? '').trim()
  // EAN-13 o mayor: usar tal cual (no quitar check digit)
  // EAN-8 / UPC-A (≤12): rellenar con ceros a la izquierda
  return s.length >= 13 ? s.slice(0, 13) : s.padStart(13, '0')
}

// ── Mapeo de columnas ──────────────────────────────────────────────────────
// Intenta varios nombres posibles por si el Excel tiene variaciones
function col(row, ...names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== '') return row[name]
  }
  return ''
}

const rows = raw
  .map(r => {
    const rawEanPdv  = String(col(r, 'ean_point_sale', 'EAN PUNTO VENTA', 'EAN_POINT_SALE') ?? '').trim()
    const rawEanProd = String(col(r, 'Ean Producto', 'EAN PRODUCTO', 'EAN_PRODUCTO', 'ean_producto') ?? '').trim()
    const qty        = parseInt(col(r, 'Inventario (Q)', 'INVENTARIO (Q)', 'QTY', 'INVENTARIO Q')) || 0
    const valorCOP   = parseFloat(String(col(r, 'Inventario (COP)', 'INVENTARIO (COP)', 'VALOR COP')).replace(/[^0-9.-]/g, '')) || 0

    return {
      ano:             parseInt(col(r, 'Año', 'AÑO', 'ANO', 'Ano')) || 0,
      mes:             parseInt(col(r, 'Mes', 'MES')) || 0,
      dia:             parseInt(col(r, 'Dia', 'DIA', 'Día')) || 0,
      ean_punto_venta: rawEanPdv ? normalizeEan(rawEanPdv) : '',
      punto_venta:     String(col(r, 'Punto de Venta', 'PUNTO DE VENTA', 'PUNTO_VENTA') ?? '').trim(),
      marca:           String(col(r, 'Marca', 'MARCA') ?? '').trim(),
      codigo_interno:  String(col(r, 'Código Interno (PLU)', 'CODIGO INTERNO (PLU)', 'PLU', 'CODIGO_INTERNO') ?? '').trim(),
      ean_producto:    rawEanProd ? normalizeEan(rawEanProd) : '',
      descripcion:     String(col(r, 'Producto', 'PRODUCTO', 'DESCRIPCION') ?? '').trim(),
      qty,
      valor_cop:       valorCOP,
    }
  })
  .filter(r => r.ano > 0 && r.mes > 0 && r.ean_producto && r.descripcion)

console.log(`✅  Filas válidas: ${rows.length}`)

if (rows.length === 0) {
  console.error('❌  Sin filas válidas. Verifica que las columnas coincidan con las esperadas.')
  process.exit(1)
}

// Muestra muestra de los primeros 2 registros
console.log('🔍  Muestra:', JSON.stringify(rows.slice(0, 2), null, 2))

// ── Cargar catálogo maestro Colombia desde Supabase ───────────────────────
console.log('\n📦  Cargando dim_producto_colombia...')
const { data: dimProds, error: dimErr } = await supabase
  .from('dim_producto_colombia')
  .select('cod_barras, cod_interno, categoria, subcategoria, descripcion')

if (dimErr) {
  console.warn('⚠️   No se pudo cargar dim_producto_colombia:', dimErr.message)
}

// Mapa barcode → producto maestro
const dimMap = {}
for (const p of (dimProds || [])) {
  if (p.cod_barras) dimMap[p.cod_barras.trim()] = p
  if (p.cod_interno) dimMap[p.cod_interno.trim().toUpperCase()] = p
}
console.log(`✅  ${Object.keys(dimMap).length / 2} productos en catálogo maestro`)

// ── Enriquecer filas con catálogo maestro ─────────────────────────────────
for (const r of rows) {
  const master = dimMap[r.ean_producto] || dimMap[(r.codigo_interno || '').toUpperCase()]
  if (master) {
    if (!r.descripcion || r.descripcion.trim() === '') r.descripcion = master.descripcion
  }
}

// ── Confirmar antes de borrar ──────────────────────────────────────────────
console.log('\n⚠️   Se borrarán TODOS los datos existentes en inventario_colombia.')
console.log('    Presiona Ctrl+C para cancelar o espera 3 segundos para continuar...')
await new Promise(r => setTimeout(r, 3000))

// ── Borrar datos anteriores ────────────────────────────────────────────────
console.log('🗑️   Borrando datos anteriores...')
const { error: delErr } = await supabase
  .from('inventario_colombia')
  .delete()
  .neq('id', 0)

if (delErr) {
  console.warn('⚠️   Delete:', delErr.message)
}

// ── Insertar en lotes de 500 ───────────────────────────────────────────────
const BATCH = 500
let inserted = 0

for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH)
  const { error } = await supabase.from('inventario_colombia').insert(batch)
  if (error) {
    console.error(`\n❌  Error en lote ${i}–${i + BATCH}:`, error.message)
    process.exit(1)
  }
  inserted += batch.length
  process.stdout.write(`\r⬆️   Insertando... ${inserted}/${rows.length}`)
}

console.log(`\n🎉  Importación completada: ${inserted} registros en inventario_colombia`)
