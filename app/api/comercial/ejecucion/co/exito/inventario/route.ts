import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

/**
 * Inventario Grupo Éxito CO — snapshot más reciente por defecto,
 * o del `fecha_snapshot` que pases por query.
 *
 * Devuelve KPIs, breakdown por cadena, top SKUs por stock, y detalle
 * limitado por PDV × SKU.
 */
export async function GET(req: NextRequest) {
  try {
    const cadena = req.nextUrl.searchParams.get('cadena') ?? ''
    const fechaQ = req.nextUrl.searchParams.get('fecha')  ?? ''

    // Última fecha disponible
    const ultR = await pool.query(
      `SELECT MAX(fecha_snapshot) AS f FROM inventario_exito WHERE pais='CO' AND cliente='GRUPO ÉXITO'`
    )
    const fecha: string | null = fechaQ || (ultR.rows[0]?.f
      ? new Date(ultR.rows[0].f).toISOString().slice(0, 10)
      : null)

    if (!fecha) {
      return NextResponse.json({ fecha: null, kpi: null, por_cadena: [], top_skus: [], detalle: [] })
    }

    const conds: string[] = ["pais = 'CO'", "cliente = 'GRUPO ÉXITO'", `fecha_snapshot = '${fecha}'::date`]
    if (cadena) conds.push(`cadena = '${cadena.replace(/'/g, "''")}'`)
    const where = conds.join(' AND ')

    const [kpiR, cadenaR, skusR, detalleR] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)                                        AS combinaciones,
           COUNT(*) FILTER (WHERE inv_unidades > 0)        AS con_stock,
           COUNT(*) FILTER (WHERE inv_unidades = 0)        AS quiebres,
           COUNT(DISTINCT punto_venta)                     AS pdvs,
           COUNT(DISTINCT ean13)                           AS skus_unicos,
           COUNT(DISTINCT cadena)                          AS cadenas,
           ROUND(SUM(inv_unidades)::numeric, 0)            AS total_uds,
           ROUND(SUM(inv_valor_cop)::numeric, 0)           AS total_cop,
           ROUND(SUM(inv_valor_usd)::numeric, 2)           AS total_usd
         FROM inventario_exito WHERE ${where}`,
      ),
      pool.query(
        `SELECT cadena,
                COUNT(*)                                    AS combinaciones,
                COUNT(*) FILTER (WHERE inv_unidades > 0)    AS con_stock,
                COUNT(*) FILTER (WHERE inv_unidades = 0)    AS quiebres,
                COUNT(DISTINCT punto_venta)                 AS pdvs,
                ROUND(SUM(inv_unidades)::numeric, 0)        AS uds,
                ROUND(SUM(inv_valor_cop)::numeric, 0)       AS cop,
                ROUND(SUM(inv_valor_usd)::numeric, 2)       AS usd
         FROM inventario_exito WHERE ${where}
         GROUP BY cadena ORDER BY cop DESC NULLS LAST`,
      ),
      pool.query(
        `SELECT ean13, plu, sku, MAX(descripcion) AS descripcion,
                MAX(categoria)    AS categoria,
                MAX(subcategoria) AS subcategoria,
                COUNT(DISTINCT punto_venta)                 AS pdvs,
                COUNT(*) FILTER (WHERE inv_unidades = 0)    AS quiebres,
                ROUND(SUM(inv_unidades)::numeric, 0)        AS uds,
                ROUND(SUM(inv_valor_cop)::numeric, 0)       AS cop
         FROM inventario_exito WHERE ${where}
         GROUP BY ean13, plu, sku
         ORDER BY cop DESC NULLS LAST LIMIT 20`,
      ),
      // Detalle limitado por peso para no explotar
      pool.query(
        `SELECT punto_venta, cadena, ean13, plu, sku, descripcion,
                inv_unidades, inv_valor_cop
         FROM inventario_exito WHERE ${where}
         ORDER BY inv_valor_cop DESC NULLS LAST LIMIT 500`,
      ),
    ])

    const kpi = kpiR.rows[0] ?? {}
    return NextResponse.json({
      fecha,
      cadena_filter: cadena || null,
      kpi: {
        combinaciones: parseInt(kpi.combinaciones ?? '0'),
        con_stock:     parseInt(kpi.con_stock ?? '0'),
        quiebres:      parseInt(kpi.quiebres ?? '0'),
        pdvs:          parseInt(kpi.pdvs ?? '0'),
        skus_unicos:   parseInt(kpi.skus_unicos ?? '0'),
        cadenas:       parseInt(kpi.cadenas ?? '0'),
        total_uds:     parseFloat(kpi.total_uds ?? '0'),
        total_cop:     parseFloat(kpi.total_cop ?? '0'),
        total_usd:     parseFloat(kpi.total_usd ?? '0'),
      },
      por_cadena: cadenaR.rows.map(r => ({
        cadena:        r.cadena,
        combinaciones: parseInt(r.combinaciones),
        con_stock:     parseInt(r.con_stock),
        quiebres:      parseInt(r.quiebres),
        pdvs:          parseInt(r.pdvs),
        uds:           parseFloat(r.uds ?? '0'),
        cop:           parseFloat(r.cop ?? '0'),
        usd:           parseFloat(r.usd ?? '0'),
      })),
      top_skus: skusR.rows.map(r => ({
        ean13:        r.ean13,
        plu:          r.plu,
        sku:          r.sku,
        descripcion:  r.descripcion,
        categoria:    r.categoria,
        subcategoria: r.subcategoria,
        pdvs:         parseInt(r.pdvs),
        quiebres:     parseInt(r.quiebres),
        uds:          parseFloat(r.uds ?? '0'),
        cop:          parseFloat(r.cop ?? '0'),
      })),
      detalle: detalleR.rows.map(r => ({
        punto_venta:  r.punto_venta,
        cadena:       r.cadena,
        ean13:        r.ean13,
        plu:          r.plu,
        sku:          r.sku,
        descripcion:  r.descripcion,
        inv_unidades: parseFloat(r.inv_unidades ?? '0'),
        inv_valor_cop: parseFloat(r.inv_valor_cop ?? '0'),
      })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
