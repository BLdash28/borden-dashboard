import XLSX from 'xlsx'
const wb = XLSX.readFile('C:/Users/IAN/Downloads/skuxpdvcr.xlsx')

// TIENDAS full detail
const rows = XLSX.utils.sheet_to_json(wb.Sheets['TIENDAS'], { defval: null })
console.log('TIENDAS:', rows.length, 'filas')
console.log('Cols:', Object.keys(rows[0]))
console.log('\nFila 1 completa:', JSON.stringify(rows[0], null, 2))
console.log('\nFila 2:', JSON.stringify(rows[1], null, 2))

// Distintos
const items = new Set(rows.map(r => r.ITEM))
const tiendas = new Set(rows.map(r => r.TIENDA))
const formatos = new Set(rows.map(r => r.FORMATO).filter(Boolean))
const ciudades = new Set(rows.map(r => r.CIUDAD).filter(Boolean))
const mbm = new Set(rows.map(r => r.MBM).filter(Boolean))
console.log('\n== Cardinalidades ==')
console.log('ITEMS:', items.size)
console.log('TIENDAS:', tiendas.size)
console.log('FORMATOS:', [...formatos])
console.log('CIUDADES top 5:', [...ciudades].slice(0, 5))
console.log('MBM valores:', [...mbm])
