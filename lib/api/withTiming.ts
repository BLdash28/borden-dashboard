import { NextRequest, NextResponse } from 'next/server'

/**
 * Wrapper que loguea la duración de un handler de API + tamaño del payload.
 *
 * Uso:
 *   export const GET = withTiming(async (req) => { ... return NextResponse.json(...) })
 *
 * Logs formato:
 *   [api] route=/api/foo?bar=1 ms=123 rows=45 status=200
 *
 * En Vercel logs quedan filtrables por `[api]`. En dev salen por stderr.
 * Se puede desactivar poniendo `DISABLE_API_TIMING=1` en el entorno.
 */
type Handler = (req: NextRequest, ctx?: any) => Promise<Response> | Response

export function withTiming(handler: Handler, label?: string): Handler {
  return async function timedHandler(req, ctx) {
    if (process.env.DISABLE_API_TIMING === '1') return handler(req, ctx)
    const t0 = Date.now()
    // Route sin origin — más corto en los logs
    const routeLabel = label || (req.nextUrl?.pathname + (req.nextUrl?.search || ''))
    let status = 500
    let rows: number | string = '?'
    try {
      const res = await handler(req, ctx)
      status = res.status
      // Intentamos leer `rows` del body sin consumirlo (clonamos).
      // Solo funciona para JSON con { rows: [...] } o { total: N }.
      try {
        const clone = res.clone()
        const body = await clone.json()
        if (Array.isArray(body?.rows)) rows = body.rows.length
        else if (typeof body?.total === 'number') rows = body.total
        else if (Array.isArray(body?.items)) rows = body.items.length
        else if (body === null || body === undefined) rows = 0
        else rows = Object.keys(body).length
      } catch { /* body no era JSON, ignoramos */ }
      return res
    } finally {
      const ms = Date.now() - t0
      // eslint-disable-next-line no-console
      console.log(`[api] route=${routeLabel} ms=${ms} rows=${rows} status=${status}`)
    }
  }
}
