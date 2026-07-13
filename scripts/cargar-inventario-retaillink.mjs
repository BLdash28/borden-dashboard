/**
 * cargar-inventario-retaillink.mjs
 * Carga los 2 archivos TSV descargados de RetailLink:
 *   - Tiendas (PDV): fact_inventario_walmart_pdv style → inventario_tiendas
 *   - CEDI:          fact_inventario_walmart_cedi style → inventario_cedi
 *
 * Uso:
 *   node scripts/cargar-inventario-retaillink.mjs <tiendas.txt> <cedi.txt>
 */
import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, basename } from 'path'

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

const HOY = new Date().toISOString().slice(0, 10)

const ARG_TIENDAS = process.argv[2]
const ARG_CEDI    = process.argv[3]
if (!ARG_TIENDAS || !ARG_CEDI) {
  console.error('Uso: node cargar-inventario-retaillink.mjs <tiendas.txt> <cedi.txt>')
  process.exit(1)
}

const toNum = v => {
  if (v === null || v === undefined || v === '') return 0
  const n = parseFloat(String(v).trim())
  return isNaN(n) ? 0 : n
}

// ── 1. Cargar dim_producto para enriquecer ─────────────────────────────
console.log('📥 dim_producto…')
const dimRes = await pool.query(`SELECT codigo_barras, sku, descripcion, categoria, subcategoria FROM dim_producto WHERE codigo_barras IS NOT NULL`)
const dimMap = new Map()
for (const r of dimRes.rows) dimMap.set(r.codigo_barras, r)
console.log(`   ${dimMap.size} productos`)

// Lookup UPC → dim (soporta padding y check-digit variante)
const UPC_OVERRIDE = { '5300003502': '53000003502', '53000057253': '5300005275', '53000071884': '530000718800' }
const dimLookup = (raw) => {
  if (!raw) return null
  const s = String(raw).trim().replace(/^0+/, '')
  if (UPC_OVERRIDE[s] && dimMap.has(UPC_OVERRIDE[s])) return { ...dimMap.get(UPC_OVERRIDE[s]), upc_canon: UPC_OVERRIDE[s] }
  if (dimMap.has(s)) return { ...dimMap.get(s), upc_canon: s }
  if (dimMap.has(raw)) return { ...dimMap.get(raw), upc_canon: raw }
  for (let d = 0; d <= 9; d++) {
    if (dimMap.has(s + String(d))) return { ...dimMap.get(s + String(d)), upc_canon: s + String(d) }
  }
  return null
}

const readTsv = (path) => {
  let text
  try { text = readFileSync(path, 'utf8') }
  catch { text = readFileSync(path, 'latin1') }
  return text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim())
}

// ── 2. Cargar TIENDAS ─────────────────────────────────────────────────
console.log(`\n📥 Tiendas: ${basename(ARG_TIENDAS)}`)
const filasTiendas = readTsv(ARG_TIENDAS)
console.log(`   ${filasTiendas.length} líneas TSV`)

const rowsTiendas = []
let tiendasSinCross = 0
const paisesT = new Set()
for (const linea of filasTiendas) {
  const cols = linea.split('\t')
  if (cols.length < 6) continue
  const pais = cols[0].trim()
  if (!pais) continue
  paisesT.add(pais)
  const upcRaw = (cols[5] || '').trim()
  const dim = dimLookup(upcRaw)
  if (!dim) { tiendasSinCross++; continue }
  rowsTiendas.push({
    fecha:          HOY,
    pais,
    financial_rpt:  (cols[1] || '').trim(),
    tienda_nbr:     (cols[2] || '').trim(),
    tienda_nombre:  (cols[3] || '').trim(),
    upc:            upcRaw,
    item_nbr:       (cols[4] || '').trim() || null,
    inv_mano:       toNum(cols[11]),
    inv_orden:      toNum(cols[12]),
    inv_transito:   toNum(cols[13]),
    inv_almacen:    toNum(cols[15]),
    sku:            dim.sku,
    descripcion:    dim.descripcion || (cols[6] || '').trim(),
    categoria:      dim.categoria,
    subcategoria:   dim.subcategoria,
  })
}
console.log(`   Filas válidas: ${rowsTiendas.length} (${tiendasSinCross} sin crosswalk)`)
console.log(`   Países: ${[...paisesT].join(', ')}`)

// Dedup por (fecha, pais, tienda_nombre, upc)
const seenT = new Set()
const dedupT = []
for (const r of rowsTiendas) {
  const k = `${r.fecha}|${r.pais}|${r.tienda_nombre}|${r.upc}`
  if (!seenT.has(k)) { seenT.add(k); dedupT.push(r) }
}
console.log(`   Únicas: ${dedupT.length}`)

// Borrar snapshot de hoy si ya existía y luego insertar
console.log('\n🗑️  Borrando inventario_tiendas para fecha=' + HOY + ' + países ' + [...paisesT].join(','))
const delT = await pool.query(
  `DELETE FROM inventario_tiendas WHERE fecha=$1 AND pais = ANY($2::text[])`,
  [HOY, [...paisesT]]
)
console.log(`   ${delT.rowCount} filas borradas`)

