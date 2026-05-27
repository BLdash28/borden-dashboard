'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/utils/helpers'
import {
  Menu, X, FileText, LogOut, ChevronDown, ChevronRight, Settings, Shield, Bell, Zap,
} from 'lucide-react'
import { MENUS, DEPTS, DEPT_LABELS, DEPT_HOME } from './nav-config'

export default function MobileNav({ profile }: { profile?: any }) {
  const [open, setOpen] = useState(false)
  const [deptOpen, setDeptOpen] = useState(false)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({})
  const [footerOpen, setFooterOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { setOpen(false) }, [pathname])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const currentDept = DEPTS.find(d => pathname.includes(`/dashboard/${d}`)) || null
  const menus = currentDept ? (MENUS[currentDept] || []) : []
  const isAdmin = profile?.role === 'superadmin' || profile?.role === 'admin'
  const visibleDepts = isAdmin
    ? DEPTS
    : DEPTS.filter(d => (Array.isArray(profile?.dashboards) ? profile.dashboards : []).includes(d))

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  const isSectionOpen = (s: string) => openSections[s] !== false
  const toggleSection = (s: string) =>
    setOpenSections(prev => ({ ...prev, [s]: !isSectionOpen(s) }))

  const isItemOpen = (key: string) => !!openItems[key]
  const toggleItem = (key: string) =>
    setOpenItems(prev => ({ ...prev, [key]: !prev[key] }))

  return (
    <>
      {/* Hamburger button */}
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden flex items-center justify-center w-11 h-11 rounded-lg transition-colors active:scale-95"
        style={{ color: 'var(--t2)' }}
        aria-label="Abrir menú"
      >
        <Menu size={22} />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          'fixed top-0 left-0 bottom-0 z-50 w-[280px] flex flex-col lg:hidden',
          'transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{ background: '#111009' }}
      >
        {/* Header */}
        <div className="px-4 py-4 border-b border-white/5 flex items-center justify-between flex-shrink-0">
          <img src="/borden-logo.png" alt="Borden" className="h-10 w-auto object-contain" />
          <button
            onClick={() => setOpen(false)}
            className="flex items-center justify-center w-11 h-11 rounded-lg text-white/40 hover:text-white/70 active:scale-95 transition-all"
            aria-label="Cerrar menú"
          >
            <X size={20} />
          </button>
        </div>

        {/* Dept selector */}
        <div className="px-3 py-2 border-b border-white/5 flex-shrink-0">
          <button
            onClick={() => setDeptOpen(!deptOpen)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] transition-all hover:bg-white/5 active:bg-white/10"
            style={{ color: 'var(--acc)' }}
          >
            <span className="truncate font-medium">
              {currentDept ? DEPT_LABELS[currentDept] : 'Seleccionar Dashboard'}
            </span>
            <ChevronDown size={13} className={cn('transition-transform flex-shrink-0 ml-1', deptOpen && 'rotate-180')} />
          </button>
          {deptOpen && (
            <div className="mt-1 space-y-0.5 pb-1">
              {visibleDepts.map(d => (
                <Link
                  key={d}
                  href={`/dashboard/${d}${DEPT_HOME[d]}`}
                  onClick={() => setDeptOpen(false)}
                  className="block px-3 py-2.5 rounded-lg text-[13px] transition-all hover:bg-white/5"
                  style={{ color: currentDept === d ? 'var(--acc)' : 'rgba(255,255,255,0.45)' }}
                >
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
              <button
                onClick={() => toggleSection(group.section)}
                className="flex items-center justify-between w-full px-4 py-2 mt-2 group"
              >
                <span className="text-[11px] tracking-[1.5px] uppercase font-bold" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  {group.section}
                </span>
                <ChevronRight
                  size={11}
                  className={cn('transition-transform', isSectionOpen(group.section) && 'rotate-90')}
                  style={{ color: 'rgba(255,255,255,0.3)' }}
                />
              </button>

              {isSectionOpen(group.section) && group.items.map(item => {
                if (item.children) {
                  const itemKey = group.section + ':' + item.label
                  const anyChildActive = item.children.some(c => pathname === c.href || pathname.startsWith(c.href + '/'))
                  const expanded = isItemOpen(itemKey)
                  return (
                    <div key={itemKey}>
                      <button
                        onClick={() => toggleItem(itemKey)}
                        className={cn(
                          'flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-[14px] transition-all w-full',
                          anyChildActive ? 'text-white/85' : 'text-white/45 hover:text-white/75 hover:bg-white/5 active:bg-white/10'
                        )}
                      >
                        <item.icon size={16} className="flex-shrink-0" />
                        <span className="truncate font-medium">{item.label}</span>
                        <ChevronRight
                          size={11}
                          className={cn('ml-auto flex-shrink-0 transition-transform', expanded && 'rotate-90')}
                          style={{ color: 'rgba(255,255,255,0.3)' }}
                        />
                      </button>
                      {expanded && item.children.map(child => {
                        const isActive = pathname === child.href || pathname.startsWith(child.href + '/')
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={cn(
                              'flex items-center gap-2 pl-10 pr-4 py-2 mx-2 rounded-lg text-[13px] transition-all',
                              isActive
                                ? 'text-white bg-white/10 font-medium'
                                : 'text-white/40 hover:text-white/70 hover:bg-white/5 active:bg-white/10'
                            )}
                          >
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
                  <Link
                    key={item.href}
                    href={fullHref}
                    className={cn(
                      'flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-[14px] transition-all',
                      isActive
                        ? 'text-white bg-white/10 font-medium'
                        : 'text-white/45 hover:text-white/75 hover:bg-white/5 active:bg-white/10'
                    )}
                  >
                    <item.icon size={16} className="flex-shrink-0" />
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
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 active:bg-white/10 transition-colors"
          >
            {profile ? (
              <>
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold text-white flex-shrink-0"
                  style={{ background: 'var(--acc)' }}
                >
                  {(profile.full_name?.[0] || 'U').toUpperCase()}
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <div className="text-[14px] font-semibold text-white/85 truncate">{profile.full_name || 'Usuario'}</div>
                  <div className="text-[11px] uppercase tracking-wide text-white/35">{profile.role}</div>
                </div>
              </>
            ) : (
              <div className="flex-1" />
            )}
            <ChevronDown size={14} className={cn('flex-shrink-0 transition-transform text-white/30', footerOpen && 'rotate-180')} />
          </button>

          {footerOpen && (
            <div className="px-3 pb-3 space-y-0.5">
              {isAdmin && (
                <Link
                  href="/dashboard/admin/usuarios"
                  className="flex items-center gap-2.5 text-[13px] text-white/35 hover:text-white/60 transition-colors w-full px-2 py-2 rounded-lg"
                >
                  <Settings size={16} /> Configuración
                </Link>
              )}
              {profile?.role === 'superadmin' && (
                <Link
                  href="/dashboard/configuraciones/integraciones"
                  className="flex items-center gap-2.5 text-[13px] text-white/35 hover:text-white/60 transition-colors w-full px-2 py-2 rounded-lg"
                >
                  <Zap size={16} /> Integraciones
                </Link>
              )}
              {profile?.role === 'superadmin' && (
                <Link
                  href="/dashboard/configuraciones/reporteria"
                  className="flex items-center gap-2.5 text-[13px] text-white/35 hover:text-white/60 transition-colors w-full px-2 py-2 rounded-lg"
                >
                  <FileText size={16} /> Reportería
                </Link>
              )}
              {profile?.role === 'superadmin' && (
                <Link
                  href="/dashboard/configuraciones/alertas"
                  className="flex items-center gap-2.5 text-[13px] text-white/35 hover:text-white/60 transition-colors w-full px-2 py-2 rounded-lg"
                >
                  <Bell size={16} /> Alertas
                </Link>
              )}
              <Link
                href="/dashboard/admin/seguridad"
                className="flex items-center gap-2.5 text-[13px] text-white/35 hover:text-white/60 transition-colors w-full px-2 py-2 rounded-lg"
              >
                <Shield size={16} /> Seguridad
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2.5 text-[13px] text-white/35 hover:text-red-400 transition-colors w-full px-2 py-2 rounded-lg"
              >
                <LogOut size={16} /> Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
