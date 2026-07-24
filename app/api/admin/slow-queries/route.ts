import { NextRequest, NextResponse } from 'next/server'
import { getSlowQueries, clearSlowQueries } from '@/lib/db/query-spy'

export const dynamic = 'force-dynamic'

/**
 * Devuelve el ring buffer de queries lentas capturadas por query-spy.
 *
 * GET  /api/admin/slow-queries       → JSON con las queries lentas (más lentas primero)
 * GET  /api/admin/slow-queries?fmt=csv → CSV descargable
 * DELETE /api/admin/slow-queries     → vacía el buffer
 *
 * Protegido con header `x-admin-key` == process.env.ADMIN_KEY.
 * Si ADMIN_KEY no está seteado el endpoint devuelve 503 (no queremos exponer
 * queries por accidente).
 */
function checkAuth(req: NextRequest): NextResponse | null {
  const key = process.env.ADMIN_KEY
  if (!key) {
    return NextResponse.json(
      { error: 'ADMIN_KEY no configurado. Setealo en env para habilitar este endpoint.' },
      { status: 503 },
    )
  }
  const given = req.headers.get('x-admin-key') ?? req.nextUrl.searchParams.get('key')
  if (given !== key) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return null
}

export async function GET(req: NextRequest) {
  const unauth = checkAuth(req)
  if (unauth) return unauth

  const rows = getSlowQueries()
  const fmt  = req.nextUrl.searchParams.get('fmt')

  if (fmt === 'csv') {
    const header = 'ts_iso,ms,rows,errored,sql,err'
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = rows.map(r =>
      [new Date(r.ts).toISOString(), r.ms, r.rows, r.errored, esc(r.sql), esc(r.err ?? '')].join(','),
    )
    return new NextResponse([header, ...lines].join('\n'), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="slow-queries-${Date.now()}.csv"`,
      },
    })
  }

  const threshold = parseInt(process.env.SQL_SPY_THRESHOLD_MS ?? '200')
  return NextResponse.json({
    threshold_ms: threshold,
    count:        rows.length,
    rows,
  })
}

export async function DELETE(req: NextRequest) {
  const unauth = checkAuth(req)
  if (unauth) return unauth
  clearSlowQueries()
  return NextResponse.json({ ok: true })
}
