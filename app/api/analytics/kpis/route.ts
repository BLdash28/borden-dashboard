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

    // Build prior-year WHERE (same filters, year - 1)
    const anosArr = parsed.data.anos
      ? parsed.data.anos.split(',').map(Number).filter(n => n > 2000 && n < 2100)
      : []
    const priorAnos = anosArr.length > 0
      ? anosArr.map(a => a - 1)
      : null  // if no year selected, skip prior comparison

    const [main, prior] = await Promise.all([
      pool.query<{
        dias_con_ventas: string
        total_valor:     string
        total_unidades:  string
        avg_ticket:      string
        n_paises:        string
        n_skus:          string
        n_clientes:      string
      }>(
        `SELECT
           COUNT(DISTINCT CASE WHEN dia > 0 THEN CONCAT(ano,'-',mes,'-',dia) END) AS dias_con_ventas,
           ROUND(SUM(ventas_valor)::numeric, 2)                                   AS total_valor,
           ROUND(SUM(ventas_unidades)::numeric, 0)                                AS total_unidades,
           ROUND(SUM(ventas_valor) / NULLIF(SUM(ventas_unidades),0)::numeric, 2)  AS avg_ticket,
           COUNT(DISTINCT pais)                                                   AS n_paises,
           COUNT(DISTINCT sku)                                                    AS n_skus,
           COUNT(DISTINCT cliente)                                                AS n_clientes
         FROM v_ventas
         WHERE ${where}`,
        vals
      ),

      priorAnos
        ? pool.query<{ total_valor: string; total_unidades: string }>(
            `SELECT
               ROUND(SUM(ventas_valor)::numeric, 2)    AS total_valor,
               ROUND(SUM(ventas_unidades)::numeric, 0) AS total_unidades
             FROM v_ventas
             WHERE ${where} AND ano = ANY($${vals.length + 1})`,
            [...vals, priorAnos]
          )
        : Promise.resolve(null),
    ])

    const m  = main.rows[0]
    const p  = prior?.rows[0] ?? null
    const tv = parseFloat(m.total_valor    ?? '0')
    const tu = parseFloat(m.total_unidades ?? '0')
    const pv = parseFloat(p?.total_valor    ?? '0')
    const pu = parseFloat(p?.total_unidades ?? '0')

    return NextResponse.json({
      dias_con_ventas: parseInt(m.dias_con_ventas ?? '0'),
      total_valor:     tv,
      total_unidades:  tu,
      avg_ticket:      parseFloat(m.avg_ticket ?? '0'),
      n_paises:        parseInt(m.n_paises  ?? '0'),
      n_skus:          parseInt(m.n_skus    ?? '0'),
      n_clientes:      parseInt(m.n_clientes ?? '0'),
      vs_prior: p ? {
        total_valor_pct:     pv > 0 ? +((tv - pv) / pv * 100).toFixed(1) : null,
        total_unidades_pct:  pu > 0 ? +((tu - pu) / pu * 100).toFixed(1) : null,
      } : null,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
