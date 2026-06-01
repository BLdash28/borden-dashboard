import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const DEPT_HOME: Record<string, string> = {
  comercial:   '/comercial',
  mercadeo:    '/mercadeo',
  operaciones: '/operaciones',
  finanzas:    '/finanzas',
}

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, dashboards')
    .eq('id', user!.id)
    .single()

  let destination = '/dashboard/comercial'
  if (profile?.role === 'usuario' && Array.isArray(profile.dashboards) && profile.dashboards.length > 0) {
    const first = profile.dashboards[0] as string
    if (DEPT_HOME[first]) {
      destination = `/dashboard${DEPT_HOME[first]}`
    }
  }

  redirect(destination)
}
