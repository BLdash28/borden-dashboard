import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

export const dynamic = 'force-dynamic'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const b = await req.json()
    const fields: string[] = []
    const vals: any[] = []
    let i = 1
    const set = (col: string, val: any) => { fields.push(`${col} = $${i++}`); vals.push(val) }

    if (b.nombre         !== undefined) set('nombre',          b.nombre)
    if (b.tipo_reporte   !== undefined) set('tipo_reporte',    b.tipo_reporte)
    if (b.canales        !== undefined) set('canales',         b.canales)
    if (b.destinatarios  !== undefined) set('destinatarios',   JSON.stringify(b.destinatarios))
    if (b.formato        !== undefined) set('formato',         b.formato)
    if (b.frecuencia     !== undefined) set('frecuencia',      b.frecuencia)
    if (b.cron_expresion !== undefined) set('cron_expresion',  b.cron_expresion)
    if (b.dia_semana     !== undefined) set('dia_semana',      b.dia_semana)
    if (b.dia_mes        !== undefined) set('dia_mes',         b.dia_mes)
    if (b.hora_envio     !== undefined) set('hora_envio',      b.hora_envio)
    if (b.filtros        !== undefined) set('filtros',         JSON.stringify(b.filtros))
    if (b.activo         !== undefined) set('activo',          b.activo)
    set('updated_at', new Date())

    vals.push(params.id)
    await pool.query(`UPDATE config_reportes SET ${fields.join(', ')} WHERE id = $${i}`, vals)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await pool.query('DELETE FROM config_reportes WHERE id = $1', [params.id])
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
