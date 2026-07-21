/**
 * gen-cobertura-cr-v4.mjs
 * Cobertura CR Walmart (5 pestañas: SKU X PDV, Quiebres, Inv Bajo, Sin Ventas, Precio Sugerido)
 * Item ID = Item Nbr Walmart (crosswalk UPC ↔ Item Nbr).
 */
import pg from 'pg'
import XLSX from 'xlsx'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
// Cargar .env.local si existe (dev local). En GH Actions viene por process.env directamente.
try {
  const env = readFileSync(join(__dirname, '../.env.local'), 'utf8')
  for (const raw of env.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
  }
} catch { /* .env.local no existe (CI) — asumir process.env ya seteado */ }
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const today = new Date()
const fechaIso = today.toISOString().slice(0, 10)
const fechaHuman = today.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })

// ── Crosswalk UPC → Item Nbr + categoría + signing desc ─────────────────
// 36 productos del anexo A del spec
const CROSSWALK = {
  '0005300000051': { itemNbr: '75332129', categoria: 'Quesos',  desc: 'BORDEN QUESO CHEDDAR CHUNK TROCEAD 226GR' },
  '0005300000063': { itemNbr: '75332130', categoria: 'Quesos',  desc: 'BORDN QUESO COLBY MONTEREY TROCEA 226GR' },
  '0005300000068': { itemNbr: '75332131', categoria: 'Quesos',  desc: 'BORDEN QUESO PEPPER JACK  TROCEAD 226GR' },
  '0005300006708': { itemNbr: '75332132', categoria: 'Quesos',  desc: 'BORDEN QUESO GOUDA CHUNK TROCEADO 226GR' },
  '0005300007162': { itemNbr: '75332133', categoria: 'Quesos',  desc: 'BORDEN QUESO MOZZARELLA RALLADO 226GR' },
  '0005300006886': { itemNbr: '75332134', categoria: 'Quesos',  desc: 'BORDEN QUESO MEXICBLEND FINE RALL 226GR' },
  '0005300005264': { itemNbr: '75332136', categoria: 'Quesos',  desc: 'BORDEN QUESO MILDCHEDDAR REG RALLAD226GR' },
  '0005300006829': { itemNbr: '75332139', categoria: 'Quesos',  desc: 'BORDEN QUESO PIZZA RALLADO 198GR' },
  '0005300005236': { itemNbr: '75332140', categoria: 'Quesos',  desc: 'BORDEN  QUESO CHEDDAR REBANADO 170GR' },
  '0005300006728': { itemNbr: '75332141', categoria: 'Quesos',  desc: 'BORDEN  QUESO GOUDA REBANADO 170GR' },
  '0005300007636': { itemNbr: '75332142', categoria: 'Quesos',  desc: 'BORDEN QUESO SMOKED PROVOL REBANA 170GR' },
  '0005300007140': { itemNbr: '75332144', categoria: 'Quesos',  desc: 'BORDEN QUESO MOZZARELLA REBANADO 170GR' },
  '0005300006406': { itemNbr: '75332145', categoria: 'Quesos',  desc: 'BORDEN QUESO MUENSTER REBANADO 170GR' },
  '0005300005735': { itemNbr: '75332146', categoria: 'Quesos',  desc: 'BORDEN QUESO AMERICAN REBANADO 340GR' },
  '0745210597001': { itemNbr: '75348315', categoria: 'Leches',  desc: 'BORDEN LECHE ENTERA 1000 ML' },
  '0745210597002': { itemNbr: '75348316', categoria: 'Leches',  desc: 'BORDEN LECHE SEMIDRESCRE 1000 ML' },
  '0745210597003': { itemNbr: '75348317', categoria: 'Leches',  desc: 'BORDEN LECHE DESCREMADA 1000 ML' },
  '0745210597004': { itemNbr: '75348318', categoria: 'Leches',  desc: 'BORDEN LECHE DESCREMADA DESLAC 1000 ML' },
  '0745210597005': { itemNbr: '75348319', categoria: 'Leches',  desc: 'BORDEN LECHE SEMIDESCRE DESLAC1000 ML' },
  '0745210597006': { itemNbr: '75348320', categoria: 'Leches',  desc: 'BORDEN 3 PK LECHE ENTERA 3000 ML' },
  '0745210597007': { itemNbr: '75348321', categoria: 'Leches',  desc: 'BORDEN 3 PK LECHE SEMIDRESCRE 3000 ML' },
  '0745210597008': { itemNbr: '75348322', categoria: 'Leches',  desc: 'BORDEN 3 PK LECHE DESCREMADA 3000 ML' },
  '0745210597009': { itemNbr: '75348324', categoria: 'Leches',  desc: 'BORDEN 3 PK LECHE DES DESLAC 3000 ML' },
  '0745210597010': { itemNbr: '75348325', categoria: 'Leches',  desc: 'BORDEN 3PK LECHE SEMI DESLAC 3000 ML' },
  '0745210597013': { itemNbr: '75348326', categoria: 'Leches',  desc: 'BORDEN 12 PK LECHE DESCREMADA 12000 ML' },
  '0745210597014': { itemNbr: '75348327', categoria: 'Leches',  desc: 'BORDEN 12 PK LECHE SEMIDRESCRE 12000 ML' },
  '0745210597031': { itemNbr: '75348328', categoria: 'Leches',  desc: 'BORDEN 12 PK LECHE ENTERA 12000 ML' },
  '0745210597032': { itemNbr: '75348329', categoria: 'Leches',  desc: 'BORDEN 12 PK LECHE SEMI DESLAC 12000 ML' },
  '0005300007514': { itemNbr: '75410201', categoria: 'Quesos',  desc: 'BORDEN QUESO PARMESANO 142GR' },
  '0005300001636': { itemNbr: '75464260', categoria: 'Quesos',  desc: 'QUESO BORDEN TIP AMER BLANC 16REB 226 GR' },
  '0005300000043': { itemNbr: '75464261', categoria: 'Quesos',  desc: 'QUESO BORDEB TIPO MOZARELLA SNACK 340 GR' },
  '0005300006303': { itemNbr: '75464264', categoria: 'Quesos',  desc: 'QUESO BORDEN TIPO CHEDDAR SNACK 212 GR' },
  '0744113401785': { itemNbr: '75472027', categoria: 'Helados', desc: 'HELADO COOKIE AND CREAM BORDEN 320GR' },
  '0744113401782': { itemNbr: '75472028', categoria: 'Helados', desc: 'HELADO EXPLOS DE FRESA BORDEN 320GR' },
  '0744113401784': { itemNbr: '75472029', categoria: 'Helados', desc: 'HELADO TRIPLE CHOCO BROW ALM BORD 320GR' },
  '0744113401783': { itemNbr: '75472030', categoria: 'Helados', desc: 'HELADO VAINILLA CARAM CRUCH BORDEN 320GR' },
}

