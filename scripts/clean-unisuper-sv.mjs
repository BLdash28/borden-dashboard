/**
 * clean-unisuper-sv.mjs
 * Procesa SELL_OUT_Diario_crosstab (2).csv (Unisuper SV, UTF-16, tabs).
 * Filtra Borden y exporta al formato standard.
 * Output: C:/Users/IAN/Downloads/SELLOUT_UNISUPER_SV_BORDEN.xlsx
 */
import XLSX from 'xlsx'
import { readFileSync } from 'fs'

const inputPath = 'C:/Users/IAN/Downloads/SELL_OUT_Diario_crosstab (2).csv'
const outputPath = 'C:/Users/IAN/Downloads/SELLOUT_UNISUPER_SV_BORDEN.xlsx'

// ── Leer UTF-16 LE (con BOM) ─────────────────────────────────────────────
const buf = readFileSync(inputPath)
let text
if (buf[0] === 0xFF && buf[1] === 0xFE) {
  text = buf.slice(2).toString('utf16le')
} else if (buf[0] === 0xFE && buf[1] === 0xFF) {
  // UTF-16 BE — convertir
  const swapped = Buffer.alloc(buf.length - 2)
  for (let i = 2; i < buf.length; i += 2) {
    swapped[i - 2] = buf[i + 1]
    swapped[i - 1] = buf[i]
  }
  text = swapped.toString('utf16le')
} else {
  text = buf.toString('utf8')
}

const lines = text.split(/\r?\n/).filter(l => l.trim())
console.log(`📂 ${lines.length} líneas leídas`)

const headers = lines[0].split('\t').map(h => h.trim())
console.log('Columnas:', headers.join(' | '))

const idx = Object.fromEntries(headers.map((h, i) => [h, i]))
const COL = {
  grupo:    idx['Grupo'],
  tienda:   idx['Tienda'],
  codInt:   idx['Codigo Interno Str'],
  barcode:  idx['Codigo Barra'],
  producto: idx['Producto'],
  year:     idx['Year'],
  month:    idx['Month'],
  fecha:    idx['FECHA'],
  unidades: idx['Ventas Uni'],
  valor:    idx['Ventas Val'],
}

let total = 0, borden = 0
const outRows = []
const porAnoMes = new Map()

for (let i = 1; i < lines.length; i++) {
  const r = lines[i].split('\t')
  total++
  const producto = (r[COL.producto] ?? '').trim().toUpperCase()
  if (!producto.includes('BORDEN')) continue
  borden++

  const fecha = (r[COL.fecha] ?? '').trim()
  const [ano, mes, dia] = fecha.split('-').map(Number)
  const unidades = parseFloat(r[COL.unidades]) || 0
  const valor = parseFloat(r[COL.valor]) || 0

  outRows.push({
    pais: 'SV',
    cliente: 'UNISUPER',
    cadena: 'GIGANTE',
    formato: (r[COL.tienda] ?? '').trim(),
    categoria: (r[COL.grupo] ?? '').trim(),
    subcategoria: '',
    punto_venta: (r[COL.tienda] ?? '').trim(),
    codigo_barras: (r[COL.barcode] ?? '').trim(),
    sku: (r[COL.codInt] ?? '').trim(),
    descripcion: (r[COL.producto] ?? '').trim(),
    ano, mes, dia,
    ventas_unidades: unidades,
    ventas_valor: valor,  // SV usa USD directamente
  })

  const key = `${ano}-${String(mes).padStart(2, '0')}`
  const m = porAnoMes.get(key) ?? { ano, mes, ventas_unidades: 0, ventas_valor: 0 }
  m.ventas_unidades += unidades
  m.ventas_valor += valor
  porAnoMes.set(key, m)
}
console.log(`\n📂 Total: ${total.toLocaleString()} · 🧀 Borden: ${borden.toLocaleString()}`)

const subtotales = [...porAnoMes.values()]
  .sort((a, b) => a.ano - b.ano || a.mes - b.mes)
  .map(m => ({
    ano: m.ano, mes: m.mes,
    ventas_unidades: Math.round(m.ventas_unidades),
    ventas_valor_usd: Math.round(m.ventas_valor * 100) / 100,
  }))

console.log('\n=== Subtotales por mes ===')
console.log('Año  | Mes | Unidades  | USD')
for (const s of subtotales) {
  console.log(`${s.ano} | ${String(s.mes).padStart(2)}  | ${String(s.ventas_unidades).padStart(8)} | $${s.ventas_valor_usd.toLocaleString().padStart(12)}`)
}

console.log('\n✍️  Escribiendo Excel...')
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(outRows), 'Detalle')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(subtotales), 'Subtotales mes')
XLSX.writeFile(wb, outputPath)
console.log(`\n📄 ${outputPath}`)
console.log(`   Detalle: ${outRows.length.toLocaleString()} filas · Subtotales: ${subtotales.length} meses`)
