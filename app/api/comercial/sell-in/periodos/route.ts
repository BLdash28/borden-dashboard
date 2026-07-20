import { NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const dynamic = 'force-dynamic'

/**
 * GET /api/comercial/sell-in/periodos
 * Devuelve la lista de (ano, mes) con datos en fact_sales_sellin, usando
 * `ano_pedido` (año de la HOJA del Excel), no fecha_factura.
 *
 * Sirve al filtro de "Año" de /dashboard/comercial/sell-in.
 */
export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT ano_pedido AS ano, mes, COUNT(*) AS filas,
              ROUND(SUM(venta_neta)::numeric, 0) AS valor_usd
       FROM fact_sales_sellin
       WHERE ano_pedido IS NOT NULL AND venta_neta > 0
       GROUP BY ano_pedido, mes
       ORDER BY ano_pedido DESC, mes DESC`,
    )
    return NextResponse.json({ periodos: rows })
  } catch (err) {
    return handleApiError(err)
  }
}
