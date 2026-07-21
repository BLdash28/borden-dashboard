import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 1800

/**
 * Inventario Unisuper GT — desde tabla `inventario_unisuper`.
 * Devuelve KPIs y detalle por SKU × tienda del último snapshot.
 *
 * Estructura simplificada respecto de Walmart (no hay separación CEDI/PDV
 * clara — todos los códigos son sucursales). Se marca "CD *" como CEDI.
 */
function csv(sp: URLSearchParams, key: string): string[] {
  const v = sp.get(key)
  return v ? v.split(',').map(s => s.trim()).filter(Boolean) : []
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const cadenas = csv(sp, 'cadenas')
    const subcats = csv(sp, 'subcategorias')

    const params: unknown[] = []
    const conds: string[] = [`pais = 'GT'`]

    if (cadenas.length) {
      const start = params.length
      cadenas.forEach(v => params.push(v))
      conds.push(`cadena IN (${cadenas.map((_, i) => `$${start + 1 + i}`).join(',')})`)
    }
    if (subcats.length) {
      const start = params.length
      subcats.forEach(v => params.push(v))
      conds.push(`subcategoria IN (${subcats.map((_, i) => `$${start + 1 + i}`).join(',')})`)
    }
    const where = conds.join(' AND ')

    const { rows: kpisR } = await pool.query(`
      WITH ult AS (
        SELECT MAX(fecha) AS f FROM inventario_unisuper WHERE pais='GT'
      ),
      snap AS (
        SELECT * FROM inventario_unisuper
        WHERE ${where} AND fecha = (SELECT f FROM ult)
      )
      SELECT
        (SELECT f::date FROM ult)                       AS fecha_snap,
        COALESCE(SUM(cantidad), 0)                       AS inv_und,
        COALESCE(SUM(valor_gtq), 0)                      AS inv_valor_gtq,
        COUNT(DISTINCT nombre_sucursal)                  AS tiendas,
        COUNT(DISTINCT codigo_sku)                       AS skus,
        COUNT(DISTINCT CASE WHEN cadena ILIKE '%CD%' THEN nombre_sucursal END) AS cedi_tiendas,
        COUNT(DISTINCT CASE WHEN cadena NOT ILIKE '%CD%' THEN nombre_sucursal END) AS pdv_tiendas
      FROM snap
    `, params)

    const k = kpisR[0] ?? {}
    const disponible = k.inv_und !== undefined && parseFloat(k.inv_und) > 0

    if (!disponible) {
      return NextResponse.json({ disponible: false })
    }

    // Detalle por SKU × tienda (top 3000)
    const { rows: detR } = await pool.query(`
      WITH ult AS (SELECT MAX(fecha) AS f FROM inventario_unisuper WHERE pais='GT')
      SELECT
        i.codigo_sku          AS sku,
        i.codigo_barra        AS codigo_barras,
        i.descripcion_sku     AS descripcion,
        i.subcategoria,
        i.cadena,
        i.nombre_sucursal     AS punto_venta,
        SUM(i.cantidad)::float AS inv_und
      FROM inventario_unisuper i
      WHERE i.pais='GT' AND i.fecha = (SELECT f FROM ult)
        ${cadenas.length ? `AND i.cadena IN (${cadenas.map((_, i) => `$${i + 1}`).join(',')})` : ''}
      GROUP BY i.codigo_sku, i.codigo_barra, i.descripcion_sku, i.subcategoria, i.cadena, i.nombre_sucursal
      ORDER BY inv_und DESC
      LIMIT 3000
    `, cadenas.length ? cadenas : [])

    return NextResponse.json({
      disponible: true,
      pais: 'GT',
      kpis: {
        fecha_tiendas:    k.fecha_snap ?? null,
        fecha_cedi:       k.fecha_snap ?? null,
        pdv_inv:          parseFloat(k.inv_und ?? '0'),
        pdv_valor:        parseFloat(k.inv_valor_gtq ?? '0'),
        pdv_tiendas_dist: parseInt(k.pdv_tiendas ?? '0'),
        cedi_unidades:    0,
        cedi_valor:       0,
        cedi_skus:        parseInt(k.cedi_tiendas ?? '0'),
        skus_total:       parseInt(k.skus ?? '0'),
      },
      cedi_rows: [],  // Unisuper no separa CEDI en tabla propia
      rows: detR.map((r: any) => ({
        sku:           r.sku,
        codigo_barras: r.codigo_barras,
        descripcion:   r.descripcion,
        subcategoria:  r.subcategoria,
        cadena:        r.cadena,
        punto_venta:   r.punto_venta,
        inv_mano:      parseFloat(r.inv_und ?? '0'),
      })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
