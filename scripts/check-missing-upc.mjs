import XLSX from 'xlsx'
const wb = XLSX.readFile('C:/Users/IAN/Downloads/Sin título - Tabla simple - 12 de junio de 2026.xlsx')
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
let n = 0, usd = 0, und = 0
for (let i = 1; i < rows.length; i++) {
  if (String(rows[i][4]).trim() === '5300003502') {
    n++
    usd += Number(rows[i][15]) || 0
    und += Number(rows[i][13]) || 0
  }
}
console.log(`UPC 5300003502: ${n} filas · ${und} und · $${usd.toFixed(2)}`)
