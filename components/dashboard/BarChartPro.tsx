'use client'
import { useState, useCallback, memo, useId } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Cell, ResponsiveContainer, ReferenceLine, LabelList,
} from 'recharts'

// ── Helpers ───────────────────────────────────────────────────────────────────
export const BAR_PALETTE = ['#c8873a','#2a7a58','#3a6fa8','#6b4fa8','#c0402f','#2a8a8a','#a86a2a','#1a6a48']

// Darker text colors for labels (for readability over lighter gradient bottoms)
const LABEL_DARK: Record<string, string> = {
  '#c8873a': '#92400e', '#f59e0b': '#92400e', '#fbbf24': '#92400e',
  '#2a7a58': '#065f46', '#10b981': '#065f46', '#34d399': '#065f46',
  '#3a6fa8': '#1e3a8a', '#3b82f6': '#1e40af', '#60a5fa': '#1e40af',
  '#6b4fa8': '#6b21a8',
  '#c0402f': '#b91c1c', '#ef4444': '#b91c1c',
  '#2a8a8a': '#115e59',
  '#a86a2a': '#78350f',
  '#1a6a48': '#064e3b',
  '#d1d5db': '#4b5563', '#94a3b8': '#475569',
}
function labelDark(hex: string): string {
  return LABEL_DARK[hex.toLowerCase?.() ?? hex] || LABEL_DARK[hex] || '#334155'
}

// Lighter variant used for gradient bottom stop
const LIGHTER: Record<string, string> = {
  '#c8873a': '#f59e0b', '#f59e0b': '#fbbf24',
  '#2a7a58': '#4a9b78', '#10b981': '#34d399',
  '#3a6fa8': '#5b8ec7', '#3b82f6': '#60a5fa',
  '#6b4fa8': '#8b6fc7',
  '#c0402f': '#e05a49', '#ef4444': '#f87171',
  '#2a8a8a': '#4aabab',
  '#a86a2a': '#c88a4a',
  '#1a6a48': '#3a8a68',
  '#d1d5db': '#e5e7eb',
}
function lighter(hex: string): string {
  return LIGHTER[hex.toLowerCase?.() ?? hex] || LIGHTER[hex] || hex
}

