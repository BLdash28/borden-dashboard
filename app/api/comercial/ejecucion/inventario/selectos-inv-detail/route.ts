import { NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 0

const IS_PDV  = `NOT (fsi.tienda ILIKE '1001%' OR fsi.tienda ILIKE '1017%')`
const IS_CEDI = `(fsi.tienda ILIKE '1001%' OR fsi.tienda ILIKE '1017%')`

const VPD_DAYS = `
  GREATEST(EXTRACT(DAY FROM (
    DATE_TRUNC('month', (SELECT fecha FROM ultima))
    + INTERVAL '1 month' - INTERVAL '1 day'
  ))::float, 1)`

export async function GET() {
  try {
    const [faltantesR, healthR] = await Promise.all([

      pool.query(`
        WITH
        ultima     AS (SELECT MAX(fecha) AS fecha FROM fact_selectos_inventario),
        pdv_skus   AS (
          SELECT fsi.codigo_barra,
            SUM(fsi.inventario_unidades) AS pdv_uni,
            SUM(fsi.inventario_valor)    AS pdv_valor
          FROM fact_selectos_inventario fsi
          JOIN ultima u ON fsi.fecha = u.fecha
          WHERE ${IS_PDV} AND fsi.inventario_unidades > 0
          GROUP BY fsi.codigo_barra
        ),
        cedi_stock AS (
          SELECT DISTINCT fsi.codigo_barra
          FROM fact_selectos_inventario fsi
          JOIN ultima u ON fsi.fecha = u.fecha
          WHERE ${IS_CEDI} AND fsi.inventario_unidades > 0
        ),
        vpd        AS (
          SELECT fsi.codigo_barra,
            SUM(fsi.ventas_unidades)::float / ${VPD_DAYS} AS vpd_dia
          FROM fact_selectos_inventario fsi
          WHERE fsi.fecha >= DATE_TRUNC('month', (SELECT fecha FROM ultima))
            AND ${IS_PDV}
          GROUP BY fsi.codigo_barra
        ),
        nombres    AS (
          SELECT DISTINCT ON (codigo_barras) codigo_barras, descripcion, categoria
          FROM fact_ventas_selectos ORDER BY codigo_barras, fecha DESC
        )
        SELECT
          p.codigo_barra                                  AS sku,
          COALESCE(n.descripcion, p.codigo_barra)         AS descripcion,
          COALESCE(n.categoria, '')                        AS categoria,
          COALESCE(v.vpd_dia, 0)                           AS vpd_dia,
          p.pdv_uni,
          p.pdv_valor,
          CASE WHEN COALESCE(v.vpd_dia, 0) > 0
            THEN ROUND(p.pdv_uni::numeric / v.vpd_dia::numeric, 0)
            ELSE NULL END                                  AS doh_pdv,
          CASE
            WHEN COALESCE(v.vpd_dia, 0) > 0 AND p.pdv_uni / v.vpd_dia < 14 THEN 'CRÍTICO'
            WHEN COALESCE(v.vpd_dia, 0) > 0 AND p.pdv_uni / v.vpd_dia < 30 THEN 'ALTO'
            ELSE 'MEDIO'
          END AS urgencia
        FROM pdv_skus p
        LEFT JOIN cedi_stock cs ON cs.codigo_barra = p.codigo_barra
        LEFT JOIN vpd v         ON v.codigo_barra  = p.codigo_barra
        LEFT JOIN nombres n     ON n.codigo_barras  = p.codigo_barra
        WHERE cs.codigo_barra IS NULL
        ORDER BY
          CASE WHEN COALESCE(v.vpd_dia,0) > 0 AND p.pdv_uni/v.vpd_dia < 14 THEN 1
               WHEN COALESCE(v.vpd_dia,0) > 0 AND p.pdv_uni/v.vpd_dia < 30 THEN 2
               ELSE 3 END,
          doh_pdv ASC NULLS LAST
      `),

      pool.query(`
        WITH
        ultima     AS (SELECT MAX(fecha) AS fecha FROM fact_selectos_inventario),
        inv_latest AS (
          SELECT fsi.codigo_barra, SUM(fsi.inventario_unidades) AS inv_uni
          FROM fact_selectos_inventario fsi
          JOIN ultima u ON fsi.fecha = u.fecha
          WHERE ${IS_PDV}
          GROUP BY fsi.codigo_barra
        ),
        vpd        AS (
          SELECT codigo_barra,
            SUM(ventas_unidades)::float / ${VPD_DAYS} AS vpd_dia
          FROM fact_selectos_inventario
          WHERE fecha >= DATE_TRUNC('month', (SELECT fecha FROM ultima))
            AND NOT (tienda ILIKE '1001%' OR tienda ILIKE '1017%')
          GROUP BY codigo_barra
        )
        SELECT
          CASE
            WHEN COALESCE(v.vpd_dia, 0) = 0          THEN 'SIN VPD'
            WHEN i.inv_uni / v.vpd_dia < 7            THEN 'CRÍTICO'
            WHEN i.inv_uni / v.vpd_dia < 14           THEN 'ATENCIÓN'
            WHEN i.inv_uni / v.vpd_dia <= 60          THEN 'SALUDABLE'
            WHEN i.inv_uni / v.vpd_dia <= 120         THEN 'COB ALTA'
            ELSE                                           'SOBRESTOCK'
          END AS salud,
          COUNT(*) AS cnt
        FROM inv_latest i
        LEFT JOIN vpd v ON v.codigo_barra = i.codigo_barra
        GROUP BY salud
        ORDER BY salud
      `),
    ])

    const faltantes = faltantesR.rows.map(r => ({
      sku:       r.sku,
      descripcion: r.descripcion,
      categoria:   r.categoria,
      vpd_dia:     parseFloat(r.vpd_dia),
      pdv_uni:     parseFloat(r.pdv_uni),
      pdv_valor:   parseFloat(r.pdv_valor),
      doh_pdv:     r.doh_pdv !== null ? parseInt(r.doh_pdv) : null,
      urgencia:    r.urgencia as string,
    }))

    const total = healthR.rows.reduce((s: number, r: any) => s + parseInt(r.cnt), 0) || 1
    const health = healthR.rows.map(r => ({
      salud: r.salud as string,
      count: parseInt(r.cnt),
      pct:   parseFloat((parseInt(r.cnt) / total * 100).toFixed(1)),
    }))

    return NextResponse.json({
      health,
      cedi_faltantes: {
        rows: faltantes,
        kpis: {
          sin_cedi:        faltantes.length,
          criticos_doh14:  faltantes.filter(r => r.urgencia === 'CRÍTICO').length,
          pdv_uni:         faltantes.reduce((s, r) => s + r.pdv_uni, 0),
          pdv_valor:       faltantes.reduce((s, r) => s + r.pdv_valor, 0),
        },
      },
    })
  } catch (err) {
    return handleApiError(err)
  }
}
