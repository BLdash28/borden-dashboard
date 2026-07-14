'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw, TrendingUp, TrendingDown, Minus, Download, SlidersHorizontal, X } from 'lucide-react'
import MultiSelect from '@/components/dashboard/MultiSelect'
import { useTableSort, SortableTh } from '@/components/ui/table-sort'
import {
  TendenciaMensualChart, TendenciaDiariaChart, MetricaTogglePill,
  type TendMetrica, type TendData as TendDataShared,
} from '@/components/ui/tendencia-chart'
import {
  BarChart, Bar, LineChart, Line, ComposedChart, AreaChart, Area,
  PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, LabelList,
  ResponsiveContainer, Legend, Cell,
} from 'recharts'

// ── Config ────────────────────────────────────────────────────────────────

const DIVS = [
  { key: 'TOTAL',  label: 'Total',     cat: '' },
  { key: 'QUESO',  label: '🧀 Queso', cat: 'Quesos' },
]

const SECTIONS = [
  { key: 'resumen',          label: 'Resumen'             },
  { key: 'sellin',           label: 'Sell-In'             },
  { key: 'evolucion',        label: 'Evolución Ventas'    },
  { key: 'pareto',           label: 'Pareto'              },
  { key: 'devoluciones',     label: 'Devoluciones'        },
  { key: 'cobertura',        label: 'Cobertura'           },
  { key: 'inventarios',      label: 'Inventarios'         },
  { key: 'calidad',          label: 'Calidad Inventario'  },
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
  // Notación colombiana: MM = mil millones (10^9)
  if (Math.abs(v) >= 1e9) return '$' + (v / 1e9).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MM'
  if (Math.abs(v) >= 1e6) return '$' + (v / 1e6).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'M'
  if (Math.abs(v) >= 1e3) return '$' + (v / 1e3).toLocaleString('es-CO', { maximumFractionDigits: 0 }) + 'K'
  return '$' + Math.round(v).toLocaleString('es-CO')
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
  ytd_2026:     number
  ytd_2026_cop: number
  uni_2026:     number
  ytd_2025:     number
  ytd_2025_cop: number
  uni_2025:     number
  delta_ytd:    number | null
  ultimo_mes:   number
  ultimo_mes_nombre: string
  ultima_fecha: string | null
  por_cadena:  { cadena: string; valor_2026: number; valor_2026_cop: number; uni_2026: number; valor_2025: number; valor_2025_cop: number; delta: number | null }[]
  por_categoria: { categoria: string; valor_2026: number; valor_2026_cop: number; uni_2026: number }[]
  monthly:     {
    mes: number; mes_nombre: string
    y2025: number; y2026: number | null
    cop2025: number; cop2026: number | null
    uds2025: number; uds2026: number | null
    devol_uds_2025?: number; devol_uds_2026?: number | null
    devol_cop_2025?: number; devol_cop_2026?: number | null
  }[]
}

type TopSku = {
  sku: string
  descripcion: string
  categoria: string
  valor_2026: number
  valor_2026_cop: number
  uni_2026: number
  valor_2025: number
  valor_2025_cop: number
  delta: number | null
  share_pct: number
  cum_share: number
}

type SegRow = {
  key: string; label: string; plucd?: string; sku?: string; cadena?: string; pdvs?: number
  meses: Record<number, number>
  mesesUsd: Record<number, number>
  mesesUnd: Record<number, number>
  ytdCop: number; ytdUsd: number; ytdUnd: number
  rrUnd: number; rrCop: number; rrUsd: number
  undActual: number; copActual: number; usdActual: number
  proyUnd: number; proyCop: number; proyUsd: number
}
type SegData = {
  ano: number
  ultimo_mes: number; ultimo_mes_label: string
  ultimo_dia: number; dias_mes: number
  ultima_fecha: string | null
  por_producto: SegRow[]
  por_cadena: SegRow[]
  por_subformato: SegRow[]
  por_geografia: SegRow[]
}
type PrecioRow = {
  ean13: string | null
  plu: string | null
  codigo_borden: string | null
  sku: string | null
  descripcion: string | null
  subcategoria: string | null
  gramos: number | null
  // Costo Centurion (importador)
  costo_ant_cop: number | null
  costo_cop: number | null
  // Lista de precios (venta a Grupo Éxito)
  precio_anterior_cop: number | null
  precio_vigente_cop: number | null
  // PVP sugerido al público
  pvp_ant_cop: number | null
  pvp_sugerido_cop: number | null
  fecha_vigencia_desde: string | null
  es_oferta: boolean
  es_innovacion: boolean
}

type InvKpi = {
  combinaciones: number; con_stock: number; quiebres: number
  pdvs: number; skus_unicos: number; cadenas: number
  total_uds: number; total_cop: number; total_usd: number
}
type InvCadena = { cadena: string | null; combinaciones: number; con_stock: number; quiebres: number; pdvs: number; uds: number; cop: number; usd: number }
type InvTopSku = { ean13: string | null; plu: string | null; sku: string | null; descripcion: string | null; categoria: string | null; subcategoria: string | null; pdvs: number; quiebres: number; uds: number; cop: number }
type InvDetalle = { punto_venta: string; cadena: string | null; ean13: string | null; plu: string | null; sku: string | null; descripcion: string | null; inv_unidades: number; inv_valor_cop: number }
type InvData = { fecha: string | null; kpi: InvKpi | null; por_cadena: InvCadena[]; top_skus: InvTopSku[]; detalle: InvDetalle[]; inv_bajo?: InvDetalle[] }

type InnovMonthly = { ano: number; mes: number; uds: number; cop: number; usd: number; pdvs: number; cadenas: number }
type InnovDaily   = { fecha: string; uds: number; cop: number; usd: number; pdvs: number }

type SellInKpi = {
  ultimo_mes: number
  uds_26: number; cop_26: number; usd_26: number; costo_26: number; ut_26: number
  margen_pct: number | null
  uds_25: number; cop_25: number; usd_25: number; ut_25: number
  margen_pct_25: number | null
  delta_venta: number | null
  delta_unidades: number | null
  delta_utilidad: number | null
}
type SellInMonth = {
  mes: number; mes_nombre: string
  cop_25: number; cop_26: number | null
  uds_25: number; uds_26: number | null
  ut_25: number;  ut_26: number | null
}
type SellInSku = {
  sku: string; descripcion: string | null; categoria: string | null; subcategoria: string | null
  uds: number; cop: number; usd: number; ut: number
  margen_pct: number | null
}
type SellInOc = {
  orden_compra: string; ano: number; mes: number
  n_lineas: number; uds: number; cop: number; ut: number
}
type SellInSkuMonthly = { sku: string; descripcion: string | null; months: Record<number, { uds: number; cop: number; usd: number }> }
type SellInData = { kpi: SellInKpi; monthly: SellInMonth[]; top_skus: SellInSku[]; ocs: SellInOc[]; monthly_by_sku: SellInSkuMonthly[] }

// Pareto PDVs
type ParetoPdv = {
  punto_venta: string
  cadena: string | null
  subcadena: string | null
  departamento: string | null
  ciudad: string | null
  valor_usd: number
  valor_cop: number
  uds: number
  share_pct: number
  cum_share: number
}
type ParetoPdvBucket = { pdvs: number; pct_pdvs: number; cop: number; usd: number }
type ParetoPdvData = {
  total_pdvs: number
  total_valor_usd: number
  total_valor_cop: number
  buckets: { p50: ParetoPdvBucket; p80: ParetoPdvBucket; p95: ParetoPdvBucket }
  rows: ParetoPdv[]
}

// Calidad de Inventario
type CalidadRow = {
  sku: string; descripcion: string | null; categoria: string | null; subcategoria: string | null
  menos_de_3: number; entre_3_y_10: number; mayor_a_10: number; total_pdvs: number
  pct_menos_de_3: number; pct_entre_3_y_10: number; pct_mayor_a_10: number
  cobertura_pct: number
  unidades: number; valor_cop: number; valor_usd: number
}
type CalidadData = {
  fecha: string | null
  universo_pdvs: number
  pdvs_con_stock: number
  cobertura_efectiva: number
  rows: CalidadRow[]
  total: {
    menos_de_3: number; entre_3_y_10: number; mayor_a_10: number; total_pdvs: number
    pct_menos_de_3: number; pct_entre_3_y_10: number; pct_mayor_a_10: number
    cobertura_pct: number
    unidades: number; valor_cop: number; valor_usd: number
  }
  cadenas: { cadena: string; pdvs: number }[]
}
type InnovItem = {
  ean13: string | null
  plu: string | null
  codigo_borden: string | null
  sku: string | null
  descripcion: string | null
  gramos: number | null
  precio_anterior_cop: number | null
  precio_vigente_cop: number | null
  fecha_vigencia_desde: string | null
  sin_ventas: boolean
  primera_venta: string | null
  ultima_venta: string | null
  total_uds: number
  total_cop: number
  total_usd: number
  pdvs_unicos: number
  cadenas_unicas: number
  monthly: InnovMonthly[]
  daily: InnovDaily[]
}

// ── Componente ────────────────────────────────────────────────────────────

