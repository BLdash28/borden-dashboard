import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'
import { parseWalmartFilters, buildWalmartWhere } from '@/lib/api/walmart-filtros'
import { CADENA_NORM_SQL } from '@/lib/db/walmart-cadena'

export const revalidate = 300

/**
 * Drill-down PDV para Cobertura Walmart. Réplica del endpoint
 * `co/exito/calidad-inventario/pdvs/route.ts` adaptado a
 * `fact_inventario_walmart_pdv` (columna `inv_mano`).
 *
 * Query params:
 *  - pais    (default 'CR')
 *  - sku     (opcional) — filtra por SKU o código de barras
 *  - bucket  (opcional, 'todos'|'menos_de_3'|'entre_3_y_10'|'mayor_a_10')
 *  - Filtros globales Walmart via `parseWalmartFilters` (cadenas, categorias,
 *    puntos, skus...). NB: la tabla NO tiene subcategoria/formato — se omiten.
 */
export async function GET(req: NextRequest) {
  try {
    const pais   = req.nextUrl.searchParams.get('pais')   ?? 'CR'
    const sku    = (req.nextUrl.searchParams.get('sku') ?? '').trim()
    const bucket = req.nextUrl.searchParams.get('bucket') ?? 'todos'

    let bucketFilter = 'AND inv_mano > 0'
    if (bucket === 'menos_de_3')   bucketFilter = 'AND inv_mano > 0 AND inv_mano < 3'
    if (bucket === 'entre_3_y_10') bucketFilter = 'AND inv_mano >= 3 AND inv_mano <= 10'
    if (bucket === 'mayor_a_10')   bucketFilter = 'AND inv_mano > 10'

    // Filtros globales (se omiten columnas ausentes en la tabla PDV)
    const f = parseWalmartFilters(req)
    const wG = buildWalmartWhere(f, { startAt: 2, omit: ['subcategoria', 'formato'] })

    // Filtro por SKU: matcheamos contra sku o codigo_barras
    let skuFilter = ''
    const params: unknown[] = [pais, ...wG.params]
    if (sku) {
      const idx = params.length + 1
      skuFilter = `AND (sku = $${idx} OR codigo_barras = $${idx})`
      params.push(sku)
    }

    const r = await pool.query(
      `WITH ult AS (
         SELECT MAX(fecha) AS f FROM fact_inventario_walmart_pdv WHERE pais = $1
       )
       SELECT
         punto_venta,
         store_nbr,
         ${CADENA_NORM_SQL} AS cadena,
         categoria,
         sku,
         codigo_barras,
         descripcion,
         inv_mano
       FROM fact_inventario_walmart_pdv
       WHERE pais = $1
         AND fecha = (SELECT f FROM ult)
         AND ${wG.where}
         ${skuFilter}
         ${bucketFilter}
       ORDER BY inv_mano DESC`,
      params,
    )

    return NextResponse.json({
      sku,
      bucket,
      pdvs: r.rows.map((x: any) => ({
        punto_venta:   x.punto_venta,
        store_nbr:     x.store_nbr ?? null,
        cadena:        x.cadena ?? '',
        categoria:     x.categoria ?? null,
        sku:           x.sku ?? '',
        codigo_barras: x.codigo_barras ?? '',
        descripcion:   x.descripcion ?? null,
        inv_mano:      parseFloat(x.inv_mano ?? '0'),
      })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
