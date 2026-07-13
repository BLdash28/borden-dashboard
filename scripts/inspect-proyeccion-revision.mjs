import XLSX from 'xlsx'
const path = 'C:/Users/IAN/Downloads/Proyección 2026.xlsx'
const wb = XLSX.readFile(path)

const base = XLSX.utils.sheet_to_json(wb.Sheets['BASE 2026 version 2'], { defval: null })
// Solo BL FOODS por país (col TOTAL)
const byPaisBase = {}
for (const r of base) {
  if (String(r['LICENCIAMIENTO'] ?? '').trim() !== 'BL FOODS') continue
  const p = String(r['PAIS'] ?? '').trim()
  const total = Number(r['TOTAL'] ?? 0) || 0
  byPaisBase[p] = (byPaisBase[p] ?? 0) + total
}
console.log('BASE 2026 v2 · BL FOODS · por PAIS (col TOTAL):')
for (const [k,v] of Object.entries(byPaisBase).sort()) console.log(`  ${k.padEnd(6)}: ${v.toFixed(2)}`)

// Ver todas las filas de CR con BL FOODS
console.log('\n=== Detalle CR · BL FOODS ===')
for (const r of base) {
  if (String(r['PAIS'] ?? '').trim() !== 'CR') continue
  if (String(r['LICENCIAMIENTO'] ?? '').trim() !== 'BL FOODS') continue
  console.log(`  cliente=${r['CLIENTE']} cat=${r['CATEGORIA']} baseline=${r['BASELINE']} tipo=${r['TIPO']} TOTAL=${r['TOTAL']}`)
}

console.log('\n=== Detalle GT · BL FOODS ===')
for (const r of base) {
  if (String(r['PAIS'] ?? '').trim() !== 'GT') continue
  if (String(r['LICENCIAMIENTO'] ?? '').trim() !== 'BL FOODS') continue
  console.log(`  cliente=${r['CLIENTE']} cat=${r['CATEGORIA']} baseline=${r['BASELINE']} tipo=${r['TIPO']} TOTAL=${r['TOTAL']}`)
}

console.log('\n=== Detalle SV · BL FOODS ===')
for (const r of base) {
  if (String(r['PAIS'] ?? '').trim() !== 'SV') continue
  if (String(r['LICENCIAMIENTO'] ?? '').trim() !== 'BL FOODS') continue
  console.log(`  cliente=${r['CLIENTE']} cat=${r['CATEGORIA']} baseline=${r['BASELINE']} tipo=${r['TIPO']} TOTAL=${r['TOTAL']}`)
}
