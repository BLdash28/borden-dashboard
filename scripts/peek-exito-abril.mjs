import XLSX from 'xlsx'
const PATH = 'C:/Users/IAN/Downloads/SELL OUT BORDEN COLOMBIA DEL 01 AL 30-04-26.xlsx'
const wb = XLSX.readFile(PATH)
console.log('Hojas:', wb.SheetNames)
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
console.log(`\nFilas: ${rows.length.toLocaleString()}`)
console.log('\nHeader:'); rows[0].forEach((h, i) => console.log(`  ${i}: ${h}`))
console.log('\nFila 1:'); rows[1].forEach((v, i) => console.log(`  ${i}: ${v}`))

// stats
const yrs={}, meses={}, cadenas={}
let total=0
for (let i=1; i<rows.length; i++) {
  const r = rows[i]; if (!r||!r.length) continue
  const ano = r[10], mes = r[11]
  yrs[ano] = (yrs[ano] ?? 0) + 1
  meses[`${ano}/${String(mes).padStart(2,'0')}`] = (meses[`${ano}/${String(mes).padStart(2,'0')}`] ?? 0) + 1
  cadenas[r[2]] = (cadenas[r[2]] ?? 0) + 1
  total += Number(r[14]) || 0
}
console.log('\nAños:', yrs)
console.log('Meses:'); for (const k of Object.keys(meses).sort()) console.log(`  ${k}: ${meses[k].toLocaleString()}`)
console.log('Cadenas:', cadenas)
console.log(`Total COP: ${total.toLocaleString('es-CO')}`)
