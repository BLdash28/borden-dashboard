import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const dynamic = 'force-dynamic'

// Distribución 75%: SKUs que concentran el 75% de la venta por país
export async function GET(req: NextRequest) {
  try {
    const sp   = req.nextUrl.searchParams
    const pais = sp.get('pais') || ''
    const ano  = parseInt(sp.get('ano') || '2026')

    const filters: string[] = [`ano = ${ano}`]
    if (pais) filters.push(`pais = '${pais.replace(/'/g,"''")}'`)
    const where = 'WHERE ' + filters.join(' AND ')

    const r = await pool.query(`
      WITH ventas AS (
        SELECT
          sku,
          MAX(descripcion) AS descripcion,
          MAX(categoria)   AS categoria,
          SUM(ventas_valor) AS valor
        FROM fact_sales_sellout ${where}
        GROUP BY sku
        ORDER BY valor DESC
      ),
      total AS (SELECT SUM(valor) AS total FROM ventas),
      acum  AS (
        SELECT
          sku, descripcion, categoria, valor,
          SUM(valor) OVER (ORDER BY valor DESC) AS acumulado
        FROM ventas, total
        WHERE total > 0
      )
      SELECT
        ROW_NUMBER() OVER () AS rank,
        sku,
        descripcion,
        categoria,
        ROUND(valor::numeric, 2)      AS valor,
        ROUND((acumulado / (SELECT total FROM total) * 100)::numeric, 2) AS pct_acum,
        acumulado <= (SELECT total FROM total) * 0.75 AS es_top75
      FROM acum
      ORDER BY valor DESC
      LIMIT 300
    `)

    const total = r.rows.reduce((s, r) => s + parseFloat(r.valor), 0)
    const top75 = r.rows.filter(r => r.es_top75)

    return NextResponse.json({
      rows: r.rows,
      resumen: {
        total_skus:  r.rows.length,
        skus_top75:  top75.length,
        pct_skus:    r.rows.length > 0 ? (top75.length / r.rows.length * 100) : 0,
        valor_total: total,
      }
    })
  } catch (err) {
    return handleApiError(err)
  }
}
