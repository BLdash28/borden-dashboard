import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sp   = req.nextUrl.searchParams
    const pais = sp.get('pais') || ''
    const cat  = sp.get('categoria') || ''

    const filters: string[] = []
    if (pais) filters.push(`pais = '${pais.replace(/'/g,"''")}'`)
    if (cat)  filters.push(`categoria = '${cat.replace(/'/g,"''")}'`)
    const and = filters.length ? 'AND ' + filters.join(' AND ') : ''
    const where = filters.length ? 'WHERE ' + filters.join(' AND ') : ''

    // Inventario PDV
    const pdvR = await pool.query(`
      SELECT
        sku,
        MAX(descripcion) AS descripcion,
        MAX(categoria)   AS categoria,
        SUM(qty)         AS qty_pdv,
        COUNT(DISTINCT punto_venta) AS pdvs
      FROM inventario_pdv ${where}
      GROUP BY sku
      ORDER BY qty_pdv DESC
      LIMIT 200
    `)

    // Promedio de venta diaria últimos 90 días (sell-out) para DOH
    const ventaR = await pool.query(`
      SELECT
        sku,
        ROUND((SUM(ventas_unidades) / 90.0)::numeric, 4) AS venta_dia
      FROM fact_sales_sellout
      WHERE ano IN (2025, 2026) ${and}
        AND (ano * 100 + mes) >= (
          EXTRACT(YEAR FROM NOW())::int * 100 + EXTRACT(MONTH FROM NOW())::int - 3
        )
      GROUP BY sku
    `)

    const ventaMap: Record<string, number> = {}
    for (const r of ventaR.rows) ventaMap[r.sku] = parseFloat(r.venta_dia)

    const rows = pdvR.rows.map(row => {
      const qty      = parseInt(row.qty_pdv)
      const ventaDia = ventaMap[row.sku] ?? 0
      const doh      = ventaDia > 0 ? qty / ventaDia : null
      return {
        sku:         row.sku,
        descripcion: row.descripcion,
        categoria:   row.categoria,
        qty_pdv:     qty,
        pdvs:        parseInt(row.pdvs),
        venta_dia:   ventaDia,
        doh,
        semaforo:    doh === null ? 'sin_datos' : doh <= 7 ? 'rojo' : doh <= 21 ? 'amarillo' : doh <= 60 ? 'verde' : 'azul',
      }
    })

    const totals = {
      qty_pdv: rows.reduce((s, r) => s + r.qty_pdv, 0),
      pdvs:    rows.reduce((s, r) => s + r.pdvs, 0),
    }

    return NextResponse.json({ rows, totals })
  } catch (err) {
    return handleApiError(err)
  }
}
