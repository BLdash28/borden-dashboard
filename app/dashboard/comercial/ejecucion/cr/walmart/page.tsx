'use client'
import { useEffect, useState } from 'react'
import { RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import {
  BarChart, Bar, ComposedChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell,
} from 'recharts'

const DIVS = [
  { key: 'TOTAL', label: 'Total',     cat: '' },
  { key: 'QUESO', label: '🧀 Queso', cat: 'Quesos' },
  { key: 'LECHE', label: '🥛 Leche', cat: 'Leches' },
]

const SECTIONS = [
  { key: 'resumen',   label: 'Resumen'          },
  { key: 'evolucion', label: 'Evolución Ventas'  },
  { key: 'pareto',    label: 'Pareto / Top SKUs' },
]

const CADENA_COLORS: Record<string, string> = {
  'WALMART':     '#0071CE',
  'MAS X MENOS': '#F4821F',
  'MAXI PALI':   '#E53935',
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

function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {Array(rows).fill(0).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse">
          <div className="h-3 bg-gray-100 rounded w-2/3 mb-3" />
          <div className="h-7 bg-gray-100 rounded w-1/2 mb-2" />
          <div className="h-3 bg-gray-100 rounded w-1/3" />
        </div>
      ))}
    </div>
  )
}

export default function CRWalmartPage() {
  const [section,      setSection]      = useState('resumen')
  const [div,          setDiv]          = useState('TOTAL')
  const [kpis,         setKpis]         = useState<any>(null)
  const [ts,           setTs]           = useState<any>(null)
  const [topSkus,      setTopSkus]      = useState<any[]>([])
  const [topN,         setTopN]         = useState(15)
  const [cadenaFilter, setCadenaFilter] = useState('')
  const [loading,      setLoading]      = useState<Record<string, boolean>>({})

  const setL = (k: string, v: boolean) => setLoading(p => ({ ...p, [k]: v }))
  const isL  = (k: string) => !!loading[k]

  const currentCat = DIVS.find(d => d.key === div)?.cat ?? ''

  const goSection = (key: string) => {
    setSection(key)
    window.location.hash = key
    localStorage.setItem('cr-walmart-section', key)
  }

  useEffect(() => {
    const saved = localStorage.getItem('cr-walmart-section')
    const h = window.location.hash.slice(1)
    const target = (h && SECTIONS.some(s => s.key === h) ? h : null)
                ?? (saved && SECTIONS.some(s => s.key === saved) ? saved : null)
    if (target) setSection(target)
    const savedDiv = localStorage.getItem('cr-walmart-div')
    if (savedDiv && DIVS.some(d => d.key === savedDiv)) setDiv(savedDiv)
  }, [])

  useEffect(() => {
    const q = new URLSearchParams({ pais: 'CR' })
    if (currentCat) q.set('categoria', currentCat)

    if (section === 'resumen') {
      setL('resumen', true)
      fetch('/api/comercial/ejecucion/walmart/kpis?' + q)
        .then(r => r.json()).then(setKpis).finally(() => setL('resumen', false))

    } else if (section === 'evolucion') {
      setL('evolucion', true)
      const q2 = new URLSearchParams(q)
      if (cadenaFilter) q2.set('cadena', cadenaFilter)
      fetch('/api/comercial/ejecucion/walmart/timeseries?' + q2)
        .then(r => r.json()).then(setTs).finally(() => setL('evolucion', false))

    } else if (section === 'pareto') {
      setL('pareto', true)
      const q2 = new URLSearchParams(q)
      q2.set('top', String(topN))
      if (cadenaFilter) q2.set('cadena', cadenaFilter)
      fetch('/api/comercial/ejecucion/walmart/top-skus?' + q2)
        .then(r => r.json()).then(d => setTopSkus(d.rows ?? [])).finally(() => setL('pareto', false))
    }
  }, [section, div, cadenaFilter, topN]) // eslint-disable-line

  // ── Resumen ──────────────────────────────────────────────────────────────
  function Resumen() {
    const L = isL('resumen')
    if (L) return <Skeleton />

    const total   = kpis?.ytd_2026 ?? 0
    const prev    = kpis?.ytd_2025 ?? 0
    const units   = kpis?.uni_2026 ?? 0
    const delta   = kpis?.delta_ytd ?? null
    const lastMon = kpis?.ultimo_mes_nombre ?? '—'
    const avgMes  = kpis?.ultimo_mes > 0 ? total / kpis.ultimo_mes : 0
    const cadenas = kpis?.por_cadena   ?? []
    const cats    = kpis?.por_categoria ?? []
    const monthly = (kpis?.monthly ?? []).filter((m: any) => m.y2025 > 0 || m.y2026 !== null)

    return (
      <div className="space-y-5">

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Sell-Out YTD 2026', value: fmtFull(total),  sub: `hasta ${lastMon}`,       icon: '💰', bg: 'bg-white border-gray-100', tc: 'text-gray-800' },
            { label: 'vs YTD 2025',       value: delta !== null ? <Delta d={delta} /> : <span className="text-sm text-gray-400">Sin hist.</span>, sub: prev > 0 ? `2025: ${fmtFull(prev)}` : 'Sin dato 2025', icon: '📊', bg: 'bg-white border-gray-100', tc: 'text-gray-800' },
            { label: 'Unidades YTD',      value: units.toLocaleString('en-US'), sub: 'cajas vendidas',       icon: '📦', bg: 'bg-white border-gray-100', tc: 'text-gray-800' },
            { label: 'Promedio Mensual',  value: fmt$(avgMes),     sub: `${kpis?.ultimo_mes ?? 0} meses con datos`, icon: '📅', bg: 'bg-white border-gray-100', tc: 'text-gray-800' },
          ].map(c => (
            <div key={c.label} className={`rounded-xl border shadow-sm p-5 ${c.bg}`}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{c.label}</p>
                <span className="text-lg">{c.icon}</span>
              </div>
              <p className={`text-2xl font-bold mb-1 ${c.tc}`}>{c.value}</p>
              <p className="text-xs text-gray-400">{c.sub}</p>
            </div>
          ))}
        </div>

        {/* Dark sell-out card */}
        <div className="bg-[#1b3b5f] rounded-xl p-5 text-white">
          <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-widest mb-2">🛒 HOY · SELL-OUT REAL YTD 2026 · WALMART GROUP CR</p>
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
                const pct   = total > 0 ? (c.valor_2026 / total * 100) : 0
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
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} barGap={2}>
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

      </div>
    )
  }

  // ── Evolución ─────────────────────────────────────────────────────────────
  function Evolucion() {
    const L = isL('evolucion')
    if (L) return (
      <div className="space-y-4">
        {Array(2).fill(0).map((_,i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse">
            <div className="h-4 bg-gray-100 rounded w-1/3 mb-4" />
            <div className="h-[220px] bg-gray-50 rounded" />
          </div>
        ))}
      </div>
    )

    const series  = (ts?.series   ?? []).filter((m: any) => m.y2025 > 0 || m.y2026 !== null)
    const cadenas = ts?.cadenas   ?? []
    const byCad   = (ts?.byCadena ?? []).filter((m: any) => cadenas.some((c: string) => (m[c] ?? 0) > 0))
    const cats    = ts?.categorias ?? []
    const byCat   = (ts?.byCategorias ?? []).filter((m: any) => cats.some((c: string) => (m[c] ?? 0) > 0))

    return (
      <div className="space-y-5">

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Cadena</p>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {['', 'WALMART', 'MAS X MENOS', 'MAXI PALI'].map(c => (
                <button key={c} onClick={() => setCadenaFilter(c)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${cadenaFilter === c ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {c || 'Todas'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 2025 vs 2026 */}
        {series.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Venta Mensual — 2025 vs 2026</h3>
            <p className="text-xs text-gray-400 mb-4">Sell-out en dólares{currentCat ? ` · ${currentCat}` : ''}{cadenaFilter ? ` · ${cadenaFilter}` : ''}</p>
            <div className="h-[260px]">
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

        {/* By cadena (when not filtered) */}
        {!cadenaFilter && byCad.length > 0 && cadenas.length > 1 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">2026 por Cadena</h3>
            <p className="text-xs text-gray-400 mb-4">Walmart · Mas x Menos · Maxi Pali</p>
            <div className="h-[220px]">
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

        {/* By categoria (Total division only) */}
        {div === 'TOTAL' && cats.length > 1 && byCat.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">2026 por Categoría</h3>
            <p className="text-xs text-gray-400 mb-4">Quesos vs Leches</p>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byCat} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="mes_nombre" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={fmt$} tick={{ fontSize: 11 }} width={50} />
                  <Tooltip formatter={(v: any) => v !== null ? fmtFull(v) : '—'} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {cats.map((c: string) => (
                    <Bar key={c} dataKey={c} name={c}
                      fill={c === 'Quesos' ? '#c8873a' : '#3b82f6'}
                      stackId="a" radius={[2,2,0,0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {series.length === 0 && (
          <p className="text-center text-gray-300 py-12 text-sm">Sin datos para los filtros seleccionados</p>
        )}
      </div>
    )
  }

  // ── Pareto ────────────────────────────────────────────────────────────────
  function Pareto() {
    const L = isL('pareto')

    const grandTotal = topSkus.reduce((s, r) => s + r.valor_2026, 0)

    return (
      <div className="space-y-5">

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-4 items-end">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Cadena</p>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {['', 'WALMART', 'MAS X MENOS', 'MAXI PALI'].map(c => (
                <button key={c} onClick={() => setCadenaFilter(c)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${cadenaFilter === c ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {c || 'Todas'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Top N</p>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {[10, 15, 20].map(n => (
                <button key={n} onClick={() => setTopN(n)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${topN === n ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Pareto chart */}
        {!L && topSkus.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Pareto SKUs — YTD 2026</h3>
            <p className="text-xs text-gray-400 mb-4">Valor en dólares · curva acumulada</p>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={topSkus}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="descripcion" tick={{ fontSize: 9 }} interval={0} angle={-35} textAnchor="end" height={70} />
                  <YAxis yAxisId="left"  tickFormatter={fmt$} tick={{ fontSize: 11 }} width={50} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={v => v + '%'} tick={{ fontSize: 11 }} width={35} domain={[0,100]} />
                  <Tooltip formatter={(v: any, name: string) => name === 'Acumulado %' ? v + '%' : fmtFull(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="valor_2026" name="Valor 2026" radius={[2,2,0,0]}>
                    {topSkus.map((r, i) => (
                      <Cell key={i} fill={r.cum_share <= 80 ? '#c8873a' : r.cum_share <= 95 ? '#94a3b8' : '#e2e8f0'} />
                    ))}
                  </Bar>
                  <Line yAxisId="right" type="monotone" dataKey="cum_share" name="Acumulado %" stroke="#1d4ed8" strokeWidth={1.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-4 mt-3">
              {[['#c8873a','Clase A (≤80%)'],['#94a3b8','Clase B (80–95%)'],['#e2e8f0','Clase C (>95%)']].map(([c,l]) => (
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
              <p className="text-xs text-gray-400">YTD 2026 · sell-out Walmart Group CR</p>
            </div>
            {grandTotal > 0 && <span className="text-xs font-semibold text-gray-500">{fmtFull(grandTotal)} total</span>}
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
                    <tr key={r.sku + i} className={`hover:bg-gray-50/60 ${r.cum_share > 95 ? 'opacity-50' : r.cum_share > 80 ? 'opacity-75' : ''}`}>
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

  const renderSection = () => {
    switch (section) {
      case 'resumen':   return Resumen()
      case 'evolucion': return Evolucion()
      case 'pareto':    return Pareto()
      default:          return Resumen()
    }
  }

  return (
    <div className="flex flex-col min-h-full">

      {/* ── Header ── */}
      <div className="px-6 pt-6 pb-0 flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Ejecución Walmart</p>
          <h1 className="text-2xl font-bold text-gray-800">🇨🇷 Walmart Group</h1>
          <p className="text-sm text-gray-400 mt-0.5">Costa Rica · Sell-Out</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm">
          <RefreshCw size={13} className={Object.values(loading).some(Boolean) ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {/* ── División ── */}
      <div className="px-6 pt-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-4 flex-wrap">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">División</p>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {DIVS.map(d => (
                <button key={d.key}
                  onClick={() => { setDiv(d.key); localStorage.setItem('cr-walmart-div', d.key) }}
                  className={`px-4 py-1.5 text-sm font-medium transition-colors ${div === d.key ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 ml-auto text-xs text-gray-400 flex-wrap">
            {[['#0071CE','WALMART'],['#F4821F','MAS X MENOS'],['#E53935','MAXI PALI']].map(([c,l]) => (
              <span key={l} className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: c }} />{l}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Section nav ── */}
      <div className="px-6 pt-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex overflow-x-auto">
            {SECTIONS.map(s => (
              <button key={s.key} onClick={() => goSection(s.key)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0
                  ${section === s.key
                    ? 'border-amber-500 text-amber-600 bg-amber-50/40'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="px-6 py-6 flex-1">
        {renderSection()}
      </div>

    </div>
  )
}
