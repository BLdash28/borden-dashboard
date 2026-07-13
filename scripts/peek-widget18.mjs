import { readFileSync, createReadStream } from 'fs'
import { createInterface } from 'readline'

const PATH = 'C:/Users/IAN/Downloads/widget (18).csv'
const rl = createInterface({ input: createReadStream(PATH, 'utf8'), crlfDelay: Infinity })

const parseCsv = (line) => {
  const out = []; let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { inQ = !inQ; continue }
    if (c === ',' && !inQ) { out.push(cur); cur = ''; continue }
    cur += c
  }
  out.push(cur); return out
}

const cadenas = {}
const meses = {}
let n = 0, total = 0
let headers = null
let H = {}
for await (const raw of rl) {
  const line = raw.replace(/^﻿/, '')
  if (!line.trim()) continue
  if (!headers) { headers = parseCsv(line); H = Object.fromEntries(headers.map((h, i) => [h.trim(), i])); continue }
  const r = parseCsv(line)
  n++
  const cad = r[H['Cadena']]?.trim() ?? ''
  const fecha = r[H['Fecha']]?.trim() ?? ''
  const gtq = parseFloat(r[H['Venta valor sin IVA (GTQ)']]) || 0
  cadenas[cad] = (cadenas[cad] ?? 0) + 1
  if (fecha.length >= 7) meses[fecha.slice(0, 7)] = (meses[fecha.slice(0, 7)] ?? 0) + 1
  total += gtq
}
console.log(`Filas: ${n.toLocaleString()}`)
console.log('\nCadenas:'); for (const k of Object.keys(cadenas).sort()) console.log(`  ${k}: ${cadenas[k].toLocaleString()}`)
console.log('\nMeses:'); for (const k of Object.keys(meses).sort()) console.log(`  ${k}: ${meses[k].toLocaleString()}`)
console.log(`\nTotal GTQ: ${total.toLocaleString('en-US', {maximumFractionDigits:0})}`)
