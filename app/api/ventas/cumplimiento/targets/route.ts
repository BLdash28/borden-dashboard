import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { requireAuth } from '@/lib/api/auth'

// GET /api/ventas/cumplimiento/targets?ano=2026&mes=1
export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const sp = new URL(req.url).searchParams
    const ano = sp.get('ano') ? Number(sp.get('ano')) : null
    const mes = sp.get('mes') ? Number(sp.get('mes')) : null

    const conds: string[] = []
    const params: unknown[] = []
    let idx = 1

    if (ano) { conds.push(`ano = $${idx++}`); params.push(ano) }
    if (mes) { conds.push(`mes = $${idx++}`); params.push(mes) }

    const where = conds.length > 0 ? 'WHERE ' + conds.join(' AND ') : ''

    const result = await pool.query(
      `SELECT pais, cliente, categoria, ano, mes, ROUND(target_und::numeric, 0) AS target_und
       FROM cumplimiento_targets ${where}
       ORDER BY pais, cliente, categoria`,
      params
    )

    return NextResponse.json({ targets: result.rows })
  } catch (err) {
    console.error('[targets GET]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST /api/ventas/cumplimiento/targets
// Body: { pais, cliente?, categoria?, ano, mes, target_und }
export async function POST(req: NextRequest) {
  try {
    await requireAuth()
    const body = await req.json()
    const { pais, cliente, categoria, ano, mes, target_und } = body

    if (!pais || !ano || !mes || target_und === undefined || target_und === null) {
      return NextResponse.json({ error: 'Missing required fields: pais, ano, mes, target_und' }, { status: 400 })
    }

    const num = parseFloat(String(target_und))
    if (isNaN(num) || num < 0) {
      return NextResponse.json({ error: 'target_und must be a valid non-negative number' }, { status: 400 })
    }

    await pool.query(
      `INSERT INTO cumplimiento_targets (pais, cliente, categoria, ano, mes, target_und)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (pais, cliente, categoria, ano, mes)
       DO UPDATE SET target_und = EXCLUDED.target_und, updated_at = NOW()`,
      [pais, cliente ?? '', categoria ?? '', ano, mes, Math.round(num)]
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[targets POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// DELETE /api/ventas/cumplimiento/targets
// Body: { pais, cliente?, categoria?, ano, mes }
export async function DELETE(req: NextRequest) {
  try {
    await requireAuth()
    const body = await req.json()
    const { pais, cliente, categoria, ano, mes } = body

    if (!pais || !ano || !mes) {
      return NextResponse.json({ error: 'Missing required fields: pais, ano, mes' }, { status: 400 })
    }

    await pool.query(
      `DELETE FROM cumplimiento_targets
       WHERE pais = $1 AND cliente = $2 AND categoria = $3 AND ano = $4 AND mes = $5`,
      [pais, cliente ?? '', categoria ?? '', ano, mes]
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[targets DELETE]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
