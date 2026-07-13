/**
 * eans-sin-match.mjs
 * Identifica los EANs Borden de los 4 archivos que NO matchearon con dim_producto.
 */
import pg from 'pg'
import { readFileSync, createReadStream, writeFileSync } from 'fs'
import { createInterface } from 'readline'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = readFileSync(join(__dirname, '../.env.local'), 'utf8')
for (const raw of env.split(/\r?\n/)) {
  const line = raw.trim()
  if (!line || line.startsWith('#')) continue
  const eq = line.indexOf('=')
  if (eq < 0) continue
  process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
}
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const dimRes = await pool.query(`
  SELECT sku, codigo_barras, descripcion FROM dim_producto WHERE codigo_barras IS NOT NULL
`)
const dimByPrefix = new Map()
for (const p of dimRes.rows) {
  const bc = String(p.codigo_barras).trim()
  for (let len = bc.length - 1; len >= Math.max(8, bc.length - 3); len--) {
    dimByPrefix.set(bc.slice(0, len), p)
  }
  dimByPrefix.set(bc, p)
}
const lookupProducto = (code) => {
  const norm = String(code).trim().replace(/^0+/, '')
  for (let len = norm.length; len >= 8; len--) {
    const p = dimByPrefix.get(norm.slice(0, len))
    if (p) return p
  }
  return null
}

// EAN → { count, sources:Set, sampleDesc }
const noMatch = new Map()
const addNoMatch = (ean, source, desc) => {
  if (!ean) return
  const k = ean.trim()
  if (!k) return
  const e = noMatch.get(k) ?? { count: 0, sources: new Set(), sampleDesc: '' }
  e.count++
  e.sources.add(source)
  if (!e.sampleDesc && desc) e.sampleDesc = desc.trim()
  noMatch.set(k, e)
}

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

async function checkWidget(path, years, label) {
  console.log(`📂 ${path}`)
  const rl = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity })
  let headers = null, COL = null
  for await (const lineRaw of rl) {
    const line = lineRaw.replace(/^﻿/, '')
    if (!line.trim()) continue
    if (!headers) {
      headers = parseCsv(line).map(h => h.trim())
      const idx = Object.fromEntries(headers.map((h, i) => [h, i]))
      COL = {
        fecha: idx['Fecha'], marca: idx['Marca'],
        barcode: idx['Codigo Barra'], desc: idx['Descripción Larga'],
      }
      continue
    }
    const r = parseCsv(line)
    if ((r[COL.marca] ?? '').trim().toUpperCase() !== 'BORDEN') continue
    const ano = parseInt((r[COL.fecha] ?? '').slice(0, 4))
    if (!years.includes(ano)) continue
    const bc = (r[COL.barcode] ?? '').trim()
    if (!lookupProducto(bc)) addNoMatch(bc, label, r[COL.desc])
  }
}

async function checkSv(path) {
  console.log(`📂 ${path}`)
  const buf = readFileSync(path)
  const text = (buf[0] === 0xFF && buf[1] === 0xFE) ? buf.slice(2).toString('utf16le') : buf.toString('utf8')
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  const headers = lines[0].split('\t').map(h => h.trim())
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]))
  const bcIdx = idx['Codigo Barra'], prodIdx = idx['Producto']
  for (let i = 1; i < lines.length; i++) {
    const r = lines[i].split('\t')
    const prod = (r[prodIdx] ?? '').toUpperCase()
    if (!prod.includes('BORDEN')) continue
    const bc = (r[bcIdx] ?? '').trim()
    if (!lookupProducto(bc)) addNoMatch(bc, 'SV-UNISUPER', r[prodIdx])
  }
}

async function checkWalmart(path) {
  console.log(`📂 ${path}`)
  const rl = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity })
  let buf = ''
  for await (const line of rl) {
    if (line.startsWith('<row r="')) { buf = line + ' '; continue }
    buf += line + ' '
    if (!line.includes('</row>')) continue
    const vals = []
    const re = /<c r="([A-Z]+)\d+"[^>]*>(?:<v>([^<]*)<\/v>|<is><t>([^<]*)<\/t><\/is>)?<\/c>/g
    let m
    while ((m = re.exec(buf))) {
      const colLetter = m[1]
      const colIdx = colLetter.length === 1 ? colLetter.charCodeAt(0) - 65
        : (colLetter.charCodeAt(0) - 64) * 26 + (colLetter.charCodeAt(1) - 65)
      vals[colIdx] = m[2] ?? m[3] ?? ''
    }
    buf = ''
    if (vals.length < 14) continue
    const [country, , upc, signingDesc, , brandDesc] = vals
    if ((brandDesc ?? '').trim().toUpperCase() !== 'BORDEN') continue
    const bc = (upc ?? '').trim()
    if (!lookupProducto(bc)) addNoMatch(bc, `WM-${country?.trim()}`, signingDesc)
  }
}

await checkWidget('C:/Users/IAN/Downloads/widget (12).csv', [2024], 'GT-UNI(24)')
await checkWidget('C:/Users/IAN/Downloads/widget (13).csv', [2025, 2026], 'GT-UNI(25-26)')
await checkSv('C:/Users/IAN/Downloads/SELL_OUT_Diario_crosstab (2).csv')
await checkWalmart('C:/Users/IAN/AppData/Local/Temp/wm_xls/xl/worksheets/sheet1.xml')

const arr = [...noMatch.entries()].map(([ean, v]) => ({
  ean,
  filas: v.count,
  fuentes: [...v.sources].join('; '),
  descripcion_sample: v.sampleDesc,
})).sort((a, b) => b.filas - a.filas)

console.log(`\n📊 ${arr.length} EANs únicos sin match (de ${arr.reduce((s, x) => s + x.filas, 0).toLocaleString()} filas)\n`)
console.log('EAN              Filas    Fuentes                     Descripción')
console.log('────────────────────────────────────────────────────────────────────────────')
for (const r of arr) {
  console.log(`${r.ean.padEnd(15)} ${String(r.filas).padStart(6)}   ${r.fuentes.padEnd(28)} ${(r.descripcion_sample ?? '').slice(0, 50)}`)
}

// CSV
const csv = ['ean,filas,fuentes,descripcion_sample',
  ...arr.map(r => `${r.ean},${r.filas},"${r.fuentes}","${(r.descripcion_sample ?? '').replace(/"/g, '""')}"`)
].join('\n')
writeFileSync('C:/Users/IAN/Downloads/EANS_SIN_MATCH.csv', csv, 'utf8')
console.log(`\n📄 C:/Users/IAN/Downloads/EANS_SIN_MATCH.csv`)

await pool.end()
