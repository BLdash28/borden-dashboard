import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

export async function GET(req: NextRequest) {
  try {
    const sp  = req.nextUrl.searchParams
    const ano = parseInt(sp.get('ano') || '2026')

    const r = await pool.query(`
      WITH ventas AS (
        SELECT
          codigo_barras             AS sku,
          MAX(descripcion)          AS descripcion,
          MAX(categoria)            AS categoria,
          SUM(ventas_valor)         AS valor
        FROM fact_ventas_selectos
        WHERE fecha >= '${ano}-01-01' AND fecha < '${ano + 1}-01-01'
        GROUP BY codigo_barras
      ),
      total AS (SELECT NULLIF(SUM(valor), 0) AS total FROM ventas),
      acum  AS (
        SELECT
          sku, descripcion, categoria, valor,
          SUM(valor) OVER (ORDER BY valor DESC ROWS UNBOUNDED PRECEDING) AS acumulado
        FROM ventas
        ORDER BY valor DESC
      )
      SELECT
        ROW_NUMBER() OVER ()                                                                   AS rank,
        sku,
        descripcion,
        categoria,
        ROUND(valor::numeric, 2)                                                               AS valor,
        ROUND((acumulado / (SELECT total FROM total) * 100)::numeric, 2)                      AS pct_acum,
        acumulado <= (SELECT total FROM total) * 0.75                                          AS es_top75
      FROM acum, total
      WHERE total IS NOT NULL
      ORDER BY valor DESC
      LIMIT 300
    `)

    const total  = r.rows.reduce((s, row) => s + parseFloat(row.valor), 0)
    const top75  = r.rows.filter(row => row.es_top75)

    return NextResponse.json({
      rows: r.rows,
      resumen: {
        total_skus:  r.rows.length,
        skus_top75:  top75.length,
        pct_skus:    r.rows.length > 0 ? (top75.length / r.rows.length * 100) : 0,
        valor_total: total,
      },
    })
  } catch (err) {
    return handleApiError(err)
  }
}
