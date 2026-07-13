import { readFileSync } from 'fs'
const path = 'C:/Users/IAN/Downloads/SELL_OUT_Diario_crosstab (4).csv'
const buf = readFileSync(path)
// UTF-16 LE
const text = buf.toString('utf16le').replace(/^﻿/, '')
const lines = text.split(/\r?\n/)
console.log(`Líneas: ${lines.length.toLocaleString()}`)
console.log('\nHeader:', lines[0].split('\t'))
console.log('\nPrimeras 3 filas:')
for (let i = 1; i <= 3 && i < lines.length; i++) {
  const cols = lines[i].split('\t')
  console.log(`  ${i}:`, cols)
}

// Stats
const years = {}
const tiendas = new Set()
let totalUSD = 0, totalUnd = 0
for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split('\t')
  if (cols.length < 8) continue
  const yr = cols[5]?.trim()
  years[yr] = (years[yr] ?? 0) + 1
  tiendas.add(cols[1]?.trim())
}
console.log('\nAños:', years)
console.log(`Tiendas únicas: ${tiendas.size}`)
console.log(`Primeras 5 tiendas:`, [...tiendas].slice(0, 5))
