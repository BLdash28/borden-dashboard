// node scripts/ver-columnas-excel.mjs PRODUCTOS.xlsx
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import XLSX from 'xlsx'

const __dirname = dirname(fileURLToPath(import.meta.url))
const file = process.argv[2] ?? 'PRODUCTOS.xlsx'
const wb   = XLSX.readFile(join(__dirname, '..', file))
const ws   = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

console.log('Hoja:', wb.SheetNames[0])
console.log('Columnas:', Object.keys(rows[0]))
console.log('\nPrimera fila:')
console.log(rows[0])
console.log('\nSegunda fila:')
console.log(rows[1])
