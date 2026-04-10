'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/utils/helpers'
import {
  BarChart2, TrendingUp, ShoppingCart, ArrowUpRight, Target,
  Package, Globe2, Tag, Store, ShoppingBag,
  FileText, Users, LogOut, ChevronDown, ChevronRight, FileCheck, Settings, Shield,
  Truck, Box, Megaphone, Share2, DollarSign, CreditCard, Scale, PieChart, Zap, MapPin
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
        { href: '/visto-colombia', icon: MapPin,      label: 'Colombia'            },
        { href: '/sell-in',       icon: ShoppingCart, label: 'Ventas Sell In'     },
      ],
    },
    {
      section: 'Dimensiones',
      items: [
        { href: '/productos',   icon: Package,    label: 'Productos'   },
        { href: '/proyeccion',  icon: TrendingUp, label: 'Proyección'  },
        { href: '/ofertas',     icon: Tag,        label: 'Ofertas'     },
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
    {
      section: 'Análisis',
      items: [
        { href: '/tendencias',      icon: TrendingUp,  label: 'Tendencias de Ventas'  },
        { href: '/recomendaciones', icon: Target,       label: 'Recomendaciones SKU'   },
      ],
    },
    {
      section: 'Dimensiones',
      items: [
        { href: '/pais',       icon: Globe2,      label: 'Por País'             },
        { href: '/producto',   icon: ShoppingBag, label: 'Por Producto'         },
        { href: '/tienda',     icon: Store,       label: 'Por Tienda'           },
        { href: '/geografica', icon: MapPin,       label: 'Ranking Geográfico'   },
      ],
    },
    {
      section: 'Módulos',
      items: [
        { href: '/campanas',    icon: Megaphone,  label: 'Campañas'          },
        { href: '/share-voice', icon: Share2,     label: 'Share of Voice'    },
        { href: '/digital',     icon: TrendingUp, label: 'Rendimiento Digital'},
      ],
    },
  ],
  operaciones: [
    {
      section: 'Registros Sanitarios',
      items: [{ href: '/registros-sanitarios', icon: FileCheck, label: 'Registros Sanitarios' }],
    },
    {
      section: 'Logística',
      items: [
        { href: '/logistica/corrugados',           icon: Box,     label: 'Inv. Materiales Corrugados'      },
        { href: '/logistica/inv-materiales',       icon: Package, label: 'Inv. Materiales de Empaques'     },
        { href: '/logistica/inv-prod-terminados',  icon: Truck,   label: 'Inv. Productos Terminados'       },
        { href: '/logistica/inventario-pt',        icon: Package, label: 'Inventario PT Borden'            },
      ],
    },
    {
      section: 'Ventas',
      items: [
        { href: '/ventas/sell-in', icon: ShoppingCart, label: 'Ventas Sell In'    },
        { href: '/ventas/precios', icon: Tag,          label: 'Control de Precio' },
        { href: '/ventas/costos',  icon: DollarSign,   label: 'Costos y Márgenes' },
        { href: '/ventas/barrel',  icon: Package,      label: 'Leche'             },
        { href: '/ventas/block',   icon: Box,          label: 'Block'             },
      ],
    },
  ],
  finanzas: [
    {
      section: 'Vistas',
      items: [
        { href: '/resumen', icon: BarChart2, label: 'Resumen Ejecutivo' },
      ],
    },
    {
      section: 'Módulos',
      items: [
        { href: '/estado-resultados', icon: DollarSign,  label: 'Estado de Resultados' },
        { href: '/flujo-caja',        icon: CreditCard,  label: 'Flujo de Caja'        },
        { href: '/balance',           icon: Scale,       label: 'Balance General'      },
        { href: '/presupuesto',       icon: PieChart,    label: 'Presupuesto vs Real'  },
      ],
    },
  ],
}

