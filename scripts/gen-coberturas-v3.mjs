/**
 * gen-coberturas-v3.mjs
 * Genera Cobertura_<PAIS>_<YYYY-MM-DD>.xlsx para CR y GT con 4 pestañas:
 *   - Quiebres            (inv_mano = 0)
 *   - INVENTARIO BAJO     (inv_mano entre 1 y 5)
 *   - SKU X PDV           (lista plana PDV/SKU/Descripción/Inventario)
 *   - SIN VENTAS EN 1 SEMANA (PDV×SKU activos con última venta > 7 días)
 *
 * Fuente: inventario_tiendas + inventario_cedi (datos hoy desde Supabase).
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

const PAISES = (process.argv[2] || 'CR,GT').split(',').map(s => s.trim()).filter(Boolean)
const today = new Date()
const fechaIso = today.toISOString().slice(0, 10)
const fechaHuman = today.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
const corteIso = new Date(today.getTime() - 7 * 86400000).toISOString().slice(0, 10)

// Map financial_rpt → prefijo de PDV en fact_ventas_walmart
const RPT_PREFIX = {
  HM: 'WM', ME: 'MXM', MI: 'MP', PI: 'PALI',
  PZ: 'PAIZ', DF: 'DF', LJ: 'DDJ', LN: 'UNION',
}
const dbPunto = (country, finRpt, storeName) => {
  const pfx = RPT_PREFIX[finRpt] || finRpt
  let name = storeName.trim()
  for (const k of Object.values(RPT_PREFIX)) {
    if (name.startsWith(k + ' ')) { name = name.slice(k.length + 1); break }
  }
  return `${country}-${pfx} ${name}`
}

// ── -1. Innovaciones y 80/20 por país (calculado de fact_ventas_walmart) ─
console.log('🎯 Calculando innovaciones y 80/20…')
const tagsByPais = {}  // pais → { innovacion: Set(sku), pareto80: Set(sku) }
for (const pais of PAISES) {
  // Innovaciones: primera venta 2026 (solo Quesos)
  const inn = await pool.query(`
    SELECT sku
    FROM fact_ventas_walmart
    WHERE pais=$1 AND sku IS NOT NULL AND sku<>''
      AND (UPPER(categoria) ILIKE '%QUESO%' OR UPPER(categoria) ILIKE '%CHEESE%')
    GROUP BY sku
    HAVING MIN(fecha) >= '2026-01-01'
  `, [pais])
  const innovaciones = new Set(inn.rows.map(r => r.sku))

  // 80/20: últimos 3 meses
  const lastDate = await pool.query(`SELECT MAX(fecha)::date AS f FROM fact_ventas_walmart WHERE pais=$1`, [pais])
  const cut = new Date(lastDate.rows[0].f).getTime() - 90 * 86400000
  const cutIso = new Date(cut).toISOString().slice(0, 10)
  const par = await pool.query(`
    WITH ranked AS (
      SELECT sku, SUM(ventas_valor) AS usd
      FROM fact_ventas_walmart
      WHERE pais=$1 AND fecha >= $2 AND sku IS NOT NULL AND sku<>''
      GROUP BY sku
    ),
    acc AS (
      SELECT sku, usd, SUM(usd) OVER() AS total,
             SUM(usd) OVER (ORDER BY usd DESC ROWS UNBOUNDED PRECEDING) AS cum
      FROM ranked
    )
    SELECT sku FROM acc WHERE cum/NULLIF(total,0) <= 0.80
  `, [pais, cutIso])
  const pareto80 = new Set(par.rows.map(r => r.sku))

  tagsByPais[pais] = { innovaciones, pareto80 }
  console.log(`   ${pais}: ${innovaciones.size} innovaciones · ${pareto80.size} SKUs 80/20`)
}

// ── 0. dim_producto para resolver UPC → SKU + categoría por SKU ──────────
console.log('📥 dim_producto…')
const dimRes = await pool.query(`SELECT codigo_barras, sku, descripcion, categoria, subcategoria FROM dim_producto WHERE codigo_barras IS NOT NULL`)
const dimMap = new Map()
const dimBySku = new Map()
for (const r of dimRes.rows) {
  dimMap.set(r.codigo_barras, r)
  if (r.sku) dimBySku.set(String(r.sku), r)
}
const CAT_CODE = (cat) => {
  const c = String(cat ?? '').toLowerCase()
  if (c.includes('leche'))   return 'L'
  if (c.includes('queso') || c.includes('cheese')) return 'Q'
  if (c.includes('helado'))  return 'H'
  return ''
}
const skuToCatCode = (sku) => {
  if (!sku) return ''
  return CAT_CODE(dimBySku.get(String(sku))?.categoria)
}
const UPC_OVERRIDE = {
  '5300003502':  '53000003502',
  '53000057253': '5300005275',
  '53000071884': '530000718800',
}
const upcToSku = (raw) => {
  if (!raw) return null
  const stripped = raw.replace(/^0+/, '')
  if (UPC_OVERRIDE[stripped]) {
    const x = dimMap.get(UPC_OVERRIDE[stripped])
    if (x) return x.sku
  }
  if (dimMap.has(stripped)) return dimMap.get(stripped).sku
  if (dimMap.has(raw))      return dimMap.get(raw).sku
  for (let d = 0; d <= 9; d++) {
    const c = stripped + String(d)
    if (dimMap.has(c)) return dimMap.get(c).sku
  }
  return null
}
console.log(`   ${dimMap.size} productos`)

// ── 1. Última fecha de inventario disponible ─────────────────────────────
const fechaInvRes = await pool.query(`SELECT MAX(fecha)::date AS fecha FROM inventario_tiendas`)
const fechaInv = new Date(fechaInvRes.rows[0].fecha).toISOString().slice(0, 10)
console.log(`📅 Snapshot inventario_tiendas: ${fechaInv}`)

// ── 2. Cargar CEDI por país×UPC ──────────────────────────────────────────
console.log(`\n📥 CEDI…`)
const cediRes = await pool.query(`
  SELECT pais, upc, inv_mano_cajas
  FROM inventario_cedi
  WHERE fecha = (SELECT MAX(fecha) FROM inventario_cedi)
`)
const cediMap = new Map()
for (const r of cediRes.rows) cediMap.set(`${r.pais}|${r.upc}`, Number(r.inv_mano_cajas) || 0)
console.log(`   ${cediMap.size} entradas`)

// ── 3. Cargar inventario PDV de hoy para CR/GT ───────────────────────────
console.log(`\n📥 PDVs CR/GT…`)
const invRes = await pool.query(`
  SELECT pais, financial_rpt, tienda_nbr, tienda_nombre, upc, sku, descripcion, inv_mano, inv_transito
  FROM inventario_tiendas
  WHERE fecha = $1::date AND pais = ANY($2::text[])
`, [fechaInv, PAISES])
console.log(`   ${invRes.rows.length.toLocaleString()} filas`)

// Agrupar por país
const byPais = {}
for (const p of PAISES) byPais[p] = { quiebres: [], bajos: [], activas: [] }

for (const r of invRes.rows) {
  const pais   = r.pais
  const punto  = dbPunto(pais, r.financial_rpt, r.tienda_nombre || '')
  const inv    = Number(r.inv_mano) || 0
  const cedi   = cediMap.get(`${pais}|${r.upc}`) ?? ''
  const sku    = r.sku || upcToSku(r.upc)
  const tags   = tagsByPais[pais] ?? { innovaciones: new Set(), pareto80: new Set() }
  const innov  = sku && tags.innovaciones.has(sku) ? 'SI' : ''
  const pareto = sku && tags.pareto80.has(sku)     ? 'SI' : ''
  const catCode = skuToCatCode(sku)
  const rowInv = {
    'Tienda #':        String(r.tienda_nbr ?? ''),
    'Tienda':          punto,
    'UPC':             r.upc,
    'Item ID':         sku ?? '',
    'SKU':             sku ?? '',
    'Categoría':       catCode,
    'Descripción':     r.descripcion,
    'Inventario UND':  inv,
    'Tránsito':        Number(r.inv_transito) || 0,
    'CEDI':            cedi,
    '80/20':           pareto,
    'Innovación':      innov,
    'Precio de Venta': '',
    'DOH (8 días)':    '',
  }
  if (inv === 0)                  byPais[pais].quiebres.push(rowInv)
  else if (inv >= 1 && inv <= 5)  byPais[pais].bajos.push(rowInv)
  byPais[pais].activas.push({ punto, sku, upc: r.upc, desc: r.descripcion, inv, innov, pareto, catCode })
}

// ── 4. Última venta por (pais, punto_venta, sku) ─────────────────────────
console.log(`\n🔎 Últimas ventas por país…`)
const ventasRes = await pool.query(`
  SELECT pais, punto_venta, sku, MAX(fecha)::date AS ultima
  FROM fact_ventas_walmart
  WHERE pais = ANY($1::text[]) AND sku IS NOT NULL AND sku <> ''
  GROUP BY pais, punto_venta, sku
`, [PAISES])
const ultMap = new Map()  // key: pais|pdv|sku → fecha ISO (más reciente)
for (const v of ventasRes.rows) {
  const d = new Date(v.ultima).toISOString().slice(0, 10)
  // Normalizar punto_venta: agregar prefijo país si falta (DVTAS4W viene sin prefijo)
  const pv = v.punto_venta.startsWith(`${v.pais}-`)
    ? v.punto_venta
    : `${v.pais}-${v.punto_venta}`
  const key = `${v.pais}|${pv}|${v.sku}`
  const prev = ultMap.get(key)
  if (!prev || d > prev) ultMap.set(key, d)
}
console.log(`   ${ultMap.size.toLocaleString()} combinaciones con histórico`)
console.log(`   Corte: última venta < ${corteIso}`)

// ── 5. Construir sheets por país ──────────────────────────────────────────
const colsInv = ['Tienda #','Tienda','UPC','Item ID','SKU','Categoría','Descripción','Inventario UND','Tránsito','CEDI','80/20','Innovación','Precio de Venta','DOH (8 días)']
const colsSku = ['Tienda','UPC','Item ID','SKU','Categoría','Descripción','Inventario','80/20','Innovación']
const colsSinVtas = ['Tienda','UPC','Item ID','SKU','Categoría','Descripción','Inventario','Última Venta','80/20','Innovación']

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

const outDir = 'C:/Users/IAN/Downloads'
for (const pais of PAISES) {
  const grp = byPais[pais]
  const sinVentas = []
  for (const a of grp.activas) {
    if (!a.sku) continue
    const k = `${pais}|${a.punto}|${a.sku}`
    const ultima = ultMap.get(k) ?? null
    if (!ultima || ultima < corteIso) {
      sinVentas.push({
        'Tienda':       a.punto,
        'UPC':          a.upc,
        'Item ID':      a.sku,
        'SKU':          a.sku,
        'Categoría':    a.catCode || '',
        'Descripción':  a.desc,
        'Inventario':   a.inv,
        'Última Venta': ultima ?? 'Sin ventas registradas',
        '80/20':        a.pareto || '',
        'Innovación':   a.innov  || '',
      })
    }
  }
  sinVentas.sort((a, b) => {
    const ax = a['Última Venta'], bx = b['Última Venta']
    if (ax === 'Sin ventas registradas' && bx !== 'Sin ventas registradas') return 1
    if (bx === 'Sin ventas registradas' && ax !== 'Sin ventas registradas') return -1
    return String(bx).localeCompare(String(ax))
  })

  const wb = XLSX.utils.book_new()

  // 1) Quiebres
  const wsQ = makeSheet(
    `Quiebres de Stock - Queso (${grp.quiebres.length} casos)`,
    `Fecha: ${fechaHuman} · Snapshot inventario: ${fechaInv}`,
    colsInv, grp.quiebres
  )
  wsQ['!cols'] = [
    { wch: 10 }, { wch: 30 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 48 },
    { wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
  ]
  XLSX.utils.book_append_sheet(wb, wsQ, 'Quiebres')

  // 2) INVENTARIO BAJO
  const wsB = makeSheet(
    `Inventario Bajo - Queso (${grp.bajos.length} casos, 1 a 5 unidades)`,
    `Fecha: ${fechaHuman} · Snapshot: ${fechaInv}`,
    colsInv, grp.bajos
  )
  wsB['!cols'] = wsQ['!cols']
  XLSX.utils.book_append_sheet(wb, wsB, 'INVENTARIO BAJO')

  // 3) SKU X PDV
  const skuPdvRows = grp.activas.map(a => ({
    'Tienda':       a.punto,
    'UPC':          a.upc,
    'Item ID':      a.sku ?? '',
    'SKU':          a.sku ?? '',
    'Categoría':    a.catCode || '',
    'Descripción':  a.desc,
    'Inventario':   a.inv,
    '80/20':        a.pareto || '',
    'Innovación':   a.innov  || '',
  }))
  const wsP = makeSheet(
    `SKU x PDV - Inventario activos (${skuPdvRows.length} filas)`,
    `Fecha: ${fechaHuman} · Snapshot: ${fechaInv}`,
    colsSku, skuPdvRows
  )
  wsP['!cols'] = [{ wch: 32 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 48 }, { wch: 12 }, { wch: 8 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, wsP, 'SKU X PDV')

  // 4) SIN VENTAS EN 1 SEMANA
  const wsS = makeSheet(
    `Sin ventas últimos 7 días (${sinVentas.length} combinaciones)`,
    `Fecha: ${fechaHuman} · Corte: última venta < ${corteIso} · Snapshot inv: ${fechaInv}`,
    colsSinVtas, sinVentas
  )
  wsS['!cols'] = [{ wch: 32 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 48 }, { wch: 12 }, { wch: 22 }, { wch: 8 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, wsS, 'SIN VENTAS EN 1 SEMANA')

  const outPath = `${outDir}/Cobertura_${pais}_${fechaIso}.xlsx`
  XLSX.writeFile(wb, outPath)
  console.log(`  📄 ${outPath}  Quiebres(${grp.quiebres.length}) · Bajos(${grp.bajos.length}) · SKUxPDV(${grp.activas.length}) · SinVtas(${sinVentas.length})`)
}

await pool.end()
console.log('\n🎉 Coberturas CR y GT generadas')
