/**
 * gen-coberturas-v2.mjs
 * Genera coberturas Walmart por país (CR/GT/HN/NI/SV).
 * Input:
 *   DCD:        ph1yt6k_111252398 (CEDI inventory por país×UPC)
 *   Surtido-Inv: ph1yt6k_111252357 (PDV inventory por store×UPC)
 *
 * Output:
 *   C:/Users/IAN/Downloads/Cobertura_<PAIS>_<YYYY-MM-DD>.xlsx
 *
 * Sheets por país:
 *   - Quiebres (Inv UND = 0)
 *
 * Sheets adicionales solo CR:
 *   - INVENTARIO BAJO   (Inv UND entre 1 y 5)
 *   - SKU X PDV         (lista plana PDV/SKU/Descripción/Inventario activos)
 *   - SIN VENTAS 1 SEMANA (PDV×SKU activos sin venta últimos 7 días)
 */
import XLSX from 'xlsx'
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
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const DCD_PATH = 'C:/Users/IAN/Downloads/ph1yt6k_111252398_968CDCD1XCF52X47FDX8B83X00290A6DBC8C.xls'
const SURTIDO_PATH = 'C:/Users/IAN/Downloads/ph1yt6k_111252357_ADC409D9X3316X4324XAB9FX5A9704345776.xls'

const today = new Date()
const fechaIso = today.toISOString().slice(0, 10)
const fechaHuman = today.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })

// ── Mapeo Financial Rpt Code → prefijo BD por país ────────────────────────
//   HM=WM, ME=MXM, MI=MP, PI=PALI, PZ=PAIZ, DF=DF, LJ=DDJ, LN=UNION
const RPT_PREFIX = {
  HM: 'WM', ME: 'MXM', MI: 'MP', PI: 'PALI',
  PZ: 'PAIZ', DF: 'DF', LJ: 'DDJ', LN: 'UNION',
}
const dbPunto = (country, finRpt, storeName) => {
  const pfx = RPT_PREFIX[finRpt] || finRpt
  // Mucho store name ya viene como "WM SANTA ANA" — pero algunos vienen sin prefijo
  // Quitar prefijo duplicado si ya está
  let name = storeName.trim()
  // Quitar prefijo si viene
  for (const k of Object.values(RPT_PREFIX)) {
    if (name.startsWith(k + ' ')) { name = name.slice(k.length + 1); break }
  }
  return `${country}-${pfx} ${name}`
}

// ── 1. dim_producto (para match UPC) ─────────────────────────────────────
console.log('📥 Cargando dim_producto…')
const dimRes = await pool.query(`SELECT codigo_barras, sku, descripcion FROM dim_producto WHERE codigo_barras IS NOT NULL`)
const dimMap = new Map()
for (const r of dimRes.rows) dimMap.set(r.codigo_barras, r)
console.log(`   ${dimMap.size} productos`)

const UPC_OVERRIDE = {
  '5300003502':   '53000003502',
  '53000057253':  '5300005275',
  '53000071884':  '530000718800',
}
const matchUpc = (raw) => {
  const stripped = raw.replace(/^0+/, '')
  if (UPC_OVERRIDE[stripped]) return UPC_OVERRIDE[stripped]
  if (dimMap.has(stripped)) return stripped
  if (dimMap.has(raw)) return raw
  for (let d = 0; d <= 9; d++) {
    if (dimMap.has(stripped + String(d))) return stripped + String(d)
  }
  return null
}

// ── 2. Leer DCD → mapa por país+UPC → cases CEDI ──────────────────────────
console.log(`\n📂 Leyendo DCD: ${DCD_PATH.split('/').pop()}`)
const wbDcd = XLSX.readFile(DCD_PATH)
const wsDcd = wbDcd.Sheets[wbDcd.SheetNames[0]]
const rowsDcd = XLSX.utils.sheet_to_json(wsDcd, { header: 1, defval: '' })

let hDcd = -1
for (let i = 0; i < Math.min(50, rowsDcd.length); i++) {
  if (rowsDcd[i][0] === 'Country Code') { hDcd = i; break }
}
if (hDcd < 0) throw new Error('No encontré headers en DCD')
const headersDcd = rowsDcd[hDcd].map(c => String(c).trim())
const dIdx = (name) => headersDcd.indexOf(name)
const COL_DCD = {
  country: dIdx('Country Code'),
  upc:     dIdx('UPC'),
  onHand:  dIdx('Current WHSE On Hand Cases'),
}

const cediMap = new Map()
for (let i = hDcd + 1; i < rowsDcd.length; i++) {
  const r = rowsDcd[i]
  const country = String(r[COL_DCD.country] ?? '').trim()
  if (!country || country.length !== 2) continue
  const upc = String(r[COL_DCD.upc] ?? '').trim()
  cediMap.set(`${country}|${upc}`, Number(r[COL_DCD.onHand]) || 0)
}
console.log(`   ${cediMap.size} entradas CEDI`)

