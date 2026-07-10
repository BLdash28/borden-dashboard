import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

/**
 * Inventario Grupo Éxito CO — snapshot más reciente por defecto.
 *
 * COBERTURA REAL:
 *   - Universo esperado = SKUs activos (dim_producto_co.es_activo) × PDVs con
 *     presencia Borden.
 *   - Con stock = combinaciones SKU × PDV que aparecen en inventario_exito con
 *     inv_unidades > 0.
 *   - Quiebres = combinaciones del universo esperado que NO tienen stock, ya
 *     sea porque no existe la fila (SKU nunca reportado en ese PDV) o porque
 *     existe con inv_unidades = 0.
 *
 * Devuelve KPIs, breakdown por cadena, top SKUs, detalle de quiebres e inv bajo.
 */
export async function GET(req: NextRequest) {
  try {
    const cadena = req.nextUrl.searchParams.get('cadena') ?? ''
    const fechaQ = req.nextUrl.searchParams.get('fecha')  ?? ''

    // Última fecha
    const ultR = await pool.query(
      `SELECT MAX(fecha_snapshot) AS f FROM inventario_exito WHERE pais='CO' AND cliente='GRUPO ÉXITO'`,
    )
    const fecha: string | null = fechaQ || (ultR.rows[0]?.f
      ? new Date(ultR.rows[0].f).toISOString().slice(0, 10)
      : null)
    if (!fecha) {
      return NextResponse.json({ fecha: null, kpi: null, por_cadena: [], top_skus: [], detalle: [] })
    }

    const cadFilter = cadena ? `AND cadena = '${cadena.replace(/'/g, "''")}'` : ''
    const cadFilterInv = cadena ? `AND i.cadena = '${cadena.replace(/'/g, "''")}'` : ''

    // Universo: PDVs activos (con presencia Borden en el snapshot) × SKUs activos
    const [univR, kpiInvR, cadenaAggR, skusR, quiebresR, invBajoR] = await Promise.all([
      pool.query(`
        WITH pdvs AS (
          SELECT DISTINCT gln, punto_venta, cadena, subcadena, departamento, ciudad
          FROM inventario_exito
          WHERE pais='CO' AND cliente='GRUPO ÉXITO' AND fecha_snapshot = $1::date
          ${cadFilter}
        ),
        skus AS (
          SELECT sku, ean13, plu, descripcion, categoria, subcategoria
          FROM dim_producto_co WHERE es_activo = true
        )
        SELECT
          (SELECT COUNT(*) FROM pdvs)                       AS n_pdvs,
          (SELECT COUNT(*) FROM skus)                       AS n_skus,
          (SELECT COUNT(*) FROM pdvs) * (SELECT COUNT(*) FROM skus)::bigint AS universo
      `, [fecha]),

      pool.query(`
        SELECT
          COUNT(*)                                 AS filas_reportadas,
          COUNT(*) FILTER (WHERE inv_unidades > 0) AS con_stock_filas,
          COUNT(*) FILTER (WHERE inv_unidades = 0) AS quiebres_reportados,
          COUNT(DISTINCT punto_venta)              AS pdvs,
          COUNT(DISTINCT COALESCE(sku, plu))       AS skus_unicos,
          COUNT(DISTINCT cadena)                   AS cadenas,
          ROUND(SUM(inv_unidades)::numeric, 0)     AS total_uds,
          ROUND(SUM(inv_valor_cop)::numeric, 0)    AS total_cop,
          ROUND(SUM(inv_valor_usd)::numeric, 2)    AS total_usd
        FROM inventario_exito
        WHERE pais='CO' AND cliente='GRUPO ÉXITO' AND fecha_snapshot = $1::date
        ${cadFilter}
      `, [fecha]),

      pool.query(`
        WITH pdvs AS (
          SELECT DISTINCT gln, cadena
          FROM inventario_exito
          WHERE pais='CO' AND cliente='GRUPO ÉXITO' AND fecha_snapshot = $1::date
          ${cadFilter}
        ),
        n_skus AS (SELECT COUNT(*)::int AS n FROM dim_producto_co WHERE es_activo = true)
        SELECT
          i.cadena,
          (SELECT n FROM n_skus) * COUNT(DISTINCT p.gln)   AS combinaciones,
          COUNT(*) FILTER (WHERE i.inv_unidades > 0)       AS con_stock,
          (SELECT n FROM n_skus) * COUNT(DISTINCT p.gln)
            - COUNT(*) FILTER (WHERE i.inv_unidades > 0)   AS quiebres,
          COUNT(DISTINCT i.punto_venta)                    AS pdvs,
          ROUND(SUM(i.inv_unidades)::numeric, 0)           AS uds,
          ROUND(SUM(i.inv_valor_cop)::numeric, 0)          AS cop,
          ROUND(SUM(i.inv_valor_usd)::numeric, 2)          AS usd
        FROM pdvs p
        LEFT JOIN inventario_exito i
          ON i.gln = p.gln
         AND i.fecha_snapshot = $1::date
         AND i.pais='CO' AND i.cliente='GRUPO ÉXITO'
        GROUP BY i.cadena
        ORDER BY cop DESC NULLS LAST
      `, [fecha]),

      pool.query(`
        WITH n_pdvs AS (
          SELECT COUNT(DISTINCT gln)::int AS n
          FROM inventario_exito
          WHERE pais='CO' AND cliente='GRUPO ÉXITO' AND fecha_snapshot = $1::date
          ${cadFilter}
        )
        SELECT
          d.sku,
          MAX(d.ean13)                          AS ean13,
          MAX(d.plu)                            AS plu,
          MAX(d.descripcion)                    AS descripcion,
          MAX(d.categoria)                      AS categoria,
          MAX(d.subcategoria)                   AS subcategoria,
          COUNT(DISTINCT i.punto_venta) FILTER (WHERE i.inv_unidades > 0) AS pdvs,
          -- Quiebres = universo (n_pdvs) - PDVs con stock del SKU
          (SELECT n FROM n_pdvs)
            - COUNT(DISTINCT i.punto_venta) FILTER (WHERE i.inv_unidades > 0) AS quiebres,
          ROUND(COALESCE(SUM(i.inv_unidades), 0)::numeric, 0)  AS uds,
          ROUND(COALESCE(SUM(i.inv_valor_cop), 0)::numeric, 0) AS cop
        FROM dim_producto_co d
        LEFT JOIN inventario_exito i
          ON (i.sku = d.sku OR i.ean13 = d.ean13)
         AND i.fecha_snapshot = $1::date
         AND i.pais='CO' AND i.cliente='GRUPO ÉXITO'
         ${cadFilterInv}
        WHERE d.es_activo = true
        GROUP BY d.sku
        ORDER BY cop DESC NULLS LAST
        LIMIT 20
      `, [fecha]),

      // Detalle de QUIEBRES — combinaciones SKU × PDV donde falta stock
      pool.query(`
        WITH pdvs AS (
          SELECT DISTINCT gln, punto_venta, cadena
          FROM inventario_exito
          WHERE pais='CO' AND cliente='GRUPO ÉXITO' AND fecha_snapshot = $1::date
          ${cadFilter}
        ),
        skus AS (
          SELECT sku, ean13, plu, descripcion
          FROM dim_producto_co WHERE es_activo = true
        ),
        expected AS (
          SELECT p.gln, p.punto_venta, p.cadena, s.sku, s.ean13, s.plu, s.descripcion
          FROM pdvs p CROSS JOIN skus s
        )
        SELECT e.punto_venta, e.cadena, e.sku, e.plu, e.ean13, e.descripcion,
               COALESCE(i.inv_unidades, 0) AS inv_unidades
        FROM expected e
        LEFT JOIN inventario_exito i
          ON i.gln = e.gln
         AND (i.sku = e.sku OR i.ean13 = e.ean13)
         AND i.fecha_snapshot = $1::date
         AND i.pais='CO' AND i.cliente='GRUPO ÉXITO'
        WHERE COALESCE(i.inv_unidades, 0) = 0
        ORDER BY e.cadena, e.punto_venta, e.sku
        LIMIT 500
      `, [fecha]),

      pool.query(`
        SELECT punto_venta, cadena, ean13, plu, sku, descripcion,
               inv_unidades, inv_valor_cop
        FROM inventario_exito
        WHERE pais='CO' AND cliente='GRUPO ÉXITO' AND fecha_snapshot = $1::date
          AND inv_unidades > 0 AND inv_unidades <= 3
        ${cadFilter}
        ORDER BY inv_unidades ASC, inv_valor_cop DESC NULLS LAST
        LIMIT 500
      `, [fecha]),
    ])

    const u        = univR.rows[0] ?? {}
    const nPdvs    = parseInt(u.n_pdvs    ?? '0')
    const nSkus    = parseInt(u.n_skus    ?? '0')
    const universo = parseInt(u.universo  ?? '0')

    const ki           = kpiInvR.rows[0] ?? {}
    const filasReport  = parseInt(ki.filas_reportadas ?? '0')
    const conStock     = parseInt(ki.con_stock_filas ?? '0')
    const quiebresTot  = Math.max(0, universo - conStock)

    return NextResponse.json({
      fecha,
      cadena_filter: cadena || null,
      kpi: {
        combinaciones: universo,          // Total esperado (SKUs activos × PDVs)
        con_stock:     conStock,
        quiebres:      quiebresTot,
        pdvs:          nPdvs,
        skus_unicos:   nSkus,
        cadenas:       parseInt(ki.cadenas ?? '0'),
        total_uds:     parseFloat(ki.total_uds ?? '0'),
        total_cop:     parseFloat(ki.total_cop ?? '0'),
        total_usd:     parseFloat(ki.total_usd ?? '0'),
        filas_reportadas: filasReport,    // Info: cuántas filas trajo el snapshot
      },
      por_cadena: cadenaAggR.rows.filter(r => r.cadena).map(r => ({
        cadena:        r.cadena,
        combinaciones: parseInt(r.combinaciones ?? '0'),
        con_stock:     parseInt(r.con_stock ?? '0'),
        quiebres:      Math.max(0, parseInt(r.quiebres ?? '0')),
        pdvs:          parseInt(r.pdvs ?? '0'),
        uds:           parseFloat(r.uds ?? '0'),
        cop:           parseFloat(r.cop ?? '0'),
        usd:           parseFloat(r.usd ?? '0'),
      })),
      top_skus: skusR.rows.map(r => ({
        sku:          r.sku,
        ean13:        r.ean13,
        plu:          r.plu,
        descripcion:  r.descripcion,
        categoria:    r.categoria,
        subcategoria: r.subcategoria,
        pdvs:         parseInt(r.pdvs ?? '0'),
        quiebres:     Math.max(0, parseInt(r.quiebres ?? '0')),
        uds:          parseFloat(r.uds ?? '0'),
        cop:          parseFloat(r.cop ?? '0'),
      })),
      detalle: quiebresR.rows.map(r => ({
        punto_venta:   r.punto_venta,
        cadena:        r.cadena,
        ean13:         r.ean13,
        plu:           r.plu,
        sku:           r.sku,
        descripcion:   r.descripcion,
        inv_unidades:  parseFloat(r.inv_unidades ?? '0'),
        inv_valor_cop: 0,
      })),
      inv_bajo: invBajoR.rows.map(r => ({
        punto_venta:   r.punto_venta,
        cadena:        r.cadena,
        ean13:         r.ean13,
        plu:           r.plu,
        sku:           r.sku,
        descripcion:   r.descripcion,
        inv_unidades:  parseFloat(r.inv_unidades ?? '0'),
        inv_valor_cop: parseFloat(r.inv_valor_cop ?? '0'),
      })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
