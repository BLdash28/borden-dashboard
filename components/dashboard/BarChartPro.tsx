'use client'
import { useState, useCallback, memo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Cell, ResponsiveContainer, ReferenceLine, Legend, LabelList,
} from 'recharts'

// ── Helpers ───────────────────────────────────────────────────────────────────
export const BAR_PALETTE = ['#c8873a','#2a7a58','#3a6fa8','#6b4fa8','#c0402f','#2a8a8a','#a86a2a','#1a6a48']

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
  onSelect?:     (value: string | null) => void
}

// ── Pro Tooltip ───────────────────────────────────────────────────────────────
function ProTooltip({ active, payload, label, formatter, unit }: any) {
  if (!active || !payload?.length) return null
  const c = payload[0]?.fill ?? payload[0]?.color ?? '#c8873a'
  return (
    <div style={{
      background: 'var(--surface, rgba(15,15,18,0.97))',
      border: `1px solid ${c}50`,
      borderRadius: 12,
      padding: '10px 14px',
      boxShadow: `0 8px 28px rgba(0,0,0,0.5), 0 0 0 1px ${c}20`,
      backdropFilter: 'blur(10px)',
      minWidth: 148,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.08em',
        color: 'var(--t2, #94a3b8)', marginBottom: 8,
      }}>
        {label}
      </div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 12,
          marginBottom: i < payload.length - 1 ? 4 : 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.fill ?? p.color ?? c, boxShadow: `0 0 4px ${p.fill ?? p.color ?? c}` }} />
            <span style={{ fontSize: 10, color: 'var(--t3, #64748b)' }}>{p.name || unit || 'Valor'}</span>
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1, #f1f5f9)' }}>
            {formatter ? formatter(Number(p.value)) : p.value}
          </span>
        </div>
      ))}
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
  margin, yDomain, yWidth, onSelect,
}: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

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
    ? { top: 4, right: 56, left: 8, bottom: 4 }
    : { top: 4, right: 16, left: 4, bottom: xAngle !== 0 ? 52 : 4 }
  const m = { ...defaultMargin, ...margin }

  const barRadius = isVert
    ? ([0, 4, 4, 0] as [number,number,number,number])
    : ([4, 4, 0, 0] as [number,number,number,number])

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
        <BarChart data={data} layout={layout} margin={m}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #f0f0f0)" />

          {isVert ? (
            <>
              <XAxis type="number"
                tick={{ fontSize: 10, fill: 'var(--t3, #9ca3af)' }}
                tickFormatter={xTickFmt ?? formatter} />
              <YAxis type="category" dataKey={nameKey}
                tick={{ fontSize: 11, fill: 'var(--t3, #9ca3af)' }}
                width={yWidth ?? 130} tickFormatter={truncate} />
            </>
          ) : (
            <>
              <XAxis dataKey={nameKey}
                tick={{ fontSize: 10, fill: 'var(--t3, #9ca3af)' }}
                tickFormatter={v => xTickFmt ? xTickFmt(v) : truncate(String(v))}
                angle={xAngle} textAnchor={xAngle !== 0 ? 'end' : 'middle'}
                height={xAngle !== 0 ? 56 : 30} interval={0} />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--t3, #9ca3af)' }}
                tickFormatter={yTickFmt ?? formatter}
                width={yWidth ?? 58}
                {...(yDomain ? { domain: yDomain } : {})} />
            </>
          )}

          <Tooltip
            content={<ProTooltip formatter={formatter} unit={tooltipUnit} />}
            wrapperStyle={{ zIndex: 50, outline: 'none' }}
            cursor={{ fill: 'var(--border, #f0f0f0)', opacity: 0.4 }}
          />

          {refLine && (
            <ReferenceLine
              y={refLine.y} stroke={refLine.color} strokeDasharray="4 4"
              label={{ value: refLine.label, fontSize: 9, fill: refLine.color, position: 'insideTopRight' }}
            />
          )}

          {multiBar ? (
            <>
              {multiBar.map(mb => (
                <Bar key={mb.key} dataKey={mb.key} fill={mb.color}
                  radius={barRadius} name={mb.label} {...sharedBar}>
                  {data.map((_, i) => (
                    <Cell key={i} opacity={opacityOf(i)}
                      style={{ transition: 'opacity 0.18s ease-out', cursor: 'pointer' }}
                    />
                  ))}
                </Bar>
              ))}
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            </>
          ) : (
            <Bar dataKey={dataKey} radius={barRadius}
              name={tooltipUnit ?? dataKey} {...sharedBar}>
              {data.map((_, i) => (
                <Cell key={i}
                  fill={colorOf(i)}
                  opacity={opacityOf(i)}
                  style={{
                    cursor: 'pointer',
                    transition: 'opacity 0.18s ease-out',
                    filter: hoveredIdx === i
                      ? `brightness(1.15) drop-shadow(0 0 5px ${colorOf(i)}99)`
                      : 'none',
                  }}
                />
              ))}
              {showLabels && (
                <LabelList
                  dataKey={dataKey}
                  position={isVert ? 'right' : 'top'}
                  style={{ fontSize: 10, fill: 'var(--t3, #9ca3af)' }}
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
