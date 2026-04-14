import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const dynamic = 'force-dynamic'

// Cobertura PDV: cuántos puntos de venta tienen cada SKU activo
export async function GET(req: NextRequest) {
  try {
    const sp   = req.nextUrl.searchParams
    const pais = sp.get('pais') || ''
    const ano  = parseInt(sp.get('ano') || '2026')

    const filters: string[] = [`ano = ${ano}`]
    if (pais) filters.push(`pais = '${pais.replace(/'/g,"''")}'`)
    const where = 'WHERE ' + filters.join(' AND ')

    const r = await pool.query(`
      SELECT
        sku,
        MAX(descripcion)                   AS descripcion,
        MAX(categoria)                     AS categoria,
        COUNT(DISTINCT punto_venta)        AS pdvs_activos,
        COUNT(DISTINCT pais)               AS paises,
        ROUND(SUM(ventas_valor)::numeric, 2) AS valor,
        ROUND(AVG(precio_promedio)::numeric, 4) AS precio_prom
      FROM fact_sales_sellout ${where}
      GROUP BY sku
      ORDER BY pdvs_activos DESC, valor DESC
      LIMIT 200
    `)

    const total_pdvs = r.rows.length > 0
      ? (await pool.query(`SELECT COUNT(DISTINCT punto_venta) AS n FROM fact_sales_sellout ${where}`)).rows[0].n
      : 0

    const rows = r.rows.map(row => ({
      sku:         row.sku,
      descripcion: row.descripcion,
      categoria:   row.categoria,
      pdvs_activos: parseInt(row.pdvs_activos),
      paises:      parseInt(row.paises),
      valor:       parseFloat(row.valor),
      precio_prom: parseFloat(row.precio_prom),
      cobertura_pct: total_pdvs > 0 ? (parseInt(row.pdvs_activos) / parseInt(total_pdvs) * 100) : 0,
    }))

    return NextResponse.json({ rows, total_pdvs: parseInt(total_pdvs) })
  } catch (err) {
    return handleApiError(err)
  }
}
