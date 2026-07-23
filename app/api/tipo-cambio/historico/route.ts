import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 3600 // 1h

/**
 * Serie histórica de tasa de cambio USD → `to` (default GTQ) desde la tabla
 * `tipo_cambio`. Rango por defecto: últimos 90 días.
 *
 * Query params:
 *   from   (default 'USD')
 *   to     (default 'GTQ')
 *   desde  (YYYY-MM-DD, opcional)
 *   hasta  (YYYY-MM-DD, opcional)
 *   dias   (número, default 90 — ignorado si se pasa desde/hasta)
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const from = (sp.get('from') || 'USD').toUpperCase()
    const to   = (sp.get('to')   || 'GTQ').toUpperCase()
    const desde = sp.get('desde')
    const hasta = sp.get('hasta')
    const dias = parseInt(sp.get('dias') || '90')

    let where = `moneda_from = $1 AND moneda_to = $2`
    const params: unknown[] = [from, to]
    if (desde && hasta) {
      params.push(desde, hasta)
      where += ` AND fecha BETWEEN $3::date AND $4::date`
    } else {
      params.push(dias)
      where += ` AND fecha >= CURRENT_DATE - ($3::int * INTERVAL '1 day')`
    }

    const { rows } = await pool.query(
      `SELECT fecha, tasa, fuente
       FROM tipo_cambio
       WHERE ${where}
       ORDER BY fecha ASC`,
      params,
    )

    const serie = rows.map(r => ({
      fecha:  r.fecha instanceof Date ? r.fecha.toISOString().slice(0, 10) : String(r.fecha),
      tasa:   parseFloat(r.tasa),
      fuente: r.fuente ?? null,
    }))

    // Stats rápidos
    const vals = serie.map(s => s.tasa)
    const min = vals.length ? Math.min(...vals) : null
    const max = vals.length ? Math.max(...vals) : null
    const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null
    const last = serie.length ? serie[serie.length - 1] : null
    const prev = serie.length > 1 ? serie[serie.length - 2] : null
    const delta = last && prev ? last.tasa - prev.tasa : null
    const deltaPct = last && prev && prev.tasa > 0 ? (delta! / prev.tasa) * 100 : null

    return NextResponse.json({
      from, to,
      count: serie.length,
      stats: { min, max, avg, last, prev, delta, delta_pct: deltaPct },
      serie,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
