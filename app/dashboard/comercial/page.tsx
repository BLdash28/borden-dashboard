import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import WelcomePanel from '@/components/layout/WelcomePanel'

export const dynamic = 'force-dynamic'

export default async function ComercialPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const meta   = user.user_metadata ?? {}
  const nombre = (meta.full_name || meta.name || user.email?.split('@')[0] || 'Bienvenido') as string

  return <WelcomePanel dept="ventas" nombre={nombre} />
}
