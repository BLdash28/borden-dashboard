import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError, AppError } from '@/lib/api/errors'
import { requireAuth } from '@/lib/api/auth'
import { getUserRestrictions } from '@/lib/auth/restrictions'
import { AnalyticsQuerySchema, buildAnalyticsWhere } from '@/lib/validation/analytics'
import { withCache, cacheHeaders } from '@/lib/db/cache'

const TOP_N = { categoria: 6, pais: 8, subcategoria: 6, cliente: 10 }

function topNWithOthers(
  rows: { label: string; value: number }[],
  n: number,
): { label: string; value: number }[] {
  if (rows.length <= n) return rows
  const top    = rows.slice(0, n)
  const others = rows.slice(n).reduce((s, r) => s + r.value, 0)
  return [...top, { label: 'Otros', value: +others.toFixed(2) }]
}

export async function GET(req: NextRequest) {
  try {
    await requireAuth()

    const raw    = Object.fromEntries(new URL(req.url).searchParams)
    const parsed = AnalyticsQuerySchema.safeParse(raw)
    if (!parsed.success) throw new AppError(400, parsed.error.message, 'Invalid params')

    const restrictions = await getUserRestrictions()
    const allowed      = restrictions?.isRestricted ? restrictions.paises : undefined

    const { where, vals } = buildAnalyticsWhere(parsed.data, allowed)

    const cacheKey = `donuts:${where}:${JSON.stringify(vals)}`
    const TTL = 5 * 60 * 1000 // 5 min

    const { data, cached } = await withCache(cacheKey, async () => {
      const donutQ = (dim: string, metric: string) =>
        pool.query<{ label: string; value: string }>(
          `SELECT ${dim} AS label, ROUND(${metric}::numeric, 2) AS value
           FROM mv_sellout_mensual
           WHERE ${where} AND ${dim} IS NOT NULL AND ${dim} <> ''
           GROUP BY ${dim}
           ORDER BY value DESC`,
          vals
        )

      const [catR, paisR, subR, clienteR] = await Promise.all([
        donutQ('categoria',    'SUM(ventas_valor)'),
        donutQ('pais',         'SUM(ventas_valor)'),
        donutQ('subcategoria', 'SUM(ventas_unidades)'),
        donutQ('cliente',      'SUM(ventas_valor)'),
      ])

      const parse = (rows: { label: string; value: string }[]) =>
        rows.map(r => ({ label: r.label, value: parseFloat(r.value) }))

      return {
        categoria:    topNWithOthers(parse(catR.rows),      TOP_N.categoria),
        pais:         topNWithOthers(parse(paisR.rows),     TOP_N.pais),
        subcategoria: topNWithOthers(parse(subR.rows),      TOP_N.subcategoria),
        cliente:      topNWithOthers(parse(clienteR.rows),  TOP_N.cliente),
      }
    }, TTL)

    return NextResponse.json(data, {
      headers: { ...cacheHeaders(300), 'X-Cache': cached ? 'HIT' : 'MISS' },
    })
  } catch (err) {
    return handleApiError(err)
  }
}
