import XLSX from 'xlsx'
const wb = XLSX.readFile('C:/Users/IAN/Downloads/Sin título - Tabla simple - 12 de junio de 2026.xlsx')
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

const yearCount = {}
const fmtCount = {}
const cadenaCount = {}
const paisCount = {}
let totalUSD = 0, totalUnd = 0
for (let i = 1; i < rows.length; i++) {
  const r = rows[i]
  const ano = String(r[9]).trim()
  const fmt = String(r[3]).trim()
  const cad = String(r[1]).trim()
  const pais = String(r[0]).trim()
  const usd = Number(r[15]) || 0
  const und = Number(r[13]) || 0
  yearCount[ano] = (yearCount[ano] ?? 0) + 1
  fmtCount[fmt] = (fmtCount[fmt] ?? 0) + 1
  cadenaCount[`${pais}|${cad}`] = (cadenaCount[`${pais}|${cad}`] ?? 0) + 1
  paisCount[pais] = (paisCount[pais] ?? 0) + 1
  totalUSD += usd
  totalUnd += und
}
console.log('=== Por año ==='); console.log(yearCount)
console.log('\n=== Por formato ==='); console.log(fmtCount)
console.log('\n=== Por país ==='); console.log(paisCount)
console.log('\n=== Por país|cadena ===')
for (const k of Object.keys(cadenaCount).sort()) console.log(`  ${k}: ${cadenaCount[k]}`)
console.log(`\n=== TOTAL: ${totalUnd.toLocaleString()} und · $${totalUSD.toLocaleString('en-US', {maximumFractionDigits:2})} ===`)
