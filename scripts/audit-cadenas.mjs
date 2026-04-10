// scripts/audit-cadenas.mjs
// Uso: node scripts/audit-cadenas.mjs
// Imprime todas las cadenas únicas del XLSX para validar el mapeo

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import XLSX from 'xlsx'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir   = join(__dirname, '..')
const filePath  = join(rootDir, 'INVENTARIO.xlsx')

const wb  = XLSX.readFile(filePath)
const ws  = wb.Sheets['INVENTARIO X PVP']
const raw = XLSX.utils.sheet_to_json(ws)

const porPais = {}
for (const r of raw) {
  const pais   = (r['PAIS']   || '').trim()
  const cadena = (r['CADENA'] || '').trim()
  if (!pais || !cadena) continue
  if (!porPais[pais]) porPais[pais] = new Set()
  porPais[pais].add(cadena)
}

for (const [pais, cadenas] of Object.entries(porPais).sort()) {
  console.log(`\n=== ${pais} ===`)
  for (const c of [...cadenas].sort()) {
    console.log(`  "${c}"`)
  }
}
