import { NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

export const dynamic = 'force-dynamic'

// Called by Vercel Cron every 5 minutes: */5 * * * *
export async function GET(req: Request) {
  const secret = new URL(req.url).searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET && process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const { rows: reportes } = await pool.query(
    'SELECT * FROM config_reportes WHERE activo = true AND cron_expresion IS NOT NULL'
  )

  const results: { id: number; nombre: string; ran: boolean; status?: string }[] = []

  for (const reporte of reportes) {
    if (!shouldRun(reporte.cron_expresion, now)) {
      results.push({ id: reporte.id, nombre: reporte.nombre, ran: false })
      continue
    }

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/reportes/run/${reporte.id}`,
        { method: 'POST' }
      )
      const data = await res.json()
      results.push({ id: reporte.id, nombre: reporte.nombre, ran: true, status: data.ok ? 'success' : 'error' })
    } catch {
      results.push({ id: reporte.id, nombre: reporte.nombre, ran: true, status: 'error' })
    }
  }

  return NextResponse.json({ ts: now.toISOString(), results })
}

function shouldRun(expr: string, now: Date): boolean {
  try {
    const parts = expr.trim().split(/\s+/)
    if (parts.length < 5) return false
    const [min, hour, dom, , dow] = parts
    return (
      (min  === '*' || parseInt(min)  === now.getUTCMinutes()) &&
      (hour === '*' || parseInt(hour) === now.getUTCHours())   &&
      (dom  === '*' || parseInt(dom)  === now.getUTCDate())    &&
      (dow  === '*' || parseInt(dow)  === now.getUTCDay())
    )
  } catch { return false }
}
