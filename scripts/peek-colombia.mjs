import XLSX from 'xlsx'
const PATH = 'C:/Users/IAN/OneDrive - BL Foods Corporation SA/Documentos/BASE BORDEN COLOMBIA 2025 A 06-03-26.xlsx'
const wb = XLSX.readFile(PATH)
console.log('Hojas:', wb.SheetNames)
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  console.log(`\n=== Hoja: ${name} (${rows.length.toLocaleString()} filas) ===`)
  console.log('Header:'); if (rows[0]) rows[0].forEach((h, i) => console.log(`  ${i}: ${h}`))
  console.log('Fila 1:'); if (rows[1]) rows[1].forEach((v, i) => console.log(`  ${i}: ${v}`))
}
