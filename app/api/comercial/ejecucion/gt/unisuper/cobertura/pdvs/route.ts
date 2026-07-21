import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 1800

/**
 * Drill-down PDVs para un SKU específico en Cobertura Unisuper.
 * Devuelve los puntos de venta donde el SKU se ha vendido en últimos 90d,
 * con detalle de unidades + valor + cadena, ordenados por venta descendente.
 *
 * Query params:
 *   sku (obligatorio) — código del SKU
 *   bucket (opcional): 'todos' | 'menos_de_3' | 'entre_3_y_10' | 'mayor_a_10'
 *     Filtra por número de pedidos (registros de venta) del SKU en el PDV.
 */
export async function GET(req: NextRequest) {
  try {
    const sp     = req.nextUrl.searchParams
    const sku    = sp.get('sku') ?? ''
    const bucket = sp.get('bucket') ?? 'todos'

    if (!sku) return NextResponse.json({ error: 'sku requerido' }, { status: 400 })

    let bucketCond = ''
    if (bucket === 'menos_de_3')   bucketCond = 'HAVING COUNT(*) < 3'
    if (bucket === 'entre_3_y_10') bucketCond = 'HAVING COUNT(*) BETWEEN 3 AND 10'
    if (bucket === 'mayor_a_10')   bucketCond = 'HAVING COUNT(*) > 10'

    const { rows } = await pool.query(`
      SELECT
        f.nombre_sucursal          AS punto_venta,
        f.codigo_sucursal          AS store_nbr,
        f.cadena,
        MAX(f.descripcion)         AS descripcion,
        f.sku,
        COUNT(*)                   AS pedidos,
        SUM(f.ventas_unidades)::int AS unidades,
        ROUND(SUM(f.ventas_valor)::numeric, 0) AS valor,
        MAX(f.fecha)::date          AS ultima_venta
      FROM fact_ventas_unisuper f
      WHERE f.pais = 'GT'
        AND f.sku = $1
        AND f.fecha >= CURRENT_DATE - INTERVAL '90 day'
        AND f.ventas_unidades > 0
      GROUP BY f.nombre_sucursal, f.codigo_sucursal, f.cadena, f.sku
      ${bucketCond}
      ORDER BY valor DESC
      LIMIT 500
    `, [sku])

    return NextResponse.json({
      sku,
      bucket,
      total: rows.length,
      pdvs: rows.map(r => ({
        punto_venta:   r.punto_venta,
        store_nbr:     r.store_nbr,
        cadena:        r.cadena,
        categoria:     'Quesos',
        sku:           r.sku,
        descripcion:   r.descripcion,
        pedidos:       parseInt(r.pedidos ?? '0'),
        unidades:      parseInt(r.unidades ?? '0'),
        valor:         parseFloat(r.valor ?? '0'),
        ultima_venta:  r.ultima_venta,
      })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
