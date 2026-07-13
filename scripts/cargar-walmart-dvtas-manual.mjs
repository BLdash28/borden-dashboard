/**
 * cargar-walmart-dvtas-manual.mjs
 * Carga un archivo DVTAS (RetailLink Excel) manualmente descargado a fact_ventas_walmart.
 *
 * Reglas:
 *   - Solo filas con POS Qty > 0 (descartar los ceros / placeholders futuros).
 *   - Match UPC contra dim_producto (con override + variantes con check digit).
 *   - Cadena y formato derivados de Financial Rpt Code + país.
 *   - UPSERT por (fecha, pais, punto_venta, codigo_barras).
 *   - Refresca MVs al final.
 *
 * Uso:
 *   node scripts/cargar-walmart-dvtas-manual.mjs "<ruta_archivo.xls>"
 */
import pg from 'pg'
import XLSX from 'xlsx'
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

const INPUT = process.argv[2]
if (!INPUT) { console.error('Uso: node cargar-walmart-dvtas-manual.mjs <archivo>'); process.exit(1) }

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 })

// ── Financial Rpt Code → cadena/formato ─────────────────────────────
// (memory: project_walmart_rptcodes)
const RPT_CADENA = {
  HM: 'WALMART',
  PI: 'PALI',
  ME: 'MAS X MENOS',
  DF: 'DESPENSA FAMILIAR',
  PZ: 'PAIZ',
  LJ: 'LA DESPENSA DON JUAN',
  LN: 'LA UNION',
}
// MI depende del país (CR/NI = MAXI PALI · GT/HN/SV = MAXI DESPENSA)
const rptToCadena = (rpt, pais) => {
  if (rpt === 'MI') return (pais === 'CR' || pais === 'NI') ? 'MAXI PALI' : 'MAXI DESPENSA'
  return RPT_CADENA[rpt] ?? rpt
}
const CADENA_FORMATO = {
  'WALMART': 'HIPERMERCADO',
  'PAIZ': 'SUPERMERCADO',
  'MAS X MENOS': 'SUPERMERCADO',
  'LA UNION': 'SUPERMERCADO',
  'LA DESPENSA DON JUAN': 'SUPERMERCADO',
  'MAXI DESPENSA': 'BODEGAS',
  'MAXI PALI': 'BODEGAS',
  'PALI': 'DESCUENTOS',
  'DESPENSA FAMILIAR': 'DESCUENTOS',
}

// ── dim_producto lookup ────────────────────────────────────────────
console.log('📥 dim_producto…')
const dimRes = await pool.query(`SELECT codigo_barras, sku, descripcion, categoria, subcategoria FROM dim_producto WHERE codigo_barras IS NOT NULL`)
const dimSet = new Set(dimRes.rows.map(r => r.codigo_barras))
const dimByCb = new Map()
for (const r of dimRes.rows) dimByCb.set(r.codigo_barras, r)
console.log(`   ${dimByCb.size} productos`)

const UPC_OVERRIDE = { '5300003502': '53000003502', '53000057253': '5300005275', '53000071884': '530000718800' }
const upcCanon = (raw) => {
  if (!raw) return null
  const s = String(raw).trim().replace(/^0+/, '')
  if (UPC_OVERRIDE[s] && dimSet.has(UPC_OVERRIDE[s])) return UPC_OVERRIDE[s]
  if (dimSet.has(s)) return s
  for (let d = 0; d <= 9; d++) if (dimSet.has(s + d)) return s + d
  return null
}

// ── Parse fecha "MM/DD/YYYY", "YYYY/MM/DD", "YYYY-MM-DD" o serial Excel
const parseFecha = (v) => {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') {
    const d = new Date(Date.UTC(1900, 0, 1) + (v - 2) * 86400000)
    return d.toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  // YYYY/MM/DD o YYYY-MM-DD
  let m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/)
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`
  // MM/DD/YYYY
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`
  return null
}

