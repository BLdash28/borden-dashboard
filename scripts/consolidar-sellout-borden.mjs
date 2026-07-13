/**
 * consolidar-sellout-borden.mjs
 * Consolida widget(12)+widget(13)+SV-crosstab, filtra Borden,
 * hace match con dim_producto y exporta Excel con hojas 2024/2025/2026.
 *
 * Output: C:/Users/IAN/Downloads/SELLOUT_CONSOLIDADO_BORDEN.xlsx
 */
import pg from 'pg'
import XLSX from 'xlsx'
import { readFileSync, createReadStream, writeFileSync as writeFsSync } from 'fs'
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

const outputPath = 'C:/Users/IAN/Downloads/SELLOUT_CONSOLIDADO_BORDEN_v5.xlsx'

// ── Tasas mensuales GTQ→USD ──────────────────────────────────────────────
// 2024: aproximadas (CONFIRMAR); 2025: reales; 2026: confirmadas ene-abr, may/jun = abr
const TASA = {
  2024: { 1: 7.83, 2: 7.82, 3: 7.81, 4: 7.80, 5: 7.79, 6: 7.78, 7: 7.77, 8: 7.76, 9: 7.75, 10: 7.74, 11: 7.74, 12: 7.74 },
  2025: { 1: 7.74831, 2: 7.72591, 3: 7.74430, 4: 7.72052, 5: 7.69294, 6: 7.70225, 7: 7.69160, 8: 7.67828, 9: 7.67520, 10: 7.67560, 11: 7.67520, 12: 7.67623 },
  2026: { 1: 7.68295, 2: 7.68077, 3: 7.67250, 4: 7.65775, 5: 7.65775, 6: 7.65775, 7: 7.65775, 8: 7.65775, 9: 7.65775, 10: 7.65775, 11: 7.65775, 12: 7.65775 },
}
const getTasa = (ano, mes) => TASA[ano]?.[mes] ?? 7.68

// ── 1. Cargar dim_producto y construir lookup por codigo_barras ──────────
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
console.log('🔌 Cargando dim_producto...')
const dimRes = await pool.query(`
  SELECT sku, codigo_barras, descripcion, categoria, subcategoria, presentacion
  FROM dim_producto
  WHERE codigo_barras IS NOT NULL
`)
console.log(`   ${dimRes.rows.length} productos en dim_producto`)

// Map: barcode_stripped → producto. Para match, usamos "el código del archivo
// (sin ceros líderes) es prefijo del DB" (DB tiene check digit extra)
const dimByPrefix = new Map()
for (const p of dimRes.rows) {
  const bc = String(p.codigo_barras).trim()
  // indexamos por TODOS los posibles prefijos de longitud 10-13
  // En la práctica, indexar por (bc sin último dígito) — esa será la versión del archivo sin ceros
  for (let len = bc.length - 1; len >= Math.max(8, bc.length - 3); len--) {
    const prefix = bc.slice(0, len)
    if (!dimByPrefix.has(prefix)) dimByPrefix.set(prefix, p)
  }
  // también el código completo
  dimByPrefix.set(bc, p)
}
console.log(`   Lookup construido: ${dimByPrefix.size} entradas`)

// Mapeos manuales para EANs mal exportados por RetailLink
const EAN_FIX = {
  '0005300003502': '53000003502',   // BORDEN Americano 12 rebanadas (file le falta 1 cero)
  '5300003502':    '53000003502',
}

const lookupProducto = (codigoArchivo) => {
  let norm = String(codigoArchivo).trim().replace(/^0+/, '')
  // 1. Fix manual primero
  const fix = EAN_FIX[codigoArchivo?.trim()] ?? EAN_FIX[norm]
  if (fix) norm = fix
  // 2. Probar con longitud completa, luego 12, 11, 10...
  for (let len = norm.length; len >= 8; len--) {
    const p = dimByPrefix.get(norm.slice(0, len))
    if (p) return p
  }
  return null
}

// ── 2. Stream-procesar un CSV de Unisuper GT (widget) ────────────────────
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

const allRows = []
let stats = { matched: 0, notMatched: 0 }

