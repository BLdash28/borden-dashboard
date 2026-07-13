/**
 * cargar-walmart-qlik-2026.mjs
 * Carga "Sin título - Tabla simple - 12 de junio de 2026 (1).xlsx" a fact_ventas_walmart.
 * Cubre enero-junio 2026, ~138k filas, $1.14M USD.
 *
 * Formato distinto al 2025: sin columna Cadena (se infiere del prefijo de Tienda).
 * Match UPC con check-digit + override conocido.
 * DELETE solo data 2026 (no toca 2025 ya cargado).
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

const MES_NUM = { ene:1, feb:2, mar:3, abr:4, may:5, jun:6, jul:7, ago:8, sep:9, oct:10, nov:11, dic:12 }
const FORMATO_MAP = {
  'Supermercados': 'SUPERMERCADO',
  'Bodegas':       'BODEGAS',
  'Descuentos':    'DESCUENTOS',
  'Walmart':       'HIPERMERCADO',
}

// Inferir cadena del prefijo de la tienda
const inferCadena = (tienda) => {
  const t = tienda.toUpperCase()
  // CR
  if (t.startsWith('CR-MXM ')) return 'MAS X MENOS'
  if (t.startsWith('CR-MP '))  return 'MAXI PALI'
  if (t.startsWith('CR-PALI')) return 'PALI'
  if (t.startsWith('CR-WM '))  return 'WALMART'
  // GT
  if (t.startsWith('GT-PAIZ ')) return 'PAIZ'
  if (t.startsWith('GT-DF '))   return 'DESPENSA FAMILIAR'
  if (t.startsWith('GT-MD ') || t.startsWith('GT-MAXI DESPENSA')) return 'MAXI DESPENSA'
  if (t.startsWith('GT-WM ') || t.startsWith('GT-WALMART'))       return 'WALMART'
  // HN
  if (t.startsWith('HN-PAIZ ')) return 'PAIZ'
  if (t.startsWith('HN-DF '))   return 'DESPENSA FAMILIAR'
  if (t.startsWith('HN-MD '))   return 'MAXI DESPENSA'
  if (t.startsWith('HN-WM '))   return 'WALMART'
  // NI
  if (t.startsWith('NI-MP '))    return 'MAXI PALI'
  if (t.startsWith('NI-PALI '))  return 'PALI'
  if (t.startsWith('NI-UNION ')) return 'LA UNION'
  if (t.startsWith('NI-WM '))    return 'WALMART'
  // SV
  if (t.startsWith('SV-DDJ ')) return 'LA DESPENSA DON JUAN'
  if (t.startsWith('SV-MD '))  return 'MAXI DESPENSA'
  if (t.startsWith('SV-WM '))  return 'WALMART'
  return null
}

// ── 1. dim_producto ───────────────────────────────────────────────────────
console.log('📥 Cargando dim_producto…')
const dimRes = await pool.query(`SELECT codigo_barras, sku, descripcion, categoria, subcategoria FROM dim_producto WHERE codigo_barras IS NOT NULL`)
const dimMap = new Map()
for (const r of dimRes.rows) dimMap.set(r.codigo_barras, r)
console.log(`   ${dimMap.size} productos`)

const UPC_OVERRIDE = {
  '5300003502': '53000003502',  // Americano 12 rebanadas
}
const matchDim = (upc) => {
  if (UPC_OVERRIDE[upc]) {
    const x = dimMap.get(UPC_OVERRIDE[upc])
    if (x) return x
  }
  if (dimMap.has(upc)) return dimMap.get(upc)
  for (let d = 0; d <= 9; d++) {
    const c = upc + String(d)
    if (dimMap.has(c)) return dimMap.get(c)
  }
  return null
}

// ── 2. Leer XLSX ──────────────────────────────────────────────────────────
const PATH = 'C:/Users/IAN/Downloads/Sin título - Tabla simple - 12 de junio de 2026 (1).xlsx'
console.log(`\n📂 ${PATH.split('/').pop()}`)
const wb = XLSX.readFile(PATH)
const ws = wb.Sheets[wb.SheetNames[0]]
const xrows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
console.log(`   ${xrows.length.toLocaleString()} filas`)

let leidas = 0, sinMatch = 0, sinCadena = 0, sinFormato = 0, sinFecha = 0, ceros = 0
const rows = []
const sinUpcs = new Set(), sinTiendas = new Set(), sinFmts = new Set()
const upcCache = new Map()

for (let i = 1; i < xrows.length; i++) {
  const r = xrows[i]
  if (!r || !r.length) continue
  leidas++

  const pais   = String(r[0] ?? '').trim()
  const tienda = String(r[1] ?? '').trim()
  const fmtQ   = String(r[2] ?? '').trim()
  const upcQ   = String(r[3] ?? '').trim()
  const ano    = Number(r[5])
  const mesS   = String(r[7] ?? '').trim().toLowerCase().slice(0, 3)
  const dia    = Number(r[8])
  const und    = Number(r[9]) || 0
  const usd    = Number(r[10]) || 0

  const mes = MES_NUM[mesS]
  if (!mes || !ano || !dia) { sinFecha++; continue }

  const cadena = inferCadena(tienda)
  if (!cadena) { sinCadena++; sinTiendas.add(tienda); continue }

  const formato = FORMATO_MAP[fmtQ]
  if (!formato) { sinFormato++; sinFmts.add(fmtQ); continue }

  if (und === 0 && usd === 0) { ceros++; continue }

  let dim = upcCache.get(upcQ)
  if (dim === undefined) { dim = matchDim(upcQ); upcCache.set(upcQ, dim) }
  if (!dim) { sinMatch++; sinUpcs.add(upcQ); continue }

  rows.push({
    fecha: `${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`,
    pais, cadena, formato, punto_venta: tienda,
    categoria: dim.categoria, subcategoria: dim.subcategoria,
    sku: dim.sku, codigo_barras: dim.codigo_barras, descripcion: dim.descripcion,
    ventas_unidades: und, ventas_valor: usd,
  })
}
console.log(`\n📊 Stats:`)
console.log(`   leídas:       ${leidas.toLocaleString()}`)
console.log(`   sin cadena:   ${sinCadena.toLocaleString()}`)
console.log(`   sin formato:  ${sinFormato.toLocaleString()}`)
console.log(`   sin fecha:    ${sinFecha.toLocaleString()}`)
console.log(`   sin match:    ${sinMatch.toLocaleString()}`)
console.log(`   0/0:          ${ceros.toLocaleString()}`)
console.log(`   ✅ válidas:   ${rows.length.toLocaleString()}`)
if (sinTiendas.size) console.log(`   Tiendas sin cadena: ${[...sinTiendas].slice(0, 10).join(', ')}`)
if (sinFmts.size) console.log(`   Formatos sin map: ${[...sinFmts].join(', ')}`)
if (sinUpcs.size) console.log(`   UPCs sin match: ${[...sinUpcs].join(', ')}`)

// ── 3. Aggregate ──────────────────────────────────────────────────────────
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
console.log(`   💰 a insertar: ${sumUnd.toLocaleString()} und · $${sumUSD.toLocaleString('en-US', {maximumFractionDigits:2})}`)

// ── 4. DELETE 2026 e INSERT ───────────────────────────────────────────────
console.log('\n🗑️  Borrando fact_ventas_walmart >= 2026-01-01…')
const del = await pool.query(`DELETE FROM fact_ventas_walmart WHERE fecha >= '2026-01-01'`)
console.log(`   ${del.rowCount.toLocaleString()} filas borradas`)

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

// ── 5. Refresh MVs ────────────────────────────────────────────────────────
console.log('\n🔄 Refrescando MVs…')
for (const mv of ['mv_sellout_mensual', 'mv_ventas_agg']) {
  const t0 = Date.now()
  try {
    await pool.query(`REFRESH MATERIALIZED VIEW ${mv}`)
    console.log(`   ✅ ${mv} (${((Date.now()-t0)/1000).toFixed(1)}s)`)
  } catch (e) { console.log(`   ⚠️  ${mv}: ${e.message}`) }
}

// ── 6. Verificación ───────────────────────────────────────────────────────
console.log('\n🔎 2026 por país:')
const ver = await pool.query(`
  SELECT pais, COUNT(*) AS n, ROUND(SUM(ventas_valor)::numeric, 0) AS usd
  FROM fact_ventas_walmart
  WHERE fecha >= '2026-01-01' AND fecha < '2027-01-01'
  GROUP BY pais ORDER BY pais
`)
let totN = 0, totV = 0
for (const x of ver.rows) {
  console.log(`   ${x.pais}: ${Number(x.n).toLocaleString()} filas · $${Number(x.usd).toLocaleString()}`)
  totN += Number(x.n); totV += Number(x.usd)
}
console.log(`   TOTAL: ${totN.toLocaleString()} filas · $${totV.toLocaleString()}`)

await pool.end()
console.log('\n🎉 Carga Qlik Walmart 2026 completa')