// ── Leer archivo ──────────────────────────────────────────────────
console.log(`\n📂 ${basename(INPUT)}`)
const wb = XLSX.readFile(INPUT)
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

// Detectar fila de headers (buscar "Country Code" en col 0)
let headerRow = -1
for (let i = 0; i < 100; i++) {
  if (String(rows[i]?.[0] ?? '') === 'Country Code') { headerRow = i; break }
}
if (headerRow < 0) throw new Error('No se encontraron headers (Country Code no está en las primeras 100 filas)')
const headers = rows[headerRow]
console.log(`   Headers en fila ${headerRow}: ${headers.length} cols`)

const idxOf = (nombre) => headers.indexOf(nombre)
const I_PAIS   = idxOf('Country Code')
const I_RPT    = idxOf('Financial Rpt Code')
const I_STORE_NBR   = idxOf('Store Nbr')
const I_STORE  = idxOf('Store Name')
const I_DAILY  = idxOf('Daily')
const I_ITEM   = idxOf('Item Nbr')
const I_UPC    = idxOf('UPC')
const I_QTY    = idxOf('POS Qty')
const I_USD    = idxOf('POS Sales US Dollars')
if ([I_PAIS,I_RPT,I_STORE,I_DAILY,I_UPC,I_QTY,I_USD].some(i => i < 0)) {
  console.error('Columnas no encontradas:', {I_PAIS,I_RPT,I_STORE,I_DAILY,I_UPC,I_QTY,I_USD})
  throw new Error('Faltan columnas requeridas')
}

console.log(`   Índices: pais=${I_PAIS} rpt=${I_RPT} store=${I_STORE} daily=${I_DAILY} upc=${I_UPC} qty=${I_QTY} usd=${I_USD}`)

const filas = []
const fechasArchivo = new Set()
const paisesArchivo = new Set()
let leidas = 0, ceros = 0, sinFecha = 0, sinMatch = 0
const sinMatchUpcs = new Set()

for (let i = headerRow + 1; i < rows.length; i++) {
  const r = rows[i]
  if (!r || r.length < 10) continue
  const pais = String(r[I_PAIS] ?? '').trim()
  if (!pais || pais.length !== 2) continue
  leidas++

  const qty = Number(r[I_QTY]) || 0
  const usd = Number(r[I_USD]) || 0
  if (qty === 0 && usd === 0) { ceros++; continue }

  const fecha = parseFecha(r[I_DAILY])
  if (!fecha) { sinFecha++; continue }
  fechasArchivo.add(fecha); paisesArchivo.add(pais)

  const upcRaw = String(r[I_UPC] ?? '').trim()
  const canon = upcCanon(upcRaw)
  if (!canon) { sinMatch++; if (upcRaw) sinMatchUpcs.add(upcRaw); continue }
  const dim = dimByCb.get(canon)

  const rpt = String(r[I_RPT] ?? '').trim()
  const cadena = rptToCadena(rpt, pais)
  const formato = CADENA_FORMATO[cadena] ?? null
  const storeName = String(r[I_STORE] ?? '').trim()
  // Punto de venta con prefijo país (si no lo tiene)
  const pv = storeName.startsWith(`${pais}-`) ? storeName : `${pais}-${storeName}`

  filas.push({
    fecha,
    pais,
    cadena,
    formato,
    punto_venta:    pv,
    codigo_barras:  canon,
    sku:            dim.sku,
    descripcion:    dim.descripcion,
    categoria:      dim.categoria,
    subcategoria:   dim.subcategoria,
    ventas_unidades: qty,
    ventas_valor:    usd,
    archivo_origen: basename(INPUT),
  })
}

