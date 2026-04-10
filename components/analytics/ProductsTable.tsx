'use client'
import { useState, memo } from 'react'
import { ArrowUpDown, ArrowDown, ArrowUp } from 'lucide-react'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import type { ProductRow } from '@/hooks/useAnalyticsQueries'

type SortKey = 'valor' | 'unidades'

function fmt(n: number) {
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K'
  return '$' + n.toFixed(0)
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return <span style={{ color: 'var(--t3)', fontSize: 10 }}>—</span>
  const points = data.map((v, i) => ({ v }))
  const min = Math.min(...data)
  const max = Math.max(...data)
  const trend = data[data.length - 1] - data[0]
  const color = trend >= 0 ? '#10b981' : '#ef4444'

  return (
    <div style={{ width: 80, height: 28, display: 'inline-block' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function SkeletonRow() {
  return (
    <tr>
      {[20,40,120,80,70,70,60,80].map((w, i) => (
        <td key={i} className="py-3 pr-4">
          <div className="h-3 rounded animate-pulse" style={{ width: w, background: 'var(--border)' }} />
        </td>
      ))}
    </tr>
  )
}

interface Props {
  products: ProductRow[]
  loading:  boolean
}

function SortIcon({ col, active, dir }: { col: string; active: string; dir: 'asc'|'desc' }) {
  if (col !== active) return <ArrowUpDown size={11} style={{ color: 'var(--t3)', opacity: 0.4 }} />
  return dir === 'desc'
    ? <ArrowDown size={11} style={{ color: 'var(--acc)' }} />
    : <ArrowUp   size={11} style={{ color: 'var(--acc)' }} />
}

const BADGE: Record<string, string> = {
  QUESOS:         'bg-amber-500/10 text-amber-400',
  HELADOS:        'bg-blue-500/10 text-blue-400',
  'LECHE & CREMA':'bg-emerald-500/10 text-emerald-400',
}

export default memo(function ProductsTable({ products, loading }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('valor')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc')

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(k); setSortDir('desc') }
  }

  const sorted = [...products].sort((a, b) => {
    const diff = a[sortKey] - b[sortKey]
    return sortDir === 'desc' ? -diff : diff
  })

  const thClass = "text-left py-2.5 pr-4 text-[10px] font-bold uppercase tracking-[1.2px] select-none cursor-pointer whitespace-nowrap"

  return (
    <div className="rounded-2xl p-5"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>

      <p className="text-[11px] font-semibold uppercase tracking-[1.4px] mb-4"
        style={{ color: 'var(--t3)' }}>
        Top 10 Productos
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th className={thClass} style={{ color: 'var(--t3)', width: 32 }}>#</th>
              <th className={thClass} style={{ color: 'var(--t3)' }}>SKU</th>
              <th className={thClass} style={{ color: 'var(--t3)' }}>Descripción</th>
              <th className={thClass} style={{ color: 'var(--t3)' }}>Categoría</th>
              <th className={thClass} style={{ color: 'var(--t3)' }}
                onClick={() => toggleSort('valor')}>
                <span className="flex items-center gap-1">
                  USD <SortIcon col="valor" active={sortKey} dir={sortDir} />
                </span>
              </th>
              <th className={thClass} style={{ color: 'var(--t3)' }}
                onClick={() => toggleSort('unidades')}>
                <span className="flex items-center gap-1">
                  Unidades <SortIcon col="unidades" active={sortKey} dir={sortDir} />
                </span>
              </th>
              <th className={thClass} style={{ color: 'var(--t3)' }}>% Total</th>
              <th className={thClass} style={{ color: 'var(--t3)' }}>Tendencia</th>
            </tr>
          </thead>

          <tbody>
            {loading
              ? Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} />)
              : sorted.length === 0
                ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-[12px]"
                      style={{ color: 'var(--t3)' }}>
                      Sin datos para los filtros seleccionados
                    </td>
                  </tr>
                )
                : sorted.map((p, i) => (
                  <tr key={p.sku}
                    className="transition-colors"
                    style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="py-3 pr-4 text-[12px]" style={{ color: 'var(--t3)' }}>{i + 1}</td>

                    <td className="py-3 pr-4">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono"
                        style={{ background: 'var(--border)', color: 'var(--t2)' }}>
                        {p.sku}
                      </span>
                    </td>

                    <td className="py-3 pr-4 max-w-[200px]">
                      <span className="text-[12px] font-medium truncate block"
                        style={{ color: 'var(--t1)' }}>
                        {p.descripcion}
                      </span>
                    </td>

                    <td className="py-3 pr-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${BADGE[p.categoria] ?? 'bg-white/5 text-white/40'}`}>
                        {p.categoria}
                      </span>
                    </td>

                    <td className="py-3 pr-4 text-[13px] font-bold tabular-nums"
                      style={{ color: 'var(--t1)', fontFamily: "'JetBrains Mono', monospace" }}>
                      {fmt(p.valor)}
                    </td>

                    <td className="py-3 pr-4 text-[12px] tabular-nums"
                      style={{ color: 'var(--t2)' }}>
                      {p.unidades.toLocaleString()}
                    </td>

                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="rounded-full overflow-hidden flex-shrink-0"
                          style={{ width: 40, height: 4, background: 'var(--border)' }}>
                          <div className="h-full rounded-full"
                            style={{ width: `${Math.min(p.pct_total, 100)}%`, background: 'var(--acc)' }} />
                        </div>
                        <span className="text-[11px] tabular-nums" style={{ color: 'var(--t3)' }}>
                          {p.pct_total.toFixed(1)}%
                        </span>
                      </div>
                    </td>

                    <td className="py-3">
                      <Sparkline data={p.sparkline} />
                    </td>
                  </tr>
                ))
            }
          </tbody>
        </table>
      </div>
    </div>
  )
})
