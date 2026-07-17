import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Auto-reset de bots pegados en 'running' > 2h — cubre el caso donde el
    // workflow del bot falla antes de enviar el callback a /api/bots/status
    // (network, timeout, workflow apagado, etc.) y evita que el estado se
    // quede en "En proceso" indefinidamente en la UI.
    await pool.query(`
      UPDATE config_bots
      SET ultimo_status  = 'error',
          ultimo_mensaje = 'Sin callback del workflow tras 2h — revisar GitHub Actions',
          updated_at     = NOW()
      WHERE ultimo_status = 'running'
        AND ultima_ejecucion < NOW() - INTERVAL '2 hours'
    `)

    const { rows } = await pool.query(`
      SELECT id, nombre, tipo, descripcion, endpoint_url,
             '••••••••' AS api_key,
             headers, metodo, body_template, tabla_destino,
             mapeo_columnas, cron_expresion, activo,
             ultima_ejecucion, ultimo_status, ultimo_mensaje,
             created_at, updated_at
      FROM config_bots
      ORDER BY created_at DESC
    `)
    return NextResponse.json({ bots: rows })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json()
    const { rows } = await pool.query(`
      INSERT INTO config_bots
        (nombre, tipo, descripcion, endpoint_url, api_key, headers,
         metodo, body_template, tabla_destino, mapeo_columnas,
         cron_expresion, activo)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING id
    `, [
      b.nombre, b.tipo, b.descripcion ?? null, b.endpoint_url ?? null,
      b.api_key ?? null, b.headers ?? {}, b.metodo ?? 'GET',
      b.body_template ?? {}, b.tabla_destino ?? null,
      b.mapeo_columnas ?? {}, b.cron_expresion ?? null,
      b.activo ?? true,
    ])
    return NextResponse.json({ id: rows[0].id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