// ── Innovaciones por UPC ────────────────────────────────────────────────
const INNOVACION_UPC = new Set([
  '0005300001636', // QUESO AMERC BLANC REBANADO 226GR
  '0005300006303', // COLBY JACK BARRA SNACK 212 GR
  '0005300000043', // QUESO STRING BARRITA 340GR
])

// ── Ofertas para sheet Precio Sugerido ──────────────────────────────────
const OFERTAS = [
  // Ventana 1: 22 Jun – 06 Jul
  { itemNbr: '75464260', precio: 2290,      mecanica: 'Precio',                  vigencia: '22 Jun – 06 Jul' },
  { itemNbr: '75464264', precio: 2690,      mecanica: 'Precio',                  vigencia: '22 Jun – 06 Jul' },
  { itemNbr: '75464261', precio: 3590,      mecanica: 'Precio',                  vigencia: '22 Jun – 06 Jul' },
  // Ventana 2: 07 Jul – 21 Jul
  { itemNbr: '75332129', precio: 1990,      mecanica: 'Precio mágico troceados', vigencia: '07 Jul – 21 Jul' },
  { itemNbr: '75332130', precio: 1990,      mecanica: 'Precio mágico troceados', vigencia: '07 Jul – 21 Jul' },
  { itemNbr: '75332131', precio: 1990,      mecanica: 'Precio mágico troceados', vigencia: '07 Jul – 21 Jul' },
  { itemNbr: '75332132', precio: 1990,      mecanica: 'Precio mágico troceados', vigencia: '07 Jul – 21 Jul' },
  { itemNbr: '75332140', precio: 1990,      mecanica: 'Precio mágico rebanados', vigencia: '07 Jul – 21 Jul' },
  { itemNbr: '75332146', precio: 1990,      mecanica: 'Precio mágico rebanados', vigencia: '07 Jul – 21 Jul' },
  { itemNbr: '75332145', precio: 1990,      mecanica: 'Precio mágico rebanados', vigencia: '07 Jul – 21 Jul' },
  { itemNbr: '75332141', precio: 1990,      mecanica: 'Precio mágico rebanados', vigencia: '07 Jul – 21 Jul' },
  { itemNbr: '75332144', precio: 1990,      mecanica: 'Precio mágico rebanados', vigencia: '07 Jul – 21 Jul' },
  { itemNbr: '75332142', precio: 1990,      mecanica: 'Precio mágico rebanados', vigencia: '07 Jul – 21 Jul' },
  // Ventana 3: 22 Jul – 05 Ago
  { itemNbr: '75332136', precio: '2x ₡3,500', mecanica: 'Pagar 2 por ₡3,500 rallados', vigencia: '22 Jul – 05 Ago' },
  { itemNbr: '75332139', precio: '2x ₡3,500', mecanica: 'Pagar 2 por ₡3,500 rallados', vigencia: '22 Jul – 05 Ago' },
  { itemNbr: '75332134', precio: '2x ₡3,500', mecanica: 'Pagar 2 por ₡3,500 rallados', vigencia: '22 Jul – 05 Ago' },
  { itemNbr: '75332133', precio: '2x ₡3,500', mecanica: 'Pagar 2 por ₡3,500 rallados', vigencia: '22 Jul – 05 Ago' },
  { itemNbr: '75332146', precio: 1890,        mecanica: 'Precio mágico rebanados',     vigencia: '22 Jul – 05 Ago' },
  { itemNbr: '75410201', precio: 1690,        mecanica: 'Precio mágico parmesano',     vigencia: '22 Jul – 05 Ago' },
  { itemNbr: '75464260', precio: 2290,        mecanica: 'Precio',                      vigencia: '22 Jul – 05 Ago' },
  { itemNbr: '75464264', precio: 2690,        mecanica: 'Precio',                      vigencia: '22 Jul – 05 Ago' },
  { itemNbr: '75464261', precio: 3590,        mecanica: 'Precio',                      vigencia: '22 Jul – 05 Ago' },
]

