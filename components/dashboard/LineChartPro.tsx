'use client'
import { useState, useCallback, memo } from 'react'
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDefault(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return String(Math.round(n))
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface LineDef { key: string; color: string; label: string }

interface Props {
  data:         any[]
  nameKey:      string
  dataKey?:     string          // single-line mode
  color?:       string          // single-line color
  lines?:       LineDef[]       // multi-line mode
  height?:      number
  formatter?:   (v: number) => string
  tooltipUnit?: string
  xTickFmt?:    (v: any) => string
  yTickFmt?:    (v: any) => string
  xInterval?:   number
  xAngle?:      number
  yWidth?:      number
  margin?:      any
  area?:        boolean
  dot?:         boolean
  yDomain?:     [number | string, number | string]
  refLine?:     { y: number; label: string; color: string }
}

// ── Pro Tooltip ───────────────────────────────────────────────────────────────
function ProTooltip({ active, payload, label, formatter, unit }: any) {
  if (!active || !payload?.length) return null
  const c = payload[0]?.stroke ?? payload[0]?.color ?? '#c8873a'
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
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: p.stroke ?? p.color ?? c,
              boxShadow: `0 0 4px ${p.stroke ?? p.color ?? c}`,
            }} />
            <span style={{ fontSize: 10, color: 'var(--t3, #64748b)' }}>
              {p.name || unit || 'Valor'}
            </span>
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
export const LineChartPro = memo(function LineChartPro({
  data, nameKey,
  dataKey = 'value', color = '#c8873a',
  lines,
  height = 240, formatter = fmtDefault, tooltipUnit,
  xTickFmt, yTickFmt, xInterval, xAngle = 0,
  yWidth, margin, area = false, dot = false,
  yDomain, refLine,
}: Props) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set())

  const toggleKey = useCallback((key: string) => {
    setHiddenKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const opacityOf = useCallback((key: string): number => {
    if (hiddenKeys.has(key)) return 0
    if (hoveredKey !== null) return hoveredKey === key ? 1 : 0.25
    return 1
  }, [hoveredKey, hiddenKeys])

  const defaultMargin = { top: 4, right: 16, left: 4, bottom: xAngle !== 0 ? 52 : 4 }
  const m = { ...defaultMargin, ...margin }

  const isMulti = !!lines && lines.length > 0

  const sharedLineProps = {
    isAnimationActive: true,
    animationBegin: 0,
    animationDuration: 600,
    animationEasing: 'ease-out' as const,
    type: 'monotone' as const,
    strokeWidth: 2,
  }

  const Chart = area ? AreaChart : LineChart
  const Series = area ? Area : Line

  return (
    <div className="relative select-none">
      {/* Custom legend for multi-line */}
      {isMulti && (
        <div className="flex flex-wrap gap-2 mb-3 px-1">
          {lines!.map(l => {
            const hidden  = hiddenKeys.has(l.key)
            const hovered = hoveredKey === l.key
            return (
              <button
                key={l.key}
                onClick={() => toggleKey(l.key)}
                onMouseEnter={() => setHoveredKey(l.key)}
                onMouseLeave={() => setHoveredKey(null)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold uppercase tracking-wide transition-all duration-150"
                style={{
                  opacity:    hidden ? 0.35 : 1,
                  background: hovered && !hidden ? l.color + '18' : 'transparent',
                  border:     `1px solid ${hidden ? 'var(--border, #e5e7eb)' : l.color + '60'}`,
                  color:      hidden ? 'var(--t3, #9ca3af)' : l.color,
                  cursor:     'pointer',
                }}
              >
                <span style={{
                  display: 'inline-block', width: 20, height: 2,
                  borderRadius: 2, background: hidden ? 'var(--border, #9ca3af)' : l.color,
                  boxShadow: !hidden && hovered ? `0 0 4px ${l.color}` : 'none',
                  transition: 'all 0.15s',
                }} />
                {l.label}
              </button>
            )
          })}
        </div>
      )}

      <ResponsiveContainer width="100%" height={height}>
        <Chart data={data} margin={m}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #f0f0f0)" />

          <XAxis
            dataKey={nameKey}
            tick={{ fontSize: 10, fill: 'var(--t3, #9ca3af)' }}
            tickFormatter={xTickFmt}
            angle={xAngle}
            textAnchor={xAngle !== 0 ? 'end' : 'middle'}
            height={xAngle !== 0 ? 56 : 30}
            interval={xInterval ?? 0}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'var(--t3, #9ca3af)' }}
            tickFormatter={yTickFmt ?? formatter}
            width={yWidth ?? 58}
            {...(yDomain ? { domain: yDomain } : {})}
          />

          <Tooltip
            content={<ProTooltip formatter={formatter} unit={tooltipUnit} />}
            wrapperStyle={{ zIndex: 50, outline: 'none' }}
          />

          {refLine && (
            <ReferenceLine
              y={refLine.y} stroke={refLine.color} strokeDasharray="4 4"
              label={{ value: refLine.label, fontSize: 9, fill: refLine.color, position: 'insideTopRight' }}
            />
          )}

          {isMulti
            ? lines!.map(l => (
                area
                  ? (
                    <Area
                      key={l.key}
                      {...sharedLineProps}
                      dataKey={l.key}
                      stroke={l.color}
                      fill={l.color + '20'}
                      dot={dot ? { r: 3, fill: l.color } : false}
                      activeDot={hiddenKeys.has(l.key) ? false : { r: 5, fill: l.color, stroke: 'none' }}
                      name={l.label}
                      opacity={opacityOf(l.key)}
                      hide={hiddenKeys.has(l.key)}
                      style={{ transition: 'opacity 0.2s ease-out' }}
                    />
                  ) : (
                    <Line
                      key={l.key}
                      {...sharedLineProps}
                      dataKey={l.key}
                      stroke={l.color}
                      dot={dot ? { r: 3, fill: l.color } : false}
                      activeDot={hiddenKeys.has(l.key) ? false : { r: 5, fill: l.color, stroke: 'none' }}
                      name={l.label}
                      opacity={opacityOf(l.key)}
                      hide={hiddenKeys.has(l.key)}
                      style={{ transition: 'opacity 0.2s ease-out' }}
                    />
                  )
              ))
            : area
              ? (
                <Area
                  {...sharedLineProps}
                  dataKey={dataKey}
                  stroke={color}
                  fill={color + '20'}
                  dot={dot ? { r: 3, fill: color } : false}
                  activeDot={{ r: 5, fill: color, stroke: 'none' }}
                  name={tooltipUnit ?? dataKey}
                />
              ) : (
                <Line
                  {...sharedLineProps}
                  dataKey={dataKey}
                  stroke={color}
                  dot={dot ? { r: 3, fill: color } : false}
                  activeDot={{ r: 5, fill: color, stroke: 'none' }}
                  name={tooltipUnit ?? dataKey}
                />
              )
          }
        </Chart>
      </ResponsiveContainer>
    </div>
  )
})

export default LineChartPro
