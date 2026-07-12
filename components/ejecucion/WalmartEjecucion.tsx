'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw, TrendingUp, TrendingDown, Minus, SlidersHorizontal, X } from 'lucide-react'
import MultiSelect from '@/components/dashboard/MultiSelect'
import {
  BarChart, Bar, LineChart, Line, ComposedChart, AreaChart, Area,
  PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell, ReferenceLine,
} from 'recharts'
import InnovacionesSection from './InnovacionesSection'

// ── Config ────────────────────────────────────────────────────────────────

const DIVS = [
  { key: 'TOTAL',   label: 'Total',        cat: '' },
  { key: 'QUESO',   label: '🧀 Queso',    cat: 'Quesos' },
  { key: 'LECHE',   label: '🥛 Leche',    cat: 'Leches' },
  { key: 'HELADOS', label: '🍦 Helados',  cat: 'Helados' },
]

const SECTIONS = [
  { key: 'resumen',          label: 'Resumen'           },
  { key: 'evolucion',        label: 'Evolución Ventas'  },
  { key: 'cobertura',        label: 'Cobertura'         },
  { key: 'inventarios',      label: 'Inventarios'       },
  { key: 'innovaciones',     label: 'Innovaciones'      },
  { key: 'pareto',           label: 'Pareto'            },
  { key: 'precios',          label: 'Lista Precios'     },
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

export const WALMART_RPTCODES: Record<string, { cadena: string; formato: string }[]> = {
  HM: [{ cadena: 'WALMART',             formato: 'HIPERMERCADO' }],
  PI: [{ cadena: 'PALI',                formato: 'DESCUENTOS'   }],
  ME: [{ cadena: 'MAS X MENOS',         formato: 'SUPERMERCADO' }],
  MI: [{ cadena: 'MAXI PALI',           formato: 'BODEGAS'      },
       { cadena: 'MAXI DESPENSA',        formato: 'BODEGAS'      }],
  DF: [{ cadena: 'DESPENSA FAMILIAR',   formato: 'DESCUENTOS'   }],
  LJ: [{ cadena: 'LA DESPENSA DON JUAN',formato: 'SUPERMERCADO' }],
  PZ: [{ cadena: 'PAIZ',                formato: 'SUPERMERCADO' }],
  LN: [{ cadena: 'LA UNION',            formato: 'SUPERMERCADO' }],
}

const CADENAS_POR_PAIS: Record<string, string[]> = {
  CR: ['WALMART', 'MAS X MENOS', 'MAXI PALI', 'PALI'],
  GT: ['WALMART', 'DESPENSA FAMILIAR', 'PAIZ'],
  HN: ['WALMART', 'DESPENSA FAMILIAR', 'MAXI DESPENSA', 'PAIZ'],
  NI: ['WALMART', 'LA UNION', 'MAXI PALI'],
  SV: ['WALMART', 'LA DESPENSA DON JUAN', 'MAXI DESPENSA'],
}

const COBERTURA_POR_PAIS: Record<string, { total: number; formatos: Record<string, number> }> = {
  CR: { total: 347, formatos: { 'WALMART': 15, 'MAS X MENOS': 39, 'MAXI PALI': 60, 'PALI': 233 } },
  GT: { total: 283, formatos: { 'WALMART': 12, 'DESPENSA FAMILIAR': 194, 'MAXI DESPENSA': 50, 'PAIZ': 27 } },
  HN: { total: 114, formatos: { 'WALMART': 4, 'DESPENSA FAMILIAR': 74, 'MAXI DESPENSA': 28, 'PAIZ': 8 } },
  NI: { total: 106, formatos: { 'WALMART': 2, 'LA UNION': 9, 'MAXI PALI': 22, 'PALI': 73 } },
  SV: { total: 102, formatos: { 'WALMART': 6, 'DESPENSA FAMILIAR': 63, 'LA DESPENSA DON JUAN': 17, 'MAXI DESPENSA': 16 } },
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
    inventarios:   { icon: '📦', titulo: 'Inventarios', desc: 'Cargando inventario de tiendas (inventario_tiendas) y CEDI (inventario_cedi)...' },
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

// ── Hallazgos ─────────────────────────────────────────────────────────────

type HallazgoTipo = 'critico' | 'alerta' | 'positivo' | 'informativo' | 'estrategico'

interface Hallazgo {
  tipo:     HallazgoTipo
  titulo:   string
  detalle:  string
  prioridad: number
}

const HALLAZGO_STYLE: Record<HallazgoTipo, { leftColor: string; badge: string; badgeCls: string }> = {
  critico:     { leftColor: '#ef4444', badge: 'CRÍTICO',     badgeCls: 'bg-red-100 text-red-700' },
  alerta:      { leftColor: '#f97316', badge: 'ALERTA',      badgeCls: 'bg-orange-100 text-orange-700' },
  positivo:    { leftColor: '#22c55e', badge: 'POSITIVO',    badgeCls: 'bg-emerald-100 text-emerald-700' },
  informativo: { leftColor: '#3b82f6', badge: 'INFO',        badgeCls: 'bg-blue-100 text-blue-700' },
  estrategico: { leftColor: '#8b5cf6', badge: 'ESTRATÉGICO', badgeCls: 'bg-purple-100 text-purple-700' },
}

const PRIORIDAD: Record<HallazgoTipo, number> = {
  critico: 1, alerta: 2, positivo: 3, informativo: 4, estrategico: 5,
}

function generarHallazgos(sellout: any, inv: any, topSkus: any[]): Hallazgo[] {
  const hallazgos: Hallazgo[] = []
  const monthly: any[] = sellout?.monthly ?? []
  const kpis = inv?.kpis ?? null

  // Baseline provisional: avg of 2025 months with data
  const meses2025 = monthly.filter((m: any) => (m.y2025 ?? 0) > 0)
  const baseline2025 = meses2025.length > 0
    ? meses2025.reduce((s: number, m: any) => s + m.y2025, 0) / meses2025.length
    : 0

  // Baseline 2026: avg excluding OOS (< 30% of 2025 baseline)
  const meses2026 = monthly.filter((m: any) => m.y2026 !== null && m.y2026 > 0)
  const oosThreshold = baseline2025 * 0.3
  const meses2026Clean = meses2026.filter((m: any) => !baseline2025 || m.y2026 >= oosThreshold)
  const baseline2026 = meses2026Clean.length > 0
    ? meses2026Clean.reduce((s: number, m: any) => s + m.y2026, 0) / meses2026Clean.length
    : 0

  // Rule 1 — OOS months (< 85% of baseline and next month recovered)
  for (let i = 0; i < monthly.length - 1; i++) {
    const m = monthly[i]
    const next = monthly[i + 1]
    if (m.y2026 !== null && baseline2025 > 0 && m.y2026 < baseline2025 * 0.85) {
      const recovered = next.y2026 !== null && next.y2026 >= baseline2025 * 0.85
      if (recovered) {
        hallazgos.push({
          tipo: 'alerta', prioridad: PRIORIDAD.alerta,
          titulo: `Quiebre de stock detectado — ${m.mes_nombre}`,
          detalle: `Venta ${fmtFull(m.y2026)} vs baseline ${fmtFull(baseline2025)} (${((m.y2026 / baseline2025 - 1) * 100).toFixed(0)}%). Recuperó en ${next.mes_nombre}.`,
        })
      }
    }
  }

  // Rule 2 — inventory snapshot (PDV + CEDI)
  if (kpis && (kpis.pdv_skus > 0 || kpis.cedi_skus > 0)) {
    const parts: string[] = []
    if (kpis.pdv_skus > 0) parts.push(`PDV: ${kpis.pdv_skus} SKUs · ${Math.round(kpis.pdv_inv ?? 0).toLocaleString('en-US')} un`)
    if (kpis.cedi_skus > 0) parts.push(`CEDI: ${kpis.cedi_cajas?.toLocaleString('en-US')} cj · ${kpis.cedi_skus} SKUs`)
    const warn = (kpis.pdv_criticos ?? 0) > 0 || (kpis.cedi_sin_stock ?? 0) > 0
    const warnText = [
      kpis.pdv_criticos > 0 ? `⚠️ ${kpis.pdv_criticos} SKUs PDV críticos (DOH ≤ 7d)` : '',
      kpis.cedi_sin_stock > 0 ? `⚠️ ${kpis.cedi_sin_stock} SKUs CEDI sin stock` : '',
    ].filter(Boolean).join('. ')
    hallazgos.push({
      tipo: warn ? 'alerta' : 'informativo', prioridad: warn ? PRIORIDAD.alerta : PRIORIDAD.informativo,
      titulo: `Inventario: ${parts.join(' · ')}`,
      detalle: `Snapshot tiendas ${kpis.fecha_tiendas ?? '—'} / CEDI ${kpis.fecha_cedi ?? '—'}.${warnText ? ' ' + warnText : ''}`,
    })
  }

  // Rule 3 — Healthy demand trend
  if (meses2026.length >= 2 && baseline2026 > 0) {
    const lastTwo = meses2026.slice(-2)
    if (lastTwo.every((m: any) => m.y2026 >= baseline2026 * 0.95)) {
      hallazgos.push({
        tipo: 'positivo', prioridad: PRIORIDAD.positivo,
        titulo: 'Demanda estable o en crecimiento',
        detalle: `Promedio mensual 2026: ${fmtFull(baseline2026)}. Los últimos 2 meses sostienen el ritmo.`,
      })
    }
  }

  // Rule 4 — New SKUs (topSkus with data only in 2026)
  if (topSkus.length > 0) {
    const newSkus = topSkus.filter((s: any) => (s.uni_2025 ?? 0) === 0 && (s.uni_2026 ?? 0) > 0)
    if (newSkus.length > 0) {
      hallazgos.push({
        tipo: 'informativo', prioridad: PRIORIDAD.informativo,
        titulo: `${newSkus.length} SKU nuevo${newSkus.length > 1 ? 's' : ''} con venta en 2026`,
        detalle: newSkus.slice(0, 3).map((s: any) => s.descripcion ?? s.sku).join(', ') + (newSkus.length > 3 ? ` +${newSkus.length - 3} más` : ''),
      })
    }
  }

  // Rule 5 — Pareto concentration
  if (topSkus.length >= 5) {
    const total2026 = topSkus.reduce((s: number, sk: any) => s + (sk.valor_2026 ?? 0), 0)
    let acum = 0; let pareto80 = 0
    const sorted = [...topSkus].sort((a, b) => (b.valor_2026 ?? 0) - (a.valor_2026 ?? 0))
    for (const sk of sorted) {
      acum += (sk.valor_2026 ?? 0)
      pareto80++
      if (total2026 > 0 && acum / total2026 >= 0.8) break
    }
    const pct = Math.round(pareto80 / topSkus.length * 100)
    hallazgos.push({
      tipo: 'estrategico', prioridad: PRIORIDAD.estrategico,
      titulo: `${pareto80} SKU${pareto80 > 1 ? 's' : ''} representan el 80% de las ventas (${pct}% del portafolio)`,
      detalle: `Top: ${sorted.slice(0, 2).map((s: any) => s.descripcion ?? s.sku).join(', ')}. Concentración de riesgo a monitorear.`,
    })
  }

  // Rule 6 — YTD summary (always fires when sellout data exists)
  const ytd2026 = sellout?.ytd_2026 ?? 0
  const delta   = sellout?.delta_ytd ?? null
  if (ytd2026 > 0) {
    const tipo: HallazgoTipo = delta !== null && delta > 10 ? 'positivo'
      : delta !== null && delta < -10 ? 'alerta'
      : 'informativo'
    const meses = sellout?.ultimo_mes ?? meses2026.length
    const baselineStr = baseline2026 > 0 ? ` · Promedio mensual: ${fmtFull(baseline2026)}` : ''
    hallazgos.push({
      tipo, prioridad: PRIORIDAD[tipo],
      titulo: `Sell-Out YTD 2026: ${fmtFull(ytd2026)} (${meses} meses)`,
      detalle: delta !== null
        ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}% vs mismo período 2025.${baselineStr}`
        : `Sin comparativo 2025 disponible.${baselineStr}`,
    })
  }

  return hallazgos.sort((a, b) => a.prioridad - b.prioridad)
}

// ── Indicadores de Inventario ─────────────────────────────────────────────

function computeInventarioKPIs(sellout: any, inv: any) {
  const monthly: any[] = sellout?.monthly ?? []
  const kpis = inv?.kpis ?? null

  const meses2026 = monthly.filter((m: any) => m.y2026 !== null && m.y2026 > 0)
  const meses2025 = monthly.filter((m: any) => (m.y2025 ?? 0) > 0)
  const baseline2025 = meses2025.length > 0
    ? meses2025.reduce((s: number, m: any) => s + m.y2025, 0) / meses2025.length : 0
  const oosThreshold = baseline2025 * 0.3
  const meses2026Clean = meses2026.filter((m: any) => !baseline2025 || m.y2026 >= oosThreshold)
  const baseline2026 = meses2026Clean.length > 0
    ? meses2026Clean.reduce((s: number, m: any) => s + m.y2026, 0) / meses2026Clean.length : 0

  return {
    // PDV — SKU level
    pdv_skus:              kpis?.pdv_skus              ?? null,
    pdv_tiendas:           kpis?.pdv_tiendas           ?? null,
    pdv_tiendas_dist:      kpis?.pdv_tiendas_dist      ?? null,
    pdv_inv:               kpis?.pdv_inv               ?? null,
    pdv_valor:             kpis?.pdv_valor             ?? null,
    pdv_criticos:          kpis?.pdv_criticos          ?? null,
    pdv_alertas:           kpis?.pdv_alertas           ?? null,
    pdv_excedentes:        kpis?.pdv_excedentes        ?? null,
    pdv_sin_datos:         kpis?.pdv_sin_datos         ?? null,
    // PDV — store × SKU level
    pdv_criticos_stores:   kpis?.pdv_criticos_stores   ?? null,
    pdv_alertas_stores:    kpis?.pdv_alertas_stores    ?? null,
    pdv_sobrestock_stores: kpis?.pdv_sobrestock_stores ?? null,
    fecha_tiendas:         kpis?.fecha_tiendas         ?? null,
    // CEDI
    cedi_skus:       kpis?.cedi_skus       ?? null,
    cedi_cajas:      kpis?.cedi_cajas      ?? null,
    cedi_unidades:   kpis?.cedi_unidades   ?? null,
    cedi_ordenes:    kpis?.cedi_ordenes    ?? null,
    cedi_sin_stock:  kpis?.cedi_sin_stock  ?? null,
    cedi_criticos:   kpis?.cedi_criticos   ?? null,
    cedi_valor:      kpis?.cedi_valor      ?? null,
    fecha_cedi:      kpis?.fecha_cedi      ?? null,
    // sell-out baseline
    baseline_mensual: baseline2026 > 0 ? baseline2026 : null,
  }
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
  // Filtros globales (multi-select)
  const [cadenasSel,    setCadenasSel]    = useState<string[]>([])
  const [categoriaSel,  setCategoriaSel]  = useState<string[]>([])
  const [subcatSel,     setSubcatSel]     = useState<string[]>([])
  const [formatoSel,    setFormatoSel]    = useState<string[]>([])
  const [puntoSel,      setPuntoSel]      = useState<string[]>([])
  const [skuSel,        setSkuSel]        = useState<string[]>([])
  const [filtrosOpts,   setFiltrosOpts]   = useState<{
    cadenas:       { value: string; venta: number }[]
    categorias:    { value: string; venta: number }[]
    subcategorias: { value: string; venta: number }[]
    formatos:      { value: string; venta: number }[]
    puntos:        { value: string; cadena: string | null; venta: number }[]
    skus:          { value: string; descripcion: string | null; subcategoria: string | null; venta: number }[]
  } | null>(null)
  const [showFiltros,   setShowFiltros]   = useState(false)
  // Compat: cadenaFilter legacy = primer item si hay UNA sola cadena seleccionada
  const cadenaFilter = cadenasSel.length === 1 ? cadenasSel[0] : ''

  const [topN,         setTopN]         = useState(15)
  const [loading,      setLoading]      = useState<Record<string, boolean>>({})

  // Data
  const [sellout,     setSellout]     = useState<any>(null)
  const [sellin,      setSellin]      = useState<any>(null)
  const [sellinPorCat, setSellinPorCat] = useState<Record<string, number>>({})
  const [ts,          setTs]          = useState<any>(null)
  const [evoTop5,     setEvoTop5]     = useState<any>(null)
  const [comparativo, setComparativo] = useState<any>(null)
  const [topSkus,     setTopSkus]     = useState<any[]>([])
  const [inv,         setInv]         = useState<any>(null)
  const [innov,       setInnov]       = useState<any>(null)
  const [cob,         setCob]         = useState<any>(null)
  const [cobSort,     setCobSort]     = useState<'gap' | 'actual' | 'maxima'>('gap')
  const [cobVista,    setCobVista]    = useState<'numerica' | 'ponderada'>('numerica')
  const [cobCatF,     setCobCatF]     = useState('')
  const [evolMedida,       setEvolMedida]       = useState<'valor' | 'unidades'>('valor')
  const [evolVista,        setEvolVista]        = useState<'mensual' | 'diaria'>('mensual')
  const [evolSubcat,       setEvolSubcat]       = useState('')
  const [evolSubcatOpts,   setEvolSubcatOpts]   = useState<string[]>([])
  const [evolDesde,        setEvolDesde]        = useState('')
  const [evolHasta,        setEvolHasta]        = useState('')
  const [evolTopN,         setEvolTopN]         = useState(5)
  const [evolSkuFilter,    setEvolSkuFilter]    = useState('')
  const [evolSkuHover,     setEvolSkuHover]     = useState('')
  const [evolYearFilter,   setEvolYearFilter]   = useState('')
  const [evolCadenaLine,   setEvolCadenaLine]   = useState('')
  const [evolCpFilter,     setEvolCpFilter]     = useState('')
  const [evolDiario,       setEvolDiario]       = useState<any>(null)
  const [invSkuTienda,        setInvSkuTienda]        = useState<any[] | null>(null)
  const [invSkuTiendaLoading, setInvSkuTiendaLoading] = useState(false)
  const [invSkuTiendaFilters, setInvSkuTiendaFilters] = useState({ cadena: '', salud: '', prod: '' })

  const loadedRef = useRef<Record<string, boolean>>({})
  const setL = (k: string, v: boolean) => setLoading(p => ({ ...p, [k]: v }))
  const isL  = (k: string) => !!loading[k]
  const saveFilter = (key: string, val: string) => localStorage.setItem(`${storageKey}-${key}`, val)

  // Helper: querystring reusable con los filtros globales activos + país
  const buildFilterQS = (extra?: Record<string, string>) => {
    const q = new URLSearchParams({ pais })
    if (cadenasSel.length)   q.set('cadenas',       cadenasSel.join(','))
    if (categoriaSel.length) q.set('categorias',    categoriaSel.join(','))
    if (subcatSel.length)    q.set('subcategorias', subcatSel.join(','))
    if (formatoSel.length)   q.set('formatos',      formatoSel.join(','))
    if (puntoSel.length)     q.set('puntos',        puntoSel.join(','))
    if (skuSel.length)       q.set('skus',          skuSel.join(','))
    if (extra) for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v)
    return q.toString()
  }

  const filterKey = useMemo(() =>
    [cadenasSel, categoriaSel, subcatSel, formatoSel, puntoSel, skuSel]
      .map(a => a.join('|')).join('::'),
    [cadenasSel, categoriaSel, subcatSel, formatoSel, puntoSel, skuSel])

  useEffect(() => { loadedRef.current = {} }, [filterKey])

  // Cargar catálogo de opciones (una vez por país)
  useEffect(() => {
    fetch(`/api/comercial/ejecucion/walmart/filtros-opciones?pais=${pais}`)
      .then(r => r.json())
      .then(d => setFiltrosOpts({
        cadenas:       d.cadenas       ?? [],
        categorias:    d.categorias    ?? [],
        subcategorias: d.subcategorias ?? [],
        formatos:      d.formatos      ?? [],
        puntos:        d.puntos        ?? [],
        skus:          d.skus          ?? [],
      }))
      .catch(() => {})
  }, [pais])

  // Persistir toggle Filtros abierto/cerrado
  useEffect(() => {
    const saved = localStorage.getItem(`${storageKey}-showFiltros`)
    if (saved === '1') setShowFiltros(true)
  }, []) // eslint-disable-line
  useEffect(() => {
    localStorage.setItem(`${storageKey}-showFiltros`, showFiltros ? '1' : '0')
  }, [showFiltros])

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
    const savedVista = localStorage.getItem(`${storageKey}-vista`)
    if (savedVista === 'mensual' || savedVista === 'diaria') setEvolVista(savedVista)
    const savedMedida = localStorage.getItem(`${storageKey}-medida`)
    if (savedMedida === 'valor' || savedMedida === 'unidades') setEvolMedida(savedMedida)
    // Restaurar filtros multi-select
    const readArr = (k: string): string[] => {
      const raw = localStorage.getItem(`${storageKey}-${k}`)
      if (!raw) return []
      try { const v = JSON.parse(raw); return Array.isArray(v) ? v : [] } catch { return [] }
    }
    setCadenasSel(readArr('cadenas'))
    setCategoriaSel(readArr('categorias'))
    setSubcatSel(readArr('subcategorias'))
    setFormatoSel(readArr('formatos'))
    setPuntoSel(readArr('puntos'))
    setSkuSel(readArr('skus'))
    // Compat: cadena legacy string
    const savedCadenaLegacy = localStorage.getItem(`${storageKey}-cadena`)
    if (savedCadenaLegacy && cadenasSel.length === 0) setCadenasSel([savedCadenaLegacy])
    const savedSubcat = localStorage.getItem(`${storageKey}-subcat`)
    if (savedSubcat) setEvolSubcat(savedSubcat)
    const savedTopN = localStorage.getItem(`${storageKey}-topn`)
    if (savedTopN) setEvolTopN(parseInt(savedTopN) || 5)
    const savedDesde = localStorage.getItem(`${storageKey}-desde`)
    if (savedDesde) setEvolDesde(savedDesde)
    const savedHasta = localStorage.getItem(`${storageKey}-hasta`)
    if (savedHasta) setEvolHasta(savedHasta)
  }, []) // eslint-disable-line

  // Fetch subcategory options when div/pais changes
  useEffect(() => {
    const p = new URLSearchParams({ pais })
    if (currentCat) p.set('categoria', currentCat)
    fetch(`/api/comercial/ejecucion/walmart/subcategorias?${p}`)
      .then(r => r.json()).then(d => { setEvolSubcatOpts(d.subcategorias ?? []); setEvolSubcat('') })
  }, [div]) // eslint-disable-line

  useEffect(() => {
    const extraCat: Record<string, string>    = currentCat  ? { categoria: currentCat }        : {}
    const extraSubcat: Record<string, string> = evolSubcat  ? { subcategoria: evolSubcat }      : {}
    const qs        = buildFilterQS(extraCat)
    const qsWithSub = buildFilterQS({ ...extraCat, ...extraSubcat })

    const needsInventario = ['inventarios','perdida','recomendaciones'].includes(section)

    if (section === 'resumen') {
      setL('resumen', true)
      const CATS = ['Quesos', 'Leches', 'Helados']
      Promise.all([
        fetch(`/api/comercial/ejecucion/walmart/kpis?${qs}`).then(r => r.json()),
        fetch(`/api/comercial/sell-in/kpis?pais=${pais}&cliente=${clienteSellin}${currentCat ? '&categoria=' + encodeURIComponent(currentCat) : ''}`).then(r => r.json()),
        fetch(`/api/comercial/ejecucion/walmart/inventario?${qs}`).then(r => r.json()).catch(() => null),
        // Sell-In por categoría — para el card de desglose
        Promise.all(CATS.map(cat =>
          fetch(`/api/comercial/sell-in/kpis?pais=${pais}&cliente=${clienteSellin}&categoria=${encodeURIComponent(cat)}`)
            .then(r => r.json())
            .then(d => ({ cat, valor: d?.kpis?.ingresos?.valor ?? 0 }))
            .catch(() => ({ cat, valor: 0 }))
        )),
      ]).then(([so, si, invData, siPorCat]) => {
        setSellout(so); setSellin(si); if (invData) setInv(invData)
        const map: Record<string, number> = {}
        for (const { cat, valor } of siPorCat) map[cat] = valor
        setSellinPorCat(map)
      }).finally(() => setL('resumen', false))

    } else if (section === 'evolucion') {
      setL('evolucion', true)
      const qsTop5 = buildFilterQS({ ...extraCat, ...extraSubcat, top: String(evolTopN > 5 ? 100 : 5) })
      Promise.all([
        fetch(`/api/comercial/ejecucion/walmart/timeseries?${qsWithSub}`).then(r => r.json()),
        fetch(`/api/comercial/ejecucion/walmart/evo-top5?${qsTop5}`).then(r => r.json()),
        fetch(`/api/comercial/ejecucion/walmart/comparativo?pais=${pais}&cliente=${clienteSellin}`).then(r => r.json()),
      ]).then(([tsData, t5Data, cpData]) => { setTs(tsData); setEvoTop5(t5Data); setComparativo(cpData) })
        .finally(() => setL('evolucion', false))

    } else if (section === 'pareto') {
      setL('pareto', true)
      const qsp = buildFilterQS({ ...extraCat, top: String(topN) })
      fetch(`/api/comercial/ejecucion/walmart/top-skus?${qsp}`)
        .then(r => r.json()).then(d => setTopSkus(d.rows ?? [])).finally(() => setL('pareto', false))

    } else if (section === 'cobertura') {
      setL('cobertura', true)
      Promise.all([
        fetch(`/api/comercial/ejecucion/walmart/cobertura?${qs}`).then(r => r.json()),
        fetch(`/api/comercial/ejecucion/walmart/inventario?${qs}`).then(r => r.json()).catch(() => null),
      ]).then(([cobData, invData]) => {
        setCob(cobData)
        if (invData) setInv(invData)
      }).finally(() => setL('cobertura', false))

    } else if (needsInventario) {
      setL(section, true)
      fetch(`/api/comercial/ejecucion/walmart/inventario?${qs}`)
        .then(r => r.json()).then(setInv).finally(() => setL(section, false))

    } else if (section === 'innovaciones') {
      setL('innovaciones', true)
      fetch(`/api/comercial/ejecucion/walmart/innovaciones?${qs}`)
        .then(r => r.json()).then(setInnov).finally(() => setL('innovaciones', false))
    }
  }, [section, div, filterKey, topN, evolTopN, evolSubcat]) // eslint-disable-line

  // Persistir filtros multi-select en localStorage
  useEffect(() => {
    localStorage.setItem(`${storageKey}-cadenas`,       JSON.stringify(cadenasSel))
    localStorage.setItem(`${storageKey}-categorias`,    JSON.stringify(categoriaSel))
    localStorage.setItem(`${storageKey}-subcategorias`, JSON.stringify(subcatSel))
    localStorage.setItem(`${storageKey}-formatos`,      JSON.stringify(formatoSel))
    localStorage.setItem(`${storageKey}-puntos`,        JSON.stringify(puntoSel))
    localStorage.setItem(`${storageKey}-skus`,          JSON.stringify(skuSel))
  }, [cadenasSel, categoriaSel, subcatSel, formatoSel, puntoSel, skuSel, storageKey])

  // Fetch daily data when vista=diaria or any filter changes
  useEffect(() => {
    if (section !== 'evolucion' || evolVista !== 'diaria') return
    const cat = DIVS.find(d => d.key === div)?.cat ?? ''
    const extra: Record<string, string> = { top: String(evolTopN > 5 ? 100 : 5) }
    if (cat)        extra.categoria    = cat
    if (evolSubcat) extra.subcategoria = evolSubcat
    if (evolDesde)  extra.desde        = evolDesde + '-01'
    if (evolHasta) {
      const [y, m] = evolHasta.split('-').map(Number)
      const lastDay = new Date(y, m, 0).getDate()
      extra.hasta = `${evolHasta}-${String(lastDay).padStart(2, '0')}`
    }
    fetch(`/api/comercial/ejecucion/walmart/daily?${buildFilterQS(extra)}`)
      .then(r => r.json()).then(d => setEvolDiario(d))
  }, [evolVista, div, evolSubcat, filterKey, evolTopN, evolDesde, evolHasta, section]) // eslint-disable-line

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
    const monthlyRaw = sellout?.monthly ?? []
    const monthly    = monthlyRaw.map((m: any) => ({
      ...m,
      y2025: (m.y2025 ?? 0) > 0 ? m.y2025 : null,
    }))

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

        {/* Sell-Out & Sell-In por Categoría — YTD 2026 */}
        {cats.filter((c: any) => c.valor_2026 > 0).length > 0 && (
          <div className="bg-[#1b3b5f] rounded-xl p-5 text-white">
            <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
              <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-widest">📊 SELL-OUT vs SELL-IN POR CATEGORÍA · YTD 2026 · {pais}</p>
              <div className="flex gap-4 text-[10px]">
                <span className="text-blue-300">Sell-Out total: <b className="text-yellow-300">{fmtFull(soTotal)}</b></span>
                <span className="text-blue-300">Sell-In total: <b className="text-yellow-300">{fmtFull(siVal)}</b></span>
              </div>
            </div>
            <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-${Math.min(cats.filter((c: any) => c.valor_2026 > 0).length, 4)} gap-4`}>
              {cats.filter((c: any) => c.valor_2026 > 0).map((c: any) => {
                const pctSo = soTotal > 0 ? (c.valor_2026 / soTotal * 100) : 0
                const siCat = sellinPorCat[c.categoria] ?? 0
                const pctSi = siVal > 0 ? (siCat / siVal * 100) : 0
                const emoji = /queso/i.test(c.categoria) ? '🧀'
                            : /leche/i.test(c.categoria) ? '🥛'
                            : /helado/i.test(c.categoria) ? '🍦'
                            : '📦'
                return (
                  <div key={c.categoria} className="border-t border-white/10 pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4 first:border-l-0 first:pl-0">
                    <p className="text-[10px] uppercase tracking-widest text-blue-300 mb-2">{emoji} {c.categoria}</p>
                    {/* Sell-Out */}
                    <div className="mb-2">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[9px] uppercase tracking-widest text-blue-300">Sell-Out</span>
                        <span className="text-[10px] text-blue-300">{pctSo.toFixed(1)}%</span>
                      </div>
                      <p className="text-lg font-bold text-yellow-300 leading-tight">{fmtFull(c.valor_2026)}</p>
                      <div className="h-1 rounded-full bg-white/10 overflow-hidden mt-1">
                        <div className="h-full bg-yellow-300/70" style={{ width: `${pctSo}%` }} />
                      </div>
                    </div>
                    {/* Sell-In */}
                    <div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-[9px] uppercase tracking-widest text-blue-300">Sell-In</span>
                        <span className="text-[10px] text-blue-300">{pctSi.toFixed(1)}%</span>
                      </div>
                      <p className="text-lg font-bold text-emerald-300 leading-tight">{siCat > 0 ? fmtFull(siCat) : <span className="text-blue-400 text-xs">Sin datos</span>}</p>
                      <div className="h-1 rounded-full bg-white/10 overflow-hidden mt-1">
                        <div className="h-full bg-emerald-300/70" style={{ width: `${pctSi}%` }} />
                      </div>
                    </div>
                    {c.uni_2026 != null && (
                      <p className="text-[10px] text-blue-300 mt-2">{Number(c.uni_2026).toLocaleString('en-US')} u vendidas</p>
                    )}
                  </div>
                )
              })}
            </div>
            {/* Footer con métricas Sell-In */}
            <div className="border-t border-white/10 mt-4 pt-3 flex flex-wrap gap-6">
              <div>
                <p className="text-[9px] uppercase tracking-widest text-blue-300 mb-0.5">Sell-In · Crecimiento YTD vs 2025</p>
                <p className="text-sm font-bold text-yellow-300">
                  {siDelta !== null ? `${siDelta > 0 ? '+' : ''}${siDelta.toFixed(1)}%` : 'Sin datos 2025'}
                </p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-widest text-blue-300 mb-0.5">Sell-In · Cajas YTD</p>
                <p className="text-sm font-bold text-yellow-300">{Math.round(siCajas).toLocaleString('en-US')}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-widest text-blue-300 mb-0.5">Sell-Out · hasta</p>
                <p className="text-sm font-bold text-yellow-300">{soLast}</p>
              </div>
            </div>
          </div>
        )}

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

        {/* Monthly area chart */}
        {monthly.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h3 className="text-sm font-bold text-gray-800">Sell-Out Mensual — 2025 / 2026</h3>
                <p className="text-[11px] text-gray-400">Evolución comparativa por año</p>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-400"/> 2025</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"/> 2026</span>
              </div>
            </div>
            <div className="h-[240px] mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barCategoryGap="25%">
                  <defs>
                    <linearGradient id="wmGrad2026" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={1}/>
                      <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.85}/>
                    </linearGradient>
                    <linearGradient id="wmGrad2025" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#cbd5e1" stopOpacity={0.95}/>
                      <stop offset="100%" stopColor="#e2e8f0" stopOpacity={0.75}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="mes_nombre" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={fmt$} tick={{ fontSize: 11, fill: '#94a3b8' }} width={55} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(v: any, name: string) => [fmtFull(v), name]}
                    labelFormatter={(label: string) => label}
                    cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                    contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  />
                  <Bar dataKey="y2025" name="2025" fill="url(#wmGrad2025)" radius={[6,6,0,0]} maxBarSize={38} />
                  <Bar dataKey="y2026" name="2026" fill="url(#wmGrad2026)" radius={[6,6,0,0]} maxBarSize={38} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Indicadores de Inventario */}
        {(() => {
          const ikpis = computeInventarioKPIs(sellout, inv)
          const hasInv = inv?.disponible === true
          if (monthly.length === 0 && !hasInv) return null
          const cards = [
            { label: 'SKUs PDV',        value: ikpis.pdv_skus       !== null ? ikpis.pdv_skus.toLocaleString('en-US')                         : '—', sub: `${ikpis.pdv_tiendas_dist ?? '—'} tiendas · ${ikpis.fecha_tiendas ?? '—'}`, leftColor: '#3b82f6' },
            { label: 'INV PDV (un)',    value: ikpis.pdv_inv        !== null ? Math.round(ikpis.pdv_inv).toLocaleString('en-US')                 : '—', sub: 'Unidades en tienda',                                                          leftColor: '#c8873a' },
            { label: 'CRÍTICOS PDV',    value: ikpis.pdv_criticos_stores !== null ? ikpis.pdv_criticos_stores.toLocaleString('en-US')           : '—', sub: 'Combos SKU×Tienda DOH ≤ 7d',                                                   leftColor: ikpis.pdv_criticos_stores !== null && ikpis.pdv_criticos_stores > 0 ? '#ef4444' : '#e5e7eb' },
            { label: 'UNID. CEDI',      value: ikpis.cedi_unidades  !== null ? Math.round(ikpis.cedi_unidades).toLocaleString('en-US')          : (ikpis.cedi_cajas !== null ? ikpis.cedi_cajas.toLocaleString('en-US') : '—'), sub: `${ikpis.cedi_unidades !== null ? 'Unidades' : 'Cajas'} CEDI · ${ikpis.fecha_cedi ?? '—'}`, leftColor: '#16a34a' },
            { label: 'SIN STOCK CEDI',  value: ikpis.cedi_sin_stock !== null ? String(ikpis.cedi_sin_stock)                                     : '—', sub: 'SKUs CEDI con inv. = 0',                                                       leftColor: ikpis.cedi_sin_stock !== null && ikpis.cedi_sin_stock > 0 ? '#ef4444' : '#e5e7eb' },
          ]
          return (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Indicadores de Inventario</p>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {cards.map(c => (
                  <div key={c.label} className="bg-white rounded-xl border border-l-4 border-gray-100 shadow-sm p-4" style={{ borderLeftColor: c.leftColor }}>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest leading-tight mb-1">{c.label}</p>
                    <p className="text-xl font-bold text-gray-800">{c.value}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{c.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* Hallazgos Críticos */}
        {(() => {
          const hallazgos = generarHallazgos(sellout, inv, topSkus)
          if (hallazgos.length === 0) return null
          return (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Hallazgos Críticos</p>
              <div className="space-y-2">
                {hallazgos.map((h, i) => {
                  const s = HALLAZGO_STYLE[h.tipo]
                  return (
                    <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 border-l-4" style={{ borderLeftColor: s.leftColor }}>
                      <div className="flex items-start gap-3">
                        <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full mt-0.5 ${s.badgeCls}`}>{s.badge}</span>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{h.titulo}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{h.detalle}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

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
    if (L) return <div className="space-y-4"><ChartSkeleton /><ChartSkeleton /><ChartSkeleton /></div>

    const MN12 = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
    const desdeMonth = evolDesde ? parseInt(evolDesde.split('-')[1]) : 1
    const hastaMonth = evolHasta ? parseInt(evolHasta.split('-')[1]) : 12

    const allSeries = (ts?.series ?? []).filter((m: any) => m.y2025 > 0 || m.y2026 !== null || m.y2024 > 0)
    const series    = allSeries.filter((m: any) => m.mes >= desdeMonth && m.mes <= hastaMonth)
    const cadenas   = ts?.cadenas ?? []
    const byCad     = (ts?.byCadena ?? []).filter((m: any) => cadenas.some((c: string) => (m[c] ?? 0) > 0))
    const skus      = evoTop5?.skus ?? []

    // Generate N perceptually distinct colors spread across the hue wheel
    const makeColors = (n: number) => {
      const base = ['#e63946','#f4a261','#2a9d8f','#457b9d','#8338ec','#06d6a0','#fb5607','#3a86ff','#ffbe0b','#ff006e',
                    '#118ab2','#ef476f','#06b6d4','#84cc16','#8b5cf6','#f59e0b','#10b981','#c8873a','#a78bfa','#f43f5e']
      if (n <= base.length) return base.slice(0, n)
      return Array.from({ length: n }, (_, i) => `hsl(${Math.round(i * 360 / n)}, 68%, 48%)`)
    }
    const SKU_COLORS = makeColors(skus.length || 10)

    // Top5 chart data
    const top5Series: Record<number, Record<string, any>> = {}
    for (let m = 1; m <= 12; m++) top5Series[m] = { mes: m, mes_nombre: MN12[m] }
    for (const sku of skus) {
      for (const pt of sku.series) {
        top5Series[pt.mes][sku.descripcion] = evolMedida === 'valor' ? pt.valor : pt.unidades
      }
    }
    const top5Data = Object.values(top5Series).filter(r => skus.some((s: any) => (r[s.descripcion] ?? 0) > 0))

    // Daily variants (declared after top5Data so no temporal dead zone)
    const isDiaria  = evolVista === 'diaria'
    const dCadenas  = isDiaria ? (evolDiario?.cadenas  ?? []) : cadenas
    const dByCad    = isDiaria ? (evolDiario?.byCadena ?? []) : byCad
    const dSkuNames = isDiaria ? (evolDiario?.skuNames ?? []) : skus.map((s: any) => s.descripcion)
    const dSkuData  = isDiaria ? (evolDiario?.bySkus   ?? []) : top5Data
    const xKey      = isDiaria ? 'label' : 'mes_nombre'
    const SKU_COLORS2 = makeColors(dSkuNames.length || 10)

    // Comparativo (sell-in vs sell-out por categoria)
    const cpQuesos  = comparativo?.quesos  ?? []
    const cpLeches  = comparativo?.leches  ?? []
    const cpHelados = comparativo?.helados ?? []

    const yFmt = (v: number) => evolMedida === 'valor'
      ? (v >= 1e3 ? '$' + (v / 1e3).toFixed(0) + 'K' : '$' + v)
      : (v >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : String(v))

    const toggleYear = (key: string) => setEvolYearFilter(p => p === key ? '' : key)
    const toggleCadenaLine = (c: string) => setEvolCadenaLine(p => p === c ? '' : c)
    const toggleCpFilter = (k: string) => setEvolCpFilter(p => p === k ? '' : k)

    return (
      <div className="space-y-5">

        {/* ── Main evolution chart ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-gray-800">📈 Evolución de Ventas — Portafolio Activo</h3>
            <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">SELLOUT</span>
          </div>
          <p className="text-xs text-gray-400 mb-3">{currentCat || 'Todas las categorías'} · Walmart {paisNombre}</p>

          {evolVista === 'diaria' ? (
            evolDiario?.series?.length > 0 ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs text-gray-500 font-medium">
                    {evolDiario.series.length} días · Total: {fmtFull(evolDiario.series.reduce((s: number, r: any) => s + (evolMedida === 'valor' ? r.valor : r.unidades), 0))}
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={evolDiario.series} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                    <defs>
                      <linearGradient id="gradWmEvolDia" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="#c8873a" stopOpacity={0.35}/>
                        <stop offset="60%"  stopColor="#c8873a" stopOpacity={0.08}/>
                        <stop offset="100%" stopColor="#c8873a" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false}
                      interval={Math.max(0, Math.floor(evolDiario.series.length / 20) - 1)} />
                    <YAxis tickFormatter={yFmt} tick={{ fontSize: 11, fill: '#94a3b8' }} width={55} axisLine={false} tickLine={false} />
                    <Tooltip
                      labelFormatter={(l: string) => l}
                      formatter={(v: number) => [
                        evolMedida === 'valor' ? fmtFull(v) : v?.toLocaleString('en-US'),
                        evolMedida === 'valor' ? 'Venta ($)' : 'Unidades',
                      ]}
                      contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                    />
                    <Area type="monotone" dataKey={evolMedida === 'valor' ? 'valor' : 'unidades'}
                      stroke="#c8873a" strokeWidth={2.5} fill="url(#gradWmEvolDia)" dot={false}
                      activeDot={{ r: 5, strokeWidth: 2, fill: '#fff', stroke: '#c8873a' }} connectNulls />
                  </AreaChart>
                </ResponsiveContainer>
              </>
            ) : (
              <div className="h-[280px] bg-gray-50 rounded-lg animate-pulse flex items-center justify-center">
                <span className="text-xs text-gray-300">Cargando datos diarios...</span>
              </div>
            )
          ) : series.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-3xl mb-2">📭</p>
              <p className="text-sm font-semibold text-gray-600">Sin datos de sell-out para {paisNombre}</p>
              <p className="text-xs text-gray-400 mt-1">Los datos de sell-out Walmart {pais} aún no han sido cargados.</p>
            </div>
          ) : (
            <>
              {/* YTD + OOS banners */}
              {ts && (
                <div className="flex gap-3 mb-4 flex-wrap">
                  <div className={`flex-1 min-w-[180px] rounded-lg px-4 py-2.5 border ${ts.delta_ytd >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                    <p className={`text-[9px] font-bold uppercase tracking-widest mb-0.5 ${ts.delta_ytd >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      Crecimiento YTD Sell-Out vs 2025
                    </p>
                    <p className={`text-lg font-bold ${ts.delta_ytd >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {ts.ytd_2025 === 0 ? 'Sin datos 2025' : `${ts.delta_ytd > 0 ? '+' : ''}${ts.delta_ytd.toFixed(1)}%`}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {fmtFull(ts.ytd_2026)} · 2026 YTD {ts.ultimo_mes_nombre ? `Ene–${ts.ultimo_mes_nombre}` : ''}
                    </p>
                  </div>
                  {ts.oos_meses?.length > 0 ? (
                    <div className="flex-1 min-w-[180px] rounded-lg px-4 py-2.5 bg-orange-50 border border-orange-100">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-orange-700 mb-0.5">⚠️ Alerta OOS Detectada</p>
                      <p className="text-sm font-bold text-orange-700">{ts.oos_meses.length} mes{ts.oos_meses.length !== 1 ? 'es' : ''} con quiebre</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">{ts.oos_meses.join(' + ')} bajo el 30% del baseline</p>
                    </div>
                  ) : (
                    <div className="flex-1 min-w-[180px] rounded-lg px-4 py-2.5 bg-emerald-50 border border-emerald-100">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-700 mb-0.5">✅ Sin Quiebres de Stock</p>
                      <p className="text-sm font-bold text-emerald-700">Abastecimiento continuo</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">Todos los meses sobre el 30% del baseline</p>
                    </div>
                  )}
                </div>
              )}

              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={series} margin={{ top: 4, right: 12, left: 0, bottom: 4 }} barCategoryGap="20%">
                  <defs>
                    <linearGradient id="gradWmEvol2024" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#e5e7eb" stopOpacity={0.95}/>
                      <stop offset="100%" stopColor="#f3f4f6" stopOpacity={0.75}/>
                    </linearGradient>
                    <linearGradient id="gradWmEvol2025" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.95}/>
                      <stop offset="100%" stopColor="#93c5fd" stopOpacity={0.75}/>
                    </linearGradient>
                    <linearGradient id="gradWmEvol2026" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#c8873a" stopOpacity={1}/>
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.85}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="mes_nombre" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={yFmt} tick={{ fontSize: 11, fill: '#94a3b8' }} width={55} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(v: number, name: string) => [evolMedida === 'valor' ? fmtFull(v) : v?.toLocaleString('en-US'), name]}
                    cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                    contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
                  {ts?.baseline_val > 0 && evolMedida === 'valor' && (
                    <ReferenceLine y={ts.baseline_val} stroke="#f59e0b" strokeDasharray="4 4"
                      label={{ value: 'Baseline', fontSize: 9, fill: '#f59e0b', position: 'insideTopRight' }} />
                  )}
                  {(!evolYearFilter || evolYearFilter === 'y2024') && (
                    <Bar dataKey={evolMedida === 'valor' ? 'y2024' : 'u2024'} name="2024"
                      fill="url(#gradWmEvol2024)" radius={[4,4,0,0]} maxBarSize={30}
                      onClick={() => toggleYear('y2024')} style={{ cursor: 'pointer' }} />
                  )}
                  {(!evolYearFilter || evolYearFilter === 'y2025') && (
                    <Bar dataKey={evolMedida === 'valor' ? 'y2025' : 'u2025'} name="2025"
                      fill="url(#gradWmEvol2025)" radius={[4,4,0,0]} maxBarSize={30}
                      onClick={() => toggleYear('y2025')} style={{ cursor: 'pointer' }} />
                  )}
                  {(!evolYearFilter || evolYearFilter === 'y2026') && (
                    <Bar dataKey={evolMedida === 'valor' ? 'y2026' : 'u2026'} name="2026"
                      fill="url(#gradWmEvol2026)" radius={[4,4,0,0]} maxBarSize={30}
                      onClick={() => toggleYear('y2026')} style={{ cursor: 'pointer' }} />
                  )}
                </BarChart>
              </ResponsiveContainer>

              <div className="flex items-center gap-3 mt-3 text-[10px] flex-wrap">
                {[
                  { key: 'y2024', label: '2024',      color: '#e5e7eb' },
                  { key: 'y2025', label: '2025',      color: '#60a5fa' },
                  { key: 'y2026', label: '2026 YTD',  color: '#c8873a' },
                ].map(({ key, label, color }) => {
                  const active = !evolYearFilter || evolYearFilter === key
                  return (
                    <button key={key} onClick={() => toggleYear(key)}
                      className={`flex items-center gap-1.5 transition-opacity ${active ? 'opacity-100' : 'opacity-30'}`}>
                      <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: color }} />
                      <span style={{ color: active ? '#6b7280' : '#d1d5db' }}>{label}</span>
                    </button>
                  )
                })}
                {ts?.baseline_val > 0 && evolMedida === 'valor' && (
                  <span className="flex items-center gap-1.5 text-gray-400">
                    <span className="w-5 h-0.5 border-t-2 border-dashed border-amber-400 inline-block" />
                    Baseline {fmtFull(ts.baseline_val)}/mes
                  </span>
                )}
                {evolYearFilter && (
                  <button onClick={() => setEvolYearFilter('')}
                    className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 text-[10px] font-medium">
                    ✕ ver todos
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Top N SKUs ── */}
        {dSkuNames.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 className="text-sm font-semibold text-gray-800">
                🏆 {evolTopN === 5 ? 'Top 5 SKUs' : `${dSkuNames.length} SKUs`} — Evolución {isDiaria ? 'Diaria' : 'Mensual'} 2026
              </h3>
              {evolSkuFilter && (
                <button onClick={() => setEvolSkuFilter('')}
                  className="flex-shrink-0 text-[10px] px-2 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200 font-medium hover:bg-amber-200 transition-colors">
                  ✕ ver todas
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400 mb-3">
              Por venta acumulada · Walmart {paisNombre} · Toca una línea para aislarla
            </p>

            <ResponsiveContainer width="100%" height={evolSkuFilter ? 320 : evolTopN === 5 ? 280 : Math.max(560, dSkuNames.length * 14)}>
              <LineChart data={dSkuData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
                onMouseLeave={() => setEvolSkuHover('')}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey={xKey} tick={{ fontSize: isDiaria ? 9 : 11, fill: '#64748b' }} axisLine={false} tickLine={false}
                  interval={isDiaria ? Math.max(0, Math.floor((dSkuData.length || 1) / 20) - 1) : 0} />
                <YAxis tickFormatter={yFmt} tick={{ fontSize: 11, fill: '#94a3b8' }} width={55} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number, name: string) => [evolMedida === 'valor' ? fmtFull(v) : v?.toLocaleString('en-US'), name]}
                  itemStyle={{ fontSize: 11 }}
                  contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
                {dSkuNames.map((name: string, i: number) => {
                  const color = SKU_COLORS2[i % SKU_COLORS2.length]
                  if (evolSkuFilter && evolSkuFilter !== name) return null
                  const dimmed = !evolSkuFilter && evolSkuHover && evolSkuHover !== name
                  return (
                    <Line key={name} type="monotone" dataKey={name}
                      stroke={color}
                      strokeWidth={evolSkuFilter || evolSkuHover === name ? 3 : 1.5}
                      strokeOpacity={dimmed ? 0.12 : 1}
                      dot={evolSkuFilter || evolSkuHover === name ? { r: 3, fill: color } : false}
                      activeDot={{ r: 5, fill: color }}
                      connectNulls
                      onMouseEnter={() => setEvolSkuHover(name)}
                      onClick={() => { setEvolSkuFilter(p => p === name ? '' : name); setEvolSkuHover('') }}
                      style={{ cursor: 'pointer' }} />
                  )
                })}
              </LineChart>
            </ResponsiveContainer>

            {/* Custom clickable legend */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {dSkuNames.map((name: string, i: number) => {
                const color = SKU_COLORS2[i % SKU_COLORS2.length]
                const isActive = !evolSkuFilter || evolSkuFilter === name
                return (
                  <button key={name}
                    onClick={() => setEvolSkuFilter(prev => prev === name ? '' : name)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all select-none ${
                      isActive ? 'border-gray-200 text-gray-700 bg-white hover:bg-gray-50' : 'border-gray-100 text-gray-300 bg-gray-50 hover:bg-gray-100'
                    }`}>
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: isActive ? color : '#d1d5db' }} />
                    {name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── 2026 por Cadena (line) ── */}
        {!cadenaFilter && dByCad.length > 0 && dCadenas.length > 1 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-gray-700">2026 por Cadena</h3>
              {evolCadenaLine && (
                <button onClick={() => setEvolCadenaLine('')}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 font-medium">
                  ✕ ver todas
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400 mb-4">Sell-out {isDiaria ? 'diario' : 'mensual'} por formato · clic en una línea para aislar</p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dByCad} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey={xKey} tick={{ fontSize: isDiaria ? 9 : 11, fill: '#64748b' }} axisLine={false} tickLine={false}
                  interval={isDiaria ? Math.max(0, Math.floor((dByCad.length || 1) / 20) - 1) : 0} />
                <YAxis tickFormatter={fmt$} tick={{ fontSize: 11, fill: '#94a3b8' }} width={50} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: any) => v !== null ? fmtFull(v) : '—'}
                  contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
                {dCadenas.map((c: string) => {
                  if (evolCadenaLine && evolCadenaLine !== c) return null
                  return (
                    <Line key={c} type="monotone" dataKey={c} name={c}
                      stroke={CADENA_COLORS[c] ?? '#6b7280'}
                      strokeWidth={evolCadenaLine === c ? 2.5 : 2} dot={false}
                      activeDot={{ r: 4 }}
                      connectNulls onClick={() => toggleCadenaLine(c)}
                      style={{ cursor: 'pointer' }} />
                  )
                })}
              </LineChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {dCadenas.map((c: string) => {
                const color = CADENA_COLORS[c] ?? '#6b7280'
                const active = !evolCadenaLine || evolCadenaLine === c
                return (
                  <button key={c} onClick={() => toggleCadenaLine(c)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-opacity select-none ${
                      active ? 'border-gray-200 text-gray-700 bg-white' : 'border-gray-100 text-gray-300 bg-gray-50'
                    }`}>
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: active ? color : '#d1d5db' }} />
                    {c}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Sell-In vs Sell-Out · Comparativo mensual ── */}
        {(cpQuesos.length > 0 || cpLeches.length > 0 || cpHelados.length > 0) && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Sell-In vs Sell-Out · Comparativo Mensual</h3>
            <p className="text-xs text-gray-400 mb-1">
              Sell-In = facturación BL Foods → {clienteSellin} (CIF). Sell-Out = venta al consumidor desde sell-out reportado.
            </p>
            {evolCpFilter && (
              <div className="mt-1 mb-3">
                <button onClick={() => setEvolCpFilter('')}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 font-medium">
                  ✕ ver ambas líneas
                </button>
              </div>
            )}
            <div className="space-y-4 mt-4">
              {[{ label: '🧀 Quesos', data: cpQuesos }, { label: '🥛 Leches', data: cpLeches }, { label: '🍦 Helados', data: cpHelados }]
                .filter(g => g.data.length > 0)
                .map(g => (
                  <div key={g.label}>
                    <p className="text-xs font-semibold text-gray-600 mb-2">{g.label}</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <AreaChart data={g.data} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                        <defs>
                          <linearGradient id={`gradWmCp_${g.label}_si`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%"   stopColor="#94a3b8" stopOpacity={0.25}/>
                            <stop offset="100%" stopColor="#94a3b8" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id={`gradWmCp_${g.label}_so`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%"   stopColor="#c8873a" stopOpacity={0.4}/>
                            <stop offset="100%" stopColor="#c8873a" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="mes_nombre" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={fmt$} tick={{ fontSize: 11, fill: '#94a3b8' }} width={50} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(v: number, name: string) => [fmtFull(v), name]}
                          contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}/>
                        {(!evolCpFilter || evolCpFilter === 'sellin') && (
                          <Area type="monotone" dataKey="sellin" name="Sell-In"
                            stroke="#94a3b8" strokeWidth={evolCpFilter === 'sellin' ? 2.5 : 2}
                            fill={`url(#gradWmCp_${g.label}_si)`} dot={false}
                            activeDot={{ r: 4 }} connectNulls
                            onClick={() => toggleCpFilter('sellin')}
                            style={{ cursor: 'pointer' }} />
                        )}
                        {(!evolCpFilter || evolCpFilter === 'sellout') && (
                          <Area type="monotone" dataKey="sellout" name="Sell-Out"
                            stroke="#c8873a" strokeWidth={evolCpFilter === 'sellout' ? 2.5 : 2}
                            fill={`url(#gradWmCp_${g.label}_so)`} dot={false}
                            activeDot={{ r: 5, strokeWidth: 2, fill: '#fff', stroke: '#c8873a' }} connectNulls
                            onClick={() => toggleCpFilter('sellout')}
                            style={{ cursor: 'pointer' }} />
                        )}
                      </AreaChart>
                    </ResponsiveContainer>
                    <div className="flex gap-2 mt-2">
                      {[{ key: 'sellin', label: 'Sell-In', color: '#94a3b8' }, { key: 'sellout', label: 'Sell-Out', color: '#c8873a' }].map(({ key, label, color }) => {
                        const active = !evolCpFilter || evolCpFilter === key
                        return (
                          <button key={key} onClick={() => toggleCpFilter(key)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-opacity select-none ${
                              active ? 'border-gray-200 text-gray-700 bg-white' : 'border-gray-100 text-gray-300 bg-gray-50'
                            }`}>
                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: active ? color : '#d1d5db' }} />
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Inventarios / Cobertura ───────────────────────────────────────────────

  function Cobertura() {
    const L          = isL('cobertura')
    const staticCob  = COBERTURA_POR_PAIS[pais]

    const barColor = (pct: number) =>
      pct >= 70 ? '#10b981' : pct >= 50 ? '#f59e0b' : pct >= 30 ? '#f97316' : '#ef4444'

    if (L) return (
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse">
          <div className="h-4 bg-gray-100 rounded w-1/3 mb-3" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
            {Array(4).fill(0).map((_, i) => <div key={i} className="h-16 bg-gray-50 rounded-lg" />)}
          </div>
        </div>
        {Array(2).fill(0).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse">
            <div className="h-4 bg-gray-100 rounded w-1/3 mb-4" />
            <div className="h-[220px] bg-gray-50 rounded" />
          </div>
        ))}
      </div>
    )

    // ── Static store network panel ───────────────────────────────────────────
    const staticPanel = staticCob && (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Red Walmart Group — {paisNombre}</h3>
            <p className="text-xs text-gray-400">Puntos de venta potenciales por formato</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-800">{staticCob.total}</p>
            <p className="text-xs text-gray-400">tiendas totales</p>
          </div>
        </div>
        <div className={`grid grid-cols-2 md:grid-cols-${Math.min(Object.keys(staticCob.formatos).length, 4)} gap-3`}>
          {Object.entries(staticCob.formatos).map(([formato, n]) => {
            const color = CADENA_COLORS[formato] ?? '#6b7280'
            const pct = Math.round((n as number) / staticCob.total * 100)
            return (
              <div key={formato} className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                  <p className="text-xs font-medium text-gray-600 truncate">{formato}</p>
                </div>
                <p className="text-xl font-bold text-gray-800">{n as number}</p>
                <div className="mt-1.5 bg-gray-200 rounded-full h-1">
                  <div className="h-1 rounded-full" style={{ width: `${pct}%`, background: color }} />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">{pct}% de la red</p>
              </div>
            )
          })}
        </div>
      </div>
    )

    if (!cob?.rows?.length) return (
      <div className="space-y-5">
        {staticPanel}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
          <p className="text-3xl mb-2">📊</p>
          <p className="text-sm font-semibold text-gray-700 mb-1">Sin datos de ventas por tienda</p>
          <p className="text-xs text-gray-400">La cobertura se calcula desde <code className="bg-gray-100 px-1 rounded text-xs">fact_ventas_walmart</code> con columna <code className="bg-gray-100 px-1 rounded text-xs">punto_venta</code>.</p>
        </div>
      </div>
    )

    const allRows: any[]  = cob.rows
    const totalPdvs       = cob.total_pdvs
    const skuSaludables   = allRows.filter((r: any) => r.cobertura_pct >= 70).length
    const skuBaja         = allRows.filter((r: any) => r.cobertura_pct < 50).length

    // ── Bullet chart rows ────────────────────────────────────────────────────
    const bulletRows = allRows
      .filter((r: any) => !cobCatF || r.categoria === cobCatF)
      .map((r: any) => ({
        ...r,
        _actual: cobVista === 'ponderada' ? r.cobertura_ponderada : r.cobertura_pct,
        _max:    r.cobertura_maxima,
      }))
      .sort((a: any, b: any) => {
        if (cobSort === 'gap')    return b.gap_pp  - a.gap_pp
        if (cobSort === 'actual') return b._actual - a._actual
        return b._max - a._max
      })

    return (
      <div className="space-y-5">

        {staticPanel}



        {/* ── KPI cards ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">🎯 Cobertura de Distribución — {paisNombre}</h3>
          <p className="text-xs text-gray-500 leading-relaxed mb-4">
            <span className="font-semibold">Cobertura numérica</span> = % de tiendas ({totalPdvs} con ventas) que vendieron el SKU en 2026.{' '}
            <span className="font-semibold">Cobertura ponderada</span> = las mismas tiendas pesadas por su share de ventas.{' '}
            <span className="font-semibold">Máxima histórica</span> = mejor mes alcanzado. Gap = pp de recuperación potencial.
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'COBERTURA PROMEDIO', value: cob.avg_cob + '%', sub: `vs máx histórica ${cob.max_historica}% · gap ${cob.gap_global}pp`, tc: 'text-emerald-600' },
              { label: 'COB. PONDERADA',     value: cob.avg_ponderada + '%', sub: `por share de venta · ${allRows.length} SKUs`, tc: 'text-emerald-600' },
              { label: 'SKUs SALUDABLES',    value: skuSaludables, sub: 'cobertura ≥ 70% de tiendas', tc: skuSaludables > 0 ? 'text-emerald-600' : 'text-red-600' },
              { label: 'SKUs BAJA COB.',     value: skuBaja, sub: 'por debajo de 50% — oportunidad', tc: skuBaja > 0 ? 'text-red-600' : 'text-gray-800' },
            ].map(c => (
              <div key={c.label} className="border border-gray-100 rounded-xl p-4">
                <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mb-2 leading-tight">{c.label}</p>
                <p className={`text-2xl font-bold mb-1 ${c.tc}`}>{c.value}</p>
                <p className="text-xs text-gray-400">{c.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── By cadena bar chart ── */}
        {cob.por_cadena?.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-1">📊 Por Formato — ¿Dónde están las brechas?</h3>
            <p className="text-xs text-gray-400 mb-4">Cobertura promedio de los SKUs Borden en cada formato de tienda (actual vs máxima histórica).</p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={cob.por_cadena.map((g: any) => ({
                  cadena:  `${g.cadena} (${g.n_tiendas})`,
                  actual:  g.cob_actual_avg,
                  maxima:  g.cob_max_avg,
                }))}
                margin={{ top: 10, right: 20, left: 0, bottom: 40 }}
                barCategoryGap="30%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="cadena" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" interval={0} />
                <YAxis domain={[0, 100]} tickFormatter={v => v + '%'} tick={{ fontSize: 11 }} width={42} />
                <Tooltip formatter={(v: number, n: string) => [v.toFixed(1) + '%', n === 'maxima' ? 'Máx Histórica' : 'Actual 2026']} />
                <Legend formatter={(n: string) => n === 'maxima' ? 'Máx Histórica' : 'Actual 2026'} />
                <Bar dataKey="maxima" name="maxima" fill="#d1d5db" radius={[3, 3, 0, 0]} />
                <Bar dataKey="actual" name="actual" fill="#1b3b5f" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Bullet chart by SKU ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-1">📋 Bullet Chart por SKU — Actual vs Máxima Histórica</h3>
          <p className="text-xs text-gray-400 mb-4">
            Barra coloreada = cobertura actual. Línea gris = máxima histórica. La diferencia es la distribución recuperable.
          </p>

          <div className="flex items-center gap-x-4 gap-y-2 flex-wrap text-xs mb-4">
            <div className="flex items-center gap-2">
              <span className="text-gray-400 font-medium">Ordenar:</span>
              {([['gap', 'Mayor Gap'], ['actual', 'Cobertura Actual'], ['maxima', 'Máxima Histórica']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setCobSort(k)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors border ${cobSort === k ? 'bg-[#1b3b5f] text-white border-[#1b3b5f]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                  {l}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400 font-medium">Vista:</span>
              {([['numerica', 'Numérica'], ['ponderada', 'Ponderada']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setCobVista(k)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors border ${cobVista === k ? 'bg-[#1b3b5f] text-white border-[#1b3b5f]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
            {bulletRows.map((r: any) => (
              <div key={r.sku} className="flex items-center gap-3 py-1.5">
                <div className="w-52 flex-shrink-0">
                  <p className="text-xs font-semibold text-gray-700 truncate">{r.descripcion}</p>
                  <p className="text-[10px] text-gray-400">{r.sku} · {r.categoria}</p>
                </div>
                <div className="flex-1 relative h-7 bg-gray-100 rounded overflow-hidden">
                  <div className="absolute inset-y-0 left-0 bg-gray-200 rounded"
                    style={{ width: `${Math.min(r._max, 100)}%` }} />
                  <div className="absolute inset-y-0 left-0 rounded transition-all"
                    style={{ width: `${Math.min(r._actual, 100)}%`, backgroundColor: barColor(r._actual) }} />
                  {r._max > r._actual && (
                    <div className="absolute inset-y-0 w-0.5 bg-gray-500 opacity-60"
                      style={{ left: `${Math.min(r._max, 100)}%` }} />
                  )}
                </div>
                <div className="flex gap-4 text-right flex-shrink-0">
                  <div className="w-12">
                    <p className="text-[9px] text-gray-400">Actual</p>
                    <p className="text-xs font-bold" style={{ color: barColor(r._actual) }}>{r._actual.toFixed(0)}%</p>
                  </div>
                  <div className="w-10">
                    <p className="text-[9px] text-gray-400">Máx</p>
                    <p className="text-xs font-semibold text-gray-500">{r._max.toFixed(0)}%</p>
                  </div>
                  <div className="w-14">
                    <p className="text-[9px] text-gray-400">Gap</p>
                    <p className={`text-xs font-bold ${r.gap_pp > 0 ? 'text-orange-500' : 'text-emerald-600'}`}>
                      {r.gap_pp > 0 ? '+' : ''}{r.gap_pp.toFixed(1)}pp
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    )
  }

  function Inventarios() {
    const L = isL('inventarios') || isL('cobertura')
    if (L) return <CardSkeleton cols={4} />
    if (!inv?.disponible) return <ProximamentePlaceholder section="inventarios" />

    const k         = inv.kpis
    const cediRows: any[] = inv.cedi_rows ?? []

    // ── Value summary ────────────────────────────────────────────────────────
    const pdvValor   = k.pdv_valor   ?? 0
    const cediValor  = k.cedi_valor  ?? 0
    const totalValor = pdvValor + cediValor
    const cediPct    = totalValor > 0 ? Math.round((cediValor / totalValor) * 100) : 0
    const pdvPct     = 100 - cediPct
    const pdvInv     = k.pdv_inv      ?? 0
    const cediInv    = k.cedi_unidades ?? 0
    const fmtVal     = (v: number) => '$' + Math.round(v).toLocaleString('en-US')
    const fecha      = k.fecha_tiendas ?? k.fecha_cedi ?? '—'

    const SALUD_CFG: Record<string, { color: string; bg: string; label: string }> = {
      'CRÍTICO':       { color: '#dc2626', bg: '#fef2f2',  label: 'Crítico <7d' },
      'ATENCIÓN':      { color: '#f59e0b', bg: '#fffbeb',  label: 'Atención 7-14d' },
      'SALUDABLE':     { color: '#10b981', bg: '#f0fdf4',  label: 'Saludable' },
      'COBERTURA ALTA':{ color: '#06b6d4', bg: '#ecfeff',  label: 'Cob Alta 60-120d' },
      'SOBRESTOCK':    { color: '#f97316', bg: '#fff7ed',  label: 'Sobrestock >120d' },
      'SIN VPD':       { color: '#9ca3af', bg: '#f9fafb',  label: 'Sin VPD' },
    }

    const cadenas = CADENAS_POR_PAIS[pais] ?? []

    function loadSkuTienda() {
      const p = new URLSearchParams({ pais })
      if (invSkuTiendaFilters.cadena) p.set('cadena', invSkuTiendaFilters.cadena)
      if (invSkuTiendaFilters.salud)  p.set('salud',  invSkuTiendaFilters.salud)
      if (invSkuTiendaFilters.prod)   p.set('prod',   invSkuTiendaFilters.prod)
      if (currentCat) p.set('categoria', currentCat)
      setInvSkuTiendaLoading(true)
      fetch('/api/comercial/ejecucion/walmart/inventario/sku-tienda?' + p)
        .then(r => r.json())
        .then(d => setInvSkuTienda(d.rows ?? []))
        .finally(() => setInvSkuTiendaLoading(false))
    }

    function downloadCSV() {
      if (!invSkuTienda?.length) return
      const cols = ['SKU', 'UPC', 'Producto', 'Categoría', 'Cadena', 'Tienda', 'Inv u', 'VPD u/d', 'DOH', 'Salud']
      const rows = invSkuTienda.map(r => [
        r.sku, r.upc, `"${r.descripcion}"`, r.categoria, `"${r.cadena}"`, `"${r.nombre_tienda}"`,
        r.inv_mano, r.venta_dia > 0 ? r.venta_dia.toFixed(2) : '', r.doh ?? '', r.salud,
      ].join(','))
      const blob = new Blob([cols.join(',') + '\n' + rows.join('\n')], { type: 'text/csv' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
      a.download = `inventario-sku-tienda-${pais}.csv`; a.click()
    }

    // ── CEDI Faltantes ───────────────────────────────────────────────────────
    const cediFaltantes = cediRows.filter((r: any) => r.inv_mano_cajas === 0)

    return (
      <div className="space-y-5">

        {/* ── Panel 1: Header KPI + Distribution bar ──────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
            <span>📦</span>
            <h3 className="text-sm font-semibold text-gray-700">Inventarios{fecha !== '—' ? ` al ${fecha}` : ''} · CEDI + PDV</h3>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-5">
            {[
              { label: 'INV CEDI',      value: fmtVal(cediValor), sub: `${Math.round(cediInv).toLocaleString('en-US')} u · ${k.cedi_skus ?? 0} SKUs`, tc: 'text-blue-700', bg: 'bg-blue-50 border-blue-100' },
              { label: 'INV PDV',       value: fmtVal(pdvValor),  sub: `${Math.round(pdvInv).toLocaleString('en-US')} u · ${k.pdv_tiendas_dist ?? 0} tiendas`, tc: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-100' },
              { label: 'TOTAL SISTEMA', value: fmtVal(totalValor),sub: `${Math.round(pdvInv + cediInv).toLocaleString('en-US')} u totales`, tc: 'text-gray-800', bg: 'bg-white border-gray-100' },
              { label: 'DISTRIBUCIÓN',  value: `${cediPct}% CEDI`,sub: `${pdvPct}% PDV — ratio deseable <40% CEDI`, tc: 'text-gray-700', bg: 'bg-gray-50 border-gray-100' },
            ].map(c => (
              <div key={c.label} className={`rounded-xl border p-4 ${c.bg}`}>
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">{c.label}</p>
                <p className={`text-xl font-bold mb-1 ${c.tc}`}>{c.value}</p>
                <p className="text-xs text-gray-500">{c.sub}</p>
              </div>
            ))}
          </div>
          {totalValor > 0 && (
            <div className="px-5 pb-4">
              <div className="flex rounded-full overflow-hidden h-2.5">
                <div className="bg-blue-400 transition-all" style={{ width: `${cediPct}%` }} />
                <div className="bg-emerald-400 flex-1" />
              </div>
              <div className="flex gap-5 mt-1.5">
                <span className="text-[10px] text-gray-400 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />CEDI {cediPct}%</span>
                <span className="text-[10px] text-gray-400 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />PDV {pdvPct}%</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Panel 2: CEDI sin stock ──────────────────────────────────────── */}
        {cediRows.length > 0 && (
          cediFaltantes.length === 0 ? (
            <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-4 flex items-center gap-3">
              <span className="text-xl">✅</span>
              <div>
                <p className="text-sm font-semibold text-emerald-800">Sin CEDI Faltantes</p>
                <p className="text-xs text-emerald-600">Todos los {cediRows.length} SKUs activos tienen stock en CEDI.</p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border-l-4 border-red-500 bg-gradient-to-r from-red-50 to-red-50/20 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-red-100">
                <h3 className="text-sm font-semibold text-red-800">🚨 CEDI Faltantes — SKUs SIN stock en CEDI</h3>
                <p className="text-xs text-red-600 mt-0.5">{cediFaltantes.length} SKUs dependen solo del stock en PDV. Si PDV se agota antes del próximo pedido = quiebre nacional.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="bg-red-50/60 text-gray-500 uppercase tracking-widest text-[10px]">
                    <th className="text-left px-4 py-2.5">Producto</th><th className="text-left px-3 py-2.5">Cat.</th>
                    <th className="text-right px-3 py-2.5">VPD u/d</th><th className="text-right px-3 py-2.5">Unidades PDV</th>
                    <th className="text-right px-4 py-2.5">DOH PDV</th>
                  </tr></thead>
                  <tbody className="divide-y divide-red-50">
                    {cediFaltantes.map((r: any, i: number) => (
                      <tr key={i} className="hover:bg-red-50/30">
                        <td className="px-4 py-2.5 font-medium text-gray-700"><span className="text-gray-400 mr-1.5 text-[10px]">{r.sku}</span>{r.descripcion}</td>
                        <td className="px-3 py-2.5 text-gray-400">{r.categoria}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-gray-500">{r.venta_dia > 0 ? r.venta_dia.toFixed(1) : '—'}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{r.inv_mano_unidades?.toLocaleString('en-US') ?? '—'}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold">
                          <DohChip d={r.doh} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}

        {/* ── Panel 3: CEDI tabla completa ─────────────────────────────────── */}
        {cediRows.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50">
              <h3 className="text-sm font-semibold text-gray-700">🏭 Inventario CEDI por SKU</h3>
              <p className="text-xs text-gray-400">{bandera} {paisNombre} · {cediRows.length} SKUs · {k.fecha_cedi ?? '—'}</p>
            </div>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full table-fixed text-xs">
                <colgroup>
                  <col style={{width:'20%'}} />
                  <col style={{width:'11%'}} />
                  <col style={{width:'7%'}} />
                  <col style={{width:'10%'}} />
                  <col style={{width:'5%'}} />
                  <col style={{width:'6%'}} />
                  <col style={{width:'9%'}} />
                  <col style={{width:'8%'}} />
                  <col style={{width:'7%'}} />
                  <col style={{width:'8%'}} />
                </colgroup>
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-50 text-gray-400 uppercase tracking-widest text-[10px]">
                    <th className="text-left px-4 py-2.5">Producto</th>
                    <th className="text-left px-4 py-2.5">Cód. Barras</th>
                    <th className="text-left px-4 py-2.5">Cat.</th>
                    <th className="text-left px-4 py-2.5">Subcategoría</th>
                    <th className="text-right px-3 py-2.5">VNPK</th>
                    <th className="text-right px-3 py-2.5">Cajas</th>
                    <th className="text-right px-3 py-2.5">Unidades</th>
                    <th className="text-right px-3 py-2.5">Vta/día</th>
                    <th className="text-right px-3 py-2.5">DOH</th>
                    <th className="text-right px-3 py-2.5">Orden (cj)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {cediRows.map((r: any, i: number) => (
                    <tr key={i} className={(r.inv_mano_cajas === 0 || (r.doh !== null && r.doh <= 7)) ? 'bg-red-50/40' : 'hover:bg-gray-50/60'}>
                      <td className="px-4 py-2 font-medium text-gray-700">
                        <p className="font-mono text-[10px] text-gray-400">{r.sku}</p>
                        <p className="whitespace-normal">{r.descripcion}</p>
                      </td>
                      <td className="px-4 py-2 font-mono text-[10px] text-gray-400">{r.upc || '—'}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-semibold ${r.categoria?.toLowerCase().includes('leche') ? 'bg-blue-50 text-blue-600' : r.categoria?.toLowerCase().includes('helado') ? 'bg-teal-50 text-teal-600' : 'bg-amber-50 text-amber-700'}`}>{r.categoria || '—'}</span>
                      </td>
                      <td className="px-4 py-2 text-[10px] text-gray-500 truncate">{r.subcategoria || '—'}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-400 text-[10px]">{r.vnpk_qty ?? 1}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-500">
                        {r.inv_mano_cajas === 0 ? <span className="text-red-500 font-bold">0</span> : r.inv_mano_cajas.toLocaleString('en-US')}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-gray-700">
                        {r.inv_mano_unidades != null
                          ? (r.inv_mano_unidades === 0 ? <span className="text-red-500 font-bold">0</span> : r.inv_mano_unidades.toLocaleString('en-US'))
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-gray-400">{r.venta_dia > 0 ? r.venta_dia.toFixed(1) : '—'}</td>
                      <td className="px-3 py-2 text-right"><DohChip d={r.doh ?? null} /></td>
                      <td className="px-3 py-2 text-right font-mono text-blue-600">
                        {r.inv_orden_cajas > 0 ? r.inv_orden_cajas.toLocaleString('en-US') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Panel 4: SKU × Tienda ────────────────────────────────────────── */}
        {k.fecha_tiendas && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50">
              <h3 className="text-sm font-semibold text-gray-700">🏬 Inventario por SKU × Tienda</h3>
              <p className="text-xs text-gray-400">Detalle por tienda con DOH y salud · {k.fecha_tiendas}</p>
            </div>

            {/* Filters */}
            <div className="px-5 py-3 bg-gray-50/60 border-b border-gray-100 flex items-center gap-x-3 gap-y-2 flex-wrap text-xs">
              <span className="text-gray-400 font-medium">Cadena:</span>
              <select value={invSkuTiendaFilters.cadena}
                onChange={e => setInvSkuTiendaFilters(p => ({ ...p, cadena: e.target.value }))}
                className="border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400">
                <option value="">Todas</option>
                {cadenas.map(c => <option key={c}>{c}</option>)}
              </select>
              <span className="text-gray-400 font-medium">Salud:</span>
              <select value={invSkuTiendaFilters.salud}
                onChange={e => setInvSkuTiendaFilters(p => ({ ...p, salud: e.target.value }))}
                className="border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400">
                <option value="">Todas</option>
                {['CRÍTICO', 'ATENCIÓN', 'SALUDABLE', 'COBERTURA ALTA', 'SOBRESTOCK', 'SIN VPD'].map(s => <option key={s}>{s}</option>)}
              </select>
              <input value={invSkuTiendaFilters.prod}
                onChange={e => setInvSkuTiendaFilters(p => ({ ...p, prod: e.target.value }))}
                placeholder="Producto / SKU…"
                className="border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400 w-44" />
              <button onClick={loadSkuTienda}
                className="px-3 py-1.5 bg-[#1b3b5f] text-white rounded-lg font-medium hover:bg-[#0f2a47] transition-colors">
                {invSkuTiendaLoading ? 'Cargando…' : invSkuTienda ? 'Actualizar' : 'Cargar datos'}
              </button>
              {invSkuTienda && (
                <button onClick={downloadCSV}
                  className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg font-medium hover:bg-gray-50 transition-colors">
                  ⬇ CSV
                </button>
              )}
              {invSkuTienda && <span className="text-gray-400">{invSkuTienda.length.toLocaleString('en-US')} filas</span>}
            </div>

            {invSkuTiendaLoading ? (
              <div className="divide-y divide-gray-50">
                {Array(6).fill(0).map((_, i) => (
                  <div key={i} className="px-4 py-3 flex gap-4 animate-pulse">
                    <div className="h-3 bg-gray-100 rounded flex-1" /><div className="h-3 bg-gray-100 rounded w-16" /><div className="h-3 bg-gray-100 rounded w-12" />
                  </div>
                ))}
              </div>
            ) : invSkuTienda === null ? (
              <div className="px-5 py-10 text-center">
                <p className="text-xs text-gray-300">Presiona "Cargar datos" para ver el detalle por tienda</p>
              </div>
            ) : invSkuTienda.length === 0 ? (
              <p className="text-center text-gray-300 py-12 text-sm">Sin resultados con los filtros aplicados</p>
            ) : (
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-gray-50 text-gray-400 uppercase tracking-widest text-[10px]">
                      <th className="text-left px-4 py-2.5">Producto</th>
                      <th className="text-left px-3 py-2.5">Cat.</th>
                      <th className="text-left px-4 py-2.5">Cadena</th>
                      <th className="text-left px-4 py-2.5">Tienda</th>
                      <th className="text-right px-3 py-2.5">VPD u/d</th>
                      <th className="text-right px-3 py-2.5">Inv u</th>
                      <th className="text-right px-3 py-2.5">DOH</th>
                      <th className="text-center px-3 py-2.5">Salud</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {invSkuTienda.map((r: any, i: number) => {
                      const cfg = SALUD_CFG[r.salud] ?? { color: '#9ca3af', bg: '#f9fafb', label: r.salud }
                      return (
                        <tr key={i} className="hover:bg-gray-50/60">
                          <td className="px-4 py-2 font-medium text-gray-700 max-w-[200px]">
                            <p className="truncate">{r.descripcion}</p>
                            <p className="text-[9px] text-gray-400 font-normal font-mono">{r.sku}</p>
                          </td>
                          <td className="px-3 py-2 text-gray-400 text-[10px]">{r.categoria}</td>
                          <td className="px-4 py-2">
                            <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#1b3b5f]/10 text-[#1b3b5f]">{r.cadena || '—'}</span>
                          </td>
                          <td className="px-4 py-2 text-gray-600 max-w-[140px] truncate">{r.nombre_tienda || r.tienda_nbr}</td>
                          <td className="px-3 py-2 text-right font-mono text-gray-500">{r.venta_dia > 0 ? r.venta_dia.toFixed(1) : '—'}</td>
                          <td className="px-3 py-2 text-right font-mono font-semibold text-gray-700">{r.inv_mano.toLocaleString('en-US')}</td>
                          <td className="px-3 py-2 text-right"><DohChip d={r.doh} /></td>
                          <td className="px-3 py-2 text-center">
                            <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold whitespace-nowrap"
                              style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                              {cfg.label}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>
    )
  }

  // ── Innovaciones ─────────────────────────────────────────────────────────

  function Innovaciones() {
    const L = isL('innovaciones')
    if (L) return <CardSkeleton cols={4} />

    const rows: any[]  = innov?.rows ?? []
    const porCat: Record<string, number> = innov?.por_categoria ?? {}
    const total: number = innov?.total ?? 0

    if (!L && total === 0) return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
        <p className="text-3xl mb-2">🆕</p>
        <p className="text-sm font-semibold text-gray-600">Sin innovaciones en los últimos 3 meses</p>
        <p className="text-xs text-gray-400 mt-1">No hay SKUs con primera venta dentro de los últimos 90 días para {paisNombre}</p>
      </div>
    )

    const CAT_COLORS: Record<string, string> = {
      'Quesos':  '#c8873a',
      'Leches':  '#3a6fa8',
      'Helados': '#2a7a58',
    }

    const diasDesde = (fecha: string) => {
      const d = Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000)
      if (d === 0) return 'hoy'
      if (d === 1) return 'ayer'
      return `hace ${d}d`
    }

    const badgeClass = (fecha: string) => {
      const d = Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000)
      if (d <= 30)  return 'bg-green-100 text-green-700 border-green-200'
      if (d <= 60)  return 'bg-amber-100 text-amber-700 border-amber-200'
      return 'bg-gray-100 text-gray-500 border-gray-200'
    }

    return (
      <div className="space-y-5">

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Nuevos SKUs</p>
            <p className="text-3xl font-bold text-gray-800">{total}</p>
            <p className="text-xs text-gray-400 mt-1">Con primera venta en últimos 3 meses</p>
          </div>
          {Object.entries(porCat).map(([cat, n]) => (
            <div key={cat} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5"
              style={{ borderLeftColor: CAT_COLORS[cat] ?? '#6b7280', borderLeftWidth: 4 }}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">{cat}</p>
              <p className="text-3xl font-bold text-gray-800">{n}</p>
              <p className="text-xs text-gray-400 mt-1">nuevos SKUs</p>
            </div>
          ))}
        </div>

        {/* Detail table */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">SKUs con menos de 3 meses de historia</h3>
            <p className="text-xs text-gray-400">{bandera} {paisNombre} · ordenado por lanzamiento más reciente</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-gray-400 uppercase tracking-widest text-[10px]">
                  <th className="text-left px-4 py-2.5">SKU</th>
                  <th className="text-left px-4 py-2.5">Descripción</th>
                  <th className="text-left px-3 py-2.5">Cat.</th>
                  <th className="text-center px-3 py-2.5">Lanzamiento</th>
                  <th className="text-center px-3 py-2.5">Meses</th>
                  <th className="text-center px-3 py-2.5">Cadenas</th>
                  <th className="text-center px-3 py-2.5">PDVs</th>
                  <th className="text-right px-4 py-2.5">Unidades</th>
                  <th className="text-right px-4 py-2.5">Valor</th>
                  <th className="text-left px-4 py-2.5 min-w-[120px]">Tendencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r, i) => {
                  const maxVal = Math.max(...(r.mensual ?? []).map((m: any) => parseFloat(m.valor) || 0), 1)
                  return (
                    <tr key={i} className="hover:bg-gray-50/60">
                      <td className="px-4 py-2.5 font-mono text-gray-400 text-[11px]">{r.sku}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-700 max-w-[200px] truncate">{r.descripcion}</td>
                      <td className="px-3 py-2.5 text-gray-500">{r.categoria || '—'}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium ${badgeClass(r.primera_venta)}`}>
                          {diasDesde(r.primera_venta)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center text-gray-600 font-semibold">{r.meses_activo}</td>
                      <td className="px-3 py-2.5 text-center text-gray-500">{r.cadenas}</td>
                      <td className="px-3 py-2.5 text-center text-gray-500">{r.puntos_venta}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-700">{r.total_unidades.toLocaleString('en-US')}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-gray-700">{fmtFull(r.total_valor)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-end gap-0.5 h-6">
                          {(r.mensual ?? []).map((m: any, j: number) => {
                            const h = Math.max(Math.round((parseFloat(m.valor) / maxVal) * 20), 2)
                            return (
                              <div key={j} className="relative group flex-1 min-w-[12px]">
                                <div
                                  className="w-full rounded-sm bg-amber-400 hover:bg-amber-500 transition-colors cursor-default"
                                  style={{ height: h }}
                                  title={`${m.mes}: ${fmtFull(parseFloat(m.valor))}`}
                                />
                              </div>
                            )
                          })}
                        </div>
                      </td>
                    </tr>
                  )
                })}
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
      case 'innovaciones':    return (
        <InnovacionesSection
          apiUrl={`/api/comercial/ejecucion/wm/innovaciones?pais=${pais}`}
          titulo={`Walmart ${paisNombre}`}
          subtitulo={`${bandera} Detección automática: SKUs con primera venta en los últimos 180 días.`}
          monedaLabel="USD"
        />
      )
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

      {/* ── Filtros globales (nuevos) ── */}
      <div className="px-6 pt-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4"
             style={{ ['--acc' as any]: '#0071CE', ['--bg' as any]: '#ffffff', ['--surface' as any]: '#ffffff',
                      ['--border' as any]: '#e5e7eb', ['--t1' as any]: '#111827', ['--t2' as any]: '#374151', ['--t3' as any]: '#6b7280' }}>
          <div className="flex items-center flex-wrap gap-3 justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowFiltros(v => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-lg">
                <SlidersHorizontal size={12}/> Filtros {showFiltros ? '▲' : '▼'}
              </button>
              {[
                { label: 'Cadena',       items: cadenasSel, onClear: () => setCadenasSel([]) },
                { label: 'Categoría',    items: categoriaSel, onClear: () => setCategoriaSel([]) },
                { label: 'Subcategoría', items: subcatSel,  onClear: () => setSubcatSel([])  },
                { label: 'Formato',      items: formatoSel, onClear: () => setFormatoSel([]) },
                { label: 'PDV',          items: puntoSel,   onClear: () => setPuntoSel([])   },
                { label: 'SKU',          items: skuSel,     onClear: () => setSkuSel([])     },
              ].filter(c => c.items.length > 0).map(c => (
                <span key={c.label}
                      className="inline-flex items-center gap-1 text-[11px] font-medium bg-blue-50 text-blue-800 border border-blue-200 rounded-full px-2.5 py-1">
                  <span className="text-blue-500">{c.label}:</span>
                  <span>{c.items.length <= 2 ? c.items.join(', ') : `${c.items.length} sel.`}</span>
                  <button onClick={c.onClear} className="ml-0.5 rounded-full hover:bg-blue-100 p-0.5" aria-label={`Limpiar ${c.label}`}>
                    <X size={10}/>
                  </button>
                </span>
              ))}
            </div>
            {(cadenasSel.length + categoriaSel.length + subcatSel.length + formatoSel.length + puntoSel.length + skuSel.length > 0) && (
              <button
                onClick={() => {
                  setCadenasSel([]); setCategoriaSel([]); setSubcatSel([]); setFormatoSel([]); setPuntoSel([]); setSkuSel([])
                }}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 font-medium transition-colors">
                ↺ Reset filtros
              </button>
            )}
          </div>
          {showFiltros && (
            <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <MultiSelect label="Cadena" placeholder="Todas" selectAllLabel="Todas las cadenas"
                value={cadenasSel} onChange={setCadenasSel}
                options={(filtrosOpts?.cadenas ?? []).map(o => ({ value: o.value, label: o.value }))} />
              <MultiSelect label="Categoría" placeholder="Todas" selectAllLabel="Todas las categorías"
                value={categoriaSel} onChange={setCategoriaSel}
                options={(filtrosOpts?.categorias ?? []).map(o => ({ value: o.value, label: o.value }))} />
              <MultiSelect label="Subcategoría" placeholder="Todas" selectAllLabel="Todas las subcategorías"
                value={subcatSel} onChange={setSubcatSel}
                options={(filtrosOpts?.subcategorias ?? []).map(o => ({ value: o.value, label: o.value }))} />
              <MultiSelect label="Formato" placeholder="Todos" selectAllLabel="Todos los formatos"
                value={formatoSel} onChange={setFormatoSel}
                options={(filtrosOpts?.formatos ?? []).map(o => ({ value: o.value, label: o.value }))} />
              <MultiSelect label="Punto de Venta" placeholder="Todos" selectAllLabel="Todos los PDVs"
                value={puntoSel} onChange={setPuntoSel}
                options={(filtrosOpts?.puntos ?? [])
                  .filter(o => cadenasSel.length === 0 || (o.cadena && cadenasSel.includes(o.cadena)))
                  .map(o => ({ value: o.value, label: o.value }))} />
              <MultiSelect label="SKU / Producto" placeholder="Todos" selectAllLabel="Todos los SKUs"
                value={skuSel} onChange={setSkuSel}
                options={(filtrosOpts?.skus ?? [])
                  .filter(o => subcatSel.length === 0 || (o.subcategoria && subcatSel.includes(o.subcategoria)))
                  .map(o => ({ value: o.value, label: o.descripcion ? `${o.value} · ${o.descripcion.slice(0, 32)}` : o.value }))} />
            </div>
          )}
        </div>
      </div>

      {/* ── Controles específicos de Evolución (Vista/Medida/SKUs/Período) ── */}
      {section === 'evolucion' && (
      <div className="px-6 pt-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-start gap-x-4 gap-y-3 flex-wrap text-xs">

            {/* Vista */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-gray-400">Vista</span>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                {(['mensual', 'diaria'] as const).map(v => (
                  <button key={v} onClick={() => { setEvolVista(v); saveFilter('vista', v) }}
                    className={`px-3 py-1.5 font-medium transition-colors ${evolVista === v ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Medida */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-gray-400">Medida</span>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                {([['valor', 'Valor $'], ['unidades', 'Unidades']] as const).map(([k, l]) => (
                  <button key={k} onClick={() => { setEvolMedida(k); saveFilter('medida', k) }}
                    className={`px-3 py-1.5 font-medium transition-colors ${evolMedida === k ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* SKUs */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-gray-400">SKUs</span>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                <button onClick={() => { setEvolTopN(5); setEvolSkuFilter(''); saveFilter('topn', '5') }}
                  className={`px-3 py-1.5 font-medium transition-colors ${evolTopN === 5 ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  Top 5
                </button>
                <button onClick={() => { setEvolTopN(100); setEvolSkuFilter(''); saveFilter('topn', '100') }}
                  className={`px-3 py-1.5 font-medium transition-colors ${evolTopN !== 5 ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  Todos
                </button>
              </div>
            </div>

            {/* Período */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-gray-400">Período</span>
              <div className="flex items-center gap-2">
                <input type="month" value={evolDesde} min="2024-01" max="2026-12"
                  onChange={e => { setEvolDesde(e.target.value); saveFilter('desde', e.target.value) }}
                  className="border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400 text-xs"
                />
                <span className="text-gray-400">–</span>
                <input type="month" value={evolHasta} min="2024-01" max="2026-12"
                  onChange={e => { setEvolHasta(e.target.value); saveFilter('hasta', e.target.value) }}
                  className="border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400 text-xs"
                />
              </div>
            </div>

            {/* Reset */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-gray-400 invisible">x</span>
              <button
                onClick={() => {
                  setDiv('TOTAL'); setEvolVista('mensual'); setEvolMedida('valor')
                  setEvolSubcat(''); setEvolTopN(5)
                  setEvolDesde(''); setEvolHasta('')
                  setEvolYearFilter(''); setEvolCadenaLine(''); setEvolCpFilter(''); setEvolSkuFilter('')
                  ;['div','vista','medida','subcat','topn','desde','hasta'].forEach(k => localStorage.removeItem(`${storageKey}-${k}`))
                }}
                className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 font-medium transition-colors">
                ↺ Reset
              </button>
            </div>

          </div>
        </div>
      </div>
      )}

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
