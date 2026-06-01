import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import WelcomePage from './_welcome'

export const dynamic = 'force-dynamic'

const DEPT_HOME: Record<string, string> = {
  comercial:   '/resumen',
  mercadeo:    '/resumen',
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

  // Determine destination
  let destination = '/dashboard/comercial/resumen'
  if (profile?.role === 'usuario' && Array.isArray(profile.dashboards) && profile.dashboards.length > 0) {
    const first = profile.dashboards.find((d: string) => DEPT_HOME[d]) || profile.dashboards[0]
    if (first && DEPT_HOME[first]) {
      destination = `/dashboard/${first}${DEPT_HOME[first]}`
    }
  }

  // Display name: metadata → email prefix
  const meta   = user!.user_metadata ?? {}
  const nombre = (meta.full_name || meta.name || user!.email?.split('@')[0] || 'Bienvenido') as string

  return <WelcomePage nombre={nombre} destination={destination} />
}
