import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(req: NextRequest) {
  try {
    if (!SERVICE_KEY || SERVICE_KEY.length < 20) {
      return NextResponse.json({ error: 'SERVICE_ROLE_KEY no configurada' }, { status: 500 })
    }

    const { user_id, full_name, role, paises, dashboards, password } = await req.json()

    if (!user_id || !full_name) {
      return NextResponse.json({ error: 'user_id y full_name son requeridos' }, { status: 400 })
    }

    // Actualizar perfil via REST con service role (bypasa RLS)
    const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user_id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        full_name,
        role:       role || 'usuario',
        paises:     paises || [],
        dashboards: dashboards || [],
        updated_at: new Date().toISOString(),
      }),
    })

    if (!profileRes.ok) {
      const err = await profileRes.text()
      return NextResponse.json({ error: `Error al actualizar perfil: ${err}` }, { status: 400 })
    }

    // Cambiar contraseña si se envió
    if (password && password.length >= 6) {
      const passRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user_id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({ password }),
      })

      if (!passRes.ok) {
        const err = await passRes.json()
        return NextResponse.json({ error: `Perfil actualizado pero error en contraseña: ${err.message}` }, { status: 207 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
