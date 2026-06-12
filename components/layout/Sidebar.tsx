'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/utils/helpers'
import {
  FileText, LogOut, ChevronDown, ChevronRight, Settings, Shield, Bell, Zap,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import { MENUS, DEPTS, DEPT_LABELS, DEPT_HOME } from './nav-config'

export default function Sidebar({ profile: profileProp }: { profile?: any }) {
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = createClient()
  const [deptOpen, setDeptOpen]         = useState(false)
  const [openSections, setOpenSections] = useState<Record<string,boolean>>({})
  const [openItems, setOpenItems]       = useState<Record<string,boolean>>({})
  const [profile, setProfile]           = useState<any>(profileProp ?? null)
  const [footerOpen, setFooterOpen]     = useState(false)
  const [collapsed, setCollapsed]       = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (data) setProfile(data)
    }
    load()
  }, [])

  // Sidebar colapsado: persistir en localStorage y sincronizar con clase en <html>
  useEffect(() => {
    const saved = typeof window !== 'undefined' && localStorage.getItem('sidebar-collapsed') === '1'
    setCollapsed(saved)
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('sidebar-collapsed', saved)
    }
  }, [])

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev
      if (typeof window !== 'undefined') localStorage.setItem('sidebar-collapsed', next ? '1' : '0')
      if (typeof document !== 'undefined') document.documentElement.classList.toggle('sidebar-collapsed', next)
      return next
    })
  }

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
    setOpenSections(prev => ({ ...prev, [s]: !isSectionOpen(s) }))
  const toggleItem = (key: string) =>
    setOpenItems(prev => ({ ...prev, [key]: !prev[key] }))

  // Auto-abrir la sección cuyo item coincida con la URL actual
  const sectionHasActiveItem = (section: string) => {
    const group = menus.find(g => g.section === section)
    if (!group) return false
    return group.items.some(item => {
      if (item.children) {
        return item.children.some(c => pathname === c.href || pathname.startsWith(c.href + '/'))
      }
      const fullHref = currentDept ? `/dashboard/${currentDept}${item.href}` : '#'
      return pathname === fullHref || pathname.startsWith(fullHref + '/')
    })
  }
  const isSectionOpen = (s: string) => {
    if (openSections[s] !== undefined) return openSections[s]
    return sectionHasActiveItem(s)
  }
  const isItemOpen = (key: string) => !!openItems[key]

  return (
    <>
      {/* Botón flotante para reabrir cuando está colapsado (lg+) — posicionado debajo del topbar */}
      {collapsed && (
        <button
          onClick={toggleCollapsed}
          className="fixed left-4 top-14 z-50 hidden lg:flex items-center gap-2 px-3.5 h-10 rounded-xl text-white font-medium text-[13px] shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all border border-white/10"
          style={{ background: 'var(--acc)' }}
          aria-label="Abrir menú"
        >
          <PanelLeftOpen size={17} strokeWidth={2.5} />
          <span>Menú</span>
        </button>
      )}

      <aside className={cn(
        'sidebar-aside fixed left-0 top-0 bottom-0 w-[260px] z-40 hidden lg:flex flex-col transition-transform duration-200',
        collapsed && '-translate-x-full'
      )}
      style={{ background: '#111009' }}>

      {/* Logo + toggle close */}
      <div className="px-4 py-5 border-b border-white/5 flex-shrink-0 flex items-center justify-between gap-2">
        <img src="/borden-logo.png" alt="Borden" className="h-12 w-auto object-contain" />
        <button
          onClick={toggleCollapsed}
          className="flex items-center justify-center w-7 h-7 rounded-md text-white/40 hover:text-white/80 hover:bg-white/5 transition-all flex-shrink-0"
          aria-label="Cerrar menú"
        >
          <PanelLeftClose size={15} />
        </button>
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
              if (item.children) {
                const itemKey = group.section + ':' + item.label
                const anyChildActive = item.children.some(c => pathname === c.href || pathname.startsWith(c.href + '/'))
                const open = isItemOpen(itemKey)
                return (
                  <div key={itemKey}>
                    <button onClick={() => toggleItem(itemKey)}
                      className={cn(
                        'flex items-center gap-3 px-4 py-2 mx-2 rounded-lg text-[13px] transition-all w-full',
                        anyChildActive ? 'text-white/85' : 'text-white/45 hover:text-white/75 hover:bg-white/5'
                      )}>
                      <item.icon size={14} className="flex-shrink-0" />
                      <span className="truncate font-medium">{item.label}</span>
                      <ChevronRight size={11} className={cn('ml-auto flex-shrink-0 transition-transform', open && 'rotate-90')}
                        style={{ color: 'rgba(255,255,255,0.3)' }} />
                    </button>
                    {open && item.children.map(child => {
                      const isActive = pathname === child.href || pathname.startsWith(child.href + '/')
                      return (
                        <Link key={child.href} href={child.href}
                          className={cn(
                            'flex items-center gap-2 pl-10 pr-4 py-1.5 mx-2 rounded-lg text-[12px] transition-all',
                            isActive
                              ? 'text-white bg-white/10 font-medium'
                              : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                          )}>
                          <span className="truncate">{child.label}</span>
                          {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--acc)' }} />}
                        </Link>
                      )
                    })}
                  </div>
                )
              }

              const fullHref = currentDept ? `/dashboard/${currentDept}${item.href}` : '#'
              const isActive = pathname === fullHref ||
                (pathname.startsWith(fullHref + '/') &&
                  fullHref !== `/dashboard/${currentDept}/sell-in` &&
                  fullHref !== `/dashboard/${currentDept}/sellout`)
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
      <div className="border-t border-white/5 flex-shrink-0">
        <button
          onClick={() => setFooterOpen(v => !v)}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
        >
          {profile ? (
            <>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold text-white flex-shrink-0"
                style={{ background: 'var(--acc)' }}>
                {(profile.full_name?.[0] || 'U').toUpperCase()}
              </div>
              <div className="min-w-0 flex-1 text-left">
                <div className="text-[13px] font-semibold text-white/85 truncate">{profile.full_name || 'Usuario'}</div>
                <div className="text-[10px] uppercase tracking-wide text-white/35">{profile.role}</div>
              </div>
            </>
          ) : (
            <div className="flex-1" />
          )}
          <ChevronDown size={13} className={cn('flex-shrink-0 transition-transform text-white/30', footerOpen && 'rotate-180')} />
        </button>

        {footerOpen && (
          <div className="px-3 pb-3 space-y-0.5">
            {isAdmin && (
              <Link
                href="/dashboard/admin/usuarios"
                className={cn(
                  'flex items-center gap-2.5 text-[13px] transition-colors w-full px-2 py-2 rounded-lg',
                  pathname.includes('/admin/usuarios') ? 'text-white/75' : 'text-white/35 hover:text-white/60'
                )}>
                <Settings size={14} /> Configuración
              </Link>
            )}
            {profile?.role === 'superadmin' && (
              <Link
                href="/dashboard/configuraciones/integraciones"
                className={cn(
                  'flex items-center gap-2.5 text-[13px] transition-colors w-full px-2 py-2 rounded-lg',
                  pathname.includes('/configuraciones/integraciones') ? 'text-white/75' : 'text-white/35 hover:text-white/60'
                )}>
                <Zap size={14} /> Integraciones
              </Link>
            )}
            {profile?.role === 'superadmin' && (
              <Link
                href="/dashboard/configuraciones/reporteria"
                className={cn(
                  'flex items-center gap-2.5 text-[13px] transition-colors w-full px-2 py-2 rounded-lg',
                  pathname.includes('/configuraciones/reporteria') ? 'text-white/75' : 'text-white/35 hover:text-white/60'
                )}>
                <FileText size={14} /> Reportería
              </Link>
            )}
            {profile?.role === 'superadmin' && (
              <Link
                href="/dashboard/configuraciones/alertas"
                className={cn(
                  'flex items-center gap-2.5 text-[13px] transition-colors w-full px-2 py-2 rounded-lg',
                  pathname.includes('/configuraciones/alertas') ? 'text-white/75' : 'text-white/35 hover:text-white/60'
                )}>
                <Bell size={14} /> Alertas
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
        )}
      </div>
    </aside>
    </>
  )
}
