import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

// Long Tail 50%: SKUs que suman el último 50% de la venta (la cola larga)
export async function GET(req: NextRequest) {
  try {
    const sp     = req.nextUrl.searchParams
    const paises = sp.get('pais') ? sp.get('pais')!.split(',').filter(Boolean) : []
    const ano    = parseInt(sp.get('ano') || '2026')

    const inC = (col: string, vals: string[]) =>
      `${col} IN (${vals.map(v => `'${v.replace(/'/g,"''")}'`).join(',')})`

    const filters: string[] = [`ano = ${ano}`]
    if (paises.length) filters.push(inC('pais', paises))
    const where = 'WHERE ' + filters.join(' AND ')

    const r = await pool.query(`
      WITH ventas AS (
        SELECT sku, MAX(descripcion) AS descripcion, MAX(categoria) AS categoria,
               SUM(ventas_valor) AS valor
        FROM mv_sellout_mensual ${where}
        GROUP BY sku
      ),
      total AS (SELECT SUM(valor) AS total FROM ventas),
      acum AS (
        SELECT sku, descripcion, categoria, valor,
               SUM(valor) OVER (ORDER BY valor DESC) AS acumulado,
               (SELECT total FROM total) AS total_venta
        FROM ventas
      )
      SELECT
        ROW_NUMBER() OVER () AS rank,
        sku, descripcion, categoria,
        ROUND(valor::numeric, 2) AS valor,
        ROUND((acumulado / NULLIF(total_venta,0) * 100)::numeric, 2) AS pct_acum,
        acumulado / NULLIF(total_venta,0) > 0.5 AS es_cola
      FROM acum
      ORDER BY valor DESC
      LIMIT 500
    `)

    const total_skus = r.rows.length
    const cola_rows  = r.rows.filter((r: any) => r.es_cola)
    const top_rows   = r.rows.filter((r: any) => !r.es_cola)

    return NextResponse.json({
      rows: r.rows,
      resumen: {
        total_skus,
        skus_top50:  top_rows.length,
        skus_cola50: cola_rows.length,
        pct_cola:    total_skus > 0 ? (cola_rows.length / total_skus * 100) : 0,
        valor_cola:  cola_rows.reduce((s: number, r: any) => s + parseFloat(r.valor), 0),
        valor_top:   top_rows.reduce((s: number,  r: any) => s + parseFloat(r.valor), 0),
      }
    })
  } catch (err) {
    return handleApiError(err)
  }
}
