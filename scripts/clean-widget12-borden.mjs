/**
 * clean-widget12-borden.mjs
 * Streaming: filtra Borden de widget(12).csv (345MB, 1.7M filas) y exporta
 * a Excel con formato pais/cliente/cadena/.../ventas_valor (USD via tasa 2025).
 */
import XLSX from 'xlsx'
import { createReadStream } from 'fs'
import { createInterface } from 'readline'

const inputPath = 'C:/Users/IAN/Downloads/widget (12).csv'
const outputPath = 'C:/Users/IAN/Downloads/SELLOUT_UNISUPER_BORDEN_2025.xlsx'

const TASA_2025 = {
  1: 7.74168, 2: 7.73202, 3: 7.72541, 4: 7.72052, 5: 7.69294, 6: 7.70225,
  7: 7.69160, 8: 7.67828, 9: 7.67520, 10: 7.67560, 11: 7.67520, 12: 7.67623,
}

const parseCsv = (line) => {
  const out = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { inQ = !inQ; continue }
    if (c === ',' && !inQ) { out.push(cur); cur = ''; continue }
    cur += c
  }
  out.push(cur)
  return out
}

const rl = createInterface({ input: createReadStream(inputPath, 'utf8'), crlfDelay: Infinity })

let headers = null, COL = null
const outRows = []
let total = 0, borden = 0

for await (const lineRaw of rl) {
  const line = lineRaw.replace(/^﻿/, '')
  if (!line.trim()) continue
  if (!headers) {
    headers = parseCsv(line).map(h => h.trim())
    const idx = Object.fromEntries(headers.map((h, i) => [h, i]))
    COL = {
      fecha: idx['Fecha'], cadena: idx['Cadena'], nomSuc: idx['Nombre sucursal'],
      categoria: idx['Categoría'], subcat: idx['Subcategoría'], marca: idx['Marca'],
      sku: idx['SKU'], barcode: idx['Codigo Barra'], desc: idx['Descripción Larga'],
      unidades: idx['Venta unidades'], valorGtq: idx['Venta valor sin IVA (GTQ)'],
    }
    console.log(`Columnas detectadas: ${headers.join(' | ')}`)
    continue
  }
  total++
  const r = parseCsv(line)
  if ((r[COL.marca] ?? '').trim().toUpperCase() !== 'BORDEN') continue
  borden++

  const [ano, mes, dia] = (r[COL.fecha] ?? '').split('-').map(Number)
  const valorGtq = parseFloat(r[COL.valorGtq]) || 0
  const tasa = TASA_2025[mes] ?? null
  const valorUsd = tasa ? valorGtq / tasa : null
  outRows.push({
    pais: 'GT',
    cliente: 'UNISUPER',
    cadena: r[COL.cadena],
    formato: r[COL.cadena],
    categoria: r[COL.categoria],
    subcategoria: r[COL.subcat],
    punto_venta: r[COL.nomSuc],
    codigo_barras: r[COL.barcode],
    sku: r[COL.sku],
    descripcion: r[COL.desc],
    ano, mes, dia,
    ventas_unidades: parseFloat(r[COL.unidades]) || 0,
    ventas_valor: valorUsd,
  })

  if (total % 200000 === 0) {
    process.stdout.write(`\r  Procesadas ${total.toLocaleString()} filas · Borden: ${borden.toLocaleString()}`)
  }
}
console.log(`\n📂 Total: ${total.toLocaleString()} filas · 🧀 Borden: ${borden.toLocaleString()}`)

// Subtotales por mes 2025
const porMes = new Map()
for (const r of outRows) {
  if (r.ano !== 2025) continue
  const m = porMes.get(r.mes) ?? {
    mes: r.mes, ventas_unidades: 0, ventas_valor_gtq: 0, ventas_valor_usd: 0, tasa: TASA_2025[r.mes]
  }
  m.ventas_unidades += r.ventas_unidades
  m.ventas_valor_usd += r.ventas_valor
  m.ventas_valor_gtq += r.ventas_valor * TASA_2025[r.mes]
  porMes.set(r.mes, m)
}
const subtotales = [...porMes.values()].sort((a, b) => a.mes - b.mes).map(m => ({
  ano: 2025, mes: m.mes, tasa_gtq_usd: m.tasa,
  ventas_unidades: Math.round(m.ventas_unidades),
  ventas_valor_gtq: Math.round(m.ventas_valor_gtq * 100) / 100,
  ventas_valor_usd: Math.round(m.ventas_valor_usd * 100) / 100,
}))

console.log('\n=== Subtotales 2025 ===')
console.log('Mes | Tasa    | Unidades  | GTQ              | USD')
for (const s of subtotales) {
  console.log(`${String(s.mes).padStart(2)}  | ${s.tasa_gtq_usd.toFixed(5)} | ${String(s.ventas_unidades).padStart(8)} | Q${s.ventas_valor_gtq.toLocaleString().padStart(14)} | $${s.ventas_valor_usd.toLocaleString().padStart(12)}`)
}

console.log('\n✍️  Escribiendo Excel...')
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(outRows), 'Detalle')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(subtotales), 'Subtotales mes')
XLSX.writeFile(wb, outputPath)
console.log(`\n📄 ${outputPath}`)
console.log(`   Detalle: ${outRows.length.toLocaleString()} filas | Subtotales: ${subtotales.length} meses`)
