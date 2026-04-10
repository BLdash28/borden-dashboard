import React from 'react'
import { cn } from '@/utils/helpers'

export function KpiCard({ label, value, sub, note, color = '#c8873a', icon, loading }: {
  label: string; value: string; sub?: string; note?: string; color?: string; icon?: string; loading?: boolean
}) {
  if (loading) {
    return (
      <div className="card p-5 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl" style={{ background: color }} />
        <div className="h-2.5 w-20 rounded animate-pulse mb-3" style={{ background: 'var(--border)' }} />
        <div className="h-7 w-28 rounded animate-pulse mb-3" style={{ background: 'var(--border)' }} />
        <div className="h-4 w-16 rounded-full animate-pulse" style={{ background: 'var(--border)' }} />
      </div>
    )
  }
  return (
    <div className="card p-5 relative overflow-hidden animate-fade-up">
      <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl" style={{ background: color }} />
      {icon && <div className="absolute top-4 right-4 text-xl opacity-20">{icon}</div>}
      <div className="text-[9px] tracking-[2px] uppercase font-medium mb-2" style={{ color: 'var(--t3)' }}>{label}</div>
      <div className="font-display text-[24px] md:text-[28px] font-bold leading-none tracking-tight" style={{ color: 'var(--t1)' }}>{value}</div>
      <div className="flex items-center gap-2 mt-2">
        {sub && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: color + '20', color }}>{sub}</span>}
        {note && <span className="text-[10.5px]" style={{ color: 'var(--t3)' }}>{note}</span>}
      </div>
    </div>
  )
}

export function SectionHeader({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <div className="font-display font-bold text-sm" style={{ color: 'var(--t1)' }}>{title}</div>
        {sub && <div className="text-[10.5px] mt-0.5" style={{ color: 'var(--t3)' }}>{sub}</div>}
      </div>
      {action}
    </div>
  )
}

export function HBar({ label, value, max, color = '#c8873a', suffix = '' }: {
  label: string; value: number; max: number; color?: string; suffix?: string
}) {
  const pct = max > 0 ? (value / max * 100) : 0
  return (
    <div className="mb-2">
      <div className="flex justify-between text-[11px] mb-1">
        <span className="truncate max-w-[65%]" style={{ color: 'var(--t2)' }}>{label}</span>
        <span className="font-semibold" style={{ color: 'var(--t1)' }}>{suffix}{value.toLocaleString('en-US')}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />
}

export function Badge({ children, color = '#c8873a' }: { children: React.ReactNode; color?: string }) {
  return (
    <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full"
      style={{ background: color + '18', color }}>
      {children}
    </span>
  )
}

export function Btn({ children, onClick, variant = 'primary', disabled, className, type = 'button', title }: {
  children: React.ReactNode; onClick?: () => void; variant?: 'primary'|'ghost'|'danger'
  disabled?: boolean; className?: string; type?: 'button'|'submit'; title?: string
}) {
  const variants = {
    primary: { background: 'var(--acc)', color: '#fff', borderColor: 'transparent' },
    ghost:   { background: 'transparent', color: 'var(--t2)', borderColor: 'var(--border)' },
    danger:  { background: '#ef4444', color: '#fff', borderColor: 'transparent' },
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title}
      className={cn('inline-flex items-center gap-2 text-[12px] font-medium px-4 py-2 rounded-lg border transition-all active:scale-[.98] disabled:opacity-50', className)}
      style={variants[variant]}>
      {children}
    </button>
  )
}
