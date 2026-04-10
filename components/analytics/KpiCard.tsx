'use client'
import { ArrowUpRight, ArrowDownRight, type LucideIcon } from 'lucide-react'

interface Props {
  title:   string
  value:   string
  delta?:  number | null   // % change vs prior period
  sub?:    string          // secondary line (e.g. "42 países")
  icon:    LucideIcon
  accent?: string          // hex color for icon + border glow
  loading?: boolean
}

function Skeleton() {
  return (
    <div className="rounded-2xl p-5 animate-pulse"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
      <div className="h-3 w-24 rounded mb-4" style={{ background: 'var(--border)' }} />
      <div className="h-8 w-32 rounded mb-2" style={{ background: 'var(--border)' }} />
      <div className="h-2.5 w-16 rounded"   style={{ background: 'var(--border)' }} />
    </div>
  )
}

export default function KpiCard({ title, value, delta, sub, icon: Icon, accent = 'var(--acc)', loading }: Props) {
  if (loading) return <Skeleton />

  const deltaPos = delta !== null && delta !== undefined && delta >= 0

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3 transition-all duration-200"
      style={{
        background:  'var(--card)',
        border:      '1px solid var(--border)',
        boxShadow:   `0 0 0 0 ${accent}00`,
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[1.4px]"
          style={{ color: 'var(--t3)' }}>
          {title}
        </p>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: accent + '18' }}>
          <Icon size={15} style={{ color: accent }} />
        </div>
      </div>

      {/* Value */}
      <div>
        <p className="text-[28px] font-bold leading-none tracking-tight"
          style={{ color: 'var(--t1)', fontFamily: "'JetBrains Mono', monospace" }}>
          {value}
        </p>
        {sub && (
          <p className="text-[11px] mt-1.5" style={{ color: 'var(--t3)' }}>{sub}</p>
        )}
      </div>

      {/* Delta badge */}
      {delta !== null && delta !== undefined && (
        <div className="flex items-center gap-1.5">
          <div
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[11px] font-bold"
            style={{
              background: deltaPos ? '#10b98118' : '#ef444418',
              color:      deltaPos ? '#10b981'   : '#ef4444',
            }}
          >
            {deltaPos
              ? <ArrowUpRight size={11} />
              : <ArrowDownRight size={11} />}
            {Math.abs(delta).toFixed(1)}%
          </div>
          <span className="text-[10px]" style={{ color: 'var(--t3)' }}>vs año anterior</span>
        </div>
      )}
    </div>
  )
}
