/**
 * cargar-selectos-2026.mjs
 * Carga SELL_OUT_Diario_crosstab (4).csv: Selectos SV 2026 ene-jun.
 * Archivo UTF-16 LE, tab-separated. Ventas ya en USD.
 */
import pg from 'pg'
import { readFileSync } from 'fs'
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

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 })

console.log('📥 Cargando dim_producto…')
const dimRes = await pool.query(`SELECT codigo_barras, sku, descripcion, categoria, subcategoria FROM dim_producto WHERE codigo_barras IS NOT NULL`)
const dimMap = new Map()
for (const r of dimRes.rows) dimMap.set(r.codigo_barras, r)
console.log(`   ${dimMap.size} productos`)

const UPC_OVERRIDE = {
  '53000057253': '5300005275',
}
const matchDim = (raw) => {
  const stripped = raw.replace(/^0+/, '')
  if (UPC_OVERRIDE[stripped]) {
    const x = dimMap.get(UPC_OVERRIDE[stripped])
    if (x) return x
  }
  if (dimMap.has(stripped)) return dimMap.get(stripped)
  if (dimMap.has(raw)) return dimMap.get(raw)
  for (let d = 0; d <= 9; d++) {
    if (dimMap.has(stripped + String(d))) return dimMap.get(stripped + String(d))
  }
  return null
}

const PATH = 'C:/Users/IAN/Downloads/SELL_OUT_Diario_crosstab (4).csv'
console.log(`\n📂 ${PATH.split('/').pop()}`)
const buf = readFileSync(PATH)
const text = buf.toString('utf16le').replace(/^﻿/, '')
const lines = text.split(/\r?\n/)
console.log(`   ${lines.length.toLocaleString()} líneas`)

const headers = lines[0].split('\t').map(s => s.trim())
const H = Object.fromEntries(headers.map((h, i) => [h, i]))
console.log(`   Headers: ${headers.join(' | ')}`)

const rows = []
let leidas = 0, sinMatch = 0, ceros = 0
const sinUpcs = new Set()
for (let i = 1; i < lines.length; i++) {
  if (!lines[i].trim()) continue
  const c = lines[i].split('\t')
  if (c.length < 10) continue
  leidas++

  const tiendaFull = String(c[H['Tienda']] ?? '').trim()  // "0001 GIGANTE"
  const cbRaw      = String(c[H['Codigo Barra']] ?? '').trim()
  const fecha      = String(c[H['FECHA']] ?? '').trim()
  const und        = parseFloat(c[H['Ventas Uni']]) || 0
  const usd        = parseFloat(c[H['Ventas Val']]) || 0

  if (und === 0 && usd === 0) { ceros++; continue }
  if (!fecha || fecha.length < 10) continue

  const dim = matchDim(cbRaw)
  if (!dim) { sinMatch++; sinUpcs.add(cbRaw); continue }

  // Separar código y nombre de tienda
  const m = tiendaFull.match(/^(\d+)\s+(.+)$/)
  const codSuc = m ? m[1] : ''
  const nomSuc = m ? m[2].trim() : tiendaFull

  rows.push({
    fecha,
    pais: 'SV',
    cadena: 'SELECTOS',
    codigo_sucursal: codSuc,
    nombre_sucursal: nomSuc,
    categoria: dim.categoria,
    subcategoria: dim.subcategoria,
    sku: dim.sku,
    codigo_barras: dim.codigo_barras,
    descripcion: dim.descripcion,
    ventas_unidades: und,
    ventas_valor: usd,
  })
}
console.log(`\n📊 Stats:`)
console.log(`   leídas:    ${leidas.toLocaleString()}`)
console.log(`   sin match: ${sinMatch.toLocaleString()}`)
console.log(`   0/0:       ${ceros.toLocaleString()}`)
console.log(`   válidas:   ${rows.length.toLocaleString()}`)
if (sinUpcs.size) console.log(`   UPCs sin match: ${[...sinUpcs].slice(0, 10).join(', ')}`)

