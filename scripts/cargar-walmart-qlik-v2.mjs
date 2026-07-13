/**
 * cargar-walmart-qlik-v2.mjs
 * Carga "Sin título - Tabla simple - 12 de junio de 2026.xlsx" a fact_ventas_walmart.
 * Match UPC: Qlik UPC + check digit (0-9) → busca en dim_producto.codigo_barras.
 * 37/38 UPCs matchean. Para el 1 missing (5300003502) usa datos crudos del archivo.
 * Tabla fact_ventas_walmart ya está vacía (TRUNCATE anterior).
 */
import pg from 'pg'
import XLSX from 'xlsx'
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

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 })

// ── Maps ──────────────────────────────────────────────────────────────────
const MES_NUM = { ene:1, feb:2, mar:3, abr:4, may:5, jun:6, jul:7, ago:8, sep:9, oct:10, nov:11, dic:12 }
const FORMATO_MAP = {
  'Supermercados': 'SUPERMERCADO',
  'Bodegas':       'BODEGAS',
  'Descuentos':    'DESCUENTOS',
  'Walmart':       'HIPERMERCADO',
}
const CADENA_MAP = {
  'CR|MAS X MENOS':     'MAS X MENOS',
  'CR|MAXI PALI':       'MAXI PALI',
  'CR|PALI':            'PALI',
  'CR|WALMART':         'WALMART',
  'GT|PALI':            'PAIZ',
  'GT|DESP. FAMILIAR':  'DESPENSA FAMILIAR',
  'GT|WALMART':         'WALMART',
  'HN|MAXI DESPENSA':   'MAXI DESPENSA',
  'HN|PALI':            'PAIZ',
  'HN|WALMART':         'WALMART',
  'NI|MAXI PALI':       'MAXI PALI',
  'NI|UNIÓN':           'LA UNION',
  'NI|WALMART':         'WALMART',
  'SV|DESP. DON JUAN':  'LA DESPENSA DON JUAN',
  'SV|MAXI DESPENSA':   'MAXI DESPENSA',
  'SV|WALMART':         'WALMART',
}
// Para UPCs sin match en dim_producto, mapear categoría Qlik → categoría española
const CAT_MAP = {
  'CHEESES-D90': 'QUESO',
  'MILK&CREM-SUBSTUT-SHELF-D95': 'LECHE',
}

// ── 1. Cargar dim_producto ────────────────────────────────────────────────
console.log('📥 Cargando dim_producto…')
const dimRes = await pool.query(`SELECT codigo_barras, sku, descripcion, categoria, subcategoria FROM dim_producto WHERE codigo_barras IS NOT NULL`)
const dimMap = new Map()
for (const r of dimRes.rows) dimMap.set(r.codigo_barras, r)
console.log(`   ${dimMap.size} productos`)

// ── 2. Construir mapping UPC Qlik → dim (check-digit search + overrides) ──
// Casos especiales donde Qlik tiene un formato distinto al dim (ej. cero faltante en medio)
const UPC_OVERRIDE = {
  '5300003502': '53000003502',  // Americano 12 rebanadas (Qlik le falta un 0 en posición 5)
}
const matchDim = (qlikUpc) => {
  // 1) Override manual
  if (UPC_OVERRIDE[qlikUpc]) {
    const x = dimMap.get(UPC_OVERRIDE[qlikUpc])
    if (x) return x
  }
  // 2) Exact match
  if (dimMap.has(qlikUpc)) return dimMap.get(qlikUpc)
  // 3) Qlik + check digit (0-9)
  for (let dig = 0; dig <= 9; dig++) {
    const candidate = qlikUpc + String(dig)
    if (dimMap.has(candidate)) return dimMap.get(candidate)
  }
  return null
}

// ── 3. Leer XLSX y procesar ───────────────────────────────────────────────
const XLSX_PATH = 'C:/Users/IAN/Downloads/Sin título - Tabla simple - 12 de junio de 2026.xlsx'
console.log(`\n📂 ${XLSX_PATH.split('/').pop()}`)
const wb = XLSX.readFile(XLSX_PATH)
const ws = wb.Sheets[wb.SheetNames[0]]
const xrows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
console.log(`   ${xrows.length.toLocaleString()} filas (incluye header)`)

let leidas = 0, sinCadena = 0, sinFormato = 0, sinFecha = 0, ceros = 0
let viaDim = 0, viaRaw = 0
const rows = []
const sinCadenaSamples = new Set(), sinFormatoSamples = new Set()
const upcMatchCache = new Map()

