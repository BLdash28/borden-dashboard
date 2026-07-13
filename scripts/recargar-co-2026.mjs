// Recarga SellIn + Devoluciones + Inventario de Grupo Éxito CO 2026 desde
// BASE_COLOMBIA_Sellout_2026CORREGIDO.xlsx (versión OneDrive actualizada).
//
// Uso: node --env-file=.env.local scripts/recargar-co-2026.mjs

import XLSX from 'xlsx'
import pg from 'pg'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const XLSX_PATH = 'C:/Users/IAN/OneDrive - BL Foods Corporation SA/BASE_COLOMBIA_Sellout_2026CORREGIDO.xlsx'
const ANO       = 2026

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

const wb = XLSX.readFile(XLSX_PATH)
const archivo = XLSX_PATH.split(/[/\\]/).pop() ?? 'excel'

const SUBCAT_POR_EAN = {
  '7452105970154': 'Shred', '7452105970185': 'Snack', '7452105970192': 'Chunk',
  '7452105970208': 'Shred', '7452105970222': 'Shred', '7452105970239': 'IWS',
  '7452105970246': 'Natural Slices', '7452105970253': 'Natural Slices',
  '7452105970260': 'Natural Slices', '7452105970277': 'Natural Slices',
  '7452105970284': 'Natural Slices', '7452105970291': 'Imitation',
  '7452105970307': 'Imitation', '7452105970550': 'Shred', '7452105970567': 'Shred',
}

