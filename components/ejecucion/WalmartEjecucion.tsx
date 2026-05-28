'use client'
import { useEffect, useRef, useState } from 'react'
import { RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell,
} from 'recharts'

// ── Config ────────────────────────────────────────────────────────────────

const DIVS = [
  { key: 'TOTAL', label: 'Total',     cat: '' },
  { key: 'QUESO', label: '🧀 Queso', cat: 'Quesos' },
  { key: 'LECHE', label: '🥛 Leche', cat: 'Leches' },
]

const SECTIONS = [
  { key: 'resumen',          label: 'Resumen'           },
  { key: 'evolucion',        label: 'Evolución Ventas'  },
  { key: 'cobertura',        label: 'Cobertura'         },
  { key: 'inventarios',      label: 'Inventarios'       },
  { key: 'pedidos',          label: 'Pedidos'           },
  { key: 'ofertas',          label: 'Ofertas'           },
  { key: 'innovaciones',     label: 'Innovaciones'      },
  { key: 'pareto',           label: 'Pareto'            },
  { key: 'perdida',          label: 'Pérdida de Venta'  },
  { key: 'precios',          label: 'Lista Precios'     },
  { key: 'recomendaciones',  label: 'Recomendaciones'   },
  { key: 'cliente',          label: 'Vista Cliente'     },
]

const CADENA_COLORS: Record<string, string> = {
  'WALMART':               '#0071CE',
  'MAS X MENOS':           '#F4821F',
  'MAXI PALI':             '#E53935',
  'PALI':                  '#f87171',
  'DESPENSA FAMILIAR':     '#16a34a',
  'LA DESPENSA DON JUAN':  '#15803d',
  'MAXI DESPENSA':         '#0891b2',
  'PAIZ':                  '#7c3aed',
  'LA UNION':              '#d97706',
  'LA TORRE':              '#059669',
  'MAXIBODEGA':            '#9333ea',
}

const CADENAS_POR_PAIS: Record<string, string[]> = {
  CR: ['WALMART', 'MAS X MENOS', 'MAXI PALI', 'PALI'],
  GT: ['WALMART', 'DESPENSA FAMILIAR', 'PAIZ'],
  HN: ['WALMART', 'DESPENSA FAMILIAR', 'MAXI DESPENSA', 'PAIZ'],
  NI: ['WALMART', 'LA UNION', 'MAXI PALI'],
  SV: ['WALMART', 'LA DESPENSA DON JUAN', 'MAXI DESPENSA'],
}

const COBERTURA_POR_PAIS: Record<string, { total: number; formatos: Record<string, number> }> = {
  CR: { total: 347, formatos: { 'Walmart Supercenter': 15, 'Mas X Menos': 39, 'Maxi Pali': 60, 'Pali': 233 } },
  GT: { total: 283, formatos: { 'Walmart Supercenter': 12, 'Despensa Familiar': 194, 'Maxi Despensa': 50, 'Paiz': 27 } },
  HN: { total: 114, formatos: { 'Walmart Supercenter': 4, 'Despensa Familiar': 74, 'Maxi Despensa': 28, 'Paiz': 8 } },
  NI: { total: 106, formatos: { 'Walmart Supercenter': 2, 'La Unión': 9, 'Maxi Pali': 22, 'Pali': 73 } },
  SV: { total: 102, formatos: { 'Walmart Supercenter': 6, 'Despensa Familiar': 63, 'La Despensa Don Juan': 17, 'Maxi Despensa': 16 } },
}

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

