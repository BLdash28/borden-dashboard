'use client'
import { useState, memo } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, ReferenceLine, Legend,
} from 'recharts'
import type { MonthlyRow } from '@/hooks/useAnalyticsQueries'

type Metric = 'usd' | 'units'

function fmt(n: number, metric: Metric) {
  if (metric === 'units') return n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n))
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K'
  return '$' + n.toFixed(0)
}

function ChartTooltip({ active, payload, label, metric }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl px-3 py-2.5 shadow-2xl min-w-[160px]"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--t3)' }}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center justify-between gap-3 mb-1">
          <span className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--t3)' }}>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="text-[12px] font-bold tabular-nums"
            style={{ color: p.color, fontFamily: "'JetBrains Mono', monospace" }}>
            {fmt(p.value, metric)}
          </span>
        </div>
      ))}
    </div>
  )
}

function SkeletonChart() {
  return (
    <div className="animate-pulse" style={{ height: 320 }}>
      <div className="flex items-end gap-2 h-full px-4 pb-8">
        {[60,80,45,90,70,55,85,65,75,50,95,40].map((h, i) => (
          <div key={i} className="flex-1 rounded-t"
            style={{ height: `${h}%`, background: 'var(--border)' }} />
        ))}
      </div>
    </div>
  )
}

interface Props {
  data:    MonthlyRow[]
  loading: boolean
}

export default memo(function MonthlyChart({ data, loading }: Props) {
  const [metric, setMetric] = useState<Metric>('usd')

  const barKey  = metric === 'usd' ? 'valor'    : 'unidades'
  const prevKey = metric === 'usd' ? 'valor_prev': null   // prior-year only for USD
  const hasTarget = data.some(r => r.target !== null)
  const hasPrev   = data.some(r => r.valor_prev !== null)

  return (
    <div className="rounded-2xl p-5"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>

      {/* Header + toggle */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[1.4px]"
            style={{ color: 'var(--t3)' }}>
            Evolución Mensual
          </p>
          {hasTarget && (
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--t3)', opacity: 0.6 }}>
              Meta = año anterior × 1.10
            </p>
          )}
        </div>
        <div className="flex rounded-lg overflow-hidden"
          style={{ border: '1px solid var(--border)' }}>
          {(['usd','units'] as Metric[]).map(m => (
            <button key={m}
              onClick={() => setMetric(m)}
              className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors"
              style={{
                background: metric === m ? 'var(--acc)' : 'transparent',
                color:      metric === m ? '#fff' : 'var(--t3)',
              }}>
              {m === 'usd' ? 'USD' : 'Uds'}
            </button>
          ))}
        </div>
      </div>

      {loading
        ? <SkeletonChart />
        : data.length === 0
          ? <div className="h-64 flex items-center justify-center text-[12px]"
              style={{ color: 'var(--t3)' }}>Sin datos</div>
          : (
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: 'var(--t3)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--t3)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={v => fmt(v, metric)}
                  width={55}
                />
                <Tooltip content={<ChartTooltip metric={metric} />} />

                {/* Main bars — color-coded by attainment */}
                <Bar dataKey={barKey} name="Actual" radius={[4,4,0,0]} maxBarSize={40}>
                  {data.map((row, i) => (
                    <Cell
                      key={i}
                      fill={
                        metric === 'usd' && row.color
                          ? row.color
                          : 'var(--acc)'
                      }
                    />
                  ))}
                </Bar>

                {/* Prior-year overlay line (USD only) */}
                {metric === 'usd' && hasPrev && (
                  <Line
                    type="monotone"
                    dataKey="valor_prev"
                    name="Año anterior"
                    stroke="#3a6fa8"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    dot={false}
                    connectNulls
                  />
                )}

                {/* Target line (USD only) */}
                {metric === 'usd' && hasTarget && (
                  <Line
                    type="monotone"
                    dataKey="target"
                    name="Meta"
                    stroke="#10b981"
                    strokeWidth={1.5}
                    strokeDasharray="6 3"
                    dot={false}
                    connectNulls
                  />
                )}

                {metric === 'usd' && (hasPrev || hasTarget) && (
                  <Legend
                    wrapperStyle={{ fontSize: 10, color: 'var(--t3)', paddingTop: 12 }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )
      }
    </div>
  )
})
