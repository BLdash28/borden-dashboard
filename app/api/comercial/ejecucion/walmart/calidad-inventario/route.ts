import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'
import { parseWalmartFilters, buildWalmartWhere } from '@/lib/api/walmart-filtros'

export const revalidate = 300

/**
 * Calidad de Inventario · Walmart (multi-país)
 *
 * Replica el reporte "CALIDAD INVENTARIO BORDEN" adaptado a Walmart CA. Por
 * cada SKU:
 *   - # PDVs con stock < 3
 *   - # PDVs con stock entre 3 y 10 (inclusive)
 *   - # PDVs con stock > 10
 *   - Total de PDVs con presencia (con stock > 0)
 *   - Cobertura % = presencia / universo total de PDVs (todos los que aparecen
 *     en el snapshot con algún registro de inventario)
 *
 * Fuente: fact_inventario_walmart_pdv (columna cuantitativa = inv_mano).
 * NB: la tabla NO tiene subcategoria ni formato — se omiten ambos filtros para
 * la parte inventario (el filtro global sí acepta ambos, pero acá se ignoran).
 *
 * Nota: valor_cop y valor_usd se devuelven en 0 porque el inventario Walmart
 * no lleva costos. Se mantienen en el shape por compatibilidad con el
 * componente Calidad que se comparte con Éxito.
 */
