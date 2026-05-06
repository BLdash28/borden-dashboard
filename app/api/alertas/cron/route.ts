import { NextRequest, NextResponse } from 'next/server'
import { evaluarAlertas } from '@/lib/alertas/evaluarAlertas'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') ?? ''
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
  }

  try {
    const resultado = await evaluarAlertas()
    return NextResponse.json({ ok: true, ...resultado })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