// Aggregate por (fecha, nombre_sucursal, codigo_barras)
const aggMap = new Map()
for (const r of rows) {
  const k = `${r.fecha}|${r.nombre_sucursal}|${r.codigo_barras}`
  const prev = aggMap.get(k)
  if (prev) {
    prev.ventas_unidades += r.ventas_unidades
    prev.ventas_valor    += r.ventas_valor
  } else aggMap.set(k, { ...r })
}
const agg = [...aggMap.values()]
if (agg.length < rows.length) console.log(`   🔀 agregado: ${rows.length.toLocaleString()} → ${agg.length.toLocaleString()}`)
const sumUSD = agg.reduce((s, r) => s + r.ventas_valor, 0)
const sumUnd = agg.reduce((s, r) => s + r.ventas_unidades, 0)
console.log(`   💰 a insertar: ${sumUnd.toLocaleString()} und · $${sumUSD.toLocaleString('en-US', {maximumFractionDigits:2})}`)

console.log('\n🗑️  Borrando fact_ventas_selectos donde pais=SV AND año=2026…')
const del = await pool.query(`
  DELETE FROM fact_ventas_selectos
  WHERE pais = 'SV' AND fecha >= '2026-01-01' AND fecha < '2027-01-01'
`)
console.log(`   ${del.rowCount.toLocaleString()} filas borradas`)

console.log(`\n📥 Insertando ${agg.length.toLocaleString()} filas…`)
const BATCH = 1000
for (let i = 0; i < agg.length; i += BATCH) {
  const chunk = agg.slice(i, i + BATCH)
  const vals = [], params = []
  let p = 1
  for (const r of chunk) {
    vals.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},'BORDEN',$${p++},$${p++},$${p++},$${p++},$${p++})`)
    params.push(
      r.fecha, r.pais, r.cadena, r.codigo_sucursal, r.nombre_sucursal,
      r.categoria, r.subcategoria,
      r.sku, r.codigo_barras, r.descripcion,
      r.ventas_unidades, r.ventas_valor
    )
  }
  await pool.query(`
    INSERT INTO fact_ventas_selectos
      (fecha, pais, cadena, codigo_sucursal, nombre_sucursal, categoria, subcategoria, marca, sku, codigo_barras, descripcion, ventas_unidades, ventas_valor)
    VALUES ${vals.join(',')}
  `, params)
  process.stdout.write(`\r   ${(i + chunk.length).toLocaleString()}/${agg.length.toLocaleString()}`)
}
console.log(`\n   ✅ insertado`)

console.log('\n🔄 Refrescando MVs…')
for (const mv of ['mv_sellout_mensual', 'mv_ventas_agg']) {
  const t0 = Date.now()
  try {
    await pool.query(`REFRESH MATERIALIZED VIEW ${mv}`)
    console.log(`   ✅ ${mv} (${((Date.now()-t0)/1000).toFixed(1)}s)`)
  } catch (e) { console.log(`   ⚠️  ${mv}: ${e.message}`) }
}

console.log('\n🔎 Selectos 2026 por mes:')
const ver = await pool.query(`
  SELECT EXTRACT(MONTH FROM fecha)::int AS mes,
         COUNT(*) AS n,
         ROUND(SUM(ventas_valor)::numeric, 0) AS usd
  FROM fact_ventas_selectos
  WHERE pais='SV' AND fecha >= '2026-01-01' AND fecha < '2027-01-01'
  GROUP BY mes ORDER BY mes
`)
let TN = 0, TV = 0
for (const x of ver.rows) {
  console.log(`   M${String(x.mes).padStart(2)}: ${Number(x.n).toLocaleString()} filas · $${Number(x.usd).toLocaleString()}`)
  TN += Number(x.n); TV += Number(x.usd)
}
console.log(`   TOT: ${TN.toLocaleString()} filas · $${TV.toLocaleString()}`)

await pool.end()
console.log('\n🎉 Carga Selectos 2026 completa')
