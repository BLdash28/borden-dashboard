import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'
import { parseWalmartFilters, buildWalmartWhere } from '@/lib/api/walmart-filtros'

export const revalidate = 300

/**
 * Cobertura Walmart (multi-país) — replica el patrón de Éxito adaptado a
 * `fact_inventario_walmart_pdv` (columna `inv_mano`).
 *
 * KPIs:
 *   - universo_pdvs: total de PDVs con presencia (cualquier registro en el snap)
 *   - pdvs_con_stock: PDVs con al menos un SKU con `inv_mano > 0`
 *   - cobertura_efectiva: pdvs_con_stock / universo * 100
 *   - skus_activos: SKUs distintos con stock > 0
 *
 * Detalles:
 *   - por_cadena: PDVs totales/con stock por cadena + cobertura %
 *   - por_sku:    matriz de # PDVs por bucket de stock (<3, 3-10, >10) por SKU
 *
 * NB: fact_inventario_walmart_pdv NO tiene subcategoría/formato — se omiten
 * ambos filtros. El filtro por cadena SÍ aplica.
 */
export async function GET(req: NextRequest) {
  try {
    const pais = req.nextUrl.searchParams.get('pais') ?? 'CR'
    const f    = parseWalmartFilters(req)

    // KPIs globales (respeta todos los filtros aplicables)
    const wG   = buildWalmartWhere(f, { startAt: 2, omit: ['subcategoria', 'formato'] })
    // Universo por cadena: NO filtrar por cadena así vemos todas
    const wCad = buildWalmartWhere(
      { ...f, cadenas: [], skus: [] },
      { startAt: 2, omit: ['subcategoria', 'formato'] },
    )
    // Universo global (para cobertura % del SKU): sin filtro de SKU
    const wUni = buildWalmartWhere(
      { ...f, skus: [] },
      { startAt: 2, omit: ['subcategoria', 'formato'] },
    )

    const [snapR, universoR, pdvsConStockR, skusActR, cadenaR, skuR] = await Promise.all([
      // Fecha snapshot
      pool.query(
        `SELECT MAX(fecha)::text AS fecha
         FROM fact_inventario_walmart_pdv
         WHERE pais = $1`,
        [pais],
      ),

      // Universo total de PDVs
      pool.query(
        `WITH ult AS (
           SELECT MAX(fecha) AS f FROM fact_inventario_walmart_pdv WHERE pais = $1
         )
         SELECT COUNT(DISTINCT punto_venta) AS pdvs
         FROM fact_inventario_walmart_pdv
         WHERE pais = $1
           AND fecha = (SELECT f FROM ult)
           AND ${wUni.where}`,
        [pais, ...wUni.params],
      ),

      // PDVs con stock > 0
      pool.query(
        `WITH ult AS (
           SELECT MAX(fecha) AS f FROM fact_inventario_walmart_pdv WHERE pais = $1
         )
         SELECT COUNT(DISTINCT punto_venta) AS pdvs
         FROM fact_inventario_walmart_pdv
         WHERE pais = $1
           AND fecha = (SELECT f FROM ult)
           AND inv_mano > 0
           AND ${wUni.where}`,
        [pais, ...wUni.params],
      ),

      // SKUs activos (con stock > 0)
      pool.query(
        `WITH ult AS (
           SELECT MAX(fecha) AS f FROM fact_inventario_walmart_pdv WHERE pais = $1
         )
         SELECT COUNT(DISTINCT COALESCE(sku, codigo_barras)) AS n
         FROM fact_inventario_walmart_pdv
         WHERE pais = $1
           AND fecha = (SELECT f FROM ult)
           AND inv_mano > 0
           AND ${wG.where}`,
        [pais, ...wG.params],
      ),

      // Por cadena — todos los PDVs y los con stock
      pool.query(
        `WITH ult AS (
           SELECT MAX(fecha) AS f FROM fact_inventario_walmart_pdv WHERE pais = $1
         )
         SELECT
           cadena,
           COUNT(DISTINCT punto_venta)                                             AS pdvs_total,
           COUNT(DISTINCT punto_venta) FILTER (WHERE inv_mano > 0)                 AS pdvs_con_stock,
           COUNT(DISTINCT COALESCE(sku, codigo_barras)) FILTER (WHERE inv_mano > 0) AS skus,
           SUM(inv_mano) FILTER (WHERE inv_mano > 0)                               AS uds
         FROM fact_inventario_walmart_pdv
         WHERE pais = $1
           AND fecha = (SELECT f FROM ult)
           AND cadena IS NOT NULL AND cadena <> ''
           AND ${wCad.where}
         GROUP BY cadena
         ORDER BY pdvs_total DESC`,
        [pais, ...wCad.params],
      ),

      // Por SKU — matriz de stock buckets
      pool.query(
        `WITH ult AS (
           SELECT MAX(fecha) AS f FROM fact_inventario_walmart_pdv WHERE pais = $1
         )
         SELECT
           COALESCE(t.sku, t.codigo_barras)                                        AS sku,
           COALESCE(MAX(NULLIF(t.descripcion,'')), MAX(NULLIF(dp.descripcion,''))) AS descripcion,
           COALESCE(MAX(NULLIF(t.categoria,''))  , MAX(NULLIF(dp.categoria,'')))   AS categoria,
           COUNT(DISTINCT CASE WHEN inv_mano > 0 AND inv_mano < 3    THEN punto_venta END) AS menos_de_3,
           COUNT(DISTINCT CASE WHEN inv_mano >= 3 AND inv_mano <= 10 THEN punto_venta END) AS entre_3_y_10,
           COUNT(DISTINCT CASE WHEN inv_mano > 10                    THEN punto_venta END) AS mayor_a_10,
           COUNT(DISTINCT CASE WHEN inv_mano > 0                     THEN punto_venta END) AS total_pdvs,
           SUM(inv_mano)                                                                    AS unidades
         FROM fact_inventario_walmart_pdv t
         LEFT JOIN dim_producto dp
           ON dp.sku = t.sku
           OR dp.codigo_barras = t.codigo_barras
         WHERE t.pais = $1
           AND t.fecha = (SELECT f FROM ult)
           AND ${wG.where}
         GROUP BY COALESCE(t.sku, t.codigo_barras)
         HAVING COUNT(DISTINCT CASE WHEN inv_mano > 0 THEN punto_venta END) > 0
         ORDER BY total_pdvs DESC
         LIMIT 200`,
        [pais, ...wG.params],
      ),
    ])

    const fecha        = snapR.rows[0]?.fecha ?? null
    const universo     = parseInt(universoR.rows[0]?.pdvs ?? '0')
    const pdvsConStock = parseInt(pdvsConStockR.rows[0]?.pdvs ?? '0')
    const skusActivos  = parseInt(skusActR.rows[0]?.n ?? '0')

    const porCadena = (cadenaR.rows as any[]).map(r => {
      const tot = parseInt(r.pdvs_total     ?? '0')
      const con = parseInt(r.pdvs_con_stock ?? '0')
      return {
        cadena:         r.cadena ?? '',
        pdvs_total:     tot,
        pdvs_con_stock: con,
        cobertura_pct:  tot > 0 ? (con / tot) * 100 : 0,
        skus:           parseInt(r.skus ?? '0'),
        uds:            parseFloat(r.uds ?? '0'),
      }
    })

    const porSku = (skuR.rows as any[]).map(r => {
      const menos = parseInt(r.menos_de_3   ?? '0')
      const entre = parseInt(r.entre_3_y_10 ?? '0')
      const mayor = parseInt(r.mayor_a_10   ?? '0')
      const total = parseInt(r.total_pdvs   ?? '0')
      return {
        sku:              r.sku,
        descripcion:      r.descripcion,
        categoria:        r.categoria,
        menos_de_3:       menos,
        entre_3_y_10:     entre,
        mayor_a_10:       mayor,
        total_pdvs:       total,
        pct_menos_de_3:   total > 0 ? (menos / total) * 100 : 0,
        pct_entre_3_y_10: total > 0 ? (entre / total) * 100 : 0,
        pct_mayor_a_10:   total > 0 ? (mayor / total) * 100 : 0,
        cobertura_pct:    universo > 0 ? (total / universo) * 100 : 0,
        unidades:         parseFloat(r.unidades ?? '0'),
      }
    })

    return NextResponse.json({
      fecha,
      universo_pdvs:      universo,
      pdvs_con_stock:     pdvsConStock,
      cobertura_efectiva: universo > 0 ? (pdvsConStock / universo) * 100 : 0,
      skus_activos:       skusActivos,
      por_cadena:         porCadena,
      por_sku:            porSku,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
