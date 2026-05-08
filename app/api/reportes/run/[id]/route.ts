import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { generarExcel } from '@/lib/reportes/generarExcel'
import { enviarEmail } from '@/lib/reportes/enviarEmail'
import { enviarWhatsapp } from '@/lib/reportes/enviarWhatsapp'

export const dynamic = 'force-dynamic'

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM config_reportes WHERE id = $1',
      [params.id]
    )
    if (!rows.length) return NextResponse.json({ error: 'Reporte no encontrado' }, { status: 404 })
    const reporte = rows[0]

    const buffer = await generarExcel(reporte.tipo_reporte, reporte.filtros ?? {})
    const fecha   = new Date().toISOString().slice(0, 10)
    const nombre  = `${reporte.nombre}_${fecha}.xlsx`

    const resumenTexto = `Reporte: ${reporte.nombre}\nFecha: ${fecha}\nTipo: ${reporte.tipo_reporte}`

    const canales: string[] = reporte.canales ?? []

    const emailResults = canales.includes('email')
      ? await enviarEmail({
          destinatarios: reporte.destinatarios ?? [],
          asunto:        `[BL Foods] ${reporte.nombre} — ${fecha}`,
          cuerpo:        resumenTexto,
          adjuntoNombre: nombre,
          adjuntoBuffer: buffer,
        })
      : []

    const waResults = canales.includes('whatsapp')
      ? await enviarWhatsapp({
          destinatarios: reporte.destinatarios ?? [],
          resumenTexto,
          nombreReporte: reporte.nombre,
        })
      : []

    const allResults = [...emailResults, ...waResults]
    const allOk = allResults.length > 0 && allResults.every(r => r.ok)
    const errors = allResults.filter(r => !r.ok).map(r => r.error).join('; ')
    const msg = allResults.length === 0
      ? 'Sin destinatarios configurados con email/canal válido'
      : `Email: ${emailResults.length} envíos, WhatsApp: ${waResults.length} envíos${errors ? ` | Errores: ${errors}` : ''}`

    await pool.query(`
      UPDATE config_reportes
      SET ultima_ejecucion = NOW(), ultimo_status = $1, ultimo_mensaje = $2, updated_at = NOW()
      WHERE id = $3
    `, [allOk ? 'success' : 'error', msg, params.id])

    return NextResponse.json({ ok: allOk, mensaje: msg, emailResults, waResults })
  } catch (err: any) {
    await pool.query(`
      UPDATE config_reportes
      SET ultima_ejecucion = NOW(), ultimo_status = 'error', ultimo_mensaje = $1, updated_at = NOW()
      WHERE id = $2
    `, [err.message, params.id])
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
