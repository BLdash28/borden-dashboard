// WhatsApp Business API (Meta) integration
// Required env vars:
//   WHATSAPP_TOKEN      — Bearer token de la API de Meta
//   WHATSAPP_PHONE_ID   — Phone Number ID de la cuenta Business
//   WHATSAPP_TEMPLATE   — Nombre del template aprobado (ej: "reporte_blfood")

export interface Destinatario {
  nombre:   string
  telefono?: string
  canales:  string[]
}

export async function enviarWhatsapp(opts: {
  destinatarios: Destinatario[]
  resumenTexto:  string
  adjuntoUrl?:   string // URL pública del archivo (Vercel Blob, S3, etc.)
  nombreReporte: string
}) {
  const token   = process.env.WHATSAPP_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_ID

  if (!token || !phoneId) {
    return [{ telefono: 'N/A', ok: false, error: 'WHATSAPP_TOKEN / WHATSAPP_PHONE_ID no configurados' }]
  }

  const waDests = opts.destinatarios.filter(d => d.canales.includes('whatsapp') && d.telefono)
  const results: { telefono: string; ok: boolean; error?: string }[] = []

  for (const dest of waDests) {
    try {
      const body: any = opts.adjuntoUrl
        ? {
            messaging_product: 'whatsapp',
            to: dest.telefono!.replace(/\D/g, ''),
            type: 'document',
            document: {
              link: opts.adjuntoUrl,
              filename: `${opts.nombreReporte}.xlsx`,
              caption: opts.resumenTexto,
            },
          }
        : {
            messaging_product: 'whatsapp',
            to: dest.telefono!.replace(/\D/g, ''),
            type: 'text',
            text: { body: `*${opts.nombreReporte}*\n\n${opts.resumenTexto}` },
          }

      const res = await fetch(
        `https://graph.facebook.com/v19.0/${phoneId}/messages`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      )
      if (!res.ok) {
        const err = await res.text()
        results.push({ telefono: dest.telefono!, ok: false, error: err })
      } else {
        results.push({ telefono: dest.telefono!, ok: true })
      }
    } catch (err: any) {
      results.push({ telefono: dest.telefono!, ok: false, error: err.message })
    }
  }

  return results
}