// ── Formato por rptcode Walmart CR ──────────────────────────────────────
const FORMATO_CR = {
  HM: 'Walmart',
  ME: 'Mas X Menos',
  MI: 'Maxi Pali',
  PI: 'Pali',
}
const formatoFromRpt = (rpt) => FORMATO_CR[rpt] || ''
const RPT_PREFIX = { HM: 'WM', ME: 'MXM', MI: 'MP', PI: 'PALI' }
const dbPunto = (country, finRpt, storeName) => {
  const pfx = RPT_PREFIX[finRpt] || finRpt
  let name = (storeName || '').trim()
  for (const k of Object.values(RPT_PREFIX)) {
    if (name.startsWith(k + ' ')) { name = name.slice(k.length + 1); break }
  }
  return `${country}-${pfx} ${name}`
}

// ── 1. Snapshot inventario (tablas nuevas fact_inventario_walmart_*) ────
const fechaInvRes = await pool.query(
  `SELECT MAX(fecha)::date AS f FROM fact_inventario_walmart_pdv WHERE pais='CR'`,
)
const fechaInv = new Date(fechaInvRes.rows[0].f).toISOString().slice(0, 10)
console.log(`📅 Snapshot inventario: ${fechaInv}`)

// ── 2. CEDI por UPC ─────────────────────────────────────────────────────
console.log('\n📥 CEDI CR…')
const cediRes = await pool.query(`
  SELECT codigo_barras AS upc, inv_cajas AS inv_mano_cajas
  FROM fact_inventario_walmart_cedi
  WHERE pais='CR' AND fecha = (SELECT MAX(fecha) FROM fact_inventario_walmart_cedi WHERE pais='CR')
`)
const cediMap = new Map()
for (const r of cediRes.rows) {
  const raw = String(r.upc).trim()
  const stripped = raw.replace(/^0+/, '')
  const inv = Number(r.inv_mano_cajas) || 0
  // Indexamos por 3 formas: raw, sin leading zero, sin check digit — para
  // matchear tanto UPCs de la BD (con check) como los del CROSSWALK.
  cediMap.set(raw, inv)
  cediMap.set(stripped, inv)
  if (stripped.length > 1) cediMap.set(stripped.slice(0, -1), inv)
}
console.log(`   ${cediMap.size} entradas CEDI`)

