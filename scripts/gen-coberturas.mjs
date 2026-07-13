/**
 * gen-coberturas.mjs
 * Genera coberturas Walmart por país (CR/GT/HN/NI/SV).
 * Input:
 *   DCD: cn6t2em_111126767 (CEDI inventory por país×UPC)
 *   Surtido-Inv: cn6t2em_111126773 (PDV inventory por store×UPC)
 * Output:
 *   C:/Users/IAN/Downloads/Cobertura_<PAIS>_<YYYY-MM-DD>.xlsx
 *   Una sola hoja "Quiebres de Stock - Queso (N casos)"
 */
import XLSX from 'xlsx'

const DCD_PATH = 'C:/Users/IAN/Downloads/cn6t2em_111126767_F8AC0694XC24CX4F07XBF64XE6D4ED965CEF.xls'
const SURTIDO_PATH = 'C:/Users/IAN/Downloads/cn6t2em_111126773_9B7431B3XE64CX4BB9X963EX88831E8340FE.xls'

const today = new Date()
const fechaIso = today.toISOString().slice(0, 10)
const fechaHuman = today.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })

// ── 1. Leer DCD → mapa por país+UPC → cases CEDI ──────────────────────────
console.log(`📂 Leyendo DCD: ${DCD_PATH.split('/').pop()}`)
const wbDcd = XLSX.readFile(DCD_PATH)
const wsDcd = wbDcd.Sheets[wbDcd.SheetNames[0]]
const rowsDcd = XLSX.utils.sheet_to_json(wsDcd, { header: 1, defval: '' })

// Headers fila 31 (índice). Detectar dinámicamente buscando "Country Code"
let hDcd = -1
for (let i = 0; i < Math.min(50, rowsDcd.length); i++) {
  if (rowsDcd[i][0] === 'Country Code') { hDcd = i; break }
}
if (hDcd < 0) throw new Error('No encontré headers en DCD')
console.log(`   Headers DCD en fila ${hDcd + 1}`)
const headersDcd = rowsDcd[hDcd].map(c => String(c).trim())
const dIdx = (name) => headersDcd.indexOf(name)
const COL_DCD = {
  country:  dIdx('Country Code'),
  upc:      dIdx('UPC'),
  itemNbr:  dIdx('Item Nbr'),
  desc:     dIdx('Signing Desc'),
  brand:    dIdx('Brand Desc'),
  onHand:   dIdx('Current WHSE On Hand Cases'),
  onOrder:  dIdx('WHSE On Order Cases'),
  status:   dIdx('Item Status'),
}

// Mapa: country|upc → cases CEDI
const cediMap = new Map()
for (let i = hDcd + 1; i < rowsDcd.length; i++) {
  const r = rowsDcd[i]
  const country = String(r[COL_DCD.country] ?? '').trim()
  if (!country || country.length !== 2) continue
  const upc = String(r[COL_DCD.upc] ?? '').trim()
  const cases = Number(r[COL_DCD.onHand]) || 0
  cediMap.set(`${country}|${upc}`, cases)
}
console.log(`   ${cediMap.size} entradas CEDI cargadas`)

// ── 2. Leer Surtido-Inv → registros PDV ────────────────────────────────
console.log(`\n📂 Leyendo Surtido-Inv: ${SURTIDO_PATH.split('/').pop()}`)
const wbSur = XLSX.readFile(SURTIDO_PATH)
const wsSur = wbSur.Sheets[wbSur.SheetNames[0]]
const rowsSur = XLSX.utils.sheet_to_json(wsSur, { header: 1, defval: '' })

