'use client'
import { memo } from 'react'
import DonutChartPro, { type DonutItem } from '@/components/dashboard/DonutChartPro'
import { useAnalyticsStore } from '@/lib/store/filterStore'
import type { DonutsData, DonutRow } from '@/hooks/useAnalyticsQueries'

const PALETTE = [
  '#c8873a','#2a7a58','#3a6fa8','#6b4fa8',
  '#c0402f','#2a8a8a','#a8863a','#3a8a4f',
  '#7a3a8a','#3a5a8a','#8a3a5a',
]

const COLOR_MAP: Record<string, string> = {
  QUESOS:         '#c8873a',
  HELADOS:        '#3a6fa8',
  'LECHE & CREMA':'#2a7a58',
  GT: '#c8873a', CO: '#2a7a58', SV: '#3a6fa8',
  CR: '#6b4fa8', HN: '#c0402f', NI: '#2a8a8a',
}

function toDonutItems(rows: DonutRow[]): DonutItem[] {
  return rows.map(r => ({ cat: r.label, qty: r.value }))
}

function DonutSkeleton() {
  return (
    <div className="rounded-2xl p-5 animate-pulse"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
      <div className="h-3 w-28 rounded mb-4" style={{ background: 'var(--border)' }} />
      <div className="flex gap-4 items-center" style={{ height: 200 }}>
        <div className="w-[160px] h-[160px] rounded-full" style={{ background: 'var(--border)' }} />
        <div className="flex-1 space-y-2">
          {[80,60,70,50,65].map(w => (
            <div key={w} className="rounded" style={{ height:14, width:`${w}%`, background:'var(--border)' }} />
          ))}
        </div>
      </div>
    </div>
  )
}

interface CardProps {
  title:    string
  subtitle: string
  items:    DonutItem[]
  active:   string | null
  onSelect: (v: string | null) => void
  loading:  boolean
}

const DonutCard = memo(function DonutCard({ title, subtitle, items, onSelect, loading }: CardProps) {
  if (loading) return <DonutSkeleton />
  const total = items.reduce((s, r) => s + r.qty, 0)

  return (
    <div className="rounded-2xl p-5"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
      <div className="mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[1.4px]"
          style={{ color: 'var(--t3)' }}>
          {title}
        </p>
        <p className="text-[10px] mt-0.5" style={{ color: 'var(--t3)', opacity: 0.6 }}>{subtitle}</p>
      </div>
      {items.length === 0
        ? <div className="h-40 flex items-center justify-center text-[12px]"
            style={{ color: 'var(--t3)' }}>Sin datos</div>
        : <DonutChartPro
            data={items}
            total={total}
            colorMap={COLOR_MAP}
            fallbackColors={PALETTE}
            height={200}
            onSelect={onSelect}
          />
      }
    </div>
  )
})

interface Props {
  data:    DonutsData | undefined
  loading: boolean
}

export default function DonutGrid({ data, loading }: Props) {
  const {
    selectedCategoria, selectedPais, selectedSubcategoria, selectedCliente,
    setCategoria, setPais, setSubcategoria, setCliente,
  } = useAnalyticsStore()

  const catItems  = data ? toDonutItems(data.categoria)    : []
  const paisItems = data ? toDonutItems(data.pais)         : []
  const subItems  = data ? toDonutItems(data.subcategoria) : []
  const cliItems  = data ? toDonutItems(data.cliente)      : []

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      <DonutCard
        title="Por Categoría"
        subtitle="USD"
        items={catItems}
        active={selectedCategoria}
        onSelect={setCategoria}
        loading={loading}
      />
      <DonutCard
        title="Por País"
        subtitle="USD"
        items={paisItems}
        active={selectedPais}
        onSelect={setPais}
        loading={loading}
      />
      <DonutCard
        title="Por Volumen"
        subtitle="Unidades · subcategoría"
        items={subItems}
        active={selectedSubcategoria}
        onSelect={setSubcategoria}
        loading={loading}
      />
      <DonutCard
        title="Por Cliente"
        subtitle="USD"
        items={cliItems}
        active={selectedCliente}
        onSelect={setCliente}
        loading={loading}
      />
    </div>
  )
}
