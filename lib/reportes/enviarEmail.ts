import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export interface Destinatario {
  nombre:  string
  email?:  string
  telefono?: string
  canales: string[]
}

export async function enviarEmail(opts: {
  destinatarios: Destinatario[]
  asunto:        string
  cuerpo:        string
  adjuntoNombre: string
  adjuntoBuffer: Buffer
}) {
  const emailDests = opts.destinatarios.filter(d => d.canales.includes('email') && d.email)

  const results: { email: string; ok: boolean; error?: string }[] = []

  for (const dest of emailDests) {
    try {
      await resend.emails.send({
        from:    process.env.RESEND_FROM ?? 'Reportes BL Foods <reportes@bordenlatam.com>',
        to:      [dest.email!],
        subject: opts.asunto,
        html:    `<p>Hola ${dest.nombre},</p><p>${opts.cuerpo}</p><p>Adjunto encontrará el reporte en formato Excel.</p>`,
        attachments: [{
          filename: opts.adjuntoNombre,
          content:  opts.adjuntoBuffer,
        }],
      })
      results.push({ email: dest.email!, ok: true })
    } catch (err: any) {
      results.push({ email: dest.email!, ok: false, error: err.message })
    }
  }

  return results
}
