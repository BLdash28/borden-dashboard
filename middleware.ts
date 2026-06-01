import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const DEPT_HOME: Record<string, string> = {
  comercial:   '',
  mercadeo:    '',
  operaciones: '',
  finanzas:    '',
}
const VALID_DEPTS = Object.keys(DEPT_HOME)

// Profile cached in a short-lived cookie so middleware doesn't hit the DB every request.
const PROFILE_COOKIE = 'bl_pcache'
const PROFILE_TTL    = 600 // seconds (10 min)

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresca la sesión — CRÍTICO para SSR
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Sin sesión → login
  if (!user && pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  // Usuario autenticado: cargar perfil con caché de cookie (evita DB call por request)
  let profile: { role: string; dashboards: string[]; require_mfa: boolean; uid: string; exp: number } | null = null
  if (user) {
    const raw = request.cookies.get(PROFILE_COOKIE)?.value
    if (raw) {
      try {
        const cached = JSON.parse(raw)
        if (cached.uid === user.id && cached.exp > Date.now() / 1000) {
          profile = cached
        }
      } catch { /* cookie corrupta — se recarga */ }
    }

    if (!profile) {
      const { data } = await supabase
        .from('profiles')
        .select('role, dashboards, require_mfa')
        .eq('id', user.id)
        .single()
      if (data) {
        profile = { ...data, uid: user.id, exp: Math.floor(Date.now() / 1000) + PROFILE_TTL }
        supabaseResponse.cookies.set(
          PROFILE_COOKIE,
          JSON.stringify(profile),
          { httpOnly: true, secure: true, sameSite: 'lax', maxAge: PROFILE_TTL }
        )
      }
    }
  }

  if (user) {
    const isSuperadmin = profile?.role === 'superadmin'
    const mfaRequired  = !isSuperadmin && profile?.require_mfa === true

    // Calcular si hay MFA pendiente solo cuando aplica
    let needsMfa = false
    if (mfaRequired) {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      needsMfa = aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2'
    }

    // Rutas de auth
    if (pathname === '/' || pathname.startsWith('/auth')) {
      if (pathname === '/auth/mfa-challenge') {
        if (!needsMfa) {
          return NextResponse.redirect(new URL('/dashboard', request.url))
        }
        return supabaseResponse
      }
      if (pathname === '/auth/reset-password' || pathname === '/auth/callback') {
        return supabaseResponse
      }
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // Rutas del dashboard: si tiene MFA pendiente → challenge (salvo dispositivo de confianza)
    if (pathname.startsWith('/dashboard') && needsMfa) {
      const trusted = request.cookies.get('mfa_trusted_device')?.value
      if (!trusted) {
        return NextResponse.redirect(new URL('/auth/mfa-challenge', request.url))
      }
    }
  }

  // Control de acceso por departamento para rol 'usuario'
  if (user && profile?.role === 'usuario' && pathname.startsWith('/dashboard/')) {
    const deptMatch = pathname.match(/^\/dashboard\/([^/]+)/)
    const dept = deptMatch?.[1]

    if (dept && VALID_DEPTS.includes(dept)) {
      const allowed: string[] = Array.isArray(profile.dashboards) ? profile.dashboards : []

      if (!allowed.includes(dept)) {
        const firstDept = VALID_DEPTS.find(d => allowed.includes(d))
        if (firstDept) {
          return NextResponse.redirect(
            new URL(`/dashboard/${firstDept}${DEPT_HOME[firstDept]}`, request.url)
          )
        }
        return NextResponse.redirect(new URL('/auth/login', request.url))
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Excluir: archivos estáticos, imágenes, rutas de API (tienen su propio auth)
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