function DohChip({ d }: { d: number | null }) {
  if (d === null || d === undefined) return <span className="text-xs text-gray-300">—</span>
  const n = Number(d)
  const [bg, tc] =
    n < 7   ? ['bg-red-100',    'text-red-700'] :
    n < 14  ? ['bg-orange-100', 'text-orange-700'] :
    n < 60  ? ['bg-emerald-100','text-emerald-700'] :
    n < 120 ? ['bg-blue-100',   'text-blue-600'] :
              ['bg-purple-100', 'text-purple-700']
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${bg} ${tc}`}>{n.toFixed(0)}d</span>
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
    cobertura:     { icon: '📍', titulo: 'Cobertura de Distribución', desc: 'Disponible cuando se cargue el inventario de tiendas en inventario_walmart.' },
    inventarios:   { icon: '📦', titulo: 'Inventario en Tiendas', desc: 'Disponible cuando se cargue el snapshot de inventario PDV en inventario_walmart.' },
    pedidos:       { icon: '🚚', titulo: 'Pedidos y Reabasto', desc: 'Se habilitará con el historial de órdenes de compra.' },
    ofertas:       { icon: '🏷️', titulo: 'Ofertas y Excedentes', desc: 'Requiere datos de inventario para calcular SKUs con sobrestock.' },
    innovaciones:  { icon: '🆕', titulo: 'Innovaciones', desc: 'Tracking de nuevos SKUs lanzados en 2026.' },
    perdida:       { icon: '📉', titulo: 'Pérdida de Venta', desc: 'Requiere inventario para estimar ventas perdidas por quiebre de stock.' },
    precios:       { icon: '💲', titulo: 'Lista de Precios', desc: 'Se habilitará con la carga de precios por formato y cadena.' },
    recomendaciones: { icon: '🎯', titulo: 'Recomendaciones', desc: 'Generadas automáticamente al tener datos de inventario + sell-out completos.' },
    cliente:       { icon: '🤝', titulo: 'Vista Cliente', desc: 'Presentación ejecutiva lista para compartir con el comprador.' },
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

// ── Props ─────────────────────────────────────────────────────────────────

interface Props {
  pais:       string
  bandera:    string
  paisNombre: string
  clienteSellin?: string
}

// ── Component ─────────────────────────────────────────────────────────────

export default function WalmartEjecucion({ pais, bandera, paisNombre, clienteSellin = 'WALMART' }: Props) {
  const storageKey = `walmart-${pais.toLowerCase()}`

  const [section,      setSection]      = useState('resumen')
  const [div,          setDiv]          = useState('TOTAL')
  const [cadenaFilter, setCadenaFilter] = useState('')
  const [topN,         setTopN]         = useState(15)
  const [loading,      setLoading]      = useState<Record<string, boolean>>({})

  // Data
  const [sellout,  setSellout]  = useState<any>(null)
  const [sellin,   setSellin]   = useState<any>(null)
  const [ts,       setTs]       = useState<any>(null)
  const [topSkus,  setTopSkus]  = useState<any[]>([])
  const [inv,      setInv]      = useState<any>(null)

  const loadedRef = useRef<Record<string, boolean>>({})
  const setL = (k: string, v: boolean) => setLoading(p => ({ ...p, [k]: v }))
  const isL  = (k: string) => !!loading[k]

  const currentCat = DIVS.find(d => d.key === div)?.cat ?? ''

  const goSection = (key: string) => {
    setSection(key)
    window.location.hash = key
    localStorage.setItem(`${storageKey}-section`, key)
  }

  useEffect(() => {
    const saved = localStorage.getItem(`${storageKey}-section`)
    const h = window.location.hash.slice(1)
    const target = (h && SECTIONS.some(s => s.key === h) ? h : null)
                ?? (saved && SECTIONS.some(s => s.key === saved) ? saved : null)
    if (target) setSection(target)
    const savedDiv = localStorage.getItem(`${storageKey}-div`)
    if (savedDiv && DIVS.some(d => d.key === savedDiv)) setDiv(savedDiv)
  }, []) // eslint-disable-line

  useEffect(() => {
    const catQ = currentCat ? `&categoria=${encodeURIComponent(currentCat)}` : ''
    const cadQ = cadenaFilter ? `&cadena=${encodeURIComponent(cadenaFilter)}` : ''
    const baseQ = `pais=${pais}${catQ}`

    const needsInventario = ['cobertura','inventarios','perdida','recomendaciones'].includes(section)

    if (section === 'resumen') {
      setL('resumen', true)
      Promise.all([
        fetch(`/api/comercial/ejecucion/walmart/kpis?${baseQ}`).then(r => r.json()),
        fetch(`/api/comercial/sell-in/kpis?pais=${pais}&cliente=${clienteSellin}${catQ}`).then(r => r.json()),
      ]).then(([so, si]) => { setSellout(so); setSellin(si) })
        .finally(() => setL('resumen', false))

    } else if (section === 'evolucion') {
      setL('evolucion', true)
      fetch(`/api/comercial/ejecucion/walmart/timeseries?${baseQ}${cadQ}`)
        .then(r => r.json()).then(setTs).finally(() => setL('evolucion', false))

    } else if (section === 'pareto') {
      setL('pareto', true)
      fetch(`/api/comercial/ejecucion/walmart/top-skus?${baseQ}${cadQ}&top=${topN}`)
        .then(r => r.json()).then(d => setTopSkus(d.rows ?? [])).finally(() => setL('pareto', false))

    } else if (needsInventario) {
      setL(section, true)
      fetch(`/api/comercial/ejecucion/walmart/inventario?${baseQ}`)
        .then(r => r.json()).then(setInv).finally(() => setL(section, false))
    }
  }, [section, div, cadenaFilter, topN]) // eslint-disable-line

  // ── Resumen ──────────────────────────────────────────────────────────────

  function Resumen() {
    const L = isL('resumen')
    if (L) return <div className="space-y-4"><CardSkeleton cols={4} /><ChartSkeleton /></div>

    const soTotal  = sellout?.ytd_2026  ?? 0
    const soUnits  = sellout?.uni_2026  ?? 0
    const soDelta  = sellout?.delta_ytd ?? null
    const soLast   = sellout?.ultimo_mes_nombre ?? '—'
    const soAvg    = sellout?.ultimo_mes > 0 ? soTotal / sellout.ultimo_mes : 0
    const cadenas  = sellout?.por_cadena ?? []
    const cats     = sellout?.por_categoria ?? []
    const monthly  = (sellout?.monthly ?? []).filter((m: any) => m.y2025 > 0 || m.y2026 !== null)

    const siVal    = sellin?.kpis?.ingresos?.valor ?? 0
    const siDelta  = sellin?.kpis?.ingresos?.delta ?? null
    const siCajas  = sellin?.kpis?.cajas?.valor    ?? 0
    const siMargen = sellin?.kpis?.margen_pct       ?? 0

    return (
      <div className="space-y-5">

        {/* Sell-Out KPI row */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Sell-Out</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Sell-Out YTD 2026', value: fmtFull(soTotal),  sub: `hasta ${soLast}`,                 icon: '🛒', bg: 'bg-white border-gray-100', tc: 'text-gray-800' },
              { label: 'vs YTD 2025',       value: soDelta !== null ? <Delta d={soDelta} /> : <span className="text-sm text-gray-400">Sin hist.</span>, sub: sellout?.ytd_2025 > 0 ? `2025: ${fmtFull(sellout.ytd_2025)}` : 'Sin dato 2025', icon: '📊', bg: 'bg-white border-gray-100', tc: 'text-gray-800' },
              { label: 'Unidades YTD',      value: soUnits.toLocaleString('en-US'),  sub: 'cajas vendidas',    icon: '📦', bg: 'bg-white border-gray-100', tc: 'text-gray-800' },
              { label: 'Promedio Mensual',  value: fmt$(soAvg),         sub: `${sellout?.ultimo_mes ?? 0} meses`,  icon: '📅', bg: 'bg-white border-gray-100', tc: 'text-gray-800' },
            ].map(c => (
              <div key={c.label} className={`rounded-xl border shadow-sm p-5 ${c.bg}`}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest leading-tight">{c.label}</p>
                  <span className="text-lg">{c.icon}</span>
                </div>
                <p className={`text-2xl font-bold mb-1 ${c.tc}`}>{c.value}</p>
                <p className="text-xs text-gray-400">{c.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Sell-In KPI row */}
        {siVal > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Sell-In</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Sell-In YTD 2026', value: fmtFull(siVal),                        sub: `cliente: ${clienteSellin}`, icon: '🔥', bg: 'bg-white border-gray-100', tc: 'text-gray-800' },
                { label: 'vs YTD 2025',       value: siDelta !== null ? <Delta d={siDelta} /> : <span className="text-sm text-gray-400">Sin hist.</span>, sub: 'crecimiento YTD', icon: '📈', bg: 'bg-white border-gray-100', tc: 'text-gray-800' },
                { label: 'Cajas YTD',         value: Math.round(siCajas).toLocaleString('en-US'), sub: 'cajas facturadas',  icon: '🗃️', bg: 'bg-white border-gray-100', tc: 'text-gray-800' },
                { label: 'Margen Bruto',      value: `${siMargen.toFixed(1)}%`,             sub: 'margen promedio YTD',      icon: '💹', bg: siMargen > 30 ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-100', tc: siMargen > 30 ? 'text-emerald-700' : 'text-gray-800' },
              ].map(c => (
                <div key={c.label} className={`rounded-xl border shadow-sm p-5 ${c.bg}`}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest leading-tight">{c.label}</p>
                    <span className="text-lg">{c.icon}</span>
                  </div>
                  <p className={`text-2xl font-bold mb-1 ${c.tc}`}>{c.value}</p>
                  <p className="text-xs text-gray-400">{c.sub}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Dark cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Sell-Out */}
          <div className="bg-[#1b3b5f] rounded-xl p-5 text-white">
            <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-widest mb-2">🛒 SELL-OUT REAL YTD 2026 · WALMART {pais}</p>
            <p className="text-3xl font-bold mb-1">{fmtFull(soTotal)}</p>
            <p className="text-xs text-blue-300 mb-4">
              {cats.map((c: any) => c.valor_2026 > 0 ? `${c.categoria} ${fmtFull(c.valor_2026)}` : null).filter(Boolean).join(' + ') || `YTD 2026 · hasta ${soLast}`}
            </p>
            <div className="border-t border-white/10 pt-3 grid grid-cols-3 gap-3">
              {cadenas.slice(0, 3).map((c: any) => (
                <div key={c.cadena}>
                  <p className="text-[9px] uppercase tracking-widest text-blue-300 mb-0.5 truncate">{c.cadena}</p>
                  <p className="text-sm font-bold text-yellow-300">{fmtFull(c.valor_2026)}</p>
                  <p className="text-[10px] text-blue-300">{c.uni_2026.toLocaleString('en-US')} u</p>
                </div>
              ))}
            </div>
          </div>

          {/* Sell-In */}
          <div className="bg-[#1b3b5f] rounded-xl p-5 text-white">
            <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-widest mb-2">🔥 SELL-IN REAL YTD 2026 · {clienteSellin} {pais}</p>
            <p className="text-3xl font-bold mb-1">{fmtFull(siVal)}</p>
            <p className="text-xs text-blue-300 mb-4">
              {cats.map((c: any) => c.valor_2026 > 0 ? `${c.categoria} ${fmtFull(c.valor_2026)}` : null).filter(Boolean).join(' + ') || 'Facturación directa'}
            </p>
            <div className="border-t border-white/10 pt-3 grid grid-cols-2 gap-4">
              <div>
                <p className="text-[9px] uppercase tracking-widest text-blue-300 mb-1">Crecimiento YTD vs 2025</p>
                <p className="text-sm font-bold text-yellow-300">
                  {siDelta !== null ? `${siDelta > 0 ? '+' : ''}${siDelta.toFixed(1)}%` : 'Sin datos 2025'}
                </p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-widest text-blue-300 mb-1">Cajas YTD</p>
                <p className="text-sm font-bold text-yellow-300">{Math.round(siCajas).toLocaleString('en-US')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Por cadena cards */}
        {cadenas.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Por Cadena · Sell-Out YTD 2026</p>
            <div className={`grid grid-cols-1 md:grid-cols-${Math.min(cadenas.length, 3)} gap-3`}>
              {cadenas.map((c: any) => {
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

        {/* Monthly bar chart */}
        {monthly.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Sell-Out Mensual — 2025 / 2026</h3>
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

        {soTotal === 0 && siVal === 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
            <p className="text-3xl mb-2">📭</p>
            <p className="text-sm font-semibold text-gray-600">Sin datos disponibles para {paisNombre}</p>
            <p className="text-xs text-gray-400 mt-1">Aún no se han cargado datos de sell-out o sell-in para este mercado.</p>
          </div>
        )}
      </div>
    )
  }

  // ── Evolución ─────────────────────────────────────────────────────────────

  function Evolucion() {
    const L = isL('evolucion')
    if (L) return <div className="space-y-4"><ChartSkeleton /><ChartSkeleton /></div>

    const series  = (ts?.series   ?? []).filter((m: any) => m.y2025 > 0 || m.y2026 !== null)
    const cadenas = ts?.cadenas   ?? []
    const byCad   = (ts?.byCadena ?? []).filter((m: any) => cadenas.some((c: string) => (m[c] ?? 0) > 0))
    const cats    = ts?.categorias ?? []
    const byCat   = (ts?.byCategorias ?? []).filter((m: any) => cats.some((c: string) => (m[c] ?? 0) > 0))

    return (
      <div className="space-y-5">

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-4 items-end">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Cadena</p>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden flex-wrap">
              <button onClick={() => setCadenaFilter('')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${cadenaFilter === '' ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                Todas
              </button>
              {(ts?.cadenas ?? []).map((c: string) => (
                <button key={c} onClick={() => setCadenaFilter(c)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${cadenaFilter === c ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        {series.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
            <p className="text-3xl mb-2">📭</p>
            <p className="text-sm font-semibold text-gray-600">Sin datos de sell-out para {paisNombre}</p>
            <p className="text-xs text-gray-400 mt-1">Los datos de sell-out Walmart {pais} aún no han sido cargados.</p>
          </div>
        )}

        {/* 2025 vs 2026 */}
        {series.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Sell-Out Mensual — 2025 vs 2026</h3>
            <p className="text-xs text-gray-400 mb-4">{currentCat || 'Total'}{cadenaFilter ? ` · ${cadenaFilter}` : ' · Todas las cadenas'}</p>
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

        {/* By cadena */}
        {!cadenaFilter && byCad.length > 0 && cadenas.length > 1 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">2026 por Cadena</h3>
            <p className="text-xs text-gray-400 mb-4">Sell-out mensual separado por formato</p>
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

        {/* By categoria (Total only) */}
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
      </div>
    )
  }

  // ── Inventarios / Cobertura ───────────────────────────────────────────────

  function Cobertura() {
    const cob = COBERTURA_POR_PAIS[pais]
    const cadenaList = CADENAS_POR_PAIS[pais] ?? []
    return (
      <div className="space-y-5">
        {/* Static coverage reference */}
        {cob && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-700">Puntos de Venta — {paisNombre}</h3>
                <p className="text-xs text-gray-400">Cobertura total de la red Walmart Group</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-gray-800">{cob.total}</p>
                <p className="text-xs text-gray-400">tiendas totales</p>
              </div>
            </div>
            <div className={`grid grid-cols-2 md:grid-cols-${Math.min(Object.keys(cob.formatos).length, 4)} gap-3`}>
              {Object.entries(cob.formatos).map(([formato, n]) => {
                const colorKey = cadenaList.find(c => c.toLowerCase().includes(formato.split(' ')[0].toLowerCase())) ?? ''
                const color = CADENA_COLORS[colorKey] ?? '#6b7280'
                const pct = Math.round(n / cob.total * 100)
                return (
                  <div key={formato} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                      <p className="text-xs font-medium text-gray-600 truncate">{formato}</p>
                    </div>
                    <p className="text-xl font-bold text-gray-800">{n}</p>
                    <div className="mt-1.5 bg-gray-200 rounded-full h-1">
                      <div className="h-1 rounded-full" style={{ width: `${pct}%`, background: color }} />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">{pct}% de la red</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {/* Live inventory when available */}
        {inv?.disponible ? (
          <Inventarios />
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 flex items-start gap-4">
            <div className="text-3xl">📦</div>
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-1">Snapshot de Inventario por Tienda</p>
              <p className="text-sm text-gray-400">Disponible cuando se cargue el inventario PDV en <code className="bg-gray-100 px-1 rounded text-xs">inventario_walmart</code>.</p>
              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full text-xs text-amber-700 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" /> Pendiente de datos
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  function Inventarios() {
    const L = isL('inventarios') || isL('cobertura')
    if (L) return <CardSkeleton cols={4} />
    if (!inv?.disponible) return <ProximamentePlaceholder section="inventarios" />

    const k = inv.kpis
    const rows: any[] = inv.rows ?? []

    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Total Inventario', value: fmtFull(k.total_valor),                    sub: `${k.total_unidades.toLocaleString('en-US')} u`, icon: '💰', bg: 'bg-white border-gray-100', tc: 'text-gray-800' },
            { label: 'Críticos (DOH<7)', value: k.criticos,                                  sub: 'requieren reabasto urgente', icon: '🔴', bg: k.criticos > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100', tc: k.criticos > 0 ? 'text-red-700' : 'text-gray-800' },
            { label: 'En Alerta (7-14d)', value: k.alertas,                                  sub: 'monitorear esta semana', icon: '⚠️', bg: k.alertas > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100', tc: k.alertas > 0 ? 'text-amber-700' : 'text-gray-800' },
            { label: 'Excedentes (>60d)', value: k.excedentes,                               sub: 'evaluar oferta/promo', icon: '🔵', bg: k.excedentes > 0 ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100', tc: k.excedentes > 0 ? 'text-blue-700' : 'text-gray-800' },
          ].map(c => (
            <div key={c.label} className={`rounded-xl border shadow-sm p-5 ${c.bg}`}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest leading-tight">{c.label}</p>
                <span className="text-lg">{c.icon}</span>
              </div>
              <p className={`text-2xl font-bold mb-1 ${c.tc}`}>{c.value}</p>
              <p className="text-xs text-gray-400">{c.sub}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">Inventario por SKU × Tienda</h3>
            <p className="text-xs text-gray-400">Snapshot al {k.ultima_fecha ?? '—'} · ordenado por DOH ascendente</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-gray-400 uppercase tracking-widest text-[10px]">
                  <th className="text-left px-4 py-2.5">Descripción</th>
                  <th className="text-left px-3 py-2.5">Tienda</th>
                  <th className="text-left px-3 py-2.5">Cat.</th>
                  <th className="text-right px-4 py-2.5">Stock (u)</th>
                  <th className="text-right px-4 py-2.5">V/día</th>
                  <th className="text-right px-4 py-2.5">DOH</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r, i) => (
                  <tr key={i} className={r.doh !== null && r.doh < 7 ? 'bg-red-50/40' : r.doh !== null && r.doh < 14 ? 'bg-amber-50/30' : 'hover:bg-gray-50/60'}>
                    <td className="px-4 py-2.5 font-medium text-gray-700"><span className="text-gray-400 mr-1.5 font-normal">{r.sku}</span>{r.descripcion}</td>
                    <td className="px-3 py-2.5 text-gray-400 truncate max-w-[120px]">{r.punto_venta}</td>
                    <td className="px-3 py-2.5 text-gray-400">{r.categoria}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{r.inv_mano.toLocaleString('en-US')}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{r.venta_dia > 0 ? r.venta_dia.toFixed(1) : '—'}</td>
                    <td className="px-4 py-2.5 text-right"><DohChip d={r.doh} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  // ── Pareto ────────────────────────────────────────────────────────────────

  function Pareto() {
    const L = isL('pareto')
    const grandTotal = topSkus.reduce((s, r) => s + r.valor_2026, 0)

    return (
      <div className="space-y-5">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-4 items-end">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Cadena</p>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden flex-wrap">
              <button onClick={() => setCadenaFilter('')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${cadenaFilter === '' ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                Todas
              </button>
              {(CADENAS_POR_PAIS[pais] ?? []).map(c => (
                <button key={c} onClick={() => setCadenaFilter(c)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${cadenaFilter === c ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {c}
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

        {!L && topSkus.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
            <p className="text-3xl mb-2">📭</p>
            <p className="text-sm font-semibold text-gray-600">Sin datos de sell-out para {paisNombre}</p>
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
              <p className="text-xs text-gray-400">YTD 2026 · sell-out Walmart {pais}</p>
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

  // ── Render ────────────────────────────────────────────────────────────────

  const renderSection = () => {
    switch (section) {
      case 'resumen':         return Resumen()
      case 'evolucion':       return Evolucion()
      case 'cobertura':       return Cobertura()
      case 'inventarios':     return Inventarios()
      case 'pareto':          return Pareto()
      case 'pedidos':         return <ProximamentePlaceholder section="pedidos" />
      case 'ofertas':         return inv?.disponible ? Inventarios() : <ProximamentePlaceholder section="ofertas" />
      case 'innovaciones':    return <ProximamentePlaceholder section="innovaciones" />
      case 'perdida':         return inv?.disponible ? Inventarios() : <ProximamentePlaceholder section="perdida" />
      case 'precios':         return <ProximamentePlaceholder section="precios" />
      case 'recomendaciones': return <ProximamentePlaceholder section="recomendaciones" />
      case 'cliente':         return <ProximamentePlaceholder section="cliente" />
      default:                return Resumen()
    }
  }

  return (
    <div className="flex flex-col min-h-full">

      {/* ── Header ── */}
      <div className="px-6 pt-6 pb-0 flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Ejecución Walmart</p>
          <h1 className="text-2xl font-bold text-gray-800">{bandera} Walmart Group</h1>
          <p className="text-sm text-gray-400 mt-0.5">{paisNombre} · Sell-In + Sell-Out</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm">
          <RefreshCw size={13} className={Object.values(loading).some(Boolean) ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {/* ── División + leyenda cadenas ── */}
      <div className="px-6 pt-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-4 flex-wrap">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">División</p>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {DIVS.map(d => (
                <button key={d.key}
                  onClick={() => { setDiv(d.key); localStorage.setItem(`${storageKey}-div`, d.key) }}
                  className={`px-4 py-1.5 text-sm font-medium transition-colors ${div === d.key ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 ml-auto text-xs text-gray-400 flex-wrap">
            {(CADENAS_POR_PAIS[pais] ?? []).map(name => (
              <span key={name} className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: CADENA_COLORS[name] ?? '#6b7280' }} />
                {name}
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
