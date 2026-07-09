import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

/**
 * Sell-In Grupo Éxito CO — carga inicial + evolución mensual.
 *
 * Devuelve KPIs (venta, utilidad, margen), evolución mensual (2025 vs 2026)
 * y detalle por SKU (ranking por venta). Se usa tanto en la sección Sell-In
 * de la Ejecución CO como en el módulo "Licenciamiento Colombia".
 */
export async function GET(_req: NextRequest) {
  try {
    const [kpiR, monthlyR, skuR, ocR, monthlyBySkuR] = await Promise.all([
      // KPI FY 2026 + comparativo FY 2025 (mismo período)
      pool.query(`
        WITH cur AS (
          SELECT
            SUM(cantidad_und)          AS uds,
            SUM(valor_venta_cop)       AS cop,
            SUM(valor_venta_usd)       AS usd,
            SUM(costo_venta_cop)       AS costo,
            SUM(utilidad_bruta_cop)    AS ut,
            MAX(mes)                   AS ultimo_mes
          FROM sellin_exito
          WHERE pais='CO' AND ano=2026
        ),
        prev AS (
          SELECT
            SUM(cantidad_und)          AS uds,
            SUM(valor_venta_cop)       AS cop,
            SUM(valor_venta_usd)       AS usd,
            SUM(utilidad_bruta_cop)    AS ut
          FROM sellin_exito
          WHERE pais='CO' AND ano=2025
            AND mes <= (SELECT COALESCE(ultimo_mes, 12) FROM cur)
        )
        SELECT
          COALESCE(cur.uds, 0)   AS uds_26,
          COALESCE(cur.cop, 0)   AS cop_26,
          COALESCE(cur.usd, 0)   AS usd_26,
          COALESCE(cur.costo, 0) AS costo_26,
          COALESCE(cur.ut, 0)    AS ut_26,
          COALESCE(prev.uds, 0)  AS uds_25,
          COALESCE(prev.cop, 0)  AS cop_25,
          COALESCE(prev.usd, 0)  AS usd_25,
          COALESCE(prev.ut, 0)   AS ut_25,
          cur.ultimo_mes
        FROM cur, prev
      `),
      // Evolución mensual
      pool.query(`
        SELECT ano, mes,
          SUM(cantidad_und)       AS uds,
          SUM(valor_venta_cop)    AS cop,
          SUM(valor_venta_usd)    AS usd,
          SUM(utilidad_bruta_cop) AS ut,
          SUM(costo_venta_cop)    AS costo
        FROM sellin_exito
        WHERE pais='CO' AND ano IN (2025, 2026)
        GROUP BY ano, mes ORDER BY ano, mes
      `),
      // Top SKUs por venta 2026 — enriquecido con subcategoria desde dim_producto_co
      pool.query(`
        SELECT
          s.sku,
          MAX(s.descripcion)                        AS descripcion,
          MAX(COALESCE(s.categoria, d.categoria))   AS categoria,
          MAX(COALESCE(s.subcategoria, d.subcategoria)) AS subcategoria,
          SUM(s.cantidad_und)                       AS uds,
          SUM(s.valor_venta_cop)                    AS cop,
          SUM(s.valor_venta_usd)                    AS usd,
          SUM(s.utilidad_bruta_cop)                 AS ut,
          CASE WHEN SUM(s.valor_venta_cop) > 0
               THEN (SUM(s.utilidad_bruta_cop) / SUM(s.valor_venta_cop)) * 100
               ELSE NULL END                        AS margen_pct
        FROM sellin_exito s
        LEFT JOIN dim_producto_co d ON d.sku = s.sku
        WHERE s.pais='CO' AND s.ano=2026 AND s.sku IS NOT NULL AND s.sku <> ''
        GROUP BY s.sku ORDER BY cop DESC
      `),
      // Órdenes de compra recientes (últimas 20)
      pool.query(`
        SELECT orden_compra,
          ano, mes,
          COUNT(*)                     AS n_lineas,
          SUM(cantidad_und)            AS uds,
          SUM(valor_venta_cop)         AS cop,
          SUM(utilidad_bruta_cop)      AS ut
        FROM sellin_exito
        WHERE pais='CO' AND ano=2026 AND orden_compra IS NOT NULL AND orden_compra <> ''
        GROUP BY orden_compra, ano, mes
        ORDER BY ano DESC, mes DESC, cop DESC
        LIMIT 30
      `),

      // Evolución mensual por SKU — para chart de Sell-In por producto
      pool.query(`
        SELECT s.sku,
          MAX(s.descripcion) AS descripcion,
          s.mes,
          SUM(s.cantidad_und)    AS uds,
          SUM(s.valor_venta_cop) AS cop,
          SUM(s.valor_venta_usd) AS usd
        FROM sellin_exito s
        WHERE s.pais='CO' AND s.ano=2026 AND s.sku IS NOT NULL AND s.sku <> ''
        GROUP BY s.sku, s.mes
        ORDER BY s.sku, s.mes
      `),
    ])

    const k = kpiR.rows[0] ?? {}
    const ult = parseInt(k.ultimo_mes ?? '0')
    const cop26 = parseFloat(k.cop_26 ?? '0')
    const cop25 = parseFloat(k.cop_25 ?? '0')
    const ut26  = parseFloat(k.ut_26  ?? '0')
    const ut25  = parseFloat(k.ut_25  ?? '0')
    const uds26 = parseFloat(k.uds_26 ?? '0')
    const uds25 = parseFloat(k.uds_25 ?? '0')

    const delta = (a: number, b: number) => b > 0 ? ((a - b) / b) * 100 : null

    const kpi = {
      ultimo_mes: ult,
      uds_26: uds26,
      cop_26: cop26,
      usd_26: parseFloat(k.usd_26 ?? '0'),
      costo_26: parseFloat(k.costo_26 ?? '0'),
      ut_26: ut26,
      margen_pct: cop26 > 0 ? (ut26 / cop26) * 100 : null,
      uds_25: uds25,
      cop_25: cop25,
      ut_25: ut25,
      margen_pct_25: cop25 > 0 ? (ut25 / cop25) * 100 : null,
      delta_venta: delta(cop26, cop25),
      delta_unidades: delta(uds26, uds25),
      delta_utilidad: delta(ut26, ut25),
    }

    // Monthly consolidado por mes con 2025/2026 lado a lado
    type Row = { mes: number; mes_nombre: string; cop_25: number; cop_26: number | null; uds_25: number; uds_26: number | null; ut_25: number; ut_26: number | null }
    const MN = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
    const monthly: Record<number, Row> = {}
    for (let m = 1; m <= 12; m++) monthly[m] = { mes: m, mes_nombre: MN[m], cop_25: 0, cop_26: null, uds_25: 0, uds_26: null, ut_25: 0, ut_26: null }
    for (const r of monthlyR.rows) {
      const m = parseInt(r.mes), a = parseInt(r.ano)
      const cop = parseFloat(r.cop ?? '0'), uds = parseFloat(r.uds ?? '0'), ut = parseFloat(r.ut ?? '0')
      if (a === 2025) { monthly[m].cop_25 = cop; monthly[m].uds_25 = uds; monthly[m].ut_25 = ut }
      if (a === 2026) { monthly[m].cop_26 = cop; monthly[m].uds_26 = uds; monthly[m].ut_26 = ut }
    }
    for (let m = ult + 1; m <= 12; m++) { monthly[m].cop_26 = null; monthly[m].uds_26 = null; monthly[m].ut_26 = null }

    // Agrupar evolución mensual por SKU: [{ sku, descripcion, months: { mes: {uds, cop, usd} } }]
    type BySku = { sku: string; descripcion: string | null; months: Record<number, { uds: number; cop: number; usd: number }> }
    const bySkuMap: Record<string, BySku> = {}
    for (const r of monthlyBySkuR.rows) {
      const sku = r.sku
      if (!bySkuMap[sku]) bySkuMap[sku] = { sku, descripcion: r.descripcion, months: {} }
      bySkuMap[sku].months[parseInt(r.mes)] = {
        uds: parseFloat(r.uds ?? '0'),
        cop: parseFloat(r.cop ?? '0'),
        usd: parseFloat(r.usd ?? '0'),
      }
    }
    const monthlyBySku = Object.values(bySkuMap)

    return NextResponse.json({
      kpi,
      monthly: Object.values(monthly),
      top_skus: skuR.rows.map(r => ({
        sku:          r.sku,
        descripcion:  r.descripcion,
        categoria:    r.categoria,
        subcategoria: r.subcategoria,
        uds:          parseFloat(r.uds ?? '0'),
        cop:          parseFloat(r.cop ?? '0'),
        usd:          parseFloat(r.usd ?? '0'),
        ut:           parseFloat(r.ut ?? '0'),
        margen_pct:   r.margen_pct !== null ? parseFloat(r.margen_pct) : null,
      })),
      ocs: ocR.rows.map(r => ({
        orden_compra: r.orden_compra,
        ano:          parseInt(r.ano),
        mes:          parseInt(r.mes),
        n_lineas:     parseInt(r.n_lineas),
        uds:          parseFloat(r.uds ?? '0'),
        cop:          parseFloat(r.cop ?? '0'),
        ut:           parseFloat(r.ut ?? '0'),
      })),
      monthly_by_sku: monthlyBySku,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
