'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell,
} from 'recharts'

const PAIS         = 'CR'
const PAIS_NOMBRE  = 'Costa Rica'
const BANDERA      = '🇨🇷'
const CADENA_LABEL = 'Walmart Group'

const SECTIONS = [
  { key: 'resumen',  label: 'Resumen'         },
  { key: 'evolucion', label: 'Evolución'       },
  { key: 'top-skus', label: 'Top SKUs / Pareto'},
]

const CADENA_COLORS: Record<string, string> = {
  'WALMART':     '#0071CE',
  'MAS X MENOS': '#F4821F',
  'MAXI PALI':   '#E53935',
}
const CAT_COLORS: Record<string, string> = {
  'Quesos': '#c8873a',
  'Leches': '#3b82f6',
}

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

function Delta({ d }: { d: number | null | undefined }) {
  const n = d ?? 0
  const pos = n > 0.5; const neg = n < -0.5
  const cls = pos ? 'text-emerald-600 bg-emerald-50' : neg ? 'text-red-500 bg-red-50' : 'text-gray-400 bg-gray-50'
  const Icon = pos ? TrendingUp : neg ? TrendingDown : Minus
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>
      <Icon size={10} />{n > 0 ? '+' : ''}{n.toFixed(1)}%
    </span>
  )
}

function CardSkeleton() {
  return <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse">
    <div className="h-3 bg-gray-100 rounded w-2/3 mb-3" />
    <div className="h-7 bg-gray-100 rounded w-1/2 mb-2" />
    <div className="h-3 bg-gray-100 rounded w-1/3" />
  </div>
}

