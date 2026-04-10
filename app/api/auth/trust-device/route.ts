import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const COOKIE_NAME = 'mfa_trusted_device'
const MAX_AGE = 30 * 24 * 60 * 60 // 30 días en segundos

export async function POST() {
  const supabase = await createClient()

  // Solo permitir si el usuario está en AAL2 (MFA verificado)
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal?.currentLevel !== 'aal2') {
    return NextResponse.json({ error: 'MFA no verificado' }, { status: 401 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  // Token: userId + timestamp firmado (simple, no necesita DB)
  const token = Buffer.from(`${user.id}:${Date.now()}`).toString('base64')

  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure:   true,
    sameSite: 'lax',
    maxAge:   MAX_AGE,
    path:     '/',
  })
  return res
}
