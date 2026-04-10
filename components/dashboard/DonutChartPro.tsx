'use client'
import { useState, useCallback, useRef, memo } from 'react'
import { PieChart, Pie, Cell, Sector } from 'recharts'

// ── Types ────────────────────────────────────────────────────────────────────
export interface DonutItem { cat: string; qty: number }

interface Props {
  data:           DonutItem[]
  total:          number
  colorMap:       Record<string, string>
  fallbackColors: string[]
  height?:        number
  onSelect?:      (value: string | null) => void
}

interface TooltipState {
  x: number; y: number
  item: DonutItem; pct: number; color: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtN(n: number) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return String(Math.round(n))
}

// ── Active shape: scale-up + glow ────────────────────────────────────────────
const ActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props
  return (
    <g style={{ cursor: 'pointer' }}>
      {/* Glow ring */}
      <Sector
        cx={cx} cy={cy}
        innerRadius={outerRadius + 2}
        outerRadius={outerRadius + 10}
        startAngle={startAngle} endAngle={endAngle}
        fill={fill}
        opacity={0.18}
      />
      {/* Main sector — slightly larger */}
      <Sector
        cx={cx} cy={cy}
        innerRadius={innerRadius - 3}
        outerRadius={outerRadius + 6}
        startAngle={startAngle} endAngle={endAngle}
        fill={fill}
        style={{ filter: `brightness(1.18) drop-shadow(0 0 6px ${fill}99)` }}
      />
    </g>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────
function DonutChartPro({ data, total, colorMap, fallbackColors, height = 240, onSelect }: Props) {
  const [hoveredIdx,  setHoveredIdx]  = useState<number | null>(null)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [tooltip,     setTooltip]     = useState<TooltipState | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const getColor = useCallback((cat: string, i: number) =>
    colorMap[cat] || fallbackColors[i % fallbackColors.length],
  [colorMap, fallbackColors])

  // Opacity logic: selected trumps hovered
  const getOpacity = useCallback((i: number) => {
    if (selectedIdx !== null) return selectedIdx === i ? 1 : 0.12
    if (hoveredIdx  !== null) return hoveredIdx  === i ? 1 : 0.35
    return 1
  }, [selectedIdx, hoveredIdx])

  // ── Tooltip position (smart: flip if near right/top edge) ─────────────────
  const buildTooltip = useCallback((
    clientX: number, clientY: number, item: DonutItem, pct: number, color: string,
  ) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = clientX - rect.left
    const y = clientY - rect.top
    setTooltip({ x, y, item, pct, color })
  }, [])

  // ── Pie event handlers ────────────────────────────────────────────────────
  const handlePieEnter = useCallback((_: any, index: number, e: any) => {
    setHoveredIdx(index)
    const item  = data[index]
    const pct   = total > 0 ? (item.qty / total * 100) : 0
    const color = getColor(item.cat, index)
    buildTooltip(e.clientX, e.clientY, item, pct, color)
  }, [data, total, getColor, buildTooltip])

  const handlePieLeave = useCallback(() => {
    setHoveredIdx(null)
    setTooltip(null)
  }, [])

  const handlePieClick = useCallback((_: any, index: number) => {
    setSelectedIdx(prev => {
      const next = prev === index ? null : index
      onSelect?.(next !== null ? data[next]?.cat ?? null : null)
      return next
    })
  }, [data, onSelect])

  // Update tooltip position as mouse moves over chart area
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (hoveredIdx === null) return
    const item  = data[hoveredIdx]
    const pct   = total > 0 ? (item.qty / total * 100) : 0
    const color = getColor(item.cat, hoveredIdx)
    buildTooltip(e.clientX, e.clientY, item, pct, color)
  }, [hoveredIdx, data, total, getColor, buildTooltip])

  // ── Legend handlers ───────────────────────────────────────────────────────
  const handleLegendEnter = useCallback((i: number) => setHoveredIdx(i),  [])
  const handleLegendLeave = useCallback(()          => setHoveredIdx(null), [])
  const handleLegendClick = useCallback((i: number) => {
    setSelectedIdx(prev => {
      const next = prev === i ? null : i
      onSelect?.(next !== null ? data[next]?.cat ?? null : null)
      return next
    })
  }, [data, onSelect])

  // ── Active index for Recharts ─────────────────────────────────────────────
  const activeIdx = hoveredIdx !== null ? hoveredIdx
    : selectedIdx !== null ? selectedIdx
    : undefined

  // ── Center label ──────────────────────────────────────────────────────────
  const centerItem = selectedIdx !== null ? data[selectedIdx]
    : hoveredIdx  !== null ? data[hoveredIdx]
    : null

  return (
    <div
      ref={containerRef}
      className="relative select-none"
      style={{ height }}
      onMouseMove={handleMouseMove}
    >
      <div className="flex gap-4 items-center h-full">

        {/* ── Donut ──────────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 relative" style={{ width: 180, height }}>
          <PieChart width={180} height={height}>
            <Pie
              data={data}
              dataKey="qty"
              nameKey="cat"
              cx="50%" cy="50%"
              innerRadius={54} outerRadius={80}
              paddingAngle={2}
              strokeWidth={0}
              isAnimationActive
              animationBegin={0}
              animationDuration={750}
              animationEasing="ease-out"
              activeIndex={activeIdx}
              activeShape={ActiveShape}
              onMouseEnter={handlePieEnter}
              onMouseLeave={handlePieLeave}
              onClick={handlePieClick}
            >
              {data.map((c, i) => (
                <Cell
                  key={c.cat}
                  fill={getColor(c.cat, i)}
                  opacity={getOpacity(i)}
                  style={{ transition: 'opacity 0.2s ease-out', cursor: 'pointer' }}
                />
              ))}
            </Pie>
          </PieChart>

          {/* Center label */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
            style={{ transition: 'opacity 0.2s ease-out', opacity: centerItem ? 1 : 0 }}
          >
            {centerItem && (
              <>
                <div
                  className="text-[9px] font-bold uppercase tracking-widest text-center leading-tight px-1"
                  style={{ color: getColor(centerItem.cat, data.findIndex(d => d.cat === centerItem.cat)), maxWidth: 72 }}
                >
                  {centerItem.cat}
                </div>
                <div className="text-[20px] font-bold leading-tight mt-0.5" style={{ color: 'var(--t1)' }}>
                  {total > 0 ? (centerItem.qty / total * 100).toFixed(1) : 0}%
                </div>
                <div className="text-[10px]" style={{ color: 'var(--t3)' }}>
                  {fmtN(centerItem.qty)} uds
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Legend ─────────────────────────────────────────────────────── */}
        <div className="flex-1 space-y-1.5 min-w-0">
          {data.map((c, i) => {
            const pct     = total > 0 ? (c.qty / total * 100) : 0
            const color   = getColor(c.cat, i)
            const isActive = selectedIdx === i
            const isHov    = hoveredIdx   === i
            const isDimmed = (selectedIdx !== null && !isActive) ||
                             (hoveredIdx  !== null && !isHov && selectedIdx === null)

            return (
              <div
                key={c.cat}
                className="rounded-lg px-2.5 py-2 transition-all duration-200"
                style={{
                  opacity:    isDimmed ? 0.35 : 1,
                  background: isActive ? color + '18' : isHov ? color + '0d' : 'transparent',
                  border:     isActive ? `1px solid ${color}50` : '1px solid transparent',
                  transform:  isHov || isActive ? 'translateX(2px)' : 'translateX(0)',
                  cursor:     'pointer',
                  transition: 'all 0.18s ease-out',
                }}
                onMouseEnter={() => handleLegendEnter(i)}
                onMouseLeave={handleLegendLeave}
                onClick={() => handleLegendClick(i)}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="flex-shrink-0 rounded-full transition-transform duration-200"
                      style={{
                        width: isHov || isActive ? 11 : 8,
                        height: isHov || isActive ? 11 : 8,
                        background: color,
                        boxShadow: isHov || isActive ? `0 0 6px ${color}80` : 'none',
                        transition: 'all 0.18s ease-out',
                      }}
                    />
                    <span
                      className="text-[11px] font-semibold uppercase tracking-wide truncate"
                      style={{ color: isActive ? color : isHov ? 'var(--t1)' : 'var(--t2)', transition: 'color 0.18s ease-out' }}
                    >
                      {c.cat}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1.5 flex-shrink-0 ml-2">
                    <span
                      className="text-[13px] font-bold tabular-nums"
                      style={{ color: isActive ? color : 'var(--t1)', transition: 'color 0.18s ease-out' }}
                    >
                      {pct.toFixed(1)}%
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--t3)' }}>{fmtN(c.qty)}</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="rounded-full overflow-hidden" style={{ height: 3, background: 'var(--border)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: color,
                      opacity: isDimmed ? 0.25 : 1,
                      transition: 'width 0.5s ease-out, opacity 0.2s ease-out',
                      boxShadow: isHov || isActive ? `0 0 4px ${color}90` : 'none',
                    }}
                  />
                </div>
              </div>
            )
          })}

          {/* Reset button */}
          {selectedIdx !== null && (
            <button
              className="text-[10px] flex items-center gap-1.5 px-2.5 py-1 rounded-md hover:opacity-70 transition-opacity mt-1"
              style={{ color: 'var(--t3)', border: '1px solid var(--border)' }}
              onClick={() => { setSelectedIdx(null); onSelect?.(null) }}
            >
              <span>✕</span> Limpiar selección
            </button>
          )}
        </div>
      </div>

      {/* ── Tooltip ──────────────────────────────────────────────────────── */}
      {tooltip && (
        <Tooltip
          x={tooltip.x}
          y={tooltip.y}
          item={tooltip.item}
          pct={tooltip.pct}
          color={tooltip.color}
          containerRef={containerRef}
        />
      )}
    </div>
  )
}

