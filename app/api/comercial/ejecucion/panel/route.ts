import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const dynamic = 'force-dynamic'

// Panel General de Ejecución: métricas resumen de todos los módulos
export async function GET(req: NextRequest) {
  try {
    const ano = parseInt(req.nextUrl.searchParams.get('ano') || '2026')

    const [ventaR, invR, reordenR, colaR] = await Promise.all([
      // KPIs de venta sell-out
      pool.query(`
        SELECT
          COUNT(DISTINCT sku)         AS skus_activos,
          COUNT(DISTINCT punto_venta) AS pdvs,
          COUNT(DISTINCT pais)        AS paises,
          ROUND(SUM(ventas_valor)::numeric, 2)    AS valor_total,
          ROUND(SUM(ventas_unidades)::numeric, 0) AS unidades_total
        FROM fact_sales_sellout WHERE ano = ${ano}
      `),
      // Inventario PDV total
      pool.query(`
        SELECT SUM(qty) AS qty_total, COUNT(DISTINCT sku) AS skus_inv
        FROM inventario_pdv
      `),
      // SKUs en punto de reorden (DOH <= 14)
      pool.query(`
        WITH venta AS (
          SELECT sku, SUM(ventas_unidades)/90.0 AS venta_dia
          FROM fact_sales_sellout WHERE ano IN (2025,2026) GROUP BY sku
        )
        SELECT COUNT(*) AS cnt
        FROM inventario_pdv i
        JOIN venta v ON v.sku = i.sku
        GROUP BY i.sku, i.qty, v.venta_dia
        HAVING (SUM(i.qty) / NULLIF(v.venta_dia,0)) <= 14
      `),
      // Long tail: skus en la cola del 50%
      pool.query(`
        WITH v AS (
          SELECT sku, SUM(ventas_valor) AS valor FROM fact_sales_sellout
          WHERE ano = ${ano} GROUP BY sku
        ),
        t AS (SELECT SUM(valor) AS total FROM v),
        a AS (
          SELECT sku, valor,
                 SUM(valor) OVER (ORDER BY valor DESC) / NULLIF((SELECT total FROM t),0) AS pct_acum
          FROM v
        )
        SELECT COUNT(*) AS cola_cnt FROM a WHERE pct_acum > 0.5
      `),
    ])

    const v = ventaR.rows[0]
    const i = invR.rows[0]

    return NextResponse.json({
      ano,
      venta: {
        skus_activos:   parseInt(v.skus_activos),
        pdvs:           parseInt(v.pdvs),
        paises:         parseInt(v.paises),
        valor_total:    parseFloat(v.valor_total),
        unidades_total: parseInt(v.unidades_total),
      },
      inventario: {
        qty_total: parseInt(i.qty_total ?? 0),
        skus_inv:  parseInt(i.skus_inv ?? 0),
      },
      reorden:   { criticos: reordenR.rows.length },
      long_tail: { skus_cola: parseInt(colaR.rows[0]?.cola_cnt ?? 0) },
    })
  } catch (err) {
    return handleApiError(err)
  }
}