function fmtDefault(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return String(Math.round(n))
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface MultiBarDef { key: string; color: string; label: string }

interface Props {
  data:          any[]
  dataKey?:      string
  nameKey:       string
  layout?:       'vertical' | 'horizontal'
  colors?:       string | string[]
  height?:       number
  formatter?:    (v: number) => string
  tooltipUnit?:  string
  refLine?:      { y: number; label: string; color: string }
  multiBar?:     MultiBarDef[]
  showLabels?:   boolean
  labelFmt?:     (v: number) => string
  yTickFmt?:     (v: any) => string
  xTickFmt?:     (v: any) => string
  xAngle?:       number
  nameMaxLen?:   number
  margin?:       any
  yDomain?:      [number | string, number | string]
  yWidth?:       number
  maxBarSize?:   number
  barCategoryGap?: string | number
  onSelect?:     (value: string | null) => void
}

// ── Canonical light Tooltip ───────────────────────────────────────────────────
function ProTooltip({ active, payload, label, formatter, unit }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: 10,
      padding: '8px 12px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
      fontSize: 12,
      minWidth: 140,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#334155', marginBottom: 6 }}>{label}</div>
      {payload.map((p: any, i: number) => {
        const c = p.payload?.[p.dataKey + '__color'] ?? p.color ?? p.fill ?? '#c8873a'
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            marginBottom: i < payload.length - 1 ? 3 : 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
              <span style={{ fontSize: 11, color: '#64748b' }}>{p.name || unit || 'Valor'}</span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
              {formatter ? formatter(Number(p.value)) : p.value}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────
export const BarChartPro = memo(function BarChartPro({
  data, dataKey = 'value', nameKey,
  layout = 'horizontal', colors = BAR_PALETTE,
  height = 240, formatter = fmtDefault, tooltipUnit,
  refLine, multiBar, showLabels = false, labelFmt,
  yTickFmt, xTickFmt, xAngle = 0, nameMaxLen = 22,
  margin, yDomain, yWidth, maxBarSize, barCategoryGap = '20%', onSelect,
}: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const gid = useId().replace(/[:]/g, '')

  const colorOf = useCallback((i: number): string => {
    if (typeof colors === 'string') return colors
    return (colors as string[])[i % (colors as string[]).length]
  }, [colors])

  const opacityOf = useCallback((i: number): number => {
    if (selectedIdx !== null) return selectedIdx === i ? 1 : 0.1
    if (hoveredIdx  !== null) return hoveredIdx  === i ? 1 : 0.3
    return 1
  }, [selectedIdx, hoveredIdx])

  const onEnter    = useCallback((_: any, idx: number) => setHoveredIdx(idx),  [])
  const onLeave    = useCallback(() => setHoveredIdx(null), [])
  const onClickBar = useCallback((_: any, idx: number) => {
    setSelectedIdx(prev => {
      const next = prev === idx ? null : idx
      onSelect?.(next !== null ? data[next]?.[nameKey] ?? null : null)
      return next
    })
  }, [data, nameKey, onSelect])

  const isVert  = layout === 'vertical'
  const truncate = (s: string) => s.length > nameMaxLen ? s.slice(0, nameMaxLen) + '…' : s

  const defaultMargin = isVert
    ? { top: 10, right: 56, left: 8, bottom: 4 }
    : { top: 10, right: 10, left: 0, bottom: xAngle !== 0 ? 52 : 0 }
  const m = { ...defaultMargin, ...margin }

  const barRadius = isVert
    ? ([0, 8, 8, 0] as [number,number,number,number])
    : ([8, 8, 0, 0] as [number,number,number,number])

  // Palette resolved once for gradient defs (single-series only; multiBar has its own colors)
  const singleColor = typeof colors === 'string' ? colors : null

  const sharedBar = {
    isAnimationActive:  true,
    animationBegin:     0,
    animationDuration:  600,
    animationEasing:    'ease-out' as const,
    onMouseEnter:       onEnter,
    onMouseLeave:       onLeave,
    onClick:            onClickBar,
    style:              { cursor: 'pointer' },
  }

  return (
    <div className="relative select-none">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout={layout} margin={m} barCategoryGap={barCategoryGap}>
          <defs>
            {multiBar
              ? multiBar.map(mb => (
                  <linearGradient key={mb.key} id={`grad_${gid}_${mb.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={mb.color}          stopOpacity={1}/>
                    <stop offset="100%" stopColor={lighter(mb.color)} stopOpacity={0.85}/>
                  </linearGradient>
                ))
              : singleColor
                ? (
                  <linearGradient id={`grad_${gid}_single`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={singleColor}          stopOpacity={1}/>
                    <stop offset="100%" stopColor={lighter(singleColor)} stopOpacity={0.85}/>
                  </linearGradient>
                )
                : (Array.isArray(colors) ? colors : []).map((c, i) => (
                    <linearGradient key={i} id={`grad_${gid}_c${i}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={c}          stopOpacity={1}/>
                      <stop offset="100%" stopColor={lighter(c)} stopOpacity={0.85}/>
                    </linearGradient>
                  ))
            }
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />

          {isVert ? (
            <>
              <XAxis type="number"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false} tickLine={false}
                tickFormatter={xTickFmt ?? formatter} />
              <YAxis type="category" dataKey={nameKey}
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false} tickLine={false}
                width={yWidth ?? 130} tickFormatter={truncate} />
            </>
          ) : (
            <>
              <XAxis dataKey={nameKey}
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false} tickLine={false}
                tickFormatter={v => xTickFmt ? xTickFmt(v) : truncate(String(v))}
                angle={xAngle} textAnchor={xAngle !== 0 ? 'end' : 'middle'}
                height={xAngle !== 0 ? 56 : 30} interval={0} />
              <YAxis
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false} tickLine={false}
                tickFormatter={yTickFmt ?? formatter}
                width={yWidth ?? 60}
                {...(yDomain ? { domain: yDomain } : {})} />
            </>
          )}

          <Tooltip
            content={<ProTooltip formatter={formatter} unit={tooltipUnit} />}
            wrapperStyle={{ zIndex: 50, outline: 'none' }}
            cursor={{ fill: 'rgba(148,163,184,0.08)' }}
          />

          {refLine && (
            <ReferenceLine
              y={refLine.y} stroke={refLine.color} strokeDasharray="4 4"
              label={{ value: refLine.label, fontSize: 9, fill: refLine.color, position: 'insideTopRight' }}
            />
          )}

          {multiBar ? (
            multiBar.map((mb, mi) => (
              <Bar key={mb.key} dataKey={mb.key} fill={`url(#grad_${gid}_${mb.key})`}
                radius={barRadius} name={mb.label} maxBarSize={maxBarSize ?? (multiBar.length >= 3 ? 28 : 34)} {...sharedBar}>
                {data.map((_, i) => (
                  <Cell key={i} opacity={opacityOf(i)}
                    style={{ transition: 'opacity 0.18s ease-out', cursor: 'pointer' }}
                  />
                ))}
                {showLabels && (
                  <LabelList dataKey={mb.key} position={isVert ? 'right' : 'top'}
                    style={{ fontSize: 9, fill: labelDark(mb.color), fontWeight: 700 }}
                    formatter={labelFmt ?? formatter} />
                )}
              </Bar>
            ))
          ) : (
            <Bar dataKey={dataKey} radius={barRadius}
              fill={singleColor ? `url(#grad_${gid}_single)` : undefined}
              maxBarSize={maxBarSize ?? 40}
              name={tooltipUnit ?? dataKey} {...sharedBar}>
              {data.map((_, i) => {
                const base = colorOf(i)
                const fill = singleColor
                  ? `url(#grad_${gid}_single)`
                  : `url(#grad_${gid}_c${i % (Array.isArray(colors) ? colors.length : 1)})`
                return (
                  <Cell key={i}
                    fill={fill}
                    opacity={opacityOf(i)}
                    style={{
                      cursor: 'pointer',
                      transition: 'opacity 0.18s ease-out',
                      filter: hoveredIdx === i
                        ? `brightness(1.08) drop-shadow(0 0 4px ${base}66)`
                        : 'none',
                    }}
                  />
                )
              })}
              {showLabels && (
                <LabelList
                  dataKey={dataKey}
                  position={isVert ? 'right' : 'top'}
                  style={{ fontSize: 9, fill: labelDark(singleColor || (Array.isArray(colors) ? colors[0] : '#c8873a')), fontWeight: 700 }}
                  formatter={labelFmt ?? formatter}
                />
              )}
            </Bar>
          )}
        </BarChart>
      </ResponsiveContainer>

      {selectedIdx !== null && (
        <button
          onClick={() => { setSelectedIdx(null); onSelect?.(null) }}
          className="absolute bottom-1 right-1 text-[10px] flex items-center gap-1 px-2 py-0.5 rounded-md hover:opacity-70 transition-opacity"
          style={{
            background: 'var(--surface, rgba(255,255,255,0.95))',
            border:     '1px solid var(--border, #e5e7eb)',
            color:      'var(--t3, #9ca3af)',
          }}
        >
          ✕ Limpiar selección
        </button>
      )}
    </div>
  )
})

export default BarChartPro
