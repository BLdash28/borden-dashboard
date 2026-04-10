'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/utils/helpers'
import { FileCheck, LogOut, ChevronDown } from 'lucide-react'
import { useState } from 'react'

const DEPTS = ['comercial','mercadeo','operaciones','finanzas']
const DEPT_LABELS: Record<string,string> = {
  comercial:'Comercial', mercadeo:'Mercadeo', operaciones:'Operaciones', finanzas:'Finanzas'
}

export default function SidebarOperaciones({ profile }: { profile?: any }) {
  const pathname   = useRouter()
  const path       = usePathname()
  const supabase   = createClient()
  const router     = useRouter()
  const [deptOpen, setDeptOpen] = useState(false)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  const isActive = path.includes('/registros-sanitarios')

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
            <div className="text-[8px] tracking-[1.5px] uppercase text-white/25">Operaciones</div>
          </div>
        </div>
      </div>

      {/* Dept selector */}
      <div className="px-2 py-1.5 border-b border-white/5 flex-shrink-0">
        <button onClick={() => setDeptOpen(!deptOpen)}
          className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[11px] transition-all hover:bg-white/5"
          style={{ color: 'var(--acc)' }}>
          <span>Dashboard Operaciones</span>
          <ChevronDown size={11} className={cn('transition-transform flex-shrink-0', deptOpen && 'rotate-180')} />
        </button>
        {deptOpen && (
          <div className="mt-1 space-y-0.5 pb-1">
            {DEPTS.map(d => (
              <Link key={d} href={`/dashboard/${d}${d==='operaciones'?'/registros-sanitarios':'/resumen'}`}
                onClick={() => setDeptOpen(false)}
                className="block px-3 py-1.5 rounded-lg text-[11px] transition-all hover:bg-white/5"
                style={{ color: path.includes(`/${d}/`) ? 'var(--acc)' : 'rgba(255,255,255,0.35)' }}>
                {DEPT_LABELS[d]}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Nav — solo Registros Sanitarios */}
      <nav className="flex-1 py-3">
        <div className="text-[9px] tracking-[2px] uppercase font-medium px-4 py-1.5 mb-1"
          style={{ color: '#3a302a' }}>
          Registros Sanitarios
        </div>
        <Link href="/dashboard/operaciones/registros-sanitarios"
          className={cn(
            'flex items-center gap-2.5 px-4 py-2 mx-2 rounded-lg text-[12px] transition-all',
            isActive
              ? 'text-white bg-white/10 font-medium'
              : 'text-white/40 hover:text-white/70 hover:bg-white/5'
          )}>
          <FileCheck size={13} className="flex-shrink-0" />
          <span>Registros Sanitarios</span>
          {isActive && <div className="ml-auto w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--acc)' }} />}
        </Link>
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
        <button onClick={handleLogout}
          className="flex items-center gap-2 text-[11px] text-white/25 hover:text-red-400 transition-colors w-full">
          <LogOut size={11} /> Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
