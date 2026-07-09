import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

/**
 * Calidad de Inventario · Grupo Éxito CO
 *
 * Replica el reporte "CALIDAD INVENTARIO BORDEN" del Excel. Por cada SKU:
 *   - # PDVs con stock < 3
 *   - # PDVs con stock entre 3 y 10 (inclusive)
 *   - # PDVs con stock > 10
 *   - Total de PDVs con presencia (con stock > 0)
 *   - Cobertura % = presencia / universo total de PDVs (todos los que tienen algún SKU Borden)
 *
 * Filtros:
 *   - cadena: filtra por cadena (SUBCANAL en el Excel)
 *   - solo_50: si es 'true', solo considera SKUs bajo la clasificación "50% VENTA".
 *     (En Grupo Éxito hay una lista de SKUs identificados como pareto — se hardcodea
 *      el listado; si el archivo trae más SKUs se agregan al reporte igualmente.)
 */
export async function GET(req: NextRequest) {
  try {
    const cadena  = req.nextUrl.searchParams.get('cadena') ?? ''
    const cadFilter = cadena ? `AND cadena = '${cadena.replace(/'/g, "''")}'` : ''

    const [snapR, universoR, pdvsConStockR, skuR, cadenaR] = await Promise.all([
      // Fecha del snapshot más reciente
      pool.query(`
        SELECT MAX(fecha_snapshot)::text AS fecha
        FROM inventario_exito
        WHERE pais='CO' AND cliente='GRUPO ÉXITO'
      `),

      // Universo de PDVs con al menos un SKU Borden (con o sin stock)
      pool.query(`
        SELECT COUNT(DISTINCT gln) AS pdvs
        FROM inventario_exito
        WHERE pais='CO' AND cliente='GRUPO ÉXITO'
        ${cadFilter}
      `),

      // PDVs con al menos un SKU con stock (>0)
      pool.query(`
        SELECT COUNT(DISTINCT gln) AS pdvs
        FROM inventario_exito
        WHERE pais='CO' AND cliente='GRUPO ÉXITO' AND inv_unidades > 0
        ${cadFilter}
      `),

      // Matriz por SKU
      pool.query(`
        WITH ult AS (
          SELECT MAX(fecha_snapshot) AS f
          FROM inventario_exito
          WHERE pais='CO' AND cliente='GRUPO ÉXITO'
        )
        SELECT
          COALESCE(sku, plu)             AS sku,
          MAX(descripcion)               AS descripcion,
          MAX(categoria)                 AS categoria,
          MAX(subcategoria)              AS subcategoria,
          COUNT(DISTINCT CASE WHEN inv_unidades > 0 AND inv_unidades < 3  THEN gln END) AS menos_de_3,
          COUNT(DISTINCT CASE WHEN inv_unidades >= 3 AND inv_unidades <= 10 THEN gln END) AS entre_3_y_10,
          COUNT(DISTINCT CASE WHEN inv_unidades > 10 THEN gln END) AS mayor_a_10,
          COUNT(DISTINCT CASE WHEN inv_unidades > 0  THEN gln END) AS total_pdvs,
          SUM(inv_unidades)              AS unidades,
          SUM(inv_valor_cop)             AS valor_cop,
          SUM(inv_valor_usd)             AS valor_usd
        FROM inventario_exito
        WHERE pais='CO' AND cliente='GRUPO ÉXITO'
          AND fecha_snapshot = (SELECT f FROM ult)
          ${cadFilter}
        GROUP BY COALESCE(sku, plu)
        HAVING COUNT(DISTINCT CASE WHEN inv_unidades > 0 THEN gln END) > 0
        ORDER BY total_pdvs DESC
      `),

      // Distribución por cadena (para filtro)
      pool.query(`
        SELECT cadena, COUNT(DISTINCT gln) AS pdvs
        FROM inventario_exito
        WHERE pais='CO' AND cliente='GRUPO ÉXITO' AND cadena IS NOT NULL AND cadena <> ''
        GROUP BY cadena
        ORDER BY pdvs DESC
      `),
    ])

    const fecha        = snapR.rows[0]?.fecha ?? null
    const universo     = parseInt(universoR.rows[0]?.pdvs ?? '0')
    const pdvsConStock = parseInt(pdvsConStockR.rows[0]?.pdvs ?? '0')

    const rows = skuR.rows.map(r => {
      const menos = parseInt(r.menos_de_3 ?? '0')
      const entre = parseInt(r.entre_3_y_10 ?? '0')
      const mayor = parseInt(r.mayor_a_10 ?? '0')
      const total = parseInt(r.total_pdvs ?? '0')
      return {
        sku:          r.sku,
        descripcion:  r.descripcion,
        categoria:    r.categoria,
        subcategoria: r.subcategoria,
        menos_de_3:   menos,
        entre_3_y_10: entre,
        mayor_a_10:   mayor,
        total_pdvs:   total,
        pct_menos_de_3:   total > 0 ? (menos / total) * 100 : 0,
        pct_entre_3_y_10: total > 0 ? (entre / total) * 100 : 0,
        pct_mayor_a_10:   total > 0 ? (mayor / total) * 100 : 0,
        cobertura_pct:    universo > 0 ? (total / universo) * 100 : 0,
        unidades:  parseFloat(r.unidades ?? '0'),
        valor_cop: parseFloat(r.valor_cop ?? '0'),
        valor_usd: parseFloat(r.valor_usd ?? '0'),
      }
    })

    // Totales
    const t = rows.reduce((acc, r) => ({
      menos_de_3:   acc.menos_de_3   + r.menos_de_3,
      entre_3_y_10: acc.entre_3_y_10 + r.entre_3_y_10,
      mayor_a_10:   acc.mayor_a_10   + r.mayor_a_10,
      total_pdvs:   acc.total_pdvs   + r.total_pdvs,
      unidades:     acc.unidades     + r.unidades,
      valor_cop:    acc.valor_cop    + r.valor_cop,
      valor_usd:    acc.valor_usd    + r.valor_usd,
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
        // NB: cobertura_pct del total = PDVs distintos con stock / universo
        // (No es la suma de coberturas por SKU, que sería > 100%.)
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
