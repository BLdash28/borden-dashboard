import XLSX from 'xlsx'
const wb = XLSX.readFile('C:/Users/IAN/Downloads/Sin título - Tabla simple - 12 de junio de 2026 (1).xlsx')
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
console.log(`Filas: ${rows.length.toLocaleString()}`)
console.log('Header:', rows[0])

const yearCount = {}, fmtCount = {}, cadCount = {}, paisCount = {}, mesCount = {}
let totalUSD = 0
for (let i = 1; i < rows.length; i++) {
  const r = rows[i]
  const ano = String(r[9]).trim()
  const mes = String(r[11] ?? '').trim()
  const fmt = String(r[3]).trim()
  const cad = String(r[1]).trim()
  const pais = String(r[0]).trim()
  totalUSD += Number(r[15]) || 0
  yearCount[ano] = (yearCount[ano] ?? 0) + 1
  mesCount[`${ano}-${mes}`] = (mesCount[`${ano}-${mes}`] ?? 0) + 1
  fmtCount[fmt] = (fmtCount[fmt] ?? 0) + 1
  cadCount[`${pais}|${cad}`] = (cadCount[`${pais}|${cad}`] ?? 0) + 1
  paisCount[pais] = (paisCount[pais] ?? 0) + 1
}
console.log('\nAño:', yearCount)
console.log('\nMes/año:'); for (const k of Object.keys(mesCount).sort()) console.log(`  ${k}: ${mesCount[k]}`)
console.log('\nPaís:', paisCount)
console.log('\nFormato:', fmtCount)
console.log('\nPaís|Cadena:'); for (const k of Object.keys(cadCount).sort()) console.log(`  ${k}: ${cadCount[k]}`)
console.log(`\nTotal USD: $${totalUSD.toLocaleString('en-US', {maximumFractionDigits:2})}`)
