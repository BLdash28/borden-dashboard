// Recarga devoluciones_exito CO 2025 + 2026 desde BASE_COLOMBIA_Sellout_2026CORREGIDO.xlsx
// (pestañas "Devoluciones" 2026 y "Devoluciones 2025")
//
// Uso:
//   node --env-file=.env.local scripts/recargar-exito-devoluciones-completo.mjs

import XLSX from 'xlsx'
import pg from 'pg'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const XLSX_PATH = 'C:/Users/IAN/Downloads/BASE_COLOMBIA_Sellout_2026CORREGIDO.xlsx'

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

await client.query(`
  ALTER TABLE devoluciones_exito
  ADD COLUMN IF NOT EXISTS subcategoria    TEXT,
  ADD COLUMN IF NOT EXISTS valor_venta_cop NUMERIC,
  ADD COLUMN IF NOT EXISTS valor_venta_usd NUMERIC,
  ADD COLUMN IF NOT EXISTS precio_und      NUMERIC,
  ADD COLUMN IF NOT EXISTS tasa_cambio     NUMERIC
`)
console.log('[OK] columnas nuevas aseguradas')

const purge = await client.query(
  `DELETE FROM devoluciones_exito WHERE pais='CO' AND cliente='GRUPO ÉXITO' AND ano IN (2025, 2026)`,
)
console.log(`[OK] purgadas ${purge.rowCount} filas previas de 2025+2026`)

const wb = XLSX.readFile(XLSX_PATH)

async function loadSheet(sheetName, defaultYear) {
  console.log(`\n[${sheetName}] leyendo...`)
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null })
  console.log(`[${sheetName}] ${rows.length} filas leídas`)
  const BATCH = 100
  const archivo = XLSX_PATH.split(/[/\\]/).pop() + '#' + sheetName
  let inserted = 0, skipped = 0

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const values = []
    const params = []
    let p = 1

    for (const r of chunk) {
      const ano = parseInt(r['Año'] ?? defaultYear)
      const mes = parseInt(r['Mes'])
      const dia = parseInt(r['dia'])
      if (!ano || !mes || !dia) { skipped++; continue }

      const gln          = r['gln'] != null ? String(r['gln']).trim() : null
      const ean          = r['codigo de barras'] != null ? String(r['codigo de barras']).trim() : null
      const sku          = r['sku'] != null ? String(r['sku']).trim() : null
      const desc         = r['Descripcion'] || null
      const cat          = r['Categoría']   || null
      const subcat       = r['subcategoria'] || null
      const cadena       = r['cadena']       || null
      const subcadena    = r['subcadena']    || null
      const departamento = r['departamento'] || null
      const ciudad       = r['ciudad']       || null
      const uds          = parseFloat(r['cantidad_UND'] ?? '0')
      const causa        = (r['CAUSA DEVOLUCIÓN'] ?? '').toString().trim() || null
      const destinacion  = (r['DESTINACIÓN']      ?? '').toString().trim() || null
      const vCop         = parseFloat(r[' Valor_VentaCOP '] ?? '0') || 0
      const vUsd         = parseFloat(r[' Valor_VentaUSD '] ?? '0') || 0
      const precio       = parseFloat(r[' Precio_UND ']      ?? '0') || 0
      const tasa         = parseFloat(r['tasa_cambio']       ?? '0') || 0

      values.push(`(
        'CO','GRUPO ÉXITO',
        $${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},
        $${p++},$${p++},$${p++},$${p++},$${p++},$${p++},
        $${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`)
      params.push(
        ano, mes, dia,
        gln, null /*punto_venta*/, cadena, subcadena, departamento, ciudad,
        ean, sku, sku /*plu*/, desc, cat, subcat,
        uds, causa, destinacion, vCop, vUsd, precio, tasa,
      )
    }
    if (values.length === 0) continue
    console.log(`  batch ${i}: insertando ${values.length} filas (${params.length} params)`)

    await client.query(`
      INSERT INTO devoluciones_exito
        (pais, cliente,
         ano, mes, dia,
         gln, punto_venta, cadena, subcadena, departamento, ciudad,
         codigo_barras, sku, plu, descripcion, categoria, subcategoria,
         unidades, causa, destinacion, valor_venta_cop, valor_venta_usd, precio_und, tasa_cambio)
      VALUES ${values.join(',')}
    `, params)
    inserted += values.length
  }
  console.log(`[OK] insertadas ${inserted} filas de ${sheetName} (skipped ${skipped})`)
}

await loadSheet('Devoluciones',      2026)
await loadSheet('Devoluciones 2025', 2025)

const t = await client.query(`
  SELECT ano,
    COUNT(*)::int filas,
    SUM(unidades)::int uds,
    SUM(valor_venta_cop)::numeric(20,2) valor_cop,
    MIN(ano*10000+mes*100+dia) min_fecha,
    MAX(ano*10000+mes*100+dia) max_fecha
  FROM devoluciones_exito
  WHERE pais='CO' AND cliente='GRUPO ÉXITO' AND ano IN (2025, 2026)
  GROUP BY ano ORDER BY ano
`)
console.log('\n[TOTAL por año]')
console.table(t.rows)

await client.end()
