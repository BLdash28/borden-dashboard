/**
 * KpiCard estándar de módulos Ejecución.
 * Uso: <KpiCard label="Ventas 2026" value={fmt$(v)} sub="hasta jul" />
 * Con highlight destaca en ámbar (métrica prioritaria).
 */
import type { ReactNode } from 'react'

export function KpiCard({
  label, value, sub, highlight,
}: {
  label: string
  value: ReactNode
  sub?: string
  highlight?: boolean
}) {
  return (
    <div className={`rounded-xl border shadow-sm p-4 ${highlight ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100'}`}>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest leading-tight mb-1">
        {label}
      </p>
      <p className={`text-xl font-bold ${highlight ? 'text-amber-700' : 'text-gray-800'}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}
