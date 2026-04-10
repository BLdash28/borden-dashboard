import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

export const dynamic = 'force-dynamic'

// ── Clientes ──────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Resend se inicializa dentro del handler para evitar errores en build sin env vars

// ── Helpers ───────────────────────────────────────────────────────────────────
function diasRestantes(fecha: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const venc  = new Date(fecha); venc.setHours(0, 0, 0, 0)
  return Math.ceil((venc.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function nivelAlerta(dias: number): 'vencido' | 'critico' | 'advertencia' | null {
  if (dias < 0)   return 'vencido'
  if (dias <= 30) return 'critico'
  if (dias <= 90) return 'advertencia'
  return null
}

const NIVEL_COLOR: Record<string, string> = {
  vencido:     '#ef4444',
  critico:     '#f97316',
  advertencia: '#eab308',
}

const NIVEL_LABEL: Record<string, string> = {
  vencido:     'VENCIDO',
  critico:     'Vence en ≤ 30 días',
  advertencia: 'Vence en ≤ 90 días',
}

// ── Plantilla HTML del email ──────────────────────────────────────────────────
function buildHtml(
  vencidos: any[],
  criticos: any[],
  advertencias: any[]
): string {
  const total = vencidos.length + criticos.length + advertencias.length

  const filas = (rows: any[], nivel: string) =>
    rows.map(r => {
      const dias = diasRestantes(r.fecha_vencimiento)
      const color = NIVEL_COLOR[nivel]
      return `
        <tr style="border-bottom:1px solid #f1f1f1;">
          <td style="padding:10px 12px;font-size:13px;color:#374151;">${r.pais}</td>
          <td style="padding:10px 12px;font-size:13px;color:#374151;">${r.nombre_producto}</td>
          <td style="padding:10px 12px;font-size:12px;color:#6b7280;">${r.empresa}</td>
          <td style="padding:10px 12px;font-size:12px;font-family:monospace;color:#92400e;">${r.numero_registro}</td>
          <td style="padding:10px 12px;font-size:12px;color:#6b7280;">${r.fecha_vencimiento?.slice(0,10)}</td>
          <td style="padding:10px 12px;">
            <span style="background:${color}22;color:${color};font-size:11px;font-weight:600;padding:2px 8px;border-radius:9999px;">
              ${dias < 0 ? `Venció hace ${Math.abs(dias)} días` : `${dias} días restantes`}
            </span>
          </td>
        </tr>`
    }).join('')

  const seccion = (titulo: string, nivel: string, rows: any[]) => {
    if (rows.length === 0) return ''
    const color = NIVEL_COLOR[nivel]
    return `
      <h3 style="margin:24px 0 8px;font-size:13px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:1px;">
        ${titulo} (${rows.length})
      </h3>
      <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;margin-bottom:8px;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:8px 12px;text-align:left;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">País</th>
            <th style="padding:8px 12px;text-align:left;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Producto</th>
            <th style="padding:8px 12px;text-align:left;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Empresa</th>
            <th style="padding:8px 12px;text-align:left;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">N° Registro</th>
            <th style="padding:8px 12px;text-align:left;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Vencimiento</th>
            <th style="padding:8px 12px;text-align:left;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Estado</th>
          </tr>
        </thead>
        <tbody>${filas(rows, nivel)}</tbody>
      </table>`
  }

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f3f4f6;padding:32px 16px;margin:0;">
  <div style="max-width:720px;margin:0 auto;">

    <!-- Header -->
    <div style="background:#111009;border-radius:12px;padding:24px 28px;margin-bottom:24px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="width:36px;height:36px;background:#c8873a;border-radius:10px;display:flex;align-items:center;justify-content:center;">
          <span style="color:#fff;font-weight:900;font-size:14px;">BL</span>
        </div>
        <div>
          <div style="color:#fff;font-weight:700;font-size:16px;">BL Food · Alertas Operaciones</div>
          <div style="color:rgba(255,255,255,.4);font-size:11px;text-transform:uppercase;letter-spacing:1px;">Registros Sanitarios</div>
        </div>
      </div>
    </div>

    <!-- Resumen -->
    <div style="background:#fff;border-radius:12px;padding:20px 24px;margin-bottom:20px;border:1px solid #e5e7eb;">
      <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#111827;">
        Se encontraron <strong style="color:#c8873a;">${total} registros</strong> que requieren atención.
      </p>
      <p style="margin:0;font-size:12px;color:#6b7280;">
        Generado el ${new Date().toLocaleDateString('es-GT', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}.
      </p>
    </div>

    <!-- Secciones -->
    ${seccion('Registros Vencidos', 'vencido', vencidos)}
    ${seccion('Vencen en Menos de 30 Días', 'critico', criticos)}
    ${seccion('Vencen en Menos de 90 Días', 'advertencia', advertencias)}

    <!-- Footer -->
    <p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:32px;">
      Este es un mensaje automático del sistema BL Food BI Platform.
      Para gestionar los registros, accede al módulo de Operaciones → Registros Sanitarios.
    </p>
  </div>
</body>
</html>`
}

// ── GET: revisar y enviar alertas ─────────────────────────────────────────────
// Llamar desde un cron job o desde el dashboard manualmente
// Se puede proteger con CRON_SECRET en el header Authorization: Bearer <secret>
export async function GET(req: NextRequest) {
  // Protección opcional: verifica el secret si está configurado
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('authorization') || ''
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
  }

  const resend = new Resend(process.env.RESEND_API_KEY!)
  const ALERTAS_TO = (process.env.ALERTAS_EMAIL_TO || '').split(',').map(e => e.trim()).filter(Boolean)
  const ALERTAS_FROM = process.env.ALERTAS_EMAIL_FROM || 'alertas@blfood.com'

  if (ALERTAS_TO.length === 0) {
    return NextResponse.json({ error: 'ALERTAS_EMAIL_TO no configurado' }, { status: 500 })
  }

  try {
    // Traer todos los registros sanitarios
    const { data: registros, error } = await supabase
      .from('registros_sanitarios')
      .select('id, nombre_producto, pais, empresa, numero_registro, fecha_vencimiento')
      .order('fecha_vencimiento', { ascending: true })

    if (error) throw error

    // Clasificar por nivel de alerta
    const vencidos:     any[] = []
    const criticos:     any[] = []
    const advertencias: any[] = []

    for (const r of registros || []) {
      const nivel = nivelAlerta(diasRestantes(r.fecha_vencimiento))
      if (nivel === 'vencido')     vencidos.push(r)
      else if (nivel === 'critico')     criticos.push(r)
      else if (nivel === 'advertencia') advertencias.push(r)
    }

    const total = vencidos.length + criticos.length + advertencias.length

    // Si no hay alertas, no enviar email
    if (total === 0) {
      return NextResponse.json({ enviado: false, motivo: 'Sin alertas activas', total: 0 })
    }

    // Construir asunto
    const partes: string[] = []
    if (vencidos.length > 0)     partes.push(`${vencidos.length} vencido${vencidos.length > 1 ? 's' : ''}`)
    if (criticos.length > 0)     partes.push(`${criticos.length} crítico${criticos.length > 1 ? 's' : ''}`)
    if (advertencias.length > 0) partes.push(`${advertencias.length} advertencia${advertencias.length > 1 ? 's' : ''}`)

    const asunto = `⚠️ Registros Sanitarios: ${partes.join(' · ')} — BL Food`

    // Enviar email con Resend
    const { data: mail, error: mailError } = await resend.emails.send({
      from:    ALERTAS_FROM,
      to:      ALERTAS_TO,
      subject: asunto,
      html:    buildHtml(vencidos, criticos, advertencias),
    })

    if (mailError) throw new Error(mailError.message)

    return NextResponse.json({
      enviado: true,
      email_id: mail?.id,
      total,
      breakdown: {
        vencidos:     vencidos.length,
        criticos:     criticos.length,
        advertencias: advertencias.length,
      },
    })
  } catch (e: any) {
    console.error('[alertas/registros-sanitarios]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
