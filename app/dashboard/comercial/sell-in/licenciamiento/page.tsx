'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, LabelList,
} from 'recharts'

// Formatters
const fmt$ = (v: unknown) => {
  const n = Number(v)
  if (!isFinite(n)) return '$0'
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K'
  return '$' + n.toFixed(0)
}
const fmtFull = (v: unknown) => {
  const n = Number(v)
  if (!isFinite(n)) return '$0'
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const fmtCOP = (v: number) => {
  if (!isFinite(v)) return '$0'
  if (Math.abs(v) >= 1e9) return '$' + (v / 1e9).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MM'
  if (Math.abs(v) >= 1e6) return '$' + (v / 1e6).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'M'
  if (Math.abs(v) >= 1e3) return '$' + (v / 1e3).toLocaleString('es-CO', { maximumFractionDigits: 0 }) + 'K'
  return '$' + Math.round(v).toLocaleString('es-CO')
}
const fmtNum = (v: number) => Math.round(v).toLocaleString('en-US')
const fmtLblSellin = (v: any, useUsd = false) => {
  const n = Number(v); if (!isFinite(n) || n === 0) return ''
  if (useUsd) {
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M'
    if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K'
    return '$' + Math.round(n)
  }
  if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'MM'
  if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(0) + 'M'
  if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K'
  return '$' + Math.round(n)
}
const fmtLblCop = (v: any) => {
  const n = Number(v); if (!isFinite(n) || n === 0) return ''
  if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'MM'
  if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(0) + 'M'
  if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K'
  return '$' + Math.round(n)
}
const MN12 = ['','ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

type SellInData = {
  kpi: {
    ultimo_mes: number
    uds_26: number; cop_26: number; usd_26: number; costo_26: number; ut_26: number
    margen_pct: number | null
    uds_25: number; cop_25: number; ut_25: number
    margen_pct_25: number | null
    delta_venta: number | null
    delta_unidades: number | null
    delta_utilidad: number | null
  }
  monthly: { mes: number; mes_nombre: string; cop_25: number; cop_26: number | null; uds_25: number; uds_26: number | null; ut_25: number; ut_26: number | null }[]
  top_skus: { sku: string; descripcion: string | null; categoria: string | null; subcategoria: string | null; uds: number; cop: number; usd: number; ut: number; margen_pct: number | null }[]
  ocs: { orden_compra: string; ano: number; mes: number; n_lineas: number; uds: number; cop: number; ut: number }[]
}

type SensacionData = {
  ytd_2026: number; ytd_2026_crc: number; uds_2026: number
  ytd_2025: number; ytd_2025_crc: number; uds_2025: number
  delta_ytd: number | null
  ultimo_mes: number; ultimo_mes_nombre: string
  por_cadena: { cadena: string; usd_2026: number; uds_2026: number; usd_2025: number; delta: number | null }[]
  por_producto: { producto: string; codigo_barras: string; usd_2026: number; uds_2026: number }[]
  monthly: { mes: number; mes_nombre: string; y2025: number; y2026: number | null; uds2025: number; uds2026: number | null; crc2025: number; crc2026: number | null }[]
}

type WalmartHelados = {
  ytd_2026: number; uds_2026: number
  ytd_2025: number; uds_2025: number
  delta_ytd: number | null
  ultimo_mes: number; ultimo_mes_nombre: string
  monthly: { mes: number; mes_nombre: string; y2025: number; y2026: number | null; uds2025: number; uds2026: number | null }[]
  por_producto: { codigo_barras: string; descripcion: string; usd: number; uds: number; pdvs: number }[]
  top_pdvs: { punto_venta: string; cadena: string; usd: number; uds: number }[]
}

export default function SellInLicenciamiento() {
  const [tipo, setTipo] = useState<'helados'|'colombia'>('colombia')
  const [moneda, setMoneda] = useState<'cop'|'usd'>('cop')
  const [monedaHel, setMonedaHel] = useState<'usd'|'crc'>('usd')
  const [data, setData] = useState<SellInData | null>(null)
  const [helados, setHelados] = useState<SensacionData | null>(null)
  const [wmHel, setWmHel] = useState<WalmartHelados | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingHel, setLoadingHel] = useState(false)

  // Sort para la tabla Top SKUs
  type SortCol = 'uds' | 'cop' | 'ut' | 'margen_pct'
  const [sortCol, setSortCol] = useState<SortCol>('cop')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const toggleSort = (col: SortCol) => {
    if (col === sortCol) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }
  const SortArrow = ({ col }: { col: SortCol }) => {
    const isActive = sortCol === col
    const btn = (dir: 'desc' | 'asc', lbl: string) => (
      <button
        onClick={(e) => { e.stopPropagation(); setSortCol(col); setSortDir(dir) }}
        className={`px-1.5 rounded text-[9px] font-bold leading-none py-0.5 border ${
          isActive && sortDir === dir
            ? 'bg-amber-500 text-white border-amber-500'
            : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'
        }`}
        title={`Ordenar ${dir === 'desc' ? 'de mayor a menor' : 'de menor a mayor'}`}>
        {lbl}
      </button>
    )
    return (
      <span className="inline-flex items-center gap-1 ml-1.5 align-middle">
        {btn('desc', '▼ Mayor')}
        {btn('asc',  '▲ Menor')}
      </span>
    )
  }

  useEffect(() => {
    if (tipo !== 'colombia') return
    if (data) return
    setLoading(true)
    fetch('/api/comercial/ejecucion/co/exito/sellin')
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [tipo, data])

  useEffect(() => {
    if (tipo !== 'helados') return
    if (helados && wmHel) return
    setLoadingHel(true)
    Promise.all([
      fetch('/api/comercial/ejecucion/cr/sensacion/kpis').then(r => r.json()),
      fetch('/api/comercial/sell-in/licenciamiento/walmart-helados').then(r => r.json()),
    ])
      .then(([h, w]) => { setHelados(h); setWmHel(w) })
      .finally(() => setLoadingHel(false))
  }, [tipo, helados, wmHel])

  const useUsd = moneda === 'usd'
  const fmtVal = (v: number) => useUsd ? fmtFull(v) : fmtCOP(v)

  return (
    <div className="p-6 space-y-4">
      <p className="text-xs text-gray-400 uppercase tracking-widest">Sell In</p>
      <h1 className="text-2xl font-bold text-gray-800">Licenciamiento</h1>

      {/* Toggle tipo */}
      <div className="flex items-center gap-3">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden w-fit">
          {(['helados','colombia'] as const).map(t => (
            <button key={t} onClick={() => setTipo(t)}
              className={`px-5 py-2 text-sm font-medium transition-colors ${tipo===t?'bg-amber-500 text-white':'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {t === 'helados' ? '🍦 Helados' : '🇨🇴 Colombia'}
            </button>
          ))}
        </div>

        {tipo === 'colombia' && (
          <div className="flex rounded-lg border border-gray-200 overflow-hidden w-fit">
            {(['cop','usd'] as const).map(m => (
              <button key={m} onClick={() => setMoneda(m)}
                className={`px-4 py-2 text-xs font-semibold transition-colors ${moneda===m?'bg-blue-600 text-white':'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {m.toUpperCase()}
              </button>
            ))}
          </div>
        )}

        {tipo === 'helados' && (
          <div className="flex rounded-lg border border-gray-200 overflow-hidden w-fit">
            {(['usd','crc'] as const).map(m => (
              <button key={m} onClick={() => setMonedaHel(m)}
                className={`px-4 py-2 text-xs font-semibold transition-colors ${monedaHel===m?'bg-amber-500 text-white':'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {m.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      {tipo === 'helados' && loadingHel && !helados && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array(4).fill(0).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse">
              <div className="h-3 bg-gray-100 rounded w-2/3 mb-3" />
              <div className="h-7 bg-gray-100 rounded w-1/2 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/3" />
            </div>
          ))}
        </div>
      )}

      {tipo === 'helados' && helados && (() => {
        const useHelUsd = monedaHel === 'usd'
        const fmtHel = (v: number) => useHelUsd
          ? '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : '₡ ' + Math.round(v).toLocaleString('es-CR')
        const fmtHelShort = (v: number) => {
          if (!isFinite(v) || v === 0) return useHelUsd ? '$0' : '₡0'
          if (Math.abs(v) >= 1e6) return (useHelUsd ? '$' : '₡') + (v / 1e6).toFixed(1) + 'M'
          if (Math.abs(v) >= 1e3) return (useHelUsd ? '$' : '₡') + (v / 1e3).toFixed(0) + 'K'
          return (useHelUsd ? '$' : '₡') + Math.round(v).toLocaleString()
        }
        const ventaSI = useHelUsd ? helados.ytd_2026 : helados.ytd_2026_crc
        const monthlySI = helados.monthly.map(m => ({
          mes_nombre: m.mes_nombre,
          v2025: useHelUsd ? m.y2025 : m.crc2025,
          v2026: useHelUsd ? m.y2026 : m.crc2026,
        })).filter(m => (m.v2025 && m.v2025 > 0) || (m.v2026 && m.v2026 > 0))

        // Walmart sellout — solo mostramos si hay data
        const wmMonthly = wmHel?.monthly.filter(m => (m.y2025 && m.y2025 > 0) || (m.y2026 && m.y2026 > 0)) ?? []

        return (
          <div className="space-y-5">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-center justify-between">
              <span>💡 Datos consolidados desde <b>Sensación CR</b> (Sell-In) y <b>Walmart CR</b> (Sell-Out) para los 4 helados Borden 320gr.</span>
              <a href="/dashboard/comercial/ejecucion/cr/sensacion" className="font-semibold text-amber-700 hover:text-amber-900 whitespace-nowrap ml-4">
                Ver ejecución Sensación →
              </a>
            </div>

            {/* ── SELL-IN (Sensación) ──────────────────────────────────────── */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-bold text-gray-800 uppercase tracking-widest">Sell-In · Sensación</h2>
                <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">DISTRIBUIDOR</span>
                <span className="text-[10px] text-gray-400">Hasta {helados.ultimo_mes_nombre || '—'} 2026</span>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-amber-50 border border-amber-200 rounded-xl shadow-sm p-4">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Sell-In YTD 2026 ({monedaHel.toUpperCase()})</p>
                  <p className="text-xl font-bold text-amber-700">{fmtHel(ventaSI)}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Hasta {helados.ultimo_mes_nombre || '—'}</p>
                </div>
                <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Unidades YTD</p>
                  <p className="text-xl font-bold text-gray-800">{fmtNum(helados.uds_2026)}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{helados.uds_2025 > 0 ? `${fmtNum(helados.uds_2025)} en 2025 mismo período` : 'Sin comparativo 2025'}</p>
                </div>
                <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">vs YTD 2025</p>
                  <p className={`text-xl font-bold ${helados.delta_ytd === null ? 'text-gray-400' : helados.delta_ytd >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {helados.delta_ytd === null ? '—' : `${helados.delta_ytd > 0 ? '+' : ''}${helados.delta_ytd.toFixed(1)}%`}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">USD ${fmtNum(helados.ytd_2025)} en 2025</p>
                </div>
                <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Cadenas activas</p>
                  <p className="text-xl font-bold text-gray-800">{helados.por_cadena.filter(c => c.usd_2026 > 0).length}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">con ventas 2026</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mt-3">
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <h3 className="text-sm font-bold text-gray-800">Sell-In Mensual</h3>
                    <p className="text-[11px] text-gray-400">2025 vs 2026 · {monedaHel.toUpperCase()}</p>
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-400"/> 2025</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"/> 2026</span>
                  </div>
                </div>
                <div className="h-[260px] mt-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlySI} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barCategoryGap="20%" barGap={4}>
                      <defs>
                        <linearGradient id="gradHelSI25" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#60a5fa" stopOpacity={1}/>
                          <stop offset="100%" stopColor="#93c5fd" stopOpacity={0.85}/>
                        </linearGradient>
                        <linearGradient id="gradHelSI26" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#c8873a" stopOpacity={1}/>
                          <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.85}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                      <XAxis dataKey="mes_nombre" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false}/>
                      <YAxis tickFormatter={(v: any) => fmtHelShort(Number(v))} tick={{ fontSize: 11, fill: '#94a3b8' }} width={60} axisLine={false} tickLine={false}/>
                      <Tooltip formatter={(v: unknown) => [fmtHel(Number(v)), '']}
                        cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                        contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}/>
                      <Bar dataKey="v2025" name="2025" fill="url(#gradHelSI25)" radius={[8,8,0,0]} maxBarSize={28}>
                        <LabelList dataKey="v2025" position="top" formatter={(v: any) => fmtHelShort(Number(v))}
                          style={{ fontSize: 9, fill: '#1e40af', fontWeight: 700 }}/>
                      </Bar>
                      <Bar dataKey="v2026" name="2026" fill="url(#gradHelSI26)" radius={[8,8,0,0]} maxBarSize={28}>
                        <LabelList dataKey="v2026" position="top" formatter={(v: any) => fmtHelShort(Number(v))}
                          style={{ fontSize: 9, fill: '#92400e', fontWeight: 700 }}/>
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* ── SELL-OUT (Walmart CR) ────────────────────────────────────── */}
            {wmHel && wmHel.ytd_2026 > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-sm font-bold text-gray-800 uppercase tracking-widest">Sell-Out · Walmart CR</h2>
                  <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">RETAIL</span>
                  <span className="text-[10px] text-gray-400">Hasta {wmHel.ultimo_mes_nombre || '—'} 2026</span>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl shadow-sm p-4">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Sell-Out YTD 2026 (USD)</p>
                    <p className="text-xl font-bold text-blue-700">${fmtNum(wmHel.ytd_2026)}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">Hasta {wmHel.ultimo_mes_nombre || '—'}</p>
                  </div>
                  <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Unidades YTD</p>
                    <p className="text-xl font-bold text-gray-800">{fmtNum(wmHel.uds_2026)}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{wmHel.uds_2025 > 0 ? `${fmtNum(wmHel.uds_2025)} en 2025 mismo período` : 'Sin comparativo 2025'}</p>
                  </div>
                  <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">vs YTD 2025</p>
                    <p className={`text-xl font-bold ${wmHel.delta_ytd === null ? 'text-gray-400' : wmHel.delta_ytd >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {wmHel.delta_ytd === null ? '—' : `${wmHel.delta_ytd > 0 ? '+' : ''}${wmHel.delta_ytd.toFixed(1)}%`}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-0.5">${fmtNum(wmHel.ytd_2025)} en 2025</p>
                  </div>
                  <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Ratio Sell-Out / Sell-In</p>
                    <p className="text-xl font-bold text-gray-800">
                      {helados.ytd_2026 > 0 ? ((wmHel.ytd_2026 / helados.ytd_2026) * 100).toFixed(0) : '—'}%
                    </p>
                    <p className="text-[10px] text-gray-500 mt-0.5">Del Sell-In llega a POS</p>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <h3 className="text-sm font-bold text-gray-800">Sell-Out Mensual · Walmart CR</h3>
                      <p className="text-[11px] text-gray-400">2025 vs 2026 · USD</p>
                    </div>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-400"/> 2025</span>
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"/> 2026</span>
                    </div>
                  </div>
                  <div className="h-[260px] mt-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={wmMonthly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barCategoryGap="20%" barGap={4}>
                        <defs>
                          <linearGradient id="gradHelWM25" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#94a3b8" stopOpacity={1}/>
                            <stop offset="100%" stopColor="#cbd5e1" stopOpacity={0.85}/>
                          </linearGradient>
                          <linearGradient id="gradHelWM26" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity={1}/>
                            <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.85}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                        <XAxis dataKey="mes_nombre" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false}/>
                        <YAxis tickFormatter={(v: any) => '$' + (Number(v) >= 1000 ? (Number(v)/1000).toFixed(0)+'K' : Math.round(Number(v)))}
                          tick={{ fontSize: 11, fill: '#94a3b8' }} width={55} axisLine={false} tickLine={false}/>
                        <Tooltip formatter={(v: unknown) => ['$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), '']}
                          cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                          contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}/>
                        <Bar dataKey="y2025" name="2025" fill="url(#gradHelWM25)" radius={[8,8,0,0]} maxBarSize={28}/>
                        <Bar dataKey="y2026" name="2026" fill="url(#gradHelWM26)" radius={[8,8,0,0]} maxBarSize={28}/>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Detalle por producto + top pdvs */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                    <h3 className="text-sm font-bold text-gray-800 mb-3">Sell-Out por Producto · 2026</h3>
                    <div className="space-y-2">
                      {wmHel.por_producto.map(p => {
                        const total = wmHel.por_producto.reduce((s, x) => s + x.usd, 0)
                        const pct = total > 0 ? (p.usd / total) * 100 : 0
                        return (
                          <div key={p.codigo_barras}>
                            <div className="flex items-center justify-between text-xs mb-0.5">
                              <span className="font-medium text-gray-700 truncate">{p.descripcion || p.codigo_barras}</span>
                              <span className="tabular-nums text-gray-600 whitespace-nowrap">
                                ${fmtNum(p.usd)} <span className="text-gray-400">· {fmtNum(p.uds)} und · {p.pdvs} PDV</span>
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
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                    <h3 className="text-sm font-bold text-gray-800 mb-3">Top 15 PDVs · 2026</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="text-gray-500 text-[10px] uppercase tracking-wider">
                          <tr className="border-b border-gray-100">
                            <th className="text-left py-1.5 font-semibold">PDV</th>
                            <th className="text-right py-1.5 font-semibold">USD</th>
                            <th className="text-right py-1.5 font-semibold">Uds</th>
                          </tr>
                        </thead>
                        <tbody>
                          {wmHel.top_pdvs.map(p => (
                            <tr key={p.punto_venta} className="border-b border-gray-50 hover:bg-blue-50/20">
                              <td className="py-1.5 pr-3 text-gray-700 truncate max-w-[180px]">{p.punto_venta}</td>
                              <td className="py-1.5 text-right tabular-nums text-gray-800 font-semibold">${fmtNum(p.usd)}</td>
                              <td className="py-1.5 text-right tabular-nums text-gray-500">{fmtNum(p.uds)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {tipo === 'colombia' && loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array(4).fill(0).map((_,i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse">
              <div className="h-3 bg-gray-100 rounded w-2/3 mb-3" />
              <div className="h-7 bg-gray-100 rounded w-1/2 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/3" />
            </div>
          ))}
        </div>
      )}

      {tipo === 'colombia' && data && (() => {
        const { kpi, monthly, top_skus, ocs } = data
        const ventaCur = useUsd ? kpi.usd_26 : kpi.cop_26
        // Tasa implícita 2026 (usd/cop) para derivar utilidad y costo en USD (no vienen del API).
        const rate26 = kpi.cop_26 > 0 && kpi.usd_26 > 0 ? kpi.usd_26 / kpi.cop_26 : 0
        const utCur    = useUsd ? kpi.ut_26 * rate26 : kpi.ut_26
        const currLbl  = useUsd ? 'USD' : 'COP'
        const monthlyF = monthly.filter(m => (m.cop_25 || 0) > 0 || (m.cop_26 || 0) > 0)
        const monthlyPlus = monthlyF.map(m => ({
          ...m,
          // Utilidad convertida a la moneda actual usando rate26
          ut_25_cur: useUsd ? (m.ut_25 * rate26) : m.ut_25,
          ut_26_cur: useUsd && m.ut_26 !== null ? (m.ut_26 * rate26) : m.ut_26,
          margen_26_pct: (m.cop_26 && m.cop_26 > 0 && m.ut_26 !== null) ? (m.ut_26 / m.cop_26) * 100 : null,
          margen_25_pct: (m.cop_25 > 0)                                 ? (m.ut_25 / m.cop_25) * 100 : null,
        }))
        const topSkus = [...top_skus]
          .sort((a, b) => {
            const va = (a[sortCol] ?? -Infinity) as number
            const vb = (b[sortCol] ?? -Infinity) as number
            return sortDir === 'desc' ? vb - va : va - vb
          })
          .slice(0, 15)

        return (
          <div className="space-y-5">
            {/* Aviso link a Grupo Éxito */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 flex items-center justify-between">
              <span>💡 Datos consolidados desde el módulo <b>Ejecución Grupo Éxito CO</b>. Sincronizados por SKU y mes.</span>
              <Link href="/dashboard/comercial/ejecucion/co/grupo-exito" className="font-semibold text-blue-700 hover:text-blue-900 whitespace-nowrap ml-4">
                Ver ejecución completa →
              </Link>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-amber-50 border border-amber-200 rounded-xl shadow-sm p-4">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Venta YTD 2026 ({useUsd?'USD':'COP'})</p>
                <p className="text-xl font-bold text-amber-700">{fmtVal(ventaCur)}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">Hasta mes {kpi.ultimo_mes || '—'}</p>
              </div>
              <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Unidades</p>
                <p className="text-xl font-bold text-gray-800">{fmtNum(kpi.uds_26)}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  {kpi.delta_unidades !== null ? `${kpi.delta_unidades > 0 ? '+' : ''}${kpi.delta_unidades.toFixed(1)}% vs 2025` : 'Sin comparativo'}
                </p>
              </div>
              <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Utilidad Bruta ({currLbl})</p>
                <p className="text-xl font-bold text-gray-800">{fmtVal(utCur)}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  {kpi.delta_utilidad !== null ? `${kpi.delta_utilidad > 0 ? '+' : ''}${kpi.delta_utilidad.toFixed(1)}% vs 2025` : 'Sin comparativo'}
                </p>
              </div>
              <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Margen Bruto %</p>
                <p className="text-xl font-bold text-gray-800">{kpi.margen_pct !== null ? `${kpi.margen_pct.toFixed(1)}%` : '—'}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  {kpi.margen_pct_25 !== null ? `2025: ${kpi.margen_pct_25.toFixed(1)}%` : 'Sin dato 2025'}
                </p>
              </div>
            </div>

            {/* Ventas mensuales */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <h3 className="text-sm font-bold text-gray-800">Sell-In Mensual</h3>
                  <p className="text-[11px] text-gray-400">2025 vs 2026 ({useUsd?'USD':'COP'})</p>
                </div>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-slate-400"/> 2025</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500"/> 2026</span>
                </div>
              </div>
              <div className="h-[260px] mt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyPlus} margin={{ top: 10, right: 16, left: 8, bottom: 0 }} barCategoryGap="22%" barGap={10}>
                    <defs>
                      <linearGradient id="gLicSellin25" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#60a5fa" stopOpacity={1}/>
                        <stop offset="100%" stopColor="#93c5fd" stopOpacity={0.85}/>
                      </linearGradient>
                      <linearGradient id="gLicSellin26" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#c8873a" stopOpacity={1}/>
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.85}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="mes_nombre" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v: any) => useUsd ? fmt$(Number(v)) : fmtCOP(Number(v))} tick={{ fontSize: 11, fill: '#94a3b8' }} width={60} axisLine={false} tickLine={false} />
                    <Tooltip
                      formatter={(v: any) => fmtVal(Number(v))}
                      cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                      contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                    />
                    <Bar dataKey="cop_25" name="2025" fill="url(#gLicSellin25)" radius={[8,8,0,0]} maxBarSize={36}>
                      <LabelList dataKey="cop_25" position="top"
                        formatter={(v: any) => fmtLblSellin(v, useUsd)}
                        style={{ fontSize: 9, fill: '#1e3a8a', fontWeight: 700 }} />
                    </Bar>
                    <Bar dataKey="cop_26" name="2026" fill="url(#gLicSellin26)" radius={[8,8,0,0]} maxBarSize={36}>
                      <LabelList dataKey="cop_26" position="top"
                        formatter={(v: any) => fmtLblSellin(v, useUsd)}
                        style={{ fontSize: 9, fill: '#92400e', fontWeight: 700 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Utilidad + Margen */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <h3 className="text-sm font-bold text-gray-800">Utilidad Bruta Mensual</h3>
                    <p className="text-[11px] text-gray-400">2025 vs 2026 · {currLbl}</p>
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-slate-400"/> 2025</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"/> 2026</span>
                  </div>
                </div>
                <div className="h-[220px] mt-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyPlus} margin={{ top: 10, right: 16, left: 8, bottom: 0 }} barCategoryGap="22%" barGap={10}>
                      <defs>
                        <linearGradient id="gLicUt25" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#60a5fa" stopOpacity={1}/>
                          <stop offset="100%" stopColor="#93c5fd" stopOpacity={0.85}/>
                        </linearGradient>
                        <linearGradient id="gLicUt26" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2a7a58" stopOpacity={1}/>
                          <stop offset="100%" stopColor="#4a9b78" stopOpacity={0.85}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="mes_nombre" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={(v: any) => fmtVal(Number(v))} tick={{ fontSize: 11, fill: '#94a3b8' }} width={55} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(v: any) => fmtVal(Number(v))}
                        cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                        contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                      />
                      <Bar dataKey="ut_25_cur" name="2025" fill="url(#gLicUt25)" radius={[8,8,0,0]} maxBarSize={36}>
                        <LabelList dataKey="ut_25_cur" position="top"
                          formatter={(v: any) => fmtLblSellin(v, useUsd)}
                          style={{ fontSize: 9, fill: '#1e3a8a', fontWeight: 700 }} />
                      </Bar>
                      <Bar dataKey="ut_26_cur" name="2026" fill="url(#gLicUt26)" radius={[8,8,0,0]} maxBarSize={36}>
                        <LabelList dataKey="ut_26_cur" position="top"
                          formatter={(v: any) => fmtLblSellin(v, useUsd)}
                          style={{ fontSize: 9, fill: '#065f46', fontWeight: 700 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <h3 className="text-sm font-bold text-gray-800">Margen Bruto % por Mes</h3>
                    <p className="text-[11px] text-gray-400">Evolución 2025 vs 2026</p>
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-400"/> 2025</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-violet-500"/> 2026</span>
                  </div>
                </div>
                <div className="h-[220px] mt-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlyPlus} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gLicMargen26" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.35}/>
                          <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="mes_nombre" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={(v: any) => `${Math.round(Number(v))}%`} tick={{ fontSize: 11, fill: '#94a3b8' }} width={40} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(v: any) => v === null ? '—' : `${Number(v).toFixed(1)}%`}
                        contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                      />
                      <Line dataKey="margen_25_pct" name="2025" type="monotone" stroke="#94a3b8" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls />
                      <Area dataKey="margen_26_pct" name="2026" type="monotone" stroke="#8b5cf6" strokeWidth={2.5}
                        fill="url(#gLicMargen26)" dot={false} activeDot={{ r: 5, strokeWidth: 2, fill: '#fff', stroke: '#8b5cf6' }} connectNulls />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Top SKUs */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Top SKUs YTD 2026</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider">#</th>
                      <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider">Descripción</th>
                      <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider">Subcategoría</th>
                      <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider select-none cursor-pointer hover:text-amber-700"
                          onClick={() => toggleSort('uds')} title="Ordenar por unidades">
                        Unidades<SortArrow col="uds" />
                      </th>
                      <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider select-none cursor-pointer hover:text-amber-700"
                          onClick={() => toggleSort('cop')} title="Ordenar por venta">
                        Venta {useUsd?'USD':'COP'}<SortArrow col="cop" />
                      </th>
                      <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider select-none cursor-pointer hover:text-amber-700"
                          onClick={() => toggleSort('ut')} title="Ordenar por utilidad">
                        Utilidad COP<SortArrow col="ut" />
                      </th>
                      <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider select-none cursor-pointer hover:text-amber-700"
                          onClick={() => toggleSort('margen_pct')} title="Ordenar por margen">
                        Margen %<SortArrow col="margen_pct" />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {topSkus.map((s, i) => (
                      <tr key={s.sku} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className="px-3 py-2 text-gray-400 tabular-nums">{i + 1}</td>
                        <td className="px-3 py-2 text-gray-800 max-w-[280px] truncate" title={s.descripcion ?? ''}>{s.descripcion ?? s.sku}</td>
                        <td className="px-3 py-2 text-gray-500">{s.subcategoria ?? '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtNum(s.uds)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{useUsd ? fmtFull(s.usd) : fmtCOP(s.cop)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtCOP(s.ut)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.margen_pct !== null ? `${s.margen_pct.toFixed(1)}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* OCs recientes */}
            {ocs.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Órdenes de Compra Recientes</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider">OC</th>
                        <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider">Mes</th>
                        <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider"># Líneas</th>
                        <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider">Unidades</th>
                        <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider">Venta COP</th>
                        <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider">Utilidad COP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ocs.map((o, i) => (
                        <tr key={`${o.orden_compra}-${o.mes}`} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                          <td className="px-3 py-2 font-mono text-[11px] text-gray-700">{o.orden_compra}</td>
                          <td className="px-3 py-2 text-gray-500">{MN12[o.mes]}-{String(o.ano).slice(-2)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{o.n_lineas}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtNum(o.uds)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtCOP(o.cop)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtCOP(o.ut)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
