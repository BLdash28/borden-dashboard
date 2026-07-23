import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

/**
 * Análisis Surtido × Ventas × Inventario Unisuper GT.
 *
 * `surtido_unisuper` guarda el catálogo oficial de Unibi: qué SKU tiene
 * asignado cada PDV con su estado (ACTIVO / LIQUIDACION / etc.). El cruce
 * con `fact_ventas_unisuper` últimos 90d indica qué % del surtido asignado
 * realmente se está moviendo — sirve para detectar SKUs asignados pero sin
 * ventas (quiebre potencial o problema de reabasto).
 *
 * Devuelve:
 *   kpis            → totales y % cumplimiento global
 *   por_sku         → cada SKU con PDVs asignados / vendidos / sin venta
 *   por_pdv         → cada PDV con SKUs asignados / vendidos / cumplimiento
 *   estado_dist     → distribución por estado (ACTIVO / LIQUIDACION / …)
 */
function csv(sp: URLSearchParams, k: string): string[] {
  const v = sp.get(k)
  return v ? v.split(',').map(s => s.trim()).filter(Boolean) : []
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const cadenas = csv(sp, 'cadenas')
    const subcats = csv(sp, 'subcategorias')

    const params: unknown[] = []
    const conds: string[] = [`s.pais = 'GT'`, `s.surtido = 1`, `s.sku_borden IS NOT NULL`]
    if (cadenas.length) {
      const start = params.length
      cadenas.forEach(v => params.push(v))
      conds.push(`s.cadena IN (${cadenas.map((_, i) => `$${start + 1 + i}`).join(',')})`)
    }
    if (subcats.length) {
      const start = params.length
      subcats.forEach(v => params.push(v))
      conds.push(`s.subcategoria IN (${subcats.map((_, i) => `$${start + 1 + i}`).join(',')})`)
    }
    const where = conds.join(' AND ')

    // KPIs generales — solo el snapshot más reciente
    const kpisR = await pool.query(`
      WITH snap AS (
        SELECT MAX(snapshot_fecha) AS f FROM surtido_unisuper WHERE pais='GT'
      ),
      base AS (
        SELECT s.sku_borden, s.nombre_sucursal, s.estado_sku
        FROM surtido_unisuper s, snap
        WHERE ${where} AND s.snapshot_fecha = snap.f
      ),
      ventas90 AS (
        SELECT DISTINCT sku, nombre_sucursal
        FROM fact_ventas_unisuper
        WHERE pais='GT'
          AND fecha >= CURRENT_DATE - INTERVAL '90 day'
          AND ventas_unidades > 0
      )
      SELECT
        (SELECT f::text FROM snap) AS snapshot_fecha,
        COUNT(*) AS asignados,
        COUNT(DISTINCT b.sku_borden) AS skus_asignados,
        COUNT(DISTINCT b.nombre_sucursal) AS pdvs_asignados,
        COUNT(*) FILTER (WHERE b.estado_sku ILIKE '%LIQUIDACION%') AS en_liquidacion,
        SUM(CASE WHEN v.sku IS NOT NULL THEN 1 ELSE 0 END) AS con_venta_90d,
        SUM(CASE WHEN v.sku IS NULL THEN 1 ELSE 0 END) AS sin_venta_90d
      FROM base b
      LEFT JOIN ventas90 v ON v.sku = b.sku_borden AND v.nombre_sucursal = b.nombre_sucursal
    `, params)
    const k = kpisR.rows[0] ?? {}
    const asignados = parseInt(k.asignados ?? '0')
    const conVenta = parseInt(k.con_venta_90d ?? '0')
    const cumplimientoPct = asignados > 0 ? (conVenta / asignados) * 100 : 0

    // Por SKU
    const porSkuR = await pool.query(`
      WITH snap AS (SELECT MAX(snapshot_fecha) AS f FROM surtido_unisuper WHERE pais='GT'),
      base AS (
        SELECT s.sku_borden AS sku,
               MAX(s.descripcion) AS descripcion,
               MAX(s.categoria) AS categoria,
               MAX(s.subcategoria) AS subcategoria,
               COUNT(DISTINCT s.nombre_sucursal) AS pdvs_asignados,
               SUM(CASE WHEN s.estado_sku ILIKE '%LIQUIDACION%' THEN 1 ELSE 0 END) AS en_liquidacion,
               ARRAY_AGG(DISTINCT s.nombre_sucursal) AS pdvs_lista
        FROM surtido_unisuper s, snap
        WHERE ${where} AND s.snapshot_fecha = snap.f
        GROUP BY s.sku_borden
      ),
      ventas90 AS (
        SELECT sku, COUNT(DISTINCT nombre_sucursal) AS pdvs_vendieron,
               SUM(ventas_unidades)::int AS uds_90d,
               ROUND(SUM(ventas_valor)::numeric, 2) AS valor_90d
        FROM fact_ventas_unisuper
        WHERE pais='GT' AND fecha >= CURRENT_DATE - INTERVAL '90 day' AND ventas_unidades > 0
        GROUP BY sku
      )
      SELECT
        b.sku, b.descripcion, b.subcategoria,
        b.pdvs_asignados,
        COALESCE(v.pdvs_vendieron, 0) AS pdvs_con_venta,
        b.pdvs_asignados - COALESCE(v.pdvs_vendieron, 0) AS pdvs_sin_venta,
        ROUND((COALESCE(v.pdvs_vendieron, 0)::numeric / NULLIF(b.pdvs_asignados, 0) * 100), 1) AS cumplimiento_pct,
        COALESCE(v.uds_90d, 0) AS uds_90d,
        COALESCE(v.valor_90d, 0) AS valor_90d,
        b.en_liquidacion
      FROM base b
      LEFT JOIN ventas90 v ON v.sku = b.sku
      ORDER BY cumplimiento_pct ASC NULLS LAST, b.pdvs_asignados DESC
    `, params)

    // Por PDV
    const porPdvR = await pool.query(`
      WITH snap AS (SELECT MAX(snapshot_fecha) AS f FROM surtido_unisuper WHERE pais='GT'),
      base AS (
        SELECT s.nombre_sucursal,
               MAX(s.cadena) AS cadena,
               COUNT(DISTINCT s.sku_borden) AS skus_asignados
        FROM surtido_unisuper s, snap
        WHERE ${where} AND s.snapshot_fecha = snap.f
        GROUP BY s.nombre_sucursal
      ),
      ventas90 AS (
        SELECT nombre_sucursal, COUNT(DISTINCT sku) AS skus_vendidos
        FROM fact_ventas_unisuper
        WHERE pais='GT' AND fecha >= CURRENT_DATE - INTERVAL '90 day' AND ventas_unidades > 0
        GROUP BY nombre_sucursal
      )
      SELECT b.nombre_sucursal, b.cadena, b.skus_asignados,
             COALESCE(v.skus_vendidos, 0) AS skus_con_venta,
             b.skus_asignados - COALESCE(v.skus_vendidos, 0) AS skus_sin_venta,
             ROUND((COALESCE(v.skus_vendidos, 0)::numeric / NULLIF(b.skus_asignados, 0) * 100), 1) AS cumplimiento_pct
      FROM base b
      LEFT JOIN ventas90 v ON v.nombre_sucursal = b.nombre_sucursal
      ORDER BY cumplimiento_pct ASC NULLS LAST, b.skus_asignados DESC
    `, params)

    // Distribución por estado_sku
    const estadoR = await pool.query(`
      WITH snap AS (SELECT MAX(snapshot_fecha) AS f FROM surtido_unisuper WHERE pais='GT')
      SELECT COALESCE(NULLIF(s.estado_sku, ''), 'SIN ESTADO') AS estado,
             COUNT(*) AS filas
      FROM surtido_unisuper s, snap
      WHERE ${where} AND s.snapshot_fecha = snap.f
      GROUP BY 1 ORDER BY 2 DESC
    `, params)

    return NextResponse.json({
      pais: 'GT',
      snapshot_fecha: k.snapshot_fecha ?? null,
      kpis: {
        asignados,
        skus_asignados:   parseInt(k.skus_asignados ?? '0'),
        pdvs_asignados:   parseInt(k.pdvs_asignados ?? '0'),
        en_liquidacion:   parseInt(k.en_liquidacion ?? '0'),
        con_venta_90d:    conVenta,
        sin_venta_90d:    parseInt(k.sin_venta_90d ?? '0'),
        cumplimiento_pct: parseFloat(cumplimientoPct.toFixed(1)),
      },
      por_sku: porSkuR.rows.map((r: any) => ({
        sku:              r.sku,
        descripcion:      r.descripcion,
        subcategoria:     r.subcategoria,
        pdvs_asignados:   parseInt(r.pdvs_asignados ?? '0'),
        pdvs_con_venta:   parseInt(r.pdvs_con_venta ?? '0'),
        pdvs_sin_venta:   parseInt(r.pdvs_sin_venta ?? '0'),
        cumplimiento_pct: parseFloat(r.cumplimiento_pct ?? '0'),
        uds_90d:          parseInt(r.uds_90d ?? '0'),
        valor_90d:        parseFloat(r.valor_90d ?? '0'),
        en_liquidacion:   parseInt(r.en_liquidacion ?? '0'),
      })),
      por_pdv: porPdvR.rows.map((r: any) => ({
        nombre_sucursal:  r.nombre_sucursal,
        cadena:           r.cadena,
        skus_asignados:   parseInt(r.skus_asignados ?? '0'),
        skus_con_venta:   parseInt(r.skus_con_venta ?? '0'),
        skus_sin_venta:   parseInt(r.skus_sin_venta ?? '0'),
        cumplimiento_pct: parseFloat(r.cumplimiento_pct ?? '0'),
      })),
      estado_dist: estadoR.rows.map((r: any) => ({
        estado: r.estado,
        filas:  parseInt(r.filas ?? '0'),
      })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
