'use client'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, AreaChart, Area, ComposedChart,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LabelList,
} from 'recharts'
import FiltroMulti from '@/components/ui/FiltroMulti'

const MN = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const fmt$ = (v: number) => {
  if (!isFinite(v) || v === 0) return '$0'
  if (Math.abs(v) >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M'
  if (Math.abs(v) >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K'
  return '$' + v.toFixed(0)
}
const fmt$Full = (v: number) => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtCRC   = (v: number) => {
  if (!isFinite(v) || v === 0) return '₡0'
  if (Math.abs(v) >= 1e6) return '₡' + (v / 1e6).toFixed(1) + 'M'
  if (Math.abs(v) >= 1e3) return '₡' + (v / 1e3).toFixed(0) + 'K'
  return '₡' + Math.round(v).toLocaleString('es-CR')
}
const fmtNum = (v: number) => Math.round(v).toLocaleString('en-US')

type Data = {
  ytd_2026: number; ytd_2026_crc: number; uds_2026: number
  ytd_2025: number; ytd_2025_crc: number; uds_2025: number
  delta_ytd: number | null
  ultimo_mes: number; ultimo_mes_nombre: string
  por_cadena: { cadena: string; usd_2026: number; uds_2026: number; usd_2025: number; delta: number | null }[]
  por_producto: { producto: string; codigo_barras: string; usd_2026: number; uds_2026: number }[]
  pdvs_por_cadena?: {
    cadena: string; cliente_codigo: string; cliente_nombre: string;
    zona: string | null; ruta: string | null;
    usd_2026: number; uds_2026: number; usd_2025: number; uds_2025: number;
    delta: number | null
  }[]
  monthly: { mes: number; mes_nombre: string; y2025: number; y2026: number | null; uds2025: number; uds2026: number | null; crc2025: number; crc2026: number | null }[]
}

type Opts = { cadenas: { value: string }[]; productos: { value: string }[] }

const TABS = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'sellin',  label: 'Sell-In'  },
] as const
type TabKey = typeof TABS[number]['key']

