import XLSX from 'xlsx'

const path = 'C:/Users/IAN/Downloads/cn6t2em_111125766_2B1B5DA6XCBC1X4186X8642X7D6E5EAB0091.xls'
const wb = XLSX.readFile(path, { cellDates: false, raw: true, dense: true })
console.log('Hojas:', wb.SheetNames)
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: true })
console.log(`Total filas: ${rows.length}`)
console.log('\n=== Primeras 35 filas ===')
for (let i = 0; i < Math.min(35, rows.length); i++) {
  console.log(`${i}: ${rows[i].slice(0, 12).join(' | ')}`)
}
