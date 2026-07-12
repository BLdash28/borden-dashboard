import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'
import { parseWalmartFilters, buildWalmartWhere } from '@/lib/api/walmart-filtros'

export const revalidate = 300

export async function GET(req: NextRequest) {
  try {
    const pais = req.nextUrl.searchParams.get('pais') ?? 'CR'
    const f    = parseWalmartFilters(req)
    // Aplica el filtro sobre fact_ventas_walmart (alias f en la query).
    const wF   = buildWalmartWhere(f, { alias: 'f', startAt: 2 })

    const { rows } = await pool.query(`
      WITH sku_nuevo AS (
        -- Barcodes cuya primera venta real fue hace menos de 3 meses
        -- Usa dim_producto.primera_venta si existe, sino MIN(fact_ventas_walmart.fecha)
        SELECT COALESCE(NULLIF(f.codigo_barras,''), f.sku) AS codigo_barras
        FROM fact_ventas_walmart f
        LEFT JOIN dim_producto dp
          ON dp.codigo_barras = COALESCE(NULLIF(f.codigo_barras,''), f.sku)
        WHERE f.pais = $1 AND f.sku IS NOT NULL AND f.sku != ''
        GROUP BY COALESCE(NULLIF(f.codigo_barras,''), f.sku), dp.primera_venta
        HAVING COALESCE(dp.primera_venta, MIN(f.fecha)) >= CURRENT_DATE - INTERVAL '3 months'
      ),
      sku_base AS (
        SELECT
          f.sku,
          COALESCE(NULLIF(f.codigo_barras,''), f.sku) AS codigo_barras,
          MAX(f.descripcion)                                 AS descripcion,
          MAX(f.categoria)                                   AS categoria,
          MAX(f.subcategoria)                                AS subcategoria,
          MIN(f.fecha)                                       AS primera_venta,
          COUNT(DISTINCT DATE_TRUNC('month', f.fecha))       AS meses_activo,
          COUNT(DISTINCT f.cadena)                           AS cadenas,
          COUNT(DISTINCT f.punto_venta)                      AS puntos_venta,
          ROUND(SUM(f.ventas_valor)::numeric,    2)          AS total_valor,
          ROUND(SUM(f.ventas_unidades)::numeric, 0)          AS total_unidades
        FROM fact_ventas_walmart f
        JOIN sku_nuevo sn ON sn.codigo_barras = COALESCE(NULLIF(f.codigo_barras,''), f.sku)
        WHERE f.pais = $1
          AND f.sku IS NOT NULL AND f.sku != ''
          AND ${wF.where}
        GROUP BY f.sku, COALESCE(NULLIF(f.codigo_barras,''), f.sku)
      ),
      mensual AS (
        SELECT
          f.sku,
          COALESCE(NULLIF(f.codigo_barras,''), f.sku) AS codigo_barras,
          DATE_TRUNC('month', f.fecha)                       AS mes_dt,
          TO_CHAR(DATE_TRUNC('month', f.fecha), 'Mon YYYY')  AS mes_label,
          ROUND(SUM(f.ventas_valor)::numeric,    2)          AS valor,
          ROUND(SUM(f.ventas_unidades)::numeric, 0)          AS unidades
        FROM fact_ventas_walmart f
        JOIN sku_base b ON f.sku = b.sku
          AND COALESCE(NULLIF(f.codigo_barras,''), f.sku) = b.codigo_barras
        WHERE f.pais = $1
        GROUP BY f.sku, COALESCE(NULLIF(f.codigo_barras,''), f.sku), DATE_TRUNC('month', f.fecha)
      )
      SELECT
        b.sku,
        b.codigo_barras,
        b.descripcion,
        b.categoria,
        b.subcategoria,
        TO_CHAR(b.primera_venta, 'YYYY-MM-DD') AS primera_venta,
        b.meses_activo::int                    AS meses_activo,
        b.cadenas::int                         AS cadenas,
        b.puntos_venta::int                    AS puntos_venta,
        b.total_valor,
        b.total_unidades,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'mes',      m.mes_label,
            'valor',    m.valor,
            'unidades', m.unidades
          ) ORDER BY m.mes_dt
        ) AS mensual
      FROM sku_base b
      LEFT JOIN mensual m ON m.sku = b.sku AND m.codigo_barras = b.codigo_barras
      GROUP BY b.sku, b.codigo_barras, b.descripcion, b.categoria, b.subcategoria,
               b.primera_venta, b.meses_activo, b.cadenas, b.puntos_venta,
               b.total_valor, b.total_unidades
      ORDER BY b.primera_venta DESC, b.total_valor DESC
      LIMIT 100
    `, [pais, ...wF.params])

    const result = rows.map((r: any) => ({
      sku:           r.codigo_barras  ?? r.sku ?? '',
      descripcion:   r.descripcion    ?? '',
      categoria:     r.categoria      ?? '',
      subcategoria:  r.subcategoria   ?? '',
      primera_venta: r.primera_venta  ?? '',
      meses_activo:  r.meses_activo   ?? 0,
      cadenas:       r.cadenas        ?? 0,
      puntos_venta:  r.puntos_venta   ?? 0,
      total_valor:   parseFloat(r.total_valor    ?? '0'),
      total_unidades:parseInt(r.total_unidades   ?? '0'),
      mensual:       (r.mensual ?? []).filter((m: any) => m.mes !== null),
    }))

    // KPIs
    const porCategoria: Record<string, number> = {}
    for (const r of result) {
      const cat = r.categoria || 'Sin categoría'
      porCategoria[cat] = (porCategoria[cat] ?? 0) + 1
    }

    return NextResponse.json({
      rows:          result,
      total:         result.length,
      por_categoria: porCategoria,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
