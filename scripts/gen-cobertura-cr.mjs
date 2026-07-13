/**
 * gen-cobertura-cr.mjs
 * Genera reporte de Cobertura PDV para CR (y opcionalmente otros países)
 * desde archivos RetailLink: Surtido-Inv + DCD (CEDI).
 *
 * Uso: node scripts/gen-cobertura-cr.mjs <surtido-inv.xls> <dcd.xls> [CR|GT|HN|NI|SV|ALL]
 *
 * Hojas generadas:
 *   RESUMEN      — SKU × cadena: tiendas con stock / sin stock / % cobertura / CEDI backup
 *   [CADENA]     — Detalle tienda × SKU con Inv Mano / En Orden / En Tránsito / Est. DOH
 */

import XLSX    from 'xlsx'
import ExcelJS from 'exceljs'
import { readFileSync } from 'fs'

const [,,FILE_TIENDAS, FILE_CEDI, PAIS_ARG = 'CR'] = process.argv
if (!FILE_TIENDAS || !FILE_CEDI) {
  console.error('Uso: node scripts/gen-cobertura-cr.mjs <surtido-inv.xls> <dcd.xls> [CR|GT|HN|NI|SV|ALL]')
  process.exit(1)
}

// ── Mapeo rptcode → cadena ────────────────────────────────────────────────────
const CADENA_MAP = {
  HM: 'WALMART',     ME: 'MAS X MENOS', MI: 'MAXI PALI',
  PI: 'PALI',        DF: 'DESPENSA FAMILIAR',
  LJ: 'LA DESPENSA DON JUAN', PZ: 'PAIZ',
  LN: 'LA UNION',    MX: 'MAXI DESPENSA',
}

// ── Categoría desde descripción ───────────────────────────────────────────────
function getCat(desc) {
  const d = desc.toUpperCase()
  if (d.includes('LECHE') || d.startsWith('LECH')) return 'Leches'
  if (d.includes('HELAD') || d.includes('ICE CREAM') || d.includes('YOGURT')) return 'Helados'
  return 'Quesos'
}

// ── Leer XLS — encontrar header row ──────────────────────────────────────────
function readXls(path) {
  const wb   = XLSX.readFile(path)
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  let hi = -1
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === 'Country Code') { hi = i; break }
  }
  if (hi < 0) throw new Error('No se encontró "Country Code" en ' + path)
  const headers = rows[hi].map(h => String(h).trim())
  const col = name => headers.findIndex(h => h.toLowerCase() === name.toLowerCase())
  return { rows: rows.slice(hi + 1).filter(r => String(r[0]).length === 2), col }
}

// ── Parsear Surtido-Inv ───────────────────────────────────────────────────────
function parseTiendas(path) {
  const { rows, col } = readXls(path)
  const C = {
    pais:    col('Country Code'),    rpt:     col('Financial Rpt Code'),
    storeN:  col('Store Nbr'),       store:   col('Store Name'),
    item:    col('Item Nbr'),        upc:     col('UPC'),
    desc:    col('Signing Desc'),    status:  col('Item Status'),
    mano:    col('Curr Str On Hand Qty'),
    orden:   col('Curr Str On Order Qty'),
    transit: col('Curr Str In Transit Qty'),
    bodega:  col('Curr Str In Whse Qty'),
    traited: col('Curr Traited Store/Item Comb.'),
    valid:   col('Curr Valid Store/Item Comb.'),
  }
  return rows.map(r => ({
    pais:    String(r[C.pais]).trim(),
    cadena:  CADENA_MAP[String(r[C.rpt]).trim()] ?? String(r[C.rpt]).trim(),
    storeN:  Number(r[C.storeN]) || 0,
    store:   String(r[C.store]).trim(),
    item:    String(r[C.item]).trim(),
    upc:     String(r[C.upc]).trim(),
    desc:    String(r[C.desc]).trim(),
    status:  String(r[C.status] ?? 'A').trim(),
    mano:    Number(r[C.mano])    || 0,
    orden:   Number(r[C.orden])   || 0,
    transit: Number(r[C.transit]) || 0,
    bodega:  Number(r[C.bodega])  || 0,
    traited: Number(r[C.traited]) === 1,
    cat:     getCat(String(r[C.desc])),
  }))
}

