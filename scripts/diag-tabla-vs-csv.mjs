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
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
const f = (n) => Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })

// 1) Conteo en CSVs por cliente y año/mes
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

const csvStats = {}  // cliente|ano|mes -> { n, usd }
for (const y of [2024, 2025, 2026]) {
  const rl = createInterface({ input: createReadStream(`C:/Users/IAN/Downloads/SELLOUT_BORDEN_${y}_v2.csv`, 'utf8'), crlfDelay: Infinity })
  let headers = null
  for await (const raw of rl) {
    const line = raw.replace(/^﻿/, '')
    if (!line.trim()) continue
    if (!headers) { headers = parseCsv(line); continue }
    const r = parseCsv(line)
    const row = {}
    for (let i = 0; i < headers.length; i++) row[headers[i]] = r[i]
    const u = parseFloat(row.ventas_unidades) || 0
    const v = parseFloat(row.ventas_valor) || 0
    if (u === 0 && v === 0) continue
    const cli = (row.cliente ?? '').toUpperCase()
    const k = `${cli}|${row.ano}|${row.mes}`
    if (!csvStats[k]) csvStats[k] = { n: 0, usd: 0 }
    csvStats[k].n++
    csvStats[k].usd += v
  }
}

// 2) Comparar contra DB
const tabs = {
  UNISUPER: { tab: 'fact_ventas_unisuper', cond: `UPPER(marca)='BORDEN'` },
  WALMART:  { tab: 'fact_ventas_walmart',  cond: `archivo_origen='RetailLink-Borden'` },
  SELECTOS: { tab: 'fact_ventas_selectos', cond: `UPPER(marca)='BORDEN'` },
}
for (const [cli, { tab, cond }] of Object.entries(tabs)) {
  console.log(`\n=== ${cli} (${tab} WHERE ${cond}) ===`)
  console.log(`  Mes  | CSV filas/usd        | DB filas/usd        | diff`)
  const r = await pool.query(`
    SELECT EXTRACT(YEAR FROM fecha)::int AS y, EXTRACT(MONTH FROM fecha)::int AS m,
           COUNT(*) AS n, ROUND(SUM(ventas_valor)::numeric, 0) AS usd
    FROM ${tab} WHERE ${cond}
    GROUP BY 1, 2 ORDER BY 1, 2
  `)
  const dbMap = new Map()
  for (const x of r.rows) dbMap.set(`${x.y}-${x.m}`, { n: Number(x.n), usd: Number(x.usd) })
  const allKeys = new Set()
  for (const k of Object.keys(csvStats)) {
    const [c] = k.split('|')
    if (c === cli) allKeys.add(k.split('|').slice(1).join('-'))
  }
  for (const k of dbMap.keys()) allKeys.add(k)
  const sortedKeys = [...allKeys].sort()
  for (const k of sortedKeys) {
    const csv = csvStats[`${cli}|${k.replace('-', '|')}`]
    const db = dbMap.get(k)
    const csvN = csv?.n ?? 0
    const csvU = Math.round(csv?.usd ?? 0)
    const dbN = db?.n ?? 0
    const dbU = db?.usd ?? 0
    const diff = dbU - csvU
    console.log(`  ${k.padEnd(6)} | ${String(f(csvN)).padStart(7)}/$${String(f(csvU)).padStart(10)} | ${String(f(dbN)).padStart(7)}/$${String(f(dbU)).padStart(10)} | ${diff >= 0 ? '+' : ''}$${f(diff)}`)
  }
}

await pool.end()