export default function SensacionEjecucion() {
  const [tab,        setTab]        = useState<TabKey>('resumen')
  const [moneda,     setMoneda]     = useState<'usd' | 'crc'>('usd')
  const [cadenas,    setCadenas]    = useState<string[]>([])
  const [productos,  setProductos]  = useState<string[]>([])
  const [data,       setData]       = useState<Data | null>(null)
  const [wmSellout, setWmSellout] = useState<{
    ytd_2026: number; uds_2026: number
    ytd_2025: number; uds_2025: number
    delta_ytd: number | null
    ultimo_mes: number; ultimo_mes_nombre: string
    monthly: { mes: number; mes_nombre: string; y2025: number; y2026: number | null; uds2025: number; uds2026: number | null }[]
    daily?: { fecha: string; dia_str: string; mes: number; dia: number; usd: number; uds: number }[]
    por_producto: { codigo_barras: string; descripcion: string; usd: number; uds: number; pdvs: number }[]
    top_pdvs: { punto_venta: string; cadena: string; usd: number; uds: number }[]
  } | null>(null)
  const [wmVista, setWmVista] = useState<'mensual' | 'diaria'>('mensual')
  const [opts,       setOpts]       = useState<Opts>({ cadenas: [], productos: [] })
  const [loading,    setLoading]    = useState(false)

  useEffect(() => {
    fetch('/api/comercial/ejecucion/cr/sensacion/filtros-opciones')
      .then(r => r.json()).then(setOpts).catch(() => {})
  }, [])

  useEffect(() => {
    const qs = new URLSearchParams()
    if (cadenas.length)   qs.set('cadenas',   cadenas.join(','))
    if (productos.length) qs.set('productos', productos.join(','))
    setLoading(true)
    fetch('/api/comercial/ejecucion/cr/sensacion/kpis?' + qs)
      .then(r => r.json()).then(setData)
      .finally(() => setLoading(false))
  }, [cadenas, productos])

  // Walmart CR sellout de helados (fetch única vez — no depende de filtros de Sensación)
  useEffect(() => {
    fetch('/api/comercial/sell-in/licenciamiento/walmart-helados')
      .then(r => r.json()).then(setWmSellout).catch(() => {})
  }, [])

  const isUsd = moneda === 'usd'
  const fmtVal = (v: number) => isUsd ? fmt$(v) : fmtCRC(v)
  const tipVal = (v: unknown) => isUsd ? fmt$Full(Number(v)) : fmtCRC(Number(v))

  const ventaCur = data ? (isUsd ? data.ytd_2026 : data.ytd_2026_crc) : 0
  const monthlyChart = useMemo(() => {
    if (!data) return []
    return data.monthly
      .map(m => ({
        mes_nombre: m.mes_nombre,
        v2025: isUsd ? m.y2025 : m.crc2025,
        v2026: isUsd ? m.y2026 : m.crc2026,
        uds2025: m.uds2025,
        uds2026: m.uds2026,
      }))
      .filter(m => (m.v2025 && m.v2025 > 0) || (m.v2026 && m.v2026 > 0))
  }, [data, isUsd])

  return (
    <div className="p-3 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Ejecución CR</p>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800">
            Sensación · Borden Helados
          </h1>
          <p className="text-xs md:text-sm text-gray-400 mt-0.5">
            Distribuidor CR · Costa Rica{data ? ` · Datos hasta ${data.ultimo_mes_nombre || '—'} 2026` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(['usd','crc'] as const).map(m => (
            <button key={m} onClick={() => setMoneda(m)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${moneda===m ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
              {m.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <FiltroMulti label="Cadena"   options={opts.cadenas}   value={cadenas}   onChange={setCadenas}   placeholder="Todas las cadenas" />
          <FiltroMulti label="Producto" options={opts.productos} value={productos} onChange={setProductos} placeholder="Todos los productos" />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-100">
        <div className="flex gap-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-5 py-2 text-sm font-semibold transition-colors border-b-2 ${tab === t.key ? 'text-amber-600 border-amber-500' : 'text-gray-500 border-transparent hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !data && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm h-40 flex items-center justify-center text-gray-300 text-sm">
          Cargando…
        </div>
      )}

      {data && (
        <>
          {/* ── Resumen ── */}
          {tab === 'resumen' && (
            <div className="space-y-4">
              {/* KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-amber-50 border border-amber-200 rounded-xl shadow-sm p-4">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Sell-In YTD 2026 ({moneda.toUpperCase()})</p>
                  <p className="text-xl font-bold text-amber-700">{fmtVal(ventaCur)}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Hasta {data.ultimo_mes_nombre || '—'}</p>
                </div>
                <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Unidades YTD</p>
                  <p className="text-xl font-bold text-gray-800">{fmtNum(data.uds_2026)}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {data.uds_2025 > 0 ? `${fmtNum(data.uds_2025)} en 2025 mismo período` : 'Sin comparativo 2025'}
                  </p>
                </div>
                <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">vs YTD 2025</p>
                  <p className={`text-xl font-bold ${data.delta_ytd === null ? 'text-gray-400' : data.delta_ytd >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {data.delta_ytd === null ? '—' : `${data.delta_ytd > 0 ? '+' : ''}${data.delta_ytd.toFixed(1)}%`}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{fmt$(data.ytd_2025)} en 2025</p>
                </div>
                <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Cadenas activas</p>
                  <p className="text-xl font-bold text-gray-800">{data.por_cadena.filter(c => c.usd_2026 > 0).length}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">con ventas 2026</p>
                </div>
              </div>

              {/* Chart mensual */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <h3 className="text-sm font-bold text-gray-800">Sell-In Mensual</h3>
                    <p className="text-[11px] text-gray-400">2025 vs 2026 · {moneda.toUpperCase()}</p>
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-400"/> 2025</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"/> 2026</span>
                  </div>
                </div>
                <div className="h-[280px] mt-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barCategoryGap="20%" barGap={4}>
                      <defs>
                        <linearGradient id="gradSensa25" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#60a5fa" stopOpacity={1}/>
                          <stop offset="100%" stopColor="#93c5fd" stopOpacity={0.85}/>
                        </linearGradient>
                        <linearGradient id="gradSensa26" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#c8873a" stopOpacity={1}/>
                          <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.85}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                      <XAxis dataKey="mes_nombre" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false}/>
                      <YAxis tickFormatter={(v: any) => fmtVal(Number(v))} tick={{ fontSize: 11, fill: '#94a3b8' }} width={60} axisLine={false} tickLine={false}/>
                      <Tooltip formatter={(v: unknown) => [tipVal(v), '']}
                        cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                        contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}/>
                      <Bar dataKey="v2025" name="2025" fill="url(#gradSensa25)" radius={[8,8,0,0]} maxBarSize={28}>
                        <LabelList dataKey="v2025" position="top" formatter={(v: any) => fmt$(Number(v))}
                          style={{ fontSize: 9, fill: '#1e40af', fontWeight: 700 }}/>
                      </Bar>
                      <Bar dataKey="v2026" name="2026" fill="url(#gradSensa26)" radius={[8,8,0,0]} maxBarSize={28}>
                        <LabelList dataKey="v2026" position="top" formatter={(v: any) => fmt$(Number(v))}
                          style={{ fontSize: 9, fill: '#92400e', fontWeight: 700 }}/>
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Grid: por Cadena + por Producto — PieCharts con gradient */}
              {(() => {
                // Paleta gradient reutilizable (uno por slice)
                const COLORS_CAD = [
                  { id: 'gradCad0', a: '#f59e0b', b: '#fcd34d', label: '#92400e' },
                  { id: 'gradCad1', a: '#3b82f6', b: '#93c5fd', label: '#1e40af' },
                  { id: 'gradCad2', a: '#10b981', b: '#6ee7b7', label: '#065f46' },
                  { id: 'gradCad3', a: '#ef4444', b: '#fca5a5', label: '#b91c1c' },
                  { id: 'gradCad4', a: '#8b5cf6', b: '#c4b5fd', label: '#5b21b6' },
                ]
                const COLORS_PROD = [
                  { id: 'gradProd0', a: '#3b82f6', b: '#93c5fd', label: '#1e40af' },
                  { id: 'gradProd1', a: '#f59e0b', b: '#fcd34d', label: '#92400e' },
                  { id: 'gradProd2', a: '#ef4444', b: '#fca5a5', label: '#b91c1c' },
                  { id: 'gradProd3', a: '#10b981', b: '#6ee7b7', label: '#065f46' },
                ]
                const totalCad  = data.por_cadena.reduce((s, x) => s + x.usd_2026, 0)
                const totalProd = data.por_producto.reduce((s, x) => s + x.usd_2026, 0)
                const cadData = data.por_cadena.map((c, i) => ({
                  name: c.cadena, value: c.usd_2026, uds: c.uds_2026, delta: c.delta,
                  gradId: COLORS_CAD[i % COLORS_CAD.length].id,
                  color: COLORS_CAD[i % COLORS_CAD.length].a,
                  labelColor: COLORS_CAD[i % COLORS_CAD.length].label,
                }))
                const prodData = data.por_producto.map((p, i) => ({
                  name: p.producto, value: p.usd_2026, uds: p.uds_2026, ean: p.codigo_barras,
                  gradId: COLORS_PROD[i % COLORS_PROD.length].id,
                  color: COLORS_PROD[i % COLORS_PROD.length].a,
                  labelColor: COLORS_PROD[i % COLORS_PROD.length].label,
                }))
                return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Pie Por Cadena */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <h3 className="text-sm font-bold text-gray-800 mb-3">Por Cadena · 2026</h3>
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart margin={{ top: 12, right: 12, bottom: 12, left: 12 }}>
                        <defs>
                          {COLORS_CAD.map(c => (
                            <linearGradient key={c.id} id={c.id} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={c.a} stopOpacity={1}/>
                              <stop offset="100%" stopColor={c.b} stopOpacity={0.9}/>
                            </linearGradient>
                          ))}
                        </defs>
                        <Pie data={cadData} dataKey="value" nameKey="name"
                          cx="50%" cy="50%" innerRadius={50} outerRadius={95} paddingAngle={2}
                          stroke="#fff" strokeWidth={2}
                          label={({ cx, cy, midAngle, innerRadius, outerRadius, value }: any) => {
                            const pct = totalCad > 0 ? (value / totalCad) * 100 : 0
                            if (pct < 5) return null
                            const RADIAN = Math.PI / 180
                            const r = innerRadius + (outerRadius - innerRadius) * 0.55
                            const x = cx + r * Math.cos(-midAngle * RADIAN)
                            const y = cy + r * Math.sin(-midAngle * RADIAN)
                            return (
                              <text x={x} y={y} fill="#fff" fontSize={11} fontWeight={700}
                                textAnchor="middle" dominantBaseline="central">
                                {pct.toFixed(0)}%
                              </text>
                            )
                          }}
                          labelLine={false}
                        >
                          {cadData.map((d, i) => (<Cell key={i} fill={`url(#${d.gradId})`}/>))}
                        </Pie>
                        <Tooltip
                          formatter={(v: any, _n: any, item: any) => [
                            `${fmt$(Number(v))} · ${fmtNum(item?.payload?.uds ?? 0)} und`,
                            item?.payload?.name ?? '',
                          ]}
                          contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-1 gap-1 mt-2 text-[11px]">
                    {cadData.map((d, i) => {
                      const pct = totalCad > 0 ? (d.value / totalCad) * 100 : 0
                      return (
                        <div key={i} className="flex items-center justify-between gap-2 py-1 border-b border-gray-50 last:border-b-0">
                          <span className="flex items-center gap-1.5 truncate">
                            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: d.color }}/>
                            <span className="truncate text-gray-700">{d.name}</span>
                          </span>
                          <span className="tabular-nums text-gray-600 whitespace-nowrap flex items-center gap-2">
                            <span style={{ color: d.labelColor }} className="font-semibold">{pct.toFixed(1)}%</span>
                            <span className="text-gray-300">·</span>
                            <span>{fmt$(d.value)}</span>
                            {d.delta !== null && (
                              <span className={`text-[10px] font-semibold px-1 rounded ${d.delta >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                                {d.delta > 0 ? '↑' : '↓'} {Math.abs(d.delta).toFixed(0)}%
                              </span>
                            )}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
                {/* Pie Por Producto */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <h3 className="text-sm font-bold text-gray-800 mb-3">Por Producto · 2026</h3>
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart margin={{ top: 12, right: 12, bottom: 12, left: 12 }}>
                        <defs>
                          {COLORS_PROD.map(c => (
                            <linearGradient key={c.id} id={c.id} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={c.a} stopOpacity={1}/>
                              <stop offset="100%" stopColor={c.b} stopOpacity={0.9}/>
                            </linearGradient>
                          ))}
                        </defs>
                        <Pie data={prodData} dataKey="value" nameKey="name"
                          cx="50%" cy="50%" innerRadius={50} outerRadius={95} paddingAngle={2}
                          stroke="#fff" strokeWidth={2}
                          label={({ cx, cy, midAngle, innerRadius, outerRadius, value }: any) => {
                            const pct = totalProd > 0 ? (value / totalProd) * 100 : 0
                            if (pct < 5) return null
                            const RADIAN = Math.PI / 180
                            const r = innerRadius + (outerRadius - innerRadius) * 0.55
                            const x = cx + r * Math.cos(-midAngle * RADIAN)
                            const y = cy + r * Math.sin(-midAngle * RADIAN)
                            return (
                              <text x={x} y={y} fill="#fff" fontSize={11} fontWeight={700}
                                textAnchor="middle" dominantBaseline="central">
                                {pct.toFixed(0)}%
                              </text>
                            )
                          }}
                          labelLine={false}
                        >
                          {prodData.map((d, i) => (<Cell key={i} fill={`url(#${d.gradId})`}/>))}
                        </Pie>
                        <Tooltip
                          formatter={(v: any, _n: any, item: any) => [
                            `${fmt$(Number(v))} · ${fmtNum(item?.payload?.uds ?? 0)} und`,
                            item?.payload?.name ?? '',
                          ]}
                          contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-1 gap-1 mt-2 text-[11px]">
                    {prodData.map((d, i) => {
                      const pct = totalProd > 0 ? (d.value / totalProd) * 100 : 0
                      return (
                        <div key={i} className="flex items-center justify-between gap-2 py-1 border-b border-gray-50 last:border-b-0">
                          <span className="flex items-center gap-1.5 truncate">
                            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: d.color }}/>
                            <span className="truncate text-gray-700">{d.name}</span>
                          </span>
                          <span className="tabular-nums text-gray-600 whitespace-nowrap flex items-center gap-2">
                            <span style={{ color: d.labelColor }} className="font-semibold">{pct.toFixed(1)}%</span>
                            <span className="text-gray-300">·</span>
                            <span>{fmt$(d.value)}</span>
                            <span className="text-gray-400 text-[10px]">· {fmtNum(d.uds)} und</span>
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
                )
              })()}

              {/* ── Sell-Out Walmart CR ── */}
              {wmSellout && wmSellout.ytd_2026 > 0 && (() => {
                const wmMonthly = wmSellout.monthly.filter(m => (m.y2025 && m.y2025 > 0) || (m.y2026 && m.y2026 > 0))
                const ratioSISO = data && data.ytd_2026 > 0 ? (wmSellout.ytd_2026 / data.ytd_2026) * 100 : null
                return (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                      <h2 className="text-sm font-bold text-gray-800 uppercase tracking-widest">Sell-Out · Walmart CR</h2>
                      <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">RETAIL</span>
                      <span className="text-[10px] text-gray-400">Hasta {wmSellout.ultimo_mes_nombre || '—'} 2026 · USD</span>
                    </div>

                    {/* KPIs Sell-Out */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="bg-blue-50 border border-blue-200 rounded-xl shadow-sm p-4">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Sell-Out YTD 2026 (USD)</p>
                        <p className="text-xl font-bold text-blue-700">${fmtNum(wmSellout.ytd_2026)}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">Hasta {wmSellout.ultimo_mes_nombre || '—'}</p>
                      </div>
                      <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Unidades YTD</p>
                        <p className="text-xl font-bold text-gray-800">{fmtNum(wmSellout.uds_2026)}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">{wmSellout.uds_2025 > 0 ? `${fmtNum(wmSellout.uds_2025)} en 2025 mismo período` : 'Sin comparativo 2025'}</p>
                      </div>
                      <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">vs YTD 2025</p>
                        <p className={`text-xl font-bold ${wmSellout.delta_ytd === null ? 'text-gray-400' : wmSellout.delta_ytd >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {wmSellout.delta_ytd === null ? '—' : `${wmSellout.delta_ytd > 0 ? '+' : ''}${wmSellout.delta_ytd.toFixed(1)}%`}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-0.5">${fmtNum(wmSellout.ytd_2025)} en 2025</p>
                      </div>
                      <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Ratio Sell-Out / Sell-In</p>
                        <p className="text-xl font-bold text-gray-800">{ratioSISO !== null ? `${ratioSISO.toFixed(0)}%` : '—'}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">Del Sell-In llega a POS</p>
                      </div>
                    </div>

                    {/* Chart Sell-Out — toggle Mensual/Diaria (estilo Éxito Ventas mensuales) */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-gray-800">
                            Sell-Out {wmVista === 'mensual' ? 'Mensual' : 'Diaria · 2026'} · Walmart CR
                          </h3>
                          {(() => {
                            // Último precio prom por Und (USD): usar último mes/día con datos
                            let precioUlt = 0
                            let refLabel = ''
                            if (wmVista === 'mensual') {
                              const withData = (wmSellout?.monthly ?? []).filter(m => (m.uds2026 ?? 0) > 0)
                              const last = withData[withData.length - 1]
                              if (last) {
                                const u = last.uds2026 ?? 0
                                precioUlt = u > 0 ? (last.y2026 ?? 0) / u : 0
                                refLabel = last.mes_nombre
                              }
                            } else if (wmSellout?.daily?.length) {
                              const last = wmSellout.daily[wmSellout.daily.length - 1]
                              precioUlt = last.uds > 0 ? last.usd / last.uds : 0
                              refLabel = last.dia_str
                            }
                            const precioFmt = '$' + precioUlt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                            return (
                              <p className="text-[11px] text-gray-400">
                                {wmVista === 'mensual' ? 'Comparativo 2025 vs 2026 · USD' : 'Tendencia diaria · USD'}
                                {precioUlt > 0 && (
                                  <>
                                    <span className="mx-1.5 text-gray-300">·</span>
                                    <span className="font-semibold text-emerald-600">Último precio prom / Und ({refLabel}): {precioFmt}</span>
                                  </>
                                )}
                              </p>
                            )
                          })()}
                        </div>
                        <div className="flex items-center gap-3 text-[11px]">
                          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                            {(['mensual','diaria'] as const).map(v => (
                              <button key={v} onClick={() => setWmVista(v)}
                                className={`px-3 py-1 font-semibold transition-colors ${wmVista===v ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                                {v === 'mensual' ? 'Mensual' : 'Diaria'}
                              </button>
                            ))}
                          </div>
                          {wmVista === 'mensual' ? (
                            <>
                              <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-slate-400"/><span className="w-3 h-2 rounded-sm bg-blue-500"/> Valor</span>
                              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-300 border border-slate-400"/><span className="w-2 h-2 rounded-full bg-emerald-500 border border-emerald-700"/> Unidades</span>
                            </>
                          ) : (
                            <>
                              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500"/> Venta</span>
                              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"/> Unidades</span>
                              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-700 border border-emerald-800"/> Precio / Und</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="h-[280px] mt-3">
                        <ResponsiveContainer width="100%" height="100%">
                        {wmVista === 'diaria' ? (
                          <ComposedChart data={(wmSellout?.daily ?? []).map(d => ({
                            dia_str: d.dia_str,
                            valor: d.usd,
                            unidades: d.uds,
                            precio: d.uds > 0 ? d.usd / d.uds : 0,
                          }))}
                            margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                            <defs>
                              <linearGradient id="gradSensaWMDiaVal" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%"   stopColor="#3b82f6" stopOpacity={0.35}/>
                                <stop offset="60%"  stopColor="#3b82f6" stopOpacity={0.08}/>
                                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0}/>
                              </linearGradient>
                              <linearGradient id="gradSensaWMDiaUds" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#10b981" stopOpacity={1}/>
                                <stop offset="100%" stopColor="#6ee7b7" stopOpacity={0.85}/>
                              </linearGradient>
                              <linearGradient id="gradSensaWMDiaPrecio" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%"   stopColor="#059669" stopOpacity={0.35}/>
                                <stop offset="60%"  stopColor="#059669" stopOpacity={0.08}/>
                                <stop offset="100%" stopColor="#059669" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                            <XAxis dataKey="dia_str" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false}
                              interval={Math.max(0, Math.floor((wmSellout?.daily?.length ?? 0) / 20) - 1)} />
                            <YAxis yAxisId="val" tickFormatter={(v: any) => '$' + (Number(v) >= 1000 ? (Number(v)/1000).toFixed(0)+'K' : Math.round(Number(v)))}
                              tick={{ fontSize: 10, fill: '#94a3b8' }} width={60} axisLine={false} tickLine={false}/>
                            <YAxis yAxisId="uds" orientation="right"
                              tickFormatter={(v: any) => Number(v) >= 1000 ? (Number(v)/1000).toFixed(0)+'K' : String(Math.round(Number(v)))}
                              tick={{ fontSize: 10, fill: '#059669' }} width={55} axisLine={false} tickLine={false}/>
                            {/* Eje precio oculto — no satura el layout, pero permite el Area */}
                            <YAxis yAxisId="precio" orientation="right" hide />
                            <Tooltip
                              formatter={(v: unknown, name: string) => {
                                if (name === 'Precio / Und') {
                                  const n = Number(v)
                                  return ['$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), name]
                                }
                                if (String(name).toLowerCase().includes('unid')) {
                                  return [Math.round(Number(v)).toLocaleString('en-US'), name]
                                }
                                return [fmt$Full(Number(v)), name]
                              }}
                              contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}/>
                            <Area yAxisId="val" type="monotone" dataKey="valor" name="Venta (USD)"
                              stroke="#3b82f6" strokeWidth={2.5} fill="url(#gradSensaWMDiaVal)" dot={false}
                              activeDot={{ r: 5, strokeWidth: 2, fill: '#fff', stroke: '#3b82f6' }} connectNulls/>
                            <Bar yAxisId="uds" dataKey="unidades" name="Unidades"
                              fill="url(#gradSensaWMDiaUds)" radius={[4,4,0,0]} maxBarSize={14}/>
                            <Area yAxisId="precio" type="monotone" dataKey="precio" name="Precio / Und"
                              stroke="#059669" strokeWidth={2.5} fill="url(#gradSensaWMDiaPrecio)" dot={false}
                              activeDot={{ r: 4, strokeWidth: 2, fill: '#fff', stroke: '#059669' }} connectNulls/>
                          </ComposedChart>
                        ) : (
                          <ComposedChart data={wmMonthly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barCategoryGap="20%" barGap={4}>
                            <defs>
                              <linearGradient id="gradSensaWM25" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#94a3b8" stopOpacity={1}/>
                                <stop offset="100%" stopColor="#cbd5e1" stopOpacity={0.85}/>
                              </linearGradient>
                              <linearGradient id="gradSensaWM26" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#3b82f6" stopOpacity={1}/>
                                <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.85}/>
                              </linearGradient>
                              <linearGradient id="gradSensaWMUds25" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%"   stopColor="#94a3b8" stopOpacity={0.35}/>
                                <stop offset="100%" stopColor="#94a3b8" stopOpacity={0}/>
                              </linearGradient>
                              <linearGradient id="gradSensaWMUds26" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%"   stopColor="#10b981" stopOpacity={0.35}/>
                                <stop offset="100%" stopColor="#10b981" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                            <XAxis dataKey="mes_nombre" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false}/>
                            <YAxis yAxisId="val"
                              tickFormatter={(v: any) => '$' + (Number(v) >= 1000 ? (Number(v)/1000).toFixed(0)+'K' : Math.round(Number(v)))}
                              tick={{ fontSize: 11, fill: '#94a3b8' }} width={55} axisLine={false} tickLine={false}/>
                            <YAxis yAxisId="uds" orientation="right"
                              tickFormatter={(v: any) => Number(v) >= 1000 ? (Number(v)/1000).toFixed(0)+'K' : String(Math.round(Number(v)))}
                              tick={{ fontSize: 10, fill: '#059669' }} width={55} axisLine={false} tickLine={false}/>
                            <Tooltip
                              formatter={(v: unknown, name: string) => {
                                if (String(name).startsWith('Und')) return [Math.round(Number(v)).toLocaleString('en-US'), name]
                                return [fmt$Full(Number(v)), name]
                              }}
                              cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                              contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}/>
                            <Bar yAxisId="val" dataKey="y2025" name="2025" fill="url(#gradSensaWM25)" radius={[8,8,0,0]} maxBarSize={28}/>
                            <Bar yAxisId="val" dataKey="y2026" name="2026" fill="url(#gradSensaWM26)" radius={[8,8,0,0]} maxBarSize={28}/>
                            <Area yAxisId="uds" type="monotone" dataKey="uds2025" name="Und 2025"
                              stroke="#94a3b8" strokeWidth={2} fill="url(#gradSensaWMUds25)" dot={false}
                              activeDot={{ r: 4, strokeWidth: 2, fill: '#fff', stroke: '#94a3b8' }} connectNulls/>
                            <Area yAxisId="uds" type="monotone" dataKey="uds2026" name="Und 2026"
                              stroke="#10b981" strokeWidth={2.5} fill="url(#gradSensaWMUds26)" dot={false}
                              activeDot={{ r: 5, strokeWidth: 2, fill: '#fff', stroke: '#10b981' }} connectNulls/>
                          </ComposedChart>
                        )}
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* ── Sell-In (estilo Éxito) ── */}
          {tab === 'sellin' && (
            <SellInSensacion
              data={data}
              moneda={moneda}
              isUsd={isUsd}
              fmtVal={fmtVal}
              fmt$Short={fmt$}
            />
          )}
        </>
      )}
    </div>
  )
}

/* ═════ Sub-componente: Sell-In estilo Éxito (BarChart + tabla Clientes expandable) ═════ */
function SellInSensacion({ data, moneda, isUsd, fmtVal, fmt$Short }: {
  data: Data
  moneda: 'usd' | 'crc'
  isUsd: boolean
  fmtVal: (v: number) => string
  fmt$Short: (v: number) => string
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (cadena: string) => setExpanded(prev => {
    const s = new Set(prev)
    s.has(cadena) ? s.delete(cadena) : s.add(cadena)
    return s
  })

  // Sort tabla Clientes
  type SortCol = 'cliente' | 'venta' | 'uds' | 'share' | 'delta'
  const [sortCol, setSortCol] = useState<SortCol>('venta')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const toggleSort = (col: SortCol) => {
    if (col === sortCol) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir(col === 'cliente' ? 'asc' : 'desc') }
  }
  const SortArrow = ({ col }: { col: SortCol }) => {
    if (sortCol !== col) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="text-amber-600 ml-1">{sortDir === 'desc' ? '↓' : '↑'}</span>
  }

  const totalVenta = isUsd ? data.ytd_2026 : data.ytd_2026_crc
  const monthlyChart = data.monthly.map(m => ({
    mes_nombre: m.mes_nombre,
    v2025: isUsd ? m.y2025 : m.crc2025,
    v2026: isUsd ? m.y2026 : m.crc2026,
  })).filter(m => (m.v2025 && m.v2025 > 0) || (m.v2026 && m.v2026 > 0))

  const yFmt = (v: number) => isUsd
    ? (v >= 1e6 ? '$' + (v/1e6).toFixed(1)+'M' : v >= 1e3 ? '$' + (v/1e3).toFixed(0)+'K' : '$' + v)
    : (v >= 1e6 ? '₡' + (v/1e6).toFixed(1)+'M' : v >= 1e3 ? '₡' + (v/1e3).toFixed(0)+'K' : '₡' + v)

  // Agrupar PDVs por cadena
  const pdvsGrouped: Record<string, NonNullable<Data['pdvs_por_cadena']>> = {}
  for (const p of data.pdvs_por_cadena ?? []) {
    if (!pdvsGrouped[p.cadena]) pdvsGrouped[p.cadena] = []
    pdvsGrouped[p.cadena].push(p)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
          Sell-In · Sensación CR · YTD 2026
        </p>
        <h2 className="text-base font-bold text-gray-800 mt-0.5">
          Facturación de Sensación a sus clientes ({moneda.toUpperCase()})
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          {data.ultimo_mes > 0 ? `Datos cargados hasta ${data.ultimo_mes_nombre}.` : 'Sin movimientos.'} Fuente: reporte Ventas Sensación por PDV.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-amber-50 border border-amber-200 rounded-xl shadow-sm p-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Venta YTD 2026 ({moneda.toUpperCase()})</p>
          <p className="text-xl font-bold text-amber-700">{fmtVal(totalVenta)}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">Hasta {data.ultimo_mes_nombre || '—'}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Unidades YTD 2026</p>
          <p className="text-xl font-bold text-gray-800">{fmtNum(data.uds_2026)}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">{data.uds_2025 > 0 ? `${fmtNum(data.uds_2025)} en 2025 mismo período` : 'Sin comparativo 2025'}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">vs YTD 2025</p>
          <p className={`text-xl font-bold ${data.delta_ytd === null ? 'text-gray-400' : data.delta_ytd >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {data.delta_ytd === null ? '—' : `${data.delta_ytd > 0 ? '+' : ''}${data.delta_ytd.toFixed(1)}%`}
          </p>
          <p className="text-[10px] text-gray-500 mt-0.5">${fmtNum(data.ytd_2025)} en 2025</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Clientes activos</p>
          <p className="text-xl font-bold text-gray-800">{data.por_cadena.filter(c => c.usd_2026 > 0).length}</p>
          <p className="text-[10px] text-gray-500 mt-0.5">cadenas con ventas 2026</p>
        </div>
      </div>

      {/* Sell-In Mensual (BarChart — estilo Éxito) */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h3 className="text-sm font-bold text-gray-800">Sell-In Mensual</h3>
            <p className="text-[11px] text-gray-400">2025 vs 2026 ({moneda.toUpperCase()})</p>
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-slate-400"/> 2025</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500"/> 2026</span>
          </div>
        </div>
        <div className="h-[260px] mt-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyChart} margin={{ top: 10, right: 16, left: 8, bottom: 0 }} barCategoryGap="22%" barGap={10}>
              <defs>
                <linearGradient id="gradSensaSI25" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#60a5fa" stopOpacity={1}/>
                  <stop offset="100%" stopColor="#93c5fd" stopOpacity={0.85}/>
                </linearGradient>
                <linearGradient id="gradSensaSI26" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#c8873a" stopOpacity={1}/>
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.85}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="mes_nombre" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={yFmt} tick={{ fontSize: 11, fill: '#94a3b8' }} width={60} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v: any) => [fmtVal(Number(v)), '']}
                cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
              />
              <Bar dataKey="v2025" name="2025" fill="url(#gradSensaSI25)" radius={[8,8,0,0]} maxBarSize={36}>
                <LabelList dataKey="v2025" position="top" formatter={(v: any) => fmt$Short(Number(v))}
                  style={{ fontSize: 9, fill: '#1e3a8a', fontWeight: 700 }} />
              </Bar>
              <Bar dataKey="v2026" name="2026" fill="url(#gradSensaSI26)" radius={[8,8,0,0]} maxBarSize={36}>
                <LabelList dataKey="v2026" position="top" formatter={(v: any) => fmt$Short(Number(v))}
                  style={{ fontSize: 9, fill: '#92400e', fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabla Clientes con drill-down por PDV */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-800">Clientes · 2026 YTD</h3>
          <span className="text-[10px] text-gray-400">Click en un cliente para ver sus PDVs</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider">
              <tr>
                <th onClick={() => toggleSort('cliente')}
                  className="text-left py-2 px-3 font-semibold cursor-pointer select-none hover:text-gray-700">
                  Cliente<SortArrow col="cliente"/>
                </th>
                <th onClick={() => toggleSort('venta')}
                  className="text-right py-2 px-3 font-semibold cursor-pointer select-none hover:text-gray-700">
                  Sell-In {moneda.toUpperCase()}<SortArrow col="venta"/>
                </th>
                <th onClick={() => toggleSort('uds')}
                  className="text-right py-2 px-3 font-semibold cursor-pointer select-none hover:text-gray-700">
                  Unidades<SortArrow col="uds"/>
                </th>
                <th onClick={() => toggleSort('share')}
                  className="text-right py-2 px-3 font-semibold cursor-pointer select-none hover:text-gray-700">
                  % Share<SortArrow col="share"/>
                </th>
                <th onClick={() => toggleSort('delta')}
                  className="text-right py-2 px-3 font-semibold cursor-pointer select-none hover:text-gray-700">
                  Δ vs 2025<SortArrow col="delta"/>
                </th>
              </tr>
            </thead>
            <tbody>
              {[...data.por_cadena].sort((a, b) => {
                const dir = sortDir === 'asc' ? 1 : -1
                if (sortCol === 'cliente') return a.cadena.localeCompare(b.cadena) * dir
                if (sortCol === 'uds')     return (a.uds_2026 - b.uds_2026) * dir
                if (sortCol === 'delta') {
                  const da = a.delta ?? -Infinity, db = b.delta ?? -Infinity
                  return (da - db) * dir
                }
                // 'venta' o 'share' — comparten mismo orden porque share es proporcional a venta
                return (a.usd_2026 - b.usd_2026) * dir
              }).map(c => {
                const total = data.por_cadena.reduce((s, x) => s + x.usd_2026, 0)
                const pct = total > 0 ? (c.usd_2026 / total) * 100 : 0
                const pdvs = pdvsGrouped[c.cadena] ?? []
                const isExp = expanded.has(c.cadena)
                return (
                  <FragmentRow key={c.cadena}>
                    <tr className="border-b border-gray-50 hover:bg-amber-50/30 cursor-pointer" onClick={() => toggle(c.cadena)}>
                      <td className="py-2 px-3 font-medium text-gray-700">
                        <span className="inline-block w-3 text-gray-400 mr-1">{isExp ? '▼' : '▶'}</span>
                        {c.cadena}
                        <span className="text-[10px] text-gray-400 ml-2">({pdvs.length} PDV)</span>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-800 font-semibold">
                        {isUsd ? fmt$Short(c.usd_2026) : fmtVal(c.usd_2026 * (data.ytd_2026 > 0 ? data.ytd_2026_crc / data.ytd_2026 : 500))}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-600">{fmtNum(c.uds_2026)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-gray-500">{pct.toFixed(1)}%</td>
                      <td className={`py-2 px-3 text-right tabular-nums font-semibold ${c.delta === null ? 'text-gray-400' : c.delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {c.delta === null ? '—' : `${c.delta > 0 ? '↑' : '↓'} ${Math.abs(c.delta).toFixed(1)}%`}
                      </td>
                    </tr>
                    {isExp && [...pdvs].sort((a, b) => {
                      const dir = sortDir === 'asc' ? 1 : -1
                      if (sortCol === 'cliente') return (a.cliente_nombre || '').localeCompare(b.cliente_nombre || '') * dir
                      if (sortCol === 'uds')     return (a.uds_2026 - b.uds_2026) * dir
                      if (sortCol === 'delta') {
                        const da = a.delta ?? -Infinity, db = b.delta ?? -Infinity
                        return (da - db) * dir
                      }
                      return (a.usd_2026 - b.usd_2026) * dir
                    }).map(p => {
                      const subTotal = pdvs.reduce((s, x) => s + x.usd_2026, 0)
                      const subPct = subTotal > 0 ? (p.usd_2026 / subTotal) * 100 : 0
                      return (
                        <tr key={p.cliente_codigo} className="bg-amber-50/20 border-b border-amber-100/50 text-[11px]">
                          <td className="py-1.5 pl-10 pr-3 text-gray-600">
                            <span className="text-gray-400 mr-1">{p.cliente_codigo}</span>
                            {p.cliente_nombre}
                            {p.ruta && <span className="text-gray-300 ml-2">· ruta {p.ruta}</span>}
                          </td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-gray-700">
                            {isUsd ? fmt$Short(p.usd_2026) : fmtVal(p.usd_2026 * (data.ytd_2026 > 0 ? data.ytd_2026_crc / data.ytd_2026 : 500))}
                          </td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-gray-500">{fmtNum(p.uds_2026)}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-gray-400">{subPct.toFixed(1)}%</td>
                          <td className={`py-1.5 px-3 text-right tabular-nums ${p.delta === null ? 'text-gray-400' : p.delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {p.delta === null ? '—' : `${p.delta > 0 ? '↑' : '↓'} ${Math.abs(p.delta).toFixed(0)}%`}
                          </td>
                        </tr>
                      )
                    })}
                  </FragmentRow>
                )
              })}
            </tbody>
            <tfoot className="border-t-2 border-gray-200 bg-gray-50">
              <tr className="font-bold text-gray-800">
                <td className="py-2 px-3 uppercase text-[10px] tracking-widest text-gray-500">TOTAL</td>
                <td className="py-2 px-3 text-right tabular-nums">{fmtVal(totalVenta)}</td>
                <td className="py-2 px-3 text-right tabular-nums">{fmtNum(data.uds_2026)}</td>
                <td className="py-2 px-3 text-right tabular-nums">100%</td>
                <td className={`py-2 px-3 text-right tabular-nums ${data.delta_ytd === null ? 'text-gray-400' : data.delta_ytd >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {data.delta_ytd === null ? '—' : `${data.delta_ytd > 0 ? '+' : ''}${data.delta_ytd.toFixed(1)}%`}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}

// Fragment wrapper para grupos de rows (tbody-safe alternative a <>...</>)
function FragmentRow({ children }: { children: ReactNode }) {
  return <>{children}</>
}