for (let i = 1; i < xrows.length; i++) {
  const r = xrows[i]
  if (!r || !r.length) continue
  leidas++

  const pais   = String(r[0] ?? '').trim()
  const cadQ   = String(r[1] ?? '').trim()
  const tienda = String(r[2] ?? '').trim()
  const fmtQ   = String(r[3] ?? '').trim()
  const upcQ   = String(r[4] ?? '').trim()
  const artQ   = String(r[5] ?? '').trim()
  const catQ   = String(r[7] ?? '').trim()
  const subQ   = String(r[8] ?? '').trim()
  const ano    = Number(r[9])
  const mesS   = String(r[11] ?? '').trim().toLowerCase().slice(0, 3)
  const dia    = Number(r[12])
  const und    = Number(r[13]) || 0
  const usd    = Number(r[15]) || 0

  const mes = MES_NUM[mesS]
  if (!mes || !ano || !dia) { sinFecha++; continue }

  const cadena = CADENA_MAP[`${pais}|${cadQ}`]
  if (!cadena) { sinCadena++; sinCadenaSamples.add(`${pais}|${cadQ}`); continue }

  const formato = FORMATO_MAP[fmtQ]
  if (!formato) { sinFormato++; sinFormatoSamples.add(fmtQ); continue }

  if (und === 0 && usd === 0) { ceros++; continue }

  // Match UPC con check digit (cache para evitar lookups repetidos)
  let dim = upcMatchCache.get(upcQ)
  if (dim === undefined) {
    dim = matchDim(upcQ)
    upcMatchCache.set(upcQ, dim)
  }

  let codigo_barras, sku, categoria, subcategoria, descripcion
  if (dim) {
    codigo_barras = dim.codigo_barras
    sku           = dim.sku
    categoria     = dim.categoria
    subcategoria  = dim.subcategoria
    descripcion   = dim.descripcion
    viaDim++
  } else {
    // Fallback: usar UPC + datos del archivo Qlik, mapear categoría
    codigo_barras = upcQ
    sku           = ''
    categoria     = CAT_MAP[catQ] ?? catQ
    subcategoria  = subQ
    descripcion   = artQ
    viaRaw++
  }

  rows.push({
    fecha: `${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`,
    pais, cadena, formato, punto_venta: tienda,
    categoria, subcategoria, sku, codigo_barras, descripcion,
    ventas_unidades: und, ventas_valor: usd,
  })
}
console.log(`\n📊 Stats:`)
console.log(`   leídas:         ${leidas.toLocaleString()}`)
console.log(`   match dim:      ${viaDim.toLocaleString()}`)
console.log(`   fallback (raw): ${viaRaw.toLocaleString()}`)
console.log(`   sin cadena:     ${sinCadena.toLocaleString()}`)
console.log(`   sin formato:    ${sinFormato.toLocaleString()}`)
console.log(`   sin fecha:      ${sinFecha.toLocaleString()}`)
console.log(`   0/0:            ${ceros.toLocaleString()}`)
console.log(`   ✅ válidas:     ${rows.length.toLocaleString()}`)
if (sinCadenaSamples.size) console.log(`   Cadenas sin map: ${[...sinCadenaSamples].join(', ')}`)
if (sinFormatoSamples.size) console.log(`   Formatos sin map: ${[...sinFormatoSamples].join(', ')}`)

// ── 4. Agregar duplicados por (fecha, pais, punto_venta, codigo_barras) ──
const aggMap = new Map()
for (const r of rows) {
  const k = `${r.fecha}|${r.pais}|${r.punto_venta}|${r.codigo_barras}`
  const prev = aggMap.get(k)
  if (prev) {
    prev.ventas_unidades += r.ventas_unidades
    prev.ventas_valor    += r.ventas_valor
  } else {
    aggMap.set(k, { ...r })
  }
}
const agg = [...aggMap.values()]
if (agg.length < rows.length) console.log(`   🔀 agregado: ${rows.length.toLocaleString()} → ${agg.length.toLocaleString()}`)

const sumUSD = agg.reduce((s, r) => s + r.ventas_valor, 0)
const sumUnd = agg.reduce((s, r) => s + r.ventas_unidades, 0)
console.log(`   💰 total a insertar: ${sumUnd.toLocaleString()} und · $${sumUSD.toLocaleString('en-US', {maximumFractionDigits:2})}`)

// ── 5. INSERT ─────────────────────────────────────────────────────────────
console.log(`\n📥 Insertando ${agg.length.toLocaleString()} filas…`)
const BATCH = 1000
for (let i = 0; i < agg.length; i += BATCH) {
  const chunk = agg.slice(i, i + BATCH)
  const vals = [], params = []
  let p = 1
  for (const r of chunk) {
    vals.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`)
    params.push(
      r.fecha, r.pais, r.cadena, r.formato,
      r.categoria, r.subcategoria, r.punto_venta,
      r.sku, r.codigo_barras, r.descripcion,
      r.ventas_unidades, r.ventas_valor,
      'Qlik-Borden'
    )
  }
  await pool.query(`
    INSERT INTO fact_ventas_walmart
      (fecha, pais, cadena, formato, categoria, subcategoria, punto_venta, sku, codigo_barras, descripcion, ventas_unidades, ventas_valor, archivo_origen)
    VALUES ${vals.join(',')}
  `, params)
  process.stdout.write(`\r   ${(i + chunk.length).toLocaleString()}/${agg.length.toLocaleString()}`)
}
console.log(`\n   ✅ insertado`)

// ── 6. Refresh MVs ────────────────────────────────────────────────────────
console.log('\n🔄 Refrescando MVs…')
for (const mv of ['mv_sellout_mensual', 'mv_ventas_agg']) {
  const t0 = Date.now()
  try {
    await pool.query(`REFRESH MATERIALIZED VIEW ${mv}`)
    console.log(`   ✅ ${mv} (${((Date.now()-t0)/1000).toFixed(1)}s)`)
  } catch (e) { console.log(`   ⚠️  ${mv}: ${e.message}`) }
}

// ── 7. Verificación ───────────────────────────────────────────────────────
console.log('\n🔎 2025 por país:')
const ver = await pool.query(`
  SELECT pais, COUNT(*) AS n, ROUND(SUM(ventas_valor)::numeric, 0) AS usd
  FROM fact_ventas_walmart
  WHERE fecha >= '2025-01-01' AND fecha < '2026-01-01'
  GROUP BY pais ORDER BY pais
`)
let totN = 0, totV = 0
for (const x of ver.rows) {
  console.log(`   ${x.pais}: ${Number(x.n).toLocaleString()} filas · $${Number(x.usd).toLocaleString()}`)
  totN += Number(x.n); totV += Number(x.usd)
}
console.log(`   TOTAL: ${totN.toLocaleString()} filas · $${totV.toLocaleString()}`)

await pool.end()
console.log('\n🎉 Carga Qlik Walmart 2025 completa')
