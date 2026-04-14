'use client'
import { useEffect, useState } from 'react'
import { TrendingUp, Package, MapPin, AlertTriangle, BarChart2 } from 'lucide-react'
import Link from 'next/link'

const PAISES = ['CR','GT','SV','NI','HN','CO']

const fmt = (v: number) => {
  if (!isFinite(v) || v === 0) return '$0'
  if (v >= 1e6) return '$' + (v/1e6).toFixed(2) + 'M'
  if (v >= 1e3) return '$' + (v/1e3).toFixed(1) + 'K'
  return '$' + v.toFixed(2)
}
const fmtN = (v: number) => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(0)+'K' : v.toFixed(0)

interface Panel {
  venta:      { skus_activos: number; pdvs: number; paises: number; valor_total: number; unidades_total: number }
  inventario: { qty_total: number; skus_inv: number }
  reorden:    { criticos: number }
  long_tail:  { skus_cola: number }
}

const MODULOS = [
  { href: 'ejecucion/crecimiento',   icon: TrendingUp,    label: 'Crecimiento SKU',      desc: 'Top ganadores y perdedores YoY' },
  { href: 'ejecucion/distribucion',  icon: BarChart2,     label: 'Distribución 75%',     desc: 'SKUs que concentran el 75% de la venta' },
  { href: 'ejecucion/cobertura',     icon: MapPin,        label: 'Cobertura PDV',        desc: 'Presencia por punto de venta' },
  { href: 'ejecucion/inventario',    icon: Package,       label: 'Inventario CEDI+PDV',  desc: 'Stock y días de cobertura' },
  { href: 'ejecucion/precio',        icon: BarChart2,     label: 'Precio / Elasticidad', desc: 'Evolución de precio promedio' },
  { href: 'ejecucion/punto-reorden', icon: AlertTriangle, label: 'Punto de Reorden',     desc: 'SKUs bajo umbral crítico' },
  { href: 'ejecucion/cola',          icon: BarChart2,     label: 'Long Tail 50%',        desc: 'SKUs de la cola de venta' },
  { href: 'ejecucion/som',           icon: BarChart2,     label: 'Share of Market',      desc: 'Participación por categoría y país' },
]

export default function EjecucionPanel() {
  const [ano,     setAno]     = useState(2026)
  const [data,    setData]    = useState<Panel | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/comercial/ejecucion/panel?ano=${ano}`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j) setData(j) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [ano])

  const kpis = data ? [
    { label: 'Venta Sell-Out',  value: fmt(data.venta.valor_total),         icon: '💰', color: 'blue' },
    { label: 'SKUs Activos',    value: fmtN(data.venta.skus_activos),        icon: '📦', color: 'green' },
    { label: 'PDVs',            value: fmtN(data.venta.pdvs),                icon: '🏪', color: 'purple' },
    { label: 'Inv. PDV Und.',   value: fmtN(data.inventario.qty_total),      icon: '🏭', color: 'amber' },
    { label: 'En Reorden',      value: String(data.reorden.criticos),        icon: '⚠️',  color: 'red' },
    { label: 'SKUs Long Tail',  value: String(data.long_tail.skus_cola),     icon: '📉', color: 'gray' },
  ] : []

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Ejecución</p>
          <h1 className="text-2xl font-bold text-gray-800">Panel General</h1>
          <p className="text-sm text-gray-400 mt-0.5">Vista consolidada de ejecución comercial</p>
        </div>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {[2024, 2025, 2026].map(a => (
            <button key={a} onClick={() => setAno(a)}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${ano===a?'bg-amber-500 text-white':'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {loading
          ? Array(6).fill(0).map((_,i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 animate-pulse">
                <div className="h-3 bg-gray-100 rounded w-2/3 mb-3"/><div className="h-7 bg-gray-100 rounded w-1/2"/>
              </div>
            ))
          : kpis.map(k => (
              <div key={k.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest leading-tight">{k.label}</p>
                  <span className="text-base">{k.icon}</span>
                </div>
                <p className="text-xl font-bold text-gray-800">{k.value}</p>
              </div>
            ))
        }
      </div>

      {/* Módulos grid */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-3">Módulos de Ejecución</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {MODULOS.map(m => {
            const Icon = m.icon
            return (
              <Link key={m.href} href={m.href}
                className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 hover:shadow-md hover:border-amber-200 transition-all group">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-amber-50 rounded-lg group-hover:bg-amber-100 transition-colors">
                    <Icon size={16} className="text-amber-600" />
                  </div>
                  <p className="text-sm font-semibold text-gray-700">{m.label}</p>
                </div>
                <p className="text-xs text-gray-400">{m.desc}</p>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