// ═════ 1. SELL-IN ═════════════════════════════════════════════════════════════
{
  await client.query(`ALTER TABLE sellin_exito ADD COLUMN IF NOT EXISTS utilidad_bruta_usd NUMERIC`)
  const del = await client.query(
    `DELETE FROM sellin_exito WHERE pais='CO' AND cliente='GRUPO ÉXITO' AND ano=$1`, [ANO],
  )
  console.log(`[SellIn] purgadas ${del.rowCount} filas previas`)

  const rows = XLSX.utils.sheet_to_json(wb.Sheets['SellIn'], { defval: null })
  const data = rows.filter(r => r['Mes'] !== null && r['Mes'] !== undefined && Number(r['Mes']) > 0)
  console.log(`[SellIn] leídas ${rows.length} filas del Excel, ${data.length} con Mes válido`)

  const BATCH = 300
  let inserted = 0
  for (let i = 0; i < data.length; i += BATCH) {
    const chunk = data.slice(i, i + BATCH)
    const values = [], params = []
    let p = 1
    for (const r of chunk) {
      const ean     = r['codigo de barras'] != null ? String(r['codigo de barras']).trim() : null
      const subcat  = (ean && SUBCAT_POR_EAN[ean]) || r['subcategoria'] || null
      const cliente = 'GRUPO ÉXITO'
      values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`)
      params.push(
        'CO', cliente,
        r['orden_Compra'] != null ? String(r['orden_Compra']).trim() : null,
        r['sku']    != null ? String(r['sku']).trim() : null,
        ean,
        r['Descripcion'] || null,
        r['Categoría']   || null,
        subcat,
        ANO,
        Number(r['Mes']) || null,
        Number(r['cantidad_UND']) || 0,
        Number(r[' Valor_VentaCOP ']) || 0,
        Number(r[' Valor_VentaUSD ']) || 0,
        Number(r[' Precio_UND ']) || 0,
        Number(r[' Costo_venta ']) || 0,
        Number(r[' costo_und ']) || 0,
        Number(r['utilidad_brutaCOP']) || 0,
        Number(r[' utilidad_brutaUSD ']) || 0,
        Number(r['margenes_brutoUND']) || 0,
        Number(r['tasa_cambio']) || 0,
        archivo,
      )
    }
    await client.query(`
      INSERT INTO sellin_exito (pais, cliente, orden_compra, sku, codigo_barras, descripcion,
        categoria, subcategoria, ano, mes, cantidad_und, valor_venta_cop, valor_venta_usd,
        precio_und_cop, costo_venta_cop, costo_und_cop, utilidad_bruta_cop, utilidad_bruta_usd,
        margen_bruto_und_cop, tasa_cambio, archivo_origen)
      VALUES ${values.join(',')}
    `, params)
    inserted += chunk.length
  }
  console.log(`[SellIn] ✅ insertadas ${inserted} filas`)

  const t = await client.query(`
    SELECT COUNT(*)::int filas, SUM(cantidad_und)::int uds,
      SUM(valor_venta_cop)::numeric(20,2) venta_cop,
      SUM(utilidad_bruta_cop)::numeric(20,2) util_cop,
      ROUND((SUM(utilidad_bruta_cop)/NULLIF(SUM(valor_venta_cop),0)*100)::numeric,2) margen
    FROM sellin_exito WHERE pais='CO' AND cliente='GRUPO ÉXITO' AND ano=$1
  `, [ANO])
  console.log('[SellIn TOTAL]:', t.rows[0])
}

// ═════ 2. DEVOLUCIONES ═══════════════════════════════════════════════════════
{
  await client.query(`
    ALTER TABLE devoluciones_exito
    ADD COLUMN IF NOT EXISTS subcategoria    TEXT,
    ADD COLUMN IF NOT EXISTS valor_venta_cop NUMERIC,
    ADD COLUMN IF NOT EXISTS valor_venta_usd NUMERIC,
    ADD COLUMN IF NOT EXISTS precio_und      NUMERIC,
    ADD COLUMN IF NOT EXISTS tasa_cambio     NUMERIC
  `)
  const del = await client.query(
    `DELETE FROM devoluciones_exito WHERE pais='CO' AND cliente='GRUPO ÉXITO' AND ano=$1`, [ANO],
  )
  console.log(`\n[Devoluciones] purgadas ${del.rowCount} filas previas`)

  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Devoluciones'], { defval: null })
  console.log(`[Devoluciones] leídas ${rows.length} filas`)

  const BATCH = 300
  let inserted = 0, skipped = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const values = [], params = []
    let p = 1
    for (const r of chunk) {
      const mes = parseInt(r['Mes'])
      const dia = parseInt(r['dia'])
      if (!mes || !dia) { skipped++; continue }
      values.push(`('CO','GRUPO ÉXITO',$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`)
      params.push(
        ANO, mes, dia,
        r['gln'] != null ? String(r['gln']).trim() : null,
        null,
        r['cadena']       || null,
        r['subcadena']    || null,
        r['departamento'] || null,
        r['ciudad']       || null,
        r['codigo de barras'] != null ? String(r['codigo de barras']).trim() : null,
        r['sku'] != null ? String(r['sku']).trim() : null,
        r['sku'] != null ? String(r['sku']).trim() : null,
        r['Descripcion'] || null,
        r['Categoría']   || null,
        r['subcategoria']|| null,
        Number(r['cantidad_UND']) || 0,
        (r['CAUSA DEVOLUCIÓN'] ?? '').toString().trim() || null,
        (r['DESTINACIÓN']      ?? '').toString().trim() || null,
        Number(r[' Valor_VentaCOP ']) || 0,
        Number(r[' Valor_VentaUSD ']) || 0,
        Number(r[' Precio_UND '])     || 0,
        Number(r['tasa_cambio'])      || 0,
      )
    }
    if (!values.length) continue
    await client.query(`
      INSERT INTO devoluciones_exito (pais, cliente, ano, mes, dia, gln, punto_venta, cadena, subcadena,
        departamento, ciudad, codigo_barras, sku, plu, descripcion, categoria, subcategoria,
        unidades, causa, destinacion, valor_venta_cop, valor_venta_usd, precio_und, tasa_cambio)
      VALUES ${values.join(',')}
    `, params)
    inserted += values.length
  }
  console.log(`[Devoluciones] ✅ insertadas ${inserted} filas (skipped ${skipped})`)

  const t = await client.query(`
    SELECT COUNT(*)::int filas, SUM(unidades)::int uds,
      SUM(valor_venta_cop)::numeric(20,2) valor_cop
    FROM devoluciones_exito WHERE pais='CO' AND cliente='GRUPO ÉXITO' AND ano=$1
  `, [ANO])
  console.log('[Devoluciones TOTAL]:', t.rows[0])
}

// ═════ 3. INVENTARIO ═════════════════════════════════════════════════════════
{
  const del = await client.query(
    `DELETE FROM inventario_exito WHERE pais='CO' AND cliente='GRUPO ÉXITO' AND EXTRACT(YEAR FROM fecha_snapshot)=$1`,
    [ANO],
  )
  console.log(`\n[Inventario] purgadas ${del.rowCount} filas previas`)

  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Inventario'], { defval: null })
  console.log(`[Inventario] leídas ${rows.length} filas`)

  const BATCH = 300
  let inserted = 0, skipped = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const values = [], params = []
    let p = 1
    for (const r of chunk) {
      const ano = parseInt(r['Año'])
      const mes = parseInt(r['Mes'])
      const dia = parseInt(r['Dia'])
      if (!ano || !mes || !dia) { skipped++; continue }
      const fecha = `${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`
      const gln  = r['Gln'] != null ? String(r['Gln']).trim() : null
      const pv   = r['Punto de Venta'] || null
      const ean  = r['Ean Producto']   != null ? String(r['Ean Producto']).trim() : null
      const plu  = r['Código Interno (PLU)'] != null ? String(r['Código Interno (PLU)']).trim() : null
      const prod = r['Producto'] || null
      const marca = r['Marca'] || null
      const inv  = Number(r['Inventario (Q)']) || 0
      const val  = Number(r[' precioInv_COP ']) || 0
      const prc  = Number(r['precio_und']) || 0
      values.push(`('CO','GRUPO ÉXITO',$${p++}::date,$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`)
      params.push(fecha, gln, pv, ean, plu, prod, marca, inv, val, archivo)
    }
    if (!values.length) continue
    await client.query(`
      INSERT INTO inventario_exito (pais, cliente, fecha_snapshot, gln, punto_venta, ean13, plu,
        descripcion, marca, inv_unidades, inv_valor_cop, archivo_origen)
      VALUES ${values.join(',')}
    `, params)
    inserted += values.length
  }
  console.log(`[Inventario] ✅ insertadas ${inserted} filas (skipped ${skipped})`)

  const t = await client.query(`
    SELECT COUNT(*)::int filas, MIN(fecha_snapshot) min_fecha, MAX(fecha_snapshot) max_fecha,
      SUM(inv_unidades)::int uds
    FROM inventario_exito WHERE pais='CO' AND cliente='GRUPO ÉXITO' AND EXTRACT(YEAR FROM fecha_snapshot)=$1
  `, [ANO])
  console.log('[Inventario TOTAL]:', t.rows[0])
}

await client.end()
console.log('\n=== DONE ===')
