import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

export const dynamic = 'force-dynamic'

const WORKFLOW_TIPO: Record<string, string> = {
  'Inventario Diario':       'retaillik',
  'Sellout Semanal':         'retaillik_sellout',
  'Sellout Last 4 Weeks':    'retaillik_sellout_4w',
  'Unisuper Inventario':     'unisuper_inventario',
  'Unisuper Venta Diaria':   'unisuper_venta_diaria',
  'Unisuper Venta Mensual':  'unisuper_venta_mensual',
  'Colombia Sellout Semanal': 'onedrive_excel',
  'Selectos Inventario':      'selectos_inventario',
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.DASHBOARD_API_KEY
  if (!apiKey || req.headers.get('Authorization') !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { workflow, status, mensaje } = await req.json()

    const tipo = WORKFLOW_TIPO[workflow]
    if (!tipo) return NextResponse.json({ error: `Workflow desconocido: ${workflow}` }, { status: 400 })

    const dbStatus  = status === 'success' ? 'ok' : 'error'
    const dbMensaje = mensaje || `GitHub Actions: ${status}`

    await pool.query(`
      UPDATE config_bots
      SET ultimo_status    = $1,
          ultimo_mensaje   = $2,
          ultima_ejecucion = NOW(),
          updated_at       = NOW()
      WHERE tipo = $3
    `, [dbStatus, dbMensaje, tipo])

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
