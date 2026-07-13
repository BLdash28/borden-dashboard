/**
 * check-cadenas.mjs — extrae cadenas únicas de cada fuente y de la BD
 */
import pg from 'pg'
import { readFileSync, createReadStream } from 'fs'
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

// Widget GT (cadena column)
const gtCadenas = new Set()
const rl12 = createInterface({ input: createReadStream('C:/Users/IAN/Downloads/widget (13).csv', 'utf8'), crlfDelay: Infinity })
let h = null, cadIdx = -1, marcaIdx = -1
for await (const lineRaw of rl12) {
  const line = lineRaw.replace(/^﻿/, '')
  if (!line.trim()) continue
  if (!h) { h = parseCsv(line); cadIdx = h.indexOf('Cadena'); marcaIdx = h.indexOf('Marca'); continue }
  const r = parseCsv(line)
  if ((r[marcaIdx] ?? '').trim().toUpperCase() !== 'BORDEN') continue
  gtCadenas.add(r[cadIdx])
}

// Walmart (FinRptCode)
const wmCadenas = new Map() // code → desc sample
const rlw = createInterface({ input: createReadStream('C:/Users/IAN/AppData/Local/Temp/wm_xls/xl/worksheets/sheet1.xml', 'utf8'), crlfDelay: Infinity })
let buf = ''
for await (const line of rlw) {
  if (line.startsWith('<row r="')) { buf = line + ' '; continue }
  buf += line + ' '
  if (!line.includes('</row>')) continue
  const vals = []
  const re = /<c r="([A-Z]+)\d+"[^>]*>(?:<v>([^<]*)<\/v>|<is><t>([^<]*)<\/t><\/is>)?<\/c>/g
  let m
  while ((m = re.exec(buf))) {
    const cl = m[1]
    const ci = cl.length === 1 ? cl.charCodeAt(0) - 65 : (cl.charCodeAt(0) - 64) * 26 + (cl.charCodeAt(1) - 65)
    vals[ci] = m[2] ?? m[3] ?? ''
  }
  buf = ''
  if (vals.length < 14) continue
  const brandDesc = vals[5], country = vals[0], finRpt = vals[13], storeName = vals[12]
  if ((brandDesc ?? '').toUpperCase() !== 'BORDEN') continue
  const k = `${country}|${finRpt}`
  if (!wmCadenas.has(k)) wmCadenas.set(k, storeName)
}

console.log('=== Cadenas únicas en Unisuper GT (widget 13, Borden) ===')
for (const c of [...gtCadenas].sort()) console.log(`  "${c}"`)
console.log(`\n=== Walmart: País|FinRptCode → ejemplo de tienda ===`)
for (const [k, v] of [...wmCadenas.entries()].sort()) console.log(`  ${k}  →  ${v}`)

// DB
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
const r = await pool.query(`
  SELECT DISTINCT cadena FROM mv_sellout_mensual WHERE cadena IS NOT NULL ORDER BY cadena LIMIT 50
`)
console.log('\n=== Cadenas en mv_sellout_mensual (top 50) ===')
for (const x of r.rows) console.log(`  "${x.cadena}"`)
await pool.end()
