'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/utils/helpers'
import {
  BarChart2, TrendingUp, ShoppingCart, ArrowUpRight, Target,
  Package, Globe2, Tag, Store, ShoppingBag,
  FileText, Users, LogOut, ChevronDown, ChevronRight, FileCheck, Settings,
  Box, Archive,
  Truck
} from 'lucide-react'

const MENUS: Record<string, { section: string; items: { href: string; icon: any; label: string }[] }[]> = {
  comercial: [
    {
      section: 'Vistas',
      items: [
        { href: '/resumen',      icon: BarChart2,    label: 'Resumen Ejecutivo'   },
        { href: '/ventas-pais',  icon: Globe2,       label: 'Ventas Diarias x País'},
        { href: '/sellout',      icon: ShoppingCart, label: 'Ventas Sellout'      },
        { href: '/crecimientos', icon: ArrowUpRight, label: 'Crecimientos YTD'    },
        { href: '/cumplimiento', icon: Target,       label: 'Cumplimiento'        },
        { href: '/doh',          icon: Package,      label: 'Inventarios DOH'     },
        { href: '/coberturas',   icon: TrendingUp,   label: 'Coberturas'          },
      ],
    },
    {
      section: 'Dimensiones',
      items: [
        { href: '/productos', icon: Package, label: 'Productos' },
      ],
    },
    {
      section: 'Reportes',
      items: [
        { href: '/reportes', icon: FileText, label: 'Reportes' },
      ],
    },
  ],
  mercadeo: [
    { section: 'Vistas', items: [{ href: '/resumen', icon: BarChart2, label: 'Resumen' }] },
  ],
  operaciones: [
    {
      section: 'Registros Sanitarios',
      items: [{ href: '/registros-sanitarios', icon: FileCheck, label: 'Registros Sanitarios' }],
    },
    {
      section: 'Logistica',
      items: [
        { href: '/logistica/corrugados', icon: Package,     label: 'Corrugados' },
        { href: '/logistica/empaque',    icon: ShoppingBag, label: 'Empaque'    },
      ],
    },
  ],
  finanzas: [
    { section: 'Vistas', items: [{ href: '/resumen', icon: BarChart2, label: 'Resumen' }] },
  ],
}

const DEPTS = ['comercial','mercadeo','operaciones','finanzas']
const DEPT_LABELS: Record<string,string> = {
  comercial:'Comercial', mercadeo:'Mercadeo', operaciones:'Operaciones', finanzas:'Finanzas'
}
const DEPT_HOME: Record<string,string> = {
  comercial:'/resumen', mercadeo:'/resumen', operaciones:'/registros-sanitarios', finanzas:'/resumen'
}

export default function Sidebar({ profile: profileProp }: { profile?: any }) {
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = createClient()
  const [deptOpen, setDeptOpen]         = useState(false)
  const [openSections, setOpenSections] = useState<Record<string,boolean>>({})
  const [profile, setProfile]           = useState<any>(profileProp ?? null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (data) setProfile(data)
    }
    load()
  }, [])

  const currentDept = DEPTS.find(d => pathname.includes(`/dashboard/${d}`)) || null
  const menus       = currentDept ? (MENUS[currentDept] || []) : []
  const isAdmin     = profile?.role === 'superadmin' || profile?.role === 'admin'

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  const toggleSection = (s: string) =>
    setOpenSections(prev => ({ ...prev, [s]: prev[s] === false ? true : false }))

  const isSectionOpen = (s: string) => openSections[s] !== false

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[220px] z-40 hidden lg:flex flex-col"
      style={{ background: '#111009' }}>

      {/* Logo */}
      <div className="px-4 py-4 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--acc)' }}>
            <span className="font-display font-black text-white text-[13px]">BL</span>
          </div>
          <div>
            <div className="font-display font-black text-[14px] text-white leading-tight">BL Food</div>
            <div className="text-[8px] tracking-[1.5px] uppercase text-white/25 truncate">
              {currentDept ? DEPT_LABELS[currentDept] : 'BI Platform'}
            </div>
          </div>
        </div>
      </div>

      {/* Dept selector */}
      <div className="px-2 py-1.5 border-b border-white/5 flex-shrink-0">
        <button onClick={() => setDeptOpen(!deptOpen)}
          className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[11px] transition-all hover:bg-white/5"
          style={{ color: 'var(--acc)' }}>
          <span className="truncate">{currentDept ? DEPT_LABELS[currentDept] : 'Seleccionar Dashboard'}</span>
          <ChevronDown size={11} className={cn('transition-transform flex-shrink-0 ml-1', deptOpen && 'rotate-180')} />
        </button>
        {deptOpen && (
          <div className="mt-1 space-y-0.5 pb-1">
            {DEPTS.map(d => (
              <Link key={d} href={`/dashboard/${d}${DEPT_HOME[d]}`}
                onClick={() => setDeptOpen(false)}
                className="block px-3 py-1.5 rounded-lg text-[11px] transition-all hover:bg-white/5"
                style={{ color: currentDept === d ? 'var(--acc)' : 'rgba(255,255,255,0.35)' }}>
                {DEPT_LABELS[d]}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-1.5 overflow-y-auto">
        {menus.map(group => (
          <div key={group.section}>
            <button onClick={() => toggleSection(group.section)}
              className="flex items-center justify-between w-full px-4 py-1.5 mt-1.5 group">
              <span className="text-[9px] tracking-[2px] uppercase font-medium" style={{ color: '#3a302a' }}>
                {group.section}
              </span>
              <ChevronRight size={10} className={cn('transition-transform', isSectionOpen(group.section) && 'rotate-90')}
                style={{ color: '#3a302a' }} />
            </button>

            {isSectionOpen(group.section) && group.items.map(item => {
              const fullHref = currentDept ? `/dashboard/${currentDept}${item.href}` : '#'
              const isActive = pathname === fullHref || pathname.startsWith(fullHref + '/')
              return (
                <Link key={item.href} href={fullHref}
                  className={cn(
                    'flex items-center gap-2.5 px-4 py-1.5 mx-2 rounded-lg text-[12px] transition-all',
                    isActive
                      ? 'text-white bg-white/10 font-medium'
                      : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                  )}>
                  <item.icon size={12} className="flex-shrink-0" />
                  <span className="truncate">{item.label}</span>
                  {isActive && <div className="ml-auto w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--acc)' }} />}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-white/5 flex-shrink-0">
        {profile && (
          <div className="flex items-center gap-2 mb-2.5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
              style={{ background: 'var(--acc)' }}>
              {(profile.full_name?.[0] || 'U').toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-medium text-white/80 truncate">{profile.full_name || 'Usuario'}</div>
              <div className="text-[9px] uppercase tracking-wide text-white/25">{profile.role}</div>
            </div>
          </div>
        )}
        <div className="space-y-0.5">
          {isAdmin && (
            <Link
              href="/dashboard/comercial/usuarios"
              className={cn(
                'flex items-center gap-2 text-[11px] transition-colors w-full px-1 py-1 rounded-lg',
                pathname.includes('/usuarios') ? 'text-white/70' : 'text-white/25 hover:text-white/50'
              )}>
              <Settings size={11} /> Configuración
            </Link>
          )}
          <button onClick={handleLogout}
            className="flex items-center gap-2 text-[11px] text-white/25 hover:text-red-400 transition-colors w-full px-1 py-1 rounded-lg">
            <LogOut size={11} /> Cerrar sesión
          </button>
        </div>
      </div>
    </aside>
  )
}
