import { NextRequest, NextResponse } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(req: NextRequest) {
  try {
    if (!SERVICE_KEY || SERVICE_KEY.length < 20) {
      return NextResponse.json({ error: 'SERVICE_ROLE_KEY no configurada' }, { status: 500 })
    }

    const { email } = await req.json()
    if (!email) return NextResponse.json({ error: 'email requerido' }, { status: 400 })

    // Generate a magic recovery link without sending email
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ type: 'recovery', email }),
    })

    if (!res.ok) {
      const err = await res.json()
      return NextResponse.json({ error: err.message || JSON.stringify(err) }, { status: 400 })
    }

    const data = await res.json()
    // data.action_link is the full recovery URL
    return NextResponse.json({ link: data.action_link })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
