import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 0

export async function GET(req: NextRequest) {
  try {
    const ano = parseInt(req.nextUrl.searchParams.get('ano') || '2026')
    const { rows } = await pool.query<{ mes: number; meta_acumulada: string }>(
      `SELECT mes, meta_acumulada FROM sell_in_metas WHERE ano = $1 ORDER BY mes`,
      [ano]
    )
    const metas = Array.from({ length: 12 }, (_, i) => {
      const row = rows.find(r => r.mes === i + 1)
      return parseFloat(row?.meta_acumulada ?? '0')
    })
    return NextResponse.json({ metas })
  } catch (e) {
    return handleApiError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const ano: number = body.ano ?? 2026
    const metas: number[] = body.metas // array de 12 valores acumulados

    if (!Array.isArray(metas) || metas.length !== 12) {
      return NextResponse.json({ error: 'metas debe ser array de 12 valores' }, { status: 400 })
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      for (let i = 0; i < 12; i++) {
        await client.query(
          `INSERT INTO sell_in_metas (ano, mes, meta_acumulada, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (ano, mes) DO UPDATE SET meta_acumulada = $3, updated_at = NOW()`,
          [ano, i + 1, metas[i] ?? 0]
        )
      }
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return handleApiError(e)
  }
}
