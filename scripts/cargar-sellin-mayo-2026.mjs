/**
 * cargar-sellin-mayo-2026.mjs
 * Carga ventas_sellin_2025_2026.xlsx hoja 2026, filtra mayo, inserta a fact_sales_sellin.
 * También actualiza ventas_sell_in (la tabla simple) por consistencia.
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
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const PATH = 'C:/Users/IAN/OneDrive - BL Foods Corporation SA/ventas_sellin_2025_2026.xlsx'
console.log(`📂 ${PATH.split('/').pop()}`)
const wb = XLSX.readFile(PATH)
const ws = wb.Sheets['2026']
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
console.log(`   ${rows.length} filas en hoja 2026`)

const headers = rows[0].map(h => String(h).trim())
const H = (name) => headers.findIndex(h => h.toLowerCase() === name.toLowerCase())
const COL = {
  pais:     H('Pais'),
  cliente:  H('Cliente'),
  orden:    H('orden_Compra'),
  sku:      H('sku'),
  cb:       H('codigo de barras'),
  desc:     H('Descripcion'),
  cat:      H('Categoría'),
  sub:      H('subcategoria'),
  ano:      H('Año'),
  mes:      H('Mes'),
  cajas:    H('cantidad_cajas'),
  valor:    H('Valor_venta'),
  libras:   H('Libras'),
  precio:   H('Precio caja'),
  costo:    H('costo_total'),
}
console.log('   Columnas detectadas:', COL)

const mayo = []
for (let i = 1; i < rows.length; i++) {
  const r = rows[i]
  if (!r || !r.length) continue
  const ano = Number(r[COL.ano])
  const mes = Number(r[COL.mes])
  if (ano !== 2026 || mes !== 5) continue
  mayo.push({
    pais:           String(r[COL.pais] ?? '').trim(),
    cliente:        String(r[COL.cliente] ?? '').trim(),
    orden:          String(r[COL.orden] ?? '').trim(),
    sku:            String(r[COL.sku] ?? '').trim(),
    cb:             String(r[COL.cb] ?? '').trim(),
    descripcion:    String(r[COL.desc] ?? '').trim(),
    categoria:      String(r[COL.cat] ?? '').trim(),
    subcategoria:   String(r[COL.sub] ?? '').trim(),
    ano, mes,
    cajas:          Number(r[COL.cajas]) || 0,
    valor:          Number(r[COL.valor]) || 0,
    libras:         Number(r[COL.libras]) || null,
    precio:         Number(r[COL.precio]) || 0,
    costo:          Number(r[COL.costo]) || 0,
  })
}
// Asignar linea_factura correlativa por orden
const lineCount = new Map()
for (const r of mayo) {
  const c = (lineCount.get(r.orden) ?? 0) + 1
  r.linea = c
  lineCount.set(r.orden, c)
}

console.log(`\n📊 Filas mayo 2026 en archivo: ${mayo.length}`)
const totalCajas = mayo.reduce((s, r) => s + r.cajas, 0)
const totalUSD = mayo.reduce((s, r) => s + r.valor, 0)
const totalCosto = mayo.reduce((s, r) => s + r.costo, 0)
console.log(`   Cajas: ${totalCajas.toLocaleString()} · Valor: $${totalUSD.toLocaleString('en-US', {maximumFractionDigits:2})} · Costo: $${totalCosto.toLocaleString('en-US', {maximumFractionDigits:2})}`)

console.log('\n🗑️  Borrando fact_sales_sellin ano=2026 mes=5…')
const d1 = await pool.query(`DELETE FROM fact_sales_sellin WHERE ano = 2026 AND mes = 5`)
console.log(`   ${d1.rowCount} filas borradas`)

console.log(`\n📥 Insertando ${mayo.length} filas en fact_sales_sellin…`)
const BATCH = 100
for (let i = 0; i < mayo.length; i += BATCH) {
  const chunk = mayo.slice(i, i + BATCH)
  const vals = []
  const params = []
  let p = 1
  for (const r of chunk) {
    vals.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`)
    const fechaFactura = `${r.ano}-${String(r.mes).padStart(2,'0')}-01`
    params.push(
      r.orden,                  // numero_factura
      r.linea,                  // linea_factura
      fechaFactura,             // fecha_factura
      r.pais,                   // pais
      r.cliente,                // cliente_nombre
      r.sku,                    // sku
      r.cb,                     // codigo_barras
      r.descripcion,            // descripcion
      r.categoria,              // categoria
      r.subcategoria,           // subcategoria
      'BORDEN',                 // marca
      r.cajas,                  // cantidad_cajas
      r.libras,                 // cantidad_kg
      r.precio,                 // precio_unitario
      r.valor,                  // venta_neta
      r.valor,                  // venta_bruta
      r.costo,                  // costo_total
      'USD',                    // moneda
      'ventas_sellin_2025_2026.xlsx'  // archivo_origen
    )
  }
  await pool.query(`
    INSERT INTO fact_sales_sellin (
      numero_factura, linea_factura, fecha_factura, pais, cliente_nombre, sku, codigo_barras, descripcion,
      categoria, subcategoria, marca,
      cantidad_cajas, cantidad_kg, precio_unitario,
      venta_neta, venta_bruta, costo_total,
      moneda, archivo_origen
    ) VALUES ${vals.join(',')}
  `, params)
}
console.log(`   ✅ insertado`)

// Verificación
console.log('\n🔎 Verificación fact_sales_sellin mayo 2026:')
const v = await pool.query(`
  SELECT pais, cliente_nombre, COUNT(*) AS n,
         ROUND(SUM(cantidad_cajas)::numeric, 0) AS cajas,
         ROUND(SUM(venta_neta)::numeric, 0) AS usd
  FROM fact_sales_sellin
  WHERE ano = 2026 AND mes = 5
  GROUP BY pais, cliente_nombre
  ORDER BY pais, cliente_nombre
`)
let totN = 0, totC = 0, totU = 0
for (const x of v.rows) {
  console.log(`   ${x.pais} ${String(x.cliente_nombre).padEnd(25)} ${Number(x.n).toLocaleString().padStart(5)} filas · ${Number(x.cajas).toLocaleString().padStart(8)} cajas · $${Number(x.usd).toLocaleString()}`)
  totN += Number(x.n); totC += Number(x.cajas); totU += Number(x.usd)
}
console.log(`   TOTAL: ${totN} filas · ${totC.toLocaleString()} cajas · $${totU.toLocaleString()}`)

await pool.end()
console.log('\n🎉 Carga mayo 2026 sell-in completa')
