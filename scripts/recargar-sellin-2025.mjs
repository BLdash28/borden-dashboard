// Recarga limpia 2025 en fact_sales_sellin desde ventas_sellin_2025_2026.xlsx
// Purga todo 2025 y re-inserta desde el Excel actual del bot.
//
// Uso: node --env-file=.env.local scripts/recargar-sellin-2025.mjs

import XLSX from 'xlsx'
import pg from 'pg'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const XLSX_PATH = 'C:/Users/IAN/OneDrive - BL Foods Corporation SA/ventas_sellin_2025_2026.xlsx'
const ANO = 2025

const MES_ES = { 'Enero':1,'Febrero':2,'Marzo':3,'Abril':4,'Mayo':5,'Junio':6,'Julio':7,'Agosto':8,'Septiembre':9,'Octubre':10,'Noviembre':11,'Diciembre':12 }

const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()

// 1. Purgar 2025
const del = await c.query('DELETE FROM fact_sales_sellin WHERE ano = $1', [ANO])
console.log(`[purge] ${del.rowCount} filas 2025 borradas`)

// 2. Leer Excel — sheet 2025
const wb = XLSX.readFile(XLSX_PATH)
const rows = XLSX.utils.sheet_to_json(wb.Sheets['2025'], { defval: null })
console.log(`[Excel] ${rows.length} filas en sheet 2025`)

// 3. Preparar batch
const BATCH = 300
const lineaCounter = new Map()   // (numero_factura, pais) → counter
let inserted = 0, skipped = 0

function num(v) { const n = Number(v); return isFinite(n) ? n : 0 }
function toStr(v) { return v == null ? '' : String(v).trim() }
function parseMes(v) {
  if (typeof v === 'number') return v
  const s = String(v).trim()
  return MES_ES[s] ?? +s
}

// Colas de columnas del Excel — headers exactos con espacios/acentos
const COL = {
  pais: 'Pais', cliente: 'Cliente', orden: 'orden_Compra',
  sku: 'sku', ean: 'codigo de barras', desc: 'Descripcion',
  cat: 'Categoría', sub: 'subcategoria',
  ano: 'Año', mes: 'Mes',
  cajas: 'cantidad_cajas', valor: ' Valor ', precio: ' Precio caja ',
  costo: ' costo ',
}

for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH)
  const values = [], params = []
  let p = 1
  for (const r of chunk) {
    const pais = toStr(r[COL.pais]).toUpperCase()
    const cli  = toStr(r[COL.cliente])
    const mes  = parseMes(r[COL.mes])
    const cajas = num(r[COL.cajas])
    const valor = num(r[COL.valor])
    if (!pais || !cli || !mes || (cajas === 0 && valor === 0)) { skipped++; continue }

    const orden = toStr(r[COL.orden])
    const numero_factura = orden || `MEN-${cli.slice(0,20)}-${ANO}${String(mes).padStart(2,'0')}`
    const key = `${numero_factura}|${pais}`
    const linea = (lineaCounter.get(key) ?? 0) + 1
    lineaCounter.set(key, linea)

    const sku    = toStr(r[COL.sku]) || 'SIN-SKU'
    const ean    = toStr(r[COL.ean]) || null
    const desc   = toStr(r[COL.desc]) || null
    const cat    = toStr(r[COL.cat]) || null
    const sub    = toStr(r[COL.sub]) || null
    const precio = num(r[COL.precio])
    const costo  = num(r[COL.costo])
    const costoUnit = cajas > 0 ? costo / cajas : null
    const fecha  = `${ANO}-${String(mes).padStart(2,'0')}-01`

    values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`)
    params.push(
      numero_factura, linea, fecha,
      pais, cli,
      sku, ean, desc,
      cat, sub,
      cajas, precio,
      valor, valor,        // venta_neta = venta_bruta (no hay descuento en Excel)
      costoUnit, costo,
    )
  }
  if (!values.length) continue
  await c.query(`
    INSERT INTO fact_sales_sellin (
      numero_factura, linea_factura, fecha_factura,
      pais, cliente_nombre,
      sku, codigo_barras, descripcion,
      categoria, subcategoria,
      cantidad_cajas, precio_unitario,
      venta_neta, venta_bruta,
      costo_unitario, costo_total
    ) VALUES ${values.join(',')}
  `, params)
  inserted += values.length
  process.stdout.write(`\r  → ${inserted}/${rows.length}`)
}
console.log(`\n[insert] ✅ ${inserted} filas (skipped=${skipped})`)

// 4. Verificación
const t = await c.query(`
  SELECT
    COUNT(*)::int filas,
    ROUND(SUM(venta_neta)::numeric, 2) neta,
    ROUND(SUM(venta_bruta)::numeric, 2) bruta
  FROM fact_sales_sellin WHERE ano=$1
`, [ANO])
console.log('\n[total 2025]:', t.rows[0])

const abrQ = await c.query(`
  SELECT COUNT(*)::int filas, ROUND(SUM(venta_neta)::numeric,2) neta, SUM(cantidad_cajas)::int cajas
  FROM fact_sales_sellin WHERE ano=$1 AND mes=4 AND categoria='Quesos'
`, [ANO])
console.log('[Abril 2025 Quesos]:', abrQ.rows[0])

await c.end()
console.log('=== DONE ===')
