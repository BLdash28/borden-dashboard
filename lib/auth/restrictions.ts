import { createClient } from '@/lib/supabase/server'

export interface UserRestrictions {
  role: string
  dashboards: string[]
  paises: string[]
  isRestricted: boolean  // true when role === 'usuario'
}

export async function getUserRestrictions(): Promise<UserRestrictions | null> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, dashboards, paises')
      .eq('id', user.id)
      .single()

    if (!profile) return null

    return {
      role:         profile.role || 'usuario',
      dashboards:   Array.isArray(profile.dashboards) ? profile.dashboards : [],
      paises:       Array.isArray(profile.paises)     ? profile.paises     : [],
      isRestricted: profile.role === 'usuario',
    }
  } catch {
    return null
  }
}
