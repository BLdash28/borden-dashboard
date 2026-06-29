'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw, TrendingUp, TrendingDown, Minus, Download } from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell,
} from 'recharts'

// ── Config ────────────────────────────────────────────────────────────────

const DIVS = [
  { key: 'TOTAL',  label: 'Total',     cat: '' },
  { key: 'QUESO',  label: '🧀 Queso', cat: 'Quesos' },
]

const SECTIONS = [
  { key: 'resumen',          label: 'Resumen'             },
  { key: 'evolucion',        label: 'Evolución Ventas'    },
  { key: 'seguimiento',      label: 'Seguimiento Semanal' },
  { key: 'pareto',           label: 'Pareto'              },
  { key: 'cobertura',        label: 'Cobertura'           },
  { key: 'inventarios',      label: 'Inventarios'         },
  { key: 'innovaciones',     label: 'Innovaciones'        },
  { key: 'precios',          label: 'Lista Precios'       },
]

const CADENA_COLORS: Record<string, string> = {
  'EXITO':          '#fbbf24',
  'CARULLA':        '#dc2626',
  'SUPER INTER':    '#16a34a',
  'SURTIMAX':       '#3b82f6',
  'SURTIMAYORISTA': '#8b5cf6',
}

const MN12 = ['','ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

// ── Helpers ───────────────────────────────────────────────────────────────

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
  if (Math.abs(v) >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B'
  if (Math.abs(v) >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M'
  if (Math.abs(v) >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K'
  return '$' + Math.round(v).toLocaleString('en-US')
}
const fmtNum = (v: number) => Math.round(v).toLocaleString('en-US')
const fmtRR = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const MES_LBL_YR = (m: number, ano: number) => `${MN12[m]}-${String(ano).slice(-2)}`

function Delta({ d, isPp = false }: { d: number | null | undefined; isPp?: boolean }) {
  const n = d ?? 0
  const pos = n > 0.5; const neg = n < -0.5
  const cls = pos ? 'text-emerald-600 bg-emerald-50' : neg ? 'text-red-500 bg-red-50' : 'text-gray-400 bg-gray-50'
  const Icon = pos ? TrendingUp : neg ? TrendingDown : Minus
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>
      <Icon size={10} />{n > 0 ? '+' : ''}{n.toFixed(1)}{isPp ? 'pp' : '%'}
    </span>
  )
}

function CardSkeleton({ cols = 4 }: { cols?: number }) {
  return (
    <div className={`grid grid-cols-2 lg:grid-cols-${cols} gap-3`}>
      {Array(cols).fill(0).map((_,i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse">
          <div className="h-3 bg-gray-100 rounded w-2/3 mb-3" />
          <div className="h-7 bg-gray-100 rounded w-1/2 mb-2" />
          <div className="h-3 bg-gray-100 rounded w-1/3" />
        </div>
      ))}
    </div>
  )
}

function ChartSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse">
      <div className="h-4 bg-gray-100 rounded w-1/3 mb-4" />
      <div className="h-[220px] bg-gray-50 rounded" />
    </div>
  )
}

function ProximamentePlaceholder({ section }: { section: string }) {
  const msgs: Record<string, { icon: string; titulo: string; desc: string }> = {
    cobertura:    { icon: '📍', titulo: 'Cobertura de Distribución', desc: 'Disponible cuando se cargue inventario por punto de venta en inventario_exito.' },
    inventarios:  { icon: '📦', titulo: 'Inventarios',              desc: 'Alertas de excesos/agotados y matriz de calidad. Requiere carga de inventario_exito.' },
    innovaciones: { icon: '🆕', titulo: 'Score Card Innovaciones',  desc: 'Extracontenido Parmesano. Requiere sell-in CO + tracking de primera venta 2026.' },
    precios:      { icon: '💲', titulo: 'Lista de Precios',          desc: 'Se habilitará con la carga de precios por formato y cadena Éxito.' },
  }
  const m = msgs[section] ?? { icon: '🔧', titulo: 'En desarrollo', desc: 'Próximamente disponible.' }
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
      <p className="text-4xl mb-3">{m.icon}</p>
      <p className="text-base font-semibold text-gray-700 mb-1">{m.titulo}</p>
      <p className="text-sm text-gray-400 max-w-sm mx-auto">{m.desc}</p>
      <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full text-xs text-amber-700 font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" /> Pendiente de datos
      </div>
    </div>
  )
}