// ── 3. Inventario PDV CR snapshot último ────────────────────────────────
// Nueva tabla: cadena / store_nbr / punto_venta / codigo_barras / inv_mano / inv_transito
console.log('\n📥 Inventario PDV CR…')
const invRes = await pool.query(`
  SELECT
    cadena              AS financial_rpt,
    store_nbr           AS tienda_nbr,
    punto_venta         AS tienda_nombre,
    codigo_barras       AS upc,
    inv_mano,
    inv_transito
  FROM fact_inventario_walmart_pdv
  WHERE pais='CR' AND fecha = $1::date
`, [fechaInv])
console.log(`   ${invRes.rows.length} filas`)

// ── 4. Ventas últimos 90 días + última venta por (PDV × UPC) ────────────
console.log('\n📥 Ventas CR…')
const ventasMap = new Map()      // key: pv|upc(canon) → { ult: 'YYYY-MM-DD', und90: n }
// Match UPC entre archivo (con padding) y BD (canónica)
const dimRes = await pool.query(`SELECT codigo_barras FROM dim_producto WHERE codigo_barras IS NOT NULL`)
const dimSet = new Set(dimRes.rows.map(r => r.codigo_barras))
const UPC_OVERRIDE = { '5300003502': '53000003502', '53000057253': '5300005275', '53000071884': '530000718800' }
const upcCanon = (raw) => {
  if (!raw) return null
  const s = String(raw).replace(/^0+/, '')
  if (UPC_OVERRIDE[s] && dimSet.has(UPC_OVERRIDE[s])) return UPC_OVERRIDE[s]
  if (dimSet.has(s)) return s
  for (let d = 0; d <= 9; d++) if (dimSet.has(s + d)) return s + d
  return null
}

const fechaInvDate = new Date(fechaInv + 'T00:00:00Z')
const cutVentas = new Date(fechaInvDate.getTime() - 90 * 86400000).toISOString().slice(0, 10)
const ventasRes = await pool.query(`
  SELECT punto_venta, codigo_barras, MAX(fecha)::date AS ultima, SUM(ventas_unidades) AS und
  FROM fact_ventas_walmart
  WHERE pais='CR' AND fecha >= $1::date
  GROUP BY punto_venta, codigo_barras
`, [cutVentas])
for (const v of ventasRes.rows) {
  const pv = v.punto_venta.startsWith('CR-') ? v.punto_venta : `CR-${v.punto_venta}`
  const k = `${pv}|${v.codigo_barras}`
  const d = new Date(v.ultima).toISOString().slice(0, 10)
  const prev = ventasMap.get(k)
  const und90 = Number(v.und) || 0
  if (!prev || d > prev.ult) {
    ventasMap.set(k, { ult: d, und90 })
  } else {
    prev.und90 += und90
  }
}
console.log(`   ${ventasMap.size} combinaciones PDV×SKU con ventas 90d`)

// Última venta total por (PDV × SKU) — sin restricción 90d (para sheet Sin Ventas).
// CRÍTICO: filtramos ventas_unidades > 0 porque la BD guarda filas con uds=0
// cuando RetailLink reporta "no movimiento ese día". Sin este filtro, MAX(fecha)
// devuelve la fecha más reciente con fila (no con venta real) y todas las
// combinaciones aparecen como "vendidas ayer", vaciando la pestaña.
const ultRes = await pool.query(`
  SELECT punto_venta, codigo_barras, MAX(fecha)::date AS ultima
  FROM fact_ventas_walmart
  WHERE pais='CR' AND ventas_unidades > 0
  GROUP BY punto_venta, codigo_barras
`)
const ultMap = new Map()
for (const v of ultRes.rows) {
  const pv = v.punto_venta.startsWith('CR-') ? v.punto_venta : `CR-${v.punto_venta}`
  const k = `${pv}|${v.codigo_barras}`
  const d = new Date(v.ultima).toISOString().slice(0, 10)
  const prev = ultMap.get(k)
  if (!prev || d > prev) ultMap.set(k, d)
}

