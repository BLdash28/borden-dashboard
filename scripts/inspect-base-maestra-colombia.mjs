// scripts/inspect-base-maestra-colombia.mjs
// Uso: node scripts/inspect-base-maestra-colombia.mjs [archivo.xlsx]
// Solo inspecciona — no escribe nada en la base de datos.

import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import XLSX from 'xlsx'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir   = join(__dirname, '..')

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
  console.error('❌  No se encontró el archivo.')
  console.error('    Nombres buscados en la raíz del proyecto:')
  defaultFiles.forEach(n => console.error('    -', n))
  console.error('    O pasa la ruta: node scripts/inspect-base-maestra-colombia.mjs MiArchivo.xlsx')
  process.exit(1)
}

console.log('📂  Archivo:', filePath)
const wb = XLSX.readFile(filePath)
console.log('📋  Hojas:', wb.SheetNames.join(', '))

for (const sheetName of wb.SheetNames) {
  const ws  = wb.Sheets[sheetName]
  const raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
  if (raw.length === 0) { console.log(`\n⚠️   Hoja "${sheetName}" está vacía.`); continue }

  console.log(`\n══════════════════════════════════════`)
  console.log(`📊  Hoja: "${sheetName}"  (${raw.length} filas)`)
  console.log(`📌  Columnas (${Object.keys(raw[0]).length}):`)
  Object.keys(raw[0]).forEach((col, i) => {
    const sample = raw.slice(0, 5).map(r => r[col]).filter(v => v !== '').slice(0, 3).join(' | ')
    console.log(`    ${String(i + 1).padStart(2)}. "${col}"  →  ${sample || '(vacío)'}`)
  })

  console.log(`\n🔍  Primeras 3 filas:`)
  raw.slice(0, 3).forEach((r, i) => console.log(`  [${i + 1}]`, JSON.stringify(r).slice(0, 200)))
}
