import XLSX from 'xlsx'
const path = 'C:/Users/IAN/Downloads/Sin título - Tabla simple - 12 de junio de 2026.xlsx'
const wb = XLSX.readFile(path)
console.log('Hojas:', wb.SheetNames)
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
console.log(`Filas totales: ${rows.length}`)
console.log('\nPrimeras 8 filas:')
for (let i = 0; i < Math.min(8, rows.length); i++) {
  console.log(`${i}:`, rows[i].slice(0, 25))
}
console.log('\nÚltimas 3 filas:')
for (let i = Math.max(0, rows.length - 3); i < rows.length; i++) {
  console.log(`${i}:`, rows[i].slice(0, 25))
}