async function processGtWidget(path, useYears) {
  console.log(`\n📂 Procesando ${path} (años: ${useYears.join(',')})`)
  const rl = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity })
  let headers = null, COL = null, total = 0, borden = 0, kept = 0
  for await (const lineRaw of rl) {
    const line = lineRaw.replace(/^﻿/, '')
    if (!line.trim()) continue
    if (!headers) {
      headers = parseCsv(line).map(h => h.trim())
      const idx = Object.fromEntries(headers.map((h, i) => [h, i]))
      COL = {
        fecha: idx['Fecha'], cadena: idx['Cadena'], nomSuc: idx['Nombre sucursal'],
        categoria: idx['Categoría'], subcat: idx['Subcategoría'], marca: idx['Marca'],
        sku: idx['SKU'], barcode: idx['Codigo Barra'], desc: idx['Descripción Larga'],
        unidades: idx['Venta unidades'], valorGtq: idx['Venta valor sin IVA (GTQ)'],
      }
      continue
    }
    total++
    const r = parseCsv(line)
    if ((r[COL.marca] ?? '').trim().toUpperCase() !== 'BORDEN') continue
    borden++

    const [ano, mes, dia] = (r[COL.fecha] ?? '').split('-').map(Number)
    if (!useYears.includes(ano)) continue
    kept++

    const codBarras = (r[COL.barcode] ?? '').trim()
    const dim = lookupProducto(codBarras)
    if (dim) stats.matched++; else stats.notMatched++

    const valorGtq = parseFloat(r[COL.valorGtq]) || 0
    const valorUsd = valorGtq / getTasa(ano, mes)

    const cadGt = cleanCadenaGt(r[COL.cadena])
    allRows.push({
      pais: 'GT',
      cliente: 'UNISUPER',
      cadena: cadGt,
      formato: FORMATO[cadGt] ?? '',
      categoria: dim?.categoria ?? r[COL.categoria],
      subcategoria: dim?.subcategoria ?? r[COL.subcat],
      punto_venta: r[COL.nomSuc],
      codigo_barras: dim?.codigo_barras ?? codBarras.replace(/^0+/, ''),
      sku: dim?.sku ?? r[COL.sku],
      descripcion: dim?.descripcion ?? r[COL.desc],
      ano, mes, dia,
      ventas_unidades: parseFloat(r[COL.unidades]) || 0,
      ventas_valor: valorUsd,
    })
    if (total % 200000 === 0) process.stdout.write(`\r  ${total.toLocaleString()} filas leídas · ${kept.toLocaleString()} guardadas`)
  }
  console.log(`\n  ✅ ${total.toLocaleString()} total · ${borden.toLocaleString()} Borden · ${kept.toLocaleString()} guardadas (años ${useYears.join(',')})`)
}

// ── 3. Procesar SV (UTF-16, tabs) ────────────────────────────────────────
async function processSvCrosstab(path) {
  console.log(`\n📂 Procesando ${path} (SV Unisuper)`)
  const buf = readFileSync(path)
  const text = (buf[0] === 0xFF && buf[1] === 0xFE)
    ? buf.slice(2).toString('utf16le')
    : buf.toString('utf8')
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  const headers = lines[0].split('\t').map(h => h.trim())
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]))
  const COL = {
    grupo: idx['Grupo'], tienda: idx['Tienda'], codInt: idx['Codigo Interno Str'],
    barcode: idx['Codigo Barra'], producto: idx['Producto'], fecha: idx['FECHA'],
    unidades: idx['Ventas Uni'], valor: idx['Ventas Val'],
  }
  let total = 0, kept = 0
  for (let i = 1; i < lines.length; i++) {
    const r = lines[i].split('\t')
    total++
    const producto = (r[COL.producto] ?? '').trim().toUpperCase()
    if (!producto.includes('BORDEN')) continue

    const [ano, mes, dia] = (r[COL.fecha] ?? '').split('-').map(Number)
    if (!ano) continue
    kept++

    const codBarras = (r[COL.barcode] ?? '').trim()
    const dim = lookupProducto(codBarras)
    if (dim) stats.matched++; else stats.notMatched++

    allRows.push({
      pais: 'SV',
      cliente: 'SELECTOS',
      cadena: 'SELECTOS',
      formato: 'SUPERMERCADO',
      categoria: dim?.categoria ?? (r[COL.grupo] ?? '').trim(),
      subcategoria: dim?.subcategoria ?? '',
      punto_venta: (r[COL.tienda] ?? '').trim(),
      codigo_barras: dim?.codigo_barras ?? codBarras.replace(/^0+/, ''),
      sku: dim?.sku ?? (r[COL.codInt] ?? '').trim(),
      descripcion: dim?.descripcion ?? (r[COL.producto] ?? '').trim(),
      ano, mes, dia,
      ventas_unidades: parseFloat(r[COL.unidades]) || 0,
      ventas_valor: parseFloat(r[COL.valor]) || 0,
    })
  }
  console.log(`  ✅ ${total.toLocaleString()} total · ${kept.toLocaleString()} guardadas (Borden)`)
}

