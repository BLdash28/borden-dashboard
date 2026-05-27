import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 0

export async function GET(req: NextRequest) {
  try {
    const sp   = req.nextUrl.searchParams
    const cats = sp.get('categoria') ? sp.get('categoria')!.split(',').filter(Boolean) : []
    const sucs = sp.get('sucursal')  ? sp.get('sucursal')!.split(',').filter(Boolean)  : []
    const fechaParam = sp.get('fecha') // YYYY-MM-DD or null

    const inC = (col: string, vals: string[]) =>
      `${col} IN (${vals.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`

    const filters: string[] = []
    if (cats.length) filters.push(inC('categoria', cats))
    if (sucs.length) filters.push(inC('nombre_sucursal', sucs))

    const fechaWhere = fechaParam
      ? `fecha = '${fechaParam}'`
      : `fecha = (SELECT MAX(fecha) FROM fact_ventas_unisuper)`

    const where = [fechaWhere, ...filters].join(' AND ')

    const [rowsR, kpisR, fechasR] = await Promise.all([
      pool.query(`
        SELECT
          fecha,
          codigo_sucursal,
          nombre_sucursal,
          categoria,
          subcategoria,
          codigo_sku,
          descripcion_sku,
          SUM(unidades)   AS unidades,
          SUM(venta_neta) AS venta_neta
        FROM fact_ventas_unisuper
        WHERE ${where}
        GROUP BY fecha, codigo_sucursal, nombre_sucursal, categoria, subcategoria, codigo_sku, descripcion_sku
        ORDER BY venta_neta DESC
        LIMIT 500
      `),
      pool.query(`
        SELECT
          SUM(venta_neta)          AS total_venta,
          SUM(unidades)            AS total_unidades,
          COUNT(DISTINCT codigo_sucursal) AS sucursales,
          COUNT(DISTINCT codigo_sku)      AS skus,
          MAX(fecha)               AS fecha
        FROM fact_ventas_unisuper
        WHERE ${where}
      `),
      pool.query(`
        SELECT DISTINCT fecha
        FROM fact_ventas_unisuper
        ORDER BY fecha DESC
        LIMIT 30
      `),
    ])

    const k = kpisR.rows[0]
    return NextResponse.json({
      rows: rowsR.rows,
      kpis: {
        total_venta:    parseFloat(k.total_venta)  || 0,
        total_unidades: parseFloat(k.total_unidades) || 0,
        sucursales:     parseInt(k.sucursales)     || 0,
        skus:           parseInt(k.skus)           || 0,
        fecha:          k.fecha,
      },
      fechas: fechasR.rows.map(r => r.fecha),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
