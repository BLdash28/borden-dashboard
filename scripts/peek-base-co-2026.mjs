import XLSX from 'xlsx'
const PATH = 'C:/Users/IAN/OneDrive - BL Foods Corporation SA/BASE_COLOMBIA_Sellout_2026.xlsx'
const wb = XLSX.readFile(PATH)
console.log('Hojas:', wb.SheetNames)
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  console.log(`\n=== ${name} (${rows.length.toLocaleString()} filas) ===`)
  console.log('Header:'); if (rows[0]) rows[0].forEach((h, i) => console.log(`  ${i}: ${h}`))
  console.log('Fila 1:'); if (rows[1]) rows[1].forEach((v, i) => console.log(`  ${i}: ${v}`))
}

const wb2 = XLSX.readFile(PATH)
const ws = wb2.Sheets[wb2.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
const yrs = {}, meses = {}, cadenas = {}
let total = 0
// Detectar cuántas columnas tiene el header para indexar
const colMes = rows[0].findIndex(h => /^\s*MES/i.test(String(h)))
const colAno = rows[0].findIndex(h => /^AÑO/i.test(String(h)))
const colVal = rows[0].findIndex(h => /VALOR/i.test(String(h)))
console.log(`\nÍndices detectados — AÑO: ${colAno}, MES: ${colMes}, VALOR: ${colVal}`)
for (let i = 1; i < rows.length; i++) {
  const r = rows[i]; if (!r||!r.length) continue
  const a = r[colAno], m = r[colMes]
  yrs[a] = (yrs[a] ?? 0) + 1
  meses[`${a}/${String(m).padStart(2,'0')}`] = (meses[`${a}/${String(m).padStart(2,'0')}`] ?? 0) + 1
  total += Number(r[colVal]) || 0
}
console.log('\nAños:', yrs)
console.log('Meses:'); for (const k of Object.keys(meses).sort()) console.log(`  ${k}: ${meses[k].toLocaleString()}`)
console.log(`Total COP: ${total.toLocaleString('es-CO')}`)