// ── Tipos ────────────────────────────────────────────────────────────────

type KpisData = {
  ytd_2026:    number
  uni_2026:    number
  ytd_2025:    number
  uni_2025:    number
  delta_ytd:   number | null
  ultimo_mes:  number
  ultimo_mes_nombre: string
  ultima_fecha: string | null
  por_cadena:  { cadena: string; valor_2026: number; uni_2026: number; valor_2025: number; delta: number | null }[]
  por_categoria: { categoria: string; valor_2026: number; uni_2026: number }[]
  monthly:     { mes: number; mes_nombre: string; y2025: number; y2026: number | null }[]
}

type TopSku = {
  sku: string
  descripcion: string
  categoria: string
  valor_2026: number
  uni_2026: number
  valor_2025: number
  delta: number | null
  share_pct: number
  cum_share: number
}

type SegRow = {
  key: string; label: string; plucd?: string; sku?: string; cadena?: string
  meses: Record<number, number>; mesesUnd: Record<number, number>
  ytdCop: number; ytdUnd: number
  rrUnd: number; rrCop: number
  undActual: number; copActual: number
  proyUnd: number; proyCop: number
}
type SegData = {
  ano: number
  ultimo_mes: number; ultimo_mes_label: string
  ultimo_dia: number; dias_mes: number
  ultima_fecha: string | null
  por_producto: SegRow[]
  por_cadena: SegRow[]
  por_subformato: SegRow[]
}

// ── Componente ────────────────────────────────────────────────────────────