let hSur = -1
for (let i = 0; i < Math.min(50, rowsSur.length); i++) {
  if (rowsSur[i][0] === 'Country Code') { hSur = i; break }
}
if (hSur < 0) throw new Error('No encontré headers en Surtido-Inv')
console.log(`   Headers Surtido en fila ${hSur + 1}`)
const headersSur = rowsSur[hSur].map(c => String(c).trim())
const sIdx = (name) => headersSur.indexOf(name)
const COL_SUR = {
  country:  sIdx('Country Code'),
  finRpt:   sIdx('Financial Rpt Code'),
  storeNbr: sIdx('Store Nbr'),
  storeName:sIdx('Store Name'),
  itemNbr:  sIdx('Item Nbr'),
  upc:      sIdx('UPC'),
  desc:     sIdx('Signing Desc'),
  onHand:   sIdx('Curr Str On Hand Qty'),
  onOrder:  sIdx('Curr Str On Order Qty'),
  transit:  sIdx('Curr Str In Transit Qty'),
  inWhse:   sIdx('Curr Str In Whse Qty'),
  status:   sIdx('Item Status'),
}

// ── 3. Quiebres por país: onHand = 0 ─────────────────────────────────────
const quiebres = {}  // pais → array de filas
let totalSur = 0, quiebreCount = 0
for (let i = hSur + 1; i < rowsSur.length; i++) {
  const r = rowsSur[i]
  const country = String(r[COL_SUR.country] ?? '').trim()
  if (!country || country.length !== 2) continue
  totalSur++
  const onHand = Number(r[COL_SUR.onHand]) || 0
  if (onHand !== 0) continue
  // Solo quiebres
  const status = String(r[COL_SUR.status] ?? '').trim()
  if (status !== 'A') continue  // solo Activos

  const upc = String(r[COL_SUR.upc] ?? '').trim()
  const cedi = cediMap.get(`${country}|${upc}`) ?? ''

  const row = {
    'Tienda #':         String(r[COL_SUR.storeNbr] ?? '').trim(),
    'Tienda':           String(r[COL_SUR.storeName] ?? '').trim(),
    'UPC':              upc,
    'Descripción':      String(r[COL_SUR.desc] ?? '').trim(),
    'Inventario UND':   onHand,
    'Tránsito':         Number(r[COL_SUR.transit]) || 0,
    'CEDI':             cedi,
    'Precio de Venta':  '',
    'DOH (8 días)':     '',
  }
  if (!quiebres[country]) quiebres[country] = []
  quiebres[country].push(row)
  quiebreCount++
}
console.log(`\n📊 Total filas Surtido: ${totalSur.toLocaleString()}`)
console.log(`📊 Quiebres (Inventario UND = 0): ${quiebreCount.toLocaleString()}\n`)

// ── 4. Generar un Excel por país ─────────────────────────────────────────
const outDir = 'C:/Users/IAN/Downloads'
for (const pais of Object.keys(quiebres).sort()) {
  const rows = quiebres[pais]
  const N = rows.length
  const wb = XLSX.utils.book_new()

  // Construir hoja manualmente con título en fila 1, info fila 2, headers fila 3, datos desde fila 4
  const cols = ['Tienda #','Tienda','UPC','Descripción','Inventario UND','Tránsito','CEDI','Precio de Venta','DOH (8 días)']
  const aoa = [
    [`Quiebres de Stock - Queso (${N} casos)`],
    [`Fecha del reporte: ${fechaHuman} · Datos: inventario_tiendas Supabase`],
    cols,
    ...rows.map(r => cols.map(c => r[c])),
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // Merge título y subtítulo
  ws['!merges'] = ws['!merges'] ?? []
  ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: cols.length - 1 } })
  ws['!merges'].push({ s: { r: 1, c: 0 }, e: { r: 1, c: cols.length - 1 } })

  // Anchos
  ws['!cols'] = [
    { wch: 10 }, { wch: 30 }, { wch: 16 }, { wch: 48 },
    { wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 14 },
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Quiebres')
  const outPath = `${outDir}/Cobertura_${pais}_${fechaIso}.xlsx`
  XLSX.writeFile(wb, outPath)
  console.log(`  📄 ${outPath}  (${N} quiebres)`)
}