// ── 3. Leer Surtido-Inv ───────────────────────────────────────────────────
console.log(`\n📂 Leyendo Surtido-Inv: ${SURTIDO_PATH.split('/').pop()}`)
const wbSur = XLSX.readFile(SURTIDO_PATH)
const wsSur = wbSur.Sheets[wbSur.SheetNames[0]]
const rowsSur = XLSX.utils.sheet_to_json(wsSur, { header: 1, defval: '' })

let hSur = -1
for (let i = 0; i < Math.min(50, rowsSur.length); i++) {
  if (rowsSur[i][0] === 'Country Code') { hSur = i; break }
}
if (hSur < 0) throw new Error('No encontré headers en Surtido-Inv')
const headersSur = rowsSur[hSur].map(c => String(c).trim())
const sIdx = (name) => headersSur.indexOf(name)
const COL_SUR = {
  country:   sIdx('Country Code'),
  finRpt:    sIdx('Financial Rpt Code'),
  storeNbr:  sIdx('Store Nbr'),
  storeName: sIdx('Store Name'),
  upc:       sIdx('UPC'),
  desc:      sIdx('Signing Desc'),
  onHand:    sIdx('Curr Str On Hand Qty'),
  transit:   sIdx('Curr Str In Transit Qty'),
  status:    sIdx('Item Status'),
}

// Por país agrupar 3 listas:
// - quiebres:  inv = 0
// - bajos:     inv 1..5
// - activos:   inv >= 0 (todas las activas para SKU x PDV y sin ventas)
const byPais = {}  // pais → { quiebres, bajos, activos, pdvSkuSet: Set('pdv|canonUpc') }
let totalSur = 0
for (let i = hSur + 1; i < rowsSur.length; i++) {
  const r = rowsSur[i]
  const country = String(r[COL_SUR.country] ?? '').trim()
  if (!country || country.length !== 2) continue
  const status = String(r[COL_SUR.status] ?? '').trim()
  if (status !== 'A') continue  // solo Activos
  totalSur++

  const onHand   = Number(r[COL_SUR.onHand]) || 0
  const finRpt   = String(r[COL_SUR.finRpt] ?? '').trim()
  const storeNbr = String(r[COL_SUR.storeNbr] ?? '').trim()
  const storeName= String(r[COL_SUR.storeName] ?? '').trim()
  const upc      = String(r[COL_SUR.upc] ?? '').trim()
  const desc     = String(r[COL_SUR.desc] ?? '').trim()
  const transit  = Number(r[COL_SUR.transit]) || 0
  const cedi     = cediMap.get(`${country}|${upc}`) ?? ''
  const punto    = dbPunto(country, finRpt, storeName)
  const canonUpc = matchUpc(upc)

  if (!byPais[country]) byPais[country] = { quiebres: [], bajos: [], activos: [], pdvSkuSet: new Set() }
  const grp = byPais[country]

  const rowOut = {
    'Tienda #':        storeNbr,
    'Tienda':          punto,
    'UPC':             upc,
    'Descripción':     desc,
    'Inventario UND':  onHand,
    'Tránsito':        transit,
    'CEDI':            cedi,
    'Precio de Venta': '',
    'DOH (8 días)':    '',
  }

  if (onHand === 0)              grp.quiebres.push(rowOut)
  else if (onHand >= 1 && onHand <= 5) grp.bajos.push(rowOut)

  grp.activos.push({ punto, sku: canonUpc, upc, desc, inv: onHand })
  if (canonUpc) grp.pdvSkuSet.add(`${punto}|${canonUpc}`)
}
console.log(`\n📊 Filas activas Surtido: ${totalSur.toLocaleString()}`)
for (const p of Object.keys(byPais).sort()) {
  const g = byPais[p]
  console.log(`   ${p}: ${g.quiebres.length} quiebres · ${g.bajos.length} bajos · ${g.activos.length} activas`)
}

// ── 4. Query a BD: última venta por PDV×codigo_barras (todo el histórico CR) ─
console.log(`\n🔎 Última venta histórica CR…`)
const ventasRes = await pool.query(`
  SELECT punto_venta, codigo_barras, MAX(fecha)::date AS ultima_venta
  FROM fact_ventas_walmart
  WHERE pais='CR'
  GROUP BY punto_venta, codigo_barras
`)
const ultimaVentaMap = new Map()
for (const x of ventasRes.rows) {
  const d = new Date(x.ultima_venta).toISOString().slice(0, 10)
  ultimaVentaMap.set(`${x.punto_venta}|${x.codigo_barras}`, d)
}
console.log(`   ${ultimaVentaMap.size.toLocaleString()} combinaciones PDV×SKU con histórico de ventas`)
const corteIso = new Date(today.getTime() - 7 * 86400000).toISOString().slice(0, 10)
console.log(`   Corte: última venta < ${corteIso} (más de 7 días)`)

