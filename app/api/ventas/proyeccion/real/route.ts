import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const id       = Number(body.id)
    const real_usd = body.real_usd === null || body.real_usd === '' ? null : Number(body.real_usd)

    if (!id || isNaN(id)) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 })
    }
    if (real_usd !== null && isNaN(real_usd)) {
      return NextResponse.json({ error: 'real_usd inválido' }, { status: 400 })
    }

    const { rowCount } = await pool.query(
      'UPDATE proyecciones SET real_usd = $1 WHERE id = $2 AND categoria IS NOT NULL',
      [real_usd, id]
    )

    if (!rowCount) {
      return NextResponse.json({ error: 'Fila no encontrada' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('proyeccion/real PATCH error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
