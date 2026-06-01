/**
 * Genera archivos de cobertura CR y GT desde archivos RetailLink descargados.
 * Uso: node scripts/gen-cobertura-manual.mjs <surtido-inv.xls> <dcd-cedi.xls>
 */
import XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const [, , FILE_TIENDAS, FILE_CEDI] = process.argv
if (!FILE_TIENDAS || !FILE_CEDI) {
  console.error('Uso: node scripts/gen-cobertura-manual.mjs <surtido-inv.xls> <dcd-cedi.xls>')
  process.exit(1)
}

// ── Configuración ─────────────────────────────────────────────────────────────
const COUNTRIES = {
  CR: { name: 'Costa Rica',  cats: ['Quesos', 'Leches', 'Helados'] },
  GT: { name: 'Guatemala',   cats: ['Quesos'] },
}

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } }
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
const TITLE_FONT  = { bold: true, size: 11 }
const SUB_FONT    = { italic: true, size: 9, color: { argb: 'FF595959' } }
const COL_HEADERS = ['Tienda #', 'Tienda', 'UPC', 'Descripción', 'Inventario UND', 'Tránsito', 'CEDI (Cajas)']
const COL_WIDTHS  = [10, 30, 16, 42, 14, 10, 14]

// ── Categoría desde descripción ───────────────────────────────────────────────
function getcat(desc) {
  const d = desc.toUpperCase()
  if (d.includes('LECHE') || d.includes('LECH ') || d.startsWith('LECH')) return 'Leches'
  if (d.includes('HELAD') || d.includes('ICE CREAM')) return 'Helados'
  if (d.includes('QUESO') || d.includes('BORDEN QUE') || d.includes('QUES ') || d.includes(' QUE ')) return 'Quesos'
  return null
}

// ── Leer XLS → array de objetos con headers por nombre ───────────────────────
function readXls(path) {
  const raw = readFileSync(path)
  const wb  = XLSX.read(raw)
  const ws  = wb.Sheets[wb.SheetNames[0]]
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  // Primera fila con ≥5 celdas no vacías = headers
  let hdrIdx = -1
  for (let i = 0; i < data.length; i++) {
    if (data[i].filter(v => String(v).trim()).length >= 5) { hdrIdx = i; break }
  }
  if (hdrIdx < 0) throw new Error(`No se encontró fila de headers en ${path}`)

  const headers = data[hdrIdx].map(h => String(h).trim())
  const idx = name => headers.findIndex(h => h.toLowerCase() === name.toLowerCase())

  return { headers, data, hdrIdx, idx }
}

// ── Parsear Surtido-Inv ────────────────────────────────────────────────────────
function parseTiendas(path) {
  const { headers, data, hdrIdx, idx } = readXls(path)
  console.log('Tiendas headers:', headers)

  const COL = {
    pais:      idx('Country Code'),
    store:     idx('Store Nbr'),
    nombre:    idx('Store Name'),
    upc:       idx('UPC'),
    desc:      idx('Signing Desc'),
    inv_mano:  idx('Curr Str On Hand Qty'),
    transito:  idx('Curr Str In Transit Qty'),
  }
  console.log('Tiendas COL map:', COL)

  const rows = []
  for (let i = hdrIdx + 1; i < data.length; i++) {
    const row  = data[i]
    const pais = String(row[COL.pais] || '').trim()
    const upc  = String(row[COL.upc]  || '').trim()
    if (!pais || !upc) continue

    const desc    = String(row[COL.desc]     || '').trim()
    const inv     = parseFloat(row[COL.inv_mano]) || 0
    const transit = parseFloat(row[COL.transito]) || 0
    const cat     = getcat(desc)
    if (!cat) continue

    rows.push({
      pais,
      store:    parseInt(row[COL.store]) || 0,
      nombre:   String(row[COL.nombre] || '').trim(),
      upc,
      desc,
      inv_mano: inv,
      transito: transit,
      cat,
    })
  }
  return rows
}

// ── Parsear DCD CEDI ──────────────────────────────────────────────────────────
function parseCedi(path) {
  const { headers, data, hdrIdx, idx } = readXls(path)
  console.log('CEDI headers:', headers)

  const COL = {
    pais: idx('Country Code'),
    upc:  idx('UPC'),
    inv:  idx('Current WHSE On Hand Cases'),
  }
  console.log('CEDI COL map:', COL)

  // Map: pais+upc → inv_mano_cajas
  const cedi = {}
  for (let i = hdrIdx + 1; i < data.length; i++) {
    const row  = data[i]
    const pais = String(row[COL.pais] || '').trim()
    const upc  = String(row[COL.upc]  || '').trim()
    if (!pais || !upc) continue
    const key = `${pais}|${upc}`
    cedi[key] = parseFloat(row[COL.inv]) || 0
  }
  return cedi
}

// ── Escribir hoja de quiebres ─────────────────────────────────────────────────
function writeSheet(wb, rows, cat, pais, dateStr) {
  const ws = wb.addWorksheet(cat)

  ws.mergeCells('A1:G1')
  ws.getCell('A1').value = `Quiebres de Stock — ${cat} (${rows.length} casos) — ${pais}`
  ws.getCell('A1').font = TITLE_FONT

  ws.mergeCells('A2:G2')
  ws.getCell('A2').value = `Fecha del reporte: ${dateStr} · Datos: RetailLink`
  ws.getCell('A2').font = SUB_FONT

  COL_HEADERS.forEach((h, i) => {
    const c = ws.getCell(3, i + 1)
    c.value = h
    c.font  = HEADER_FONT
    c.fill  = HEADER_FILL
    c.alignment = { horizontal: 'center' }
  })
  COL_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  rows.forEach(r => {
    ws.addRow([r.store, r.nombre, r.upc, r.desc, r.inv_mano, r.transito, r.cedi ?? null])
  })

  console.log(`  [${pais}] ${cat}: ${rows.length} quiebres`)
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const tiendas = parseTiendas(FILE_TIENDAS)
  const cedi    = parseCedi(FILE_CEDI)

  // Fecha: hoy
  const now = new Date()
  const day   = String(now.getDate()).padStart(2, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const year  = now.getFullYear()
  const dateStr  = `${day}/${month}/${year}`
  const dateFile = `${year}-${month}-${day}`

  // Summary
  const dist = {}
  for (const r of tiendas) {
    const k = `${r.pais}/${r.cat}`
    dist[k] = { total: (dist[k]?.total || 0) + 1, quiebres: (dist[k]?.quiebres || 0) + (r.inv_mano <= 0 ? 1 : 0) }
  }
  console.log('\nDistribución total/quiebres:', JSON.stringify(dist, null, 2))

  for (const [code, cfg] of Object.entries(COUNTRIES)) {
    console.log(`\nGenerando ${code}...`)
    const wb = new ExcelJS.Workbook()
    wb.creator = 'BL Dashboard'

    for (const cat of cfg.cats) {
      const rows = tiendas
        .filter(r => r.pais === code && r.cat === cat && r.inv_mano <= 0)
        .map(r => ({ ...r, cedi: cedi[`${code}|${r.upc}`] ?? null }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre) || a.desc.localeCompare(b.desc))

      writeSheet(wb, rows, cat, cfg.name, dateStr)
    }

    const outPath = `C:/Users/IAN/Documents/Cobertura_${code}_${dateFile}.xlsx`
    await wb.xlsx.writeFile(outPath)
    console.log(`  Guardado: ${outPath}`)
  }

  console.log('\nListo.')
}

main().catch(e => { console.error('ERROR:', e); process.exit(1) })
