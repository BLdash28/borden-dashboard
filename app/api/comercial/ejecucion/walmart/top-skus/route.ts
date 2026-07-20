import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'
import { parseWalmartFilters, buildWalmartWhere } from '@/lib/api/walmart-filtros'
import { withTiming } from '@/lib/api/withTiming'

export const revalidate = 300

export const GET = withTiming(async function GET(req: NextRequest) {
  try {
    const sp   = req.nextUrl.searchParams
    const pais = sp.get('pais') ?? 'CR'
    const top  = Math.min(parseInt(sp.get('top') ?? '20'), 200)
    const f    = parseWalmartFilters(req)
    const w    = buildWalmartWhere(f, { startAt: 2 })

    const { rows } = await pool.query(`
      WITH cur AS (
        SELECT
          descripcion, sku, categoria, subcategoria,
          ROUND(SUM(ventas_valor)::numeric,    2) AS valor_2026,
          ROUND(SUM(ventas_unidades)::numeric, 0) AS uni_2026
        FROM mv_walmart_mensual
        WHERE pais = $1
          AND ano = 2026
          AND ${w.where}
        GROUP BY descripcion, sku, categoria, subcategoria
      ),
      prev AS (
        SELECT
          descripcion,
          ROUND(SUM(ventas_valor)::numeric, 2) AS valor_2025
        FROM mv_walmart_mensual
        WHERE pais = $1
          AND ano = 2025
          AND mes <= (
            SELECT COALESCE(MAX(mes), 12)
            FROM mv_walmart_mensual
            WHERE pais = $1 AND ano = 2026
              AND ${w.where}
          )
          AND ${w.where}
        GROUP BY descripcion
      ),
      total AS (
        SELECT SUM(valor_2026) AS grand_total FROM cur
      )
      SELECT
        c.descripcion, c.sku, c.categoria, c.subcategoria,
        c.valor_2026, c.uni_2026,
        COALESCE(p.valor_2025, 0) AS valor_2025,
        CASE WHEN COALESCE(p.valor_2025, 0) > 0
             THEN ROUND(((c.valor_2026 - p.valor_2025) / p.valor_2025 * 100)::numeric, 1)
             ELSE NULL END AS delta,
        CASE WHEN t.grand_total > 0
             THEN ROUND((c.valor_2026 / t.grand_total * 100)::numeric, 1)
             ELSE 0 END AS share_pct
      FROM cur c
      CROSS JOIN total t
      LEFT JOIN prev p ON p.descripcion = c.descripcion
      ORDER BY c.valor_2026 DESC
      LIMIT ${top}
    `, [pais, ...w.params])

    // Compute cumulative share for pareto line
    let cumShare = 0
    const result = rows.map((r: any) => {
      cumShare += parseFloat(r.share_pct ?? '0')
      return {
        descripcion: r.descripcion,
        sku:         r.sku,
        categoria:   r.categoria,
        subcategoria: r.subcategoria,
        valor_2026:  parseFloat(r.valor_2026 ?? '0'),
        uni_2026:    parseInt(r.uni_2026 ?? '0'),
        valor_2025:  parseFloat(r.valor_2025 ?? '0'),
        delta:       r.delta !== null ? parseFloat(r.delta) : null,
        share_pct:   parseFloat(r.share_pct ?? '0'),
        cum_share:   Math.min(parseFloat(cumShare.toFixed(1)), 100),
      }
    })

    return NextResponse.json({ rows: result, total: result.length })
  } catch (err) {
    return handleApiError(err)
  }
})
