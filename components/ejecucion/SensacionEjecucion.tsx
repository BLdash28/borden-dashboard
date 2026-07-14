'use client'
import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, AreaChart, Area, ComposedChart,
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
    por_producto: { codigo_barras: string; descripcion: string; usd: number; uds: number; pdvs: number }[]
    top_pdvs: { punto_venta: string; cadena: string; usd: number; uds: number }[]
  } | null>(null)
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

              {/* Grid: por Cadena + por Producto */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <h3 className="text-sm font-bold text-gray-800 mb-3">Por Cadena · 2026</h3>
                  <div className="space-y-2">
                    {data.por_cadena.map(c => {
                      const total = data.por_cadena.reduce((s, x) => s + x.usd_2026, 0)
                      const pct = total > 0 ? (c.usd_2026 / total) * 100 : 0
                      return (
                        <div key={c.cadena}>
                          <div className="flex items-center justify-between text-xs mb-0.5">
                            <span className="font-medium text-gray-700">{c.cadena}</span>
                            <span className="tabular-nums text-gray-600">
                              {fmt$(c.usd_2026)} <span className="text-gray-300">· {pct.toFixed(1)}%</span>
                              {c.delta !== null && (
                                <span className={`ml-2 font-semibold ${c.delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                  {c.delta > 0 ? '+' : ''}{c.delta.toFixed(1)}%
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-amber-400 to-amber-600 rounded-full" style={{ width: `${pct}%` }}/>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <h3 className="text-sm font-bold text-gray-800 mb-3">Por Producto · 2026</h3>
                  <div className="space-y-2">
                    {data.por_producto.map(p => {
                      const total = data.por_producto.reduce((s, x) => s + x.usd_2026, 0)
                      const pct = total > 0 ? (p.usd_2026 / total) * 100 : 0
                      return (
                        <div key={p.codigo_barras}>
                          <div className="flex items-center justify-between text-xs mb-0.5">
                            <span className="font-medium text-gray-700 truncate">{p.producto}</span>
                            <span className="tabular-nums text-gray-600 whitespace-nowrap">
                              {fmt$(p.usd_2026)} <span className="text-gray-400">· {fmtNum(p.uds_2026)} und</span>
                            </span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full" style={{ width: `${pct}%` }}/>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

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

                    {/* Chart Sell-Out mensual — valor (bars) + unidades (areas) */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-gray-800">Sell-Out Mensual · Walmart CR</h3>
                          <p className="text-[11px] text-gray-400">Valor (barras) + Unidades (área) · USD</p>
                        </div>
                        <div className="flex items-center gap-3 text-[11px]">
                          <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm bg-slate-400"/><span className="w-3 h-2 rounded-sm bg-blue-500"/> Valor</span>
                          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-300 border border-slate-400"/><span className="w-2 h-2 rounded-full bg-emerald-500 border border-emerald-700"/> Unidades</span>
                        </div>
                      </div>
                      <div className="h-[280px] mt-3">
                        <ResponsiveContainer width="100%" height="100%">
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
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* ── Sell-In ── */}
          {tab === 'sellin' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-gray-800">Sell-In Mensual (Área)</h3>
                    <p className="text-[11px] text-gray-400">Serie 2025 → 2026 · {moneda.toUpperCase()}</p>
                  </div>
                </div>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.monthly.map(m => ({
                      mes_nombre: `${m.mes_nombre}`,
                      valor: isUsd ? ((m.y2026 ?? 0) + m.y2025) : ((m.crc2026 ?? 0) + m.crc2025),
                      v25: isUsd ? m.y2025 : m.crc2025,
                      v26: isUsd ? m.y2026 : m.crc2026,
                    }))} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradSensaSI" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#c8873a" stopOpacity={0.35}/>
                          <stop offset="60%" stopColor="#c8873a" stopOpacity={0.08}/>
                          <stop offset="100%" stopColor="#c8873a" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                      <XAxis dataKey="mes_nombre" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false}/>
                      <YAxis tickFormatter={(v: any) => fmtVal(Number(v))} tick={{ fontSize: 11, fill: '#94a3b8' }} width={60} axisLine={false} tickLine={false}/>
                      <Tooltip formatter={(v: unknown, n: string) => [tipVal(v), n === 'v25' ? '2025' : '2026']}
                        contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}/>
                      <Area type="monotone" dataKey="v25" stroke="#94a3b8" strokeWidth={2} fill="none" dot={false}/>
                      <Area type="monotone" dataKey="v26" stroke="#c8873a" strokeWidth={2.5} fill="url(#gradSensaSI)" dot={false}
                        activeDot={{ r: 5, strokeWidth: 2, fill: '#fff', stroke: '#c8873a' }} connectNulls/>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Detalle Cadena × Producto */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h3 className="text-sm font-bold text-gray-800 mb-3">Cadena × Producto · 2026 YTD</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider">
                      <tr>
                        <th className="text-left py-2 px-3 font-semibold">Cadena</th>
                        <th className="text-right py-2 px-3 font-semibold">Sell-In {moneda.toUpperCase()}</th>
                        <th className="text-right py-2 px-3 font-semibold">Unidades</th>
                        <th className="text-right py-2 px-3 font-semibold">% Share</th>
                        <th className="text-right py-2 px-3 font-semibold">Δ vs 2025</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.por_cadena.map(c => {
                        const total = data.por_cadena.reduce((s, x) => s + x.usd_2026, 0)
                        const pct = total > 0 ? (c.usd_2026 / total) * 100 : 0
                        return (
                          <tr key={c.cadena} className="border-b border-gray-50 hover:bg-amber-50/30">
                            <td className="py-2 px-3 font-medium text-gray-700">{c.cadena}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-gray-800 font-semibold">
                              {isUsd ? fmt$Full(c.usd_2026) : fmtCRC(c.usd_2026 * 500)}
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums text-gray-600">{fmtNum(c.uds_2026)}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-gray-500">{pct.toFixed(1)}%</td>
                            <td className={`py-2 px-3 text-right tabular-nums font-semibold ${c.delta === null ? 'text-gray-400' : c.delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                              {c.delta === null ? '—' : `${c.delta > 0 ? '+' : ''}${c.delta.toFixed(1)}%`}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                      <tr className="font-bold text-gray-800">
                        <td className="py-2 px-3 uppercase text-[10px] tracking-widest text-gray-500">TOTAL</td>
                        <td className="py-2 px-3 text-right tabular-nums">{fmtVal(ventaCur)}</td>
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
          )}
        </>
      )}
    </div>
  )
}
