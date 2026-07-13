import XLSX from 'xlsx'
const files = [
  'C:/Users/IAN/Downloads/cn6t2em_111126767_F8AC0694XC24CX4F07XBF64XE6D4ED965CEF.xls',
  'C:/Users/IAN/Downloads/cn6t2em_111126773_9B7431B3XE64CX4BB9X963EX88831E8340FE.xls',
]
for (const f of files) {
  console.log(`\n=== ${f.split('/').pop()} ===`)
  try {
    const wb = XLSX.readFile(f)
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    console.log(`Hojas: ${wb.SheetNames}`)
    console.log(`Filas: ${rows.length}`)
    for (let i = 0; i < Math.min(35, rows.length); i++) {
      console.log(`${i}: ${rows[i].slice(0, 18).join(' | ')}`)
    }
  } catch (e) {
    console.log(`Error: ${e.message}`)
  }
}
