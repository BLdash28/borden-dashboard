import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const fecha = req.nextUrl.searchParams.get('fecha')

    const conds: string[] = []
    const params: unknown[] = []
    let idx = 1

    if (fecha) {
      conds.push(`fecha = $${idx++}`)
      params.push(fecha)
    }

    const where = conds.length > 0 ? 'WHERE ' + conds.join(' AND ') : ''

    const r = await pool.query(
      `SELECT * FROM inv_movimientos ${where} ORDER BY creado_en DESC LIMIT 200`,
      params
    )
    return NextResponse.json({ movimientos: r.rows })
  } catch (err: any) {
    console.error('[inventario/movimientos GET]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      fecha, tipo_mov, tipo_inv,
      sku, codigo, lote,
      cantidad_cajas, cantidad_unid,
      motivo, comentario,
    } = body

    if (!fecha || !tipo_mov || !tipo_inv) {
      return NextResponse.json(
        { error: 'Campos requeridos: fecha, tipo_mov, tipo_inv' },
        { status: 400 }
      )
    }

    const TIPOS_MOV_VALIDOS = ['ENTRADA', 'SALIDA', 'AJUSTE']
    if (!TIPOS_MOV_VALIDOS.includes(tipo_mov)) {
      return NextResponse.json(
        { error: `tipo_mov inválido. Debe ser: ${TIPOS_MOV_VALIDOS.join(', ')}` },
        { status: 400 }
      )
    }

    // Obtener usuario de Supabase (opcional — no bloquea si falla)
    let usuarioId: string | null = null
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      usuarioId = user?.id ?? null
    } catch {
      // sin sesión — igual permitimos el registro
    }

    const r = await pool.query(`
      INSERT INTO inv_movimientos
        (fecha, tipo_mov, tipo_inv, sku, codigo, lote,
         cantidad_cajas, cantidad_unid, motivo, comentario, usuario_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, [
      fecha, tipo_mov, tipo_inv,
      sku || null, codigo || null, lote || null,
      cantidad_cajas ? Number(cantidad_cajas) : null,
      cantidad_unid  ? Number(cantidad_unid)  : null,
      motivo || null, comentario || null,
      usuarioId,
    ])

    return NextResponse.json({ movimiento: r.rows[0] }, { status: 201 })
  } catch (err: any) {
    console.error('[inventario/movimientos POST]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
