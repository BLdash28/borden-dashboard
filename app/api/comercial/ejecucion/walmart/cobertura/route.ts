import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'
import { CADENA_NORM_SQL } from '@/lib/db/walmart-cadena'
import { parseWalmartFilters, buildWalmartWhere } from '@/lib/api/walmart-filtros'

export const revalidate = 300

export async function GET(req: NextRequest) {
  try {
    const sp   = req.nextUrl.searchParams
    const pais = sp.get('pais') ?? 'CR'
    const ano  = parseInt(sp.get('ano') ?? '2026')
    const f    = parseWalmartFilters(req)
    const w    = buildWalmartWhere(f, { startAt: 2 })
    // Para vista por cadena, no filtrar por cadena así vemos todas las cadenas
    const wSinCad = buildWalmartWhere({ ...f, cadenas: [] }, { startAt: 2 })

    const [skuR, totalR, histR, wgtR, cadenaR] = await Promise.all([

      // Per-SKU: active stores + value (current year)
      pool.query(`
        SELECT sku, MAX(descripcion) AS descripcion, MAX(categoria) AS categoria,
          COUNT(DISTINCT punto_venta) AS pdvs_activos,
          ROUND(SUM(ventas_valor)::numeric, 2) AS valor
        FROM fact_ventas_walmart
        WHERE pais = $1 AND EXTRACT(YEAR FROM fecha) = ${ano}
          AND sku IS NOT NULL AND sku != '' AND ${w.where}
        GROUP BY sku
        ORDER BY pdvs_activos DESC, valor DESC
        LIMIT 200
      `, [pais, ...w.params]),

      // Total distinct stores (current year)
      pool.query(`
        SELECT COUNT(DISTINCT punto_venta) AS n
        FROM fact_ventas_walmart
        WHERE pais = $1 AND EXTRACT(YEAR FROM fecha) = ${ano} AND ${w.where}
      `, [pais, ...w.params]),

      // Historical max stores per SKU (best month across all years)
      pool.query(`
        WITH monthly AS (
          SELECT sku, DATE_TRUNC('month', fecha) AS mes,
            COUNT(DISTINCT punto_venta) AS n
          FROM fact_ventas_walmart
          WHERE pais = $1 AND sku IS NOT NULL AND sku != '' AND ${w.where}
          GROUP BY sku, DATE_TRUNC('month', fecha)
        )
        SELECT sku, MAX(n) AS pdvs_max FROM monthly GROUP BY sku
      `, [pais, ...w.params]),

      // Weighted coverage: stores weighted by their share of total year sales
      pool.query(`
        WITH store_val AS (
          SELECT punto_venta, SUM(ventas_valor) AS venta
          FROM fact_ventas_walmart
          WHERE pais = $1 AND EXTRACT(YEAR FROM fecha) = ${ano} AND ${w.where}
          GROUP BY punto_venta
        ),
        total_val AS (SELECT NULLIF(SUM(venta), 0) AS t FROM store_val),
        sku_stores AS (
          SELECT DISTINCT sku, punto_venta
          FROM fact_ventas_walmart
          WHERE pais = $1 AND EXTRACT(YEAR FROM fecha) = ${ano}
            AND sku IS NOT NULL AND sku != '' AND ${w.where}
        )
        SELECT s.sku,
          ROUND((SUM(sv.venta / tv.t) * 100)::numeric, 1) AS cob_ponderada
        FROM sku_stores s
        JOIN store_val sv ON sv.punto_venta = s.punto_venta
        CROSS JOIN total_val tv
        GROUP BY s.sku
      `, [pais, ...w.params]),

      // Per-cadena summary: stores + avg SKU coverage + historical max
      pool.query(`
        WITH raw AS (
          SELECT ${CADENA_NORM_SQL} AS cadena, fecha, sku, punto_venta
          FROM fact_ventas_walmart
          WHERE pais = $1 AND ${wSinCad.where}
        ),
        cadena_cur AS (
          SELECT cadena, COUNT(DISTINCT punto_venta) AS n_tiendas
          FROM raw
          WHERE EXTRACT(YEAR FROM fecha) = ${ano}
          GROUP BY cadena
        ),
        sku_cadena_cur AS (
          SELECT sku, cadena, COUNT(DISTINCT punto_venta) AS pdvs
          FROM raw
          WHERE EXTRACT(YEAR FROM fecha) = ${ano}
            AND sku IS NOT NULL AND sku != ''
          GROUP BY sku, cadena
        ),
        monthly_avg AS (
          SELECT sc.cadena, sc.mes,
            AVG(sc.n::float / ct.n * 100) AS avg_cob
          FROM (
            SELECT sku, cadena, DATE_TRUNC('month', fecha) AS mes,
              COUNT(DISTINCT punto_venta) AS n
            FROM raw
            WHERE sku IS NOT NULL AND sku != ''
            GROUP BY sku, cadena, DATE_TRUNC('month', fecha)
          ) sc
          JOIN (
            SELECT cadena, DATE_TRUNC('month', fecha) AS mes,
              COUNT(DISTINCT punto_venta) AS n
            FROM raw
            GROUP BY cadena, DATE_TRUNC('month', fecha)
          ) ct ON ct.cadena = sc.cadena AND ct.mes = sc.mes
          GROUP BY sc.cadena, sc.mes
        ),
        hist_max AS (
          SELECT cadena, MAX(avg_cob) AS cob_max_avg
          FROM monthly_avg GROUP BY cadena
        )
        SELECT
          cc.cadena,
          cc.n_tiendas,
          ROUND(
            AVG(sc.pdvs::float / cc.n_tiendas * 100)::numeric, 1
          ) AS cob_actual_avg,
          ROUND(COALESCE(hm.cob_max_avg, 0)::numeric, 1) AS cob_max_avg
        FROM cadena_cur cc
        LEFT JOIN sku_cadena_cur sc ON sc.cadena = cc.cadena
        LEFT JOIN hist_max hm ON hm.cadena = cc.cadena
        GROUP BY cc.cadena, cc.n_tiendas, hm.cob_max_avg
        ORDER BY cc.n_tiendas DESC
      `, [pais, ...wSinCad.params]),
    ])

    const total_pdvs = parseInt(totalR.rows[0]?.n ?? '0')

    const maxMap: Record<string, number> = {}
    for (const r of histR.rows) maxMap[r.sku] = parseInt(r.pdvs_max)

    const wgtMap: Record<string, number> = {}
    for (const r of wgtR.rows) wgtMap[r.sku] = parseFloat(r.cob_ponderada)

    const rows = (skuR.rows as any[]).map(row => {
      const pdvs      = parseInt(row.pdvs_activos)
      const pdvs_max  = maxMap[row.sku] ?? pdvs
      const cob       = total_pdvs > 0 ? parseFloat((pdvs / total_pdvs * 100).toFixed(1)) : 0
      const cob_max   = total_pdvs > 0 ? parseFloat((pdvs_max / total_pdvs * 100).toFixed(1)) : 0
      const cob_pond  = wgtMap[row.sku] ?? cob
      return {
        sku:                 row.sku,
        descripcion:         row.descripcion ?? '',
        categoria:           row.categoria   ?? '',
        pdvs_activos:        pdvs,
        pdvs_max,
        valor:               parseFloat(row.valor ?? '0'),
        cobertura_pct:       cob,
        cobertura_maxima:    cob_max,
        cobertura_ponderada: cob_pond,
        gap_pp:              parseFloat((cob_max - cob).toFixed(1)),
      }
    })

    const n             = rows.length || 1
    const avg_cob       = parseFloat((rows.reduce((s, r) => s + r.cobertura_pct,       0) / n).toFixed(1))
    const avg_ponderada = parseFloat((rows.reduce((s, r) => s + r.cobertura_ponderada, 0) / n).toFixed(1))
    const max_historica = parseFloat((rows.reduce((s, r) => s + r.cobertura_maxima,    0) / n).toFixed(1))
    const gap_global    = parseFloat((max_historica - avg_cob).toFixed(1))

    return NextResponse.json({
      rows,
      total_pdvs,
      avg_cob,
      avg_ponderada,
      max_historica,
      gap_global,
      por_cadena: (cadenaR.rows as any[]).map(r => ({
        cadena:         r.cadena         ?? '',
        n_tiendas:      parseInt(r.n_tiendas      ?? '0'),
        cob_actual_avg: parseFloat(r.cob_actual_avg ?? '0'),
        cob_max_avg:    parseFloat(r.cob_max_avg    ?? '0'),
      })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
