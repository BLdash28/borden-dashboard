import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError, AppError } from '@/lib/api/errors'
import { requireAuth } from '@/lib/api/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/ofertas-impacto/[id]/serie-diaria
 *
 * Devuelve la venta diaria por SKU dentro de la ventana [inicio - N sem, fin + N sem],
 * agregada por SUM sobre las cadenas seleccionadas de la oferta. Se usa para
 * dibujar el chart de tendencia con granularidad día (no semana).
 *
 * Respuesta:
 *   {
 *     desde: "YYYY-MM-DD", hasta: "YYYY-MM-DD",
 *     vigencia_inicio: "YYYY-MM-DD", vigencia_fin: "YYYY-MM-DD",
 *     por_sku: [
 *       { upc, descripcion, puntos: [{ fecha: "YYYY-MM-DD", uds, val }] }
 *     ]
 *   }
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth()
    const id = params.id

    const ctxR = await pool.query(
      `SELECT
         pais, cadenas, vigencia_inicio, vigencia_fin, semanas_ventana,
         (DATE_TRUNC('week', vigencia_inicio)::date
            - (semanas_ventana * INTERVAL '1 week'))::date AS desde,
         (DATE_TRUNC('week', vigencia_fin)::date
            + (semanas_ventana * INTERVAL '1 week'))::date AS hasta
       FROM ofertas WHERE id = $1`,
      [id],
    )
    if (ctxR.rowCount === 0) throw new AppError(404, 'not found', 'Oferta no encontrada')
    const ctx = ctxR.rows[0]

    const daily = await pool.query(
      `WITH prod AS (
         SELECT upc, descripcion FROM oferta_productos WHERE oferta_id = $1
       )
       SELECT
         p.upc,
         MAX(p.descripcion) AS descripcion,
         MAKE_DATE(vv.ano, vv.mes, vv.dia) AS fecha,
         SUM(vv.ventas_unidades)::numeric AS uds,
         SUM(vv.ventas_valor)::numeric    AS val
       FROM prod p
       JOIN v_ventas vv
         ON vv.codigo_barras = p.upc
        AND vv.pais          = $2
        AND vv.cadena        = ANY($3::text[])
        AND MAKE_DATE(vv.ano, vv.mes, vv.dia) BETWEEN $4 AND $5
       GROUP BY p.upc, MAKE_DATE(vv.ano, vv.mes, vv.dia)
       ORDER BY p.upc, fecha`,
      [id, ctx.pais, ctx.cadenas, ctx.desde, ctx.hasta],
    )

    // Reagrupar en { upc, descripcion, puntos: [...] }
    const bySku = new Map<string, { upc: string; descripcion: string | null; puntos: any[] }>()
    for (const r of daily.rows) {
      const upc = r.upc as string
      if (!bySku.has(upc)) bySku.set(upc, { upc, descripcion: r.descripcion, puntos: [] })
      bySku.get(upc)!.puntos.push({
        fecha: (r.fecha instanceof Date ? r.fecha.toISOString() : String(r.fecha)).slice(0, 10),
        uds:   Number(r.uds),
        val:   Number(r.val),
      })
    }

    // Asegurar que los SKUs de la oferta que NO tienen ventas también aparezcan (con puntos vacíos)
    const prodR = await pool.query(
      `SELECT upc, descripcion FROM oferta_productos WHERE oferta_id = $1 ORDER BY descripcion NULLS LAST, upc`,
      [id],
    )
    const porSku = prodR.rows.map(p => bySku.get(p.upc) ?? { upc: p.upc, descripcion: p.descripcion, puntos: [] })

    const toYmd = (v: any) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10)

    return NextResponse.json({
      desde:            toYmd(ctx.desde),
      hasta:            toYmd(ctx.hasta),
      vigencia_inicio:  toYmd(ctx.vigencia_inicio),
      vigencia_fin:     toYmd(ctx.vigencia_fin),
      por_sku:          porSku,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
