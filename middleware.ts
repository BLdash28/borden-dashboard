import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const DEPT_HOME: Record<string, string> = {
  comercial:   '/resumen',
  mercadeo:    '/resumen',
  operaciones: '/registros-sanitarios',
  finanzas:    '/resumen',
}
const VALID_DEPTS = Object.keys(DEPT_HOME)

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

  // Usuario autenticado: verificar nivel MFA una sola vez
  if (user) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    const needsMfa = aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2'

    // Rutas de auth: permitir mfa-challenge si es necesario, redirigir al dashboard si no
    if (pathname === '/' || pathname.startsWith('/auth')) {
      if (pathname === '/auth/mfa-challenge') {
        // Si ya verificó MFA → salir del challenge al dashboard
        if (!needsMfa) {
          return NextResponse.redirect(new URL('/dashboard', request.url))
        }
        return supabaseResponse
      }
      // Resto de /auth/* → dashboard
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
  if (user && pathname.startsWith('/dashboard/')) {
    const deptMatch = pathname.match(/^\/dashboard\/([^/]+)/)
    const dept = deptMatch?.[1]

    if (dept && VALID_DEPTS.includes(dept)) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, dashboards')
        .eq('id', user.id)
        .single()

      if (profile?.role === 'usuario') {
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
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
