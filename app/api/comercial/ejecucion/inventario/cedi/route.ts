import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 0

export async function GET(req: NextRequest) {
  try {
    const sp     = req.nextUrl.searchParams
    const paises = sp.get('pais')      ? sp.get('pais')!.split(',').filter(Boolean)      : []
    const cats   = sp.get('categoria') ? sp.get('categoria')!.split(',').filter(Boolean) : []

    const inC = (col: string, vals: string[]) =>
      `${col} IN (${vals.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`

    const filters: string[] = []
    if (paises.length) filters.push(inC('c.pais', paises))
    if (cats.length)   filters.push(inC('dp.categoria', cats))
    const where = filters.length ? 'WHERE ' + filters.join(' AND ') : ''

    const result = await pool.query(`
      WITH ultima AS (
        SELECT MAX(fecha) AS fecha FROM inventario_cedi
      )
      SELECT
        c.upc,
        MAX(dp.codigo_barras)                                                        AS codigo_barras,
        MAX(dp.sku)                                                                  AS sku,
        COALESCE(MAX(NULLIF(dp.descripcion,'')), MAX(NULLIF(c.descripcion,'')))      AS descripcion,
        MAX(dp.categoria)                                                            AS categoria,
        MAX(dp.subcategoria)                                                         AS subcategoria,
        c.pais,
        SUM(c.inv_mano_cajas)                                                        AS inv_mano_cajas,
        SUM(c.inv_orden_cajas)                                                       AS inv_orden_cajas,
        MAX(c.fecha)                                                                 AS fecha
      FROM inventario_cedi c
      JOIN ultima u ON c.fecha = u.fecha
      LEFT JOIN dim_producto dp
        ON c.upc = LPAD(LEFT(dp.codigo_barras, LENGTH(dp.codigo_barras) - 1), 13, '0')
      ${where}
      GROUP BY c.upc, c.pais
      HAVING SUM(c.inv_mano_cajas) > 0
      ORDER BY inv_mano_cajas DESC
      LIMIT 300
    `)

    const rows = result.rows.map(r => ({
      upc:            r.upc,
      codigo_barras:  r.codigo_barras ?? null,
      sku:            r.sku ?? null,
      descripcion:    r.descripcion ?? null,
      categoria:      r.categoria ?? null,
      subcategoria:   r.subcategoria ?? null,
      pais:           r.pais,
      inv_mano_cajas: parseFloat(r.inv_mano_cajas) || 0,
      inv_orden_cajas:parseFloat(r.inv_orden_cajas) || 0,
      fecha:          r.fecha,
    }))

    return NextResponse.json({ rows })
  } catch (err) {
    return handleApiError(err)
  }
}
