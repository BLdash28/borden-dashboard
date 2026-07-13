import { NextResponse } from 'next/server'

export const revalidate = 300

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Returns { [user_id]: { email_confirmed_at: string | null } }
export async function GET() {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
      headers: {
        'apikey':        SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
    })
    if (!res.ok) return NextResponse.json({}, { status: 200 })
    const data = await res.json()
    const map: Record<string, { email_confirmed_at: string | null }> = {}
    for (const u of data.users ?? []) {
      map[u.id] = { email_confirmed_at: u.email_confirmed_at ?? null }
    }
    return NextResponse.json(map)
  } catch {
    return NextResponse.json({})
  }
}