export default function ExitoEjecucion() {
  const storageKey = 'exito-co'

  const [section,      setSection]      = useState('resumen')
  const [div,          setDiv]          = useState('TOTAL')
  // Filtros globales (multi-select)
  const [cadenasSel,    setCadenasSel]    = useState<string[]>([])
  const [subcatSel,     setSubcatSel]     = useState<string[]>([])
  const [deptoSel,      setDeptoSel]      = useState<string[]>([])
  const [ciudadSel,     setCiudadSel]     = useState<string[]>([])
  const [skuSel,        setSkuSel]        = useState<string[]>([])
  const [filtrosOpts,   setFiltrosOpts]   = useState<{
    cadenas:       { value: string; venta: number }[]
    subcategorias: { value: string; venta: number }[]
    departamentos: { value: string; venta: number }[]
    ciudades:      { value: string; departamento: string | null; venta: number }[]
    skus:          { value: string; descripcion: string | null; subcategoria: string | null; venta: number }[]
  } | null>(null)
  const [showFiltros,   setShowFiltros]   = useState(false)
  // Persiste el toggle Filtros abierto/cerrado
  useEffect(() => {
    const saved = localStorage.getItem(`${storageKey}-showFiltros`)
    if (saved === '1') setShowFiltros(true)
  }, []) // eslint-disable-line
  useEffect(() => {
    localStorage.setItem(`${storageKey}-showFiltros`, showFiltros ? '1' : '0')
  }, [showFiltros])

  // Compat: cadenaFilter legacy = primer item si hay UNA sola cadena seleccionada
  const cadenaFilter = cadenasSel.length === 1 ? cadenasSel[0] : ''

  const [moneda,       setMoneda]       = useState<'cop' | 'usd'>('cop')
  const [topN,         setTopN]         = useState(13)
  const [loading,      setLoading]      = useState<Record<string, boolean>>({})
  // Comparativo Pareto: dos SKUs a comparar lado a lado
  const [compSku1, setCompSku1] = useState<string>('')
  const [compSku2, setCompSku2] = useState<string>('')
  const [compVista, setCompVista] = useState<'mensual' | 'diaria'>('mensual')
  type DailyRow = { fecha: string; dia_str: string; mes: number; dia: number; valor_usd: number; valor_cop: number; unidades: number }
  const [compDaily1, setCompDaily1] = useState<DailyRow[]>([])
  const [compDaily2, setCompDaily2] = useState<DailyRow[]>([])
  const [compDailyLoading, setCompDailyLoading] = useState(false)

  // Ventas mensuales: tendencia continua (jun-25 → jul-26) + toggle metrica multi-select
  const [tendencia, setTendencia] = useState<TendDataShared | null>(null)
  const [tendMetricas, setTendMetricas] = useState<TendMetrica[]>(['valor'])
  const toggleTendMetrica = (m: TendMetrica) => {
    setTendMetricas(prev => {
      const has = prev.includes(m)
      if (has && prev.length === 1) return prev // no dejar array vacío
      return has ? prev.filter(x => x !== m) : [...prev, m]
    })
  }

  // Data
  const [kpis,    setKpis]    = useState<KpisData | null>(null)
  const [topSkus, setTopSkus] = useState<TopSku[]>([])
  const [seg,     setSeg]     = useState<SegData | null>(null)
  const [segTab,  setSegTab]  = useState<'producto' | 'cadena' | 'subformato' | 'geografia' | 'devoluciones'>('producto')
  const [segMode, setSegMode] = useState<'cop' | 'usd' | 'und'>('cop')
  const [devTabla, setDevTabla] = useState<{ ano: number; ultimo_mes: number; ultima_fecha: string | null; ultimo_dia: number; dias_mes: number; por_producto: SegRow[] } | null>(null)
  const [precios,       setPrecios]       = useState<PrecioRow[] | null>(null)
  const [preciosCarga,  setPreciosCarga]  = useState<string | null>(null)
  const [innov,         setInnov]         = useState<InnovItem[] | null>(null)
  const [inv,           setInv]           = useState<InvData | null>(null)
  const [sellin,        setSellin]        = useState<SellInData | null>(null)
  const [calidad,       setCalidad]       = useState<CalidadData | null>(null)
  // Toggle Vista para chart Ventas mensuales
  const [ventasVista,   setVentasVista]   = useState<'mensual' | 'diaria'>('mensual')
  const [ventasDiaria,  setVentasDiaria]  = useState<{ dia_str: string; mes: number; dia: number; valor_usd: number; valor_cop: number; unidades: number }[]>([])
  const [ventasDiariaPorSku, setVentasDiariaPorSku] = useState<{ sku: string; descripcion: string | null; points: { fecha: string; dia_str: string; valor_usd: number; valor_cop: number; unidades: number }[] }[]>([])
  const [ventasDiariaLoading, setVentasDiariaLoading] = useState(false)
  // Sort para tabla Top SKUs Inventarios
  const [calidadDetalle, setCalidadDetalle] = useState<{
    sku: string
    descripcion: string | null
    bucket: 'menos_de_3' | 'entre_3_y_10' | 'mayor_a_10' | 'todos'
    loading: boolean
    pdvs: {
      gln: string; punto_venta: string; cadena: string | null; subcadena: string | null
      departamento: string | null; ciudad: string | null; descripcion: string | null
      inv_unidades: number; inv_valor_cop: number; inv_valor_usd: number
    }[]
  } | null>(null)

  const loadedRef = useRef<Record<string, boolean>>({})
  const setL = (k: string, v: boolean) => setLoading(p => ({ ...p, [k]: v }))
  const isL  = (k: string) => !!loading[k]
  const saveFilter = (key: string, val: string) => localStorage.setItem(`${storageKey}-${key}`, val)

  // Serializa los filtros activos en un querystring reusable
  const buildFilterQS = (extra?: Record<string, string>) => {
    const q = new URLSearchParams()
    if (cadenasSel.length) q.set('cadenas',       cadenasSel.join(','))
    if (subcatSel.length)  q.set('subcategorias', subcatSel.join(','))
    if (deptoSel.length)   q.set('departamentos', deptoSel.join(','))
    if (ciudadSel.length)  q.set('ciudades',      ciudadSel.join(','))
    if (skuSel.length)     q.set('skus',          skuSel.join(','))
    if (extra) for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v)
    return q.toString()
  }

  // Clave de invalidación de caché en loadedRef — cambia con los filtros
  const filterKey = useMemo(() =>
    [cadenasSel, subcatSel, deptoSel, ciudadSel, skuSel]
      .map(a => a.join('|')).join('::'),
    [cadenasSel, subcatSel, deptoSel, ciudadSel, skuSel])

  // Reset del ref cuando cambian los filtros
  useEffect(() => { loadedRef.current = {} }, [filterKey])

  // Drill-down PDVs — se usa en Calidad Inventario e Inventarios (Top SKUs).
  const openDetallePDVs = (sku: string, descripcion: string | null, bucket: 'menos_de_3' | 'entre_3_y_10' | 'mayor_a_10' | 'todos' = 'todos') => {
    setCalidadDetalle({ sku, descripcion, bucket, loading: true, pdvs: [] })
    const qs = buildFilterQS({ sku, bucket })
    fetch(`/api/comercial/ejecucion/co/exito/calidad-inventario/pdvs?${qs}`)
      .then(r => r.json())
      .then(d => setCalidadDetalle(prev => prev ? { ...prev, loading: false, pdvs: d.pdvs ?? [] } : null))
      .catch(() => setCalidadDetalle(prev => prev ? { ...prev, loading: false } : null))
  }

  // Drill-down por Cadena — muestra todos los PDVs de una cadena con sus totales
  const openDetalleCadena = (cadena: string) => {
    setCalidadDetalle({ sku: `Cadena: ${cadena}`, descripcion: `Todos los PDVs · ${cadena}`, bucket: 'todos', loading: true, pdvs: [] })
    const q = new URLSearchParams()
    q.set('cadenas', cadena)
    fetch(`/api/comercial/ejecucion/co/exito/calidad-inventario/pdvs?${q}`)
      .then(r => r.json())
      .then(d => setCalidadDetalle(prev => prev ? { ...prev, loading: false, pdvs: d.pdvs ?? [] } : null))
      .catch(() => setCalidadDetalle(prev => prev ? { ...prev, loading: false } : null))
  }

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
    const savedMon = localStorage.getItem(`${storageKey}-moneda`)
    if (savedMon === 'cop' || savedMon === 'usd') setMoneda(savedMon)
    // Restaurar filtros multi-select
    const readArr = (k: string): string[] => {
      const raw = localStorage.getItem(`${storageKey}-${k}`)
      if (!raw) return []
      try { const v = JSON.parse(raw); return Array.isArray(v) ? v : [] } catch { return [] }
    }
    setCadenasSel(readArr('cadenas'))
    setSubcatSel(readArr('subcategorias'))
    setDeptoSel(readArr('departamentos'))
    setCiudadSel(readArr('ciudades'))
    setSkuSel(readArr('skus'))
  }, []) // eslint-disable-line

  // Persistir filtros en localStorage
  useEffect(() => {
    localStorage.setItem(`${storageKey}-cadenas`,       JSON.stringify(cadenasSel))
    localStorage.setItem(`${storageKey}-subcategorias`, JSON.stringify(subcatSel))
    localStorage.setItem(`${storageKey}-departamentos`, JSON.stringify(deptoSel))
    localStorage.setItem(`${storageKey}-ciudades`,      JSON.stringify(ciudadSel))
    localStorage.setItem(`${storageKey}-skus`,          JSON.stringify(skuSel))
  }, [cadenasSel, subcatSel, deptoSel, ciudadSel, skuSel])

  // Cargar catálogo de opciones (una vez)
  useEffect(() => {
    fetch('/api/comercial/ejecucion/co/exito/filtros-opciones')
      .then(r => r.json())
      .then(d => setFiltrosOpts({
        cadenas:       d.cadenas       ?? [],
        subcategorias: d.subcategorias ?? [],
        departamentos: d.departamentos ?? [],
        ciudades:      d.ciudades      ?? [],
        skus:          d.skus          ?? [],
      }))
      .catch(() => {})
  }, [])

  // Fetch por sección — refetch cada vez que cambia section, div, filtros o topN
  useEffect(() => {
    const extraCat: Record<string, string> = currentCat ? { categoria: currentCat } : {}
    const qs = buildFilterQS(extraCat)

    if (section === 'resumen' || section === 'evolucion') {
      setL('kpis', true)
      fetch(`/api/comercial/ejecucion/co/exito/kpis?${qs}`)
        .then(r => r.json()).then(setKpis).finally(() => setL('kpis', false))
    }

    if (section === 'pareto') {
      setL('pareto', true)
      const qsp = buildFilterQS({ ...extraCat, top: String(topN) })
      fetch(`/api/comercial/ejecucion/co/exito/top-skus?${qsp}`)
        .then(r => r.json()).then(d => setTopSkus(d.rows ?? []))
        .finally(() => setL('pareto', false))
    }

    if ((section === 'seguimiento' || section === 'evolucion' || section === 'pareto') && !loadedRef.current.seg) {
      loadedRef.current.seg = true
      setL('seg', true)
      const qsg = buildFilterQS({ ano: '2026' })
      fetch(`/api/comercial/ejecucion/co/exito/seguimiento?${qsg}`)
        .then(r => r.json()).then(setSeg).finally(() => setL('seg', false))
    }

    if ((section === 'evolucion' || section === 'devoluciones') && !loadedRef.current.devTabla) {
      loadedRef.current.devTabla = true
      fetch(`/api/comercial/ejecucion/co/exito/devoluciones-tabla?${qs}`)
        .then(r => r.json()).then(setDevTabla).catch(() => {})
    }

    // (Los fetchs de daily y compDaily se movieron a effects dedicados abajo
    //  para que cambiar el toggle Mensual/Diaria no re-dispare kpis/pareto/etc.)

    // Tendencia mensual continua (jun-25 → jul-26) — sección Evolución Ventas
    if (section === 'evolucion' && !loadedRef.current.tendencia) {
      loadedRef.current.tendencia = true
      fetch(`/api/comercial/ejecucion/co/exito/tendencia-mensual?${qs}`)
        .then(r => r.json())
        .then(setTendencia)
        .catch(() => {})
    }


    // Sell-In también sirve como referencia para calcular % devol vs venta
    if (section === 'devoluciones' && !loadedRef.current.sellin) {
      loadedRef.current.sellin = true
      setL('sellin', true)
      fetch(`/api/comercial/ejecucion/co/exito/sellin?${qs}`)
        .then(r => r.json()).then(setSellin)
        .finally(() => setL('sellin', false))
    }

    if (section === 'precios' && !loadedRef.current.precios) {
      loadedRef.current.precios = true
      setL('precios', true)
      fetch(`/api/comercial/ejecucion/co/exito/precios?${qs}`)
        .then(r => r.json())
        .then(d => { setPrecios(d.filas ?? []); setPreciosCarga(d.ultima_carga ?? null) })
        .finally(() => setL('precios', false))
    }

    if (section === 'innovaciones' && !loadedRef.current.innov) {
      loadedRef.current.innov = true
      setL('innov', true)
      fetch(`/api/comercial/ejecucion/co/exito/innovaciones?${qs}`)
        .then(r => r.json())
        .then(d => setInnov(d.items ?? []))
        .finally(() => setL('innov', false))
    }

    if ((section === 'inventarios' || section === 'cobertura') && !loadedRef.current.inv) {
      loadedRef.current.inv = true
      setL('inv', true)
      fetch(`/api/comercial/ejecucion/co/exito/inventario?${qs}`)
        .then(r => r.json()).then(setInv)
        .finally(() => setL('inv', false))
    }

    // SellIn: precargar también en Resumen para mostrar sus KPIs
    if ((section === 'sellin' || section === 'resumen') && !loadedRef.current.sellin) {
      loadedRef.current.sellin = true
      setL('sellin', true)
      fetch(`/api/comercial/ejecucion/co/exito/sellin?${qs}`)
        .then(r => r.json()).then(setSellin)
        .finally(() => setL('sellin', false))
    }

    // Calidad Inventario
    if (section === 'calidad' && !loadedRef.current.calidad) {
      loadedRef.current.calidad = true
      setL('calidad', true)
      fetch(`/api/comercial/ejecucion/co/exito/calidad-inventario?${qs}`)
        .then(r => r.json()).then(setCalidad)
        .finally(() => setL('calidad', false))
    }
  }, [section, div, filterKey, topN]) // eslint-disable-line

  // Reset diaria al cambiar filtros globales para forzar refetch
  useEffect(() => { setVentasDiaria([]); setVentasDiariaPorSku([]); setTendencia(null); loadedRef.current.tendencia = false }, [filterKey])

  // Reset diaria comparativo al cambiar SKUs o filtros
  useEffect(() => { setCompDaily1([]); setCompDaily2([]) }, [compSku1, compSku2, filterKey])

  // Effect dedicado: fetch de la serie diaria (Ventas mensuales) cuando el toggle
  // cambia a "diaria" — aislado del resto para no re-disparar kpis/pareto/etc.
  useEffect(() => {
    if (section !== 'evolucion') return
    if (ventasVista !== 'diaria') return
    if (ventasDiaria.length > 0 || ventasDiariaLoading) return
    setVentasDiariaLoading(true)
    const extraCat: Record<string, string> = currentCat ? { categoria: currentCat } : {}
    const qs = buildFilterQS(extraCat)
    fetch(`/api/comercial/ejecucion/co/exito/daily?${qs}`)
      .then(r => r.json())
      .then(d => { setVentasDiaria(d.rows ?? []); setVentasDiariaPorSku(d.por_sku ?? []) })
      .catch(() => { setVentasDiaria([]); setVentasDiariaPorSku([]) })
      .finally(() => setVentasDiariaLoading(false))
  }, [section, ventasVista, filterKey, currentCat]) // eslint-disable-line

  // Effect dedicado: fetch de la serie diaria por SKU (Comparativo Pareto)
  useEffect(() => {
    if (section !== 'pareto') return
    if (compVista !== 'diaria') return
    if (!compSku1 || !compSku2) return
    if (compDaily1.length > 0 || compDailyLoading) return
    setCompDailyLoading(true)
    const extraCat: Record<string, string> = currentCat ? { categoria: currentCat } : {}
    const qsBase = buildFilterQS(extraCat)
    const buildQs = (sku: string) => {
      const q = new URLSearchParams(qsBase)
      q.set('skus', sku)
      return q.toString()
    }
    Promise.all([
      fetch(`/api/comercial/ejecucion/co/exito/daily?${buildQs(compSku1)}`).then(r => r.json()).catch(() => ({ rows: [] })),
      fetch(`/api/comercial/ejecucion/co/exito/daily?${buildQs(compSku2)}`).then(r => r.json()).catch(() => ({ rows: [] })),
    ])
      .then(([a, b]) => { setCompDaily1(a.rows ?? []); setCompDaily2(b.rows ?? []) })
      .finally(() => setCompDailyLoading(false))
  }, [section, compVista, compSku1, compSku2, filterKey, currentCat]) // eslint-disable-line

  // Cargar KPIs al primer mount (usa filtros si ya estaban guardados)
  useEffect(() => {
    if (!kpis) {
      setL('kpis', true)
      fetch(`/api/comercial/ejecucion/co/exito/kpis?${buildFilterQS()}`)
        .then(r => r.json()).then(setKpis).finally(() => setL('kpis', false))
    }
  }, []) // eslint-disable-line

  // ── Resumen ──────────────────────────────────────────────────────────────

  function Resumen() {
    const L = isL('kpis')
    if (L || !kpis) return <div className="space-y-4"><CardSkeleton cols={4} /><ChartSkeleton /></div>

    const isCop = moneda === 'cop'
    const fmtVal = (v: number) => isCop ? fmtCOP(v) : fmtFull(v)
    const yTick  = (v: any)    => isCop ? fmtCOP(Number(v)) : fmt$(v)
    // Formatos compactos para labels arriba de las barras
    const fmtBarLbl = (v: any) => {
      const n = Number(v); if (!isFinite(n) || n === 0) return ''
      if (isCop) {
        if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(1) + ' MM'
        if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(0) + 'M'
        if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K'
        return '$' + Math.round(n)
      }
      if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M'
      if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K'
      return '$' + Math.round(n)
    }
    const fmtUdsLbl = (v: any) => {
      const n = Number(v); if (!isFinite(n) || n === 0) return ''
      if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
      if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K'
      return String(Math.round(n))
    }

    const soTotal  = isCop ? kpis.ytd_2026_cop : kpis.ytd_2026
    const soPrev   = isCop ? kpis.ytd_2025_cop : kpis.ytd_2025
    const soUnits  = kpis.uni_2026
    const soDelta  = kpis.delta_ytd
    const soLast   = kpis.ultimo_mes_nombre || '—'
    const soAvg    = kpis.ultimo_mes > 0 ? soTotal / kpis.ultimo_mes : 0
    const cadenasR = kpis.por_cadena
    const cats     = kpis.por_categoria
    const monthlyRaw = kpis.monthly
    const monthly    = monthlyRaw.map(m => ({
      ...m,
      v2025: isCop ? (m.cop2025 > 0 ? m.cop2025 : null) : (m.y2025 > 0 ? m.y2025 : null),
      v2026: isCop ? m.cop2026 : m.y2026,
    }))
    const valCadena  = (v_usd: number, v_cop: number) => isCop ? v_cop : v_usd

    const pdfUrl = `/api/comercial/ejecucion/co/exito/resumen-pdf?${buildFilterQS({ moneda })}`

    return (
      <div className="space-y-5">

        {/* Descargar PDF — botón arriba del todo */}
        <div className="flex items-center justify-end">
          <a href={pdfUrl}
             className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-lg transition-colors shadow-sm">
            <Download size={12}/> Descargar PDF
          </a>
        </div>

        {/* Sell-In KPIs (primero) */}
        {sellin && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Sell-In</p>
              <button
                onClick={() => goSection('sellin')}
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-800"
              >
                Ver detalle Sell-In →
              </button>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {(() => {
                const k = sellin.kpi
                const isUsd = moneda === 'usd'
                const cur = isUsd ? k.usd_26 : k.cop_26
                const curFmt = isUsd ? fmtFull(cur) : fmtCOP(cur)
                const rate = k.cop_26 > 0 && k.usd_26 > 0 ? k.usd_26 / k.cop_26 : 0
                const utCur = isUsd ? k.ut_26 * rate : k.ut_26
                const utFmt = isUsd ? fmtFull(utCur) : fmtCOP(utCur)
                const cLbl = moneda.toUpperCase()
                return [
                  { label: `Sell-In YTD 2026 (${cLbl})`, value: curFmt, sub: `hasta mes ${k.ultimo_mes || '—'}`, icon: '🧾' },
                  { label: 'Unidades Sell-In',     value: fmtNum(k.uds_26), sub: `${fmtNum(k.uds_25)} en 2025`, icon: '📦' },
                  { label: `Utilidad Bruta (${cLbl})`, value: utFmt, sub: k.margen_pct !== null ? `Margen ${k.margen_pct.toFixed(1)}%` : '—', icon: '💰' },
                  { label: 'Margen Bruto %',       value: k.margen_pct !== null ? `${k.margen_pct.toFixed(1)}%` : '—', sub: k.margen_pct_25 !== null ? `2025: ${k.margen_pct_25.toFixed(1)}%` : 'Sin dato 2025', icon: '📈' },
                ]
              })().map(c => (
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
        )}

        {/* Sell-Out KPIs (después de Sell-In) */}
        <div>
          <div className="mb-2">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Sell-Out</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: `Sell-Out YTD 2026 (${moneda.toUpperCase()})`, value: fmtVal(soTotal), sub: `hasta ${soLast}`, icon: '🛒' },
              { label: 'vs YTD 2025',       value: soDelta !== null ? <Delta d={soDelta} /> : <span className="text-sm text-gray-400">Sin hist.</span>, sub: soPrev > 0 ? `2025: ${fmtVal(soPrev)}` : 'Sin dato 2025', icon: '📊' },
              { label: 'Unidades YTD',      value: soUnits.toLocaleString('en-US'), sub: `hasta ${soLast}`, icon: '📦' },
              { label: 'Promedio Mensual',  value: fmtVal(soAvg), sub: `${kpis.ultimo_mes} meses`, icon: '📅' },
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

        {/* Por cadena cards */}
        {cadenasR.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Por Cadena · Sell-Out YTD 2026 ({moneda.toUpperCase()})</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {cadenasR.map(c => {
                const cVal  = valCadena(c.valor_2026, c.valor_2026_cop)
                const pct   = soTotal > 0 ? (cVal / soTotal * 100) : 0
                const color = CADENA_COLORS[c.cadena] ?? '#6b7280'
                return (
                  <div key={c.cadena} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                      <p className="text-xs font-semibold text-gray-600 truncate">{c.cadena}</p>
                    </div>
                    <p className="text-xl font-bold text-gray-800">{fmtVal(cVal)}</p>
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

        {/* Evolución Sell-Out — barras */}
        {monthly.length > 0 && (() => {
          // Redondear al siguiente múltiplo "bonito" (paso = magnitud/2).
          // Ej: max=434M → magnitud=100M, paso=50M, ceil = 450M
          const niceMax = (v: number): number | undefined => {
            if (v <= 0) return undefined
            const mag  = Math.pow(10, Math.floor(Math.log10(v)))
            const step = mag / 2
            return Math.ceil(v / step) * step
          }
          const maxEvol = Math.max(
            ...monthly.map(m => Math.max(m.v2025 ?? 0, m.v2026 ?? 0)),
            0,
          )
          const evolMax = niceMax(maxEvol)
          return (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h3 className="text-sm font-bold text-gray-800">Evolución Sell-Out</h3>
                <p className="text-[11px] text-gray-400">2025 · 2026 ({moneda.toUpperCase()})</p>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-slate-400"/> 2025</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500"/> 2026</span>
              </div>
            </div>
            <div className="h-[240px] mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barCategoryGap="25%">
                  <defs>
                    <linearGradient id="gradBar2025" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.9}/>
                      <stop offset="100%" stopColor="#cbd5e1" stopOpacity={0.75}/>
                    </linearGradient>
                    <linearGradient id="gradBar2026" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={1}/>
                      <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.85}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="mes_nombre" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={yTick} tick={{ fontSize: 11, fill: '#94a3b8' }} width={60} axisLine={false} tickLine={false}
                    domain={evolMax ? [0, evolMax] : [0, 'auto']} />
                  <Tooltip
                    formatter={(v: any, name: string) => [fmtVal(Number(v)), name]}
                    cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                    contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  />
                  <Bar dataKey="v2025" name="2025" fill="url(#gradBar2025)" radius={[8,8,0,0]} maxBarSize={38}>
                    <LabelList dataKey="v2025" position="top" formatter={fmtBarLbl}
                      style={{ fontSize: 9, fill: '#64748b', fontWeight: 600 }} />
                  </Bar>
                  <Bar dataKey="v2026" name="2026" fill="url(#gradBar2026)" radius={[8,8,0,0]} maxBarSize={38}>
                    <LabelList dataKey="v2026" position="top" formatter={fmtBarLbl}
                      style={{ fontSize: 9, fill: '#92400e', fontWeight: 700 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          )
        })()}

        {/* Chart Sell-Out vs Sell-In vs Devoluciones — lineal con gradient */}
        {sellin && monthly.length > 0 && (() => {
          const compare = kpis.monthly.map(m => {
            const si = sellin.monthly.find(x => x.mes === m.mes)
            // Devoluciones: guardadas en kpis.monthly como devol_cop_2026
            const devolCop = (m as any).devol_cop_2026 as number | null
            const devolUsd = devolCop !== null && kpis.ytd_2026_cop > 0
              ? (devolCop / kpis.ytd_2026_cop) * kpis.ytd_2026
              : null
            const sellinVal = isCop ? (si?.cop_26 ?? null) : (si ? (si.cop_26 !== null && sellin.kpi.cop_26 > 0
                        ? ((si.cop_26 as number) / sellin.kpi.cop_26) * sellin.kpi.usd_26
                        : null) : null)
            const devolVal = isCop ? devolCop : devolUsd
            // % Devoluciones sobre Sell-In (las devoluciones vienen del sell-in, no del sell-out)
            const pctDevol = sellinVal && sellinVal > 0 && devolVal !== null
              ? (devolVal / sellinVal) * 100
              : null
            return {
              mes_nombre: m.mes_nombre,
              sellout: isCop ? m.cop2026 : m.y2026,
              sellin: sellinVal,
              devoluciones: devolVal,
              pctDevol,
            }
          }).filter(m => (m.sellout && m.sellout > 0) || (m.sellin && m.sellin > 0) || (m.devoluciones && m.devoluciones > 0))
          // Totales YTD para el subtitle (% devoluciones/sell-in acumulado)
          const totSellin = compare.reduce((s, m) => s + (m.sellin ?? 0), 0)
          const totDevol  = compare.reduce((s, m) => s + (m.devoluciones ?? 0), 0)
          const pctYTD    = totSellin > 0 ? (totDevol / totSellin) * 100 : null
          // Ticks fijos por pedido: 200, 300, 400 y 500 (en la unidad de moneda).
          // En COP asumimos que representan millones (200M, 300M, ..., 500M).
          // En USD son unidades directas (200, 300, ..., 500).
          const factor = isCop ? 1e6 : 1
          const compTicks = [200 * factor, 300 * factor, 400 * factor, 500 * factor]
          const compMax   = 500 * factor
          return (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <h3 className="text-sm font-bold text-gray-800">Sell-Out vs Sell-In vs Devoluciones</h3>
                  <p className="text-[11px] text-gray-400">
                    Comparativo mensual · 2026 ({moneda.toUpperCase()})
                    {pctYTD !== null && (
                      <>
                        <span className="mx-1.5 text-gray-300">·</span>
                        <span className="font-semibold text-red-600">Devol. YTD: {pctYTD.toFixed(1)}% del Sell-In</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"/> Sell-In</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"/> Sell-Out</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500"/> Devoluciones</span>
                </div>
              </div>
              <div className="h-[280px] mt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={compare} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barCategoryGap="20%">
                    <defs>
                      <linearGradient id="gradBarSellin" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="#3b82f6" stopOpacity={1}/>
                        <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.85}/>
                      </linearGradient>
                      <linearGradient id="gradBarSellout" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="#f59e0b" stopOpacity={1}/>
                        <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.85}/>
                      </linearGradient>
                      <linearGradient id="gradBarDevol" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="#ef4444" stopOpacity={1}/>
                        <stop offset="100%" stopColor="#f87171" stopOpacity={0.85}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="mes_nombre" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={yTick} tick={{ fontSize: 11, fill: '#94a3b8' }} width={60} axisLine={false} tickLine={false}
                      domain={[0, compMax]} ticks={compTicks} />
                    <Tooltip
                      cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                      contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                      formatter={(v: any, name: string, item: any) => {
                        if (name === 'Devoluciones') {
                          const pct = item?.payload?.pctDevol as number | null
                          return [
                            `${fmtVal(Number(v))}${pct !== null && pct !== undefined ? ` (${pct.toFixed(1)}% Sell-In)` : ''}`,
                            name,
                          ]
                        }
                        return [fmtVal(Number(v)), name]
                      }}
                    />
                    <Bar dataKey="sellin"       name="Sell-In"      fill="url(#gradBarSellin)"  radius={[8,8,0,0]} maxBarSize={28}>
                      <LabelList dataKey="sellin"       position="top" formatter={fmtBarLbl}
                        style={{ fontSize: 9, fill: '#1e40af', fontWeight: 700 }} />
                    </Bar>
                    <Bar dataKey="sellout"      name="Sell-Out"     fill="url(#gradBarSellout)" radius={[8,8,0,0]} maxBarSize={28}>
                      <LabelList dataKey="sellout"      position="top" formatter={fmtBarLbl}
                        style={{ fontSize: 9, fill: '#92400e', fontWeight: 700 }} />
                    </Bar>
                    <Bar dataKey="devoluciones" name="Devoluciones" fill="url(#gradBarDevol)"   radius={[8,8,0,0]} maxBarSize={28}>
                      <LabelList
                        position="top"
                        content={(props: any) => {
                          const { x, y, width, value, index } = props
                          if (value === null || value === undefined || value === 0) return null
                          const pct = compare[index]?.pctDevol
                          const label = fmtBarLbl(value)
                          const pctTxt = pct !== null && pct !== undefined ? ` (${pct.toFixed(1)}%)` : ''
                          return (
                            <text x={x + width / 2} y={y - 4} textAnchor="middle"
                              style={{ fontSize: 9, fill: '#b91c1c', fontWeight: 700 }}>
                              {label}{pctTxt}
                            </text>
                          )
                        }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )
        })()}

        {/* Chart Valor vs Unidades */}
        {monthly.length > 0 && (() => {
          const valUdsData = kpis.monthly
            .map(m => ({ mes_nombre: m.mes_nombre, valor: isCop ? m.cop2026 : m.y2026, unidades: m.uds2026 }))
            .filter(m => (m.valor && m.valor > 0) || (m.unidades && m.unidades > 0))
          return (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <h3 className="text-sm font-bold text-gray-800">Venta Valor vs Unidades</h3>
                  <p className="text-[11px] text-gray-400">Sell-Out mensual · 2026 ({moneda.toUpperCase()})</p>
                </div>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500"/> Venta ({moneda.toUpperCase()})</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"/> Unidades</span>
                </div>
              </div>
              <div className="h-[260px] mt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={valUdsData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barCategoryGap="25%">
                    <defs>
                      <linearGradient id="gradValor" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity={1}/>
                        <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.85}/>
                      </linearGradient>
                      <linearGradient id="gradUnidades" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={1}/>
                        <stop offset="100%" stopColor="#34d399" stopOpacity={0.85}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="mes_nombre" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="left" tickFormatter={yTick}
                      tick={{ fontSize: 11, fill: '#94a3b8' }} width={60} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="right" orientation="right"
                      tickFormatter={(v: any) => Number(v) >= 1e3 ? (Number(v)/1e3).toFixed(0)+'K' : String(v)}
                      tick={{ fontSize: 11, fill: '#94a3b8' }} width={45} axisLine={false} tickLine={false} />
                    <Tooltip
                      formatter={(v: any, name: string) => name === 'Unidades'
                        ? [Number(v).toLocaleString('es-CO') + ' und', name]
                        : [fmtVal(Number(v)), name]}
                      cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                      contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                    />
                    <Bar yAxisId="left"  dataKey="valor"    name={`Venta (${moneda.toUpperCase()})`}
                      fill="url(#gradValor)"    radius={[8,8,0,0]} maxBarSize={28}>
                      <LabelList dataKey="valor"    position="top" formatter={fmtBarLbl}
                        style={{ fontSize: 9, fill: '#92400e', fontWeight: 700 }} />
                    </Bar>
                    <Bar yAxisId="right" dataKey="unidades" name="Unidades"
                      fill="url(#gradUnidades)" radius={[8,8,0,0]} maxBarSize={28}>
                      <LabelList dataKey="unidades" position="top" formatter={fmtUdsLbl}
                        style={{ fontSize: 9, fill: '#065f46', fontWeight: 700 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )
        })()}

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
    if (L || !kpis) return <div className="space-y-4"><ChartSkeleton /><ChartSkeleton /><ChartSkeleton /></div>

    // Data con 2025 en null si no hay ventas, para no dibujar la línea plana en 0
    const monthly = kpis.monthly.map(m => ({
      ...m,
      cop2025: m.cop2025 > 0 ? m.cop2025 : null,
      uds2025: m.uds2025 > 0 ? m.uds2025 : null,
    }))

    // Acumulado YTD por año
    let ac25 = 0, ac26 = 0
    const acumulado = kpis.monthly.map(m => {
      ac25 += m.cop2025 || 0
      if (m.cop2026 !== null) ac26 += m.cop2026
      return {
        mes_nombre: m.mes_nombre,
        acum2025: ac25 > 0 ? ac25 : null,
        acum2026: m.cop2026 !== null ? ac26 : null,
      }
    })

    // ── Stats detallados ─────────────────────────────────────────────
    const meses2026 = kpis.monthly.filter(m => m.cop2026 !== null && m.cop2026 > 0)
    const totCop2026 = meses2026.reduce((s, m) => s + (m.cop2026 ?? 0), 0)
    const totUds2026 = meses2026.reduce((s, m) => s + (m.uds2026 ?? 0), 0)
    const promMensualCop = meses2026.length > 0 ? totCop2026 / meses2026.length : 0
    const promMensualUds = meses2026.length > 0 ? totUds2026 / meses2026.length : 0
    const DIAS_MES: Record<number, number> = { 1:31,2:28,3:31,4:30,5:31,6:30,7:31,8:31,9:30,10:31,11:30,12:31 }
    const diasAcumulados = meses2026.reduce((s, m) => s + (DIAS_MES[m.mes] ?? 30), 0)
    const promDiarioCop = diasAcumulados > 0 ? totCop2026 / diasAcumulados : 0
    const promDiarioUds = diasAcumulados > 0 ? totUds2026 / diasAcumulados : 0

    // Mejor / peor mes 2026
    const sortedByCop = [...meses2026].sort((a, b) => (b.cop2026 ?? 0) - (a.cop2026 ?? 0))
    const mejorMes = sortedByCop[0]
    const peorMes  = sortedByCop[sortedByCop.length - 1]

    // Ticket promedio (COP por unidad)
    const ticketMedio = totUds2026 > 0 ? totCop2026 / totUds2026 : 0

    // Growth MoM (crecimiento mes a mes 2026)
    const growthMoM = kpis.monthly.map((m, i) => {
      const prev = i > 0 ? kpis.monthly[i - 1] : null
      const g = prev && prev.cop2026 && m.cop2026 !== null && prev.cop2026 > 0
        ? ((m.cop2026 - prev.cop2026) / prev.cop2026) * 100
        : null
      return { mes_nombre: m.mes_nombre, growth: g }
    })
    const growthValidos = growthMoM.filter(x => x.growth !== null).map(x => x.growth as number)
    const growthPromedio = growthValidos.length > 0
      ? growthValidos.reduce((s, v) => s + v, 0) / growthValidos.length
      : 0

    // Formateo según moneda seleccionada
    const isCop = moneda === 'cop'
    const yFmtVal = (v: number) => {
      if (!isCop) {
        if (Math.abs(v) >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M'
        if (Math.abs(v) >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K'
        return '$' + v.toFixed(0)
      }
      if (Math.abs(v) >= 1e9) return '$' + (v / 1e9).toFixed(1) + ' MM'
      if (Math.abs(v) >= 1e6) return '$' + (v / 1e6).toFixed(0) + 'M'
      if (Math.abs(v) >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K'
      return '$' + v
    }
    const yFmtUds = (v: number) => v >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : String(v)
    const tipVal = (v: unknown) => isCop ? fmtCOP(Number(v)) : fmt$(v)
    const tipUds = (v: unknown) => Number(v).toLocaleString('es-CO') + ' und'
    const fmtLblVal = (v: any) => {
      const n = Number(v); if (!isFinite(n) || n === 0) return ''
      if (isCop) {
        if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'MM'
        if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(0) + 'M'
        if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K'
        return '$' + Math.round(n)
      }
      if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M'
      if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K'
      return '$' + Math.round(n)
    }
    const fmtLblUds = (v: any) => {
      const n = Number(v); if (!isFinite(n) || n === 0) return ''
      if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
      if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K'
      return String(Math.round(n))
    }
    // Cambia data si USD: kpis.monthly.y2025/y2026 son valores USD
    const monthlyVal = kpis.monthly.map(m => ({
      ...m,
      val2025: isCop ? (m.cop2025 > 0 ? m.cop2025 : null) : (m.y2025 > 0 ? m.y2025 : null),
      val2026: isCop ? m.cop2026 : m.y2026,
    }))
    let av25 = 0, av26 = 0
    const acumuladoVal = kpis.monthly.map(m => {
      const v25 = isCop ? (m.cop2025 || 0) : (m.y2025 || 0)
      const v26 = isCop ? m.cop2026 : m.y2026
      av25 += v25
      if (v26 !== null) av26 += v26
      return {
        mes_nombre: m.mes_nombre,
        acum2025: av25 > 0 ? av25 : null,
        acum2026: v26 !== null ? av26 : null,
      }
    })

    // Deltas: mes actual (ultimo_mes) vs mismo mes 2025
    const mAct  = kpis.monthly.find(m => m.mes === kpis.ultimo_mes)
    const dCop  = mAct && mAct.cop2025 > 0 && mAct.cop2026 !== null
      ? ((mAct.cop2026 - mAct.cop2025) / mAct.cop2025) * 100 : null
    const dUds  = mAct && mAct.uds2025 > 0 && mAct.uds2026 !== null
      ? ((mAct.uds2026 - mAct.uds2025) / mAct.uds2025) * 100 : null

    if (kpis.ytd_2026 === 0) {
      return (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="py-16 text-center">
            <p className="text-3xl mb-2">📭</p>
            <p className="text-sm font-semibold text-gray-600">Sin datos de sell-out</p>
          </div>
        </div>
      )
    }

    const monLabel = isCop ? 'COP' : 'USD'

    return (
      <div className="space-y-5">
        {/* Header con 4 KPIs primarios */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-gray-800">📈 Evolución de Ventas</h3>
            <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">SELLOUT</span>
            <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">{monLabel}</span>
          </div>
          <p className="text-xs text-gray-400 mb-3">
            Grupo Éxito Colombia
            {cadenasSel.length > 0 && ` · ${cadenasSel.length === 1 ? cadenasSel[0] : `${cadenasSel.length} cadenas`}`}
            {subcatSel.length > 0 && ` · ${subcatSel.length === 1 ? subcatSel[0] : `${subcatSel.length} subcategorías`}`}
            {deptoSel.length > 0 && ` · ${deptoSel.length === 1 ? deptoSel[0] : `${deptoSel.length} deptos.`}`}
            {ciudadSel.length > 0 && ` · ${ciudadSel.length === 1 ? ciudadSel[0] : `${ciudadSel.length} ciudades`}`}
            {skuSel.length > 0 && ` · ${skuSel.length === 1 ? `SKU ${skuSel[0]}` : `${skuSel.length} SKUs`}`}
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className={`rounded-lg px-4 py-2.5 border ${(kpis.delta_ytd ?? 0) >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
              <p className={`text-[9px] font-bold uppercase tracking-widest mb-0.5 ${(kpis.delta_ytd ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                YTD 2026 vs 2025
              </p>
              <p className={`text-lg font-bold ${(kpis.delta_ytd ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {kpis.ytd_2025 === 0 ? '—' : `${(kpis.delta_ytd ?? 0) > 0 ? '+' : ''}${(kpis.delta_ytd ?? 0).toFixed(1)}%`}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">{kpis.ultimo_mes_nombre ? `Ene–${kpis.ultimo_mes_nombre}` : ''}</p>
            </div>
            <div className="rounded-lg px-4 py-2.5 bg-amber-50 border border-amber-100">
              <p className="text-[9px] font-bold uppercase tracking-widest text-amber-700 mb-0.5">YTD 2026 ({monLabel})</p>
              <p className="text-lg font-bold text-amber-700">{isCop ? fmtCOP(totCop2026) : fmt$(kpis.ytd_2026)}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{fmtNum(kpis.uni_2026)} und</p>
            </div>
            <div className={`rounded-lg px-4 py-2.5 border ${(dCop ?? 0) >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
              <p className={`text-[9px] font-bold uppercase tracking-widest mb-0.5 ${(dCop ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {kpis.ultimo_mes_nombre} vs 2025
              </p>
              <p className={`text-lg font-bold ${(dCop ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {dCop === null ? '—' : `${dCop > 0 ? '+' : ''}${dCop.toFixed(1)}%`}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">{isCop ? fmtCOP(mAct?.cop2026 ?? 0) : fmt$(mAct?.y2026 ?? 0)}</p>
            </div>
            <div className={`rounded-lg px-4 py-2.5 border ${(dUds ?? 0) >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
              <p className={`text-[9px] font-bold uppercase tracking-widest mb-0.5 ${(dUds ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {kpis.ultimo_mes_nombre} unidades vs 2025
              </p>
              <p className={`text-lg font-bold ${(dUds ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {dUds === null ? '—' : `${dUds > 0 ? '+' : ''}${dUds.toFixed(1)}%`}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">{fmtNum(mAct?.uds2026 ?? 0)} und</p>
            </div>
          </div>
        </div>

        {/* KPIs del Seguimiento Semanal — mismos que en la sección Seguimiento */}
        {seg && (() => {
          const totSeg: SegRow = {
            key: '__total', label: 'TOTAL',
            meses: {}, mesesUsd: {}, mesesUnd: {},
            ytdCop: 0, ytdUsd: 0, ytdUnd: 0,
            rrUnd: 0, rrCop: 0, rrUsd: 0,
            undActual: 0, copActual: 0, usdActual: 0,
            proyUnd: 0, proyCop: 0, proyUsd: 0,
          }
          for (const r of seg.por_producto ?? []) {
            totSeg.ytdCop  += r.ytdCop;  totSeg.ytdUsd  += r.ytdUsd;  totSeg.ytdUnd  += r.ytdUnd
            totSeg.rrCop   += r.rrCop;   totSeg.rrUsd   += r.rrUsd;   totSeg.rrUnd   += r.rrUnd
            totSeg.proyCop += r.proyCop; totSeg.proyUsd += r.proyUsd; totSeg.proyUnd += r.proyUnd
          }
          const ultMesSeg    = seg.ultimo_mes
          const mesActualLbl = MES_LBL_YR(ultMesSeg, seg.ano)
          const cobertura    = seg.ultimo_dia && seg.dias_mes ? `${seg.ultimo_dia}/${seg.dias_mes} días` : '—'
          return (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3">
                <h4 className="text-sm font-semibold text-gray-800">📅 Seguimiento Mensual</h4>
                <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
                  {mesActualLbl}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard
                  label={`Total YTD ${seg.ano} (${moneda.toUpperCase()})`}
                  value={isCop ? fmtCOP(totSeg.ytdCop) : fmt$(totSeg.ytdUsd)}
                  sub={`${ultMesSeg} meses acumulados`}
                />
                <KpiCard label={`Total YTD ${seg.ano} (und)`} value={fmtNum(totSeg.ytdUnd)} sub={`${ultMesSeg} meses acumulados`} />
                <KpiCard label={`RR und/día (${mesActualLbl})`} value={fmtRR(totSeg.rrUnd)} sub={`base ${cobertura}`} />
                <KpiCard
                  label={`Proy. cierre ${mesActualLbl} (${moneda.toUpperCase()})`}
                  value={isCop ? fmtCOP(totSeg.proyCop) : fmt$(totSeg.proyUsd)}
                  sub={`${fmtNum(totSeg.proyUnd)} und`}
                  highlight
                />
              </div>
            </div>
          )
        })()}

        {/* Fila de estadísticas detalladas */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h4 className="text-sm font-semibold text-gray-800 mb-3">📊 Estadísticas del período</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg px-4 py-2.5 bg-gray-50 border border-gray-100">
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-0.5">Promedio mensual</p>
              <p className="text-lg font-bold text-gray-800">{isCop ? fmtCOP(promMensualCop) : fmt$(kpis.ytd_2026 / (meses2026.length || 1))}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{fmtNum(promMensualUds)} und/mes</p>
            </div>
            <div className="rounded-lg px-4 py-2.5 bg-gray-50 border border-gray-100">
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-0.5">Promedio diario</p>
              <p className="text-lg font-bold text-gray-800">{isCop ? fmtCOP(promDiarioCop) : fmt$(kpis.ytd_2026 / (diasAcumulados || 1))}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{fmtNum(promDiarioUds)} und/día</p>
            </div>
            <div className="rounded-lg px-4 py-2.5 bg-emerald-50 border border-emerald-100">
              <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-700 mb-0.5">Mejor mes 2026</p>
              <p className="text-lg font-bold text-emerald-700">{mejorMes ? mejorMes.mes_nombre : '—'}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{mejorMes ? (isCop ? fmtCOP(mejorMes.cop2026 ?? 0) : fmt$(mejorMes.y2026 ?? 0)) : '—'}</p>
            </div>
            <div className="rounded-lg px-4 py-2.5 bg-red-50 border border-red-100">
              <p className="text-[9px] font-bold uppercase tracking-widest text-red-700 mb-0.5">Peor mes 2026</p>
              <p className="text-lg font-bold text-red-700">{peorMes ? peorMes.mes_nombre : '—'}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{peorMes ? (isCop ? fmtCOP(peorMes.cop2026 ?? 0) : fmt$(peorMes.y2026 ?? 0)) : '—'}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            <div className="rounded-lg px-4 py-2.5 bg-blue-50 border border-blue-100">
              <p className="text-[9px] font-bold uppercase tracking-widest text-blue-700 mb-0.5">Ticket medio</p>
              <p className="text-lg font-bold text-blue-700">{isCop ? fmtCOP(ticketMedio) : fmt$(kpis.ytd_2026 / (kpis.uni_2026 || 1))}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">por unidad</p>
            </div>
            <div className={`rounded-lg px-4 py-2.5 border ${growthPromedio >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
              <p className={`text-[9px] font-bold uppercase tracking-widest mb-0.5 ${growthPromedio >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>Crecimiento MoM prom.</p>
              <p className={`text-lg font-bold ${growthPromedio >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {growthPromedio > 0 ? '+' : ''}{growthPromedio.toFixed(1)}%
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">vs mes anterior</p>
            </div>
            <div className="rounded-lg px-4 py-2.5 bg-gray-50 border border-gray-100">
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-0.5">Meses activos</p>
              <p className="text-lg font-bold text-gray-800">{meses2026.length} <span className="text-xs font-normal text-gray-500">de 12</span></p>
              <p className="text-[10px] text-gray-500 mt-0.5">{diasAcumulados} días acumulados</p>
            </div>
            <div className="rounded-lg px-4 py-2.5 bg-purple-50 border border-purple-100">
              <p className="text-[9px] font-bold uppercase tracking-widest text-purple-700 mb-0.5">Cadenas activas</p>
              <p className="text-lg font-bold text-purple-700">{(kpis.por_cadena ?? []).filter(c => c.valor_2026 > 0).length}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">con ventas 2026</p>
            </div>
          </div>
        </div>

        {/* Chart 1: Ventas mensuales / diarias según toggle */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
            <div>
              <h4 className="text-sm font-bold text-gray-800">
                {ventasVista === 'mensual' ? 'Ventas mensuales' : 'Ventas diarias · 2026'}
              </h4>
              {(() => {
                // Último precio promedio por Und (último día en diaria, último mes en mensual)
                let precioUlt = 0
                let refLabel  = ''
                if (ventasVista === 'diaria' && ventasDiaria.length > 0) {
                  const last = ventasDiaria[ventasDiaria.length - 1]
                  precioUlt = last.unidades > 0
                    ? (isCop ? last.valor_cop : last.valor_usd) / last.unidades
                    : 0
                  refLabel = last.dia_str
                } else if (ventasVista === 'mensual' && kpis?.monthly) {
                  const withData = kpis.monthly.filter((m: any) => (m.uds2026 ?? 0) > 0)
                  const last = withData[withData.length - 1]
                  if (last) {
                    const v = isCop ? (last.cop2026 ?? 0) : (last.y2026 ?? 0)
                    const u = last.uds2026 ?? 0
                    precioUlt = u > 0 ? v / u : 0
                    refLabel = last.mes_nombre
                  }
                }
                const precioFmt = isCop
                  ? '$ ' + Math.round(precioUlt).toLocaleString('es-CO')
                  : '$' + precioUlt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                return (
                  <p className="text-[11px] text-gray-400">
                    {ventasVista === 'mensual' ? `Comparativo 2025 vs 2026 · ${monLabel}` : `Tendencia diaria · ${monLabel}`}
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
            <div className="flex items-center gap-3 text-[11px] flex-wrap">
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                {(['mensual','diaria'] as const).map(v => (
                  <button key={v} onClick={() => setVentasVista(v)}
                    className={`px-3 py-1 font-semibold transition-colors ${ventasVista === v ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    {v === 'mensual' ? 'Mensual' : 'Diaria'}
                  </button>
                ))}
              </div>
              <MetricaTogglePill metricas={tendMetricas} onToggle={toggleTendMetrica} />
            </div>
          </div>
          {ventasVista === 'mensual' ? (
            <TendenciaMensualChart
              tendencia={tendencia}
              metricas={tendMetricas}
              moneda={moneda}
              skuFilter={skuSel}
            />
          ) : (
            <TendenciaDiariaChart
              rows={ventasDiaria}
              porSku={skuSel.length > 0 ? ventasDiariaPorSku : []}
              metricas={tendMetricas}
              moneda={moneda}
              loading={ventasDiariaLoading}
            />
          )}
        </div>

        {/* Chart 3: Growth MoM % */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h4 className="text-sm font-bold text-gray-800">Crecimiento MoM %</h4>
              <p className="text-[11px] text-gray-400">Variación mes vs mes anterior · 2026</p>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"/> Positivo</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500"/> Negativo</span>
            </div>
          </div>
          <div className="h-[260px] mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={growthMoM} margin={{ top: 10, right: 16, left: 8, bottom: 0 }} barCategoryGap="20%">
                <defs>
                  <linearGradient id="gradExitoGrowthPos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={1}/>
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0.85}/>
                  </linearGradient>
                  <linearGradient id="gradExitoGrowthNeg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={1}/>
                    <stop offset="100%" stopColor="#f87171" stopOpacity={0.85}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="mes_nombre" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v: number) => v + '%'} tick={{ fontSize: 11, fill: '#94a3b8' }} width={50} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v: unknown) => v === null ? ['—', 'Growth'] : [(v as number).toFixed(1) + '%', 'Growth']}
                  cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                  contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                />
                <Bar dataKey="growth" radius={[8,8,0,0]} maxBarSize={40}>
                  {growthMoM.map((r, i) => (
                    <Cell key={i} fill={r.growth === null ? '#e2e8f0' : r.growth >= 0 ? 'url(#gradExitoGrowthPos)' : 'url(#gradExitoGrowthNeg)'} />
                  ))}
                  <LabelList dataKey="growth" position="top"
                    formatter={(v: any) => v === null || v === undefined ? '' : Number(v).toFixed(1) + '%'}
                    style={{ fontSize: 9, fill: '#4b5563', fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 4: Acumulado YTD */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h4 className="text-sm font-bold text-gray-800">Acumulado YTD</h4>
              <p className="text-[11px] text-gray-400">Suma corriente Ene → mes en curso · {monLabel}</p>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-400"/> 2025</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"/> 2026</span>
            </div>
          </div>
          <div className="h-[280px] mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={acumuladoVal} margin={{ top: 10, right: 16, left: 8, bottom: 0 }} barCategoryGap="22%" barGap={10}>
                <defs>
                  <linearGradient id="gradExitoAcum25" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#60a5fa" stopOpacity={1}/>
                    <stop offset="100%" stopColor="#93c5fd" stopOpacity={0.85}/>
                  </linearGradient>
                  <linearGradient id="gradExitoAcum26" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2a7a58" stopOpacity={1}/>
                    <stop offset="100%" stopColor="#4a9b78" stopOpacity={0.85}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="mes_nombre" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={yFmtVal} tick={{ fontSize: 11, fill: '#94a3b8' }} width={70} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v: unknown) => [tipVal(v), '']}
                  cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                  contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                />
                <Bar dataKey="acum2025" name="Acum 2025" fill="url(#gradExitoAcum25)" radius={[8,8,0,0]} maxBarSize={36}>
                  <LabelList dataKey="acum2025" position="top"
                    formatter={fmtLblVal}
                    style={{ fontSize: 9, fill: '#1e3a8a', fontWeight: 700 }} />
                </Bar>
                <Bar dataKey="acum2026" name="Acum 2026" fill="url(#gradExitoAcum26)" radius={[8,8,0,0]} maxBarSize={36}>
                  <LabelList dataKey="acum2026" position="top"
                    formatter={fmtLblVal}
                    style={{ fontSize: 9, fill: '#065f46', fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 5: Distribución por cadena (2026) — Pie chart */}
        {(() => {
          const pieData = (kpis.por_cadena ?? [])
            .filter(c => (isCop ? c.valor_2026_cop : c.valor_2026) > 0)
            .map(c => ({
              cadena: c.cadena,
              valor: isCop ? c.valor_2026_cop : c.valor_2026,
            }))
          const totPie = pieData.reduce((s, x) => s + x.valor, 0)
          return (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div>
              <h4 className="text-sm font-bold text-gray-800">Distribución por cadena 2026</h4>
              <p className="text-[11px] text-gray-400">Participación de ventas por cadena · {monLabel}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3 items-center">
              <div className="md:col-span-2 h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="valor"
                      nameKey="cadena"
                      cx="50%" cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      stroke="#fff"
                      strokeWidth={2}
                      label={(entry: any) => {
                        const pct = totPie > 0 ? (entry.valor / totPie) * 100 : 0
                        return pct >= 3 ? `${pct.toFixed(1)}%` : ''
                      }}
                      labelLine={false}
                    >
                      {pieData.map((c, i) => (
                        <Cell key={i} fill={CADENA_COLORS[c.cadena] ?? '#c8873a'} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: unknown) => [tipVal(v), '']}
                      contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Leyenda con % y monto */}
              <div className="space-y-2">
                {pieData
                  .slice()
                  .sort((a, b) => b.valor - a.valor)
                  .map(c => {
                    const pct = totPie > 0 ? (c.valor / totPie) * 100 : 0
                    return (
                      <div key={c.cadena} className="flex items-start gap-2 text-xs">
                        <div className="w-2.5 h-2.5 rounded-sm mt-1 flex-shrink-0"
                             style={{ background: CADENA_COLORS[c.cadena] ?? '#c8873a' }} />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-700 truncate">{c.cadena}</p>
                          <p className="text-[11px] text-gray-400 tabular-nums">
                            {tipVal(c.valor)} <span className="text-gray-300">· {pct.toFixed(1)}%</span>
                          </p>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          </div>
          )
        })()}

        {/* Tabla de Seguimiento Semanal (integrada en Evolución Ventas) */}
        {seg && Seguimiento()}
      </div>
    )
  }

  // ── Pareto ──────────────────────────────────────────────────────────────

  function Pareto() {
    const L = isL('pareto')
    const isCop = moneda === 'cop'
    const fmtVal = (v: number) => isCop ? fmtCOP(v) : fmtFull(v)
    const yTick  = (v: any)    => isCop ? fmtCOP(Number(v)) : fmt$(v)
    const skuVal = (r: TopSku) => isCop ? r.valor_2026_cop : r.valor_2026
    const skuVal25 = (r: TopSku) => isCop ? r.valor_2025_cop : r.valor_2025
    const grandTotal = topSkus.reduce((s, r) => s + skuVal(r), 0)
    const pareto = topSkus.map(r => ({ ...r, valor_display: skuVal(r) }))
    return (
      <div className="space-y-5">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-4 items-end">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Top N</p>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {[5, 10, 13].map(n => (
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
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-start justify-between mb-1 gap-4">
              <div>
                <h3 className="text-sm font-bold text-gray-800">Pareto SKUs — Sell-Out YTD 2026 ({moneda.toUpperCase()})</h3>
                <p className="text-[11px] text-gray-400">Valor en {isCop ? 'pesos colombianos' : 'dólares'} · curva acumulada</p>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500"/> Clase A</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-slate-400"/> Clase B</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-slate-200"/> Clase C</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-600"/> Acum %</span>
              </div>
            </div>
            <div className="h-[300px] mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={pareto} margin={{ top: 10, right: 10, left: 0, bottom: 60 }} barCategoryGap="20%">
                  <defs>
                    <linearGradient id="gradClaseA" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={1}/>
                      <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.85}/>
                    </linearGradient>
                    <linearGradient id="gradClaseB" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.9}/>
                      <stop offset="100%" stopColor="#cbd5e1" stopOpacity={0.75}/>
                    </linearGradient>
                    <linearGradient id="gradClaseC" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#e2e8f0" stopOpacity={0.9}/>
                      <stop offset="100%" stopColor="#f1f5f9" stopOpacity={0.75}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="descripcion" tick={{ fontSize: 10, fill: '#64748b' }} interval={0}
                    angle={-30} textAnchor="end" height={70} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left"  tickFormatter={yTick} tick={{ fontSize: 11, fill: '#94a3b8' }} width={60} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={v => v + '%'} tick={{ fontSize: 11, fill: '#94a3b8' }} width={40} domain={[0,100]} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(v: any, name: string) => name === 'Acumulado %' ? (v as number).toFixed(1) + '%' : fmtVal(Number(v))}
                    cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                    contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  />
                  <Bar yAxisId="left" dataKey="valor_display" name={`Valor 2026 ${moneda.toUpperCase()}`} radius={[8,8,0,0]} maxBarSize={44}>
                    {pareto.map((r, i) => (
                      <Cell key={i} fill={r.cum_share <= 80 ? 'url(#gradClaseA)' : r.cum_share <= 95 ? 'url(#gradClaseB)' : 'url(#gradClaseC)'} />
                    ))}
                  </Bar>
                  <Line yAxisId="right" type="monotone" dataKey="cum_share" name="Acumulado %" stroke="#2563eb" strokeWidth={2.5}
                    dot={{ r: 3, strokeWidth: 2, fill: '#fff', stroke: '#2563eb' }}
                    activeDot={{ r: 5, strokeWidth: 2, fill: '#fff', stroke: '#2563eb' }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Detalle por SKU</h3>
              <p className="text-xs text-gray-400">YTD 2026 · sell-out Grupo Éxito CO</p>
            </div>
            {grandTotal > 0 && <span className="text-xs font-semibold text-gray-500">{fmtVal(grandTotal)} total</span>}
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
            <ParetoTopSkusTable rows={topSkus} moneda={moneda} fmtVal={fmtVal} skuVal={skuVal} />
          )}
        </div>

        {!L && topSkus.length > 0 && (
          <ComparativoSkus
            rows={topSkus}
            moneda={moneda}
            fmtVal={fmtVal}
            skuVal={skuVal}
            skuVal25={skuVal25}
            seg={seg}
            sku1={compSku1} setSku1={setCompSku1}
            sku2={compSku2} setSku2={setCompSku2}
            vista={compVista} setVista={setCompVista}
            daily1={compDaily1} daily2={compDaily2}
            dailyLoading={compDailyLoading}
          />
        )}
      </div>
    )
  }

  // ── Seguimiento Semanal ─────────────────────────────────────────────────

  function Seguimiento() {
    const L = isL('seg')
    if (L || !seg) return <div className="space-y-4"><CardSkeleton cols={4} /><ChartSkeleton /></div>

    const isCop = moneda === 'cop'
    // El modo unidades es independiente; para COP/USD respetamos el toggle global
    const effectiveSegMode: 'cop'|'usd'|'und' = segMode === 'und' ? 'und' : (isCop ? 'cop' : 'usd')

    const dataRows: SegRow[] =
      segTab === 'producto'    ? seg.por_producto  :
      segTab === 'cadena'      ? seg.por_cadena    :
      segTab === 'subformato'  ? seg.por_subformato:
      segTab === 'devoluciones'? (devTabla?.por_producto ?? []) :
                                 (seg.por_geografia ?? [])

    // Selector de "modo" (COP / USD / Unidades) — cambia qué se muestra en las celdas.
    const modeCfg = {
      cop: {
        cellFmt: (v: number) => fmtCOP(v),
        rrFmt:   (v: number) => fmtCOP(v),
        pickMes: (r: SegRow, m: number) => r.meses[m] ?? 0,
        pickYtd: (r: SegRow) => r.ytdCop,
        pickRR:  (r: SegRow) => r.rrCop,
        pickAct: (r: SegRow) => r.copActual,
        pickProy:(r: SegRow) => r.proyCop,
        colLabel: 'COP',
      },
      usd: {
        cellFmt: (v: number) => fmt$(v),
        rrFmt:   (v: number) => fmt$(v),
        pickMes: (r: SegRow, m: number) => r.mesesUsd[m] ?? 0,
        pickYtd: (r: SegRow) => r.ytdUsd,
        pickRR:  (r: SegRow) => r.rrUsd,
        pickAct: (r: SegRow) => r.usdActual,
        pickProy:(r: SegRow) => r.proyUsd,
        colLabel: 'USD',
      },
      und: {
        cellFmt: (v: number) => fmtNum(v),
        rrFmt:   (v: number) => fmtRR(v),
        pickMes: (r: SegRow, m: number) => r.mesesUnd[m] ?? 0,
        pickYtd: (r: SegRow) => r.ytdUnd,
        pickRR:  (r: SegRow) => r.rrUnd,
        pickAct: (r: SegRow) => r.undActual,
        pickProy:(r: SegRow) => r.proyUnd,
        colLabel: 'Und',
      },
    } as const
    const mode = modeCfg[effectiveSegMode]

    // totales
    const total: SegRow = {
      key: '__total', label: 'TOTAL GENERAL',
      meses: {}, mesesUsd: {}, mesesUnd: {},
      ytdCop: 0, ytdUsd: 0, ytdUnd: 0,
      rrUnd: 0, rrCop: 0, rrUsd: 0,
      undActual: 0, copActual: 0, usdActual: 0,
      proyUnd: 0, proyCop: 0, proyUsd: 0,
    }
    for (const r of dataRows) {
      for (let m = 1; m <= seg.ultimo_mes; m++) {
        total.meses[m]    = (total.meses[m] ?? 0)    + (r.meses[m] ?? 0)
        total.mesesUsd[m] = (total.mesesUsd[m] ?? 0) + (r.mesesUsd[m] ?? 0)
        total.mesesUnd[m] = (total.mesesUnd[m] ?? 0) + (r.mesesUnd[m] ?? 0)
      }
      total.ytdCop    += r.ytdCop
      total.ytdUsd    += r.ytdUsd
      total.ytdUnd    += r.ytdUnd
      total.rrUnd     += r.rrUnd
      total.rrCop     += r.rrCop
      total.rrUsd     += r.rrUsd
      total.undActual += r.undActual
      total.copActual += r.copActual
      total.usdActual += r.usdActual
      total.proyUnd   += r.proyUnd
      total.proyCop   += r.proyCop
      total.proyUsd   += r.proyUsd
    }
    total.rrUnd = Math.round(total.rrUnd * 10) / 10
    total.rrCop = Math.round(total.rrCop)
    total.rrUsd = Math.round(total.rrUsd * 100) / 100

    const ultimoMes    = seg.ultimo_mes
    const mesActualLbl = MES_LBL_YR(ultimoMes, seg.ano)
    const cobertura    = seg.ultimo_dia && seg.dias_mes ? `${seg.ultimo_dia}/${seg.dias_mes} días` : '—'

    const exportCsv = () => {
      const firstColLabel =
        segTab === 'producto'  ? 'Producto' :
        segTab === 'cadena'    ? 'Cadena' :
        segTab === 'subformato'? 'Subcadena' :
                                 'Departamento'
      const headers: string[] = []
      headers.push(segTab === 'producto' ? 'Producto' : firstColLabel)
      if (segTab === 'geografia') headers.push('PDVs')
      for (let m = 1; m <= ultimoMes; m++) headers.push(`${MES_LBL_YR(m, seg.ano)} (COP)`, `${MES_LBL_YR(m, seg.ano)} (USD)`, `${MES_LBL_YR(m, seg.ano)} (und)`)
      headers.push(`Total YTD ${seg.ano} (COP)`, `Total YTD ${seg.ano} (USD)`, `Total YTD ${seg.ano} (und)`,
                   `RR und/día (${mesActualLbl})`, `RR COP/día`, `RR USD/día`,
                   `Und ${mesActualLbl}`, `COP ${mesActualLbl}`, `USD ${mesActualLbl}`,
                   `Proy. ${mesActualLbl} und`, `Proy. ${mesActualLbl} COP`, `Proy. ${mesActualLbl} USD`)

      const lines: string[] = [headers.join(',')]
      const allRows = [...dataRows, total]
      for (const r of allRows) {
        const cells: (string | number)[] = []
        cells.push(`"${r.label}"`)
        if (segTab === 'geografia') cells.push(r.pdvs ?? '')
        for (let m = 1; m <= ultimoMes; m++) {
          cells.push(Math.round(r.meses[m] ?? 0),
                     Math.round((r.mesesUsd[m] ?? 0) * 100) / 100,
                     Math.round(r.mesesUnd[m] ?? 0))
        }
        cells.push(Math.round(r.ytdCop), Math.round(r.ytdUsd * 100) / 100, Math.round(r.ytdUnd),
                   r.rrUnd, Math.round(r.rrCop), Math.round(r.rrUsd * 100) / 100,
                   Math.round(r.undActual), Math.round(r.copActual), Math.round(r.usdActual * 100) / 100,
                   Math.round(r.proyUnd), Math.round(r.proyCop), Math.round(r.proyUsd * 100) / 100)
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
        {/* Header + export CSV (los KPIs se muestran arriba en Evolución) */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h4 className="text-sm font-semibold text-gray-800">📋 Detalle Seguimiento Mensual</h4>
            <p className="text-[11px] text-gray-400">Sell-Out · Grupo Éxito CO · {moneda.toUpperCase()}</p>
          </div>
          <button onClick={exportCsv}
            className="flex items-center gap-1.5 text-xs text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-lg">
            <Download size={12}/> Exportar CSV
          </button>
        </div>

        {/* Tabs internos + Toggle modo (Valor / Unidades) */}
        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-gray-200">
          <div className="flex items-center gap-1">
            {([
              { key: 'producto',    label: 'Producto'    },
              { key: 'cadena',      label: 'Cadena'      },
              { key: 'subformato',  label: 'Subcadena'   },
              { key: 'geografia',   label: 'Geografía'   },
              { key: 'devoluciones',label: 'Devoluciones'},
            ] as const).map(t => (
              <button key={t.key}
                onClick={() => setSegTab(t.key)}
                className={`px-4 py-2 text-xs font-semibold transition-colors border-b-2 -mb-px
                  ${segTab === t.key
                    ? 'text-amber-700 border-amber-500'
                    : 'text-gray-500 border-transparent hover:text-gray-800'}`}>
                {t.key === 'producto' ? 'Por Producto' : t.key === 'devoluciones' ? '↩️ Devoluciones' : `Por ${t.label}`}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 py-1">
            {([
              { k: 'valor', lbl: `Valor (${moneda.toUpperCase()})`, hint: 'Valor de venta según moneda seleccionada' },
              { k: 'und',   lbl: 'Unidades',                         hint: 'Cajas vendidas' },
            ] as const).map(t => {
              const isActive = t.k === 'und' ? effectiveSegMode === 'und' : effectiveSegMode !== 'und'
              return (
                <button key={t.k}
                  onClick={() => setSegMode(t.k === 'und' ? 'und' : (isCop ? 'cop' : 'usd'))}
                  title={t.hint}
                  className={`px-3 py-1 text-[11px] font-semibold rounded-md transition-colors
                    ${isActive
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : 'text-gray-500 hover:text-gray-800 border border-transparent'}`}>
                  {t.lbl}
                </button>
              )
            })}
          </div>
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider">
                <tr>
                  {segTab === 'producto' && (
                    <th className="px-3 py-2 text-left font-semibold sticky left-0 bg-gray-50 z-10">Producto</th>
                  )}
                  {segTab !== 'producto' && (
                    <th className="px-3 py-2 text-left font-semibold sticky left-0 bg-gray-50 z-10">{segTab === 'subformato' ? 'Subcadena' : segTab === 'cadena' ? 'Cadena' : 'Geografía'}</th>
                  )}
                  {segTab === 'subformato' && <th className="px-3 py-2 text-left font-semibold">Cadena</th>}
                  {segTab === 'geografia'  && <th className="px-3 py-2 text-right font-semibold">PDVs</th>}
                  {Array.from({ length: ultimoMes }, (_, i) => i + 1).map(m => (
                    <th key={m} className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                      {MES_LBL_YR(m, seg.ano)}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-semibold bg-gray-100 whitespace-nowrap">YTD {mode.colLabel}</th>
                  <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">RR {mode.colLabel}/día</th>
                  <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">{mesActualLbl} {mode.colLabel}</th>
                  <th className="px-3 py-2 text-right font-semibold bg-amber-50 text-amber-700 whitespace-nowrap">Proy. {mode.colLabel}</th>
                </tr>
              </thead>
              <tbody>
                {dataRows.length === 0 && (
                  <tr><td colSpan={20} className="px-6 py-10 text-center text-gray-400">Sin datos para {seg.ano}.</td></tr>
                )}
                {dataRows.map((r, i) => {
                  const isSinGeo = segTab === 'geografia' && r.label === 'SIN GEOGRAFÍA'
                  const bg = isSinGeo ? 'bg-amber-50/60' : (i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50')
                  return (
                  <tr key={r.key} className={bg}>
                    {(segTab === 'producto' || segTab === 'devoluciones') && (
                      <td className="px-3 py-2 text-gray-800 sticky left-0 bg-inherit">{r.label}</td>
                    )}
                    {(segTab !== 'producto' && segTab !== 'devoluciones') && (
                      <td className={`px-3 py-2 font-semibold sticky left-0 bg-inherit ${isSinGeo ? 'text-amber-700 italic' : 'text-gray-800'}`}>
                        {r.label}
                        {isSinGeo && <span className="ml-1 text-[10px] font-normal text-amber-600">· pendiente en base</span>}
                      </td>
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
                    {segTab === 'geografia' && (
                      <td className="px-3 py-2 text-right tabular-nums text-gray-600">{r.pdvs ?? '—'}</td>
                    )}
                    {Array.from({ length: ultimoMes }, (_, i) => i + 1).map(m => (
                      <td key={m} className="px-3 py-2 text-right tabular-nums text-gray-700">
                        {mode.pickMes(r, m) ? mode.cellFmt(mode.pickMes(r, m)) : <span className="text-gray-300">—</span>}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-800 bg-gray-50">{mode.cellFmt(mode.pickYtd(r))}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{mode.rrFmt(mode.pickRR(r))}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{mode.cellFmt(mode.pickAct(r))}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-amber-700 bg-amber-50/50">{mode.cellFmt(mode.pickProy(r))}</td>
                  </tr>
                  )
                })}
                {dataRows.length > 0 && (
                  <tr className="bg-gray-900 text-white font-semibold">
                    {(segTab === 'producto' || segTab === 'devoluciones') && <td className="px-3 py-2 sticky left-0 bg-gray-900">TOTAL GENERAL</td>}
                    {segTab === 'cadena'   && <td className="px-3 py-2 sticky left-0 bg-gray-900">TOTAL GENERAL</td>}
                    {segTab === 'subformato' && (
                      <>
                        <td className="px-3 py-2 sticky left-0 bg-gray-900">TOTAL GENERAL</td>
                        <td className="px-3 py-2"></td>
                      </>
                    )}
                    {segTab === 'geografia' && (
                      <>
                        <td className="px-3 py-2 sticky left-0 bg-gray-900">TOTAL GENERAL</td>
                        <td className="px-3 py-2 text-right">
                          {fmtNum(dataRows.reduce((a, r) => Math.max(a, r.pdvs ?? 0), 0))}
                        </td>
                      </>
                    )}
                    {Array.from({ length: ultimoMes }, (_, i) => i + 1).map(m => (
                      <td key={m} className="px-3 py-2 text-right tabular-nums">
                        {mode.pickMes(total, m) ? mode.cellFmt(mode.pickMes(total, m)) : '—'}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums">{mode.cellFmt(mode.pickYtd(total))}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{mode.rrFmt(mode.pickRR(total))}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{mode.cellFmt(mode.pickAct(total))}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-300">{mode.cellFmt(mode.pickProy(total))}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-gray-400 px-4 py-2 border-t border-gray-100 bg-gray-50">
            Valores en <strong>{mode.colLabel}</strong>.
            {segMode === 'cop' && ' Bruto de venta al público, sin margen.'}
            {segMode === 'usd' && ' Aproximación del margen para Borden (venta convertida a USD).'}
            {segMode === 'und' && ' Cajas vendidas.'}
            {' '}<strong>RR</strong> = Run Rate (ventas del mes ÷ días transcurridos, {cobertura}).
            <strong> Proyección</strong> = RR × días totales del mes ({seg.dias_mes}d).
            {segTab === 'producto' && ' Solo SKUs del listado priorizado.'}
            {segTab === 'geografia' && ' Agrupado por Departamento (fuente: base punto de venta).'}
          </p>
        </div>
      </div>
    )
  }

  // ── Devoluciones ─────────────────────────────────────────────────────────
  function Devoluciones() {
    if (!devTabla) return <div className="space-y-4"><CardSkeleton cols={4} /></div>
    if (!devTabla.por_producto || devTabla.por_producto.length === 0) return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
        <p className="text-3xl mb-2">↩️</p>
        <p className="text-sm font-semibold text-gray-600">Sin devoluciones registradas</p>
      </div>
    )

    const isCop = moneda === 'cop'
    const rows = devTabla.por_producto
    const totUds = rows.reduce((s, r) => s + r.ytdUnd, 0)
    const totCop = rows.reduce((s, r) => s + r.ytdCop, 0)
    const totUsd = rows.reduce((s, r) => s + r.ytdUsd, 0)
    const proyUds = rows.reduce((s, r) => s + r.proyUnd, 0)
    const proyCop = rows.reduce((s, r) => s + r.proyCop, 0)
    const mesActualLbl = MES_LBL_YR(devTabla.ultimo_mes, devTabla.ano)
    const cobertura = devTabla.ultimo_dia > 0 && devTabla.dias_mes > 0
      ? `${devTabla.ultimo_dia}/${devTabla.dias_mes} días` : '—'

    // % devoluciones vs ventas: si tenemos sellin (venta total), calculamos
    const ventaTotalCop = sellin?.kpi.cop_26 ?? 0
    const pctDevol = ventaTotalCop > 0 ? (totCop / ventaTotalCop) * 100 : null

    return (
      <div className="space-y-5">
        {/* Header */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                Devoluciones · Grupo Éxito CO
              </p>
              <h2 className="text-base font-bold text-gray-800 mt-0.5">
                YTD {devTabla.ano} · hasta {devTabla.ultima_fecha ?? '—'}
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Unidades devueltas + valor estimado a precio vigente. Fuente: devoluciones_exito.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <KpiCard
              label={`Devoluciones YTD (${moneda.toUpperCase()})`}
              value={isCop ? fmtCOP(totCop) : fmtFull(totUsd)}
              sub={`${fmtNum(totUds)} unidades`}
              highlight
            />
            <KpiCard
              label="Unidades devueltas YTD"
              value={fmtNum(totUds)}
              sub={`${rows.length} SKUs distintos`}
            />
            <KpiCard
              label={`% Devol. sobre Sell-In`}
              value={pctDevol !== null ? `${pctDevol.toFixed(2)}%` : '—'}
              sub={pctDevol !== null ? `${fmtCOP(totCop)} / ${fmtCOP(ventaTotalCop)}` : 'Cargá Sell-In primero'}
            />
            <KpiCard
              label={`Proy. cierre ${mesActualLbl}`}
              value={isCop ? fmtCOP(proyCop) : fmtFull((proyCop / ventaTotalCop) * (sellin?.kpi.usd_26 ?? 0))}
              sub={`${fmtNum(proyUds)} und · base ${cobertura}`}
            />
          </div>
        </div>

        {/* Tabla por producto */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">↩️ Devoluciones por Producto</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">Unidades y valor estimado por mes</p>
            </div>
            <div className="flex items-center gap-1">
              {([
                { k: 'valor', lbl: `Valor (${moneda.toUpperCase()})` },
                { k: 'und',   lbl: 'Unidades' },
              ] as const).map(t => {
                const isUnd = segMode === 'und'
                const isActive = t.k === 'und' ? isUnd : !isUnd
                return (
                  <button key={t.k}
                    onClick={() => setSegMode(t.k === 'und' ? 'und' : (isCop ? 'cop' : 'usd'))}
                    className={`px-3 py-1 text-[11px] font-semibold rounded-md transition-colors
                      ${isActive
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'text-gray-500 hover:text-gray-800 border border-transparent'}`}>
                    {t.lbl}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold sticky left-0 bg-gray-50">Producto</th>
                  {Array.from({ length: devTabla.ultimo_mes }, (_, i) => i + 1).map(m => (
                    <th key={m} className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                      {MES_LBL_YR(m, devTabla.ano)}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-right font-semibold bg-gray-100 whitespace-nowrap">
                    YTD {segMode === 'und' ? 'und' : moneda.toUpperCase()}
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold bg-amber-50 text-amber-700 whitespace-nowrap">
                    Proy. cierre
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const bg = i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                  const pickMes = (m: number) => segMode === 'und' ? (r.mesesUnd[m] ?? 0)
                                              : isCop           ? (r.meses[m] ?? 0)
                                                                : (r.mesesUsd[m] ?? 0)
                  const pickYtd = segMode === 'und' ? r.ytdUnd : isCop ? r.ytdCop : r.ytdUsd
                  const pickProy = segMode === 'und' ? r.proyUnd : isCop ? r.proyCop : r.proyUsd
                  const fmt = (v: number) => v === 0 ? <span className="text-gray-300">—</span>
                    : segMode === 'und' ? fmtNum(v)
                    : isCop             ? fmtCOP(v)
                                        : fmtFull(v)
                  return (
                    <tr key={r.key} className={bg}>
                      <td className="px-3 py-2 text-gray-800 sticky left-0 bg-inherit">{r.label}</td>
                      {Array.from({ length: devTabla.ultimo_mes }, (_, i) => i + 1).map(m => (
                        <td key={m} className="px-3 py-2 text-right tabular-nums text-gray-700">{fmt(pickMes(m))}</td>
                      ))}
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-800 bg-gray-50">{fmt(pickYtd)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-amber-700 bg-amber-50/50">{fmt(pickProy)}</td>
                    </tr>
                  )
                })}
                {/* Total */}
                <tr className="bg-gray-900 text-white font-semibold">
                  <td className="px-3 py-2.5 sticky left-0 bg-gray-900">TOTAL</td>
                  {Array.from({ length: devTabla.ultimo_mes }, (_, i) => i + 1).map(m => {
                    const t = rows.reduce((s, r) => s + (segMode === 'und' ? (r.mesesUnd[m] ?? 0) : isCop ? (r.meses[m] ?? 0) : (r.mesesUsd[m] ?? 0)), 0)
                    const f = segMode === 'und' ? fmtNum(t) : isCop ? fmtCOP(t) : fmtFull(t)
                    return <td key={m} className="px-3 py-2.5 text-right tabular-nums">{t === 0 ? '—' : f}</td>
                  })}
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {segMode === 'und' ? fmtNum(totUds) : isCop ? fmtCOP(totCop) : fmtFull(totUsd)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-amber-200">
                    {segMode === 'und' ? fmtNum(proyUds) : isCop ? fmtCOP(proyCop) : fmtFull((proyCop / (ventaTotalCop || 1)) * (sellin?.kpi.usd_26 ?? 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────

  // ── Inventarios ──────────────────────────────────────────────────────────

  function Inventarios() {
    const L = isL('inv')
    if (L || !inv || !inv.kpi) return <div className="space-y-4"><CardSkeleton cols={4} /></div>
    if (!inv.fecha) return <ProximamentePlaceholder section="inventarios" />

    const isCop = moneda === 'cop'
    const fmtCop = (v: number) => '$ ' + Math.round(v).toLocaleString('es-CO')
    const fmtValInv = (cop: number, usd: number) => isCop ? fmtCop(cop) : fmt$(usd)
    const kpi = inv.kpi
    const pctQuiebres = kpi.combinaciones > 0 ? (kpi.quiebres / kpi.combinaciones) * 100 : 0
    const usdRate = kpi.total_cop > 0 && kpi.total_usd > 0 ? kpi.total_usd / kpi.total_cop : 0

    return (
      <div className="space-y-5">
        {/* Header */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                Inventario · Grupo Éxito CO
              </p>
              <h2 className="text-base font-bold text-gray-800 mt-0.5">
                Snapshot al <strong>{inv.fecha}</strong>
              </h2>
              <p className="text-xs text-gray-500 mt-1">Valores en {isCop ? 'COP (pesos colombianos)' : 'USD (dólares)'}.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <KpiCard label="Total unidades" value={fmtNum(kpi.total_uds)} sub={`${kpi.pdvs} PDVs`} />
            <KpiCard
              label={`Valor inventario (${moneda.toUpperCase()})`}
              value={isCop ? fmtCOP(kpi.total_cop) : fmtFull(kpi.total_usd)}
              sub={isCop ? `${fmtFull(kpi.total_usd)} USD` : `${fmtCOP(kpi.total_cop)} COP`}
              highlight
            />
            <KpiCard label="SKUs con stock" value={String(kpi.con_stock)} sub={`de ${kpi.combinaciones} combos`} />
            <KpiCard label="Quiebres" value={String(kpi.quiebres)} sub={`${pctQuiebres.toFixed(1)}% del total`} />
          </div>
        </div>

        {/* Por cadena — click en fila abre detalle por PDV */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">Por Cadena</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Click en cualquier fila para ver el detalle por PDV de esa cadena.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-2 text-left">Cadena</th>
                  <th className="px-4 py-2 text-right">PDVs</th>
                  <th className="px-4 py-2 text-right">Combos</th>
                  <th className="px-4 py-2 text-right">Con stock</th>
                  <th className="px-4 py-2 text-right">Quiebres</th>
                  <th className="px-4 py-2 text-right">Unidades</th>
                  <th className="px-4 py-2 text-right">% Total</th>
                </tr>
              </thead>
              <tbody>
                {inv.por_cadena.map(c => {
                  const totalUds = inv.por_cadena.reduce((s, x) => s + x.uds, 0)
                  const pct = totalUds > 0 ? (c.uds / totalUds) * 100 : 0
                  const color = CADENA_COLORS[c.cadena ?? ''] ?? '#6b7280'
                  const cad   = c.cadena ?? ''
                  return (
                    <tr key={cad || '—'}
                        onClick={() => cad && openDetalleCadena(cad)}
                        className={`border-b border-gray-50 ${cad ? 'cursor-pointer hover:bg-amber-50/60 transition-colors' : ''}`}>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                          <span className="font-semibold text-gray-800">{c.cadena ?? '—'}</span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-700 tabular-nums">{c.pdvs}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums">{c.combinaciones}</td>
                      <td className="px-4 py-2.5 text-right text-emerald-700 tabular-nums">{c.con_stock}</td>
                      <td className="px-4 py-2.5 text-right text-red-600 tabular-nums font-semibold">{c.quiebres}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-800 tabular-nums">{fmtNum(c.uds)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-500">{pct.toFixed(1)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top SKUs por inventario */}
        <InvTopSkusTable rows={inv.top_skus} onRowClick={(s) => openDetallePDVs(s.sku ?? s.plu ?? '', s.descripcion, 'todos')} />
      </div>
    )
  }

  // ── Cobertura ─────────────────────────────────────────────────────────────
  // Métricas tipo Excel CR/GT pero embebidas: Quiebres, Inv. Bajo, y SKU × PDV.

  function Cobertura() {
    const L = isL('inv')
    if (L || !inv || !inv.kpi) return <div className="space-y-4"><CardSkeleton cols={4} /></div>
    if (!inv.fecha) return <ProximamentePlaceholder section="cobertura" />

    const isCop = moneda === 'cop'
    const fmtCop = (v: number) => '$ ' + Math.round(v).toLocaleString('es-CO')
    const kpi = inv.kpi
    const usdRate = kpi.total_cop > 0 && kpi.total_usd > 0 ? kpi.total_usd / kpi.total_cop : 0

    // Quiebres = SKUs faltantes en PDVs; inv bajo viene en su propio campo del endpoint
    const quiebres = inv.detalle // ahora el endpoint ya devuelve solo quiebres
    const bajos    = inv.inv_bajo ?? inv.detalle.filter(d => d.inv_unidades > 0 && d.inv_unidades <= 3)

    const pctCoberturaSkus = kpi.combinaciones > 0 ? (kpi.con_stock / kpi.combinaciones) * 100 : 0
    const pctQuiebres      = kpi.combinaciones > 0 ? (kpi.quiebres  / kpi.combinaciones) * 100 : 0

    return (
      <div className="space-y-5">
        {/* Header + KPIs */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                Cobertura · Grupo Éxito CO
              </p>
              <h2 className="text-base font-bold text-gray-800 mt-0.5">
                Snapshot al <strong>{inv.fecha}</strong>
              </h2>
              <p className="text-xs text-gray-500 mt-1">Detalle limitado a los 500 casos de mayor valor.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <KpiCard label="Cobertura SKUs" value={`${pctCoberturaSkus.toFixed(1)}%`} sub={`${kpi.con_stock}/${kpi.combinaciones} combos`} />
            <KpiCard label="Quiebres" value={String(kpi.quiebres)} sub={`${pctQuiebres.toFixed(1)}% del total`} highlight={kpi.quiebres > 0} />
            <KpiCard label="Inventario bajo (≤3)" value={String(bajos.length)} sub="Detectados en detalle" />
            <KpiCard label="PDVs cubiertos" value={String(kpi.pdvs)} sub={`${kpi.skus_unicos} SKUs únicos`} />
          </div>
        </div>

        {/* Quiebres */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">🚨 Quiebres de Stock</h3>
              <p className="text-xs text-gray-400">Combinaciones PDV × SKU con inv = 0 (muestra top 500 por valor de referencia)</p>
            </div>
            <span className="text-xs font-bold text-red-600 bg-red-50 px-3 py-1 rounded-full">{quiebres.length} casos en detalle</span>
          </div>
          <div className="overflow-x-auto max-h-[400px]">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left">Cadena</th>
                  <th className="px-3 py-2 text-left">Punto de Venta</th>
                  <th className="px-3 py-2 text-left">PluCD</th>
                  <th className="px-3 py-2 text-left">Descripción</th>
                </tr>
              </thead>
              <tbody>
                {quiebres.length === 0
                  ? <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400">Sin quiebres en el detalle 🎉</td></tr>
                  : quiebres.map((d, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                              style={{ background: CADENA_COLORS[d.cadena ?? ''] ?? '#6b7280' }}>{d.cadena ?? '—'}</span>
                      </td>
                      <td className="px-3 py-2 text-gray-800">{d.punto_venta}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-gray-500">{d.plu ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-700 max-w-[280px] truncate">{d.descripcion}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Inventario bajo */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">⚠️ Inventario Bajo</h3>
              <p className="text-xs text-gray-400">Combinaciones con 1 a 3 unidades disponibles</p>
            </div>
            <span className="text-xs font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-full">{bajos.length} casos</span>
          </div>
          <div className="overflow-x-auto max-h-[400px]">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left">Cadena</th>
                  <th className="px-3 py-2 text-left">Punto de Venta</th>
                  <th className="px-3 py-2 text-left">PluCD</th>
                  <th className="px-3 py-2 text-left">Descripción</th>
                  <th className="px-3 py-2 text-right">Unidades</th>
                </tr>
              </thead>
              <tbody>
                {bajos.length === 0
                  ? <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">Sin inv bajo en el detalle</td></tr>
                  : bajos.map((d, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                              style={{ background: CADENA_COLORS[d.cadena ?? ''] ?? '#6b7280' }}>{d.cadena ?? '—'}</span>
                      </td>
                      <td className="px-3 py-2 text-gray-800">{d.punto_venta}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-gray-500">{d.plu ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-700 max-w-[240px] truncate">{d.descripcion}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-orange-700 font-bold">{d.inv_unidades}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  // ── Innovaciones ─────────────────────────────────────────────────────────

  function Innovaciones() {
    const L = isL('innov')
    if (L || innov === null) return <div className="space-y-4"><CardSkeleton cols={2} /></div>

    if (innov.length === 0) return <ProximamentePlaceholder section="innovaciones" />

    const fmtCop = (v: number) => '$ ' + Math.round(v).toLocaleString('es-CO')
    const fmtMes = (m: number) => ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][m] ?? String(m)

    // KPIs a nivel score card
    const totUds = innov.reduce((s, x) => s + x.total_uds, 0)
    const totCop = innov.reduce((s, x) => s + x.total_cop, 0)
    const totUsd = innov.reduce((s, x) => s + x.total_usd, 0)
    const conVenta = innov.filter(x => !x.sin_ventas).length

    return (
      <div className="space-y-5">
        {/* Header + KPIs */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                Score Card Innovaciones
              </p>
              <h2 className="text-base font-bold text-gray-800 mt-0.5">
                🆕 Extracontenido Parmesano · Grupo Éxito CO
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                {conVenta > 0
                  ? `${conVenta}/${innov.length} con ventas registradas`
                  : ' '}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <KpiCard label="SKUs innovación" value={String(innov.length)} sub="En catálogo" />
            <KpiCard label="Con ventas" value={`${conVenta}/${innov.length}`} sub="Ya activados" />
            <KpiCard label="Unidades acumuladas" value={fmtNum(totUds)} sub="YTD" highlight={totUds > 0} />
            <KpiCard
              label={`Valor acumulado (${moneda.toUpperCase()})`}
              value={moneda === 'cop' ? fmtCOP(totCop) : fmtFull(totUsd)}
              sub={moneda === 'cop' ? `${fmtFull(totUsd)} USD` : `${fmtCOP(totCop)} COP`}
              highlight={totCop > 0}
            />
          </div>
        </div>

        {/* Cards por SKU */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {innov.map(it => {
            const bg = it.sin_ventas ? 'bg-white border-gray-200' : 'bg-emerald-50/40 border-emerald-200'
            return (
              <div key={it.ean13 || it.plu} className={`rounded-xl border shadow-sm p-5 ${bg}`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                      PluCD {it.plu} · Cód. {it.codigo_borden}
                    </p>
                    <h3 className="text-sm font-bold text-gray-800 mt-0.5 leading-snug">{it.descripcion}</h3>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      EAN: <span className="font-mono">{it.ean13}</span>
                      {it.gramos !== null && <span> · {it.gramos}g</span>}
                    </p>
                  </div>
                  {it.sin_ventas ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 whitespace-nowrap">
                      🕓 Sin ventas aún
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 whitespace-nowrap">
                      ✓ Activo
                    </span>
                  )}
                </div>

                {/* Precio vigente */}
                <div className="mb-3">
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                    <p className="text-[9px] uppercase tracking-widest text-amber-700">Precio vigente</p>
                    <p className="text-sm font-bold text-amber-800">{fmtCop(it.precio_vigente_cop ?? 0)}</p>
                  </div>
                </div>

                {/* Métricas de venta */}
                {it.sin_ventas ? (
                  <div className="mt-4 py-4 text-center bg-white/60 rounded-lg border border-dashed border-gray-200">
                    <p className="text-xs text-gray-500">
                      Aún no se registran ventas en <code className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded">fact_ventas_exito</code>
                    </p>
                    <p className="text-[10px] text-gray-400 mt-1">
                      Este panel se pobla automáticamente cuando el bot OneDrive detecte la primera venta
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-4 gap-2 mt-3">
                      <div className="text-center">
                        <p className="text-[9px] uppercase tracking-widest text-gray-400">Primera venta</p>
                        <p className="text-xs font-semibold text-gray-800">{it.primera_venta}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] uppercase tracking-widest text-gray-400">Unidades</p>
                        <p className="text-sm font-bold text-gray-800">{fmtNum(it.total_uds)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] uppercase tracking-widest text-gray-400">Valor {moneda.toUpperCase()}</p>
                        <p className="text-sm font-bold text-emerald-700">{moneda === 'cop' ? fmtCop(it.total_cop) : fmtFull(it.total_usd)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] uppercase tracking-widest text-gray-400">PDVs</p>
                        <p className="text-sm font-bold text-gray-800">{it.pdvs_unicos}</p>
                      </div>
                    </div>

                    {it.monthly.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-[9px] uppercase tracking-widest text-gray-400 mb-1.5">Evolución mensual</p>
                        <div className="flex gap-1 flex-wrap">
                          {it.monthly.map((m, i) => (
                            <div key={i} className="flex-1 min-w-[42px] text-center bg-white/70 rounded p-1.5">
                              <p className="text-[9px] text-gray-400">{fmtMes(m.mes)}-{String(m.ano).slice(2)}</p>
                              <p className="text-[11px] font-bold text-gray-700">{Math.round(m.uds)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Evolución diaria (chart) */}
                    {it.daily && it.daily.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-[9px] uppercase tracking-widest text-gray-400 mb-1.5">
                          Evolución diaria · {it.daily.length} días con venta
                        </p>
                        <ResponsiveContainer width="100%" height={200}>
                          <AreaChart data={it.daily} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                            <defs>
                              <linearGradient id={`gradInnov-${it.plu}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#10b981" stopOpacity={0.35}/>
                                <stop offset="100%" stopColor="#10b981" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis
                              dataKey="fecha"
                              tick={{ fontSize: 9, fill: '#64748b' }}
                              tickFormatter={(v: string) => v.slice(5)}
                              interval="preserveStartEnd"
                              minTickGap={20}
                              axisLine={false} tickLine={false}
                            />
                            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} width={35} axisLine={false} tickLine={false} />
                            <Tooltip
                              formatter={(v: unknown, name: string) => {
                                if (name === 'uds') return [Math.round(Number(v)) + ' und', 'Unidades']
                                if (name === 'cop') return [fmtCop(Number(v)), 'COP']
                                return [String(v), name]
                              }}
                              labelFormatter={(l: string) => `Fecha: ${l}`}
                              contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                            />
                            <Area
                              type="monotone"
                              dataKey="uds"
                              stroke="#059669"
                              strokeWidth={2}
                              fill={`url(#gradInnov-${it.plu})`}
                              dot={false}
                              activeDot={{ r: 5, strokeWidth: 2, fill: '#fff', stroke: '#059669' }}
                              name="uds"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Precios ──────────────────────────────────────────────────────────────

  function Precios() {
    const L = isL('precios')
    if (L || precios === null) return <div className="space-y-4"><CardSkeleton cols={3} /></div>

    const fmtCop = (v: number | null) => v === null || v === undefined
      ? '—'
      : '$ ' + Math.round(v).toLocaleString('es-CO')

    const delta = (a: number | null, b: number | null) => {
      if (a === null || b === null || a === 0) return null
      return ((b - a) / a) * 100
    }

    const regulares    = precios.filter(p => !p.es_oferta && !p.es_innovacion)
    const ofertas      = precios.filter(p => p.es_oferta && !p.es_innovacion)
    const innovaciones = precios.filter(p => p.es_innovacion)

    const renderRow = (p: PrecioRow, i: number) => {
      const d = delta(p.precio_anterior_cop, p.precio_vigente_cop)
      const bg = p.es_innovacion ? 'bg-emerald-50/60'
               : p.es_oferta     ? 'bg-red-50/60'
               : (i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50')
      return (
        <tr key={p.ean13 || i} className={bg}>
          <td className="px-3 py-2 font-mono text-[11px] text-gray-700">{p.ean13}</td>
          <td className="px-3 py-2 font-mono text-[11px] text-gray-700">{p.plu}</td>
          <td className="px-3 py-2 font-mono text-[11px] text-gray-500">{p.codigo_borden}</td>
          <td className="px-3 py-2 text-gray-800 max-w-[280px] truncate" title={p.descripcion ?? ''}>{p.descripcion}</td>
          <td className="px-3 py-2 text-right tabular-nums text-gray-600">{p.gramos ?? '—'}</td>
          {/* Costo Centurion */}
          <td className="px-3 py-2 text-right tabular-nums text-gray-600 bg-purple-50/40">{fmtCop(p.costo_ant_cop)}</td>
          <td className="px-3 py-2 text-right tabular-nums font-semibold text-purple-900 bg-purple-100/50">{fmtCop(p.costo_cop)}</td>
          {/* Lista de Precios */}
          <td className="px-3 py-2 text-right tabular-nums text-gray-600 bg-orange-50/40">{fmtCop(p.precio_anterior_cop)}</td>
          <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900 bg-orange-100/50">{fmtCop(p.precio_vigente_cop)}</td>
          {/* PVP Sugerido */}
          <td className="px-3 py-2 text-right tabular-nums text-gray-600 bg-cyan-50/40">{fmtCop(p.pvp_ant_cop)}</td>
          <td className="px-3 py-2 text-right tabular-nums font-semibold text-cyan-900 bg-cyan-100/50">{fmtCop(p.pvp_sugerido_cop)}</td>
          {/* Ajuste % */}
          <td className="px-3 py-2 text-right tabular-nums">
            {d === null
              ? <span className="text-gray-300">—</span>
              : (
                <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  d > 0 ? 'bg-emerald-50 text-emerald-700' :
                  d < 0 ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {d > 0 ? '+' : ''}{d.toFixed(1)}%
                </span>
              )}
          </td>
        </tr>
      )
    }

    // KPIs
    const nRegulares   = regulares.length
    const nOfertas     = ofertas.length
    const nInnovacion  = innovaciones.length
    const avgIncrPct = (() => {
      const ds = precios.map(p => delta(p.precio_anterior_cop, p.precio_vigente_cop)).filter(x => x !== null) as number[]
      return ds.length ? ds.reduce((s, x) => s + x, 0) / ds.length : 0
    })()

    // Márgenes brutos (Lista de Precios vs Costo Centurion) — abril 2026
    const margenLista = (() => {
      const vals: number[] = []
      for (const p of precios) {
        if (p.precio_vigente_cop && p.costo_cop && p.precio_vigente_cop > 0) {
          vals.push(((p.precio_vigente_cop - p.costo_cop) / p.precio_vigente_cop) * 100)
        }
      }
      return vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : null
    })()

    // Márgen distribuidor (PVP Sugerido vs Lista de Precios)
    const margenDist = (() => {
      const vals: number[] = []
      for (const p of precios) {
        if (p.pvp_sugerido_cop && p.precio_vigente_cop && p.pvp_sugerido_cop > 0) {
          vals.push(((p.pvp_sugerido_cop - p.precio_vigente_cop) / p.pvp_sugerido_cop) * 100)
        }
      }
      return vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : null
    })()

    return (
      <div className="space-y-5">
        {/* Header */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                Precios · Grupo Éxito CO
              </p>
              <h2 className="text-base font-bold text-gray-800 mt-0.5">
                Costo Centurion · Lista de Precios · PVP Sugerido
              </h2>
              <p className="text-xs text-gray-500 mt-1">Comparativo Marzo-26 vs Abril-26 por SKU.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <KpiCard
              label="Total SKUs"
              value={String(precios.length)}
              sub={`${nRegulares} reg · ${nInnovacion} innov${nOfertas > 0 ? ` · ${nOfertas} ofertas` : ''}`}
            />
            <KpiCard
              label="Ajuste promedio"
              value={`${avgIncrPct >= 0 ? '+' : ''}${avgIncrPct.toFixed(1)}%`}
              sub="Vigente vs anterior"
              highlight
            />
            <KpiCard
              label="Margen bruto Éxito"
              value={margenLista !== null ? `${margenLista.toFixed(1)}%` : '—'}
              sub="(Lista − Costo Centurion) / Lista"
            />
            <KpiCard
              label="Margen distribuidor"
              value={margenDist !== null ? `${margenDist.toFixed(1)}%` : '—'}
              sub="(PVP − Lista) / PVP · Sugerido"
            />
          </div>
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider">
                {/* Grupos de columnas */}
                <tr className="bg-gray-50 text-gray-500">
                  <th colSpan={5}></th>
                  <th colSpan={2} className="px-3 py-1.5 text-center font-bold text-purple-700 bg-purple-100 border-l-2 border-r-2 border-purple-200">
                    💼 Costo Centurion
                  </th>
                  <th colSpan={2} className="px-3 py-1.5 text-center font-bold text-orange-800 bg-orange-100 border-r-2 border-orange-200">
                    🏪 Lista de Precios (a Éxito)
                  </th>
                  <th colSpan={2} className="px-3 py-1.5 text-center font-bold text-cyan-800 bg-cyan-100 border-r-2 border-cyan-200">
                    🛒 PVP Sugerido (al público)
                  </th>
                  <th></th>
                </tr>
                <tr className="bg-gray-50 text-gray-600">
                  <th className="px-3 py-2 text-left font-semibold">EAN 13</th>
                  <th className="px-3 py-2 text-left font-semibold">PLU</th>
                  <th className="px-3 py-2 text-left font-semibold">Código</th>
                  <th className="px-3 py-2 text-left font-semibold">Descripción del Item</th>
                  <th className="px-3 py-2 text-right font-semibold">GR</th>
                  {/* Centurion */}
                  <th className="px-3 py-2 text-right font-semibold bg-purple-50 text-purple-800">Mar-26</th>
                  <th className="px-3 py-2 text-right font-semibold bg-purple-100 text-purple-900">Abr-26</th>
                  {/* Lista precios */}
                  <th className="px-3 py-2 text-right font-semibold bg-orange-50 text-orange-800">Mar-26</th>
                  <th className="px-3 py-2 text-right font-semibold bg-orange-100 text-orange-900">Abr-26</th>
                  {/* PVP */}
                  <th className="px-3 py-2 text-right font-semibold bg-cyan-50 text-cyan-800">Mar-26</th>
                  <th className="px-3 py-2 text-right font-semibold bg-cyan-100 text-cyan-900">Abr-26</th>
                  <th className="px-3 py-2 text-right font-semibold">Ajuste %</th>
                </tr>
              </thead>
              <tbody>
                {regulares.map((p, i) => renderRow(p, i))}
                {innovaciones.length > 0 && (
                  <tr>
                    <td colSpan={12} className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-semibold text-emerald-700 bg-emerald-100/60 border-t border-emerald-200">
                      🆕 Innovaciones · Extracontenido Parmesano
                    </td>
                  </tr>
                )}
                {innovaciones.map((p, i) => renderRow(p, i + regulares.length))}
                {ofertas.length > 0 && (
                  <tr>
                    <td colSpan={12} className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-semibold text-red-700 bg-red-100/50 border-t border-red-200">
                      🔖 Ofertas
                    </td>
                  </tr>
                )}
                {ofertas.map((p, i) => renderRow(p, i + regulares.length + innovaciones.length))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-gray-400 px-4 py-2 border-t border-gray-100 bg-gray-50">
            Precios en COP (pesos colombianos). <b className="text-purple-700">Costo Centurion</b> = costo del importador ·
            <b className="text-orange-700"> Lista de Precios</b> = venta a Grupo Éxito ·
            <b className="text-cyan-700"> PVP Sugerido</b> = precio al público. Innovaciones (fondo verde) · Ofertas (fondo rosado). "Ajuste %" = variación de la lista de precios.
          </p>
        </div>
      </div>
    )
  }

  // ── Sell-In ──────────────────────────────────────────────────────────────
  function SellIn() {
    const L = isL('sellin')
    if (L || !sellin) return <div className="space-y-4"><CardSkeleton cols={4} /><ChartSkeleton /></div>

    const { kpi, monthly, top_skus, ocs } = sellin
    const useUsd = moneda === 'usd'
    const fmtLblSellin = (v: any) => {
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

    const fmtVal = (v: number) => useUsd ? fmtFull(v) : fmtCOP(v)
    const yFmt = (v: any) => useUsd ? fmt$(Number(v)) : fmtCOP(Number(v))

    // KPIs
    const ventaCur = useUsd ? kpi.usd_26 : kpi.cop_26
    const venta25  = useUsd ? (kpi.usd_25 ?? 0) : kpi.cop_25
    // Tasa implícita 2026 / 2025 para derivar utilidad y costo en USD (no vienen del API).
    const rate26 = kpi.cop_26 > 0 && kpi.usd_26 > 0 ? kpi.usd_26 / kpi.cop_26 : 0
    const rate25 = kpi.cop_25 > 0 && (kpi.usd_25 ?? 0) > 0 ? (kpi.usd_25 ?? 0) / kpi.cop_25 : rate26
    const utCur    = useUsd ? kpi.ut_26 * rate26 : kpi.ut_26
    const ut25Cur  = useUsd ? kpi.ut_25 * rate25 : kpi.ut_25
    const costoCur = useUsd ? kpi.costo_26 * rate26 : kpi.costo_26
    const currLabel = useUsd ? 'USD' : 'COP'

    // Monthly filtrado a los meses cargados
    const monthlyF = monthly.filter(m => (m.cop_25 || 0) > 0 || (m.cop_26 || 0) > 0)

    // Utilidad y margen mensuales
    const monthlyPlus = monthlyF.map(m => ({
      ...m,
      margen_26_pct: (m.cop_26 && m.cop_26 > 0 && m.ut_26 !== null) ? (m.ut_26 / m.cop_26) * 100 : null,
      margen_25_pct: (m.cop_25 > 0)                                 ? (m.ut_25 / m.cop_25) * 100 : null,
    }))

    // Top SKUs — filtrado por categoría/cadenaFilter no aplica (SellIn es solo GRUPO ÉXITO)
    const topSkus = top_skus.slice(0, 15)
    const totalSku = top_skus.reduce((s, x) => s + x.cop, 0)

    // Distribución por subcategoría
    const porSubcatMap: Record<string, { cop: number; uds: number; ut: number }> = {}
    for (const s of top_skus) {
      const c = s.subcategoria || 'Sin subcategoría'
      if (!porSubcatMap[c]) porSubcatMap[c] = { cop: 0, uds: 0, ut: 0 }
      porSubcatMap[c].cop += s.cop; porSubcatMap[c].uds += s.uds; porSubcatMap[c].ut += s.ut
    }
    const porSubcat = Object.entries(porSubcatMap)
      .map(([subcategoria, v]) => ({ subcategoria, ...v, margen_pct: v.cop > 0 ? (v.ut / v.cop) * 100 : null }))
      .sort((a, b) => b.cop - a.cop)

    return (
      <div className="space-y-5">
        {/* Header */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
            Sell-In · Grupo Éxito CO · YTD 2026
          </p>
          <h2 className="text-base font-bold text-gray-800 mt-0.5">
            Facturación a Grupo Éxito ({useUsd ? 'USD' : 'COP'})
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            {kpi.ultimo_mes > 0 ? `Datos cargados hasta mes ${kpi.ultimo_mes}.` : 'Sin movimientos cargados.'} Fuente: OC recibidas por SKU.
          </p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            label={`Venta YTD 2026 (${useUsd ? 'USD' : 'COP'})`}
            value={fmtVal(ventaCur)}
            sub={kpi.ultimo_mes > 0 ? `Hasta mes ${kpi.ultimo_mes}` : 'Sin dato'}
            highlight
          />
          <KpiCard
            label="Unidades YTD 2026"
            value={fmtNum(kpi.uds_26)}
            sub={kpi.delta_unidades !== null ? `${kpi.delta_unidades > 0 ? '+' : ''}${kpi.delta_unidades.toFixed(1)}% vs 2025` : 'Sin comparativo'}
          />
          <KpiCard
            label={`Utilidad Bruta (${currLabel})`}
            value={fmtVal(utCur)}
            sub={kpi.delta_utilidad !== null ? `${kpi.delta_utilidad > 0 ? '+' : ''}${kpi.delta_utilidad.toFixed(1)}% vs 2025` : 'Sin comparativo'}
          />
          <KpiCard
            label="Margen Bruto %"
            value={kpi.margen_pct !== null ? `${kpi.margen_pct.toFixed(1)}%` : '—'}
            sub={kpi.margen_pct_25 !== null ? `2025: ${kpi.margen_pct_25.toFixed(1)}%` : 'Sin dato 2025'}
          />
        </div>

        {/* Comparativos vs 2025 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Venta 2026 vs 2025 ({currLabel})</p>
            <p className="text-2xl font-bold text-gray-800">{fmtVal(ventaCur)}</p>
            <p className="text-xs text-gray-500 mt-0.5">2025 mismo período: {fmtVal(venta25)}</p>
            <div className="mt-2">
              {kpi.delta_venta !== null ? <Delta d={kpi.delta_venta} /> : <span className="text-xs text-gray-400">Sin comparativo</span>}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Utilidad 2026 vs 2025 ({currLabel})</p>
            <p className="text-2xl font-bold text-gray-800">{fmtVal(utCur)}</p>
            <p className="text-xs text-gray-500 mt-0.5">2025 mismo período: {fmtVal(ut25Cur)}</p>
            <div className="mt-2">
              {kpi.delta_utilidad !== null ? <Delta d={kpi.delta_utilidad} /> : <span className="text-xs text-gray-400">Sin comparativo</span>}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Costo Venta 2026 ({currLabel})</p>
            <p className="text-2xl font-bold text-gray-800">{fmtVal(costoCur)}</p>
            <p className="text-xs text-gray-500 mt-0.5">Ratio costo/venta: {kpi.cop_26 > 0 ? ((kpi.costo_26 / kpi.cop_26) * 100).toFixed(1) : '—'}%</p>
          </div>
        </div>

        {/* Ventas mensuales chart */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h3 className="text-sm font-bold text-gray-800">Sell-In Mensual</h3>
              <p className="text-[11px] text-gray-400">2025 vs 2026 ({useUsd ? 'USD' : 'COP'})</p>
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
                  <linearGradient id="gradExitoSellIn25" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#60a5fa" stopOpacity={1}/>
                    <stop offset="100%" stopColor="#93c5fd" stopOpacity={0.85}/>
                  </linearGradient>
                  <linearGradient id="gradExitoSellIn26" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#c8873a" stopOpacity={1}/>
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.85}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="mes_nombre" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={yFmt} tick={{ fontSize: 11, fill: '#94a3b8' }} width={60} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v: any) => fmtVal(Number(v))}
                  cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                  contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                />
                <Bar dataKey="cop_25" name="2025" fill="url(#gradExitoSellIn25)" radius={[8,8,0,0]} maxBarSize={36}>
                  <LabelList dataKey="cop_25" position="top"
                    formatter={fmtLblSellin}
                    style={{ fontSize: 9, fill: '#1e3a8a', fontWeight: 700 }} />
                </Bar>
                <Bar dataKey="cop_26" name="2026" fill="url(#gradExitoSellIn26)" radius={[8,8,0,0]} maxBarSize={36}>
                  <LabelList dataKey="cop_26" position="top"
                    formatter={fmtLblSellin}
                    style={{ fontSize: 9, fill: '#92400e', fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Utilidad y Margen mensual */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h3 className="text-sm font-bold text-gray-800">Utilidad Bruta Mensual</h3>
                <p className="text-[11px] text-gray-400">2025 vs 2026 · COP</p>
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
                    <linearGradient id="gradExitoUt25" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#60a5fa" stopOpacity={1}/>
                      <stop offset="100%" stopColor="#93c5fd" stopOpacity={0.85}/>
                    </linearGradient>
                    <linearGradient id="gradExitoUt26" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2a7a58" stopOpacity={1}/>
                      <stop offset="100%" stopColor="#4a9b78" stopOpacity={0.85}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="mes_nombre" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v: any) => fmtCOP(Number(v))} tick={{ fontSize: 11, fill: '#94a3b8' }} width={55} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(v: any) => fmtCOP(Number(v))}
                    cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                    contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  />
                  <Bar dataKey="ut_25" name="2025" fill="url(#gradExitoUt25)" radius={[8,8,0,0]} maxBarSize={36}>
                    <LabelList dataKey="ut_25" position="top"
                      formatter={fmtLblCop}
                      style={{ fontSize: 9, fill: '#1e3a8a', fontWeight: 700 }} />
                  </Bar>
                  <Bar dataKey="ut_26" name="2026" fill="url(#gradExitoUt26)" radius={[8,8,0,0]} maxBarSize={36}>
                    <LabelList dataKey="ut_26" position="top"
                      formatter={fmtLblCop}
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
                <p className="text-[11px] text-gray-400">Evolución del margen · 2025 vs 2026</p>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-slate-400"/> 2025</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-violet-500"/> 2026</span>
              </div>
            </div>
            <div className="h-[220px] mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyPlus} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barCategoryGap="25%">
                  <defs>
                    <linearGradient id="gradMargen25Bar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.9}/>
                      <stop offset="100%" stopColor="#cbd5e1" stopOpacity={0.75}/>
                    </linearGradient>
                    <linearGradient id="gradMargen26Bar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={1}/>
                      <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.85}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="mes_nombre" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v: any) => `${Math.round(Number(v))}%`} tick={{ fontSize: 11, fill: '#94a3b8' }} width={40} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(v: any) => v === null ? '—' : `${Number(v).toFixed(1)}%`}
                    cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                    contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  />
                  <Bar dataKey="margen_25_pct" name="2025" fill="url(#gradMargen25Bar)" radius={[8,8,0,0]} maxBarSize={28}>
                    <LabelList dataKey="margen_25_pct" position="top"
                      formatter={(v: any) => v === null || v === undefined ? '' : `${Number(v).toFixed(0)}%`}
                      style={{ fontSize: 9, fill: '#64748b', fontWeight: 600 }} />
                  </Bar>
                  <Bar dataKey="margen_26_pct" name="2026" fill="url(#gradMargen26Bar)" radius={[8,8,0,0]} maxBarSize={28}>
                    <LabelList dataKey="margen_26_pct" position="top"
                      formatter={(v: any) => v === null || v === undefined ? '' : `${Number(v).toFixed(0)}%`}
                      style={{ fontSize: 9, fill: '#5b21b6', fontWeight: 700 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Distribución por subcategoría */}
        {porSubcat.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-gray-800 mb-4">Sell-In por Subcategoría — YTD 2026</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider">Subcategoría</th>
                    <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider">Venta {useUsd ? 'USD' : 'COP'}</th>
                    <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider">Unidades</th>
                    <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider">Utilidad COP</th>
                    <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider">Margen %</th>
                    <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider">% del total</th>
                  </tr>
                </thead>
                <tbody>
                  {porSubcat.map((c, i) => {
                    const val = useUsd ? (c.cop / (kpi.cop_26 || 1)) * kpi.usd_26 : c.cop
                    const pct = totalSku > 0 ? (c.cop / totalSku) * 100 : 0
                    return (
                      <tr key={c.subcategoria} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className="px-3 py-2 font-semibold text-gray-800">{c.subcategoria}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtVal(val)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtNum(c.uds)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtCOP(c.ut)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{c.margen_pct !== null ? `${c.margen_pct.toFixed(1)}%` : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{pct.toFixed(1)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Top SKUs */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Top SKUs por Venta — YTD 2026</h3>
          <SellInTopSkusTable rows={topSkus} useUsd={useUsd} />
          {top_skus.length > 15 && (
            <p className="text-[10px] text-gray-400 mt-2">Mostrando 15 de {top_skus.length} SKUs con Sell-In.</p>
          )}
        </div>
      </div>
    )
  }

  // ── Calidad Inventario ───────────────────────────────────────────────────
  function Calidad() {
    const L = isL('calidad')
    if (L || !calidad) return <div className="space-y-4"><CardSkeleton cols={4} /><ChartSkeleton /></div>
    if (calidad.rows.length === 0) return <ProximamentePlaceholder section="cobertura" />

    const t = calidad.total
    const universo = calidad.universo_pdvs

    const openDetalle = openDetallePDVs // alias local para compatibilidad

    // Chart de barras apiladas por SKU (top 15 por total de PDVs)
    const chartData = calidad.rows.slice(0, 15).map(r => ({
      producto: (r.descripcion ?? r.sku).split(' ').slice(0, 4).join(' '),
      sku: r.sku,
      'Menos de 3': r.menos_de_3,
      'Entre 3 y 10': r.entre_3_y_10,
      'Mayor a 10': r.mayor_a_10,
    }))

    // KPIs generales
    const pctCritico = t.total_pdvs > 0 ? (t.menos_de_3 / t.total_pdvs) * 100 : 0
    const pctSaludable = t.total_pdvs > 0 ? (t.mayor_a_10 / t.total_pdvs) * 100 : 0

    return (
      <div className="space-y-5">
        {/* Header + KPIs */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                Calidad de Inventario · Grupo Éxito CO
              </p>
              <h2 className="text-base font-bold text-gray-800 mt-0.5">
                Nivel de inventario por SKU
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Snapshot al <strong>{calidad.fecha}</strong> · Universo: <strong>{universo}</strong> PDVs con presencia Borden.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <div className="rounded-xl border border-red-100 bg-red-50/60 p-4">
              <p className="text-[10px] font-semibold text-red-500 uppercase tracking-widest mb-1">🚨 Stock crítico (&lt;3)</p>
              <p className="text-2xl font-bold text-red-700">{t.menos_de_3}</p>
              <p className="text-[10px] text-red-600 mt-0.5">{pctCritico.toFixed(1)}% de los PDVs con stock</p>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-4">
              <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-widest mb-1">⚠️ Stock medio (3–10)</p>
              <p className="text-2xl font-bold text-amber-700">{t.entre_3_y_10}</p>
              <p className="text-[10px] text-amber-600 mt-0.5">{t.total_pdvs > 0 ? ((t.entre_3_y_10 / t.total_pdvs) * 100).toFixed(1) : '0'}% de los PDVs con stock</p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
              <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-widest mb-1">✓ Stock saludable (&gt;10)</p>
              <p className="text-2xl font-bold text-emerald-700">{t.mayor_a_10}</p>
              <p className="text-[10px] text-emerald-600 mt-0.5">{pctSaludable.toFixed(1)}% de los PDVs con stock</p>
            </div>
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
              <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-widest mb-1">Cobertura efectiva</p>
              <p className="text-2xl font-bold text-blue-700">{(calidad.cobertura_efectiva ?? 0).toFixed(1)}%</p>
              <p className="text-[10px] text-blue-600 mt-0.5">{calidad.pdvs_con_stock ?? 0} / {universo} PDVs con al menos 1 SKU</p>
            </div>
          </div>
        </div>

        {/* Chart apilado */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h3 className="text-sm font-bold text-gray-800">Distribución de PDVs por Nivel de Stock</h3>
              <p className="text-[11px] text-gray-400">Cantidad de PDVs con inventario por producto</p>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500"/> Menos de 3</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500"/> Entre 3 y 10</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500"/> Mayor a 10</span>
            </div>
          </div>
          <div className="h-[380px] mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 80 }}>
                <defs>
                  <linearGradient id="gradCritico" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={1}/>
                    <stop offset="100%" stopColor="#f87171" stopOpacity={0.85}/>
                  </linearGradient>
                  <linearGradient id="gradMedio" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={1}/>
                    <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.85}/>
                  </linearGradient>
                  <linearGradient id="gradSaludable" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={1}/>
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0.85}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="producto" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false}
                  angle={-30} textAnchor="end" interval={0} height={80} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                  contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                />
                <Bar dataKey="Menos de 3"   stackId="a" fill="url(#gradCritico)"   radius={[0,0,0,0]} maxBarSize={40} />
                <Bar dataKey="Entre 3 y 10" stackId="a" fill="url(#gradMedio)"     radius={[0,0,0,0]} maxBarSize={40} />
                <Bar dataKey="Mayor a 10"   stackId="a" fill="url(#gradSaludable)" radius={[8,8,0,0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tabla nivel inventario */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50">
            <h3 className="text-sm font-bold text-gray-800">Nivel Inventario — Detalle por Producto</h3>
            <p className="text-[11px] text-gray-400 mt-0.5"># de PDVs por nivel de stock · cobertura vs universo total</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">Producto</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-red-600">Menos de 3</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-amber-600">Entre 3 y 10</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-emerald-600">Mayor a 10</th>
                  <th className="px-3 py-2.5 text-right font-semibold bg-gray-100">Total PDVs</th>
                  <th className="px-3 py-2.5 text-right font-semibold bg-blue-50 text-blue-700">Cobertura %</th>
                </tr>
              </thead>
              <tbody>
                {calidad.rows.map((r, i) => (
                  <tr key={r.sku} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                    <td className="px-4 py-2.5 font-medium text-gray-800">
                      {r.descripcion ?? r.sku}
                      <span className="ml-2 text-[10px] text-gray-400 font-mono">{r.sku}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {r.menos_de_3 > 0 ? (
                        <button
                          onClick={() => openDetalle(r.sku, r.descripcion, 'menos_de_3')}
                          className="inline-block min-w-[38px] px-2 py-0.5 rounded font-semibold bg-red-100 text-red-700 hover:bg-red-200 hover:ring-2 hover:ring-red-300 transition-all cursor-pointer"
                          title="Ver PDVs con stock < 3">
                          {r.menos_de_3}
                        </button>
                      ) : <span className="inline-block min-w-[38px] px-2 py-0.5 text-gray-300">0</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {r.entre_3_y_10 > 0 ? (
                        <button
                          onClick={() => openDetalle(r.sku, r.descripcion, 'entre_3_y_10')}
                          className="inline-block min-w-[38px] px-2 py-0.5 rounded font-semibold bg-amber-100 text-amber-700 hover:bg-amber-200 hover:ring-2 hover:ring-amber-300 transition-all cursor-pointer"
                          title="Ver PDVs con stock 3–10">
                          {r.entre_3_y_10}
                        </button>
                      ) : <span className="inline-block min-w-[38px] px-2 py-0.5 text-gray-300">0</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {r.mayor_a_10 > 0 ? (
                        <button
                          onClick={() => openDetalle(r.sku, r.descripcion, 'mayor_a_10')}
                          className="inline-block min-w-[38px] px-2 py-0.5 rounded font-semibold bg-emerald-100 text-emerald-700 hover:bg-emerald-200 hover:ring-2 hover:ring-emerald-300 transition-all cursor-pointer"
                          title="Ver PDVs con stock > 10">
                          {r.mayor_a_10}
                        </button>
                      ) : <span className="inline-block min-w-[38px] px-2 py-0.5 text-gray-300">0</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums bg-gray-50/60">
                      <button
                        onClick={() => openDetalle(r.sku, r.descripcion, 'todos')}
                        className="font-bold text-gray-800 hover:text-blue-700 hover:underline cursor-pointer"
                        title="Ver todos los PDVs con stock">
                        {r.total_pdvs}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums bg-blue-50/40">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-12 bg-gray-100 rounded-full h-1.5 hidden md:block">
                          <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${Math.min(100, r.cobertura_pct)}%` }} />
                        </div>
                        <span className="font-bold text-blue-700 min-w-[42px]">{r.cobertura_pct.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-900 text-white font-bold">
                  <td className="px-4 py-2.5">TOTAL <span className="text-[9px] font-normal text-gray-400 ml-1">(suma por SKU)</span></td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{t.menos_de_3}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{t.entre_3_y_10}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{t.mayor_a_10}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{t.total_pdvs}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-blue-300" title="Cobertura efectiva: PDVs distintos con al menos 1 SKU con stock / universo total">
                    {(calidad.cobertura_efectiva ?? 0).toFixed(1)}% <span className="text-[9px] font-normal text-gray-400">efectiva</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Tabla % composición */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50">
            <h3 className="text-sm font-bold text-gray-800">Composición % del Stock por Producto</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Distribución porcentual de los PDVs con stock</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">Producto</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-red-600">% &lt; 3</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-amber-600">% 3–10</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-emerald-600">% &gt; 10</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Barra composición</th>
                </tr>
              </thead>
              <tbody>
                {calidad.rows.map((r, i) => (
                  <tr key={r.sku} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                    <td className="px-4 py-2.5 font-medium text-gray-800 max-w-[240px] truncate" title={r.descripcion ?? ''}>
                      {r.descripcion ?? r.sku}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-red-600 font-semibold">{r.pct_menos_de_3.toFixed(1)}%</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-amber-600 font-semibold">{r.pct_entre_3_y_10.toFixed(1)}%</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600 font-semibold">{r.pct_mayor_a_10.toFixed(1)}%</td>
                    <td className="px-3 py-2.5 w-[280px]">
                      <div className="flex w-full h-3 rounded-full overflow-hidden bg-gray-100">
                        <div className="bg-red-500 h-full"     style={{ width: `${r.pct_menos_de_3}%`   }} title={`Menos de 3: ${r.pct_menos_de_3.toFixed(1)}%`} />
                        <div className="bg-amber-500 h-full"   style={{ width: `${r.pct_entre_3_y_10}%` }} title={`Entre 3 y 10: ${r.pct_entre_3_y_10.toFixed(1)}%`} />
                        <div className="bg-emerald-500 h-full" style={{ width: `${r.pct_mayor_a_10}%`   }} title={`Mayor a 10: ${r.pct_mayor_a_10.toFixed(1)}%`} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-gray-400 px-6 py-2 border-t border-gray-100 bg-gray-50">
            Réplica del reporte "CALIDAD INVENTARIO BORDEN". Los porcentajes suman 100% (composición del total de PDVs con stock del producto).
          </p>
        </div>
        {/* El modal de detalle de PDVs se renderiza a nivel del componente principal
            para que también sea accesible desde Inventarios (Top 20 SKUs). */}
      </div>
    )
  }

  const renderSection = () => {
    switch (section) {
      case 'resumen':       return Resumen()
      case 'sellin':        return SellIn()
      case 'calidad':       return Calidad()
      case 'evolucion':     return Evolucion()
      case 'pareto':        return Pareto()
      case 'devoluciones':  return Devoluciones()
      // 'seguimiento' fue integrado en Evolución Ventas (2026-07-11)
      case 'cobertura':     return Cobertura()
      case 'inventarios':   return Inventarios()
      case 'innovaciones':  return Innovaciones()
      case 'precios':       return Precios()
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
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4"
             style={{ ['--acc' as any]: '#f59e0b', ['--bg' as any]: '#ffffff', ['--surface' as any]: '#ffffff',
                      ['--border' as any]: '#e5e7eb', ['--t1' as any]: '#111827', ['--t2' as any]: '#374151', ['--t3' as any]: '#6b7280' }}>

          {/* Barra top: resumen selección + toggle avanzados + moneda + reset */}
          <div className="flex items-center flex-wrap gap-3 justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowFiltros(v => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-lg">
                <SlidersHorizontal size={12}/> Filtros {showFiltros ? '▲' : '▼'}
              </button>
              {/* Chips resumen */}
              {[
                { label: 'Cadena',       items: cadenasSel, onClear: () => setCadenasSel([]) },
                { label: 'Subcategoría', items: subcatSel,  onClear: () => setSubcatSel([])  },
                { label: 'Depto.',       items: deptoSel,   onClear: () => setDeptoSel([])   },
                { label: 'Ciudad',       items: ciudadSel,  onClear: () => setCiudadSel([])  },
                { label: 'SKU',          items: skuSel,     onClear: () => setSkuSel([])     },
              ].filter(c => c.items.length > 0).map(c => (
                <span key={c.label}
                      className="inline-flex items-center gap-1 text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200 rounded-full px-2.5 py-1">
                  <span className="text-amber-500">{c.label}:</span>
                  <span>{c.items.length <= 2 ? c.items.join(', ') : `${c.items.length} sel.`}</span>
                  <button onClick={c.onClear} className="ml-0.5 rounded-full hover:bg-amber-100 p-0.5" aria-label={`Limpiar ${c.label}`}>
                    <X size={10}/>
                  </button>
                </span>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Moneda */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-widest text-gray-400">Moneda</span>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                  {(['cop','usd'] as const).map(m => (
                    <button key={m}
                      onClick={() => { setMoneda(m); saveFilter('moneda', m) }}
                      className={`px-4 py-1.5 text-xs font-semibold transition-colors ${moneda === m ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                      {m.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              {/* Reset global */}
              {(cadenasSel.length + subcatSel.length + deptoSel.length + ciudadSel.length + skuSel.length > 0 || moneda !== 'cop') && (
                <button
                  onClick={() => {
                    setCadenasSel([]); setSubcatSel([]); setDeptoSel([]); setCiudadSel([]); setSkuSel([])
                    setMoneda('cop')
                    localStorage.removeItem(`${storageKey}-moneda`)
                  }}
                  className="self-end px-3 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 font-medium transition-colors">
                  ↺ Reset
                </button>
              )}
            </div>
          </div>

          {/* Sección expandible con los 5 multi-select */}
          {showFiltros && (
            <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <MultiSelect
                label="Cadena"
                placeholder="Todas"
                selectAllLabel="Todas las cadenas"
                value={cadenasSel}
                onChange={setCadenasSel}
                options={(filtrosOpts?.cadenas ?? []).map(o => ({ value: o.value, label: o.value }))}
              />
              <MultiSelect
                label="Subcategoría"
                placeholder="Todas"
                selectAllLabel="Todas las subcategorías"
                value={subcatSel}
                onChange={setSubcatSel}
                options={(filtrosOpts?.subcategorias ?? []).map(o => ({ value: o.value, label: o.value }))}
              />
              <MultiSelect
                label="Departamento"
                placeholder="Todos"
                selectAllLabel="Todos los departamentos"
                value={deptoSel}
                onChange={setDeptoSel}
                options={(filtrosOpts?.departamentos ?? []).map(o => ({ value: o.value, label: o.value }))}
              />
              <MultiSelect
                label="Ciudad"
                placeholder="Todas"
                selectAllLabel="Todas las ciudades"
                value={ciudadSel}
                onChange={setCiudadSel}
                options={(filtrosOpts?.ciudades ?? [])
                  // Si hay depto seleccionado, restringir la lista de ciudades a esos deptos
                  .filter(o => deptoSel.length === 0 || (o.departamento && deptoSel.includes(o.departamento)))
                  .map(o => ({ value: o.value, label: o.value }))}
              />
              <div className="col-span-2 lg:col-span-2">
                <MultiSelect
                  label="SKU / Producto"
                  placeholder="Todos"
                  selectAllLabel="Todos los SKUs"
                  value={skuSel}
                  onChange={setSkuSel}
                  options={(filtrosOpts?.skus ?? [])
                    // Restringir por subcategoría si hay seleccionadas
                    .filter(o => subcatSel.length === 0 || (o.subcategoria && subcatSel.includes(o.subcategoria)))
                    .map(o => ({
                      value: o.value,
                      label: o.descripcion ? `${o.value} · ${o.descripcion}` : o.value,
                    }))}
                />
              </div>
            </div>
          )}
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

      {/* Modal Detalle PDVs — accesible desde Calidad Inventario e Inventarios (Top 20 SKUs) */}
      {calidadDetalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
             onClick={() => setCalidadDetalle(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden"
               onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
              <div>
                {calidadDetalle.sku.startsWith('Cadena: ') ? (
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-blue-100 text-blue-700">
                      🏬 Cadena completa
                    </span>
                    <span className="text-[10px] font-mono text-gray-400">{calidadDetalle.sku.replace('Cadena: ', '')}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                      calidadDetalle.bucket === 'menos_de_3'   ? 'bg-red-100 text-red-700' :
                      calidadDetalle.bucket === 'entre_3_y_10' ? 'bg-amber-100 text-amber-700' :
                      calidadDetalle.bucket === 'mayor_a_10'   ? 'bg-emerald-100 text-emerald-700' :
                                                                'bg-blue-100 text-blue-700'
                    }`}>
                      {calidadDetalle.bucket === 'menos_de_3'   ? '🚨 Stock < 3' :
                       calidadDetalle.bucket === 'entre_3_y_10' ? '⚠️ Stock 3–10' :
                       calidadDetalle.bucket === 'mayor_a_10'   ? '✓ Stock > 10' :
                                                                  '📦 Todos'}
                    </span>
                    <span className="text-[10px] font-mono text-gray-400">SKU {calidadDetalle.sku}</span>
                  </div>
                )}
                <h3 className="text-base font-bold text-gray-800">{calidadDetalle.descripcion ?? calidadDetalle.sku}</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {calidadDetalle.loading ? 'Cargando...' : `${calidadDetalle.pdvs.length} PDVs · Snapshot ${calidad?.fecha ?? inv?.fecha ?? ''}`}
                </p>
              </div>
              <button onClick={() => setCalidadDetalle(null)}
                      className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto">
              {calidadDetalle.loading ? (
                <div className="py-16 text-center text-gray-400 text-sm">Cargando PDVs...</div>
              ) : calidadDetalle.pdvs.length === 0 ? (
                <div className="py-16 text-center text-gray-400 text-sm">Sin PDVs para este SKU.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold w-8">#</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Punto de Venta</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Cadena</th>
                      <th className="px-3 py-2.5 text-left font-semibold">Depto / Ciudad</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Unidades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calidadDetalle.pdvs.map((p, i) => (
                      <tr key={`${p.gln}-${i}`} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                        <td className="px-4 py-2 text-gray-400 tabular-nums">{i + 1}</td>
                        <td className="px-3 py-2 text-gray-800">
                          {p.punto_venta}
                          <span className="ml-2 text-[10px] text-gray-400 font-mono">GLN {p.gln}</span>
                        </td>
                        <td className="px-3 py-2">
                          {p.cadena && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                                  style={{ background: CADENA_COLORS[p.cadena] ?? '#6b7280' }}>
                              {p.cadena}
                            </span>
                          )}
                          {p.subcadena && p.subcadena !== p.cadena && (
                            <span className="ml-1 text-[10px] text-gray-500">· {p.subcadena}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-600 text-[11px]">
                          {p.departamento && <span>{p.departamento}</span>}
                          {p.ciudad && <span className="text-gray-400"> · {p.ciudad}</span>}
                          {!p.departamento && !p.ciudad && <span className="text-gray-300">—</span>}
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums font-bold ${
                          p.inv_unidades < 3  ? 'text-red-600' :
                          p.inv_unidades <= 10 ? 'text-amber-600' :
                                                  'text-emerald-600'
                        }`}>
                          {Math.round(p.inv_unidades)}
                        </td>
                      </tr>
                    ))}
                    {/* Total */}
                    <tr className="bg-gray-900 text-white font-bold">
                      <td className="px-4 py-2.5" colSpan={4}>TOTAL · {calidadDetalle.pdvs.length} PDVs</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {Math.round(calidadDetalle.pdvs.reduce((s, p) => s + p.inv_unidades, 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
              <p className="text-[10px] text-gray-500">
                Click fuera del modal o el botón × para cerrar.
              </p>
              <button onClick={() => {
                const rows = calidadDetalle.pdvs.map(p => [
                  p.punto_venta, p.cadena ?? '', p.subcadena ?? '', p.departamento ?? '', p.ciudad ?? '',
                  Math.round(p.inv_unidades),
                ])
                const header = ['Punto de Venta','Cadena','Subcadena','Departamento','Ciudad','Unidades']
                const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
                const url  = URL.createObjectURL(blob)
                const a    = document.createElement('a')
                a.href = url
                a.download = `PDVs_${calidadDetalle.sku}_${calidadDetalle.bucket}.csv`
                a.click()
                URL.revokeObjectURL(url)
              }}
                      className="text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                <Download size={12}/> Exportar CSV
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

/* ═════ Sub-componente: Sell-In Top SKUs (ordenable) ═════ */
function SellInTopSkusTable({ rows, useUsd }: { rows: SellInSku[]; useUsd: boolean }) {
  type Col = 'descripcion' | 'categoria' | 'subcategoria' | 'uds' | 'cop' | 'ut' | 'margen_pct'
  const { toggleSort, sorted, SortArrow } = useTableSort<SellInSku, Col>(
    rows, 'cop', 'desc',
    {
      descripcion:  (a, b) => (a.descripcion ?? a.sku).localeCompare(b.descripcion ?? b.sku),
      categoria:    (a, b) => (a.categoria ?? '').localeCompare(b.categoria ?? ''),
      subcategoria: (a, b) => (a.subcategoria ?? '').localeCompare(b.subcategoria ?? ''),
      uds:          (a, b) => (a.uds ?? 0) - (b.uds ?? 0),
      cop:          (a, b) => (a.cop ?? 0) - (b.cop ?? 0),
      ut:           (a, b) => (a.ut ?? 0) - (b.ut ?? 0),
      margen_pct:   (a, b) => (a.margen_pct ?? -Infinity) - (b.margen_pct ?? -Infinity),
    },
  )
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider">#</th>
            <SortableTh onClick={() => toggleSort('descripcion')} arrow={<SortArrow col="descripcion"/>} className="px-3 py-2 uppercase tracking-wider">Descripción</SortableTh>
            <SortableTh onClick={() => toggleSort('categoria')} arrow={<SortArrow col="categoria"/>} className="px-3 py-2 uppercase tracking-wider">Categoría</SortableTh>
            <SortableTh onClick={() => toggleSort('subcategoria')} arrow={<SortArrow col="subcategoria"/>} className="px-3 py-2 uppercase tracking-wider">Subcategoría</SortableTh>
            <SortableTh onClick={() => toggleSort('uds')} arrow={<SortArrow col="uds"/>} align="right" className="px-3 py-2 uppercase tracking-wider">Unidades</SortableTh>
            <SortableTh onClick={() => toggleSort('cop')} arrow={<SortArrow col="cop"/>} align="right" className="px-3 py-2 uppercase tracking-wider">Venta {useUsd ? 'USD' : 'COP'}</SortableTh>
            <SortableTh onClick={() => toggleSort('ut')} arrow={<SortArrow col="ut"/>} align="right" className="px-3 py-2 uppercase tracking-wider">Utilidad COP</SortableTh>
            <SortableTh onClick={() => toggleSort('margen_pct')} arrow={<SortArrow col="margen_pct"/>} align="right" className="px-3 py-2 uppercase tracking-wider">Margen %</SortableTh>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s, i) => (
            <tr key={s.sku} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
              <td className="px-3 py-2 text-gray-400 tabular-nums">{i + 1}</td>
              <td className="px-3 py-2 text-gray-800 max-w-[280px] truncate" title={s.descripcion ?? ''}>{s.descripcion ?? s.sku}</td>
              <td className="px-3 py-2 text-gray-500">{s.categoria ?? '—'}</td>
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
  )
}

/* ═════ Sub-componente: Top SKUs inventario (ordenable) ═════ */
function InvTopSkusTable({
  rows, onRowClick,
}: {
  rows: InvTopSku[]
  onRowClick: (s: InvTopSku) => void
}) {
  type Col = 'pdvs' | 'quiebres' | 'uds'
  const { toggleSort, sorted, SortArrow } = useTableSort<InvTopSku, Col>(
    rows, 'uds', 'desc',
    {
      pdvs:     (a, b) => (a.pdvs ?? 0) - (b.pdvs ?? 0),
      quiebres: (a, b) => (a.quiebres ?? 0) - (b.quiebres ?? 0),
      uds:      (a, b) => (a.uds ?? 0) - (b.uds ?? 0),
    },
  )
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50">
        <h3 className="text-sm font-semibold text-gray-700">Top SKUs · por inventario</h3>
        <p className="text-[11px] text-gray-400 mt-0.5">Click en cualquier fila para ver el detalle por PDV.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">SKU</th>
              <th className="px-3 py-2 text-left">Descripción</th>
              <th className="px-3 py-2 text-left">Categoría</th>
              <th className="px-3 py-2 text-left">Subcategoría</th>
              <SortableTh onClick={() => toggleSort('pdvs')} arrow={<SortArrow col="pdvs"/>} align="right" className="px-3 py-2">PDVs</SortableTh>
              <SortableTh onClick={() => toggleSort('quiebres')} arrow={<SortArrow col="quiebres"/>} align="right" className="px-3 py-2">Quiebres</SortableTh>
              <SortableTh onClick={() => toggleSort('uds')} arrow={<SortArrow col="uds"/>} align="right" className="px-3 py-2">Unidades</SortableTh>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, i) => (
              <tr key={s.sku ?? s.ean13 ?? i}
                  onClick={() => onRowClick(s)}
                  className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} cursor-pointer hover:bg-amber-50/60 transition-colors`}>
                <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                <td className="px-3 py-2 font-mono text-[11px] text-amber-700">{s.sku ?? '—'}</td>
                <td className="px-3 py-2 text-gray-800 max-w-[280px] truncate">{s.descripcion}</td>
                <td className="px-3 py-2 text-gray-500 text-[11px]">{s.categoria ?? '—'}</td>
                <td className="px-3 py-2 text-gray-500 text-[11px]">{s.subcategoria ?? '—'}</td>
                <td className="px-3 py-2 text-right text-gray-700 tabular-nums">{s.pdvs}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {s.quiebres > 0
                    ? <span className="text-red-600 font-semibold">{s.quiebres}</span>
                    : <span className="text-gray-300">0</span>}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-gray-800 tabular-nums">{fmtNum(s.uds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ═════ Sub-componente: Detalle Top SKUs Pareto (ordenable) ═════ */
function ParetoTopSkusTable({
  rows, moneda, fmtVal, skuVal,
}: {
  rows: TopSku[]
  moneda: 'usd' | 'cop'
  fmtVal: (v: number) => string
  skuVal: (r: TopSku) => number
}) {
  type Col = 'descripcion' | 'categoria' | 'valor_2026' | 'uni_2026' | 'share_pct' | 'delta' | 'cum_share'
  const { toggleSort, sorted, SortArrow } = useTableSort<TopSku, Col>(
    rows, 'valor_2026', 'desc',
    {
      descripcion: (a, b) => (a.descripcion ?? '').localeCompare(b.descripcion ?? ''),
      categoria:   (a, b) => (a.categoria ?? '').localeCompare(b.categoria ?? ''),
      valor_2026:  (a, b) => skuVal(a) - skuVal(b),
      uni_2026:    (a, b) => (a.uni_2026 ?? 0) - (b.uni_2026 ?? 0),
      share_pct:   (a, b) => (a.share_pct ?? 0) - (b.share_pct ?? 0),
      delta:       (a, b) => (a.delta ?? -Infinity) - (b.delta ?? -Infinity),
      cum_share:   (a, b) => (a.cum_share ?? 0) - (b.cum_share ?? 0),
    },
  )
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 text-gray-400 uppercase tracking-widest text-[10px]">
            <th className="text-center px-3 py-2.5 w-8">#</th>
            <SortableTh onClick={() => toggleSort('descripcion')} arrow={<SortArrow col="descripcion"/>} className="px-4 py-2.5">Descripción</SortableTh>
            <SortableTh onClick={() => toggleSort('categoria')} arrow={<SortArrow col="categoria"/>} className="px-3 py-2.5">Cat.</SortableTh>
            <SortableTh onClick={() => toggleSort('valor_2026')} arrow={<SortArrow col="valor_2026"/>} align="right" className="px-4 py-2.5">Valor 2026 ({moneda.toUpperCase()})</SortableTh>
            <SortableTh onClick={() => toggleSort('uni_2026')} arrow={<SortArrow col="uni_2026"/>} align="right" className="px-4 py-2.5">Unidades</SortableTh>
            <SortableTh onClick={() => toggleSort('share_pct')} arrow={<SortArrow col="share_pct"/>} align="right" className="px-4 py-2.5">Share</SortableTh>
            <SortableTh onClick={() => toggleSort('delta')} arrow={<SortArrow col="delta"/>} align="right" className="px-4 py-2.5">vs 2025</SortableTh>
            <SortableTh onClick={() => toggleSort('cum_share')} arrow={<SortArrow col="cum_share"/>} align="right" className="px-4 py-2.5">Acum.</SortableTh>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {sorted.map((r, i) => (
            <tr key={i} className={`hover:bg-gray-50/60 ${r.cum_share > 95 ? 'opacity-50' : r.cum_share > 80 ? 'opacity-75' : ''}`}>
              <td className="px-3 py-2.5 text-center text-gray-400 font-mono">{i + 1}</td>
              <td className="px-4 py-2.5 font-medium text-gray-700"><span className="text-gray-400 mr-1.5 font-normal">{r.sku}</span>{r.descripcion}</td>
              <td className="px-3 py-2.5 text-gray-400">{r.categoria}</td>
              <td className="px-4 py-2.5 text-right font-mono font-semibold text-gray-700">{fmtVal(skuVal(r))}</td>
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
  )
}

type DailyRowSku = { fecha: string; dia_str: string; mes: number; dia: number; valor_usd: number; valor_cop: number; unidades: number }


/* ═════ Sub-componente: Comparativo de 2 SKUs (Pareto) ═════ */
function ComparativoSkus({
  rows, moneda, fmtVal, skuVal, skuVal25, seg,
  sku1, setSku1, sku2, setSku2,
  vista, setVista, daily1, daily2, dailyLoading,
}: {
  rows: TopSku[]
  moneda: 'usd' | 'cop'
  fmtVal: (v: number) => string
  skuVal: (r: TopSku) => number
  skuVal25: (r: TopSku) => number
  seg: SegData | null
  sku1: string; setSku1: (s: string) => void
  sku2: string; setSku2: (s: string) => void
  vista: 'mensual' | 'diaria'; setVista: (v: 'mensual' | 'diaria') => void
  daily1: DailyRowSku[]; daily2: DailyRowSku[]
  dailyLoading: boolean
}) {
  const opts = useMemo(
    () => [...rows].sort((a, b) => skuVal(b) - skuVal(a)),
    [rows, skuVal],
  )
  const r1 = rows.find(r => r.sku === sku1) ?? null
  const r2 = rows.find(r => r.sku === sku2) ?? null

  const swap = () => { const s = sku1; setSku1(sku2); setSku2(s) }
  const clear = () => { setSku1(''); setSku2('') }

  // Serie diaria merge (por fecha) — cuando vista=diaria y hay data
  const dailyMerged = useMemo(() => {
    if (vista !== 'diaria') return [] as { dia_str: string; fecha: string; A: number; B: number }[]
    const map = new Map<string, { dia_str: string; fecha: string; A: number; B: number }>()
    for (const d of daily1) map.set(d.fecha, { fecha: d.fecha, dia_str: d.dia_str, A: Number(d.unidades ?? 0), B: 0 })
    for (const d of daily2) {
      const cur = map.get(d.fecha)
      if (cur) cur.B = Number(d.unidades ?? 0)
      else map.set(d.fecha, { fecha: d.fecha, dia_str: d.dia_str, A: 0, B: Number(d.unidades ?? 0) })
    }
    return [...map.values()].sort((a, b) => a.fecha.localeCompare(b.fecha))
  }, [vista, daily1, daily2])

  // Serie mensual por SKU (desde seguimiento.por_producto), en la moneda actual
  const monthlyByMes = useMemo(() => {
    if (!r1 || !r2 || !seg?.por_producto?.length) return [] as { mes: number; mes_nombre: string; A: number; B: number }[]
    const s1 = seg.por_producto.find(p => p.sku === r1.sku)
    const s2 = seg.por_producto.find(p => p.sku === r2.sku)
    if (!s1 && !s2) return []
    const pick = (row: SegRow | undefined, m: number) => {
      if (!row) return 0
      return Number(row.mesesUnd?.[m] ?? 0)
    }
    const meses = new Set<number>()
    ;[s1, s2].forEach(s => s && Object.keys(s.meses ?? {}).forEach(k => meses.add(Number(k))))
    return [...meses].sort((a, b) => a - b).map(m => ({
      mes: m, mes_nombre: MN12[m] ?? String(m),
      A: pick(s1, m), B: pick(s2, m),
    }))
  }, [r1, r2, seg, moneda])

  const winner = (a: number, b: number): 1 | 2 | 0 => a === b ? 0 : a > b ? 1 : 2

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-gray-800">Comparativo · SKU vs SKU</h3>
          <p className="text-[11px] text-gray-400">Selecciona dos productos para compararlos lado a lado</p>
        </div>
        {(r1 || r2) && (
          <div className="flex items-center gap-2">
            <button onClick={swap} className="text-[11px] px-2.5 py-1 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50">⇄ Intercambiar</button>
            <button onClick={clear} className="text-[11px] px-2.5 py-1 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50">Limpiar</button>
          </div>
        )}
      </div>

      {/* Selectores */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
        <SkuSelect label="SKU A" value={sku1} onChange={setSku1} opts={opts} otherValue={sku2} accent="amber" />
        <SkuSelect label="SKU B" value={sku2} onChange={setSku2} opts={opts} otherValue={sku1} accent="blue" />
      </div>

      {!r1 && !r2 && (
        <div className="text-center py-10 text-gray-300 text-sm">Selecciona SKU A y SKU B para comenzar</div>
      )}

      {(r1 || r2) && (
        <>
          {/* Tarjetas lado a lado */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <CompCard r={r1} label="SKU A" accent="amber"
              moneda={moneda} fmtVal={fmtVal} skuVal={skuVal} skuVal25={skuVal25}
              other={r2} winner={winner} side={1} />
            <CompCard r={r2} label="SKU B" accent="blue"
              moneda={moneda} fmtVal={fmtVal} skuVal={skuVal} skuVal25={skuVal25}
              other={r1} winner={winner} side={2} />
          </div>

          {/* Line chart comparativo — mensual o diaria */}
          {r1 && r2 && (
            <div>
              <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
                <p className="text-[11px] uppercase tracking-widest text-gray-400">
                  Comparación gráfica · {vista === 'mensual' ? 'evolución mensual' : 'evolución diaria'} 2026 (Unidades)
                </p>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden text-[11px]">
                  {(['mensual','diaria'] as const).map(v => (
                    <button key={v} onClick={() => setVista(v)}
                      className={`px-3 py-1 font-semibold transition-colors ${vista === v ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                      {v === 'mensual' ? 'Mensual' : 'Diaria'}
                    </button>
                  ))}
                </div>
              </div>
              {vista === 'mensual' ? (
                monthlyByMes.length === 0 ? (
                  <div className="text-center py-10 text-gray-300 text-sm">
                    Sin serie mensual disponible {seg ? '(SKUs sin ventas 2026)' : '(cargando seguimiento…)'}
                  </div>
                ) : (
                  <>
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={monthlyByMes} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                        <defs>
                          <linearGradient id="gradLineA" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%"   stopColor="#f59e0b" stopOpacity={1} />
                            <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.9} />
                          </linearGradient>
                          <linearGradient id="gradLineB" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%"   stopColor="#2563eb" stopOpacity={1} />
                            <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.9} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="mes_nombre" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#f59e0b' }} width={60} axisLine={false} tickLine={false}
                          tickFormatter={(v) => Number(v).toLocaleString('en-US')} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#2563eb' }} width={60} axisLine={false} tickLine={false}
                          tickFormatter={(v) => Number(v).toLocaleString('en-US')} />
                        <Tooltip
                          cursor={{ stroke: '#cbd5e1', strokeDasharray: '3 3' }}
                          contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                          formatter={(v: any) => Number(v).toLocaleString('en-US') + ' uds'}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line yAxisId="left"  type="monotone" dataKey="A" name={r1.descripcion} stroke="url(#gradLineA)" strokeWidth={2.5}
                          dot={{ r: 3, strokeWidth: 2, fill: '#fff', stroke: '#f59e0b' }}
                          activeDot={{ r: 5, strokeWidth: 2, fill: '#fff', stroke: '#f59e0b' }} />
                        <Line yAxisId="right" type="monotone" dataKey="B" name={r2.descripcion} stroke="url(#gradLineB)" strokeWidth={2.5}
                          dot={{ r: 3, strokeWidth: 2, fill: '#fff', stroke: '#2563eb' }}
                          activeDot={{ r: 5, strokeWidth: 2, fill: '#fff', stroke: '#2563eb' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1 text-center">
                    Eje izquierdo (ámbar) = SKU A · Eje derecho (azul) = SKU B — escalas independientes para comparar tendencia
                  </p>
                  </>
                )
              ) : (
                dailyLoading ? (
                  <div className="text-center py-10 text-gray-300 text-sm">Cargando serie diaria…</div>
                ) : dailyMerged.length === 0 ? (
                  <div className="text-center py-10 text-gray-300 text-sm">Sin ventas diarias 2026 para los SKUs seleccionados</div>
                ) : (
                  <>
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={dailyMerged} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                        <defs>
                          <linearGradient id="gradLineADay" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%"   stopColor="#f59e0b" stopOpacity={1} />
                            <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.9} />
                          </linearGradient>
                          <linearGradient id="gradLineBDay" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%"   stopColor="#2563eb" stopOpacity={1} />
                            <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.9} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="dia_str" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false}
                          interval={Math.max(0, Math.floor(dailyMerged.length / 12))} />
                        <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#f59e0b' }} width={60} axisLine={false} tickLine={false}
                          tickFormatter={(v) => Number(v).toLocaleString('en-US')} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#2563eb' }} width={60} axisLine={false} tickLine={false}
                          tickFormatter={(v) => Number(v).toLocaleString('en-US')} />
                        <Tooltip
                          cursor={{ stroke: '#cbd5e1', strokeDasharray: '3 3' }}
                          contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                          formatter={(v: any) => Number(v).toLocaleString('en-US') + ' uds'}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line yAxisId="left"  type="monotone" dataKey="A" name={r1.descripcion} stroke="url(#gradLineADay)" strokeWidth={2}
                          dot={false} activeDot={{ r: 5, strokeWidth: 2, fill: '#fff', stroke: '#f59e0b' }} />
                        <Line yAxisId="right" type="monotone" dataKey="B" name={r2.descripcion} stroke="url(#gradLineBDay)" strokeWidth={2}
                          dot={false} activeDot={{ r: 5, strokeWidth: 2, fill: '#fff', stroke: '#2563eb' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1 text-center">
                    Eje izquierdo (ámbar) = SKU A · Eje derecho (azul) = SKU B — escalas independientes
                  </p>
                  </>
                )
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SkuSelect({
  label, value, onChange, opts, otherValue, accent,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  opts: TopSku[]
  otherValue: string
  accent: 'amber' | 'blue'
}) {
  const ring = accent === 'amber' ? 'focus:ring-amber-400 border-amber-200' : 'focus:ring-blue-400 border-blue-200'
  const dot  = accent === 'amber' ? 'bg-amber-500' : 'bg-blue-600'
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1 flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${dot}`} /> {label}
      </p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full text-sm rounded-lg border bg-white px-3 py-2 focus:outline-none focus:ring-2 ${ring}`}
      >
        <option value="">— selecciona un SKU —</option>
        {opts.map(o => (
          <option key={o.sku} value={o.sku} disabled={o.sku === otherValue}>
            {o.sku} · {o.descripcion}
          </option>
        ))}
      </select>
    </div>
  )
}

function CompCard({
  r, label, accent, moneda, fmtVal, skuVal, skuVal25, other, winner, side,
}: {
  r: TopSku | null
  label: string
  accent: 'amber' | 'blue'
  moneda: 'usd' | 'cop'
  fmtVal: (v: number) => string
  skuVal: (r: TopSku) => number
  skuVal25: (r: TopSku) => number
  other: TopSku | null
  winner: (a: number, b: number) => 1 | 2 | 0
  side: 1 | 2
}) {
  const border = accent === 'amber' ? 'border-amber-200 bg-amber-50/40' : 'border-blue-200 bg-blue-50/40'
  const dot    = accent === 'amber' ? 'bg-amber-500' : 'bg-blue-600'
  const badge  = accent === 'amber' ? 'text-amber-700 bg-amber-100' : 'text-blue-700 bg-blue-100'
  if (!r) {
    return (
      <div className={`rounded-xl border ${border} border-dashed p-4 text-center text-gray-300 text-xs`}>
        <p className="mb-1 flex items-center justify-center gap-2 text-gray-400">
          <span className={`w-2 h-2 rounded-full ${dot}`} /> {label}
        </p>
        <p className="py-6">Sin selección</p>
      </div>
    )
  }
  const isWin = (a: number, b: number | undefined) =>
    b === undefined ? false : winner(a, b) === side

  const val26 = skuVal(r)
  const val25 = skuVal25(r)
  const otherVal26 = other ? skuVal(other) : undefined
  const otherVal25 = other ? skuVal25(other) : undefined
  const otherUds   = other?.uni_2026
  const otherShare = other?.share_pct
  const otherDelta = other?.delta ?? undefined
  const ticket = r.uni_2026 > 0 ? val26 / r.uni_2026 : 0
  const otherTicket = other && other.uni_2026 > 0 ? skuVal(other) / other.uni_2026 : undefined

  return (
    <div className={`rounded-xl border ${border} p-4`}>
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${dot}`} /> {label}
          </p>
          <p className="text-sm font-semibold text-gray-800 leading-snug truncate" title={r.descripcion}>{r.descripcion}</p>
          <p className="text-[11px] text-gray-400 font-mono">{r.sku} · {r.categoria}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MetricCell label={`Valor 26 ${moneda.toUpperCase()}`} value={fmtVal(val26)} win={isWin(val26, otherVal26)} badge={badge} />
        <MetricCell label="Unidades" value={r.uni_2026.toLocaleString('en-US')} win={isWin(r.uni_2026, otherUds)} badge={badge} />
        <MetricCell label={`Valor 25 ${moneda.toUpperCase()}`} value={fmtVal(val25)} win={isWin(val25, otherVal25)} badge={badge} />
        <MetricCell label="Ticket prom." value={fmtVal(ticket)} win={isWin(ticket, otherTicket)} badge={badge} />
        <MetricCell label="Share" value={`${r.share_pct.toFixed(1)}%`} win={isWin(r.share_pct, otherShare)} badge={badge} />
        <MetricCell label="vs 2025" value={r.delta !== null ? <Delta d={r.delta} /> : <span className="text-gray-300">—</span>}
          win={r.delta !== null && isWin(r.delta, otherDelta)} badge={badge} isNode />
      </div>
    </div>
  )
}

function MetricCell({
  label, value, win, badge, isNode,
}: { label: string; value: React.ReactNode; win: boolean; badge: string; isNode?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 border ${win ? 'bg-white border-transparent shadow-sm' : 'bg-white/60 border-gray-100'}`}>
      <div className="flex items-center justify-between mb-0.5">
        <p className="text-[9px] uppercase tracking-widest text-gray-400">{label}</p>
        {win && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${badge}`}>▲</span>}
      </div>
      {isNode
        ? <div className="text-sm font-semibold text-gray-800">{value}</div>
        : <p className="text-sm font-semibold text-gray-800 font-mono">{value}</p>}
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