// ── 5. Pareto 80/20 últimos 3 meses · POR CATEGORÍA ─────────────────────
// Cada categoría (Quesos / Leches / Helados) tiene su propio 80/20.
// Mapeamos cada codigo_barras a la categoría del CROSSWALK (canónico).
const ultFecha = (await pool.query(`SELECT MAX(fecha)::date AS f FROM fact_ventas_walmart WHERE pais='CR'`)).rows[0].f
const cut3m = new Date(new Date(ultFecha).getTime() - 90 * 86400000).toISOString().slice(0, 10)

// codigo_barras canónico → categoría (desde CROSSWALK)
const cbToCat = {}
for (const [upc, cw] of Object.entries(CROSSWALK)) {
  const canon = upcCanon(upc)
  if (canon) cbToCat[canon] = cw.categoria
}

const ventas90 = await pool.query(`
  SELECT codigo_barras, SUM(ventas_valor) AS usd
  FROM fact_ventas_walmart
  WHERE pais='CR' AND fecha >= $1::date AND codigo_barras IS NOT NULL
  GROUP BY codigo_barras
`, [cut3m])

// Agrupar por categoría
const ventasPorCat = {}  // { Quesos: [{cb, usd}, ...], Leches: [...], Helados: [...] }
for (const r of ventas90.rows) {
  const cat = cbToCat[r.codigo_barras]
  if (!cat) continue
  if (!ventasPorCat[cat]) ventasPorCat[cat] = []
  ventasPorCat[cat].push({ cb: r.codigo_barras, usd: Number(r.usd) || 0 })
}

// Pareto 80% dentro de cada categoría
// Convención: incluir SKUs cuyo acumulado ≤ 80% — el SKU que cruza el umbral
// SE INCLUYE para garantizar que el set realmente cubre ≥ 80%.
const pareto80CB = new Set()
const paretoStats = {}
for (const cat of Object.keys(ventasPorCat)) {
  const sorted = ventasPorCat[cat].sort((a, b) => b.usd - a.usd)
  const total  = sorted.reduce((s, r) => s + r.usd, 0)
  let cum = 0
  let count = 0
  for (const r of sorted) {
    cum += r.usd
    pareto80CB.add(r.cb)
    count++
    if (total > 0 && cum / total >= 0.80) break
  }
  paretoStats[cat] = { skus_total: sorted.length, skus_pareto: count, usd_total: total }
}

console.log(`\n🎯 Pareto 80/20 por categoría (CR · últimos 90 días):`)
for (const cat of Object.keys(paretoStats)) {
  const s = paretoStats[cat]
  console.log(`   ${cat}: ${s.skus_pareto}/${s.skus_total} SKUs · $${Math.round(s.usd_total).toLocaleString()}`)
}
console.log(`   Total códigos marcados 80/20: ${pareto80CB.size}`)

// ── 6. Construir filas con todos los datos ──────────────────────────────
// CROSSWALK original tiene UPCs con leading zero y sin check digit
// (ej: '0005300000051'). La tabla nueva fact_inventario_walmart_pdv trae
// UPCs sin leading zero y con check digit (ej: '53000000518'). Construimos
// un índice normalizado (strip leading zeros; opcionalmente quitar 1 dígito
// final por si trae check).
const stripLeading = (s) => String(s).replace(/^0+/, '')
const CROSSWALK_NORM = {}
for (const [k, v] of Object.entries(CROSSWALK)) {
  CROSSWALK_NORM[stripLeading(k)] = v
}
const cwLookup = (raw) => {
  const s = stripLeading(raw)
  return CROSSWALK_NORM[s]              // match directo
      || CROSSWALK_NORM[s.slice(0, -1)] // match sin último dígito (check)
      || null
}

