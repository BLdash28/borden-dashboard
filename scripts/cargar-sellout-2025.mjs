/**
 * cargar-sellout-2025.mjs
 * Carga SELLOUT_BORDEN_2025_v2.csv a fact_ventas_unisuper/walmart/selectos.
 * Tablas previamente vaciadas con TRUNCATE → no requiere DELETE.
 * Filtra filas con (ventas_unidades=0 AND ventas_valor=0).
 * Agrega duplicados por (fecha, pais, punto_venta, codigo_barras).
 * Para UNISUPER reconstruye GTQ = USD * tasa mensual.
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

const TASA_2025 = { 1: 7.74831, 2: 7.72591, 3: 7.74430, 4: 7.72052, 5: 7.69294, 6: 7.70225, 7: 7.69160, 8: 7.67828, 9: 7.67520, 10: 7.67560, 11: 7.67520, 12: 7.67623 }

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 })

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

const buckets = { UNISUPER: [], WALMART: [], SELECTOS: [] }
let totalRead = 0, totalKept = 0, totalDropped = 0

const path = 'C:/Users/IAN/Downloads/SELLOUT_BORDEN_2025_v2.csv'
console.log(`📂 ${path.split('/').pop()}`)
const rl = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity })
let headers = null
for await (const lineRaw of rl) {
  const line = lineRaw.replace(/^﻿/, '')
  if (!line.trim()) continue
  if (!headers) { headers = parseCsv(line); continue }
  const r = parseCsv(line)
  totalRead++
  const row = {}
  for (let i = 0; i < headers.length; i++) row[headers[i]] = r[i]
  const u = parseFloat(row.ventas_unidades) || 0
  const v = parseFloat(row.ventas_valor) || 0
  if (u === 0 && v === 0) { totalDropped++; continue }
  const cli = (row.cliente ?? '').toUpperCase()
  if (!buckets[cli]) { totalDropped++; continue }
  buckets[cli].push(row)
  totalKept++
}

console.log(`\n📊 Total leído: ${totalRead.toLocaleString()}`)
console.log(`   ✅ Guardados: ${totalKept.toLocaleString()}`)
console.log(`   🗑️  Descartados (0/0): ${totalDropped.toLocaleString()}`)
console.log(`   UNISUPER: ${buckets.UNISUPER.length.toLocaleString()}`)
console.log(`   WALMART:  ${buckets.WALMART.length.toLocaleString()}`)
console.log(`   SELECTOS: ${buckets.SELECTOS.length.toLocaleString()}`)

const aggregate = (rows, keyFn) => {
  const map = new Map()
  for (const r of rows) {
    const k = keyFn(r)
    const u = parseFloat(r.ventas_unidades) || 0
    const v = parseFloat(r.ventas_valor) || 0
    const prev = map.get(k)
    if (prev) {
      prev.ventas_unidades = (parseFloat(prev.ventas_unidades) || 0) + u
      prev.ventas_valor    = (parseFloat(prev.ventas_valor) || 0) + v
    } else {
      map.set(k, { ...r, ventas_unidades: u, ventas_valor: v })
    }
  }
  return [...map.values()]
}

async function cargarUnisuper() {
  let rows = buckets.UNISUPER
  if (!rows.length) { console.log('\n[UNISUPER] no hay filas'); return }
  const before = rows.length
  rows = aggregate(rows, r => `${r.ano}-${r.mes}-${r.dia}|${r.pais}|${r.punto_venta}|${r.codigo_barras}`)
  if (rows.length < before) console.log(`\n   🔀 UNISUPER agregado: ${before.toLocaleString()} → ${rows.length.toLocaleString()}`)
  console.log(`📥 [UNISUPER] insertando ${rows.length.toLocaleString()} filas...`)
  const BATCH = 1000
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const vals = [], params = []
    let p = 1
    for (const r of chunk) {
      const tasa = TASA_2025[parseInt(r.mes)] ?? 7.70
      const usd = parseFloat(r.ventas_valor) || 0
      const gtq = Math.round(usd * tasa * 100) / 100
      vals.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},'BORDEN',$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`)
      params.push(
        `${r.ano}-${String(r.mes).padStart(2, '0')}-${String(r.dia).padStart(2, '0')}`,
        r.pais, r.cadena, r.punto_venta, r.punto_venta,
        r.categoria, r.subcategoria,
        r.sku, r.codigo_barras, r.descripcion,
        parseFloat(r.ventas_unidades) || 0, usd, gtq
      )
    }
    await pool.query(`
      INSERT INTO fact_ventas_unisuper
        (fecha, pais, cadena, codigo_sucursal, nombre_sucursal, categoria, subcategoria, marca, sku, codigo_barras, descripcion, ventas_unidades, ventas_valor, ventas_valor_gtq)
      VALUES ${vals.join(',')}
    `, params)
    process.stdout.write(`\r   ${(i + chunk.length).toLocaleString()}/${rows.length.toLocaleString()}`)
  }
  console.log(`\n   ✅ UNISUPER cargado`)
}

async function cargarWalmart() {
  let rows = buckets.WALMART
  if (!rows.length) { console.log('\n[WALMART] no hay filas'); return }
  const before = rows.length
  rows = aggregate(rows, r => `${r.ano}-${r.mes}-${r.dia}|${r.pais}|${r.punto_venta}|${r.codigo_barras}`)
  if (rows.length < before) console.log(`\n   🔀 WALMART agregado: ${before.toLocaleString()} → ${rows.length.toLocaleString()}`)
  console.log(`📥 [WALMART] insertando ${rows.length.toLocaleString()} filas...`)
  const BATCH = 1000
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const vals = [], params = []
    let p = 1
    for (const r of chunk) {
      vals.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`)
      params.push(
        `${r.ano}-${String(r.mes).padStart(2, '0')}-${String(r.dia).padStart(2, '0')}`,
        r.pais, r.cadena, r.formato,
        r.categoria, r.subcategoria, r.punto_venta,
        r.sku, r.codigo_barras, r.descripcion,
        parseFloat(r.ventas_unidades) || 0, parseFloat(r.ventas_valor) || 0,
        'RetailLink-Borden'
      )
    }
    await pool.query(`
      INSERT INTO fact_ventas_walmart
        (fecha, pais, cadena, formato, categoria, subcategoria, punto_venta, sku, codigo_barras, descripcion, ventas_unidades, ventas_valor, archivo_origen)
      VALUES ${vals.join(',')}
    `, params)
    process.stdout.write(`\r   ${(i + chunk.length).toLocaleString()}/${rows.length.toLocaleString()}`)
  }
  console.log(`\n   ✅ WALMART cargado`)
}

async function cargarSelectos() {
  let rows = buckets.SELECTOS
  if (!rows.length) { console.log('\n[SELECTOS] no hay filas'); return }
  const before = rows.length
  rows = aggregate(rows, r => `${r.ano}-${r.mes}-${r.dia}|${r.punto_venta}|${r.codigo_barras}`)
  if (rows.length < before) console.log(`\n   🔀 SELECTOS agregado: ${before.toLocaleString()} → ${rows.length.toLocaleString()}`)
  console.log(`📥 [SELECTOS] insertando ${rows.length.toLocaleString()} filas...`)
  const BATCH = 1000
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const vals = [], params = []
    let p = 1
    for (const r of chunk) {
      vals.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},'BORDEN',$${p++},$${p++},$${p++},$${p++},$${p++})`)
      params.push(
        `${r.ano}-${String(r.mes).padStart(2, '0')}-${String(r.dia).padStart(2, '0')}`,
        r.pais, r.cadena, r.punto_venta, r.punto_venta,
        r.categoria, r.subcategoria,
        r.sku, r.codigo_barras, r.descripcion,
        parseFloat(r.ventas_unidades) || 0, parseFloat(r.ventas_valor) || 0
      )
    }
    await pool.query(`
      INSERT INTO fact_ventas_selectos
        (fecha, pais, cadena, codigo_sucursal, nombre_sucursal, categoria, subcategoria, marca, sku, codigo_barras, descripcion, ventas_unidades, ventas_valor)
      VALUES ${vals.join(',')}
    `, params)
    process.stdout.write(`\r   ${(i + chunk.length).toLocaleString()}/${rows.length.toLocaleString()}`)
  }
  console.log(`\n   ✅ SELECTOS cargado`)
}

await cargarUnisuper()
await cargarWalmart()
await cargarSelectos()

console.log('\n🔄 Refrescando materialized views...')
for (const mv of ['mv_sellout_mensual', 'mv_ventas_agg']) {
  const t0 = Date.now()
  try {
    await pool.query(`REFRESH MATERIALIZED VIEW ${mv}`)
    console.log(`   ✅ ${mv} (${((Date.now() - t0)/1000).toFixed(1)}s)`)
  } catch (e) { console.log(`   ⚠️  ${mv}: ${e.message}`) }
}

await pool.end()
console.log('\n🎉 Carga 2025 completa')
