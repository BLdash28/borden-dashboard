import { NextResponse } from 'next/server'
import { getUserRestrictions } from '@/lib/auth/restrictions'

export async function GET() {
  const r = await getUserRestrictions()
  if (!r) return NextResponse.json({ role: null, isAdmin: false }, { status: 401 })
  const isAdmin = r.role === 'superadmin' || r.role === 'admin'
  return NextResponse.json({ role: r.role, isAdmin })
}