const filas = []
let sinCrosswalk = 0
for (const r of invRes.rows) {
  const upc = String(r.upc).trim()
  const cw  = cwLookup(upc)
  if (!cw) { sinCrosswalk++; continue }
  const punto    = dbPunto('CR', r.financial_rpt, r.tienda_nombre)
  const formato  = formatoFromRpt(r.financial_rpt)
  const inv      = Number(r.inv_mano) || 0
  const transito = Number(r.inv_transito) || 0
  const cedi     = cediMap.get(upc) ?? ''
  const canon    = upcCanon(upc)
  const ult      = canon ? ultMap.get(`${punto}|${canon}`) ?? null : null
  const v90      = canon ? ventasMap.get(`${punto}|${canon}`) : null
  const und90    = v90?.und90 ?? 0
  const venta_dia = und90 / 90
  const doh      = venta_dia > 0 ? inv / venta_dia : null
  const pareto80 = canon && pareto80CB.has(canon) ? 'SI' : 'NO'
  // Match innovación con las 3 formas del UPC (raw / sin leading zero / sin check)
  const upcStrip = stripLeading(upc)
  const innov    = (INNOVACION_UPC.has(upc)
                 || INNOVACION_UPC.has(upcStrip)
                 || INNOVACION_UPC.has('0' + upcStrip.slice(0, -1))
                 || INNOVACION_UPC.has('000' + upcStrip.slice(0, -1))) ? 'SI' : 'NO'

  filas.push({
    formato, punto, upc,
    itemId: cw.itemNbr,
    categoria: cw.categoria,
    descripcion: cw.desc,
    inv, transito, cedi,
    ult, doh, venta_dia,
    pareto80, innov,
  })
}
console.log(`\n📊 Filas válidas: ${filas.length} (${sinCrosswalk} omitidas sin crosswalk)`)