console.log(`\n📥 Insertando ${dedupT.length} filas a inventario_tiendas…`)
const COLS_T = ['fecha','pais','financial_rpt','tienda_nbr','tienda_nombre','upc','item_nbr','inv_mano','inv_orden','inv_transito','inv_almacen','sku','descripcion','categoria','subcategoria']
const BATCH = 500
for (let i = 0; i < dedupT.length; i += BATCH) {
  const chunk = dedupT.slice(i, i + BATCH)
  const vals = [], params = []
  let p = 1
  for (const r of chunk) {
    vals.push('(' + COLS_T.map(() => `$${p++}`).join(',') + ')')
    for (const c of COLS_T) params.push(r[c])
  }
  await pool.query(`INSERT INTO inventario_tiendas (${COLS_T.join(',')}) VALUES ${vals.join(',')}`, params)
  process.stdout.write(`\r   ${i + chunk.length}/${dedupT.length}`)
}
console.log('\n   ✅')

// ── 3. Cargar CEDI ────────────────────────────────────────────────────
console.log(`\n📥 CEDI: ${basename(ARG_CEDI)}`)
const filasCedi = readTsv(ARG_CEDI)
console.log(`   ${filasCedi.length} líneas TSV`)

const rowsCedi = []
let cediSinCross = 0
const paisesC = new Set()
for (const linea of filasCedi) {
  const cols = linea.split('\t')
  if (cols.length < 3) continue
  const pais = cols[0].trim()
  if (!pais) continue
  paisesC.add(pais)
  const upcRaw = (cols[1] || '').trim()
  if (!upcRaw) continue
  const dim = dimLookup(upcRaw)
  if (!dim) { cediSinCross++; continue }
  const n = cols.length
  const invCajas = n >= 17 ? toNum(cols[13]) : (n > 10 ? toNum(cols[10]) : 0)
  rowsCedi.push({
    fecha:            HOY,
    pais,
    upc:              upcRaw,
    item_nbr:         (cols[2] || '').trim() || null,
    descripcion:      dim.descripcion || (cols[3] || '').trim(),
    marca:            (cols[8] || '').trim() || null,
    proveedor_nbr:    (cols[9] || '').trim() || null,
    proveedor:        (cols[10] || '').trim() || null,
    inv_mano_cajas:   invCajas,
    inv_orden_cajas:  n > 14 ? toNum(cols[14]) : 0,
    estado:           (cols[16] || '').trim() || null,
    sku:              dim.sku,
    categoria:        dim.categoria,
    subcategoria:     dim.subcategoria,
  })
}
console.log(`   Filas válidas: ${rowsCedi.length} (${cediSinCross} sin crosswalk)`)
console.log(`   Países: ${[...paisesC].join(', ')}`)

// Dedup por (fecha, pais, upc)
const seenC = {}
for (const r of rowsCedi) seenC[`${r.fecha}|${r.pais}|${r.upc}`] = r
const dedupC = Object.values(seenC)
console.log(`   Únicas: ${dedupC.length}`)

console.log('\n🗑️  Borrando inventario_cedi para fecha=' + HOY + ' + países ' + [...paisesC].join(','))
const delC = await pool.query(
  `DELETE FROM inventario_cedi WHERE fecha=$1 AND pais = ANY($2::text[])`,
  [HOY, [...paisesC]]
)
console.log(`   ${delC.rowCount} filas borradas`)

console.log(`\n📥 Insertando ${dedupC.length} filas a inventario_cedi…`)
const COLS_C = ['fecha','pais','upc','item_nbr','descripcion','marca','proveedor_nbr','proveedor','inv_mano_cajas','inv_orden_cajas','estado','sku','categoria','subcategoria']
for (let i = 0; i < dedupC.length; i += BATCH) {
  const chunk = dedupC.slice(i, i + BATCH)
  const vals = [], params = []
  let p = 1
  for (const r of chunk) {
    vals.push('(' + COLS_C.map(() => `$${p++}`).join(',') + ')')
    for (const c of COLS_C) params.push(r[c])
  }
  await pool.query(`INSERT INTO inventario_cedi (${COLS_C.join(',')}) VALUES ${vals.join(',')}`, params)
  process.stdout.write(`\r   ${i + chunk.length}/${dedupC.length}`)
}
console.log('\n   ✅')

// ── 4. Resumen ────────────────────────────────────────────────────────
console.log('\n🔎 Resumen inventario del ' + HOY + ':')
const rr = await pool.query(`
  SELECT pais, COUNT(*) AS n FROM inventario_tiendas WHERE fecha=$1 GROUP BY pais ORDER BY pais
`, [HOY])
for (const x of rr.rows) console.log(`   Tiendas ${x.pais}: ${Number(x.n).toLocaleString()} filas`)
const cc = await pool.query(`
  SELECT pais, COUNT(*) AS n FROM inventario_cedi WHERE fecha=$1 GROUP BY pais ORDER BY pais
`, [HOY])
for (const x of cc.rows) console.log(`   CEDI    ${x.pais}: ${Number(x.n).toLocaleString()} filas`)

await pool.end()
console.log('\n🎉 Inventario RetailLink cargado')
