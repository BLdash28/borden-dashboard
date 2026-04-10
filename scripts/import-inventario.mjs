// scripts/import-inventario.mjs
// Uso: node scripts/import-inventario.mjs
//
// Lee INVENTARIO.xlsx desde la raíz del proyecto e inserta
// todos los registros en la tabla inventario_pdv de Supabase.

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'

// ── Cargar .env.local ─────────────────────────────────────────
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
  const key = trimmed.substring(0, eqIdx).trim()
  const val = trimmed.substring(eqIdx + 1).trim()
  envVars[key] = val
}

const SUPABASE_URL     = envVars['NEXT_PUBLIC_SUPABASE_URL']
const SERVICE_ROLE_KEY = envVars['SUPABASE_SERVICE_ROLE_KEY']

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌  Variables no encontradas.')
  console.error('    Encontradas:', Object.keys(envVars).join(', '))
  process.exit(1)
}

console.log('✅  Supabase URL:', SUPABASE_URL.substring(0, 30) + '...')

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// ── Leer Excel ────────────────────────────────────────────────
const filePath = join(rootDir, 'INVENTARIO.xlsx')
console.log('📂  Leyendo:', filePath)

const wb  = XLSX.readFile(filePath)
const ws  = wb.Sheets['INVENTARIO X PVP']
const raw = XLSX.utils.sheet_to_json(ws)
console.log(`📊  Filas leídas: ${raw.length}`)

// ── Mapeo de códigos de cadena → nombre completo ──────────────
const CADENA_MAP = {
  'HM': 'WALMART',
  'ME': 'MAS X MENOS',
  'MI': 'MAXI PALI',
  'PI': 'PALI',
  'DF': 'DESPENSA FAMILIAR',
  'PZ': 'PAIZ',
  'LN': 'LA UNION',
  'LJ': 'DESPENSA DON JUAN',
}

function normCadena(code) {
  const upper = (code || '').trim().toUpperCase()
  return CADENA_MAP[upper] ?? (code || '').trim()
}

// ── Correcciones de cliente/cadena ────────────────────────────
// Aplica reglas sobre cliente+cadena en bruto antes de insertar
function applyCorrections(cliente, cadena) {
  const c = cliente.trim().toUpperCase()
  // SELECTOS sin cadena → cadena = SELECTOS
  if (c === 'SELECTOS' && !cadena) return { cliente: 'SELECTOS', cadena: 'SELECTOS' }
  // LA TORRE → cliente = UNISUPER, cadena = LA TORRE
  if (c === 'LA TORRE') return { cliente: 'UNISUPER', cadena: 'LA TORRE' }
  return { cliente, cadena }
}

// ── Normalización EAN (misma regla que fn_ean_normalize en Neon) ──────────
// Longitud impar → tiene check digit → se quita → LPAD 13
// Longitud par   → datos puros       → LPAD 13 directo
function normalizeBarcode(raw) {
  const s = String(raw).replace(/\D/g, '')
  if (!s || s.length < 2) return String(raw).trim()
  const base = s.length % 2 !== 0 ? s.slice(0, -1) : s
  return base.padStart(13, '0')
}

// ── Normalizar ────────────────────────────────────────────────
const rows = raw
  .map(r => {
    const rawCliente = (r['CLIENTE'] || '').trim()
    const rawCadena  = normCadena(r['CADENA'] || '')
    const { cliente, cadena } = applyCorrections(rawCliente, rawCadena)
    const rawBarcode = String(r['CODIGO DE BARRAS'] || r['CODIGO_DE_BARRAS'] || r['COD DE BARRAS'] || '').trim()
    return {
      pais:          (r['PAIS'] || '').trim(),
      cliente,
      cadena,
      categoria:     (r['CATEGORIA '] || r['CATEGORIA'] || '').trim(),
      subcategoria:  (r['SUBCATEGORIA'] || '').trim(),
      punto_venta:   (r['PUNTO DE VENTA'] || '').trim(),
      codigo_barras: rawBarcode ? normalizeBarcode(rawBarcode) : '',
      sku:           rawBarcode ? normalizeBarcode(rawBarcode) : '', // compatibilidad
      descripcion:   (r['DESCRIPCION'] || '').trim(),
      qty:           parseInt(r['QTY']) || 0,
    }
  })
  .filter(r => r.codigo_barras && r.descripcion)

console.log(`✅  Filas válidas: ${rows.length}`)

// ── Borrar datos anteriores ───────────────────────────────────
console.log('🗑️   Borrando datos anteriores...')
const { error: delErr } = await supabase
  .from('inventario_pdv')
  .delete()
  .neq('id', 0)

if (delErr) {
  // Si la tabla no existe el error es diferente; lo mostramos pero continuamos
  console.warn('⚠️   Delete:', delErr.message)
}

// ── Insertar en lotes de 500 ──────────────────────────────────
const BATCH = 500
let inserted = 0

for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH)
  const { error } = await supabase.from('inventario_pdv').insert(batch)
  if (error) {
    console.error(`\n❌  Error en lote ${i}–${i + BATCH}:`, error.message)
    process.exit(1)
  }
  inserted += batch.length
  process.stdout.write(`\r⬆️   Insertando... ${inserted}/${rows.length}`)
}

console.log(`\n🎉  Importación completada: ${inserted} registros en inventario_pdv`)
