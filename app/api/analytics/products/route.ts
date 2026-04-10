import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError, AppError } from '@/lib/api/errors'
import { requireAuth } from '@/lib/api/auth'
import { getUserRestrictions } from '@/lib/auth/restrictions'
import { AnalyticsQuerySchema, buildAnalyticsWhere } from '@/lib/validation/analytics'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()

    const raw    = Object.fromEntries(new URL(req.url).searchParams)
    const parsed = AnalyticsQuerySchema.safeParse(raw)
    if (!parsed.success) throw new AppError(400, parsed.error.message, 'Invalid params')

    const restrictions = await getUserRestrictions()
    const allowed      = restrictions?.isRestricted ? restrictions.paises : undefined

    const { where, vals } = buildAnalyticsWhere(parsed.data, allowed)

    // Step 1: top 10 SKUs
    const top10 = await pool.query<{
      sku:         string
      descripcion: string
      categoria:   string
      valor:       string
      unidades:    string
      total_valor: string
    }>(
      `WITH ranked AS (
         SELECT
           sku,
           MAX(descripcion) AS descripcion,
           MAX(categoria)   AS categoria,
           ROUND(SUM(ventas_valor)::numeric,    2) AS valor,
           ROUND(SUM(ventas_unidades)::numeric, 0) AS unidades
         FROM v_ventas
         WHERE ${where} AND sku IS NOT NULL AND sku <> ''
         GROUP BY sku
         ORDER BY valor DESC
         LIMIT 10
       ),
       total AS (
         SELECT ROUND(SUM(ventas_valor)::numeric, 2) AS total_valor
         FROM v_ventas WHERE ${where}
       )
       SELECT r.*, t.total_valor FROM ranked r CROSS JOIN total t`,
      vals
    )

    if (top10.rows.length === 0) {
      return NextResponse.json({ products: [] })
    }

    const skus       = top10.rows.map(r => r.sku)
    const totalValor = parseFloat(top10.rows[0]?.total_valor ?? '0')

    // Step 2: monthly sparkline for the top 10 (last 12 months of data)
    const sparkVals = [...vals, skus]
    const sparkRes  = await pool.query<{
      sku:   string
      ano:   string
      mes:   string
      valor: string
    }>(
      `SELECT sku, ano, mes, ROUND(SUM(ventas_valor)::numeric, 2) AS valor
       FROM v_ventas
       WHERE ${where} AND sku = ANY($${vals.length + 1})
       GROUP BY sku, ano, mes
       ORDER BY sku, ano, mes`,
      sparkVals
    )

    // Group sparklines by SKU → ordered array of monthly values
    const sparkMap: Record<string, number[]> = {}
    for (const row of sparkRes.rows) {
      if (!sparkMap[row.sku]) sparkMap[row.sku] = []
      sparkMap[row.sku].push(parseFloat(row.valor))
    }

    const products = top10.rows.map(r => ({
      sku:         r.sku,
      descripcion: r.descripcion,
      categoria:   r.categoria,
      valor:       parseFloat(r.valor),
      unidades:    parseInt(r.unidades),
      pct_total:   totalValor > 0
        ? +((parseFloat(r.valor) / totalValor) * 100).toFixed(1)
        : 0,
      sparkline:   sparkMap[r.sku] ?? [],
    }))

    return NextResponse.json({ products })
  } catch (err) {
    return handleApiError(err)
  }
}
