import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(req: NextRequest) {
  try {
    // Debug: log env state
    console.log('[crear] URL:', SUPABASE_URL ? 'OK' : 'MISSING')
    console.log('[crear] KEY length:', SERVICE_KEY?.length ?? 0)
    console.log('[crear] KEY start:', SERVICE_KEY?.substring(0, 20) ?? 'NONE')

    if (!SERVICE_KEY || SERVICE_KEY.length < 20) {
      return NextResponse.json(
        { error: `SERVICE_ROLE_KEY no configurada (len=${SERVICE_KEY?.length ?? 0})` },
        { status: 500 }
      )
    }

    const body = await req.json()
    const { email, password, full_name, role, paises, dashboards } = body

    if (!email || !password || !full_name) {
      return NextResponse.json(
        { error: 'Email, contraseña y nombre son requeridos' },
        { status: 400 }
      )
    }

    // Paso 1: Crear usuario en auth via REST API
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      }),
    })

    const authData = await authRes.json()
    console.log('[crear] Auth response status:', authRes.status)

    if (!authRes.ok) {
      console.error('[crear] Auth error:', JSON.stringify(authData))
      return NextResponse.json(
        { error: authData.message || authData.msg || JSON.stringify(authData) },
        { status: 400 }
      )
    }

    const userId = authData.id
    console.log('[crear] User created, id:', userId)

    // Paso 2: Insertar perfil via REST API
    const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        id:         userId,
        email,
        full_name,
        role:       role || 'usuario',
        paises:     paises || [],
        dashboards: dashboards || [],
        is_active:  true,
      }),
    })

    console.log('[crear] Profile response status:', profileRes.status)

    if (!profileRes.ok) {
      const profileErr = await profileRes.text()
      console.error('[crear] Profile error:', profileErr)
      // Usuario creado pero perfil falló — devolver éxito parcial
      return NextResponse.json(
        { error: `Usuario creado pero error en perfil: ${profileErr}` },
        { status: 207 }
      )
    }

    return NextResponse.json({ success: true, user_id: userId })

  } catch (e: any) {
    console.error('[crear] Exception:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