// ── Tooltip component ─────────────────────────────────────────────────────────
const TOOLTIP_W = 148
const TOOLTIP_H = 64

function Tooltip({
  x, y, item, pct, color, containerRef,
}: {
  x: number; y: number
  item: DonutItem; pct: number; color: string
  containerRef: React.RefObject<HTMLDivElement | null>
}) {
  const cw = containerRef.current?.offsetWidth  ?? 400
  const ch = containerRef.current?.offsetHeight ?? 240

  const left = x + 14 + TOOLTIP_W > cw ? x - TOOLTIP_W - 14 : x + 14
  const top  = y - TOOLTIP_H - 8 < 0  ? y + 14              : y - TOOLTIP_H - 8

  return (
    <div
      className="absolute pointer-events-none z-50"
      style={{
        left, top,
        background:    'var(--surface)',
        border:        `1px solid ${color}40`,
        borderRadius:  12,
        padding:       '10px 14px',
        boxShadow:     `0 8px 28px rgba(0,0,0,0.4), 0 0 0 1px ${color}20`,
        backdropFilter:'blur(10px)',
        minWidth:       TOOLTIP_W,
        transition:    'left 0.08s ease-out, top 0.08s ease-out',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-2">
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color, boxShadow: `0 0 4px ${color}` }} />
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--t2)' }}>
          {item.cat}
        </span>
      </div>
      {/* Values */}
      <div className="flex items-baseline gap-2">
        <span className="text-[22px] font-bold leading-none" style={{ color: 'var(--t1)' }}>
          {pct.toFixed(1)}%
        </span>
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold" style={{ color }}>
            {fmtN(item.qty)}
          </span>
          <span className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--t3)' }}>unidades</span>
        </div>
      </div>
    </div>
  )
}

export default memo(DonutChartPro)
