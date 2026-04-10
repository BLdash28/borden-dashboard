import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(req: NextRequest) {
  try {
    if (!SERVICE_KEY || SERVICE_KEY.length < 20) {
      return NextResponse.json({ error: 'SERVICE_ROLE_KEY no configurada' }, { status: 500 })
    }

    const { user_id, password } = await req.json()
    if (!user_id || !password) return NextResponse.json({ error: 'user_id y password requeridos' }, { status: 400 })
    if (password.length < 6) return NextResponse.json({ error: 'Mínimo 6 caracteres' }, { status: 400 })

    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user_id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ password }),
    })

    if (!res.ok) {
      const err = await res.json()
      return NextResponse.json({ error: err.message || JSON.stringify(err) }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