// ── 7. Construir pestañas ───────────────────────────────────────────────
const makeSheet = (_title, _subtitle, cols, rows) => {
  const aoa = [
    cols,
    ...rows.map(r => cols.map(c => r[c] ?? '')),
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  // Autofilter en la fila 1 (sobre todo el rango con datos) + congelar header
  if (ws['!ref']) {
    ws['!autofilter'] = { ref: ws['!ref'] }
    ws['!freeze'] = { xSplit: 0, ySplit: 1 }
  }
  return ws
}

const wb = XLSX.utils.book_new()

// — Pestaña 1: SKU X PDV (todas con inventario >= 0)
const colsSku = ['Formato','Tienda','UPC','Item ID','Categoría','Descripción','Inventario','Inventario en cedi','Inventario en tránsito','80/20','Innovación']
const skuRows = filas.map(f => ({
  Formato: f.formato,
  Tienda: f.punto,
  UPC: f.upc,
  'Item ID': f.itemId,
  Categoría: f.categoria,
  Descripción: f.descripcion,
  Inventario: f.inv,
  'Inventario en cedi': f.cedi,
  'Inventario en tránsito': f.transito,
  '80/20': f.pareto80,
  Innovación: f.innov,
}))
const wsSku = makeSheet(
  `SKU x PDV - Inventario activos (${skuRows.length} filas)`,
  `Fecha: ${fechaHuman} · Snapshot inventario: ${fechaInv}`,
  colsSku, skuRows
)
wsSku['!cols'] = [{ wch: 12 }, { wch: 32 }, { wch: 16 }, { wch: 11 }, { wch: 9 }, { wch: 45 }, { wch: 11 }, { wch: 18 }, { wch: 20 }, { wch: 8 }, { wch: 12 }]
XLSX.utils.book_append_sheet(wb, wsSku, 'SKU X PDV')

// — Pestaña 2: Quiebres (inv = 0)
const colsQ = ['Formato','Tienda','UPC','Item ID','Categoría','Descripción','Inventario UND','Tránsito','CEDI','80/20','Innovación']
const qRows = filas.filter(f => f.inv === 0).map(f => ({
  Formato: f.formato,
  Tienda: f.punto,
  UPC: f.upc,
  'Item ID': f.itemId,
  Categoría: f.categoria,
  Descripción: f.descripcion,
  'Inventario UND': f.inv,
  Tránsito: f.transito,
  CEDI: f.cedi,
  '80/20': f.pareto80,
  Innovación: f.innov,
}))
const wsQ = makeSheet(
  `Quiebres de Stock (${qRows.length} casos)`,
  `Fecha: ${fechaHuman} · Snapshot: ${fechaInv}`,
  colsQ, qRows
)
wsQ['!cols'] = [{ wch: 12 }, { wch: 32 }, { wch: 16 }, { wch: 11 }, { wch: 9 }, { wch: 45 }, { wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 12 }]
XLSX.utils.book_append_sheet(wb, wsQ, 'Quiebres')

// — Pestaña 3: INVENTARIO BAJO (inv 1..5) con DOH
const colsB = ['Formato','Tienda','UPC','Item ID','Categoría','Descripción','Inventario UND','Tránsito','CEDI','DOH (10 días)','80/20','Innovación']
const bRows = filas.filter(f => f.inv >= 1 && f.inv <= 5).map(f => {
  let dohOut = ''
  if (f.doh === null) dohOut = 'Sin venta'
  else                dohOut = Math.round(f.doh * 10) / 10  // 1 decimal
  return {
    Formato: f.formato,
    Tienda: f.punto,
    UPC: f.upc,
    'Item ID': f.itemId,
    Categoría: f.categoria,
    Descripción: f.descripcion,
    'Inventario UND': f.inv,
    Tránsito: f.transito,
    CEDI: f.cedi,
    'DOH (10 días)': dohOut,
    '80/20': f.pareto80,
    Innovación: f.innov,
  }
})
const wsB = makeSheet(
  `Inventario Bajo (${bRows.length} casos, 1 a 5 unidades)`,
  `Fecha: ${fechaHuman} · Snapshot: ${fechaInv}`,
  colsB, bRows
)
wsB['!cols'] = [{ wch: 12 }, { wch: 32 }, { wch: 16 }, { wch: 11 }, { wch: 9 }, { wch: 45 }, { wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 8 }, { wch: 12 }]
XLSX.utils.book_append_sheet(wb, wsB, 'INVENTARIO BAJO')

// — Pestaña 4: SIN VENTAS (PDV × SKU) — cada fila es una combinación tienda-producto
// con inventario snapshot + última venta en ese PDV. Filtra combinaciones que
// llevan ≥7 días sin vender (o nunca han vendido en ese PDV con inventario).
// Formato tipo Qlik: Formato · Tienda · Item Nbr · Item Type · Artículo · Promedio Diario · DOH · Inventario · Órdenes · Tránsito · Warehouse · Última Venta.
const UMBRAL_DIAS = 7
const fmtFecha = (iso) => iso ? iso.replaceAll('-', '/') : ''
const round1  = (n) => Math.round(n * 10) / 10

const colsS = ['Formato','Tienda','Item Nbr','Item Type','Artículo','Promedio Diario','DOH','Inventario','Órdenes','Tránsito','Warehouse','Última Venta','Días sin vender']
const sRows = []
for (const f of filas) {
  let dias = null
  if (f.ult) {
    const d = new Date(f.ult + 'T00:00:00Z')
    dias = Math.floor((fechaInvDate - d) / 86400000)
  }
  // Incluir si nunca ha vendido en ese PDV o si ≥7 días sin venta
  if (dias !== null && dias < UMBRAL_DIAS) continue
  sRows.push({
    Formato: f.formato,
    Tienda: f.punto,
    'Item Nbr': f.itemId,
    'Item Type': 40,
    Artículo: f.descripcion,
    'Promedio Diario': round1(f.venta_dia),
    DOH: f.doh === null ? '' : Math.round(f.doh),
    Inventario: f.inv,
    Órdenes: 0,
    Tránsito: f.transito,
    Warehouse: f.cedi === '' ? '' : f.cedi,
    'Última Venta': f.ult ? fmtFecha(f.ult) : 'Sin venta registrada',
    'Días sin vender': dias === null ? 'N/A' : dias,
  })
}
// Orden: sin venta registrada primero, después por días sin vender DESC (más críticos arriba)
sRows.sort((a, b) => {
  const ax = a['Días sin vender'], bx = b['Días sin vender']
  if (ax === 'N/A' && bx !== 'N/A') return -1
  if (bx === 'N/A' && ax !== 'N/A') return 1
  return Number(bx) - Number(ax)
})

const wsS = makeSheet(
  `Sin ventas ≥${UMBRAL_DIAS} días — detalle PDV × SKU (${sRows.length} casos)`,
  `Última carga: ${fechaInv}`,
  colsS, sRows
)
wsS['!cols'] = [{ wch: 14 }, { wch: 32 }, { wch: 11 }, { wch: 10 }, { wch: 45 }, { wch: 15 }, { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 15 }]
XLSX.utils.book_append_sheet(wb, wsS, 'SIN VENTAS')

// — Pestaña 5: Ofertas (ventanas vigentes del array OFERTAS)
const colsO = ['Item Nbr','UPC','Descripción','Precio','Mecánica','Vigencia']
const oRowsAllSku = []
for (const [upc, cw] of Object.entries(CROSSWALK)) {
  const ofertas = OFERTAS.filter(o => o.itemNbr === cw.itemNbr)
  if (ofertas.length === 0) {
    oRowsAllSku.push({
      'Item Nbr': cw.itemNbr,
      UPC: upc,
      Descripción: cw.desc,
      Precio: '',
      Mecánica: '',
      Vigencia: '',
    })
  } else {
    for (const o of ofertas) {
      oRowsAllSku.push({
        'Item Nbr': cw.itemNbr,
        UPC: upc,
        Descripción: cw.desc,
        Precio: typeof o.precio === 'number' ? `₡${o.precio.toLocaleString()}` : o.precio,
        Mecánica: o.mecanica,
        Vigencia: o.vigencia,
      })
    }
  }
}
const wsO = makeSheet(
  `Ofertas — ventanas vigentes`,
  `Fecha: ${fechaHuman} · Moneda: CRC`,
  colsO, oRowsAllSku
)
wsO['!cols'] = [{ wch: 11 }, { wch: 16 }, { wch: 45 }, { wch: 16 }, { wch: 35 }, { wch: 18 }]
XLSX.utils.book_append_sheet(wb, wsO, 'Ofertas')

// — Pestaña 6: Precio Sugerido (placeholder — el cliente proveerá la lista)
const colsP = ['Item Nbr','UPC','Descripción','Precio sugerido','Notas']
const pRowsPlaceholder = []
for (const [upc, cw] of Object.entries(CROSSWALK)) {
  pRowsPlaceholder.push({
    'Item Nbr': cw.itemNbr,
    UPC: upc,
    Descripción: cw.desc,
    'Precio sugerido': '',
    Notas: '',
  })
}
const wsP = makeSheet(
  `Precio Sugerido — pendiente lista del cliente`,
  `Fecha: ${fechaHuman} · Moneda: CRC`,
  colsP, pRowsPlaceholder
)
wsP['!cols'] = [{ wch: 11 }, { wch: 16 }, { wch: 45 }, { wch: 18 }, { wch: 35 }]
XLSX.utils.book_append_sheet(wb, wsP, 'Precio sugerido')

// ── 8. Escribir archivo ─────────────────────────────────────────────────
const ts = today.toISOString().slice(11, 16).replace(':', '')
const OUT_DIR = process.env.OUT_DIR || 'C:/Users/IAN/Downloads'
const outPath = `${OUT_DIR.replace(/\/$/, '')}/Cobertura_CR_${fechaIso}_${ts}.xlsx`
XLSX.writeFile(wb, outPath)
console.log(`\n📄 ${outPath}`)
console.log(`   SKU X PDV: ${skuRows.length}`)
console.log(`   Quiebres: ${qRows.length}`)
console.log(`   Inv Bajo: ${bRows.length}`)
console.log(`   Sin Ventas: ${sRows.length}`)
console.log(`   Ofertas: ${oRowsAllSku.length}`)
console.log(`   Precio Sugerido: ${pRowsPlaceholder.length} (placeholder)`)

// Validaciones
console.log('\n🔎 Validaciones:')
const formatos = new Set(filas.map(f => f.formato))
console.log(`   Formatos: ${[...formatos].join(', ')}`)
const cats = new Set(filas.map(f => f.categoria))
console.log(`   Categorías: ${[...cats].join(', ')}`)
const innovCount = filas.filter(f => f.innov === 'SI').length
console.log(`   Filas marcadas Innovación: ${innovCount}`)
const pareto80Count = filas.filter(f => f.pareto80 === 'SI').length
console.log(`   Filas marcadas 80/20: ${pareto80Count}`)

await pool.end()
console.log('\n🎉 Listo')
