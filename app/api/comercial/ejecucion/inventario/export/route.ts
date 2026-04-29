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

    const filters: string[] = ['t.inv_mano > 0']
    if (paises.length) filters.push(inC('t.pais', paises))
    if (cats.length)   filters.push(inC('dp.categoria', cats))
    const where = 'WHERE ' + filters.join(' AND ')

    const catSubquery = cats.length
      ? `AND fs.sku IN (SELECT sku FROM dim_producto WHERE ${inC('categoria', cats)})`
      : ''

    const result = await pool.query(`
      WITH ultima AS (
        SELECT MAX(fecha) AS fecha FROM inventario_tiendas
      ),
      vta AS (
        SELECT
          fs.sku,
          fs.punto_venta,
          ROUND((SUM(fs.ventas_unidades) / 90.0)::numeric, 4) AS venta_dia
        FROM fact_sales_sellout fs
        WHERE MAKE_DATE(fs.ano::int, fs.mes::int, fs.dia::int) >= CURRENT_DATE - INTERVAL '90 days'
          ${catSubquery}
        GROUP BY fs.sku, fs.punto_venta
      ),
      totales AS (
        SELECT
          t.upc,
          SUM(t.inv_mano) AS inv_total
        FROM inventario_tiendas t
        JOIN ultima u ON t.fecha = u.fecha
        GROUP BY t.upc
      )
      SELECT
        COALESCE(dp.codigo_barras, t.upc)                             AS codigo_barras,
        dp.sku,
        COALESCE(NULLIF(dp.descripcion,''), NULLIF(t.descripcion,'')) AS descripcion,
        dp.categoria,
        dp.subcategoria,
        t.pais,
        t.financial_rpt,
        t.tienda_nbr,
        t.tienda_nombre,
        t.inv_mano,
        COALESCE(v.venta_dia, 0)                                      AS venta_dia,
        tot.inv_total
      FROM inventario_tiendas t
      JOIN ultima  u   ON t.fecha = u.fecha
      JOIN totales tot ON tot.upc = t.upc
      LEFT JOIN dim_producto dp
        ON t.upc = LPAD(LEFT(dp.codigo_barras, LENGTH(dp.codigo_barras) - 1), 13, '0')
      LEFT JOIN vta v ON v.sku = dp.sku AND v.punto_venta = t.tienda_nombre
      ${where}
      ORDER BY tot.inv_total DESC, t.upc, t.pais, t.inv_mano DESC
    `)

    const semaforo = (inv: number, vd: number) => {
      if (vd === 0) return 'sin_datos'
      const doh = inv / vd
      return doh <= 7 ? 'rojo' : doh <= 21 ? 'amarillo' : doh <= 60 ? 'verde' : 'azul'
    }

    const rows = result.rows.map(r => {
      const inv    = parseFloat(r.inv_mano)  || 0
      const vd     = parseFloat(r.venta_dia) || 0
      const doh    = vd > 0 ? inv / vd : null
      return {
        codigo_barras:  r.codigo_barras,
        sku:            r.sku ?? '',
        descripcion:    r.descripcion ?? '',
        categoria:      r.categoria ?? '',
        subcategoria:   r.subcategoria ?? '',
        pais:           r.pais,
        financial_rpt:  r.financial_rpt ?? '',
        tienda_nbr:     r.tienda_nbr,
        tienda_nombre:  r.tienda_nombre,
        inv_mano:      inv,
        venta_dia:     vd,
        doh:           doh ? parseFloat(doh.toFixed(1)) : null,
        semaforo:      semaforo(inv, vd),
      }
    })

    return NextResponse.json({ rows })
  } catch (err) {
    return handleApiError(err)
  }
}
