/**
 * cargar-exito-abril.mjs
 * Carga SELL OUT BORDEN COLOMBIA DEL 01 AL 30-04-26.xlsx (abril 2026).
 * Header distinto al archivo anterior: tiene columna FORMATO extra.
 * DELETE solo abril 2026, INSERT sin tocar el rango previo (jun/25 a mar/26).
 */
import pg from 'pg'
import XLSX from 'xlsx'
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

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 })

// ── 1. TRM diaria ────────────────────────────────────────────────────────
console.log('📥 Cargando TRM Banrep…')
const TRM = new Map()
{
  const rl = createInterface({ input: createReadStream('C:/Users/IAN/Downloads/Tasa de cambio del peso colombiano.csv', 'utf8'), crlfDelay: Infinity })
  let header = true
  for await (const raw of rl) {
    const line = raw.replace(/^﻿/, '').trim()
    if (!line) continue
    if (header) { header = false; continue }
    const parts = line.split(';')
    if (parts.length < 2) continue
    const date = parts[0].replace(/"/g, '').trim()
    const val  = parts[1].replace(/"/g, '').replace(/\./g, '').replace(',', '.').trim()
    const trm  = parseFloat(val)
    if (!trm || !date) continue
    TRM.set(date.replace(/\//g, '-'), trm)
  }
}
console.log(`   ${TRM.size.toLocaleString()} fechas TRM`)
const trmFor = (isoDate) => {
  if (TRM.has(isoDate)) return TRM.get(isoDate)
  const d = new Date(isoDate + 'T00:00:00Z')
  for (let i = 1; i <= 7; i++) {
    const back = new Date(d.getTime() - i * 86400000).toISOString().slice(0, 10)
    if (TRM.has(back)) return TRM.get(back)
  }
  return null
}

// ── 2. dim_producto ──────────────────────────────────────────────────────
console.log('\n📥 Cargando dim_producto…')
const dimRes = await pool.query(`SELECT codigo_barras, sku, descripcion, categoria, subcategoria FROM dim_producto WHERE codigo_barras IS NOT NULL`)
const dimMap = new Map()
for (const r of dimRes.rows) dimMap.set(r.codigo_barras, r)
console.log(`   ${dimMap.size} productos`)

const UPC_OVERRIDE = {
  '53000057253':  '5300005275',
  '53000071884':  '530000718800',
  '5300003502':   '53000003502',
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

// ── 3. Leer XLSX ──────────────────────────────────────────────────────────
const PATH = process.argv[2] || 'C:/Users/IAN/Downloads/SELL OUT BORDEN COLOMBIA DEL 01 AL 30-04-26.xlsx'
console.log(`\n📂 ${PATH.split('/').pop()}`)
const wb = XLSX.readFile(PATH)
const ws = wb.Sheets[wb.SheetNames[0]]
const xrows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
console.log(`   ${xrows.length.toLocaleString()} filas`)

// Header: 0:PAIS 1:CLIENTE 2:CADENA 3:SUBCANAL 4:CATEGORIA 5:FORMATO 6:COD.PDV
//         7:PUNTO DE VENTA 8:PLU 9:CODIGO DE BARRAS 10:DESCRIPCION
//         11:AÑO 12:MES 13:DIA 14:VENTA UNIDADES DIA 15:VENTA VALOR

let leidas = 0, sinMatch = 0, sinTrm = 0, sinFecha = 0, ceros = 0
const rows = []
const sinUpcs = new Set(), sinTrmDates = new Set()
const mesesEnArchivo = new Set()

for (let i = 1; i < xrows.length; i++) {
  const r = xrows[i]
  if (!r || !r.length) continue
  leidas++

  const pais     = String(r[0] ?? '').trim()
  const cliente  = String(r[1] ?? '').trim() || 'GRUPO ÉXITO'
  const cadena   = String(r[2] ?? '').trim()
  const subcanal = String(r[3] ?? '').trim()
  const formato  = String(r[5] ?? '').trim()
  const puntoVta = String(r[7] ?? '').trim()
  const cbRaw    = String(r[9] ?? '').trim()
  const ano      = Number(r[11])
  const mes      = Number(r[12])
  const dia      = Number(r[13])
  const und      = Number(r[14]) || 0
  const cop      = Number(r[15]) || 0

  if (!ano || !mes || !dia) { sinFecha++; continue }
  if (und === 0 && cop === 0) { ceros++; continue }

  const dim = matchDim(cbRaw)
  if (!dim) { sinMatch++; sinUpcs.add(cbRaw); continue }

  const fecha = `${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`
  const trm = trmFor(fecha)
  if (!trm) { sinTrm++; sinTrmDates.add(fecha); continue }
  const usd = Math.round((cop / trm) * 100) / 100
  mesesEnArchivo.add(`${ano}-${mes}`)

  rows.push({
    pais, cliente,
    cadena,
    formato: formato || subcanal,
    subformato: subcanal,
    categoria: dim.categoria,
    subcategoria: dim.subcategoria,
    punto_venta: puntoVta,
    codigo_barras: dim.codigo_barras,
    sku: dim.sku,
    descripcion: dim.descripcion,
    ano, mes, dia,
    ventas_unidades: und,
    ventas_valorusd: usd,
    venta_valorcop: cop,
    tasa_cambio: trm,
  })
}
console.log(`\n📊 Stats:`)
console.log(`   leídas:     ${leidas.toLocaleString()}`)
console.log(`   sin match:  ${sinMatch.toLocaleString()}`)
console.log(`   sin TRM:    ${sinTrm.toLocaleString()}`)
console.log(`   sin fecha:  ${sinFecha.toLocaleString()}`)
console.log(`   0/0:        ${ceros.toLocaleString()}`)
console.log(`   ✅ válidas: ${rows.length.toLocaleString()}`)
if (sinUpcs.size) console.log(`   UPCs sin match: ${[...sinUpcs].slice(0, 15).join(', ')}`)
if (sinTrmDates.size) console.log(`   Fechas sin TRM: ${[...sinTrmDates].slice(0, 5).join(', ')}`)

// Aggregate
const aggMap = new Map()
for (const r of rows) {
  const k = `${r.ano}-${r.mes}-${r.dia}|${r.punto_venta}|${r.codigo_barras}`
  const prev = aggMap.get(k)
  if (prev) {
    prev.ventas_unidades += r.ventas_unidades
    prev.ventas_valorusd += r.ventas_valorusd
    prev.venta_valorcop  += r.venta_valorcop
  } else aggMap.set(k, { ...r })
}
const agg = [...aggMap.values()]
if (agg.length < rows.length) console.log(`   🔀 agregado: ${rows.length.toLocaleString()} → ${agg.length.toLocaleString()}`)

const sumUSD = agg.reduce((s, r) => s + r.ventas_valorusd, 0)
const sumCOP = agg.reduce((s, r) => s + r.venta_valorcop, 0)
console.log(`   💰 a insertar: COP ${sumCOP.toLocaleString('es-CO')} · $${sumUSD.toLocaleString('en-US', {maximumFractionDigits:2})}`)

const monthList = [...mesesEnArchivo].sort()
console.log(`\n🗑️  Borrando fact_ventas_exito (CO, meses: ${monthList.join(', ')})…`)
let totalDel = 0
for (const k of monthList) {
  const [a, m] = k.split('-').map(Number)
  const d = await pool.query(`DELETE FROM fact_ventas_exito WHERE pais='CO' AND ano=$1 AND mes=$2`, [a, m])
  totalDel += d.rowCount
}
console.log(`   ${totalDel.toLocaleString()} filas borradas`)

console.log(`\n📥 Insertando ${agg.length.toLocaleString()} filas…`)
const BATCH = 1000
for (let i = 0; i < agg.length; i += BATCH) {
  const chunk = agg.slice(i, i + BATCH)
  const vals = [], params = []
  let p = 1
  for (const r of chunk) {
    vals.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`)
    params.push(
      r.pais, r.cliente, r.cadena, r.formato, r.subformato,
      r.categoria, r.subcategoria,
      r.punto_venta, r.codigo_barras, r.sku, r.descripcion,
      r.ano, r.mes, r.dia,
      r.ventas_unidades, r.ventas_valorusd, r.venta_valorcop, r.tasa_cambio
    )
  }
  await pool.query(`
    INSERT INTO fact_ventas_exito
      (pais, cliente, cadena, formato, subformato, categoria, subcategoria, punto_venta, codigo_barras, sku, descripcion, ano, mes, dia, ventas_unidades, ventas_valorusd, venta_valorcop, tasa_cambio)
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

console.log('\n🔎 fact_ventas_exito 2026 por mes:')
const ver = await pool.query(`
  SELECT ano, mes, COUNT(*) AS n,
         ROUND(SUM(venta_valorcop)::numeric, 0) AS cop,
         ROUND(SUM(ventas_valorusd)::numeric, 0) AS usd
  FROM fact_ventas_exito
  WHERE pais='CO' AND ano IN (2025, 2026)
  GROUP BY ano, mes ORDER BY ano, mes
`)
let TN=0, TC=0, TV=0
for (const x of ver.rows) {
  console.log(`   ${x.ano}-${String(x.mes).padStart(2,'0')}: ${Number(x.n).toLocaleString().padStart(7)} filas · COP ${Number(x.cop).toLocaleString('es-CO')} · $${Number(x.usd).toLocaleString()}`)
  TN += Number(x.n); TC += Number(x.cop); TV += Number(x.usd)
}
console.log(`   TOT: ${TN.toLocaleString()} filas · COP ${TC.toLocaleString('es-CO')} · $${TV.toLocaleString()}`)

await pool.end()
console.log('\n🎉 Carga ÉXITO abril 2026 completa')
