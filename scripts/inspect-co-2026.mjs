import XLSX from 'xlsx'
const path = 'C:/Users/IAN/OneDrive - BL Foods Corporation SA/BASE_COLOMBIA_Sellout_2026CORREGIDO.xlsx'
const wb = XLSX.readFile(path)
console.log('Sheets:', wb.SheetNames)
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name]
  if (!ws) { console.log(name, 'NO EXISTE'); continue }
  const ref = ws['!ref']
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null })
  console.log(`\n=== ${name} ===`)
  console.log('  Rango:', ref, ' → filas parsed:', rows.length)
  if (rows.length > 0) {
    console.log('  Cols:', Object.keys(rows[0]).slice(0, 15))
    const yk = Object.keys(rows[0]).find(k => /a[ñn]o/i.test(k))
    if (yk) {
      const yrs = [...new Set(rows.map(r => r[yk]))].filter(Boolean).sort()
      for (const y of yrs) console.log(`  ${y}: ${rows.filter(r => r[yk] === y).length} filas`)
    }
  }
}
