/**
 * cargar-costa-dairy.mjs
 * Carga el archivo Excel de ventas de Costa Dairy en fact_ventas_costa_dairy.
 *
 * Costa Dairy es distribuidor de Borden en CR — revende a canales/clientes.
 * El archivo es un detalle de ventas (1 fila por num_doc × cod_cliente × cod_articulo).
 *
 * Uso:  node scripts/cargar-costa-dairy.mjs "C:/Users/IAN/Downloads/Data Borden Jun 26.xlsx"
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

// Tasa CRC → USD (junio 2026, promedio ~500 CRC = 1 USD)
const TASA_USD = 1 / 510   // ajustar según data oficial
const toUsd = (crc) => Math.round((Number(crc) || 0) * TASA_USD * 100) / 100

// Fecha Excel serial → YYYY-MM-DD
const excelToDate = (n) => {
  const num = Number(n)
  if (!num || !isFinite(num) || num < 30000) return null
  const d = new Date(Date.UTC(1900, 0, 1) + (num - 2) * 86400000)
  return d.toISOString().slice(0, 10)
}

const inputPath = process.argv[2] || 'C:/Users/IAN/Downloads/Data Borden Jun 26.xlsx'
const archivo = basename(inputPath)
console.log(`📂 ${inputPath}`)

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 })

console.log('\n📥 dim_producto…')
const dimRes = await pool.query(`SELECT codigo_barras, sku, descripcion, categoria, subcategoria FROM dim_producto WHERE codigo_barras IS NOT NULL`)
const dimMap = new Map()
for (const r of dimRes.rows) dimMap.set(r.codigo_barras, r)
console.log(`   ${dimMap.size} productos`)

// Map por SKU para matchear cod_articulo (Costa Dairy usa el SKU Borden interno)
const dimBySku = new Map()
for (const r of dimRes.rows) {
  const key = String(r.sku).trim()
  if (key) dimBySku.set(key, r)
}
console.log(`   ${dimBySku.size} con SKU`)

// Leer Excel
const wb = XLSX.readFile(inputPath)
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
console.log(`\n📊 ${rows.length} filas leídas`)

// Procesar y enriquecer
const filas = []
let sinFecha = 0, anuladas = 0, sinSku = 0, ceros = 0
const skusUnknown = new Set()
for (const r of rows) {
  const fecha = excelToDate(r['fecha'])
  if (!fecha) { sinFecha++; continue }

  const anulado = String(r['anulado'] ?? '').trim().toLowerCase() === 'si'
  // Mantener notas crédito (vienen como anulado='no' y valor negativo): son legítimas

  const codArt = String(r['cod articulo'] ?? r['cod_articulo'] ?? '').trim()
  const uds    = Number(r['venta unidades']) || 0
  const crc    = Number(r['venta colones']) || 0
  const bultos = Number(r['venta bultos']) || 0

  if (uds === 0 && crc === 0 && bultos === 0) { ceros++; continue }

  const dim = codArt ? dimBySku.get(codArt) : null
  if (!dim) { sinSku++; if (codArt) skusUnknown.add(codArt) }

  filas.push({
    fecha,
    num_doc: String(r['num doc'] ?? '').trim() || null,
    tipo_documento: String(r['tipo docum'] ?? '').trim() || null,
    anulado,
    codvendedor: String(r['codvendedor'] ?? '').trim() || null,
    vendedor:    String(r['vendedor']    ?? '').trim() || null,
    ruta:        String(r['ruta']        ?? '').trim() || null,
    nomruta:     String(r['nomruta']     ?? '').trim() || null,
    canal_kc:    String(r['canal kc']    ?? '').trim() || null,
    subcanal_kc: String(r['subcanal kc'] ?? '').trim() || null,
    canal_ul:    String(r['canal ul']    ?? '').trim() || null,
    subcanal_ul: String(r['subcanal ul'] ?? '').trim() || null,
    zona:        String(r['zona']        ?? '').trim() || null,
    estado_cliente: String(r['estado_cliente'] ?? '').trim() || null,
    cod_cliente: String(r['cod_cliente'] ?? '').trim() || null,
    nom_cliente: String(r['nom_cliente'] ?? '').trim() || null,
    direccion:   String(r['direccion']   ?? '').trim() || null,
    proveedor:   String(r['proveedor']   ?? '').trim() || null,
    linea:       String(r['linea(arq101)']   ?? '').trim() || null,
    marca:       String(r['marca(arq102)']   ?? '').trim() || null,
    familia:     String(r['familia(arq103)'] ?? '').trim() || null,
    genero:      String(r['genero(arq104)']  ?? '').trim() || null,
    sector:      String(r['sector(arq201)']  ?? '').trim() || null,
    subsector:   String(r['subsector(arq202)'] ?? '').trim() || null,
    segmento:    String(r['segmento(arq203)']  ?? '').trim() || null,
    cod_articulo: codArt || null,
    des_articulo: String(r['des_articulo'] ?? r['des articulo'] ?? '').trim() || null,
    sku:           dim?.sku ?? null,
    codigo_barras: dim?.codigo_barras ?? null,
    categoria:     dim?.categoria ?? null,
    subcategoria:  dim?.subcategoria ?? null,
    ventas_unidades: uds,
    ventas_colones:  crc,
    ventas_bultos:   bultos,
    ventas_valor:    toUsd(crc),
  })
}

console.log(`\n📊 Stats:`)
console.log(`   leídas:    ${rows.length}`)
console.log(`   sin fecha: ${sinFecha}`)
console.log(`   sin SKU match dim_producto: ${sinSku}`)
console.log(`   0/0/0:     ${ceros}`)
console.log(`   válidas:   ${filas.length}`)
if (skusUnknown.size) console.log(`   SKUs no en dim_producto: ${[...skusUnknown].slice(0,20).join(', ')}${skusUnknown.size > 20 ? '...' : ''}`)

// Rangos
const fechas = filas.map(f => f.fecha).sort()
console.log(`   rango fechas: ${fechas[0]} → ${fechas[fechas.length-1]}`)
const sumUds = filas.reduce((s,f) => s + f.ventas_unidades, 0)
const sumCrc = filas.reduce((s,f) => s + f.ventas_colones, 0)
const sumUsd = filas.reduce((s,f) => s + f.ventas_valor, 0)
console.log(`   totales: ${sumUds.toLocaleString()} und · ₡${sumCrc.toLocaleString('en-US',{maximumFractionDigits:0})} · $${sumUsd.toLocaleString('en-US',{maximumFractionDigits:2})}`)

// UPSERT en batch
console.log(`\n📥 Insertando ${filas.length} filas (UPSERT por num_doc+cod_cliente+cod_articulo+fecha)…`)
const COLS = [
  'fecha','num_doc','tipo_documento','anulado',
  'codvendedor','vendedor','ruta','nomruta',
  'canal_kc','subcanal_kc','canal_ul','subcanal_ul','zona',
  'estado_cliente','cod_cliente','nom_cliente','direccion',
  'proveedor','linea','marca','familia','genero','sector','subsector','segmento',
  'cod_articulo','des_articulo','sku','codigo_barras','categoria','subcategoria',
  'ventas_unidades','ventas_colones','ventas_bultos','ventas_valor','archivo_origen',
]
const BATCH = 500
for (let i = 0; i < filas.length; i += BATCH) {
  const chunk = filas.slice(i, i + BATCH)
  const vals = [], params = []
  let p = 1
  for (const f of chunk) {
    const row = COLS.map(c => c === 'archivo_origen' ? archivo : f[c])
    vals.push('(' + row.map(() => `$${p++}`).join(',') + ')')
    params.push(...row)
  }
  await pool.query(`
    INSERT INTO fact_ventas_costa_dairy (${COLS.join(',')})
    VALUES ${vals.join(',')}
    ON CONFLICT (num_doc, cod_cliente, cod_articulo, fecha) DO UPDATE SET
      ventas_unidades = EXCLUDED.ventas_unidades,
      ventas_colones  = EXCLUDED.ventas_colones,
      ventas_bultos   = EXCLUDED.ventas_bultos,
      ventas_valor    = EXCLUDED.ventas_valor,
      anulado         = EXCLUDED.anulado,
      sku             = COALESCE(EXCLUDED.sku, fact_ventas_costa_dairy.sku),
      codigo_barras   = COALESCE(EXCLUDED.codigo_barras, fact_ventas_costa_dairy.codigo_barras)
  `, params)
  process.stdout.write(`\r   ${i + chunk.length}/${filas.length}`)
}

console.log(`\n\n🔎 Resumen por canal (fact_ventas_costa_dairy):`)
let r = await pool.query(`
  SELECT canal_ul, COUNT(*) AS n, SUM(ventas_unidades) AS uds,
         ROUND(SUM(ventas_colones)::numeric,0) AS crc,
         ROUND(SUM(ventas_valor)::numeric,2) AS usd
  FROM fact_ventas_costa_dairy
  WHERE pais='CR' AND cadena='COSTA DAIRY'
  GROUP BY canal_ul ORDER BY crc DESC
`)
for (const x of r.rows) {
  console.log(`   ${(x.canal_ul ?? '—').padEnd(18)} ${String(x.n).padStart(5)} filas · ${Number(x.uds).toLocaleString().padStart(8)} und · ₡${Number(x.crc).toLocaleString().padStart(10)} · $${Number(x.usd).toLocaleString()}`)
}

await pool.end()
console.log('\n🎉 Carga Costa Dairy completa')