// ── Parsear DCD CEDI ──────────────────────────────────────────────────────────
function parseCedi(path) {
  const { rows, col } = readXls(path)
  const C = {
    pais: col('Country Code'), upc: col('UPC'), item: col('Item Nbr'),
    desc: col('Signing Desc'), inv: col('Current WHSE On Hand Cases'),
    orden: col('WHSE On Order Cases'), status: col('Item Status'),
  }
  const map = {}
  for (const r of rows) {
    const key = `${String(r[C.pais]).trim()}|${String(r[C.upc]).trim()}`
    map[key] = {
      cajas: Number(r[C.inv])  || 0,
      orden: Number(r[C.orden]) || 0,
      status: String(r[C.status] ?? 'A').trim(),
      desc:   String(r[C.desc]).trim(),
    }
  }
  return map
}

// ── Estilos ExcelJS ───────────────────────────────────────────────────────────
const S = {
  hdrFill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } },
  hdrFont: { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 },
  subFill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } },
  subFont: { bold: true, size: 9, color: { argb: 'FF1F4E79' } },
  titleFont: { bold: true, size: 12 },
  noteFont:  { italic: true, size: 9, color: { argb: 'FF595959' } },
  redFill:   { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4E4' } },
  orangeFill:{ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } },
  greenFill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F4EA' } },
  grayFill:  { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } },
  border:    { top:{style:'thin',color:{argb:'FFD0D0D0'}}, left:{style:'thin',color:{argb:'FFD0D0D0'}}, bottom:{style:'thin',color:{argb:'FFD0D0D0'}}, right:{style:'thin',color:{argb:'FFD0D0D0'}} },
}

function applyHeader(cell, fill = S.hdrFill, font = S.hdrFont) {
  cell.fill = fill; cell.font = font
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  cell.border = S.border
}

function colorDoh(cell, doh) {
  if (doh === null) return
  if (doh <= 0)   { cell.fill = S.redFill;    cell.font = { bold: true, color: { argb: 'FFCC0000' }, size: 10 } }
  else if (doh <= 7)  { cell.fill = S.redFill;    cell.font = { size: 10, color: { argb: 'FFCC0000' } } }
  else if (doh <= 14) { cell.fill = S.orangeFill; cell.font = { size: 10, color: { argb: 'FF9C6500' } } }
  else if (doh <= 60) { cell.fill = S.greenFill;  cell.font = { size: 10, color: { argb: 'FF1A7A4A' } } }
}

// ── Hoja RESUMEN ──────────────────────────────────────────────────────────────
function writeResumen(wb, tiendas, cedi, paisRows, paisCode, paisName, dateStr) {
  const ws = wb.addWorksheet('RESUMEN')

  // Título
  ws.mergeCells('A1:L1')
  ws.getCell('A1').value = `Cobertura PDV — Walmart ${paisName} — Semana ${dateStr}`
  ws.getCell('A1').font  = S.titleFont
  ws.getCell('A1').fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } }
  ws.getCell('A1').alignment = { horizontal: 'center' }
  ws.getCell('A1').font  = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
  ws.getRow(1).height = 24

  ws.mergeCells('A2:L2')
  ws.getCell('A2').value = `Fuente: RetailLink Surtido-Inv + DCD | Generado ${dateStr}`
  ws.getCell('A2').font  = S.noteFont

  // Headers
  const hdrs = ['Categoría','UPC','Descripción','Cadena',
    'Total Tiendas','Con Stock','Sin Stock','% Cobertura',
    'Inv. Total (uds)','CEDI (cj)','CEDI Orden (cj)','Est. DOH CEDI']
  const row3 = ws.getRow(3)
  hdrs.forEach((h, i) => {
    const c = row3.getCell(i + 1)
    c.value = h; applyHeader(c)
  })
  ws.getRow(3).height = 28
  ws.columns = [
    { width: 12 }, { width: 18 }, { width: 38 }, { width: 18 },
    { width: 13 }, { width: 12 }, { width: 12 }, { width: 13 },
    { width: 16 }, { width: 12 }, { width: 14 }, { width: 14 },
  ]

  // Datos: agrupar por (cat, upc, cadena)
  const grouped = {}
  for (const r of paisRows) {
    const key = `${r.cat}|${r.upc}|${r.cadena}`
    if (!grouped[key]) grouped[key] = {
      cat: r.cat, upc: r.upc, desc: r.desc, cadena: r.cadena,
      total: 0, conStock: 0, sinStock: 0, totalInv: 0,
    }
    grouped[key].total++
    grouped[key].totalInv += r.mano
    if (r.mano > 0) grouped[key].conStock++
    else grouped[key].sinStock++
  }

  // Ordenar: cat → desc → cadena
  const sorted = Object.values(grouped).sort((a, b) =>
    a.cat.localeCompare(b.cat) || a.desc.localeCompare(b.desc) || a.cadena.localeCompare(b.cadena)
  )

  let rowNum = 4
  for (const g of sorted) {
    const pct = g.total > 0 ? g.conStock / g.total : 0
    const cediKey = `${paisCode}|${g.upc}`
    const cediInfo = cedi[cediKey] ?? null
    const dohCedi = cediInfo && g.totalInv > 0
      ? Math.round(cediInfo.cajas * 12 / (g.totalInv / (g.total || 1) * 7 / 7))
      : null

    const cr = ws.getRow(rowNum)
    cr.values = [
      g.cat, g.upc, g.desc, g.cadena,
      g.total, g.conStock, g.sinStock,
      pct,
      g.totalInv,
      cediInfo?.cajas ?? '—',
      cediInfo?.orden ?? '—',
      dohCedi !== null ? dohCedi : '—',
    ]
    cr.getCell(8).numFmt  = '0%'
    cr.getCell(8).font    = { bold: true, color: { argb: pct >= 0.8 ? 'FF1A7A4A' : pct >= 0.5 ? 'FF9C6500' : 'FFCC0000' } }
    cr.getCell(7).font    = { color: { argb: g.sinStock > 0 ? 'FFCC0000' : 'FF000000' } }
    // Color fila si cobertura < 50%
    if (pct < 0.5) {
      for (let c = 1; c <= 12; c++) cr.getCell(c).fill = S.redFill
    } else if (pct < 0.8) {
      for (let c = 1; c <= 12; c++) cr.getCell(c).fill = S.orangeFill
    }
    cr.eachCell({ includeEmpty: false }, cell => { cell.border = S.border; cell.alignment = { vertical: 'middle' } })
    rowNum++
  }

  ws.autoFilter = { from: 'A3', to: 'L3' }
  ws.views = [{ state: 'frozen', ySplit: 3 }]
  console.log(`  [${paisCode}] RESUMEN: ${sorted.length} combos SKU×Cadena`)
}

