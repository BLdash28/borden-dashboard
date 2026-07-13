/**
 * check-widget12-fechas.mjs — inspecciona qué años/meses están en el archivo
 */
import { createReadStream } from 'fs'
import { createInterface } from 'readline'

const inputPath = 'C:/Users/IAN/Downloads/widget (12).csv'
const rl = createInterface({ input: createReadStream(inputPath, 'utf8'), crlfDelay: Infinity })

let headers = null, fechaIdx = -1, marcaIdx = -1
const porAnoMes = new Map()      // todas las filas
const porAnoMesBorden = new Map() // solo Borden
let total = 0, bordenTotal = 0

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

for await (const lineRaw of rl) {
  const line = lineRaw.replace(/^﻿/, '')
  if (!line.trim()) continue
  if (!headers) {
    headers = parseCsv(line).map(h => h.trim())
    fechaIdx = headers.indexOf('Fecha')
    marcaIdx = headers.indexOf('Marca')
    continue
  }
  total++
  const r = parseCsv(line)
  const [a, m] = (r[fechaIdx] ?? '').split('-')
  const key = `${a}-${m}`
  porAnoMes.set(key, (porAnoMes.get(key) ?? 0) + 1)
  if ((r[marcaIdx] ?? '').trim().toUpperCase() === 'BORDEN') {
    bordenTotal++
    porAnoMesBorden.set(key, (porAnoMesBorden.get(key) ?? 0) + 1)
  }
  if (total % 500000 === 0) process.stdout.write(`\r  ${total.toLocaleString()}`)
}

console.log(`\n📂 Total filas: ${total.toLocaleString()} · Borden: ${bordenTotal.toLocaleString()}\n`)

console.log('=== TODAS LAS MARCAS — filas por año-mes ===')
const all = [...porAnoMes.entries()].sort()
for (const [k, n] of all) console.log(`  ${k}: ${n.toLocaleString()}`)

console.log('\n=== SOLO BORDEN — filas por año-mes ===')
const bo = [...porAnoMesBorden.entries()].sort()
for (const [k, n] of bo) console.log(`  ${k}: ${n.toLocaleString()}`)
