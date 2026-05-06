import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(req: NextRequest) {
  try {
    const { email, full_name } = await req.json()
    if (!email) return NextResponse.json({ error: 'email requerido' }, { status: 400 })

    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        type:        'recovery',
        email,
        options: { redirect_to: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.bordenlat.com'}/auth/callback` },
      }),
    })

    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data.message ?? JSON.stringify(data) }, { status: 400 })

    const link = data.action_link
    const resend = new Resend(process.env.RESEND_API_KEY!)
    const from   = process.env.RESEND_FROM ?? 'BL Foods <noreply@bordenlatam.com>'

    const { error: mailErr } = await resend.emails.send({
      from,
      to:      [email],
      subject: 'Restablece tu contraseña — BL Food Dashboard',
      html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f3f4f6;padding:32px 16px;margin:0;">
  <div style="max-width:560px;margin:0 auto;">
    <div style="background:#111009;border-radius:12px;padding:24px 28px;margin-bottom:20px;text-align:center;">
      <div style="width:40px;height:40px;background:#c8873a;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:8px;">
        <span style="color:#fff;font-weight:900;font-size:15px;">BL</span>
      </div>
      <div style="color:#fff;font-weight:700;font-size:18px;">BL Food Dashboard</div>
    </div>
    <div style="background:#fff;border-radius:12px;padding:28px;border:1px solid #e5e7eb;">
      <h2 style="margin:0 0 8px;font-size:18px;color:#111827;">Hola${full_name ? `, ${full_name}` : ''}!</h2>
      <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">
        Recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón de abajo para continuar.
      </p>
      <div style="text-align:center;margin-bottom:24px;">
        <a href="${link}" style="display:inline-block;background:#c8873a;color:#fff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;">
          Restablecer contraseña
        </a>
      </div>
      <p style="color:#9ca3af;font-size:12px;margin:0;">
        Este enlace expira en 1 hora. Si no solicitaste este cambio, ignora este email.
      </p>
    </div>
  </div>
</body></html>`,
    })

    if (mailErr) return NextResponse.json({ error: mailErr.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
