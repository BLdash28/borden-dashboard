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
      `${col} IN (${vals.map(v => `'${v.replace(/'/g,"''")}'`).join(',')})`

    const filters: string[] = []
    if (paises.length) filters.push(inC('t.pais', paises))
    if (cats.length)   filters.push(inC('dp.categoria', cats))
    const where  = filters.length ? 'WHERE ' + filters.join(' AND ') : ''
    const catAnd = cats.length ? 'AND ' + inC('categoria', cats) : ''

    // Inventario agrupado por UPC con match a dim_producto
    const invR = await pool.query(`
      WITH ultima AS (
        SELECT MAX(fecha) AS fecha FROM inventario_tiendas
      )
      SELECT
        t.upc,
        MAX(dp.sku)                                                          AS sku,
        COALESCE(MAX(NULLIF(dp.descripcion,'')), MAX(NULLIF(t.descripcion,''))) AS descripcion,
        MAX(dp.categoria)     AS categoria,
        MAX(dp.subcategoria)  AS subcategoria,
        MAX(dp.codigo_barras) AS codigo_barras,
        SUM(t.inv_mano)       AS inv_mano,
        COUNT(DISTINCT t.tienda_nbr) AS tiendas,
        MAX(t.fecha)         AS fecha
      FROM inventario_tiendas t
      JOIN ultima u ON t.fecha = u.fecha
      LEFT JOIN dim_producto dp
        ON t.upc = LPAD(LEFT(dp.codigo_barras, LENGTH(dp.codigo_barras) - 1), 13, '0')
      ${where}
      GROUP BY t.upc
      HAVING SUM(t.inv_mano) > 0
      ORDER BY inv_mano DESC
      LIMIT 200
    `)

    // Venta diaria últimos 90 días por SKU para DOH
    const catSubquery = cats.length
      ? `AND fs.sku IN (SELECT sku FROM dim_producto WHERE ${inC('categoria', cats)})`
      : ''
    const ventaR = await pool.query(`
      SELECT
        fs.sku,
        ROUND((SUM(fs.ventas_unidades) / 90.0)::numeric, 4) AS venta_dia
      FROM fact_sales_sellout fs
      WHERE MAKE_DATE(fs.ano::int, fs.mes::int, fs.dia::int) >= CURRENT_DATE - INTERVAL '90 days'
        ${catSubquery}
      GROUP BY fs.sku
    `)

    const ventaMap: Record<string, number> = {}
    for (const r of ventaR.rows) ventaMap[r.sku] = parseFloat(r.venta_dia)

    const rows = invR.rows.map(row => {
      const inv      = parseFloat(row.inv_mano) || 0
      const ventaDia = row.sku ? (ventaMap[row.sku] ?? 0) : 0
      const doh      = ventaDia > 0 ? inv / ventaDia : null
      return {
        upc:           row.upc,
        codigo_barras: row.codigo_barras ?? null,
        sku:           row.sku ?? null,
        descripcion:   row.descripcion ?? null,
        categoria:     row.categoria ?? null,
        subcategoria:  row.subcategoria ?? null,
        inv_mano:     inv,
        tiendas:      parseInt(row.tiendas),
        venta_dia:    ventaDia,
        fecha:        row.fecha,
        doh,
        semaforo:     doh === null ? 'sin_datos' : doh <= 7 ? 'rojo' : doh <= 21 ? 'amarillo' : doh <= 60 ? 'verde' : 'azul',
      }
    })

    return NextResponse.json({ rows })
  } catch (err) {
    return handleApiError(err)
  }
}
