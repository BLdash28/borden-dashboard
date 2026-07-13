import XLSX from 'xlsx'
const wb = XLSX.readFile('C:/Users/IAN/Downloads/Sin título - Tabla simple - 12 de junio de 2026 (1).xlsx')
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
console.log(`Filas: ${rows.length.toLocaleString()}`)
console.log('Header:'); rows[0].forEach((h, i) => console.log(`  ${i}: ${h}`))
console.log('\nFila 1:'); rows[1].forEach((v, i) => console.log(`  ${i}: ${v}`))

// Index correcto basado en header
// 0:País 1:Tienda 2:Formato 3:UPC 4:Artículo 5:Año 6:WM Month 7:Mes 8:Día 9:Unidad 10:Ventas Dólares
const yearCount = {}, fmtCount = {}, paisCount = {}, monthCount = {}
let totalUSD = 0
for (let i = 1; i < rows.length; i++) {
  const r = rows[i]
  const ano = String(r[5]).trim()
  const fmt = String(r[2]).trim()
  const pais = String(r[0]).trim()
  const mes = String(r[7] ?? '').trim()
  totalUSD += Number(r[10]) || 0
  yearCount[ano] = (yearCount[ano] ?? 0) + 1
  fmtCount[fmt] = (fmtCount[fmt] ?? 0) + 1
  paisCount[pais] = (paisCount[pais] ?? 0) + 1
  monthCount[`${ano}/${mes}`] = (monthCount[`${ano}/${mes}`] ?? 0) + 1
}
console.log('\nAño:', yearCount)
console.log('\nPaís:', paisCount)
console.log('\nFormato:', fmtCount)
console.log(`\nTotal USD: $${totalUSD.toLocaleString('en-US', {maximumFractionDigits:2})}`)
console.log('\nMes/año:')
for (const k of Object.keys(monthCount).sort()) console.log(`  ${k}: ${monthCount[k]}`)
