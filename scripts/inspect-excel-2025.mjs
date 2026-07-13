import XLSX from 'xlsx'

const path = 'C:/Users/IAN/Downloads/BASE_COLOMBIA_Sellout_2026CORREGIDO.xlsx'
const wb = XLSX.readFile(path)
console.log('Sheets:', wb.SheetNames)
console.log('File mtime confirmado desde disco.')

for (const s of wb.SheetNames) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[s], { defval: null })
  console.log(`\n=== ${s} (${rows.length} filas) ===`)
  if (!rows.length) continue
  const yk = Object.keys(rows[0]).find(k => /a[ñn]o/i.test(k))
  if (yk) {
    const anos = [...new Set(rows.map(r => r[yk]))].filter(Boolean).sort()
    console.log(`Años en "${yk}":`, anos)
    for (const y of anos) {
      const c = rows.filter(r => r[yk] === y).length
      console.log(`  ${y}: ${c} filas`)
    }
  }
  // Detección de cambios en costos (para SellIn específicamente)
  const costoKeys = Object.keys(rows[0]).filter(k => /costo/i.test(k))
  if (costoKeys.length) console.log(`Columnas de costo:`, costoKeys)
}
