import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 0

export async function GET(req: NextRequest) {
  try {
    const sp   = req.nextUrl.searchParams
    const cats = sp.get('categoria') ? sp.get('categoria')!.split(',').filter(Boolean) : []
    const sucs = sp.get('sucursal')  ? sp.get('sucursal')!.split(',').filter(Boolean)  : []
    const fechaParam = sp.get('fecha')

    const inC = (col: string, vals: string[]) =>
      `${col} IN (${vals.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`

    const filters: string[] = []
    if (cats.length) filters.push(inC('categoria', cats))
    if (sucs.length) filters.push(inC('nombre_sucursal', sucs))

    const fechaWhere = fechaParam
      ? `fecha = '${fechaParam}'`
      : `fecha = (SELECT MAX(fecha) FROM inventario_unisuper)`

    const where = [fechaWhere, ...filters].join(' AND ')

    const [rowsR, kpisR, fechasR] = await Promise.all([
      pool.query(`
        SELECT
          fecha,
          codigo_sucursal,
          nombre_sucursal,
          region,
          categoria,
          subcategoria,
          codigo_sku,
          descripcion_sku,
          SUM(cantidad)   AS cantidad,
          SUM(valor_gtq)  AS valor_gtq
        FROM inventario_unisuper
        WHERE ${where}
        GROUP BY fecha, codigo_sucursal, nombre_sucursal, region, categoria, subcategoria, codigo_sku, descripcion_sku
        ORDER BY valor_gtq DESC
        LIMIT 500
      `),
      pool.query(`
        SELECT
          SUM(valor_gtq)           AS total_valor,
          SUM(cantidad)            AS total_cantidad,
          COUNT(DISTINCT codigo_sucursal) AS sucursales,
          COUNT(DISTINCT codigo_sku)      AS skus,
          MAX(fecha)               AS fecha
        FROM inventario_unisuper
        WHERE ${where}
      `),
      pool.query(`
        SELECT DISTINCT fecha
        FROM inventario_unisuper
        ORDER BY fecha DESC
        LIMIT 30
      `),
    ])

    const k = kpisR.rows[0]
    return NextResponse.json({
      rows: rowsR.rows,
      kpis: {
        total_valor:     parseFloat(k.total_valor)    || 0,
        total_cantidad:  parseFloat(k.total_cantidad) || 0,
        sucursales:      parseInt(k.sucursales)       || 0,
        skus:            parseInt(k.skus)             || 0,
        fecha:           k.fecha,
      },
      fechas: fechasR.rows.map(r => r.fecha),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
