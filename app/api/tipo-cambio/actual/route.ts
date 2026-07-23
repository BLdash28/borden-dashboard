import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 3600 // 1h — la tasa cambia una vez por día

/**
 * Devuelve la tasa de cambio más reciente para una conversión USD → `to`.
 * Default: `to=GTQ`. Fallback tasa 7.80 si no hay data en la tabla `tipo_cambio`.
 *
 * Query params:
 *   from (default 'USD')
 *   to   (default 'GTQ')
 */
const FALLBACK_TASA: Record<string, number> = {
  'USD-GTQ': 7.80,
  'USD-COP': 4100,
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const from = (sp.get('from') || 'USD').toUpperCase()
    const to   = (sp.get('to')   || 'GTQ').toUpperCase()

    const { rows } = await pool.query(
      `SELECT fecha, tasa, fuente
       FROM tipo_cambio
       WHERE moneda_from = $1 AND moneda_to = $2
       ORDER BY fecha DESC
       LIMIT 1`,
      [from, to],
    )

    if (rows.length === 0) {
      return NextResponse.json({
        from, to,
        tasa: FALLBACK_TASA[`${from}-${to}`] ?? 1,
        fecha: null,
        fuente: 'fallback-hardcoded',
      })
    }

    const r = rows[0]
    return NextResponse.json({
      from, to,
      tasa:   parseFloat(r.tasa),
      fecha:  r.fecha instanceof Date ? r.fecha.toISOString().slice(0, 10) : r.fecha,
      fuente: r.fuente ?? null,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
