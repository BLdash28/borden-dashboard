// Carga devoluciones_exito CO 2026 desde BASE_COLOMBIA_Sellout_2026CORREGIDO.xlsx
// Uso: node --env-file=.env.local scripts/cargar-devoluciones-co-2026.mjs

import XLSX from 'xlsx'
import pg from 'pg'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const XLSX_PATH = 'C:/Users/IAN/OneDrive - BL Foods Corporation SA/BASE_COLOMBIA_Sellout_2026CORREGIDO.xlsx'
const ANO = 2026

const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()

const wb = XLSX.readFile(XLSX_PATH)
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Devoluciones'], { defval: null })
console.log(`[Devoluciones] leídas ${rows.length} filas del Excel`)

// Purgar 2026 previo
const del = await c.query(`DELETE FROM devoluciones_exito WHERE pais='CO' AND cliente='GRUPO ÉXITO' AND ano=$1`, [ANO])
console.log(`[Devoluciones] purgadas ${del.rowCount} filas previas de ${ANO}`)

const BATCH = 300
let inserted = 0, skipped = 0
const archivo = XLSX_PATH.split(/[/\\]/).pop() ?? 'excel'

for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH)
  const values = []
  const params = []
  let p = 1
  for (const r of chunk) {
    const mes = parseInt(r['Mes'])
    const dia = parseInt(r['dia'])
    if (!mes || !dia) { skipped++; continue }
    values.push(
      `('CO','GRUPO ÉXITO',$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`
    )
    params.push(
      ANO, mes, dia,
      r['gln'] != null ? String(r['gln']).trim() : null,
      r['cadena']       || null,
      r['subcadena']    || null,
      r['departamento'] || null,
      r['ciudad']       || null,
      r['codigo de barras'] != null ? String(r['codigo de barras']).trim() : null,
      r['sku'] != null ? String(r['sku']).trim() : null,
      r['Descripcion']  || null,
      r['Categoría']    || null,
      r['subcategoria'] || null,
      Number(r['cantidad_UND']) || 0,
      (r['CAUSA DEVOLUCIÓN'] ?? '').toString().trim() || null,
      (r['DESTINACIÓN']      ?? '').toString().trim() || null,
      Number(r[' Valor_VentaCOP ']) || 0,
      Number(r[' Valor_VentaUSD ']) || 0,
      Number(r[' Precio_UND '])     || 0,
      Number(r['tasa_cambio'])      || 0,
      archivo,
    )
  }
  if (!values.length) continue
  // 25 columnas totales: pais, cliente, ano, mes, dia, gln, cadena, subcadena, departamento, ciudad,
  // codigo_barras, sku, descripcion, categoria, subcategoria, unidades, causa, destinacion,
  // valor_venta_cop, valor_venta_usd, precio_und, tasa_cambio, archivo_origen
  await c.query(`
    INSERT INTO devoluciones_exito (
      pais, cliente, ano, mes, dia, gln, cadena, subcadena, departamento, ciudad,
      codigo_barras, sku, descripcion, categoria, subcategoria,
      unidades, causa, destinacion, valor_venta_cop, valor_venta_usd,
      precio_und, tasa_cambio, archivo_origen
    ) VALUES ${values.join(',')}
  `, params)
  inserted += values.length
  process.stdout.write(`\r  → insertadas ${inserted}/${rows.length}`)
}
console.log(`\n[Devoluciones] ✅ insertadas ${inserted} filas (skipped ${skipped})`)

const t = await c.query(`
  SELECT COUNT(*)::int filas, SUM(unidades)::int uds,
    ROUND(SUM(valor_venta_cop)::numeric, 0) valor_cop,
    ROUND(SUM(valor_venta_usd)::numeric, 2) valor_usd
  FROM devoluciones_exito WHERE pais='CO' AND cliente='GRUPO ÉXITO' AND ano=$1
`, [ANO])
console.log('[Devoluciones TOTAL 2026]:', t.rows[0])

await c.end()
console.log('=== DONE ===')