// ── 4. Walmart XLS (streaming XML — sheet1.xml extraído) ─────────────────
// MI varía por país: CR/NI = MAXI PALI · GT/HN/SV = MAXI DESPENSA
const CADENA_WM = {
  CR: { HM: 'WALMART', ME: 'MAS X MENOS', MI: 'MAXI PALI', PI: 'PALI' },
  GT: { HM: 'WALMART', PZ: 'PAIZ', MI: 'MAXI DESPENSA', DF: 'DESPENSA FAMILIAR' },
  HN: { HM: 'WALMART', PZ: 'PAIZ', MI: 'MAXI DESPENSA', DF: 'DESPENSA FAMILIAR' },
  NI: { HM: 'WALMART', LN: 'LA UNION', MI: 'MAXI PALI', PI: 'PALI' },
  SV: { HM: 'WALMART', LJ: 'LA DESPENSA DON JUAN', MI: 'MAXI DESPENSA' },
}
// Formato por cadena standardizada
const FORMATO = {
  'WALMART':              'HIPERMERCADO',
  'PAIZ':                 'SUPERMERCADO',
  'MAS X MENOS':          'SUPERMERCADO',
  'LA UNION':             'SUPERMERCADO',
  'LA DESPENSA DON JUAN': 'SUPERMERCADO',
  'MAXI DESPENSA':        'BODEGAS',
  'MAXI PALI':            'BODEGAS',
  'PALI':                 'DESCUENTOS',
  'DESPENSA FAMILIAR':    'DESCUENTOS',
  'LA TORRE':             'HIPERMERCADO',
  'ECONOSUPER':           'DESCUENTOS',
  'GIGANTE':              'HIPERMERCADO',
}

const mapCadenaWm = (country, finRptCode) => {
  const c = (country ?? '').trim().toUpperCase()
  const code = (finRptCode ?? '').trim().toUpperCase()
  return CADENA_WM[c]?.[code] ?? code
}

// Unisuper GT: "1 LA TORRE" → "LA TORRE"; "2 ECONOSUPER" → "ECONOSUPER"
const cleanCadenaGt = (raw) => (raw ?? '').replace(/^\d+\s+/, '').trim()

async function processWalmart(path) {
  console.log(`\n📂 Procesando ${path} (Walmart streaming XML)`)
  const rl = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity })
  let total = 0, kept = 0
  let buf = ''
  for await (const line of rl) {
    // acumular hasta encontrar </row>
    if (line.startsWith('<row r="')) {
      buf = line + ' '
      continue
    }
    buf += line + ' '
    if (!line.includes('</row>')) continue
    total++

    // extraer pares de cells: <c r="X#" ...>(<v>VAL</v>|<is><t>VAL</t></is>)</c>
    // procesamos en orden y armamos array de valores por columna (A=0, B=1, ...)
    const vals = []
    const re = /<c r="([A-Z]+)\d+"[^>]*>(?:<v>([^<]*)<\/v>|<is><t>([^<]*)<\/t><\/is>)?<\/c>/g
    let m
    while ((m = re.exec(buf))) {
      const colLetter = m[1]
      const colIdx = colLetter.length === 1
        ? colLetter.charCodeAt(0) - 65
        : (colLetter.charCodeAt(0) - 64) * 26 + (colLetter.charCodeAt(1) - 65)
      vals[colIdx] = m[2] ?? m[3] ?? ''
    }
    buf = ''
    if (vals.length < 14) continue
    // [0]Country [1]ItemNbr [2]UPC [3]SigningDesc [4]BrandID [5]BrandDesc
    // [6]Daily [7]WMWeek [8]POSQty [9]POSSales [10]POSSalesUSD
    // [11]StoreNbr [12]StoreName [13]FinRptCode
    const [country, itemNbr, upc, signingDesc, , brandDesc, daily, , posQty, , posSalesUsd, , storeName, finRptCode] = vals
    if ((brandDesc ?? '').trim().toUpperCase() !== 'BORDEN') continue
    const [ano, mes, dia] = (daily ?? '').split('/').map(Number)
    if (!ano) continue
    kept++

    const codBarras = (upc ?? '').trim()
    const dim = lookupProducto(codBarras)
    if (dim) stats.matched++; else stats.notMatched++

    const cadWm = mapCadenaWm(country, finRptCode)
    allRows.push({
      pais: (country ?? '').trim().toUpperCase(),
      cliente: 'WALMART',
      cadena: cadWm,
      formato: FORMATO[cadWm] ?? '',
      categoria: dim?.categoria ?? '',
      subcategoria: dim?.subcategoria ?? '',
      punto_venta: (storeName ?? '').trim(),
      codigo_barras: dim?.codigo_barras ?? codBarras.replace(/^0+/, ''),
      sku: dim?.sku ?? (itemNbr ?? '').trim(),
      descripcion: dim?.descripcion ?? (signingDesc ?? '').trim(),
      ano, mes, dia,
      ventas_unidades: parseFloat(posQty) || 0,
      ventas_valor: parseFloat(posSalesUsd) || 0,
    })
    if (total % 500000 === 0) process.stdout.write(`\r  ${total.toLocaleString()} filas · ${kept.toLocaleString()} Borden`)
  }
  console.log(`\n  ✅ ${total.toLocaleString()} filas · ${kept.toLocaleString()} Borden`)
}