// ── Hoja por cadena ───────────────────────────────────────────────────────────
function writeCadena(wb, rows, cadena, paisCode, paisName, cedi, dateStr) {
  const sheetName = cadena.slice(0, 31) // Excel max 31 chars
  const ws = wb.addWorksheet(sheetName)

  // Título
  ws.mergeCells('A1:I1')
  ws.getCell('A1').value = `Inventario PDV — ${cadena} ${paisName} — ${dateStr}`
  ws.getCell('A1').font  = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
  ws.getCell('A1').fill  = S.hdrFill
  ws.getCell('A1').alignment = { horizontal: 'center' }
  ws.getRow(1).height = 24

  ws.mergeCells('A2:I2')
  ws.getCell('A2').value = `Colores: 🔴 Sin stock / DOH ≤7d  🟠 DOH 8–14d  🟢 DOH 15–60d  ⬜ Sin historial venta`
  ws.getCell('A2').font  = S.noteFont

  // Headers
  const hdrs = ['Tienda #','Tienda','Categoría','UPC','Descripción','Inv Mano (uds)','En Orden (uds)','En Tránsito','CEDI (cj)']
  ws.getRow(3).values = hdrs
  ws.getRow(3).eachCell(c => applyHeader(c))
  ws.getRow(3).height = 28
  ws.columns = [
    { width: 10 }, { width: 32 }, { width: 12 }, { width: 18 }, { width: 40 },
    { width: 14 }, { width: 14 }, { width: 13 }, { width: 12 },
  ]

  // Ordenar: tienda → categoría → descripción
  const sorted = [...rows].sort((a, b) =>
    a.store.localeCompare(b.store) || a.cat.localeCompare(b.cat) || a.desc.localeCompare(b.desc)
  )

  let rowNum = 4
  for (const r of sorted) {
    const cediKey = `${paisCode}|${r.upc}`
    const cediCajas = cedi[cediKey]?.cajas ?? null

    const cr = ws.getRow(rowNum)
    cr.values = [r.storeN, r.store, r.cat, r.upc, r.desc, r.mano, r.orden, r.transit, cediCajas ?? '—']

    // Color según inventario
    const invCell = cr.getCell(6)
    if (r.mano === 0)      { invCell.fill = S.redFill;    invCell.font = { bold: true, color: { argb: 'FFCC0000' } } }
    else if (r.mano <= 12) { invCell.fill = S.orangeFill; invCell.font = { color: { argb: 'FF9C6500' } } }
    else                   { invCell.fill = S.greenFill;  invCell.font = { color: { argb: 'FF1A7A4A' } } }

    cr.eachCell({ includeEmpty: false }, c => { c.border = S.border; c.alignment = { vertical: 'middle' } })
    rowNum++
  }

  ws.autoFilter = { from: 'A3', to: 'I3' }
  ws.views = [{ state: 'frozen', ySplit: 3 }]

  const zeros = rows.filter(r => r.mano === 0).length
  const total = rows.length
  console.log(`  [${paisCode}] ${cadena}: ${total} combos · ${zeros} sin stock (${Math.round(zeros/total*100)}%)`)
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const tiendas = parseTiendas(FILE_TIENDAS)
  const cedi    = parseCedi(FILE_CEDI)

  const now     = new Date()
  const dateStr = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`
  const dateFile= `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`

  const PAIS_NAMES = { CR:'Costa Rica', GT:'Guatemala', HN:'Honduras', NI:'Nicaragua', SV:'El Salvador' }

  const paisList = PAIS_ARG === 'ALL'
    ? Object.keys(PAIS_NAMES)
    : PAIS_ARG.split(',').map(p => p.trim().toUpperCase())

  for (const code of paisList) {
    const paisName  = PAIS_NAMES[code] ?? code
    const paisRows  = tiendas.filter(r => r.pais === code)
    if (paisRows.length === 0) { console.log(`Sin datos para ${code}`); continue }

    console.log(`\nGenerando ${code} (${paisName}) — ${paisRows.length} registros...`)

    const wb = new ExcelJS.Workbook()
    wb.creator = 'BL Dashboard'
    wb.created = now

    // RESUMEN
    writeResumen(wb, tiendas, cedi, paisRows, code, paisName, dateStr)

    // Una hoja por cadena
    const cadenas = [...new Set(paisRows.map(r => r.cadena))].sort()
    for (const cadena of cadenas) {
      const cadenaRows = paisRows.filter(r => r.cadena === cadena)
      writeCadena(wb, cadenaRows, cadena, code, paisName, cedi, dateStr)
    }

    // Hoja QUIEBRES (solo sin stock)
    const quiebres = paisRows.filter(r => r.mano === 0)
    if (quiebres.length > 0) {
      const wsQ = wb.addWorksheet('QUIEBRES')
      wsQ.mergeCells('A1:I1')
      wsQ.getCell('A1').value = `⚠️ Sin Stock — ${paisName} — ${dateStr} (${quiebres.length} combos)`
      wsQ.getCell('A1').font  = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
      wsQ.getCell('A1').fill  = { type:'pattern', pattern:'solid', fgColor:{argb:'FFC00000'} }
      wsQ.getCell('A1').alignment = { horizontal: 'center' }
      wsQ.getRow(1).height = 24

      const hdrs = ['Cadena','Tienda','Categoría','UPC','Descripción','Inv Mano','En Orden','En Tránsito','CEDI (cj)']
      wsQ.getRow(2).values = hdrs
      wsQ.getRow(2).eachCell(c => applyHeader(c))
      wsQ.columns = [{ width: 18 },{ width: 32 },{ width: 12 },{ width: 18 },{ width: 40 },{ width: 11 },{ width: 11 },{ width: 11 },{ width: 11 }]

      let rn = 3
      for (const r of quiebres.sort((a,b) => a.cadena.localeCompare(b.cadena) || a.store.localeCompare(b.store) || a.desc.localeCompare(b.desc))) {
        const cediCajas = cedi[`${code}|${r.upc}`]?.cajas ?? '—'
        wsQ.getRow(rn).values = [r.cadena, r.store, r.cat, r.upc, r.desc, r.mano, r.orden, r.transit, cediCajas]
        wsQ.getRow(rn).getCell(6).fill = S.redFill
        wsQ.getRow(rn).getCell(6).font = { bold: true, color: { argb: 'FFCC0000' } }
        wsQ.getRow(rn).eachCell({ includeEmpty: false }, c => { c.border = S.border })
        rn++
      }
      wsQ.autoFilter = { from: 'A2', to: 'I2' }
      console.log(`  [${code}] QUIEBRES: ${quiebres.length} combos sin stock`)
    }

    const outPath = `C:/Users/IAN/Documents/Cobertura_${code}_${dateFile}.xlsx`
    await wb.xlsx.writeFile(outPath)
    console.log(`  ✅ Guardado: ${outPath}`)
  }

  console.log('\nListo.')
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