export default function ExitoEjecucion() {
  const storageKey = 'exito-co'

  const [section,      setSection]      = useState('resumen')
  const [div,          setDiv]          = useState('TOTAL')
  const [cadenaFilter, setCadenaFilter] = useState('')
  const [topN,         setTopN]         = useState(15)
  const [loading,      setLoading]      = useState<Record<string, boolean>>({})

  // Data
  const [kpis,    setKpis]    = useState<KpisData | null>(null)
  const [topSkus, setTopSkus] = useState<TopSku[]>([])
  const [seg,     setSeg]     = useState<SegData | null>(null)
  const [segTab,  setSegTab]  = useState<'producto' | 'cadena' | 'subformato'>('producto')

  const loadedRef = useRef<Record<string, boolean>>({})
  const setL = (k: string, v: boolean) => setLoading(p => ({ ...p, [k]: v }))
  const isL  = (k: string) => !!loading[k]
  const saveFilter = (key: string, val: string) => localStorage.setItem(`${storageKey}-${key}`, val)

  const currentCat = DIVS.find(d => d.key === div)?.cat ?? ''
  const cadenas    = useMemo(() => (kpis?.por_cadena ?? []).map(c => c.cadena), [kpis])

  const goSection = (key: string) => {
    setSection(key)
    window.location.hash = key
    localStorage.setItem(`${storageKey}-section`, key)
  }

  // Restaurar filtros guardados
  useEffect(() => {
    const saved = localStorage.getItem(`${storageKey}-section`)
    const h     = typeof window !== 'undefined' ? window.location.hash.slice(1) : ''
    const target = (h && SECTIONS.some(s => s.key === h) ? h : null)
                ?? (saved && SECTIONS.some(s => s.key === saved) ? saved : null)
    if (target) setSection(target)
    const savedDiv    = localStorage.getItem(`${storageKey}-div`)
    if (savedDiv && DIVS.some(d => d.key === savedDiv)) setDiv(savedDiv)
    const savedCadena = localStorage.getItem(`${storageKey}-cadena`)
    if (savedCadena !== null) setCadenaFilter(savedCadena)
  }, []) // eslint-disable-line

  // Fetch KPIs cada vez que cambia div/cadena
  useEffect(() => {
    const p = new URLSearchParams()
    if (currentCat)    p.set('categoria', currentCat)
    if (cadenaFilter)  p.set('cadena',    cadenaFilter)

    if (section === 'resumen' || section === 'evolucion') {
      setL('kpis', true)
      fetch(`/api/comercial/ejecucion/co/exito/kpis?${p}`)
        .then(r => r.json()).then(setKpis).finally(() => setL('kpis', false))
    }

    if (section === 'pareto') {
      setL('pareto', true)
      const pp = new URLSearchParams(p); pp.set('top', String(topN))
      fetch(`/api/comercial/ejecucion/co/exito/top-skus?${pp}`)
        .then(r => r.json()).then(d => setTopSkus(d.rows ?? []))
        .finally(() => setL('pareto', false))
    }

    if (section === 'seguimiento' && !loadedRef.current.seg) {
      loadedRef.current.seg = true
      setL('seg', true)
      fetch(`/api/comercial/ejecucion/co/exito/seguimiento?ano=2026`)
        .then(r => r.json()).then(setSeg).finally(() => setL('seg', false))
    }
  }, [section, div, cadenaFilter, topN]) // eslint-disable-line

  // Cargar KPIs al primer mount
  useEffect(() => {
    if (!kpis) {
      setL('kpis', true)
      fetch(`/api/comercial/ejecucion/co/exito/kpis`)
        .then(r => r.json()).then(setKpis).finally(() => setL('kpis', false))
    }
  }, []) // eslint-disable-line

  // ── Resumen ──────────────────────────────────────────────────────────────

  function Resumen() {
    const L = isL('kpis')
    if (L || !kpis) return <div className="space-y-4"><CardSkeleton cols={4} /><ChartSkeleton /></div>

    const soTotal  = kpis.ytd_2026
    const soUnits  = kpis.uni_2026
    const soDelta  = kpis.delta_ytd
    const soLast   = kpis.ultimo_mes_nombre || '—'
    const soAvg    = kpis.ultimo_mes > 0 ? soTotal / kpis.ultimo_mes : 0
    const cadenasR = kpis.por_cadena
    const cats     = kpis.por_categoria
    const monthlyRaw = kpis.monthly
    const monthly    = monthlyRaw.map(m => ({ ...m, y2025: m.y2025 > 0 ? m.y2025 : null }))

    return (
      <div className="space-y-5">

        {/* KPIs */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Sell-Out</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Sell-Out YTD 2026', value: fmtFull(soTotal), sub: `hasta ${soLast}`, icon: '🛒' },
              { label: 'vs YTD 2025',       value: soDelta !== null ? <Delta d={soDelta} /> : <span className="text-sm text-gray-400">Sin hist.</span>, sub: kpis.ytd_2025 > 0 ? `2025: ${fmtFull(kpis.ytd_2025)}` : 'Sin dato 2025', icon: '📊' },
              { label: 'Unidades YTD',      value: soUnits.toLocaleString('en-US'), sub: 'cajas vendidas', icon: '📦' },
              { label: 'Promedio Mensual',  value: fmt$(soAvg), sub: `${kpis.ultimo_mes} meses`, icon: '📅' },
            ].map(c => (
              <div key={c.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest leading-tight">{c.label}</p>
                  <span className="text-lg">{c.icon}</span>
                </div>
                <p className="text-2xl font-bold mb-1 text-gray-800">{c.value}</p>
                <p className="text-xs text-gray-400">{c.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Dark card */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-[#1b3b5f] rounded-xl p-5 text-white">
            <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-widest mb-2">🛒 SELL-OUT REAL YTD 2026 · GRUPO ÉXITO CO</p>
            <p className="text-3xl font-bold mb-1">{fmtFull(soTotal)}</p>
            <p className="text-xs text-blue-300 mb-4">
              {cats.map(c => c.valor_2026 > 0 ? `${c.categoria} ${fmtFull(c.valor_2026)}` : null).filter(Boolean).join(' + ') || `YTD 2026 · hasta ${soLast}`}
            </p>
            <div className="border-t border-white/10 pt-3 grid grid-cols-3 gap-3">
              {cadenasR.slice(0, 3).map(c => (
                <div key={c.cadena}>
                  <p className="text-[9px] uppercase tracking-widest text-blue-300 mb-0.5 truncate">{c.cadena}</p>
                  <p className="text-sm font-bold text-yellow-300">{fmtFull(c.valor_2026)}</p>
                  <p className="text-[10px] text-blue-300">{c.uni_2026.toLocaleString('en-US')} u</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#1b3b5f] rounded-xl p-5 text-white flex flex-col justify-between">
            <div>
              <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-widest mb-2">📅 SEGUIMIENTO SEMANAL</p>
              <p className="text-sm text-blue-100 mb-3">
                Reporte semanal solicitado por Ignacio (Grupo Éxito):<br/>
                <span className="text-xs text-blue-300">Sell-Out por Producto, Cadena y Subformato con RR y proyección de cierre.</span>
              </p>
            </div>
            <button onClick={() => goSection('seguimiento')}
              className="self-start mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#1b3b5f] bg-yellow-300 hover:bg-yellow-400 px-4 py-2 rounded-lg transition-colors">
              Ver Seguimiento Semanal →
            </button>
          </div>
        </div>

        {/* Por cadena cards */}
        {cadenasR.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Por Cadena · Sell-Out YTD 2026</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {cadenasR.map(c => {
                const pct   = soTotal > 0 ? (c.valor_2026 / soTotal * 100) : 0
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

        {/* Monthly line chart */}
        {monthly.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Sell-Out Mensual — 2025 / 2026</h3>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="mes_nombre" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={fmt$} tick={{ fontSize: 11 }} width={50} />
                  <Tooltip
                    formatter={(v: any, name: string) => [fmtFull(v), name]}
                    labelFormatter={(label: string) => label}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, textAlign: 'center' }} verticalAlign="bottom" />
                  <Line dataKey="y2025" name="2025" type="monotone" stroke="#94a3b8" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                  <Line dataKey="y2026" name="2026" type="monotone" stroke="#c8873a" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {soTotal === 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
            <p className="text-3xl mb-2">📭</p>
            <p className="text-sm font-semibold text-gray-600">Sin datos disponibles</p>
            <p className="text-xs text-gray-400 mt-1">Aún no se han cargado datos de sell-out para Grupo Éxito Colombia.</p>
          </div>
        )}
      </div>
    )
  }

  // ── Evolución ──────────────────────────────────────────────────────────

  function Evolucion() {
    const L = isL('kpis')
    if (L || !kpis) return <div className="space-y-4"><ChartSkeleton /><ChartSkeleton /></div>
    const monthly = kpis.monthly.map(m => ({ ...m, y2025: m.y2025 > 0 ? m.y2025 : null }))
    const yFmt = (v: number) => v >= 1e3 ? '$' + (v / 1e3).toFixed(0) + 'K' : '$' + v
    return (
      <div className="space-y-5">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-gray-800">📈 Evolución de Ventas</h3>
            <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">SELLOUT</span>
          </div>
          <p className="text-xs text-gray-400 mb-3">{currentCat || 'Todas las categorías'} · Grupo Éxito Colombia {cadenaFilter && `· ${cadenaFilter}`}</p>

          {kpis.ytd_2026 === 0 ? (
            <div className="py-16 text-center">
              <p className="text-3xl mb-2">📭</p>
              <p className="text-sm font-semibold text-gray-600">Sin datos de sell-out</p>
            </div>
          ) : (
            <>
              <div className="flex gap-3 mb-4 flex-wrap">
                <div className={`flex-1 min-w-[180px] rounded-lg px-4 py-2.5 border ${(kpis.delta_ytd ?? 0) >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                  <p className={`text-[9px] font-bold uppercase tracking-widest mb-0.5 ${(kpis.delta_ytd ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    Crecimiento YTD Sell-Out vs 2025
                  </p>
                  <p className={`text-lg font-bold ${(kpis.delta_ytd ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {kpis.ytd_2025 === 0 ? 'Sin datos 2025' : `${(kpis.delta_ytd ?? 0) > 0 ? '+' : ''}${(kpis.delta_ytd ?? 0).toFixed(1)}%`}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {fmtFull(kpis.ytd_2026)} · 2026 YTD {kpis.ultimo_mes_nombre ? `Ene–${kpis.ultimo_mes_nombre}` : ''}
                  </p>
                </div>
                <div className="flex-1 min-w-[180px] rounded-lg px-4 py-2.5 bg-blue-50 border border-blue-100">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-blue-700 mb-0.5">📅 Última carga</p>
                  <p className="text-sm font-bold text-blue-700">{kpis.ultima_fecha ?? '—'}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Datos OneDrive (semanal)</p>
                </div>
              </div>

              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="mes_nombre" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={yFmt} tick={{ fontSize: 11 }} width={55} />
                  <Tooltip formatter={(v: any) => [fmtFull(v), '']} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line dataKey="y2025" name="2025" type="monotone" stroke="#94a3b8" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                  <Line dataKey="y2026" name="2026" type="monotone" stroke="#c8873a" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Pareto ──────────────────────────────────────────────────────────────

  function Pareto() {
    const L = isL('pareto')
    const grandTotal = topSkus.reduce((s, r) => s + r.valor_2026, 0)
    return (
      <div className="space-y-5">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-4 items-end">
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

        {!L && topSkus.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
            <p className="text-3xl mb-2">📭</p>
            <p className="text-sm font-semibold text-gray-600">Sin datos de sell-out</p>
          </div>
        )}

        {!L && topSkus.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Pareto SKUs — Sell-Out YTD 2026</h3>
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

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Detalle por SKU</h3>
              <p className="text-xs text-gray-400">YTD 2026 · sell-out Grupo Éxito CO</p>
            </div>
            {grandTotal > 0 && <span className="text-xs font-semibold text-gray-500">{fmtFull(grandTotal)} total</span>}
          </div>
          {L ? (
            <div className="divide-y divide-gray-50">{Array(8).fill(0).map((_,i) => (
              <div key={i} className="px-4 py-3 flex gap-4 animate-pulse">
                <div className="h-3 bg-gray-100 rounded flex-1" />
                <div className="h-3 bg-gray-100 rounded w-16" />
                <div className="h-3 bg-gray-100 rounded w-12" />
              </div>
            ))}</div>
          ) : topSkus.length === 0 ? (
            <p className="text-center text-gray-300 py-8 text-sm">Sin datos</p>
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
                    <tr key={i} className={`hover:bg-gray-50/60 ${r.cum_share > 95 ? 'opacity-50' : r.cum_share > 80 ? 'opacity-75' : ''}`}>
                      <td className="px-3 py-2.5 text-center text-gray-400 font-mono">{i + 1}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-700"><span className="text-gray-400 mr-1.5 font-normal">{r.sku}</span>{r.descripcion}</td>
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
                      <td className="px-4 py-2.5 text-right">{r.delta !== null ? <Delta d={r.delta} /> : <span className="text-gray-300">—</span>}</td>
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

  // ── Seguimiento Semanal ─────────────────────────────────────────────────

  function Seguimiento() {
    const L = isL('seg')
    if (L || !seg) return <div className="space-y-4"><CardSkeleton cols={4} /><ChartSkeleton /></div>

    const dataRows: SegRow[] =
      segTab === 'producto' ? seg.por_producto :
      segTab === 'cadena'   ? seg.por_cadena   :
                              seg.por_subformato

    // totales
    const total: SegRow = {
      key: '__total', label: 'TOTAL GENERAL',
      meses: {}, mesesUnd: {},
      ytdCop: 0, ytdUnd: 0,
      rrUnd: 0, rrCop: 0,
      undActual: 0, copActual: 0,
      proyUnd: 0, proyCop: 0,
    }
    for (const r of dataRows) {
      for (let m = 1; m <= seg.ultimo_mes; m++) {
        total.meses[m]    = (total.meses[m] ?? 0) + (r.meses[m] ?? 0)
        total.mesesUnd[m] = (total.mesesUnd[m] ?? 0) + (r.mesesUnd[m] ?? 0)
      }
      total.ytdCop    += r.ytdCop
      total.ytdUnd    += r.ytdUnd
      total.rrUnd     += r.rrUnd
      total.rrCop     += r.rrCop
      total.undActual += r.undActual
      total.copActual += r.copActual
      total.proyUnd   += r.proyUnd
      total.proyCop   += r.proyCop
    }
    total.rrUnd = Math.round(total.rrUnd * 10) / 10
    total.rrCop = Math.round(total.rrCop)

    const ultimoMes    = seg.ultimo_mes
    const mesActualLbl = MES_LBL_YR(ultimoMes, seg.ano)
    const cobertura    = seg.ultimo_dia && seg.dias_mes ? `${seg.ultimo_dia}/${seg.dias_mes} días` : '—'

    const exportCsv = () => {
      const firstColLabel = segTab === 'producto' ? 'Producto' : segTab === 'cadena' ? 'Cadena' : 'Subformato'
      const headers: string[] = []
      if (segTab === 'producto') headers.push('PluCD', 'SKU', 'Producto')
      else headers.push(firstColLabel)
      for (let m = 1; m <= ultimoMes; m++) headers.push(`${MES_LBL_YR(m, seg.ano)} (COP)`)
      headers.push('Total YTD (COP)', 'Total YTD (und)',
                   `RR und/día (${mesActualLbl})`, `RR COP/día`,
                   `Und ${mesActualLbl}`, `COP ${mesActualLbl}`,
                   `Proy. ${mesActualLbl} und`, `Proy. ${mesActualLbl} COP`)

      const lines: string[] = [headers.join(',')]
      const allRows = [...dataRows, total]
      for (const r of allRows) {
        const cells: (string | number)[] = []
        if (segTab === 'producto') cells.push(r.plucd ?? '', r.sku ?? '', `"${r.label}"`)
        else cells.push(`"${r.label}"`)
        for (let m = 1; m <= ultimoMes; m++) cells.push(Math.round(r.meses[m] ?? 0))
        cells.push(Math.round(r.ytdCop), Math.round(r.ytdUnd),
                   r.rrUnd, Math.round(r.rrCop),
                   Math.round(r.undActual), Math.round(r.copActual),
                   Math.round(r.proyUnd), Math.round(r.proyCop))
        lines.push(cells.join(','))
      }
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `Exito_${segTab}_${seg.ultima_fecha ?? ''}.csv`
      a.click()
      URL.revokeObjectURL(url)
    }

    return (
      <div className="space-y-5">
        {/* Header card */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                Informe Seguimiento Semanal · Sell-Out · COP
              </p>
              <h2 className="text-base font-bold text-gray-800 mt-0.5">
                Grupo Éxito · Colombia
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Última carga: <strong>{seg.ultima_fecha ?? '—'}</strong> ·
                Mes en curso: <strong>{mesActualLbl}</strong> · {cobertura}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={exportCsv}
                className="flex items-center gap-1.5 text-xs text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-lg">
                <Download size={12}/> Exportar CSV
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <KpiCard label="Total YTD (COP)" value={fmtCOP(total.ytdCop)} sub={`${ultimoMes} meses`} />
            <KpiCard label="Total YTD (und)" value={fmtNum(total.ytdUnd)} sub="cajas vendidas" />
            <KpiCard label={`RR und/día (${mesActualLbl})`} value={fmtRR(total.rrUnd)} sub={`base ${cobertura}`} />
            <KpiCard label={`Proy. cierre ${mesActualLbl}`} value={fmtCOP(total.proyCop)} sub={`${fmtNum(total.proyUnd)} und`} highlight />
          </div>
        </div>

        {/* Tabs internos */}
        <div className="flex items-center gap-1 border-b border-gray-200">
          {(['producto', 'cadena', 'subformato'] as const).map(t => (
            <button key={t}
              onClick={() => setSegTab(t)}
              className={`px-4 py-2 text-xs font-semibold transition-colors border-b-2 -mb-px capitalize
                ${segTab === t
                  ? 'text-amber-700 border-amber-500'
                  : 'text-gray-500 border-transparent hover:text-gray-800'}`}>
              Por {t}
            </button>
          ))}
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider">
                <tr>
                  {segTab === 'producto' && (
                    <>
                      <th className="px-3 py-2 text-left font-semibold sticky left-0 bg-gray-50 z-10">PluCD</th>
                      <th className="px-3 py-2 text-left font-semibold">SKU</th>
                      <th className="px-3 py-2 text-left font-semibold">Producto</th>
                    </>
                  )}
                  {segTab !== 'producto' && (
                    <th className="px-3 py-2 text-left font-semibold sticky left-0 bg-gray-50 z-10 capitalize">{segTab}</th>
                  )}
                  {segTab === 'subformato' && <th className="px-3 py-2 text-left font-semibold">Cadena</th>}
                  {Array.from({ length: ultimoMes }, (_, i) => i + 1).map(m => (
                    <th key={m} className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                      {MES_LBL_YR(m, seg.ano)}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-semibold bg-gray-100 whitespace-nowrap">YTD</th>
                  <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">RR und/día</th>
                  <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">RR COP/día</th>
                  <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">{mesActualLbl} und</th>
                  <th className="px-3 py-2 text-right font-semibold bg-amber-50 text-amber-700 whitespace-nowrap">Proy. und</th>
                  <th className="px-3 py-2 text-right font-semibold bg-amber-50 text-amber-700 whitespace-nowrap">Proy. COP</th>
                </tr>
              </thead>
              <tbody>
                {dataRows.length === 0 && (
                  <tr><td colSpan={20} className="px-6 py-10 text-center text-gray-400">Sin datos para {seg.ano}.</td></tr>
                )}
                {dataRows.map((r, i) => (
                  <tr key={r.key} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    {segTab === 'producto' && (
                      <>
                        <td className="px-3 py-2 font-mono text-[11px] text-gray-700 sticky left-0 bg-inherit">{r.plucd}</td>
                        <td className="px-3 py-2 font-mono text-[11px] text-gray-500">{r.sku}</td>
                        <td className="px-3 py-2 text-gray-800">{r.label}</td>
                      </>
                    )}
                    {segTab !== 'producto' && (
                      <td className="px-3 py-2 font-semibold text-gray-800 sticky left-0 bg-inherit">{r.label}</td>
                    )}
                    {segTab === 'subformato' && (
                      <td className="px-3 py-2">
                        {r.cadena && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                                style={{ background: CADENA_COLORS[r.cadena] ?? '#6b7280' }}>
                            {r.cadena}
                          </span>
                        )}
                      </td>
                    )}
                    {Array.from({ length: ultimoMes }, (_, i) => i + 1).map(m => (
                      <td key={m} className="px-3 py-2 text-right tabular-nums text-gray-700">
                        {r.meses[m] ? fmtCOP(r.meses[m]) : <span className="text-gray-300">—</span>}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-800 bg-gray-50">{fmtCOP(r.ytdCop)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmtRR(r.rrUnd)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmtCOP(r.rrCop)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmtNum(r.undActual)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-amber-700 bg-amber-50/50">{fmtNum(r.proyUnd)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-amber-700 bg-amber-50/50">{fmtCOP(r.proyCop)}</td>
                  </tr>
                ))}
                {dataRows.length > 0 && (
                  <tr className="bg-gray-900 text-white font-semibold">
                    {segTab === 'producto' && <td className="px-3 py-2 sticky left-0 bg-gray-900" colSpan={3}>TOTAL GENERAL</td>}
                    {segTab === 'cadena'   && <td className="px-3 py-2 sticky left-0 bg-gray-900">TOTAL GENERAL</td>}
                    {segTab === 'subformato' && (
                      <>
                        <td className="px-3 py-2 sticky left-0 bg-gray-900">TOTAL GENERAL</td>
                        <td className="px-3 py-2"></td>
                      </>
                    )}
                    {Array.from({ length: ultimoMes }, (_, i) => i + 1).map(m => (
                      <td key={m} className="px-3 py-2 text-right tabular-nums">
                        {total.meses[m] ? fmtCOP(total.meses[m]) : '—'}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums">{fmtCOP(total.ytdCop)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtRR(total.rrUnd)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtCOP(total.rrCop)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(total.undActual)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-300">{fmtNum(total.proyUnd)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-300">{fmtCOP(total.proyCop)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-gray-400 px-4 py-2 border-t border-gray-100 bg-gray-50">
            Valores en COP. <strong>RR</strong> = Run Rate (ventas del mes ÷ días transcurridos, {cobertura}).
            <strong> Proyección</strong> = RR × días totales del mes ({seg.dias_mes}d).
            {segTab === 'producto' && ' Solo SKUs con PluCD del listado de Ignacio.'}
          </p>
        </div>
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const renderSection = () => {
    switch (section) {
      case 'resumen':       return Resumen()
      case 'evolucion':     return Evolucion()
      case 'pareto':        return Pareto()
      case 'seguimiento':   return Seguimiento()
      case 'cobertura':     return <ProximamentePlaceholder section="cobertura" />
      case 'inventarios':   return <ProximamentePlaceholder section="inventarios" />
      case 'innovaciones':  return <ProximamentePlaceholder section="innovaciones" />
      case 'precios':       return <ProximamentePlaceholder section="precios" />
      default:              return Resumen()
    }
  }

  return (
    <div className="flex flex-col min-h-full">

      {/* Header */}
      <div className="px-6 pt-6 pb-0 flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Ejecución Grupo Éxito</p>
          <h1 className="text-2xl font-bold text-gray-800">🇨🇴 Grupo Éxito · Borden</h1>
          <p className="text-sm text-gray-400 mt-0.5">Colombia · Sell-Out semanal</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm">
          <RefreshCw size={13} className={Object.values(loading).some(Boolean) ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {/* Filtros globales */}
      <div className="px-6 pt-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-start gap-x-4 gap-y-3 flex-wrap text-xs">

            {/* División */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-gray-400">División</span>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                {DIVS.map(d => (
                  <button key={d.key}
                    onClick={() => { setDiv(d.key); saveFilter('div', d.key) }}
                    className={`px-4 py-1.5 font-medium transition-colors ${div === d.key ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Cadena */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-gray-400">Cadena</span>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden flex-wrap">
                <button onClick={() => { setCadenaFilter(''); saveFilter('cadena', '') }}
                  className={`px-3 py-1.5 font-medium transition-colors ${cadenaFilter === '' ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  Todas
                </button>
                {cadenas.map(name => (
                  <button key={name} onClick={() => { setCadenaFilter(name); saveFilter('cadena', name) }}
                    className={`px-3 py-1.5 font-medium transition-colors ${cadenaFilter === name ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {/* Reset */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-gray-400 invisible">x</span>
              <button
                onClick={() => {
                  setDiv('TOTAL'); setCadenaFilter('')
                  ;['div','cadena'].forEach(k => localStorage.removeItem(`${storageKey}-${k}`))
                }}
                className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 font-medium transition-colors">
                ↺ Reset
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* Section nav */}
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

      {/* Contenido */}
      <div className="px-6 py-6 flex-1">
        {renderSection()}
      </div>

    </div>
  )
}

function KpiCard({
  label, value, sub, highlight,
}: { label: string; value: React.ReactNode; sub: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border shadow-sm p-4 ${highlight ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100'}`}>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest leading-tight mb-1">
        {label}
      </p>
      <p className={`text-xl font-bold ${highlight ? 'text-amber-700' : 'text-gray-800'}`}>{value}</p>
      <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>
    </div>
  )
}