// ── EJECUCIÓN ────────────────────────────────────────────────────────────
await processGtWidget('C:/Users/IAN/Downloads/widget (12).csv', [2024])
await processGtWidget('C:/Users/IAN/Downloads/widget (16).csv', [2025])
await processGtWidget('C:/Users/IAN/Downloads/widget (13).csv', [2026])
await processSvCrosstab('C:/Users/IAN/Downloads/SELL_OUT_Diario_crosstab (2).csv')
await processWalmart('C:/Users/IAN/AppData/Local/Temp/wm_xls/xl/worksheets/sheet1.xml')

console.log(`\n📊 Total filas consolidadas: ${allRows.length.toLocaleString()}`)
console.log(`   Match con dim_producto: ${stats.matched.toLocaleString()} ✅  /  ${stats.notMatched.toLocaleString()} ❌`)

// ── 4. Separar por año + subtotales ──────────────────────────────────────
const porAno = { 2024: [], 2025: [], 2026: [] }
const subKey = new Map()
for (const r of allRows) {
  if (porAno[r.ano]) porAno[r.ano].push(r)
  const k = `${r.pais}|${r.cliente}|${r.ano}|${r.mes}`
  const s = subKey.get(k) ?? {
    pais: r.pais, cliente: r.cliente, ano: r.ano, mes: r.mes,
    ventas_unidades: 0, ventas_valor: 0
  }
  s.ventas_unidades += r.ventas_unidades
  s.ventas_valor += r.ventas_valor
  subKey.set(k, s)
}
const subtotales = [...subKey.values()]
  .sort((a, b) => a.pais.localeCompare(b.pais) || a.cliente.localeCompare(b.cliente) || a.ano - b.ano || a.mes - b.mes)
  .map(s => ({
    pais: s.pais, cliente: s.cliente, ano: s.ano, mes: s.mes,
    ventas_unidades: Math.round(s.ventas_unidades),
    ventas_valor_usd: Math.round(s.ventas_valor * 100) / 100,
  }))

console.log('\n=== Subtotales (USD) ===')
console.log('Pais Cliente   Año-Mes   Unidades     USD')
for (const s of subtotales) {
  console.log(`  ${s.pais}  ${s.cliente.padEnd(8)} ${s.ano}-${String(s.mes).padStart(2, '0')}  ${String(s.ventas_unidades).padStart(8)}  $${s.ventas_valor_usd.toLocaleString().padStart(12)}`)
}

// ── 5. Escribir CSV por año (rapidísimo) + Subtotales Excel ──────────────
console.log('\n✍️  Escribiendo CSVs...')
const baseDir = 'C:/Users/IAN/Downloads'
const cols = ['pais','cliente','cadena','formato','categoria','subcategoria','punto_venta','codigo_barras','sku','descripcion','ano','mes','dia','ventas_unidades','ventas_valor']
const escape = (v) => {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
}
for (const ano of [2024, 2025, 2026]) {
  if (porAno[ano].length === 0) continue
  const lines = ['﻿' + cols.join(',')]   // BOM para Excel UTF-8
  for (const r of porAno[ano]) lines.push(cols.map(c => escape(r[c])).join(','))
  const out = `${baseDir}/SELLOUT_BORDEN_${ano}_v2.csv`
  writeFsSync(out, lines.join('\n'), 'utf8')
  console.log(`   📄 ${out} (${porAno[ano].length.toLocaleString()} filas)`)
}
// Subtotales como Excel (es chiquito)
const wbSub = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wbSub, XLSX.utils.json_to_sheet(subtotales), 'Subtotales')
XLSX.writeFile(wbSub, `${baseDir}/SELLOUT_BORDEN_SUBTOTALES_v2.xlsx`)
console.log(`   📄 ${baseDir}/SELLOUT_BORDEN_SUBTOTALES_v2.xlsx`)
console.log(`\n📄 ${outputPath}`)

await pool.end()
