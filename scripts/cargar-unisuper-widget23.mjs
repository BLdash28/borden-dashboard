/**
 * cargar-unisuper-widget23.mjs
 * Carga widget (23).csv: Unisuper GT 2026 jun 22 (LA TORRE + ECONOSUPER).
 *
 * Incremental: solo borra+reinserta las fechas presentes en el CSV.
 * Preserva el resto de 2026 (ene-jun 21 + jun 28+) que ya estaba cargado.
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

// Tasas diarias junio 2026 (1 GTQ = X USD). Para jun 22 usamos
// la tasa promedio reciente (~0.1311) ya que aún no hay datos
// históricos verificados de esos días.
const TASA_DIARIA = {
  '2026-06-22': 0.1311,
  
  
  
  
}
const convertirAusd = (fecha, gtq) => {
  const usdPerGtq = TASA_DIARIA[fecha] ?? 0.1311
  return Math.round(gtq * usdPerGtq * 100) / 100
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 })

console.log('📥 Cargando dim_producto…')
const dimRes = await pool.query(`SELECT codigo_barras, sku, descripcion, categoria, subcategoria FROM dim_producto WHERE codigo_barras IS NOT NULL`)
const dimMap = new Map()
for (const r of dimRes.rows) dimMap.set(r.codigo_barras, r)
console.log(`   ${dimMap.size} productos`)

const UPC_OVERRIDE = {
  '53000057253': '5300005275',
  '53000071884': '530000718800',
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

const PATH = 'C:/Users/IAN/Downloads/widget (23).csv'
console.log(`\n📂 ${PATH.split('/').pop()}`)
const rl = createInterface({ input: createReadStream(PATH, 'utf8'), crlfDelay: Infinity })

const rows = []
const fechasEnArchivo = new Set()
let leidas = 0, sinMatch = 0, ceros = 0, noBorden = 0
const sinUpcs = new Set()
let headers = null, H = {}

for await (const raw of rl) {
  const line = raw.replace(/^﻿/, '')
  if (!line.trim()) continue
  if (!headers) {
    headers = parseCsv(line).map(s => s.trim())
    H = Object.fromEntries(headers.map((h, i) => [h, i]))
    continue
  }
  const r = parseCsv(line)
  leidas++

  const marca = String(r[H['Marca']] ?? '').trim().toUpperCase()
  if (marca !== 'BORDEN') { noBorden++; continue }

  const fecha = String(r[H['Fecha']] ?? '').trim()
  const cadRaw = String(r[H['Cadena']] ?? '').trim()
  const codSuc = String(r[H['Código sucursal']] ?? '').trim()
  const nomSuc = String(r[H['Nombre sucursal']] ?? '').trim()
  const cbRaw  = String(r[H['Codigo Barra']] ?? '').trim()
  const und    = parseFloat(r[H['Venta unidades']]) || 0
  const gtq    = parseFloat(r[H['Venta valor sin IVA (GTQ)']]) || 0
  if (und === 0 && gtq === 0) { ceros++; continue }

  const dim = matchDim(cbRaw)
  if (!dim) { sinMatch++; sinUpcs.add(cbRaw); continue }

  fechasEnArchivo.add(fecha)
  const usd = convertirAusd(fecha, gtq)
  const cadena = cadRaw.replace(/^\d+\s+/, '').trim()

  rows.push({
    fecha, pais: 'GT', cadena,
    codigo_sucursal: codSuc || nomSuc,
    nombre_sucursal: nomSuc,
    categoria: dim.categoria, subcategoria: dim.subcategoria,
    sku: dim.sku, codigo_barras: dim.codigo_barras, descripcion: dim.descripcion,
    ventas_unidades: und, ventas_valor: usd, ventas_valor_gtq: gtq,
  })
}
console.log(`\n📊 Stats:`)
console.log(`   leídas:    ${leidas.toLocaleString()}`)
console.log(`   no-BORDEN: ${noBorden.toLocaleString()}`)
console.log(`   sin match: ${sinMatch.toLocaleString()}`)
console.log(`   0/0:       ${ceros.toLocaleString()}`)
console.log(`   válidas:   ${rows.length.toLocaleString()}`)
console.log(`   fechas en archivo: ${[...fechasEnArchivo].sort().join(', ')}`)
if (sinUpcs.size) console.log(`   UPCs sin match: ${[...sinUpcs].join(', ')}`)

// Aggregate por (fecha, sucursal, codigo_barras)
const aggMap = new Map()
for (const r of rows) {
  const k = `${r.fecha}|${r.nombre_sucursal}|${r.codigo_barras}`
  const prev = aggMap.get(k)
  if (prev) {
    prev.ventas_unidades += r.ventas_unidades
    prev.ventas_valor    += r.ventas_valor
    prev.ventas_valor_gtq += r.ventas_valor_gtq
  } else aggMap.set(k, { ...r })
}
const agg = [...aggMap.values()]
if (agg.length < rows.length) console.log(`   🔀 agregado: ${rows.length.toLocaleString()} → ${agg.length.toLocaleString()}`)

const sumUSD = agg.reduce((s, r) => s + r.ventas_valor, 0)
const sumGTQ = agg.reduce((s, r) => s + r.ventas_valor_gtq, 0)
console.log(`   💰 a insertar: GTQ ${sumGTQ.toLocaleString('en-US', {maximumFractionDigits:0})} · $${sumUSD.toLocaleString('en-US', {maximumFractionDigits:2})}`)

// Borrar SOLO las fechas presentes en el archivo (preservar el resto de 2026)
const fechasList = [...fechasEnArchivo].sort()
console.log(`\n🗑️  Borrando fact_ventas_unisuper GT para fechas ${fechasList[0]} → ${fechasList[fechasList.length-1]}…`)
const del = await pool.query(
  `DELETE FROM fact_ventas_unisuper WHERE pais='GT' AND fecha = ANY($1::date[])`,
  [fechasList]
)
console.log(`   ${del.rowCount.toLocaleString()} filas borradas`)

console.log(`\n📥 Insertando ${agg.length.toLocaleString()} filas…`)
const BATCH = 1000
for (let i = 0; i < agg.length; i += BATCH) {
  const chunk = agg.slice(i, i + BATCH)
  const vals = [], params = []
  let p = 1
  for (const r of chunk) {
    vals.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},'BORDEN',$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`)
    params.push(
      r.fecha, r.pais, r.cadena, r.codigo_sucursal, r.nombre_sucursal,
      r.categoria, r.subcategoria,
      r.sku, r.codigo_barras, r.descripcion,
      r.ventas_unidades, r.ventas_valor, r.ventas_valor_gtq
    )
  }
  await pool.query(`
    INSERT INTO fact_ventas_unisuper
      (fecha, pais, cadena, codigo_sucursal, nombre_sucursal, categoria, subcategoria, marca, sku, codigo_barras, descripcion, ventas_unidades, ventas_valor, ventas_valor_gtq)
    VALUES ${vals.join(',')}
  `, params)
  process.stdout.write(`\r   ${(i + chunk.length).toLocaleString()}/${agg.length.toLocaleString()}`)
}
console.log(`\n   ✅ insertado`)

console.log('\n🔄 Refrescando MVs…')
for (const mv of ['mv_sellout_mensual', 'mv_ventas_agg', 'mv_sku_mensual']) {
  const t0 = Date.now()
  try {
    await pool.query(`REFRESH MATERIALIZED VIEW ${mv}`)
    console.log(`   ✅ ${mv} (${((Date.now()-t0)/1000).toFixed(1)}s)`)
  } catch (e) { console.log(`   ⚠️  ${mv}: ${e.message}`) }
}

console.log('\n🔎 Junio 2026 GT por día tras la carga:')
const ver = await pool.query(`
  SELECT fecha, COUNT(*) AS n,
         ROUND(SUM(ventas_valor_gtq)::numeric, 0) AS gtq,
         ROUND(SUM(ventas_valor)::numeric, 0) AS usd
  FROM fact_ventas_unisuper
  WHERE pais='GT' AND fecha >= '2026-06-01' AND fecha < '2026-07-01'
  GROUP BY fecha ORDER BY fecha
`)
for (const x of ver.rows) {
  const f = new Date(x.fecha).toISOString().slice(0,10)
  console.log(`   ${f}: ${String(x.n).padStart(4)} filas · GTQ ${Number(x.gtq).toLocaleString().padStart(8)} · $${Number(x.usd).toLocaleString().padStart(6)}`)
}

await pool.end()
console.log('\n🎉 Carga widget 23 completa')