const DEPTS = ['comercial','mercadeo','operaciones','finanzas']
const DEPT_LABELS: Record<string,string> = {
  comercial:'Comercial', mercadeo:'Mercadeo', operaciones:'Operaciones', finanzas:'Finanzas'
}
const DEPT_HOME: Record<string,string> = {
  comercial:'/resumen', mercadeo:'/tendencias', operaciones:'/registros-sanitarios', finanzas:'/resumen'
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
  const visibleDepts = isAdmin
    ? DEPTS
    : DEPTS.filter(d => (Array.isArray(profile?.dashboards) ? profile.dashboards : []).includes(d))

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  const toggleSection = (s: string) =>
    setOpenSections(prev => ({ ...prev, [s]: prev[s] === false ? true : false }))

  const isSectionOpen = (s: string) => openSections[s] !== false

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[260px] z-40 hidden lg:flex flex-col"
      style={{ background: '#111009' }}>

      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/5 flex-shrink-0 flex items-center justify-center">
        <img src="/borden-logo.png" alt="Borden" className="h-12 w-auto object-contain" />
      </div>

      {/* Dept selector */}
      <div className="px-3 py-2 border-b border-white/5 flex-shrink-0">
        <button onClick={() => setDeptOpen(!deptOpen)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] transition-all hover:bg-white/5"
          style={{ color: 'var(--acc)' }}>
          <span className="truncate font-medium">{currentDept ? DEPT_LABELS[currentDept] : 'Seleccionar Dashboard'}</span>
          <ChevronDown size={13} className={cn('transition-transform flex-shrink-0 ml-1', deptOpen && 'rotate-180')} />
        </button>
        {deptOpen && (
          <div className="mt-1 space-y-0.5 pb-1">
            {visibleDepts.map(d => (
              <Link key={d} href={`/dashboard/${d}${DEPT_HOME[d]}`}
                onClick={() => setDeptOpen(false)}
                className="block px-3 py-2 rounded-lg text-[13px] transition-all hover:bg-white/5"
                style={{ color: currentDept === d ? 'var(--acc)' : 'rgba(255,255,255,0.45)' }}>
                {DEPT_LABELS[d]}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {menus.map(group => (
          <div key={group.section}>
            <button onClick={() => toggleSection(group.section)}
              className="flex items-center justify-between w-full px-4 py-2 mt-2 group">
              <span className="text-[11px] tracking-[1.5px] uppercase font-bold" style={{ color: 'rgba(255,255,255,0.45)' }}>
                {group.section}
              </span>
              <ChevronRight size={11} className={cn('transition-transform', isSectionOpen(group.section) && 'rotate-90')}
                style={{ color: 'rgba(255,255,255,0.3)' }} />
            </button>

            {isSectionOpen(group.section) && group.items.map(item => {
              const fullHref = currentDept ? `/dashboard/${currentDept}${item.href}` : '#'
              const isActive = pathname === fullHref || pathname.startsWith(fullHref + '/')
              return (
                <Link key={item.href} href={fullHref}
                  className={cn(
                    'flex items-center gap-3 px-4 py-2 mx-2 rounded-lg text-[13px] transition-all',
                    isActive
                      ? 'text-white bg-white/10 font-medium'
                      : 'text-white/45 hover:text-white/75 hover:bg-white/5'
                  )}>
                  <item.icon size={14} className="flex-shrink-0" />
                  <span className="truncate">{item.label}</span>
                  {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--acc)' }} />}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-white/5 flex-shrink-0">
        {profile && (
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold text-white flex-shrink-0"
              style={{ background: 'var(--acc)' }}>
              {(profile.full_name?.[0] || 'U').toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold text-white/85 truncate">{profile.full_name || 'Usuario'}</div>
              <div className="text-[11px] uppercase tracking-wide text-white/35">{profile.role}</div>
            </div>
          </div>
        )}
        <div className="space-y-1">
          {isAdmin && (
            <Link
              href="/dashboard/admin/usuarios"
              className={cn(
                'flex items-center gap-2.5 text-[13px] transition-colors w-full px-2 py-2 rounded-lg',
                pathname.includes('/usuarios') ? 'text-white/75' : 'text-white/35 hover:text-white/60'
              )}>
              <Settings size={14} /> Configuración
            </Link>
          )}
          <Link
            href="/dashboard/admin/seguridad"
            className={cn(
              'flex items-center gap-2.5 text-[13px] transition-colors w-full px-2 py-2 rounded-lg',
              pathname.includes('/seguridad') ? 'text-white/75' : 'text-white/35 hover:text-white/60'
            )}>
            <Shield size={14} /> Seguridad
          </Link>
          <button onClick={handleLogout}
            className="flex items-center gap-2.5 text-[13px] text-white/35 hover:text-red-400 transition-colors w-full px-2 py-2 rounded-lg">
            <LogOut size={14} /> Cerrar sesión
          </button>
        </div>
      </div>
    </aside>
  )
}
