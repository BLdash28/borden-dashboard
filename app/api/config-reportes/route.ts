import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { rows } = await pool.query(`
      SELECT id, nombre, tipo_reporte, canales, destinatarios, formato,
             frecuencia, cron_expresion, dia_semana, dia_mes, hora_envio,
             filtros, activo, ultima_ejecucion, ultimo_status, ultimo_mensaje,
             created_at, updated_at
      FROM config_reportes
      ORDER BY created_at DESC
    `)
    return NextResponse.json({ reportes: rows })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json()
    const { rows } = await pool.query(`
      INSERT INTO config_reportes
        (nombre, tipo_reporte, canales, destinatarios, formato, frecuencia,
         cron_expresion, dia_semana, dia_mes, hora_envio, filtros, activo)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING id
    `, [
      b.nombre, b.tipo_reporte,
      b.canales ?? [], b.destinatarios ?? [],
      b.formato ?? 'excel', b.frecuencia,
      b.cron_expresion ?? null, b.dia_semana ?? null, b.dia_mes ?? null,
      b.hora_envio ?? null, b.filtros ?? {}, b.activo ?? true,
    ])
    return NextResponse.json({ id: rows[0].id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
