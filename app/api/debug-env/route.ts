import { NextResponse } from 'next/server'

export async function GET() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  return NextResponse.json({
    url_ok:         url.startsWith('https'),
    url:            url,
    key_length:     key.length,
    key_start:      key.substring(0, 20),
    key_is_placeholder: key === 'YOUR_SERVICE_ROLE_KEY_HERE' || key === '',
  })
}
