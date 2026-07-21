import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const dynamic    = 'force-dynamic'

/**
 * Detalle Inventario Unisuper GT por SKU × Tienda del último snapshot.
 * Calcula DOH (days on hand) usando velocidad de venta últimos 90d y
 * clasifica salud: CRÍTICO / ATENCIÓN / SALUDABLE / COBERTURA ALTA / SOBRESTOCK / SIN VPD.
 *
 * Query params (opcional): cadena (CSV), salud (CSV — filtro client-friendly),
 *   prod (LIKE %prod%)
 */
function csv(sp: URLSearchParams, key: string): string[] {
  const v = sp.get(key)
  return v ? v.split(',').map(s => s.trim()).filter(Boolean) : []
}

export async function GET(req: NextRequest) {
  try {
    const sp        = req.nextUrl.searchParams
    const cadenas   = csv(sp, 'cadenas')
    const saludArr  = csv(sp, 'saludes')  // filtro post-query
    const prod      = sp.get('prod') ?? ''

    const params: unknown[] = []
    const conds: string[] = [`i.pais = 'GT'`]

    if (cadenas.length) {
      const start = params.length
      cadenas.forEach(v => params.push(v))
      conds.push(`i.cadena IN (${cadenas.map((_, i) => `$${start + 1 + i}`).join(',')})`)
    }
    if (prod) {
      params.push(`%${prod.toLowerCase()}%`)
      conds.push(`(LOWER(COALESCE(i.descripcion_sku, '')) LIKE $${params.length} OR i.codigo_sku ILIKE $${params.length})`)
    }
    const where = conds.join(' AND ')

    const { rows } = await pool.query(`
      WITH ult AS (SELECT MAX(fecha) AS f FROM inventario_unisuper WHERE pais='GT'),
      vel AS (
        SELECT sku,
          ROUND((SUM(ventas_unidades) / 90.0)::numeric, 4) AS venta_dia
        FROM fact_ventas_unisuper
        WHERE pais='GT' AND fecha >= CURRENT_DATE - INTERVAL '90 day' AND ventas_unidades > 0
        GROUP BY sku
      )
      SELECT
        i.codigo_sku            AS sku,
        i.codigo_barra          AS codigo_barras,
        i.descripcion_sku       AS descripcion,
        i.subcategoria,
        i.cadena,
        i.nombre_sucursal       AS punto_venta,
        SUM(i.cantidad)::float  AS inv_mano,
        COALESCE(MAX(v.venta_dia), 0)::float AS venta_dia,
        CASE WHEN COALESCE(MAX(v.venta_dia), 0) > 0
          THEN ROUND((SUM(i.cantidad)::numeric / MAX(v.venta_dia)), 1)
          ELSE NULL END          AS doh,
        CASE
          WHEN COALESCE(MAX(v.venta_dia), 0) = 0                    THEN 'SIN VPD'
          WHEN SUM(i.cantidad)::float / MAX(v.venta_dia) <= 7       THEN 'CRÍTICO'
          WHEN SUM(i.cantidad)::float / MAX(v.venta_dia) <= 14      THEN 'ATENCIÓN'
          WHEN SUM(i.cantidad)::float / MAX(v.venta_dia) <= 60      THEN 'SALUDABLE'
          WHEN SUM(i.cantidad)::float / MAX(v.venta_dia) <= 120     THEN 'COBERTURA ALTA'
          ELSE 'SOBRESTOCK'
        END                     AS salud
      FROM inventario_unisuper i
      LEFT JOIN vel v ON v.sku = i.codigo_sku
      WHERE ${where} AND i.fecha = (SELECT f FROM ult)
      GROUP BY i.codigo_sku, i.codigo_barra, i.descripcion_sku, i.subcategoria, i.cadena, i.nombre_sucursal
      ORDER BY inv_mano DESC
      LIMIT 3000
    `, params)

    const filtered = saludArr.length
      ? rows.filter((r: any) => saludArr.includes(r.salud))
      : rows

    return NextResponse.json({
      rows: filtered.map((r: any) => ({
        sku:             r.sku,
        codigo_barras:   r.codigo_barras,
        descripcion:     r.descripcion,
        subcategoria:    r.subcategoria,
        cadena:          r.cadena,
        punto_venta:     r.punto_venta,
        nombre_tienda:   r.punto_venta,
        inv_mano:        parseFloat(r.inv_mano ?? '0'),
        venta_dia:       parseFloat(r.venta_dia ?? '0'),
        doh:             r.doh !== null ? parseFloat(r.doh) : null,
        salud:           r.salud ?? 'SIN VPD',
      })),
      total: filtered.length,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
