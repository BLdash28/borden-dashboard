import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'
import { CADENA_NORM_SQL, cadenaWhereSQL } from '@/lib/db/walmart-cadena'

export const dynamic   = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest) {
  try {
    const sp        = req.nextUrl.searchParams
    const pais      = sp.get('pais')      ?? 'CR'
    const categoria = sp.get('categoria') ?? ''
    // Compat: acepta `cadena` (singular, legacy) o `cadenas` (plural, CSV, multi-select).
    // Ídem para `salud` / `saludes`.
    const cadenasArr = (sp.get('cadenas') ?? sp.get('cadena') ?? '')
      .split(',').map(s => s.trim()).filter(Boolean)
    const saludArr   = (sp.get('saludes') ?? sp.get('salud') ?? '')
      .split(',').map(s => s.trim()).filter(Boolean)
    const prod      = sp.get('prod')      ?? ''

    // Filtro cadena: expande alias (WALMART matchea HM y WALMART, PALI matchea PI y PALI, etc.)
    // Con múltiples cadenas seleccionadas hacemos OR de todos los alias.
    const cadFilter = cadenasArr.length
      ? 'AND (' + cadenasArr
          .map(c => cadenaWhereSQL(c).replace(/^AND\s*/, '').replace(/\bcadena\b/g, 't.cadena'))
          .join(' OR ') + ')'
      : ''
    const catFilter  = categoria ? `AND COALESCE(dp.categoria, '') = '${categoria.replace(/'/g, "''")}'` : ''
    const prodFilter = prod
      ? `AND (LOWER(COALESCE(dp.descripcion, t.descripcion, '')) LIKE LOWER('%${prod.replace(/'/g, "''").replace(/%/g, '\\%').replace(/_/g, '\\_')}%') OR COALESCE(dp.sku, t.codigo_barras, '') ILIKE '%${prod.replace(/'/g, "''")}%')`
      : ''

    const paisSafe = pais.replace(/'/g, "''")

    const { rows } = await pool.query(`
      WITH ultima AS (
        SELECT MAX(fecha) AS f FROM fact_inventario_walmart_pdv WHERE pais = '${paisSafe}'
      ),
      vel AS (
        SELECT COALESCE(NULLIF(codigo_barras,''), sku) AS codigo_barras,
          ROUND((SUM(ventas_unidades) / 90.0)::numeric, 4) AS venta_dia,
          CASE WHEN SUM(ventas_unidades) > 0
            THEN ROUND((SUM(ventas_valor) / SUM(ventas_unidades))::numeric, 4)
            ELSE 0 END AS precio_unitario
        FROM fact_ventas_walmart
        WHERE fecha >= CURRENT_DATE - INTERVAL '90 days'
          AND pais = '${paisSafe}'
        GROUP BY COALESCE(NULLIF(codigo_barras,''), sku)
      )
      SELECT
        COALESCE(dp.sku, t.sku, t.codigo_barras)                                   AS sku,
        t.codigo_barras,
        COALESCE(NULLIF(dp.descripcion,''), NULLIF(t.descripcion,''), t.codigo_barras) AS descripcion,
        COALESCE(dp.categoria,    '')  AS categoria,
        COALESCE(dp.subcategoria, '')  AS subcategoria,
        t.punto_venta,
        ${CADENA_NORM_SQL.replace(/\bcadena\b/g, 't.cadena')}  AS cadena,
        t.inv_mano,
        COALESCE(v.venta_dia,       0) AS venta_dia,
        COALESCE(v.precio_unitario, 0) AS precio_unitario,
        CASE WHEN COALESCE(v.venta_dia, 0) > 0
          THEN ROUND((t.inv_mano::numeric / v.venta_dia), 1)
          ELSE NULL END AS doh,
        CASE
          WHEN COALESCE(v.venta_dia, 0) = 0          THEN 'SIN VPD'
          WHEN t.inv_mano::float / v.venta_dia <= 7   THEN 'CRÍTICO'
          WHEN t.inv_mano::float / v.venta_dia <= 14  THEN 'ATENCIÓN'
          WHEN t.inv_mano::float / v.venta_dia <= 60  THEN 'SALUDABLE'
          WHEN t.inv_mano::float / v.venta_dia <= 120 THEN 'COBERTURA ALTA'
          ELSE 'SOBRESTOCK'
        END AS salud
      FROM fact_inventario_walmart_pdv t
      JOIN ultima ON t.fecha = ultima.f
      LEFT JOIN dim_producto dp ON t.codigo_barras = dp.codigo_barras
      LEFT JOIN vel v ON t.codigo_barras = v.codigo_barras
      WHERE t.pais = '${paisSafe}'
        ${catFilter} ${cadFilter} ${prodFilter}
      ORDER BY t.cadena, t.punto_venta, t.inv_mano DESC
      LIMIT 3000
    `)

    const saludFiltered = saludArr.length
      ? rows.filter((r: any) => saludArr.includes(r.salud))
      : rows

    return NextResponse.json({
      rows: saludFiltered.map((r: any) => ({
        sku:             r.sku            ?? r.codigo_barras ?? '',
        upc:             r.codigo_barras  ?? '',
        descripcion:     r.descripcion    ?? '',
        categoria:       r.categoria      ?? '',
        subcategoria:    r.subcategoria   ?? '',
        tienda_nbr:      r.punto_venta    ?? '',
        nombre_tienda:   r.punto_venta    ?? '',
        cadena:          r.cadena         ?? '',
        inv_mano:        parseFloat(r.inv_mano)        || 0,
        venta_dia:       parseFloat(r.venta_dia)       || 0,
        precio_unitario: parseFloat(r.precio_unitario) || 0,
        doh:    r.doh !== null ? parseFloat(r.doh) : null,
        salud:  r.salud ?? 'SIN VPD',
      })),
      total: saludFiltered.length,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
