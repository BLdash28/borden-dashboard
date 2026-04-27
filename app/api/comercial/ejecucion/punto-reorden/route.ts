import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

// SKUs cuyo inventario PDV es menor o igual a 14 días de venta (punto de reorden)
export async function GET(req: NextRequest) {
  try {
    const sp     = req.nextUrl.searchParams
    const paises = sp.get('pais') ? sp.get('pais')!.split(',').filter(Boolean) : []
    const umbral = parseInt(sp.get('umbral') || '14')

    const inC = (col: string, vals: string[]) =>
      `${col} IN (${vals.map(v => `'${v.replace(/'/g,"''")}'`).join(',')})`

    const pdvFilters: string[] = []
    if (paises.length) pdvFilters.push(inC('pais', paises))
    const pdvWhere = pdvFilters.length ? 'WHERE ' + pdvFilters.join(' AND ') : ''

    const ventaFilters = [`ano IN (2025, 2026)`]
    if (paises.length) ventaFilters.push(inC('pais', paises))
    const ventaWhere = 'WHERE ' + ventaFilters.join(' AND ')

    const [pdvR, ventaR] = await Promise.all([
      pool.query(`
        SELECT sku, MAX(descripcion) AS descripcion, MAX(categoria) AS categoria,
               SUM(qty) AS qty
        FROM inventario_pdv ${pdvWhere}
        GROUP BY sku
      `),
      pool.query(`
        SELECT sku, ROUND((SUM(ventas_unidades) / 90.0)::numeric, 4) AS venta_dia
        FROM mv_sellout_mensual ${ventaWhere}
        GROUP BY sku
      `),
    ])

    const ventaMap: Record<string, number> = {}
    for (const r of ventaR.rows) ventaMap[r.sku] = parseFloat(r.venta_dia)

    const rows = pdvR.rows
      .map(row => {
        const qty      = parseInt(row.qty)
        const ventaDia = ventaMap[row.sku] ?? 0
        const doh      = ventaDia > 0 ? qty / ventaDia : null
        return {
          sku:         row.sku,
          descripcion: row.descripcion,
          categoria:   row.categoria,
          qty_pdv:     qty,
          venta_dia:   ventaDia,
          doh,
          urgencia:    doh === null ? 'sin_datos' : doh <= 7 ? 'critico' : doh <= umbral ? 'alerta' : 'ok',
        }
      })
      .filter(r => r.doh !== null && r.doh <= umbral)
      .sort((a, b) => (a.doh ?? 999) - (b.doh ?? 999))

    return NextResponse.json({
      rows,
      umbral,
      criticos: rows.filter(r => r.urgencia === 'critico').length,
      alertas:  rows.filter(r => r.urgencia === 'alerta').length,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
