/**
 * cargar-unisuper-widget17.mjs
 * Carga widget (17).csv: Unisuper La Torre GT, ene-dic 2025.
 * 1) Borra fact_ventas_unisuper donde pais=GT AND cadena='LA TORRE' AND año=2025
 * 2) Filtra Borden, normaliza codigo_barras (strip leading 0s + match dim_producto)
 * 3) Convierte GTQ → USD con tasa mensual
 * 4) Inserta y refresca MVs
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

const TASA = { 1:7.74831, 2:7.72591, 3:7.74430, 4:7.71282, 5:7.69750, 6:7.70466, 7:7.69288, 8:7.67259, 9:7.67382, 10:7.67425, 11:7.68441, 12:7.68575 }

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 })

// ── 1. Cargar dim_producto ────────────────────────────────────────────────
console.log('📥 Cargando dim_producto…')
const dimRes = await pool.query(`SELECT codigo_barras, sku, descripcion, categoria, subcategoria FROM dim_producto WHERE codigo_barras IS NOT NULL`)
const dimMap = new Map()
for (const r of dimRes.rows) dimMap.set(r.codigo_barras, r)
console.log(`   ${dimMap.size} productos`)

// Match: strip leading zeros, exact match, +check digit, override manual
// Casos donde Qlik export reporta UPC con dígitos en orden distinto / faltante
const UPC_OVERRIDE = {
  '53000057253': '5300005275',   // BORDEN QUESO AMERIC AMARIL REBANAD (Qlik tiene dígitos cruzados)
}
const matchDim = (raw) => {
  const stripped = raw.replace(/^0+/, '')
  // override directo
  if (UPC_OVERRIDE[stripped]) {
    const x = dimMap.get(UPC_OVERRIDE[stripped])
    if (x) return x
  }
  if (dimMap.has(stripped)) return dimMap.get(stripped)
  if (dimMap.has(raw)) return dimMap.get(raw)
  // probar agregando check digit al stripped
  for (let d = 0; d <= 9; d++) {
    if (dimMap.has(stripped + String(d))) return dimMap.get(stripped + String(d))
  }
  return null
}

// ── 2. Parse CSV ──────────────────────────────────────────────────────────
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

const PATH = 'C:/Users/IAN/Downloads/widget (17).csv'
console.log(`\n📂 ${PATH.split('/').pop()}`)
const rl = createInterface({ input: createReadStream(PATH, 'utf8'), crlfDelay: Infinity })

const rows = []
let leidas = 0, sinMatch = 0, ceros = 0, noBorden = 0
const sinMatchUpcs = new Set()
let headers = null
let HDR = {}

for await (const raw of rl) {
  const line = raw.replace(/^﻿/, '')
  if (!line.trim()) continue
  if (!headers) {
    headers = parseCsv(line).map(s => s.trim())
    HDR = Object.fromEntries(headers.map((h, i) => [h, i]))
    continue
  }
  const r = parseCsv(line)
  leidas++

  const marca = String(r[HDR['Marca']] ?? '').trim().toUpperCase()
  if (marca !== 'BORDEN') { noBorden++; continue }

  const fecha = String(r[HDR['Fecha']] ?? '').trim()  // YYYY-MM-DD
  const cadRaw = String(r[HDR['Cadena']] ?? '').trim()
  const codSuc = String(r[HDR['Código sucursal']] ?? '').trim()
  const nomSuc = String(r[HDR['Nombre sucursal']] ?? '').trim()
  const cbRaw  = String(r[HDR['Codigo Barra']] ?? '').trim()
  const und    = parseFloat(r[HDR['Venta unidades']]) || 0
  const gtq    = parseFloat(r[HDR['Venta valor sin IVA (GTQ)']]) || 0

  if (und === 0 && gtq === 0) { ceros++; continue }

  const dim = matchDim(cbRaw)
  if (!dim) { sinMatch++; sinMatchUpcs.add(cbRaw); continue }

  const [yStr, mStr] = fecha.split('-')
  const mes = parseInt(mStr)
  const tasa = TASA[mes] ?? 7.70
  const usd = Math.round((gtq / tasa) * 100) / 100

  // cadena: "1 LA TORRE" → "LA TORRE"
  const cadena = cadRaw.replace(/^\d+\s+/, '').trim()

  rows.push({
    fecha,
    pais: 'GT',
    cadena,
    codigo_sucursal: codSuc || nomSuc,
    nombre_sucursal: nomSuc,
    categoria: dim.categoria,
    subcategoria: dim.subcategoria,
    sku: dim.sku,
    codigo_barras: dim.codigo_barras,
    descripcion: dim.descripcion,
    ventas_unidades: und,
    ventas_valor: usd,
    ventas_valor_gtq: gtq,
  })
}
console.log(`\n📊 Stats:`)
console.log(`   leídas:     ${leidas.toLocaleString()}`)
console.log(`   no-BORDEN:  ${noBorden.toLocaleString()}`)
console.log(`   sin match:  ${sinMatch.toLocaleString()}`)
console.log(`   0/0:        ${ceros.toLocaleString()}`)
console.log(`   ✅ válidas: ${rows.length.toLocaleString()}`)
if (sinMatchUpcs.size && sinMatchUpcs.size < 30) console.log(`   UPCs sin match: ${[...sinMatchUpcs].join(', ')}`)

// ── 3. Aggregate por (fecha, nombre_sucursal, codigo_barras) ──────────────
const aggMap = new Map()
for (const r of rows) {
  const k = `${r.fecha}|${r.nombre_sucursal}|${r.codigo_barras}`
  const prev = aggMap.get(k)
  if (prev) {
    prev.ventas_unidades += r.ventas_unidades
    prev.ventas_valor    += r.ventas_valor
    prev.ventas_valor_gtq += r.ventas_valor_gtq
  } else {
    aggMap.set(k, { ...r })
  }
}
const agg = [...aggMap.values()]
if (agg.length < rows.length) console.log(`   🔀 agregado: ${rows.length.toLocaleString()} → ${agg.length.toLocaleString()}`)
const sumUSD = agg.reduce((s, r) => s + r.ventas_valor, 0)
const sumGTQ = agg.reduce((s, r) => s + r.ventas_valor_gtq, 0)
const sumUnd = agg.reduce((s, r) => s + r.ventas_unidades, 0)
console.log(`   💰 a insertar: ${sumUnd.toLocaleString()} und · GTQ ${sumGTQ.toLocaleString('en-US', {maximumFractionDigits:0})} · $${sumUSD.toLocaleString('en-US', {maximumFractionDigits:2})}`)

// ── 4. DELETE existente y INSERT ──────────────────────────────────────────
console.log('\n🗑️  Borrando fact_ventas_unisuper donde pais=GT AND cadena=LA TORRE AND año=2025…')
const del = await pool.query(`
  DELETE FROM fact_ventas_unisuper
  WHERE pais = 'GT' AND cadena = 'LA TORRE'
    AND fecha >= '2025-01-01' AND fecha < '2026-01-01'
`)
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

// ── 5. Refresh MVs ────────────────────────────────────────────────────────
console.log('\n🔄 Refrescando MVs…')
for (const mv of ['mv_sellout_mensual', 'mv_ventas_agg']) {
  const t0 = Date.now()
  try {
    await pool.query(`REFRESH MATERIALIZED VIEW ${mv}`)
    console.log(`   ✅ ${mv} (${((Date.now()-t0)/1000).toFixed(1)}s)`)
  } catch (e) { console.log(`   ⚠️  ${mv}: ${e.message}`) }
}

// ── 6. Verificación ───────────────────────────────────────────────────────
console.log('\n🔎 fact_ventas_unisuper 2025 GT LA TORRE por mes:')
const ver = await pool.query(`
  SELECT EXTRACT(MONTH FROM fecha)::int AS mes,
         COUNT(*) AS n,
         ROUND(SUM(ventas_unidades)::numeric, 0) AS und,
         ROUND(SUM(ventas_valor_gtq)::numeric, 0) AS gtq,
         ROUND(SUM(ventas_valor)::numeric, 0) AS usd
  FROM fact_ventas_unisuper
  WHERE pais='GT' AND cadena='LA TORRE' AND fecha >= '2025-01-01' AND fecha < '2026-01-01'
  GROUP BY mes ORDER BY mes
`)
let TN=0, TU=0, TG=0, TV=0
for (const x of ver.rows) {
  console.log(`   M${String(x.mes).padStart(2)}: ${Number(x.n).toLocaleString().padStart(7)} filas · ${Number(x.und).toLocaleString()} und · GTQ ${Number(x.gtq).toLocaleString()} · $${Number(x.usd).toLocaleString()}`)
  TN += Number(x.n); TU += Number(x.und); TG += Number(x.gtq); TV += Number(x.usd)
}
console.log(`   TOT: ${TN.toLocaleString()} filas · ${TU.toLocaleString()} und · GTQ ${TG.toLocaleString()} · $${TV.toLocaleString()}`)

await pool.end()
console.log('\n🎉 Carga Unisuper La Torre 2025 completa')
