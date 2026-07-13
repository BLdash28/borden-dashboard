import XLSX from 'xlsx'
const wb = XLSX.readFile('C:/Users/IAN/Downloads/Sin título - Tabla simple - 12 de junio de 2026.xlsx')
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

const prod = new Map()
const cats = new Set(), subs = new Set()
for (let i = 1; i < rows.length; i++) {
  const upc  = String(rows[i][4] ?? '').trim()
  const art  = String(rows[i][5] ?? '').trim()
  const cat  = String(rows[i][7] ?? '').trim()
  const sub  = String(rows[i][8] ?? '').trim()
  if (!prod.has(upc)) prod.set(upc, { art, cat, sub })
  cats.add(cat); subs.add(sub)
}

console.log('=== Categorías únicas ===')
for (const c of cats) console.log(`  "${c}"`)
console.log('\n=== Subcategorías únicas ===')
for (const s of subs) console.log(`  "${s}"`)

console.log('\n=== 38 productos (UPC | cat | sub | desc) ===')
for (const [upc, p] of [...prod.entries()].sort()) {
  console.log(`  ${upc} | ${p.cat} | ${p.sub} | ${p.art}`)
}
