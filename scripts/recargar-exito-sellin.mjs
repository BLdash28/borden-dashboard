// Recarga sellin_exito CO 2026 desde BASE_COLOMBIA_Sellout_2026CORREGIDO.xlsx
// Reemplaza completamente todo lo que hay para pais='CO', cliente='GRUPO ÉXITO', ano=2026.
//
// Uso:
//   node --env-file=.env.local scripts/recargar-exito-sellin.mjs [ruta.xlsx]

import XLSX from 'xlsx'
import pg from 'pg'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const XLSX_PATH = process.argv[2] ?? 'C:/Users/IAN/Downloads/BASE_COLOMBIA_Sellout_2026CORREGIDO.xlsx'

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

// 0. Asegurar columna utilidad_bruta_usd (nueva en esta versión)
await client.query(`
  ALTER TABLE sellin_exito
  ADD COLUMN IF NOT EXISTS utilidad_bruta_usd NUMERIC
`)
console.log('[OK] columna utilidad_bruta_usd asegurada')

// 1. Mapping EAN → subcategoría (aplicado antes por corrección del usuario)
const SUBCAT_POR_EAN = {
  '7452105970154': 'Shred',
  '7452105970185': 'Snack',
  '7452105970192': 'Chunk',
  '7452105970208': 'Shred',
  '7452105970222': 'Shred',
  '7452105970239': 'IWS',
  '7452105970246': 'Natural Slices',
  '7452105970253': 'Natural Slices',
  '7452105970260': 'Natural Slices',
  '7452105970277': 'Natural Slices',
  '7452105970284': 'Natural Slices',
  '7452105970291': 'Imitation',
  '7452105970307': 'Imitation',
  '7452105970550': 'Shred',
  '7452105970567': 'Shred',
}

// 2. Purga
const del = await client.query(
  `DELETE FROM sellin_exito WHERE pais='CO' AND cliente='GRUPO ÉXITO' AND ano=2026`,
)
console.log(`[OK] purgadas ${del.rowCount} filas previas de CO/GRUPO ÉXITO/2026`)

// 3. Leer Excel
const wb = XLSX.readFile(XLSX_PATH)
const rows = XLSX.utils.sheet_to_json(wb.Sheets['SellIn'], { defval: null })
console.log(`[OK] leídas ${rows.length} filas del Excel`)

// Excluir la fila TOTAL (Mes=null)
const data = rows.filter(r => r['Mes'] !== null && r['Mes'] !== undefined && Number(r['Mes']) > 0)
console.log(`[OK] ${data.length} filas de detalle (excluida fila TOTAL)`)

// 4. Insertar en batches
const BATCH   = 300
const archivo = XLSX_PATH.split(/[/\\]/).pop() ?? 'excel'
let inserted  = 0

for (let i = 0; i < data.length; i += BATCH) {
  const chunk = data.slice(i, i + BATCH)
  const values = []
  const params = []
  let p = 1

  for (const r of chunk) {
    const pais    = String(r['Pais'] ?? 'CO').trim()
    const cliente = String(r['Cliente'] ?? 'GRUPO ÉXITO').trim()
    const orden   = r['orden_Compra'] != null ? String(r['orden_Compra']).trim() : null
    const sku     = r['sku']              != null ? String(r['sku']).trim()              : null
    const ean     = r['codigo de barras'] != null ? String(r['codigo de barras']).trim() : null
    const desc    = r['Descripcion'] || null
    const cat     = r['Categoría']   || null
    // Subcategoría: si el EAN está en el mapping, usar el corregido; sino el del Excel
    const subcat  = (ean && SUBCAT_POR_EAN[ean]) || r['subcategoria'] || null

    const ano     = Number(r['Año'])           || 2026
    const mes     = Number(r['Mes'])           || null
    const cant    = Number(r['cantidad_UND'])  || 0
    const vCop    = Number(r[' Valor_VentaCOP '])   || 0
    const vUsd    = Number(r[' Valor_VentaUSD '])   || 0
    const precio  = Number(r[' Precio_UND '])       || 0
    const costTot = Number(r[' Costo_venta '])      || 0
    const costUnd = Number(r[' costo_und '])        || 0
    const uCop    = Number(r['utilidad_brutaCOP'])  || 0
    const uUsd    = Number(r[' utilidad_brutaUSD ']) || 0
    const margen  = Number(r['margenes_brutoUND']) || 0
    const tasa    = Number(r['tasa_cambio'])       || 0

    values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`)
    params.push(
      pais, cliente, orden, sku, ean, desc, cat, subcat,
      ano, mes, cant,
      vCop, vUsd, precio, costTot, costUnd,
      uCop, uUsd, margen, tasa,
      archivo,
    )
  }

  await client.query(`
    INSERT INTO sellin_exito
      (pais, cliente, orden_compra, sku, codigo_barras, descripcion, categoria, subcategoria,
       ano, mes, cantidad_und,
       valor_venta_cop, valor_venta_usd, precio_und_cop, costo_venta_cop, costo_und_cop,
       utilidad_bruta_cop, utilidad_bruta_usd, margen_bruto_und_cop, tasa_cambio,
       archivo_origen)
    VALUES ${values.join(',')}
  `, params)
  inserted += chunk.length
}
console.log(`[OK] insertadas ${inserted} filas`)

// 5. Verificación totales
const t = await client.query(`
  SELECT
    COUNT(*)::int                        AS filas,
    SUM(cantidad_und)::numeric(20,0)     AS uds,
    SUM(valor_venta_cop)::numeric(20,2)  AS venta_cop,
    SUM(valor_venta_usd)::numeric(20,2)  AS venta_usd,
    SUM(costo_venta_cop)::numeric(20,2)  AS costo_cop,
    SUM(utilidad_bruta_cop)::numeric(20,2) AS util_cop,
    SUM(utilidad_bruta_usd)::numeric(20,2) AS util_usd,
    ROUND((SUM(utilidad_bruta_cop)/NULLIF(SUM(valor_venta_cop),0)*100)::numeric,2) AS margen
  FROM sellin_exito
  WHERE pais='CO' AND cliente='GRUPO ÉXITO' AND ano=2026
`)
console.log('\n[TOTAL CO 2026 recargado]')
console.log(t.rows[0])

const m = await client.query(`
  SELECT mes,
    COUNT(*)::int filas,
    SUM(cantidad_und)::int uds,
    SUM(valor_venta_cop)::numeric(20,2) venta_cop,
    SUM(utilidad_bruta_cop)::numeric(20,2) util_cop,
    ROUND((SUM(utilidad_bruta_cop)/NULLIF(SUM(valor_venta_cop),0)*100)::numeric,2) margen
  FROM sellin_exito WHERE pais='CO' AND cliente='GRUPO ÉXITO' AND ano=2026
  GROUP BY mes ORDER BY mes
`)
console.log('\n[Por mes]')
console.table(m.rows)

await client.end()
