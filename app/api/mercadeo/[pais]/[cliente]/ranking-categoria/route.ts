import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError, AppError } from '@/lib/api/errors'
import { requireAuth } from '@/lib/api/auth'
import { clienteDb } from '@/lib/mercadeo/cliente'

export const revalidate = 300

/**
 * GET /api/mercadeo/[pais]/[cliente]/ranking-categoria?categoria=&ano=&top=
 *   Ranking de SKUs POR UNIDADES (no valor). Si no se pasa `categoria`,
 *   devuelve el ranking general del cliente y las categorías disponibles.
 */
export async function GET(req: NextRequest, { params }: { params: { pais: string; cliente: string } }) {
  try {
    await requireAuth()
    const pais    = params.pais.toUpperCase()
    const cliente = clienteDb(params.cliente)
    if (!cliente) throw new AppError(400, 'cliente', 'Cliente no reconocido')

    const sp        = req.nextUrl.searchParams
    const categoria = (sp.get('categoria') ?? '').trim()
    const ano       = Number(sp.get('ano') || new Date().getFullYear())
    const top       = Math.min(200, Math.max(10, Number(sp.get('top') || 50)))

    // Categorías disponibles con total en UNIDADES
    const catsQ = await pool.query(
      `SELECT categoria,
              SUM(ventas_unidades)::numeric AS unidades
       FROM v_ventas
       WHERE pais = $1 AND cliente = $2 AND ano = $3
         AND categoria IS NOT NULL AND categoria <> ''
       GROUP BY categoria
       ORDER BY unidades DESC`,
      [pais, cliente, ano],
    )

    const catFilter = categoria ? `AND categoria = $4` : ''
    const catParams = categoria ? [pais, cliente, ano, categoria] : [pais, cliente, ano]

    // Ranking de SKUs POR UNIDADES
    const rankQ = await pool.query(
      `WITH agg AS (
         SELECT sku,
                MAX(descripcion)   AS descripcion,
                MAX(categoria)     AS categoria,
                MAX(subcategoria)  AS subcategoria,
                MAX(codigo_barras) AS codigo_barras,
                SUM(ventas_unidades)::numeric AS unidades
         FROM v_ventas
         WHERE pais = $1 AND cliente = $2 AND ano = $3 ${catFilter}
         GROUP BY sku
       ),
       tot AS (
         SELECT SUM(unidades) AS total FROM agg
       )
       SELECT
         a.sku,
         a.descripcion,
         a.categoria,
         a.subcategoria,
         a.codigo_barras,
         ROUND(a.unidades, 0)                                          AS unidades,
         ROUND(a.unidades / NULLIF((SELECT total FROM tot), 0) * 100, 2) AS pct_total,
         ROW_NUMBER() OVER (ORDER BY a.unidades DESC)::int              AS rank
       FROM agg a
       ORDER BY a.unidades DESC
       LIMIT ${top}`,
      catParams,
    )

    return NextResponse.json({
      pais, cliente, ano,
      categoria: categoria || null,
      categorias: catsQ.rows.map(c => ({
        categoria: c.categoria,
        unidades:  Math.round(Number(c.unidades)),
      })),
      total_unidades: rankQ.rows.reduce((s, r) => s + Number(r.unidades), 0),
      productos: rankQ.rows.map(r => ({
        rank:         r.rank,
        sku:          r.sku,
        descripcion:  r.descripcion,
        categoria:    r.categoria,
        subcategoria: r.subcategoria,
        codigo_barras: r.codigo_barras,
        unidades:     Math.round(Number(r.unidades)),
        pct_total:    r.pct_total !== null ? Number(r.pct_total) : null,
      })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
