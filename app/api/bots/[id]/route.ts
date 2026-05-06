import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

export const dynamic = 'force-dynamic'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM config_bots WHERE id = $1',
      [params.id]
    )
    if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ bot: rows[0] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const b = await req.json()
    const fields: string[] = []
    const vals: any[] = []
    let i = 1

    const set = (col: string, val: any) => { fields.push(`${col} = $${i++}`); vals.push(val) }

    if (b.nombre        !== undefined) set('nombre',         b.nombre)
    if (b.tipo          !== undefined) set('tipo',            b.tipo)
    if (b.descripcion   !== undefined) set('descripcion',    b.descripcion)
    if (b.endpoint_url  !== undefined) set('endpoint_url',   b.endpoint_url)
    if (b.api_key       !== undefined && b.api_key !== '••••••••') set('api_key', b.api_key)
    if (b.headers       !== undefined) set('headers',        b.headers)
    if (b.metodo        !== undefined) set('metodo',          b.metodo)
    if (b.body_template !== undefined) set('body_template',  b.body_template)
    if (b.tabla_destino !== undefined) set('tabla_destino',  b.tabla_destino)
    if (b.mapeo_columnas !== undefined) set('mapeo_columnas', b.mapeo_columnas)
    if (b.cron_expresion !== undefined) set('cron_expresion', b.cron_expresion)
    if (b.activo        !== undefined) set('activo',          b.activo)
    set('updated_at', new Date())

    vals.push(params.id)
    await pool.query(
      `UPDATE config_bots SET ${fields.join(', ')} WHERE id = $${i}`,
      vals
    )
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await pool.query('DELETE FROM config_bots WHERE id = $1', [params.id])
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