export default function CRWalmartPage() {
  const [section, setSection] = useState('resumen')
  const [kpis,    setKpis]    = useState<any>(null)
  const [ts,      setTs]      = useState<any>(null)
  const [topSkus, setTopSkus] = useState<any[]>([])
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [catFilter,    setCatFilter]    = useState('')
  const [cadenaFilter, setCadenaFilter] = useState('')
  const [topN, setTopN] = useState(15)

  const setL = (k: string, v: boolean) => setLoading(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (section === 'resumen') {
      setL('resumen', true)
      const q = new URLSearchParams({ pais: PAIS })
      if (catFilter) q.set('categoria', catFilter)
      fetch('/api/comercial/ejecucion/walmart/kpis?' + q)
        .then(r => r.json()).then(setKpis).finally(() => setL('resumen', false))
    } else if (section === 'evolucion') {
      setL('evolucion', true)
      const q = new URLSearchParams({ pais: PAIS })
      if (catFilter)    q.set('categoria', catFilter)
      if (cadenaFilter) q.set('cadena',    cadenaFilter)
      fetch('/api/comercial/ejecucion/walmart/timeseries?' + q)
        .then(r => r.json()).then(setTs).finally(() => setL('evolucion', false))
    } else if (section === 'top-skus') {
      setL('top-skus', true)
      const q = new URLSearchParams({ pais: PAIS, top: String(topN) })
      if (catFilter)    q.set('categoria', catFilter)
      if (cadenaFilter) q.set('cadena',    cadenaFilter)
      fetch('/api/comercial/ejecucion/walmart/top-skus?' + q)
        .then(r => r.json()).then(d => setTopSkus(d.rows ?? [])).finally(() => setL('top-skus', false))
    }
  }, [section, catFilter, cadenaFilter, topN]) // eslint-disable-line

  const isL = (k: string) => !!loading[k]

  // ── Resumen ──────────────────────────────────────────────────────────────
  function Resumen() {
    const L = isL('resumen')
    if (L) return <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{Array(4).fill(0).map((_,i) => <CardSkeleton key={i} />)}</div>

    const total    = kpis?.ytd_2026   ?? 0
    const prev     = kpis?.ytd_2025   ?? 0
    const units    = kpis?.uni_2026   ?? 0
    const delta    = kpis?.delta_ytd  ?? null
    const lastMon  = kpis?.ultimo_mes_nombre ?? '—'
    const avgMes   = kpis?.ultimo_mes > 0 ? total / kpis.ultimo_mes : 0
    const cadenas  = kpis?.por_cadena ?? []
    const cats     = kpis?.por_categoria ?? []
    const monthly  = (kpis?.monthly ?? []).filter((m: any) => m.y2025 > 0 || m.y2026 !== null)

    return (
      <div className="space-y-5">
        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Sell-Out YTD 2026', value: fmtFull(total), sub: `hasta ${lastMon}`, icon: '💰', tc: 'text-gray-800', bg: 'bg-white border-gray-100' },
            { label: 'vs YTD 2025',       value: delta !== null ? <Delta d={delta} /> : <span className="text-sm text-gray-400">Sin hist.</span>, sub: prev > 0 ? `2025: ${fmtFull(prev)}` : 'Sin dato 2025', icon: '📊', tc: 'text-gray-800', bg: 'bg-white border-gray-100' },
            { label: 'Unidades YTD',      value: units.toLocaleString('en-US'), sub: 'cajas vendidas', icon: '📦', tc: 'text-gray-800', bg: 'bg-white border-gray-100' },
            { label: 'Promedio Mensual',  value: fmt$(avgMes), sub: `${kpis?.ultimo_mes ?? 0} meses con datos`, icon: '📅', tc: 'text-gray-800', bg: 'bg-white border-gray-100' },
          ].map(c => (
            <div key={c.label} className={`rounded-xl border shadow-sm p-4 md:p-5 ${c.bg}`}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] md:text-xs font-semibold text-gray-400 uppercase tracking-widest">{c.label}</p>
                <span className="text-lg">{c.icon}</span>
              </div>
              <p className={`text-lg md:text-2xl font-bold mb-1 ${c.tc}`}>{c.value}</p>
              <p className="text-xs text-gray-400">{c.sub}</p>
            </div>
          ))}
        </div>

        {/* Sell-Out dark card */}
        <div className="bg-[#1b3b5f] rounded-xl p-5 text-white">
          <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-widest mb-2">🛒 SELL-OUT REAL YTD 2026 · {CADENA_LABEL}</p>
          <p className="text-3xl font-bold mb-1">{fmtFull(total)}</p>
          <p className="text-xs text-blue-300 mb-4">
            {cats.map((c: any) => c.valor_2026 > 0 ? `${c.categoria} ${fmtFull(c.valor_2026)}` : null).filter(Boolean).join(' + ') || 'YTD 2026'}
          </p>
          <div className="border-t border-white/10 pt-3 grid grid-cols-3 gap-4">
            {cadenas.map((c: any) => (
              <div key={c.cadena}>
                <p className="text-[9px] uppercase tracking-widest text-blue-300 mb-1">{c.cadena}</p>
                <p className="text-sm font-bold text-yellow-300">{fmtFull(c.valor_2026)}</p>
                <p className="text-[10px] text-blue-300">{c.uni_2026.toLocaleString('en-US')} u</p>
              </div>
            ))}
          </div>
        </div>

        {/* Por cadena cards */}
        {cadenas.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Por Cadena</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {cadenas.map((c: any) => {
                const pct = total > 0 ? (c.valor_2026 / total * 100) : 0
                const color = CADENA_COLORS[c.cadena] ?? '#6b7280'
                return (
                  <div key={c.cadena} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                      <p className="text-xs font-semibold text-gray-600 truncate">{c.cadena}</p>
                    </div>
                    <p className="text-xl font-bold text-gray-800">{fmtFull(c.valor_2026)}</p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-gray-400">{pct.toFixed(1)}% del total</p>
                      {c.delta !== null ? <Delta d={c.delta} /> : <span className="text-[11px] text-gray-300">Sin 2025</span>}
                    </div>
                    <div className="mt-2 bg-gray-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Monthly bar chart */}
        {monthly.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Venta Mensual — 2025 / 2026</h3>
            <div className="h-[180px] md:h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="mes_nombre" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => fmt$(v)} tick={{ fontSize: 11 }} width={50} />
                  <Tooltip formatter={(v: any) => fmtFull(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="y2025" name="2025" fill="#cbd5e1" radius={[2,2,0,0]} />
                  <Bar dataKey="y2026" name="2026" fill="#c8873a" radius={[2,2,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Evolución ─────────────────────────────────────────────────────────────
  function Evolucion() {
    const L = isL('evolucion')
    if (L) return <div className="space-y-4">{Array(2).fill(0).map((_,i) => (
      <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse">
        <div className="h-4 bg-gray-100 rounded w-1/3 mb-4" /><div className="h-[220px] bg-gray-50 rounded" />
      </div>
    ))}</div>

    const series  = (ts?.series   ?? []).filter((m: any) => m.y2025 > 0 || m.y2026 !== null)
    const cadenas = ts?.cadenas   ?? []
    const byCad   = (ts?.byCadena ?? []).filter((m: any) => cadenas.some((c: string) => m[c] !== null))
    const cats    = ts?.categorias ?? []
    const byCat   = (ts?.byCategorias ?? []).filter((m: any) => cats.some((c: string) => m[c] !== null))

    return (
      <div className="space-y-5">
        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <select value={cadenaFilter} onChange={e => setCadenaFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 bg-white">
            <option value="">Todas las cadenas</option>
            {(ts?.cadenas ?? ['WALMART','MAS X MENOS','MAXI PALI']).map((c: string) => <option key={c}>{c}</option>)}
          </select>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 bg-white">
            <option value="">Todas las categorías</option>
            <option>Quesos</option><option>Leches</option>
          </select>
        </div>

        {/* 2025 vs 2026 comparison */}
        {series.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Venta Mensual — 2025 vs 2026</h3>
            <p className="text-xs text-gray-400 mb-4">Sell-out en dólares{catFilter ? ` · ${catFilter}` : ''}{cadenaFilter ? ` · ${cadenaFilter}` : ''}</p>
            <div className="h-[200px] md:h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="mes_nombre" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={fmt$} tick={{ fontSize: 11 }} width={50} />
                  <Tooltip formatter={(v: any) => fmtFull(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="y2025" name="2025" fill="#cbd5e1" radius={[2,2,0,0]} />
                  <Bar dataKey="y2026" name="2026" fill="#c8873a" radius={[2,2,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* By cadena (only if not filtered to 1) */}
        {!cadenaFilter && byCad.length > 0 && cadenas.length > 1 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">2026 por Cadena</h3>
            <p className="text-xs text-gray-400 mb-4">Venta mensual separada por cadena Walmart Group</p>
            <div className="h-[180px] md:h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byCad} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="mes_nombre" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={fmt$} tick={{ fontSize: 11 }} width={50} />
                  <Tooltip formatter={(v: any) => v !== null ? fmtFull(v) : '—'} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {cadenas.map((c: string) => (
                    <Bar key={c} dataKey={c} name={c} fill={CADENA_COLORS[c] ?? '#6b7280'} radius={[2,2,0,0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* By categoria */}
        {cats.length > 1 && byCat.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">2026 por Categoría</h3>
            <p className="text-xs text-gray-400 mb-4">Quesos vs Leches</p>
            <div className="h-[160px] md:h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byCat} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="mes_nombre" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={fmt$} tick={{ fontSize: 11 }} width={50} />
                  <Tooltip formatter={(v: any) => v !== null ? fmtFull(v) : '—'} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {cats.map((c: string) => (
                    <Bar key={c} dataKey={c} name={c} fill={CAT_COLORS[c] ?? '#6b7280'} stackId="a" radius={[2,2,0,0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {series.length === 0 && <p className="text-center text-gray-300 py-12 text-sm">Sin datos para los filtros seleccionados</p>}
      </div>
    )
  }

  // ── Top SKUs ──────────────────────────────────────────────────────────────
  function TopSkus() {
    const L = isL('top-skus')

    const total = topSkus.reduce((s, r) => s + r.valor_2026, 0)

    return (
      <div className="space-y-5">
        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 bg-white">
            <option value="">Todas las categorías</option>
            <option>Quesos</option><option>Leches</option>
          </select>
          <select value={cadenaFilter} onChange={e => setCadenaFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 bg-white">
            <option value="">Todas las cadenas</option>
            <option>WALMART</option><option>MAS X MENOS</option><option>MAXI PALI</option>
          </select>
          <select value={topN} onChange={e => setTopN(Number(e.target.value))}
            className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 bg-white">
            <option value={10}>Top 10</option>
            <option value={15}>Top 15</option>
            <option value={20}>Top 20</option>
          </select>
        </div>

        {/* Pareto bar chart */}
        {!L && topSkus.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Pareto SKUs — YTD 2026</h3>
            <p className="text-xs text-gray-400 mb-4">Valor en dólares + curva acumulada</p>
            <div className="h-[220px] md:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={topSkus.slice(0, topN)}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="descripcion" tick={{ fontSize: 9 }} interval={0} angle={-35} textAnchor="end" height={60} />
                  <YAxis yAxisId="left"  tickFormatter={fmt$} tick={{ fontSize: 11 }} width={50} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={v => v + '%'} tick={{ fontSize: 11 }} width={35} domain={[0,100]} />
                  <Tooltip formatter={(v: any, name: string) => name === 'cum_share' ? v + '%' : fmtFull(v)} />
                  <Bar yAxisId="left" dataKey="valor_2026" name="Valor 2026" fill="#c8873a" radius={[2,2,0,0]}>
                    {topSkus.slice(0, topN).map((r, i) => (
                      <Cell key={i} fill={r.cum_share <= 80 ? '#c8873a' : r.cum_share <= 95 ? '#94a3b8' : '#e2e8f0'} />
                    ))}
                  </Bar>
                  <Line yAxisId="right" type="monotone" dataKey="cum_share" name="Acumulado %" stroke="#1d4ed8" strokeWidth={1.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-3 mt-2">
              {[['#c8873a','Clase A (≤80%)'],['#94a3b8','Clase B (80-95%)'],['#e2e8f0','Clase C (>95%)']].map(([c,l]) => (
                <div key={l} className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  <div className="w-3 h-3 rounded-sm" style={{ background: c }} />{l}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SKU table */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Detalle por SKU</h3>
              <p className="text-xs text-gray-400">YTD 2026 · sell-out {CADENA_LABEL}</p>
            </div>
            {total > 0 && <span className="text-xs font-semibold text-gray-500">{fmtFull(total)} total</span>}
          </div>
          {L ? (
            <div className="divide-y divide-gray-50">
              {Array(8).fill(0).map((_,i) => (
                <div key={i} className="px-4 py-3 flex gap-4 animate-pulse">
                  <div className="h-3 bg-gray-100 rounded flex-1" />
                  <div className="h-3 bg-gray-100 rounded w-16" />
                  <div className="h-3 bg-gray-100 rounded w-12" />
                </div>
              ))}
            </div>
          ) : topSkus.length === 0 ? (
            <p className="text-center text-gray-300 py-12 text-sm">Sin datos</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-400 uppercase tracking-widest text-[10px]">
                    <th className="text-center px-3 py-2.5 w-8">#</th>
                    <th className="text-left px-4 py-2.5">Descripción</th>
                    <th className="text-left px-3 py-2.5">Cat.</th>
                    <th className="text-right px-4 py-2.5">Valor 2026</th>
                    <th className="text-right px-4 py-2.5">Unidades</th>
                    <th className="text-right px-4 py-2.5">Share</th>
                    <th className="text-right px-4 py-2.5">vs 2025</th>
                    <th className="text-right px-4 py-2.5">Acum.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {topSkus.map((r, i) => (
                    <tr key={r.sku + i} className={`hover:bg-gray-50/60 ${r.cum_share <= 80 ? '' : r.cum_share <= 95 ? 'opacity-75' : 'opacity-50'}`}>
                      <td className="px-3 py-2.5 text-center text-gray-400 font-mono">{i + 1}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-700">
                        <span className="text-gray-400 mr-1.5 font-normal">{r.sku}</span>{r.descripcion}
                      </td>
                      <td className="px-3 py-2.5 text-gray-400">{r.categoria}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-gray-700">{fmtFull(r.valor_2026)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-500">{r.uni_2026.toLocaleString('en-US')}</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-12 bg-gray-100 rounded-full h-1.5 hidden md:block">
                            <div className="h-1.5 rounded-full bg-amber-400" style={{ width: `${r.share_pct}%` }} />
                          </div>
                          <span className="font-mono text-gray-500">{r.share_pct.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {r.delta !== null ? <Delta d={r.delta} /> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-400">{r.cum_share.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm">
        <div className="flex items-center gap-3 px-4 md:px-6 py-3">
          <Link href="/dashboard/comercial/ejecucion"
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-amber-600 transition-colors flex-shrink-0">
            <ArrowLeft size={13} /> Ejecución
          </Link>
          <span className="text-gray-200">|</span>
          <span className="text-xl">{BANDERA}</span>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-gray-800 text-sm truncate">
              {CADENA_LABEL}
              <span className="text-gray-400 font-normal ml-1">· {PAIS_NOMBRE}</span>
            </h1>
          </div>
          <button
            onClick={() => { setKpis(null); setTs(null); setTopSkus([]) }}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex-shrink-0">
            <RefreshCw size={12} /> Recargar
          </button>
        </div>

        {/* Section tabs */}
        <div className="flex overflow-x-auto border-t border-gray-50 px-4 md:px-6">
          {SECTIONS.map(s => (
            <button key={s.key} onClick={() => setSection(s.key)}
              className={`text-xs font-medium px-4 py-2.5 border-b-2 whitespace-nowrap transition-colors ${
                section === s.key
                  ? 'border-amber-500 text-amber-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-3 md:p-6 max-w-6xl mx-auto">
        {section === 'resumen'   && <Resumen />}
        {section === 'evolucion' && <Evolucion />}
        {section === 'top-skus'  && <TopSkus />}
      </div>
    </div>
  )
}
