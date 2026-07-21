import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 1800

/**
 * Calidad de Inventario Unisuper GT — agregado del último snapshot.
 * Devuelve conteo de PDVs por bucket de salud (CRÍTICO / ATENCIÓN /
 * SALUDABLE / COBERTURA ALTA / SOBRESTOCK / SIN VPD) para cada SKU top.
 *
 * Query params: cadenas (CSV), subcategorias (CSV)
 */
function csv(sp: URLSearchParams, key: string): string[] {
  const v = sp.get(key)
  return v ? v.split(',').map(s => s.trim()).filter(Boolean) : []
}

export async function GET(req: NextRequest) {
  try {
    const sp        = req.nextUrl.searchParams
    const cadenas   = csv(sp, 'cadenas')
    const subcats   = csv(sp, 'subcategorias')

    const params: unknown[] = []
    const conds: string[] = [`i.pais = 'GT'`]

    if (cadenas.length) {
      const start = params.length
      cadenas.forEach(v => params.push(v))
      conds.push(`i.cadena IN (${cadenas.map((_, i) => `$${start + 1 + i}`).join(',')})`)
    }
    if (subcats.length) {
      const start = params.length
      subcats.forEach(v => params.push(v))
      conds.push(`i.subcategoria IN (${subcats.map((_, i) => `$${start + 1 + i}`).join(',')})`)
    }
    const where = conds.join(' AND ')

    // 1) KPIs de calidad agregados
    const kpiR = await pool.query(`
      WITH ult AS (SELECT MAX(fecha) AS f FROM inventario_unisuper WHERE pais='GT'),
      vel AS (
        SELECT sku,
          ROUND((SUM(ventas_unidades) / 90.0)::numeric, 4) AS venta_dia
        FROM fact_ventas_unisuper
        WHERE pais='GT' AND fecha >= CURRENT_DATE - INTERVAL '90 day' AND ventas_unidades > 0
        GROUP BY sku
      ),
      sku_pdv AS (
        SELECT
          i.codigo_sku AS sku,
          i.nombre_sucursal,
          SUM(i.cantidad)::float AS inv,
          COALESCE(MAX(v.venta_dia), 0)::float AS vd
        FROM inventario_unisuper i
        LEFT JOIN vel v ON v.sku = i.codigo_sku
        WHERE ${where} AND i.fecha = (SELECT f FROM ult)
        GROUP BY i.codigo_sku, i.nombre_sucursal
      )
      SELECT
        COUNT(*)                                                        AS total_registros,
        COUNT(DISTINCT sku)                                             AS skus_total,
        COUNT(DISTINCT nombre_sucursal)                                 AS tiendas_total,
        SUM(CASE WHEN vd = 0                            THEN 1 ELSE 0 END) AS sin_vpd,
        SUM(CASE WHEN vd > 0 AND inv/vd <= 7             THEN 1 ELSE 0 END) AS critico,
        SUM(CASE WHEN vd > 0 AND inv/vd > 7 AND inv/vd <= 14  THEN 1 ELSE 0 END) AS atencion,
        SUM(CASE WHEN vd > 0 AND inv/vd > 14 AND inv/vd <= 60 THEN 1 ELSE 0 END) AS saludable,
        SUM(CASE WHEN vd > 0 AND inv/vd > 60 AND inv/vd <= 120 THEN 1 ELSE 0 END) AS cobertura_alta,
        SUM(CASE WHEN vd > 0 AND inv/vd > 120            THEN 1 ELSE 0 END) AS sobrestock
      FROM sku_pdv
    `, params)

    // 2) Distribución por SKU: cuántos PDVs de cada categoría de salud
    const skuR = await pool.query(`
      WITH ult AS (SELECT MAX(fecha) AS f FROM inventario_unisuper WHERE pais='GT'),
      vel AS (
        SELECT sku,
          ROUND((SUM(ventas_unidades) / 90.0)::numeric, 4) AS venta_dia
        FROM fact_ventas_unisuper
        WHERE pais='GT' AND fecha >= CURRENT_DATE - INTERVAL '90 day' AND ventas_unidades > 0
        GROUP BY sku
      ),
      sku_pdv AS (
        SELECT
          i.codigo_sku AS sku,
          MAX(i.descripcion_sku) AS descripcion,
          MAX(i.subcategoria) AS subcategoria,
          i.nombre_sucursal,
          SUM(i.cantidad)::float AS inv,
          COALESCE(MAX(v.venta_dia), 0)::float AS vd
        FROM inventario_unisuper i
        LEFT JOIN vel v ON v.sku = i.codigo_sku
        WHERE ${where} AND i.fecha = (SELECT f FROM ult)
        GROUP BY i.codigo_sku, i.nombre_sucursal
      )
      SELECT sku,
        MAX(descripcion) AS descripcion,
        MAX(subcategoria) AS subcategoria,
        COUNT(*) AS total_pdvs,
        SUM(CASE WHEN vd = 0                          THEN 1 ELSE 0 END) AS sin_vpd,
        SUM(CASE WHEN vd > 0 AND inv/vd <= 7           THEN 1 ELSE 0 END) AS critico,
        SUM(CASE WHEN vd > 0 AND inv/vd > 7 AND inv/vd <= 14 THEN 1 ELSE 0 END) AS atencion,
        SUM(CASE WHEN vd > 0 AND inv/vd > 14 AND inv/vd <= 60 THEN 1 ELSE 0 END) AS saludable,
        SUM(CASE WHEN vd > 0 AND inv/vd > 60 AND inv/vd <= 120 THEN 1 ELSE 0 END) AS cobertura_alta,
        SUM(CASE WHEN vd > 0 AND inv/vd > 120          THEN 1 ELSE 0 END) AS sobrestock,
        ROUND(SUM(inv)::numeric, 0) AS inv_total
      FROM sku_pdv
      GROUP BY sku
      ORDER BY inv_total DESC
      LIMIT 50
    `, params)

    // Fecha snapshot
    const fR = await pool.query(`SELECT MAX(fecha)::date f FROM inventario_unisuper WHERE pais='GT'`)

    return NextResponse.json({
      fecha_snap: fR.rows[0]?.f ?? null,
      kpis: {
        total_registros: parseInt(kpiR.rows[0]?.total_registros ?? '0'),
        skus_total:      parseInt(kpiR.rows[0]?.skus_total ?? '0'),
        tiendas_total:   parseInt(kpiR.rows[0]?.tiendas_total ?? '0'),
        sin_vpd:         parseInt(kpiR.rows[0]?.sin_vpd ?? '0'),
        critico:         parseInt(kpiR.rows[0]?.critico ?? '0'),
        atencion:        parseInt(kpiR.rows[0]?.atencion ?? '0'),
        saludable:       parseInt(kpiR.rows[0]?.saludable ?? '0'),
        cobertura_alta:  parseInt(kpiR.rows[0]?.cobertura_alta ?? '0'),
        sobrestock:      parseInt(kpiR.rows[0]?.sobrestock ?? '0'),
      },
      por_sku: skuR.rows.map((r: any) => ({
        sku:             r.sku,
        descripcion:     r.descripcion,
        subcategoria:    r.subcategoria,
        total_pdvs:      parseInt(r.total_pdvs ?? '0'),
        sin_vpd:         parseInt(r.sin_vpd ?? '0'),
        critico:         parseInt(r.critico ?? '0'),
        atencion:        parseInt(r.atencion ?? '0'),
        saludable:       parseInt(r.saludable ?? '0'),
        cobertura_alta:  parseInt(r.cobertura_alta ?? '0'),
        sobrestock:      parseInt(r.sobrestock ?? '0'),
        inv_total:       parseFloat(r.inv_total ?? '0'),
      })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
