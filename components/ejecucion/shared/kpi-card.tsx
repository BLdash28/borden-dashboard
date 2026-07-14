/**
 * KpiCard estándar de módulos Ejecución.
 * Uso: <KpiCard label="Ventas 2026" value={fmt$(v)} sub="hasta jul" />
 * Con highlight destaca en ámbar (métrica prioritaria).
 */
import type { ReactNode } from 'react'

export function KpiCard({
  label, value, sub, highlight, borderLeftColor,
}: {
  label: string
  value: ReactNode
  sub?: string
  highlight?: boolean
  /** Color CSS del border izquierdo (barra vertical de acento). Ej: '#f59e0b' */
  borderLeftColor?: string
}) {
  const baseCls = `rounded-xl border shadow-sm p-4 ${highlight ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100'}`
  const style = borderLeftColor
    ? { borderLeftWidth: '4px', borderLeftColor, borderLeftStyle: 'solid' as const }
    : undefined
  return (
    <div className={baseCls} style={style}>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest leading-tight mb-1">
        {label}
      </p>
      <p className={`text-xl font-bold ${highlight ? 'text-amber-700' : 'text-gray-800'}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}