export async function GET(req: NextRequest) {
  try {
    const pais = req.nextUrl.searchParams.get('pais') ?? 'CR'
    const f    = parseWalmartFilters(req)

    // Universo: usa todos los filtros dimensionales EXCEPTO sku (así al filtrar
    // por un SKU específico, el universo sigue siendo el total de PDVs).
    const wUni = buildWalmartWhere(
      { ...f, skus: [] },
      { startAt: 2, omit: ['subcategoria', 'formato'] },
    )
    // Aggregación por SKU: aplica todos los filtros.
    const wSku = buildWalmartWhere(f, { startAt: 2, omit: ['subcategoria', 'formato'] })
    // Distribución por cadena (para chip / referencia): sin filtrar por cadena
    // así vemos todas.
    const wCad = buildWalmartWhere(
      { ...f, cadenas: [], skus: [] },
      { startAt: 2, omit: ['subcategoria', 'formato'] },
    )

    const [snapR, universoR, pdvsConStockR, skuR, cadenaR] = await Promise.all([
      // Fecha del snapshot más reciente
      pool.query(
        `SELECT MAX(fecha)::text AS fecha
         FROM fact_inventario_walmart_pdv
         WHERE pais = $1`,
        [pais],
      ),

      // Universo de PDVs (cualquier registro en la fecha máxima)
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

      // PDVs con al menos un SKU con stock (>0)
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

      // Matriz por SKU (usa dim_producto como fallback para descripcion/categoria)
      pool.query(
        `WITH ult AS (
           SELECT MAX(fecha) AS f FROM fact_inventario_walmart_pdv WHERE pais = $1
         )
         SELECT
           COALESCE(t.sku, t.codigo_barras)                                        AS sku,
           COALESCE(MAX(NULLIF(t.descripcion,'')), MAX(NULLIF(dp.descripcion,''))) AS descripcion,
           COALESCE(MAX(NULLIF(t.categoria,''))  , MAX(NULLIF(dp.categoria,'')))   AS categoria,
           COUNT(DISTINCT CASE WHEN inv_mano > 0 AND inv_mano < 3   THEN punto_venta END) AS menos_de_3,
           COUNT(DISTINCT CASE WHEN inv_mano >= 3 AND inv_mano <= 10 THEN punto_venta END) AS entre_3_y_10,
           COUNT(DISTINCT CASE WHEN inv_mano > 10                    THEN punto_venta END) AS mayor_a_10,
           COUNT(DISTINCT CASE WHEN inv_mano > 0                     THEN punto_venta END) AS total_pdvs,
           SUM(inv_mano)                                                              AS unidades
         FROM fact_inventario_walmart_pdv t
         LEFT JOIN dim_producto dp
           ON dp.sku = t.sku
           OR dp.codigo_barras = t.codigo_barras
         WHERE t.pais = $1
           AND t.fecha = (SELECT f FROM ult)
           AND ${wSku.where}
         GROUP BY COALESCE(t.sku, t.codigo_barras)
         HAVING COUNT(DISTINCT CASE WHEN inv_mano > 0 THEN punto_venta END) > 0
         ORDER BY total_pdvs DESC`,
        [pais, ...wSku.params],
      ),

      // Distribución por cadena (para referencia)
      pool.query(
        `WITH ult AS (
           SELECT MAX(fecha) AS f FROM fact_inventario_walmart_pdv WHERE pais = $1
         )
         SELECT cadena, COUNT(DISTINCT punto_venta) AS pdvs
         FROM fact_inventario_walmart_pdv
         WHERE pais = $1
           AND fecha = (SELECT f FROM ult)
           AND cadena IS NOT NULL AND cadena <> ''
           AND ${wCad.where}
         GROUP BY cadena
         ORDER BY pdvs DESC`,
        [pais, ...wCad.params],
      ),
    ])

    const fecha        = snapR.rows[0]?.fecha ?? null
    const universo     = parseInt(universoR.rows[0]?.pdvs ?? '0')
    const pdvsConStock = parseInt(pdvsConStockR.rows[0]?.pdvs ?? '0')

    const rows = skuR.rows.map(r => {
      const menos = parseInt(r.menos_de_3   ?? '0')
      const entre = parseInt(r.entre_3_y_10 ?? '0')
      const mayor = parseInt(r.mayor_a_10   ?? '0')
      const total = parseInt(r.total_pdvs   ?? '0')
      return {
        sku:          r.sku,
        descripcion:  r.descripcion,
        categoria:    r.categoria,
        subcategoria: null as string | null,
        menos_de_3:   menos,
        entre_3_y_10: entre,
        mayor_a_10:   mayor,
        total_pdvs:   total,
        pct_menos_de_3:   total > 0 ? (menos / total) * 100 : 0,
        pct_entre_3_y_10: total > 0 ? (entre / total) * 100 : 0,
        pct_mayor_a_10:   total > 0 ? (mayor / total) * 100 : 0,
        cobertura_pct:    universo > 0 ? (total / universo) * 100 : 0,
        unidades:  parseFloat(r.unidades ?? '0'),
        valor_cop: 0,
        valor_usd: 0,
      }
    })

    // Totales
    const t = rows.reduce((acc, r) => ({
      menos_de_3:   acc.menos_de_3   + r.menos_de_3,
      entre_3_y_10: acc.entre_3_y_10 + r.entre_3_y_10,
      mayor_a_10:   acc.mayor_a_10   + r.mayor_a_10,
      total_pdvs:   acc.total_pdvs   + r.total_pdvs,
      unidades:     acc.unidades     + r.unidades,
      valor_cop:    0,
      valor_usd:    0,
    }), { menos_de_3: 0, entre_3_y_10: 0, mayor_a_10: 0, total_pdvs: 0, unidades: 0, valor_cop: 0, valor_usd: 0 })

    return NextResponse.json({
      fecha,
      universo_pdvs:      universo,
      pdvs_con_stock:     pdvsConStock,
      cobertura_efectiva: universo > 0 ? (pdvsConStock / universo) * 100 : 0,
      rows,
      total: {
        ...t,
        pct_menos_de_3:   t.total_pdvs > 0 ? (t.menos_de_3   / t.total_pdvs) * 100 : 0,
        pct_entre_3_y_10: t.total_pdvs > 0 ? (t.entre_3_y_10 / t.total_pdvs) * 100 : 0,
        pct_mayor_a_10:   t.total_pdvs > 0 ? (t.mayor_a_10   / t.total_pdvs) * 100 : 0,
        cobertura_pct:    universo > 0 ? (pdvsConStock / universo) * 100 : 0,
      },
      cadenas: cadenaR.rows.map(r => ({
        cadena: r.cadena,
        pdvs:   parseInt(r.pdvs ?? '0'),
      })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
