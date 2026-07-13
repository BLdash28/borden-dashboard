/**
 * cargar-sellout-borden.mjs
 * Carga los CSVs SELLOUT_BORDEN_*_v2.csv a las tablas fact_*.
 * - Borra datos existentes en el rango de fechas
 * - Filtra filas con (ventas_unidades=0 AND ventas_valor=0)
 * - Reconstruye GTQ para Unisuper desde USD * tasa
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

const TASA = {
  2024: { 1: 7.83, 2: 7.82, 3: 7.81, 4: 7.80, 5: 7.79, 6: 7.78, 7: 7.77, 8: 7.76, 9: 7.75, 10: 7.74, 11: 7.74, 12: 7.74 },
  2025: { 1: 7.74831, 2: 7.72591, 3: 7.74430, 4: 7.72052, 5: 7.69294, 6: 7.70225, 7: 7.69160, 8: 7.67828, 9: 7.67520, 10: 7.67560, 11: 7.67520, 12: 7.67623 },
  2026: { 1: 7.68295, 2: 7.68077, 3: 7.67250, 4: 7.65775, 5: 7.65775, 6: 7.65775, 7: 7.65775, 8: 7.65775, 9: 7.65775, 10: 7.65775, 11: 7.65775, 12: 7.65775 },
}
const getTasa = (ano, mes) => TASA[ano]?.[mes] ?? 7.68

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 })

// ── Parse CSV simple ────────────────────────────────────────────────────
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

// ── Buckets por cliente ──────────────────────────────────────────────────
const buckets = {
  UNISUPER: [],   // fact_ventas_unisuper
  WALMART:  [],   // fact_ventas_walmart
  SELECTOS: [],   // fact_ventas_selectos
}
let totalRead = 0, totalKept = 0, totalDropped = 0

// ── Leer los 3 CSVs ──────────────────────────────────────────────────────
async function readCsv(path) {
  console.log(`\n📂 ${path.split('/').pop()}`)
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
}

for (const y of [2024, 2025, 2026]) {
  await readCsv(`C:/Users/IAN/Downloads/SELLOUT_BORDEN_${y}_v2.csv`)
}
console.log(`\n📊 Total leído: ${totalRead.toLocaleString()}`)
console.log(`   ✅ Guardados: ${totalKept.toLocaleString()}`)
console.log(`   🗑️  Descartados (0/0): ${totalDropped.toLocaleString()}`)
console.log(`   UNISUPER: ${buckets.UNISUPER.length.toLocaleString()}`)
console.log(`   WALMART:  ${buckets.WALMART.length.toLocaleString()}`)
console.log(`   SELECTOS: ${buckets.SELECTOS.length.toLocaleString()}`)

// ── Determinar rangos de fechas para DELETE ──────────────────────────────
const fechaRange = (rows) => {
  if (!rows.length) return null
  let min = null, max = null
  for (const r of rows) {
    const d = `${r.ano}-${String(r.mes).padStart(2, '0')}-${String(r.dia).padStart(2, '0')}`
    if (!min || d < min) min = d
    if (!max || d > max) max = d
  }
  return { min, max }
}

// ── helper: agregar duplicados ───────────────────────────────────────────
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

// ── 1. UNISUPER ──────────────────────────────────────────────────────────
async function cargarUnisuper() {
  let rows = buckets.UNISUPER
  if (!rows.length) { console.log('\n[UNISUPER] no hay filas'); return }
  // agregar por (fecha, pais, nombre_sucursal, codigo_barras) — la clave única
  const before = rows.length
  rows = aggregate(rows, r => `${r.ano}-${r.mes}-${r.dia}|${r.pais}|${r.punto_venta}|${r.codigo_barras}`)
  if (rows.length < before) console.log(`\n   🔀 UNISUPER agregado: ${before.toLocaleString()} → ${rows.length.toLocaleString()}`)

  const range = fechaRange(rows)
  console.log(`\n🗑️  [UNISUPER] borrando filas BORDEN (por codigo_barras ∈ dim_producto) entre ${range.min} y ${range.max}...`)
  const del = await pool.query(
    `DELETE FROM fact_ventas_unisuper
     WHERE fecha BETWEEN $1 AND $2
       AND codigo_barras IN (SELECT codigo_barras FROM dim_producto WHERE codigo_barras IS NOT NULL)`,
    [range.min, range.max]
  )
  console.log(`   ${del.rowCount.toLocaleString()} filas borradas`)

  console.log(`📥 [UNISUPER] insertando ${rows.length.toLocaleString()} filas...`)
  const BATCH = 1000
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const vals = [], params = []
    let p = 1
    for (const r of chunk) {
      const tasa = getTasa(parseInt(r.ano), parseInt(r.mes))
      const usd = parseFloat(r.ventas_valor) || 0
      const gtq = Math.round(usd * tasa * 100) / 100
      vals.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},'BORDEN',$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`)
      // codigo_sucursal = punto_venta para evitar colisiones en (fecha,pais,codigo_sucursal,sku)
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
      ON CONFLICT DO NOTHING
    `, params)
    process.stdout.write(`\r   ${(i + chunk.length).toLocaleString()}/${rows.length.toLocaleString()}`)
  }
  console.log(`\n   ✅ UNISUPER cargado`)
}

// ── 2. WALMART ───────────────────────────────────────────────────────────
async function cargarWalmart() {
  let rows = buckets.WALMART
  if (!rows.length) { console.log('\n[WALMART] no hay filas'); return }
  // agregar por (fecha, pais, punto_venta, codigo_barras)
  const before = rows.length
  rows = aggregate(rows, r => `${r.ano}-${r.mes}-${r.dia}|${r.pais}|${r.punto_venta}|${r.codigo_barras}`)
  if (rows.length < before) console.log(`\n   🔀 WALMART agregado: ${before.toLocaleString()} → ${rows.length.toLocaleString()}`)
  const range = fechaRange(rows)
  console.log(`\n🗑️  [WALMART] borrando filas BORDEN (por codigo_barras ∈ dim_producto) entre ${range.min} y ${range.max}...`)
  const del = await pool.query(
    `DELETE FROM fact_ventas_walmart
     WHERE fecha BETWEEN $1 AND $2
       AND codigo_barras IN (SELECT codigo_barras FROM dim_producto WHERE codigo_barras IS NOT NULL)`,
    [range.min, range.max]
  )
  console.log(`   ${del.rowCount.toLocaleString()} filas borradas`)

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
      ON CONFLICT DO NOTHING
    `, params)
    process.stdout.write(`\r   ${(i + chunk.length).toLocaleString()}/${rows.length.toLocaleString()}`)
  }
  console.log(`\n   ✅ WALMART cargado`)
}

// ── 3. SELECTOS ──────────────────────────────────────────────────────────
async function cargarSelectos() {
  let rows = buckets.SELECTOS
  if (!rows.length) { console.log('\n[SELECTOS] no hay filas'); return }
  // agregar por (fecha, nombre_sucursal, codigo_barras)
  const before = rows.length
  rows = aggregate(rows, r => `${r.ano}-${r.mes}-${r.dia}|${r.punto_venta}|${r.codigo_barras}`)
  if (rows.length < before) console.log(`\n   🔀 SELECTOS agregado: ${before.toLocaleString()} → ${rows.length.toLocaleString()}`)
  const range = fechaRange(rows)
  console.log(`\n🗑️  [SELECTOS] borrando filas BORDEN (por codigo_barras ∈ dim_producto) entre ${range.min} y ${range.max}...`)
  const del = await pool.query(
    `DELETE FROM fact_ventas_selectos
     WHERE fecha BETWEEN $1 AND $2
       AND codigo_barras IN (SELECT codigo_barras FROM dim_producto WHERE codigo_barras IS NOT NULL)`,
    [range.min, range.max]
  )
  console.log(`   ${del.rowCount.toLocaleString()} filas borradas`)

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
      ON CONFLICT DO NOTHING
    `, params)
    process.stdout.write(`\r   ${(i + chunk.length).toLocaleString()}/${rows.length.toLocaleString()}`)
  }
  console.log(`\n   ✅ SELECTOS cargado`)
}

await cargarUnisuper()
await cargarWalmart()
await cargarSelectos()

console.log('\n🔄 Refrescando materialized views...')
try {
  await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_sellout_mensual')
  console.log('   ✅ mv_sellout_mensual')
} catch (e) { console.log(`   ⚠️  mv_sellout_mensual: ${e.message}`) }
try {
  await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_ventas_agg')
  console.log('   ✅ mv_ventas_agg')
} catch (e) { console.log(`   ⚠️  mv_ventas_agg: ${e.message}`) }

await pool.end()
console.log('\n🎉 Carga completa')
