import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const DEPT_HOME: Record<string, string> = {
  comercial:   '/sellout/resumen',
  mercadeo:    '/tendencias',
  operaciones: '/registros-sanitarios',
  finanzas:    '/resumen',
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

  let destination = '/dashboard/comercial/sellout/resumen'
  if (profile?.role === 'usuario' && Array.isArray(profile.dashboards) && profile.dashboards.length > 0) {
    const first = profile.dashboards.find((d: string) => DEPT_HOME[d]) || profile.dashboards[0]
    if (first && DEPT_HOME[first]) {
      destination = `/dashboard/${first}${DEPT_HOME[first]}`
    }
  }

  redirect(destination)
}
