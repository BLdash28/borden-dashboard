import { Resend } from 'resend'

export interface DestinatarioAlerta {
  nombre: string
  email:  string
}

const TIPO_LABEL: Record<string, string> = {
  umbral_metrica:       'Umbral de Métrica',
  variacion_anormal:    'Variación Anormal',
  bot_sin_sincronizar:  'Bot sin Sincronizar',
  registro_sanitario:   'Registro Sanitario',
}

function buildHtml(opts: {
  nombre:  string
  tipo:    string
  mensaje: string
  detalle: string
  isPrueba?: boolean
}): string {
  const tipoLabel = TIPO_LABEL[opts.tipo] ?? opts.tipo
  const color = opts.isPrueba ? '#3a6fa8' : '#c8873a'

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f3f4f6;padding:32px 16px;margin:0;">
  <div style="max-width:640px;margin:0 auto;">
    <div style="background:#111009;border-radius:12px;padding:24px 28px;margin-bottom:20px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="width:36px;height:36px;background:${color};border-radius:10px;display:flex;align-items:center;justify-content:center;">
          <span style="color:#fff;font-weight:900;font-size:14px;">BL</span>
        </div>
        <div>
          <div style="color:#fff;font-weight:700;font-size:16px;">BL Food · ${opts.isPrueba ? '🔔 Prueba de Alerta' : '⚠️ Alerta Activa'}</div>
          <div style="color:rgba(255,255,255,.4);font-size:11px;text-transform:uppercase;letter-spacing:1px;">${tipoLabel}</div>
        </div>
      </div>
    </div>

    <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;margin-bottom:16px;">
      <div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:8px;">${opts.nombre}</div>
      <div style="font-size:13px;color:#374151;margin-bottom:16px;">${opts.mensaje}</div>
      ${opts.detalle ? `
      <div style="background:#f9fafb;border-radius:8px;padding:16px;border:1px solid #f0f0f0;">
        <pre style="font-size:12px;color:#6b7280;margin:0;white-space:pre-wrap;font-family:monospace;">${opts.detalle}</pre>
      </div>` : ''}
    </div>

    <div style="background:#fff8f0;border:1px solid #fed7aa;border-radius:12px;padding:16px;">
      <div style="font-size:11px;color:#92400e;">
        ${opts.isPrueba
          ? 'Este es un email de prueba del sistema de alertas BL Food.'
          : `Alerta generada automáticamente el ${new Date().toLocaleString('es-GT', { dateStyle: 'long', timeStyle: 'short' })}.`}
      </div>
    </div>
  </div>
</body>
</html>`
}

export async function enviarAlerta(opts: {
  destinatarios: DestinatarioAlerta[]
  nombre:        string
  tipo:          string
  mensaje:       string
  detalle:       string
  isPrueba?:     boolean
}): Promise<{ ok: boolean; errors: string[] }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, errors: ['RESEND_API_KEY no configurado'] }
  if (opts.destinatarios.length === 0) return { ok: false, errors: ['Sin destinatarios'] }

  const resend  = new Resend(apiKey)
  const from    = process.env.RESEND_FROM ?? 'onboarding@resend.dev'
  const asunto  = `${opts.isPrueba ? '[PRUEBA] ' : ''}⚠️ ${opts.nombre} — BL Food`
  const html    = buildHtml(opts)
  const errors: string[] = []

  for (const dest of opts.destinatarios) {
    try {
      const { error } = await resend.emails.send({ from, to: [dest.email], subject: asunto, html })
      if (error) errors.push(`${dest.email}: ${error.message}`)
    } catch (e: any) {
      errors.push(`${dest.email}: ${e.message}`)
    }
  }

  return { ok: errors.length === 0, errors }
}
