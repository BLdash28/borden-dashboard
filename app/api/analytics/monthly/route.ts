import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError, AppError } from '@/lib/api/errors'
import { requireAuth } from '@/lib/api/auth'
import { getUserRestrictions } from '@/lib/auth/restrictions'
import { AnalyticsQuerySchema, buildAnalyticsWhere } from '@/lib/validation/analytics'
import { withCache, cacheHeaders } from '@/lib/db/cache'

const MESES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const GROWTH_TARGET = parseFloat(process.env.ANALYTICS_GROWTH_TARGET ?? '1.10')

export async function GET(req: NextRequest) {
  try {
    await requireAuth()

    const raw    = Object.fromEntries(new URL(req.url).searchParams)
    const parsed = AnalyticsQuerySchema.safeParse(raw)
    if (!parsed.success) throw new AppError(400, parsed.error.message, 'Invalid params')

    const restrictions = await getUserRestrictions()
    const allowed      = restrictions?.isRestricted ? restrictions.paises : undefined

    const { where, vals } = buildAnalyticsWhere(parsed.data, allowed)

    // Determine prior-year anos
    const anosArr = parsed.data.anos
      ? parsed.data.anos.split(',').map(Number).filter(n => n > 2000 && n < 2100)
      : []
    const priorAnos = anosArr.length > 0 ? anosArr.map(a => a - 1) : null

    const cacheKey = `monthly:${where}:${JSON.stringify(vals)}:${JSON.stringify(priorAnos)}`
    const TTL = 5 * 60 * 1000 // 5 min

    const { data, cached } = await withCache(cacheKey, async () => {
      const [current, prior] = await Promise.all([
        pool.query<{ ano: string; mes: string; valor: string; unidades: string }>(
          `SELECT ano, mes,
             ROUND(SUM(ventas_valor)::numeric,    2) AS valor,
             ROUND(SUM(ventas_unidades)::numeric, 0) AS unidades
           FROM mv_sellout_mensual
           WHERE ${where}
           GROUP BY ano, mes
           ORDER BY ano, mes`,
          vals
        ),
        priorAnos
          ? pool.query<{ ano: string; mes: string; valor: string }>(
              `SELECT ano, mes, ROUND(SUM(ventas_valor)::numeric, 2) AS valor
               FROM mv_sellout_mensual
               WHERE ${where} AND ano = ANY($${vals.length + 1})
               GROUP BY ano, mes
               ORDER BY ano, mes`,
              [...vals, priorAnos]
            )
          : Promise.resolve(null),
      ])

      // Build prior-year lookup keyed by mes
      const priorByMes: Record<string, number> = {}
      for (const r of prior?.rows ?? []) {
        priorByMes[r.mes] = parseFloat(r.valor)
      }

      const monthly = current.rows.map(r => {
        const valor    = parseFloat(r.valor)
        const prev     = priorByMes[r.mes] ?? null
        const target   = prev !== null ? +(prev * GROWTH_TARGET).toFixed(2) : null
        const attain   = target && target > 0 ? +((valor / target) * 100).toFixed(1) : null

        return {
          label:     `${MESES[parseInt(r.mes)]} ${r.ano}`,
          ano:       parseInt(r.ano),
          mes:       parseInt(r.mes),
          valor,
          unidades:  parseInt(r.unidades),
          valor_prev: prev,
          target,
          attainment: attain,
          // Color coding: ≥100% green, 80-99% amber, <80% red
          color: attain === null ? null
            : attain >= 100 ? '#10b981'
            : attain >= 80  ? '#f59e0b'
            :                 '#ef4444',
        }
      })

      return { monthly }
    }, TTL)

    return NextResponse.json(data, {
      headers: { ...cacheHeaders(300), 'X-Cache': cached ? 'HIT' : 'MISS' },
    })
  } catch (err) {
    return handleApiError(err)
  }
}
