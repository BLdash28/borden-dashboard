'use client'
import { useState } from 'react'
import { RefreshCw } from 'lucide-react'

interface Props { profile?: any; onRefresh?: () => void }

export default function TopbarOperaciones({ profile, onRefresh }: Props) {
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = () => {
    setRefreshing(true)
    onRefresh?.()
    setTimeout(() => window.location.reload(), 100)
  }

  return (
    <header className="sticky top-0 z-30 px-6 py-3 flex items-center justify-between border-b"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-4">
        <div>
          <div className="text-[9px] tracking-[2px] uppercase mb-0.5" style={{ color: 'var(--acc)' }}>
            BL Food
          </div>
          <div className="font-display font-bold text-[15px]" style={{ color: 'var(--t1)' }}>
            Dashboard Operaciones
          </div>
        </div>
      </div>
      <button onClick={handleRefresh} disabled={refreshing}
        className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all hover:border-brand-500 hover:text-brand-500 disabled:opacity-60"
        style={{ borderColor: 'var(--border)', color: 'var(--t2)', background: 'var(--card)' }}>
        <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
        Actualizar Datos
      </button>
    </header>
  )
}