// ── 5. Construir filas SIN VENTAS para CR ─────────────────────────────────
const crGrp = byPais['CR']
const sinVentas = []
let matchedActivos = 0, unmatchedUpcs = new Set()
if (crGrp) {
  for (const a of crGrp.activos) {
    if (!a.sku) { unmatchedUpcs.add(a.upc); continue }
    matchedActivos++
    const k = `${a.punto}|${a.sku}`
    const ultima = ultimaVentaMap.get(k) ?? null
    // Sin venta si: nunca vendió, o la última fue antes del corte (>7 días)
    if (!ultima || ultima < corteIso) {
      sinVentas.push({
        'Tienda':        a.punto,
        'UPC':           a.upc,
        'SKU':           a.sku,
        'Descripción':   a.desc,
        'Inventario':    a.inv,
        'Última Venta':  ultima ?? 'Sin ventas registradas',
      })
    }
  }
  // Ordenar: más reciente primero, "Sin ventas" al final
  sinVentas.sort((a, b) => {
    const ax = a['Última Venta'], bx = b['Última Venta']
    if (ax === 'Sin ventas registradas' && bx !== 'Sin ventas registradas') return 1
    if (bx === 'Sin ventas registradas' && ax !== 'Sin ventas registradas') return -1
    return bx.localeCompare(ax)
  })
  console.log(`   CR activas con match dim: ${matchedActivos.toLocaleString()}`)
  if (unmatchedUpcs.size) console.log(`   UPCs sin match dim (omitidos): ${[...unmatchedUpcs].slice(0,5).join(', ')}…`)
  console.log(`   Sin ventas últimos 7 días: ${sinVentas.length.toLocaleString()}`)
}

// ── 6. Generar Excel por país ─────────────────────────────────────────────
const outDir = 'C:/Users/IAN/Downloads'
const colsInv = ['Tienda #','Tienda','UPC','Descripción','Inventario UND','Tránsito','CEDI','Precio de Venta','DOH (8 días)']
const colsSku = ['Tienda','UPC','SKU','Descripción','Inventario']
const colsSinVtas = ['Tienda','UPC','SKU','Descripción','Inventario','Última Venta']

const makeSheet = (titulo, subtitulo, cols, rows) => {
  const aoa = [
    [titulo],
    [subtitulo],
    cols,
    ...rows.map(r => cols.map(c => r[c])),
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: cols.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: cols.length - 1 } },
  ]
  return ws
}

for (const pais of Object.keys(byPais).sort()) {
  const grp = byPais[pais]
  const wb = XLSX.utils.book_new()

  // 1) Quiebres
  const wsQ = makeSheet(
    `Quiebres de Stock - Queso (${grp.quiebres.length} casos)`,
    `Fecha del reporte: ${fechaHuman} · Datos: RetailLink Surtido-Inv`,
    colsInv, grp.quiebres
  )
  wsQ['!cols'] = [
    { wch: 10 }, { wch: 30 }, { wch: 16 }, { wch: 48 },
    { wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 14 },
  ]
  XLSX.utils.book_append_sheet(wb, wsQ, 'Quiebres')

  // Solo para CR: 3 sheets extra
  if (pais === 'CR') {
    // 2) INVENTARIO BAJO
    const wsB = makeSheet(
      `Inventario Bajo - Queso (${grp.bajos.length} casos, 1 a 5 unidades)`,
      `Fecha del reporte: ${fechaHuman}`,
      colsInv, grp.bajos
    )
    wsB['!cols'] = wsQ['!cols']
    XLSX.utils.book_append_sheet(wb, wsB, 'INVENTARIO BAJO')

    // 3) SKU X PDV (lista plana)
    const skuPdvRows = grp.activos.map(a => ({
      'Tienda':      a.punto,
      'UPC':         a.upc,
      'SKU':         a.sku ?? '',
      'Descripción': a.desc,
      'Inventario':  a.inv,
    }))
    const wsP = makeSheet(
      `SKU x PDV - Inventario activos (${skuPdvRows.length} filas)`,
      `Fecha del reporte: ${fechaHuman}`,
      colsSku, skuPdvRows
    )
    wsP['!cols'] = [{ wch: 32 }, { wch: 18 }, { wch: 14 }, { wch: 48 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, wsP, 'SKU X PDV')

    // 4) SIN VENTAS 1 SEMANA
    const wsS = makeSheet(
      `Sin ventas últimos 7 días (${sinVentas.length} combinaciones)`,
      `Fecha del reporte: ${fechaHuman} · Corte: última venta < ${corteIso} · Fuente: fact_ventas_walmart`,
      colsSinVtas, sinVentas
    )
    wsS['!cols'] = [{ wch: 32 }, { wch: 18 }, { wch: 14 }, { wch: 48 }, { wch: 12 }, { wch: 22 }]
    XLSX.utils.book_append_sheet(wb, wsS, 'SIN VENTAS EN 1 SEMANA')
  }

  const outPath = `${outDir}/Cobertura_${pais}_${fechaIso}.xlsx`
  XLSX.writeFile(wb, outPath)
  const extra = pais === 'CR' ? ` + Bajos(${grp.bajos.length}) + SKUxPDV(${grp.activos.length}) + SinVtas(${sinVentas.length})` : ''
  console.log(`  📄 ${outPath}  Quiebres(${grp.quiebres.length})${extra}`)
}

await pool.end()
console.log('\n🎉 Coberturas generadas')