console.log(`\n📊 Stats:`)
console.log(`   Total leídas:      ${leidas.toLocaleString()}`)
console.log(`   Filas 0/0 (skip):  ${ceros.toLocaleString()}`)
console.log(`   Sin fecha (skip):  ${sinFecha.toLocaleString()}`)
console.log(`   Sin match (skip):  ${sinMatch.toLocaleString()}`)
console.log(`   Válidas:           ${filas.length.toLocaleString()}`)
console.log(`   Países:            ${[...paisesArchivo].sort().join(', ')}`)
console.log(`   Fechas:            ${[...fechasArchivo].sort().join(', ')}`)
if (sinMatchUpcs.size) console.log(`   UPCs sin match (${sinMatchUpcs.size}): ${[...sinMatchUpcs].slice(0,10).join(', ')}`)

// Dedup por clave de conflicto
const seen = new Map()
for (const r of filas) {
  const k = `${r.fecha}|${r.pais}|${r.punto_venta}|${r.codigo_barras}`
  const prev = seen.get(k)
  if (prev) {
    prev.ventas_unidades += r.ventas_unidades
    prev.ventas_valor    += r.ventas_valor
  } else seen.set(k, { ...r })
}
const dedup = [...seen.values()]
if (dedup.length < filas.length) console.log(`   Dedupeadas: ${filas.length} → ${dedup.length}`)

// ── UPSERT ────────────────────────────────────────────────────────
console.log(`\n📥 UPSERT ${dedup.length} filas a fact_ventas_walmart…`)
const COLS = ['fecha','pais','cadena','formato','punto_venta','codigo_barras','sku','descripcion','categoria','subcategoria','ventas_unidades','ventas_valor','archivo_origen']
const BATCH = 500
for (let i = 0; i < dedup.length; i += BATCH) {
  const chunk = dedup.slice(i, i + BATCH)
  const vals = [], params = []
  let p = 1
  for (const r of chunk) {
    vals.push('(' + COLS.map(() => `$${p++}`).join(',') + ')')
    for (const c of COLS) params.push(r[c])
  }
  await pool.query(`
    INSERT INTO fact_ventas_walmart (${COLS.join(',')})
    VALUES ${vals.join(',')}
    ON CONFLICT (fecha, pais, punto_venta, codigo_barras) DO UPDATE SET
      ventas_unidades = EXCLUDED.ventas_unidades,
      ventas_valor    = EXCLUDED.ventas_valor,
      cadena          = COALESCE(EXCLUDED.cadena, fact_ventas_walmart.cadena),
      formato         = COALESCE(EXCLUDED.formato, fact_ventas_walmart.formato)
  `, params)
  process.stdout.write(`\r   ${i + chunk.length}/${dedup.length}`)
}
console.log('\n   ✅')

// ── Refresh MVs ───────────────────────────────────────────────────
console.log('\n🔄 Refrescando MVs…')
for (const mv of ['mv_sellout_mensual','mv_ventas_agg','mv_sku_mensual']) {
  const t = Date.now()
  try {
    await pool.query(`REFRESH MATERIALIZED VIEW ${mv}`)
    console.log(`   ✅ ${mv} (${((Date.now()-t)/1000).toFixed(1)}s)`)
  } catch (e) { console.log(`   ⚠️  ${mv}: ${e.message}`) }
}

// ── Resumen ───────────────────────────────────────────────────────
console.log('\n🔎 Resumen por país + fecha post-carga:')
const s = await pool.query(`
  SELECT pais, fecha,
         COUNT(*) FILTER (WHERE ventas_unidades > 0) AS combos_con_venta,
         ROUND(SUM(ventas_unidades)::numeric,0) AS uds,
         ROUND(SUM(ventas_valor)::numeric,2) AS usd
  FROM fact_ventas_walmart
  WHERE archivo_origen = $1
  GROUP BY pais, fecha ORDER BY pais, fecha
`, [basename(INPUT)])
for (const x of s.rows) {
  console.log(`  ${x.pais} ${new Date(x.fecha).toISOString().slice(0,10)}: ${x.combos_con_venta} combos · ${Number(x.uds).toLocaleString()} und · $${Number(x.usd).toLocaleString('en-US', {maximumFractionDigits:2})}`)
}

await pool.end()
console.log('\n🎉 Carga Walmart DVTAS manual completa')
