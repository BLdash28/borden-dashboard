'use client'
import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { TrendingUp, TrendingDown, Minus, X, RefreshCw, SlidersHorizontal } from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, ComposedChart, AreaChart, Area,
  PieChart, Pie, LabelList,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from 'recharts'
import MultiSelect from '@/components/dashboard/MultiSelect'
import ChartSkeleton from '@/components/ui/ChartSkeleton'
import {
  TendenciaMensualChart, TendenciaDiariaChart, MetricaTogglePill,
  type TendMetrica, type TendData, type TendDailyRow,
} from '@/components/ui/tendencia-chart'

const InnovacionesSection = dynamic(
  () => import('@/components/ejecucion/InnovacionesSection'),
  { loading: () => <ChartSkeleton />, ssr: false },
)
const OfertasSection = dynamic(
  () => import('@/components/ejecucion/OfertasSection').then(m => m.OfertasSection),
  { loading: () => <ChartSkeleton />, ssr: false },
)

// ── Formatters ─────────────────────────────────────────────────────────────
const fmt$    = (v: number) => '$' + Math.round(v).toLocaleString('en-US')
const fmtFull = (v: number) => '$' + (isFinite(v) ? v : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtNum  = (v: number) => Math.round(v).toLocaleString('en-US')
const fmtK    = (v: number) => {
  if (!isFinite(v)) return '$0'
  if (v >= 1e6) return '$' + (v/1e6).toFixed(2) + 'M'
  if (v >= 1e3) return '$' + (v/1e3).toFixed(1) + 'K'
  return '$' + Math.round(v)
}
const MES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const CADENA_COLORS: Record<string, string> = {
  'LA TORRE':    '#c8873a',
  'ECONOSUPER':  '#3a6fa8',
  '1 LA TORRE':  '#c8873a',
}
const SKU_LINE_COLORS = ['#c8873a', '#3a6fa8', '#2a7a58', '#a04d3a', '#7d3d34']

const SALUD_CFG: Record<string, { color: string; bg: string; label: string }> = {
  'CRÍTICO':        { color: '#dc2626', bg: '#fef2f2', label: 'Crítico <7d' },
  'ATENCIÓN':       { color: '#f59e0b', bg: '#fffbeb', label: 'Atención 7-14d' },
  'SALUDABLE':      { color: '#10b981', bg: '#f0fdf4', label: 'Saludable' },
  'COBERTURA ALTA': { color: '#06b6d4', bg: '#ecfeff', label: 'Cob Alta 60-120d' },
  'SOBRESTOCK':     { color: '#f97316', bg: '#fff7ed', label: 'Sobrestock >120d' },
  'SIN VPD':        { color: '#9ca3af', bg: '#f9fafb', label: 'Sin VPD' },
}

const SECTIONS = [
  { key: 'resumen',         label: 'Resumen'            },
  { key: 'evolucion',       label: 'Evolución Ventas'   },
  { key: 'pareto',          label: 'Pareto'             },
  { key: 'cobertura',       label: 'Cobertura'          },
  { key: 'inventarios',     label: 'Inventarios'        },
  { key: 'calidad',         label: 'Calidad Inventario' },
  { key: 'innovaciones',    label: 'Innovaciones'       },
  { key: 'ofertas',         label: 'Ofertas'            },
  { key: 'precios',         label: 'Lista de Precios'   },
  { key: 'pedidos',         label: 'Pedidos'            },
] as const
type SectionKey = typeof SECTIONS[number]['key']

// ── UI primitives ──────────────────────────────────────────────────────────
function Delta({ d }: { d: number | null }) {
  if (d === null || !isFinite(d)) return <span className="text-[11px] text-gray-300">—</span>
  const pos = d > 0.5, neg = d < -0.5
  const cls = pos ? 'text-green-600 bg-green-50' : neg ? 'text-red-500 bg-red-50' : 'text-gray-400 bg-gray-50'
  const Icon = pos ? TrendingUp : neg ? TrendingDown : Minus
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}>
      <Icon size={9} />{d > 0 ? '+' : ''}{d.toFixed(1)}%
    </span>
  )
}

function Kpi({ label, value, sub, delta, color = '#c8873a' }: {
  label: string; value: string; sub?: string; delta?: number | null; color?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4"
         style={{ borderLeftColor: color, borderLeftWidth: 4 }}>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-800 mb-1">{value}</p>
      <div className="flex items-center gap-2 text-[11px] text-gray-400">
        {delta !== undefined && <Delta d={delta ?? null} />}
        {sub && <span>{sub}</span>}
      </div>
    </div>
  )
}

function DohChip({ d }: { d: number | null | undefined }) {
  if (d === null || d === undefined) return <span className="text-gray-300">—</span>
  const color = d <= 7 ? 'text-red-600 bg-red-50' :
                d <= 14 ? 'text-amber-600 bg-amber-50' :
                d <= 60 ? 'text-emerald-700 bg-emerald-50' :
                d <= 120 ? 'text-blue-600 bg-blue-50' :
                          'text-purple-600 bg-purple-50'
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${color}`}>
      {Math.round(d)}d
    </span>
  )
}

function ProximamentePlaceholder({ section }: { section: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-16 text-center">
      <p className="text-5xl mb-4">🚧</p>
      <h3 className="text-lg font-bold text-gray-700 mb-2">Sección {section} — próximamente</h3>
      <p className="text-sm text-gray-400 max-w-md mx-auto">
        Esta sección está en desarrollo. Está pensada para escalar a medida que se cargue más
        data operativa de Unisuper (órdenes de compra, precios competencia, etc.).
      </p>
    </div>
  )
}

// ── Types ──────────────────────────────────────────────────────────────────
interface KpisData {
  ytd_2026: number; uni_2026: number
  ytd_2025: number; uni_2025: number
  delta_ytd: number | null
  ultimo_mes: number; ultimo_mes_nombre: string
  ultima_fecha: string | null
  por_cadena: { cadena: string; valor_2026: number; uni_2026: number; valor_2025: number; delta: number | null }[]
  por_categoria: { categoria: string; valor_2026: number; uni_2026: number }[]
  monthly: { mes: number; mes_nombre: string; y2025: number; y2026: number | null; u2025: number; u2026: number | null }[]
}
interface DailyRow { fecha: string; valor: number; unidades: number; tiendas: number }
interface EvoTop5Series { sku: string; descripcion: string; valor_ytd: number; monthly: { mes: number; y2025: number; y2026: number; u2025: number; u2026: number }[] }
interface CobData {
  universo: number; cobertura_efectiva: number
  por_cadena: { cadena: string; pdvs_activos: number; skus: number; uds: number; cobertura_pct: number }[]
  por_sku:    {
    sku: string; descripcion: string; subcategoria: string
    pdvs_con_venta: number; universo: number; cobertura_pct: number
    uds_90d: number; valor_90d: number
    bucket_menor_3: number; bucket_3_10: number; bucket_mayor_10: number
  }[]
}
interface InvData {
  disponible: boolean
  kpis?: { fecha_tiendas: string | null; pdv_inv: number; pdv_valor: number; pdv_tiendas_dist: number; skus_total: number }
  rows?: { sku: string; codigo_barras: string; descripcion: string; subcategoria: string; cadena: string; punto_venta: string; inv_mano: number }[]
}
interface InvSkuTiendaRow {
  sku: string; codigo_barras: string; descripcion: string; subcategoria: string
  cadena: string; punto_venta: string; nombre_tienda: string
  inv_mano: number; venta_dia: number; doh: number | null; salud: string
}
interface CalidadData {
  fecha_snap: string | null
  kpis: { total_registros: number; skus_total: number; tiendas_total: number; sin_vpd: number; critico: number; atencion: number; saludable: number; cobertura_alta: number; sobrestock: number }
  por_sku: { sku: string; descripcion: string; subcategoria: string; total_pdvs: number; sin_vpd: number; critico: number; atencion: number; saludable: number; cobertura_alta: number; sobrestock: number; inv_total: number }[]
}
interface TopSku {
  sku: string; descripcion: string; subcategoria: string
  valor_2026: number; uni_2026: number; valor_2025: number
  delta: number | null; share_pct: number; cum_share: number
}
interface FiltrosOpts {
  cadenas:       { value: string; venta: number }[]
  subcategorias: { value: string; venta: number }[]
  puntos:        { value: string; cadena: string; venta: number }[]
  skus:          { value: string; descripcion: string; subcategoria: string; venta: number }[]
}
interface CobDetalle {
  sku: string; descripcion: string | null
  bucket: 'todos' | 'menos_de_3' | 'entre_3_y_10' | 'mayor_a_10'
  loading: boolean
  pdvs: { punto_venta: string; store_nbr: string | null; cadena: string; categoria: string | null; sku: string; descripcion: string; pedidos: number; unidades: number; valor: number; ultima_venta: string | null }[]
}
interface PedidoLinea {
  linea: number; sku: string; descripcion: string; categoria: string | null; subcategoria: string | null
  cajas: number; unidades: number; kg: number; precio: number
  venta_neta: number; venta_bruta: number; descuento: number; margen: number; margen_pct: number | null
}
interface Pedido {
  numero_factura: string; fecha: string; moneda: string
  total_cajas: number; total_unidades: number; total_kg: number
  total_venta_neta: number; total_venta_bruta: number; total_descuento: number; total_margen: number
  num_lineas: number
  lineas: PedidoLinea[]
}
interface PedidosData { pais: string; cliente: string; total_pedidos: number; pedidos: Pedido[] }

// ── Componente principal ───────────────────────────────────────────────────
const SECTION_KEYS = SECTIONS.map(s => s.key) as readonly SectionKey[]
const isSectionKey = (v: string): v is SectionKey =>
  (SECTION_KEYS as readonly string[]).includes(v)

export default function UnisuperEjecucion() {
  // El tab activo se persiste en el hash de la URL (#cobertura, #inventarios, …)
  // para sobrevivir recargas y hacer el link compartible.
  const [section, setSection] = useState<SectionKey>(() => {
    if (typeof window === 'undefined') return 'resumen'
    const h = window.location.hash.slice(1)
    return isSectionKey(h) ? h : 'resumen'
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.location.hash.slice(1) !== section) {
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${section}`)
    }
  }, [section])

  // Filtros
  const [cadenasSel,  setCadenasSel]  = useState<string[]>([])
  const [subcatsSel,  setSubcatsSel]  = useState<string[]>([])
  const [pdvsSel,     setPdvsSel]     = useState<string[]>([])
  const [skusSel,     setSkusSel]     = useState<string[]>([])
  // Filtros abiertos por default (patrón Éxito). Se persiste en localStorage
  // para que al recargar mantenga la preferencia del usuario.
  const [showFiltros, setShowFiltros] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    const saved = localStorage.getItem('unisuper-gt-showFiltros')
    return saved === null ? true : saved === '1'
  })
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('unisuper-gt-showFiltros', showFiltros ? '1' : '0')
    }
  }, [showFiltros])
  const [opts, setOpts] = useState<FiltrosOpts | null>(null)

  // Moneda: la BD guarda ventas_valor en USD; para GTQ multiplicamos por tasa.
  // Tasa vigente se carga desde /api/tipo-cambio/actual (fallback 7.80).
  const [moneda, setMoneda] = useState<'gtq' | 'usd'>('gtq')
  const [TASA_GTQ_USD, setTasaGtqUsd] = useState(7.80)
  useEffect(() => {
    fetch('/api/tipo-cambio/actual?to=GTQ')
      .then(r => r.json())
      .then(d => { if (d.tasa && d.tasa > 0) setTasaGtqUsd(d.tasa) })
      .catch(() => {})
  }, [])
  const isGtq   = moneda === 'gtq'
  const symbol  = isGtq ? 'Q ' : '$'
  const conv    = (usd: number) => isGtq ? usd * TASA_GTQ_USD : usd
  const fmtVal     = (usd: number) => symbol + Math.round(conv(usd)).toLocaleString('en-US')
  const fmtValFull = (usd: number) => symbol + conv(isFinite(usd) ? usd : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtValK    = (usd: number) => {
    const v = conv(usd)
    if (!isFinite(v)) return symbol + '0'
    if (v >= 1e6) return symbol + (v/1e6).toFixed(2) + 'M'
    if (v >= 1e3) return symbol + (v/1e3).toFixed(1) + 'K'
    return symbol + Math.round(v)
  }

  // Data
  const [kpis, setKpis]     = useState<KpisData | null>(null)
  const [daily, setDaily]   = useState<DailyRow[]>([])
  const [top5, setTop5]     = useState<EvoTop5Series[]>([])
  const [tendencia, setTendencia] = useState<TendData | null>(null)
  const [tendDaily, setTendDaily] = useState<TendDailyRow[]>([])
  const [tendDailyLoading, setTendDailyLoading] = useState(false)
  const [tendVista, setTendVista] = useState<'mensual' | 'diaria'>('mensual')
  const [tendMetricas, setTendMetricas] = useState<TendMetrica[]>(['valor', 'unidades', 'precio'])
  const toggleTendMetrica = (m: TendMetrica) => {
    setTendMetricas(prev => {
      const has = prev.includes(m)
      if (has && prev.length === 1) return prev
      return has ? prev.filter(x => x !== m) : [...prev, m]
    })
  }
  const [evolVista, setEvolVista] = useState<'mensual' | 'diaria'>('mensual')
  const [cob,  setCob]      = useState<CobData  | null>(null)
  const [cobDetalle, setCobDetalle] = useState<CobDetalle | null>(null)
  const [inv,  setInv]      = useState<InvData  | null>(null)
  const [invSku, setInvSku] = useState<InvSkuTiendaRow[] | null>(null)
  const [invSaludFilter, setInvSaludFilter] = useState<string[]>([])
  const [calidad, setCalidad] = useState<CalidadData | null>(null)
  const [top, setTop]     = useState<TopSku[]>([])
  const [topN, setTopN]   = useState(50)
  const [pedidos, setPedidos] = useState<PedidosData | null>(null)
  const [pedidoExpanded, setPedidoExpanded] = useState<string | null>(null)

  const [loading, setLoading] = useState<Record<SectionKey, boolean>>({
    resumen: false, evolucion: false, cobertura: false, inventarios: false,
    calidad: false, pareto: false, innovaciones: false, ofertas: false,
    precios: false, pedidos: false,
  })

  const filterQS = useMemo(() => {
    const p = new URLSearchParams()
    if (cadenasSel.length) p.set('cadenas',       cadenasSel.join(','))
    if (subcatsSel.length) p.set('subcategorias', subcatsSel.join(','))
    if (pdvsSel.length)    p.set('punto_venta',   pdvsSel.join(','))
    if (skusSel.length)    p.set('skus',          skusSel.join(','))
    return p.toString()
  }, [cadenasSel, subcatsSel, pdvsSel, skusSel])

  useEffect(() => {
    fetch('/api/comercial/ejecucion/gt/unisuper/filtros-opciones')
      .then(r => r.json()).then(setOpts).catch(() => {})
  }, [])

  // ── Fetch por sección ────────────────────────────────────────────────────
  useEffect(() => {
    if (section === 'resumen' || section === 'evolucion') {
      setLoading(l => ({ ...l, [section]: true }))
      const fetches: Promise<any>[] = [
        fetch('/api/comercial/ejecucion/gt/unisuper/kpis?' + filterQS).then(r => r.json()),
        fetch('/api/comercial/ejecucion/gt/unisuper/tendencia-mensual?' + filterQS).then(r => r.json()),
      ]
      if (section === 'evolucion') {
        fetches.push(
          fetch('/api/comercial/ejecucion/gt/unisuper/evo-top5?' + filterQS).then(r => r.json()),
        )
      }
      Promise.all(fetches).then(([k, t, e]) => {
        setKpis(k)
        if (t) setTendencia(t)
        if (e) setTop5(e.series ?? [])
      }).finally(() => setLoading(l => ({ ...l, [section]: false })))
    } else if (section === 'cobertura') {
      setLoading(l => ({ ...l, cobertura: true }))
      Promise.all([
        fetch('/api/comercial/ejecucion/gt/unisuper/cobertura?' + filterQS).then(r => r.json()),
        // También traigo el detalle SKU × tienda para las tablas de Quiebres + Inv Bajo
        invSku === null
          ? fetch('/api/comercial/ejecucion/gt/unisuper/inventario/sku-tienda?' + filterQS).then(r => r.json())
          : Promise.resolve({ rows: invSku }),
      ]).then(([c, sk]) => {
        setCob(c)
        if (sk?.rows) setInvSku(sk.rows)
      }).finally(() => setLoading(l => ({ ...l, cobertura: false })))
    } else if (section === 'inventarios') {
      setLoading(l => ({ ...l, inventarios: true }))
      Promise.all([
        fetch('/api/comercial/ejecucion/gt/unisuper/inventario?' + filterQS).then(r => r.json()),
        fetch('/api/comercial/ejecucion/gt/unisuper/inventario/sku-tienda?' + filterQS).then(r => r.json()),
      ]).then(([iv, sk]) => {
        setInv(iv)
        setInvSku(sk.rows ?? [])
      }).finally(() => setLoading(l => ({ ...l, inventarios: false })))
    } else if (section === 'calidad') {
      setLoading(l => ({ ...l, calidad: true }))
      // Calidad usa el mismo snapshot de inventario y clasifica en frontend
      // por buckets de unidades (<3 / 3-10 / >10) para replicar el formato Éxito.
      fetch('/api/comercial/ejecucion/gt/unisuper/inventario?' + filterQS)
        .then(r => r.json()).then(setInv)
        .finally(() => setLoading(l => ({ ...l, calidad: false })))
    } else if (section === 'pareto') {
      setLoading(l => ({ ...l, pareto: true }))
      fetch('/api/comercial/ejecucion/gt/unisuper/top-skus?top=' + topN + '&' + filterQS)
        .then(r => r.json()).then(d => setTop(d.rows ?? []))
        .finally(() => setLoading(l => ({ ...l, pareto: false })))
    } else if (section === 'pedidos') {
      setLoading(l => ({ ...l, pedidos: true }))
      fetch('/api/comercial/ejecucion/gt/unisuper/pedidos?' + filterQS)
        .then(r => r.json()).then(setPedidos)
        .finally(() => setLoading(l => ({ ...l, pedidos: false })))
    }
  }, [section, filterQS, topN])

  // Cargar tendencia diaria solo cuando se cambia a vista diaria
  useEffect(() => {
    if (section !== 'evolucion' || tendVista !== 'diaria') return
    if (tendDaily.length > 0 || tendDailyLoading) return
    setTendDailyLoading(true)
    fetch('/api/comercial/ejecucion/gt/unisuper/tendencia-diaria?' + filterQS)
      .then(r => r.json())
      .then(d => setTendDaily(d.rows ?? []))
      .catch(() => setTendDaily([]))
      .finally(() => setTendDailyLoading(false))
  }, [section, tendVista, filterQS, tendDaily.length, tendDailyLoading])

  // Reset tendencia diaria al cambiar filtros
  useEffect(() => { setTendDaily([]) }, [filterQS])

  // Drill-down cobertura
  const openCobDetalle = (sku: string, descripcion: string | null,
    bucket: 'todos' | 'menos_de_3' | 'entre_3_y_10' | 'mayor_a_10' = 'todos') => {
    setCobDetalle({ sku, descripcion, bucket, loading: true, pdvs: [] })
    fetch(`/api/comercial/ejecucion/gt/unisuper/cobertura/pdvs?sku=${encodeURIComponent(sku)}&bucket=${bucket}`)
      .then(r => r.json())
      .then(d => setCobDetalle(prev => prev ? { ...prev, loading: false, pdvs: d.pdvs ?? [] } : null))
      .catch(() => setCobDetalle(prev => prev ? { ...prev, loading: false } : null))
  }

  const invSkuFiltered = invSku && invSaludFilter.length
    ? invSku.filter(r => invSaludFilter.includes(r.salud))
    : invSku

  const limpiarFiltros = () => {
    setCadenasSel([]); setSubcatsSel([]); setPdvsSel([]); setSkusSel([])
  }
  const hayFiltros = cadenasSel.length + subcatsSel.length + pdvsSel.length + skusSel.length > 0

  // ── Secciones ────────────────────────────────────────────────────────────
  const Resumen = () => {
    if (loading.resumen) return <div className="space-y-4"><ChartSkeleton /><ChartSkeleton /></div>
    if (!kpis) return null
    const soTotal   = kpis.ytd_2026 ?? 0
    const soUnits   = kpis.uni_2026 ?? 0
    const soUnits25 = kpis.uni_2025 ?? 0
    const soDelta   = kpis.delta_ytd
    const soDeltaUds = soUnits25 > 0 ? ((soUnits - soUnits25) / soUnits25) * 100 : null
    const soLast    = kpis.ultimo_mes_nombre ?? '—'
    const soAvg     = (kpis.ultimo_mes ?? 0) > 0 ? soTotal / (kpis.ultimo_mes ?? 1) : 0
    const cadenas   = kpis.por_cadena ?? []
    const porCategoria = kpis.por_categoria ?? []
    const monthlyRaw = kpis.monthly ?? []
    const monthly   = monthlyRaw.map(m => ({
      ...m,
      y2025: (m.y2025 ?? 0) > 0 ? m.y2025 : null,
    }))

    return (
      <div className="space-y-5">

        {/* Sell-Out KPI row (4 cards) */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Sell-Out</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Sell-Out YTD 2026', value: fmtValFull(soTotal), sub: `hasta ${soLast}`, icon: '🛒' },
              { label: 'vs YTD 2025',
                value: soDelta !== null ? <Delta d={soDelta} /> : <span className="text-sm text-gray-400">Sin hist.</span>,
                sub: (kpis.ytd_2025 ?? 0) > 0 ? `2025: ${fmtValFull(kpis.ytd_2025 ?? 0)}` : 'Sin dato 2025',
                icon: '📊' },
              { label: 'Unidades YTD', value: soUnits.toLocaleString('en-US'), sub: 'cajas vendidas', icon: '📦' },
              { label: 'Promedio Mensual', value: fmtVal(soAvg), sub: `${kpis.ultimo_mes ?? 0} meses`, icon: '📅' },
            ].map(c => (
              <div key={c.label} className="rounded-xl border border-gray-100 shadow-sm p-5 bg-white">
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

        {/* Por cadena cards (con barra de progreso) */}
        {cadenas.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Por Cadena · Sell-Out YTD 2026</p>
            <div className={`grid grid-cols-1 md:grid-cols-${Math.min(cadenas.length, 3)} gap-3`}>
              {cadenas.map(c => {
                const pctVal = soTotal > 0 ? ((c.valor_2026 ?? 0) / soTotal * 100) : 0
                const color = CADENA_COLORS[c.cadena] ?? '#6b7280'
                return (
                  <div key={c.cadena} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                      <p className="text-xs font-semibold text-gray-600 truncate">{c.cadena}</p>
                    </div>
                    <p className="text-xl font-bold text-gray-800">{fmtValFull(c.valor_2026 ?? 0)}</p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-gray-400">{pctVal.toFixed(1)}% del total</p>
                      {c.delta !== null ? <Delta d={c.delta} /> : <span className="text-[11px] text-gray-300">Sin 2025</span>}
                    </div>
                    <div className="mt-2 bg-gray-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full" style={{ width: `${pctVal}%`, background: color }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Evolución Sell-Out · TendenciaMensualChart con MetricaTogglePill */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-bold text-gray-800">Evolución Sell-Out · Unisuper Guatemala</h3>
              {(() => {
                let precioUlt = 0
                let refLabel = ''
                if (tendencia?.total) {
                  const withData = tendencia.total.filter(p => (p.unidades ?? 0) > 0)
                  const last = withData[withData.length - 1]
                  if (last) { precioUlt = last.precio_usd; refLabel = last.mes_str }
                }
                const precioFmt = '$' + precioUlt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                return (
                  <p className="text-[11px] text-gray-400">
                    Timeline mensual continuo
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
            <MetricaTogglePill metricas={tendMetricas} onToggle={toggleTendMetrica} activeClass="bg-amber-500 text-white" />
          </div>
          <TendenciaMensualChart
            tendencia={tendencia}
            metricas={tendMetricas}
            moneda="usd"
            skuFilter={skusSel}
          />
        </div>

        {/* Venta Valor vs Unidades — ComposedChart (barras ámbar + line azul) */}
        {monthly.length > 0 && (() => {
          const MN12 = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
          const byMes = new Map(monthly.map((m: any) => [m.mes, m]))
          const data: { mes_str: string; valor: number; unidades: number }[] = []
          for (const ano of [2025, 2026] as const) {
            for (let m = 1; m <= 12; m++) {
              const row: any = byMes.get(m)
              if (!row) continue
              const valor    = ano === 2025 ? Number(row.y2025 ?? 0) : Number(row.y2026 ?? 0)
              const unidades = ano === 2025 ? Number(row.u2025 ?? 0) : Number(row.u2026 ?? 0)
              if (valor <= 0 && unidades <= 0) continue
              data.push({ mes_str: `${MN12[m]}-${String(ano).slice(2)}`, valor, unidades })
            }
          }
          if (data.length === 0) return null
          return (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div>
                  <h3 className="text-sm font-bold text-gray-800">Venta Valor vs Unidades</h3>
                  <p className="text-[11px] text-gray-400">Timeline continuo · valor USD (barras) + unidades (línea)</p>
                </div>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500"/> Valor USD</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500 border border-blue-700"/> Unidades</span>
                </div>
              </div>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data} margin={{ top: 10, right: 16, left: 8, bottom: 4 }} barCategoryGap="18%">
                    <defs>
                      <linearGradient id="gradUniVv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity={1}/>
                        <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.75}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                    <XAxis dataKey="mes_str" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false}/>
                    <YAxis yAxisId="v" tickFormatter={fmt$} tick={{ fontSize: 11, fill: '#94a3b8' }} width={60} axisLine={false} tickLine={false}/>
                    <YAxis yAxisId="u" orientation="right" tickFormatter={(v: any) => Number(v) >= 1000 ? (Number(v)/1000).toFixed(0)+'K' : String(Math.round(Number(v)))}
                      tick={{ fontSize: 10, fill: '#2563eb' }} width={55} axisLine={false} tickLine={false}/>
                    <Tooltip
                      formatter={(v: any, name: string) => name === 'Unidades'
                        ? [Math.round(Number(v)).toLocaleString('en-US'), name]
                        : [fmtValFull(Number(v)), name]}
                      cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                      contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}/>
                    <Bar yAxisId="v" dataKey="valor" name="Valor USD" fill="url(#gradUniVv)" radius={[6,6,0,0]} maxBarSize={26}/>
                    <Line yAxisId="u" type="monotone" dataKey="unidades" name="Unidades" stroke="#2563eb" strokeWidth={2.5}
                      dot={{ r: 3, strokeWidth: 2, fill: '#fff', stroke: '#2563eb' }}
                      activeDot={{ r: 5, strokeWidth: 2, fill: '#fff', stroke: '#2563eb' }} connectNulls/>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )
        })()}

        {cadenas.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50">
              <h3 className="text-sm font-semibold text-gray-700">📋 Detalle por Cadena</h3>
              <p className="text-[11px] text-gray-400">Sell-Out YTD 2026 · Unisuper Guatemala</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-semibold">Cadena</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Valor 2026</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Unidades 2026</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Valor 2025</th>
                    <th className="px-3 py-2.5 text-right font-semibold">vs 2025</th>
                    <th className="px-3 py-2.5 text-right font-semibold bg-amber-50 text-amber-700">Share %</th>
                  </tr>
                </thead>
                <tbody>
                  {cadenas.map((c, i) => {
                    const pct = (kpis.ytd_2026 ?? 0) > 0 ? ((c.valor_2026 ?? 0) / (kpis.ytd_2026 ?? 1)) * 100 : 0
                    return (
                      <tr key={c.cadena} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                                style={{ background: CADENA_COLORS[c.cadena] ?? '#6b7280' }}>{c.cadena}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-gray-800">{fmtVal(c.valor_2026)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{fmtNum(c.uni_2026)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">{c.valor_2025 > 0 ? fmtVal(c.valor_2025) : <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-right"><Delta d={c.delta} /></td>
                        <td className="px-3 py-2.5 text-right tabular-nums bg-amber-50/40 font-bold text-amber-700">{pct.toFixed(1)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Acumulado YTD 2025 vs 2026 (patrón Éxito) */}
        {monthlyRaw.length > 0 && (() => {
          let ac25 = 0, ac26 = 0
          const acumulado = monthlyRaw.map(m => {
            ac25 += m.y2025 ?? 0
            if (m.y2026 !== null) ac26 += m.y2026
            return {
              mes_nombre: m.mes_nombre,
              acum2025: ac25 > 0 ? ac25 : null,
              acum2026: m.y2026 !== null ? ac26 : null,
            }
          })
          return (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div>
                <h3 className="text-sm font-bold text-gray-800">Acumulado YTD · 2025 vs 2026</h3>
                <p className="text-[11px] text-gray-400">Ventas acumuladas mes a mes · USD</p>
              </div>
              <div className="h-[280px] mt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={acumulado} margin={{ top: 10, right: 20, left: 8, bottom: 4 }}>
                    <defs>
                      <linearGradient id="gradUniAcum25" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.55}/>
                        <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.05}/>
                      </linearGradient>
                      <linearGradient id="gradUniAcum26" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#c8873a" stopOpacity={0.65}/>
                        <stop offset="100%" stopColor="#c8873a" stopOpacity={0.05}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="mes_nombre" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={fmtK} tick={{ fontSize: 10, fill: '#94a3b8' }} width={60} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v: any) => fmtValFull(Number(v))}
                             contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="acum2025" name="Acumulado 2025" stroke="#60a5fa" strokeWidth={2} fill="url(#gradUniAcum25)" connectNulls />
                    <Area type="monotone" dataKey="acum2026" name="Acumulado 2026" stroke="#c8873a" strokeWidth={2.5} fill="url(#gradUniAcum26)" connectNulls />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )
        })()}

        {porCategoria.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50">
              <h3 className="text-sm font-semibold text-gray-700">🏷️ Ventas por Subcategoría</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="px-3 py-2.5 text-left">Subcategoría</th>
                    <th className="px-3 py-2.5 text-right">Valor 2026</th>
                    <th className="px-3 py-2.5 text-right">Unidades</th>
                    <th className="px-3 py-2.5 text-right bg-amber-50 text-amber-700">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {porCategoria.map((c, i) => {
                    const pct = (kpis.ytd_2026 ?? 0) > 0 ? ((c.valor_2026 ?? 0) / (kpis.ytd_2026 ?? 1)) * 100 : 0
                    return (
                      <tr key={c.categoria} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className="px-3 py-2.5 font-medium text-gray-700">{c.categoria}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{fmtVal(c.valor_2026)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">{fmtNum(c.uni_2026)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums bg-amber-50/40 font-bold text-amber-700">{pct.toFixed(1)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    )
  }

  const Evolucion = () => {
    if (loading.evolucion) return <div className="space-y-4"><ChartSkeleton /><ChartSkeleton /></div>
    if (!kpis) return null

    const monthlyRaw = kpis.monthly ?? []
    const cadenasSell = kpis.por_cadena ?? []

    // ── Estadísticas del período ──
    const meses2026 = monthlyRaw.filter(m => m.y2026 !== null && m.y2026 > 0)
    const totVal2026 = meses2026.reduce((s, m) => s + (m.y2026 ?? 0), 0)
    const totUds2026 = meses2026.reduce((s, m) => s + (m.u2026 ?? 0), 0)
    const promMensualVal = meses2026.length > 0 ? totVal2026 / meses2026.length : 0
    const promMensualUds = meses2026.length > 0 ? totUds2026 / meses2026.length : 0
    const DIAS_MES: Record<number, number> = { 1:31,2:28,3:31,4:30,5:31,6:30,7:31,8:31,9:30,10:31,11:30,12:31 }
    const diasAcumulados = meses2026.reduce((s, m) => s + (DIAS_MES[m.mes] ?? 30), 0)
    const promDiarioVal = diasAcumulados > 0 ? totVal2026 / diasAcumulados : 0
    const promDiarioUds = diasAcumulados > 0 ? totUds2026 / diasAcumulados : 0

    const sortedByVal = [...meses2026].sort((a, b) => (b.y2026 ?? 0) - (a.y2026 ?? 0))
    const mejorMes = sortedByVal[0]
    const peorMes  = sortedByVal[sortedByVal.length - 1]
    const ticketMedio = totUds2026 > 0 ? totVal2026 / totUds2026 : 0

    const growthMoM: { mes_nombre: string; growth: number | null }[] = monthlyRaw.map((m, i) => {
      const prev = i > 0 ? monthlyRaw[i - 1] : null
      const g = prev && prev.y2026 && m.y2026 !== null && prev.y2026 > 0
        ? ((m.y2026 - prev.y2026) / prev.y2026) * 100
        : null
      return { mes_nombre: m.mes_nombre, growth: g }
    })
    const growthValidos = growthMoM.filter(x => x.growth !== null).map(x => x.growth as number)
    const growthPromedio = growthValidos.length > 0
      ? growthValidos.reduce((s, v) => s + v, 0) / growthValidos.length : 0

    const cadenasActivas = cadenasSell.filter(c => (c.valor_2026 ?? 0) > 0).length

    // KPIs primarios
    const soTotal = kpis.ytd_2026
    const soPrev  = kpis.ytd_2025
    const soDelta = kpis.delta_ytd
    const soLast  = kpis.ultimo_mes_nombre
    const mAct = monthlyRaw.find(m => m.mes === kpis.ultimo_mes)
    const dVal = mAct && mAct.y2025 > 0 && mAct.y2026 !== null
      ? ((mAct.y2026 - mAct.y2025) / mAct.y2025) * 100 : null
    const dUds = mAct && mAct.u2025 > 0 && mAct.u2026 !== null
      ? ((mAct.u2026 - mAct.u2025) / mAct.u2025) * 100 : null

    if (soTotal === 0) {
      return (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="py-16 text-center">
            <p className="text-3xl mb-2">📭</p>
            <p className="text-sm font-semibold text-gray-600">Sin datos de sell-out para Unisuper GT</p>
          </div>
        </div>
      )
    }

    const pieData = cadenasSell
      .filter(c => (c.valor_2026 ?? 0) > 0)
      .map(c => ({ cadena: c.cadena, valor: Number(c.valor_2026 ?? 0) }))
    const totPie = pieData.reduce((s, x) => s + x.valor, 0)

    return (
      <div className="space-y-5">

        {/* Header con 4 KPIs primarios */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-gray-800">📈 Evolución de Ventas</h3>
            <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">SELLOUT</span>
            <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">USD</span>
          </div>
          <p className="text-xs text-gray-400 mb-3">
            Unisuper Guatemala
            {cadenasSel.length > 0 && ` · ${cadenasSel.length === 1 ? cadenasSel[0] : `${cadenasSel.length} cadenas`}`}
            {subcatsSel.length > 0 && ` · ${subcatsSel.length === 1 ? subcatsSel[0] : `${subcatsSel.length} subcategorías`}`}
            {pdvsSel.length > 0 && ` · ${pdvsSel.length === 1 ? pdvsSel[0] : `${pdvsSel.length} PDVs`}`}
            {skusSel.length > 0 && ` · ${skusSel.length === 1 ? `SKU ${skusSel[0]}` : `${skusSel.length} SKUs`}`}
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className={`rounded-lg px-4 py-2.5 border ${(soDelta ?? 0) >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
              <p className={`text-[9px] font-bold uppercase tracking-widest mb-0.5 ${(soDelta ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>YTD 2026 vs 2025</p>
              <p className={`text-lg font-bold ${(soDelta ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {soPrev === 0 ? '—' : `${(soDelta ?? 0) > 0 ? '+' : ''}${(soDelta ?? 0).toFixed(1)}%`}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">{soLast ? `Ene–${soLast}` : ''}</p>
            </div>
            <div className="rounded-lg px-4 py-2.5 bg-amber-50 border border-amber-100">
              <p className="text-[9px] font-bold uppercase tracking-widest text-amber-700 mb-0.5">YTD 2026 (USD)</p>
              <p className="text-lg font-bold text-amber-700">{fmtVal(soTotal)}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{fmtNum(kpis.uni_2026 ?? 0)} und</p>
            </div>
            <div className={`rounded-lg px-4 py-2.5 border ${(dVal ?? 0) >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
              <p className={`text-[9px] font-bold uppercase tracking-widest mb-0.5 ${(dVal ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{soLast} vs 2025</p>
              <p className={`text-lg font-bold ${(dVal ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {dVal === null ? '—' : `${dVal > 0 ? '+' : ''}${dVal.toFixed(1)}%`}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">{fmtVal(mAct?.y2026 ?? 0)}</p>
            </div>
            <div className={`rounded-lg px-4 py-2.5 border ${(dUds ?? 0) >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
              <p className={`text-[9px] font-bold uppercase tracking-widest mb-0.5 ${(dUds ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{soLast} und vs 2025</p>
              <p className={`text-lg font-bold ${(dUds ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {dUds === null ? '—' : `${dUds > 0 ? '+' : ''}${dUds.toFixed(1)}%`}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">{fmtNum(mAct?.u2026 ?? 0)} und</p>
            </div>
          </div>
        </div>

        {/* Seguimiento mensual */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <h4 className="text-sm font-semibold text-gray-800">📅 Seguimiento Mensual</h4>
            <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
              {soLast} 2026
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Total YTD 2026 (USD)" value={fmtVal(soTotal)} sub={`${kpis.ultimo_mes ?? 0} meses acumulados`} color="#c8873a" />
            <Kpi label="Total YTD 2026 (und)" value={fmtNum(kpis.uni_2026 ?? 0)} sub={`${kpis.ultimo_mes ?? 0} meses acumulados`} color="#3a6fa8" />
            <Kpi label="Promedio mensual (und)" value={fmtNum(promMensualUds)} sub={`${fmtNum(promMensualUds)} und/mes`} color="#2a7a58" />
            <Kpi label={`Prom. diario (${diasAcumulados}d)`} value={fmtNum(promDiarioUds)} sub={`${fmtNum(promDiarioUds)} und/día`} color="#a04d3a" />
          </div>
        </div>

        {/* Estadísticas del período */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h4 className="text-sm font-semibold text-gray-800 mb-3">📊 Estadísticas del período</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg px-4 py-2.5 bg-gray-50 border border-gray-100">
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-0.5">Promedio mensual</p>
              <p className="text-lg font-bold text-gray-800">{fmtVal(promMensualVal)}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{fmtNum(promMensualUds)} und/mes</p>
            </div>
            <div className="rounded-lg px-4 py-2.5 bg-gray-50 border border-gray-100">
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-0.5">Promedio diario</p>
              <p className="text-lg font-bold text-gray-800">{fmtVal(promDiarioVal)}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{fmtNum(promDiarioUds)} und/día</p>
            </div>
            <div className="rounded-lg px-4 py-2.5 bg-emerald-50 border border-emerald-100">
              <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-700 mb-0.5">Mejor mes 2026</p>
              <p className="text-lg font-bold text-emerald-700">{mejorMes ? mejorMes.mes_nombre : '—'}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{mejorMes ? fmtVal(mejorMes.y2026 ?? 0) : '—'}</p>
            </div>
            <div className="rounded-lg px-4 py-2.5 bg-red-50 border border-red-100">
              <p className="text-[9px] font-bold uppercase tracking-widest text-red-700 mb-0.5">Peor mes 2026</p>
              <p className="text-lg font-bold text-red-700">{peorMes ? peorMes.mes_nombre : '—'}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{peorMes ? fmtVal(peorMes.y2026 ?? 0) : '—'}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            <div className="rounded-lg px-4 py-2.5 bg-blue-50 border border-blue-100">
              <p className="text-[9px] font-bold uppercase tracking-widest text-blue-700 mb-0.5">Ticket medio</p>
              <p className="text-lg font-bold text-blue-700">{fmtVal(ticketMedio)}</p>
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
              <p className="text-lg font-bold text-purple-700">{cadenasActivas}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">con ventas 2026</p>
            </div>
          </div>
        </div>

        {/* Chart 1: Ventas mensuales / diarias con TendenciaChart real */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
            <div>
              <h4 className="text-sm font-bold text-gray-800">
                {tendVista === 'mensual' ? 'Ventas mensuales' : 'Ventas diarias · 2026'}
              </h4>
              {(() => {
                let precioUlt = 0
                let refLabel  = ''
                if (tendVista === 'diaria' && tendDaily.length > 0) {
                  const last = tendDaily[tendDaily.length - 1]
                  precioUlt = last.unidades > 0 ? last.valor_usd / last.unidades : 0
                  refLabel = last.dia_str
                } else if (tendVista === 'mensual' && tendencia?.total) {
                  const withData = tendencia.total.filter(p => (p.unidades ?? 0) > 0)
                  const last = withData[withData.length - 1]
                  if (last) { precioUlt = last.precio_usd; refLabel = last.mes_str }
                }
                const precioFmt = '$' + precioUlt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                return (
                  <p className="text-[11px] text-gray-400">
                    {tendVista === 'mensual' ? 'Comparativo continuo · USD' : 'Tendencia diaria · USD'}
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
                  <button key={v} onClick={() => setTendVista(v)}
                    className={`px-3 py-1 font-semibold transition-colors ${tendVista === v ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    {v === 'mensual' ? 'Mensual' : 'Diaria'}
                  </button>
                ))}
              </div>
              <MetricaTogglePill metricas={tendMetricas} onToggle={toggleTendMetrica} activeClass="bg-amber-500 text-white" />
            </div>
          </div>
          {tendVista === 'mensual' ? (
            <TendenciaMensualChart
              tendencia={tendencia}
              metricas={tendMetricas}
              moneda="usd"
              skuFilter={skusSel}
            />
          ) : (
            <TendenciaDiariaChart
              rows={tendDaily}
              metricas={tendMetricas}
              moneda="usd"
              loading={tendDailyLoading}
            />
          )}
        </div>

        {/* Chart 2: Growth MoM % */}
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
                  <linearGradient id="gradUniGrowthPos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={1}/>
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0.85}/>
                  </linearGradient>
                  <linearGradient id="gradUniGrowthNeg" x1="0" y1="0" x2="0" y2="1">
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
                    <Cell key={i} fill={r.growth === null ? '#e2e8f0' : r.growth >= 0 ? 'url(#gradUniGrowthPos)' : 'url(#gradUniGrowthNeg)'} />
                  ))}
                  <LabelList dataKey="growth" position="top"
                    formatter={(v: any) => v === null || v === undefined ? '' : Number(v).toFixed(1) + '%'}
                    style={{ fontSize: 9, fill: '#4b5563', fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Distribución por cadena · Pie */}
        {pieData.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div>
              <h4 className="text-sm font-bold text-gray-800">Distribución por cadena 2026</h4>
              <p className="text-[11px] text-gray-400">Participación de ventas por cadena · USD</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3 items-center">
              <div className="md:col-span-2 h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="valor" nameKey="cadena"
                         cx="50%" cy="50%" innerRadius={60} outerRadius={100}
                         paddingAngle={2} stroke="#fff" strokeWidth={2}
                         label={(entry: any) => {
                           const pct = totPie > 0 ? (entry.valor / totPie) * 100 : 0
                           return pct >= 3 ? `${pct.toFixed(1)}%` : ''
                         }}
                         labelLine={false}>
                      {pieData.map((c, i) => (
                        <Cell key={i} fill={CADENA_COLORS[c.cadena] ?? '#c8873a'} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: unknown) => [fmtVal(Number(v)), '']}
                             contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {pieData.slice().sort((a, b) => b.valor - a.valor).map(c => {
                  const pct = totPie > 0 ? (c.valor / totPie) * 100 : 0
                  return (
                    <div key={c.cadena} className="flex items-start gap-2 text-xs">
                      <div className="w-2.5 h-2.5 rounded-sm mt-1 flex-shrink-0"
                           style={{ background: CADENA_COLORS[c.cadena] ?? '#c8873a' }} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-700 truncate">{c.cadena}</p>
                        <p className="text-[11px] text-gray-400 tabular-nums">
                          {fmtVal(c.valor)} <span className="text-gray-300">· {pct.toFixed(1)}%</span>
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Tabla Detalle por Cadena */}
        {cadenasSell.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50">
              <h3 className="text-sm font-semibold text-gray-700">📋 Detalle por Cadena</h3>
              <p className="text-[11px] text-gray-400">Sell-Out YTD 2026 · Unisuper Guatemala</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-semibold">Cadena</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Valor 2026 (USD)</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Unidades 2026</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Valor 2025 (USD)</th>
                    <th className="px-3 py-2.5 text-right font-semibold">vs 2025</th>
                    <th className="px-3 py-2.5 text-right font-semibold bg-amber-50 text-amber-700">Share %</th>
                  </tr>
                </thead>
                <tbody>
                  {cadenasSell.map((c, i) => {
                    const pct = kpis.ytd_2026 > 0 ? (c.valor_2026 / kpis.ytd_2026) * 100 : 0
                    return (
                      <tr key={c.cadena} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                                style={{ background: CADENA_COLORS[c.cadena] ?? '#6b7280' }}>{c.cadena}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-gray-800">{fmtVal(c.valor_2026)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{fmtNum(c.uni_2026)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">{c.valor_2025 > 0 ? fmtVal(c.valor_2025) : <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-right"><Delta d={c.delta} /></td>
                        <td className="px-3 py-2.5 text-right tabular-nums bg-amber-50/40 font-bold text-amber-700">{pct.toFixed(1)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    )
  }

  const Cobertura = () => {
    if (loading.cobertura) return <ChartSkeleton />
    if (!cob) return null
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Kpi label="Universo PDVs" value={fmtNum(cob.universo)} sub="Últimos 90 días" color="#3a6fa8" />
          <Kpi label="Cobertura efectiva" value={cob.cobertura_efectiva.toFixed(1) + '%'} sub="Promedio por SKU" color="#c8873a" />
          <Kpi label="SKUs activos" value={String(cob.por_sku.length)} sub="Con venta últimos 90d" color="#2a7a58" />
        </div>

        {cob.por_cadena.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50">
              <h3 className="text-sm font-semibold text-gray-700">🏪 Cobertura por Cadena</h3>
              <p className="text-[11px] text-gray-400">Últimos 90 días</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="px-3 py-2.5 text-left">Cadena</th>
                    <th className="px-3 py-2.5 text-right">PDVs activos</th>
                    <th className="px-3 py-2.5 text-right">SKUs vendidos</th>
                    <th className="px-3 py-2.5 text-right">Unidades</th>
                  </tr>
                </thead>
                <tbody>
                  {cob.por_cadena.map((c, i) => (
                    <tr key={c.cadena} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                              style={{ background: CADENA_COLORS[c.cadena] ?? '#6b7280' }}>{c.cadena}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(c.pdvs_activos)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{c.skus}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(c.uds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {cob.por_sku.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50">
              <h3 className="text-sm font-semibold text-gray-700">📦 Cobertura por SKU · Distribución por frecuencia</h3>
              <p className="text-[11px] text-gray-400">
                Clic en el número de PDVs de cada bucket para ver detalle · &lt;3 pedidos (bajo) · 3-10 (medio) · &gt;10 (fuerte)
              </p>
            </div>
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider sticky top-0">
                  <tr>
                    <th className="px-3 py-2.5 text-left">SKU</th>
                    <th className="px-3 py-2.5 text-left">Producto</th>
                    <th className="px-3 py-2.5 text-right">PDVs</th>
                    <th className="px-3 py-2.5 text-right bg-blue-50 text-blue-700">Cobertura</th>
                    <th className="px-3 py-2.5 text-right bg-red-50 text-red-700">&lt;3 pedidos</th>
                    <th className="px-3 py-2.5 text-right bg-amber-50 text-amber-700">3-10</th>
                    <th className="px-3 py-2.5 text-right bg-emerald-50 text-emerald-700">&gt;10</th>
                    <th className="px-3 py-2.5 text-right">Uds 90d</th>
                    <th className="px-3 py-2.5 text-right">Valor 90d</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {cob.por_sku.map(r => (
                    <tr key={r.sku} className="hover:bg-gray-50/60">
                      <td className="px-3 py-2 font-mono text-[10px] text-gray-500">{r.sku}</td>
                      <td className="px-3 py-2 font-medium text-gray-700 max-w-[240px] truncate">{r.descripcion}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <button onClick={() => openCobDetalle(r.sku, r.descripcion, 'todos')}
                          className="font-semibold text-blue-600 hover:underline">
                          {r.pdvs_con_venta}/{r.universo}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums bg-blue-50/30 font-bold text-blue-700">{r.cobertura_pct.toFixed(1)}%</td>
                      <td className="px-3 py-2 text-right tabular-nums bg-red-50/20">
                        <button onClick={() => openCobDetalle(r.sku, r.descripcion, 'menos_de_3')}
                          className="text-red-700 font-semibold hover:underline">{r.bucket_menor_3}</button>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums bg-amber-50/20">
                        <button onClick={() => openCobDetalle(r.sku, r.descripcion, 'entre_3_y_10')}
                          className="text-amber-700 font-semibold hover:underline">{r.bucket_3_10}</button>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums bg-emerald-50/20">
                        <button onClick={() => openCobDetalle(r.sku, r.descripcion, 'mayor_a_10')}
                          className="text-emerald-700 font-semibold hover:underline">{r.bucket_mayor_10}</button>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtNum(r.uds_90d)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtVal(r.valor_90d)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tablas Quiebres + Inv Bajo — patrón Éxito */}
        {invSku && invSku.length > 0 && (() => {
          const quiebres = invSku.filter(r => r.inv_mano === 0)
          const bajos    = invSku.filter(r => r.inv_mano > 0 && r.inv_mano <= 3)
          return (
            <>
              {quiebres.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700">🚨 Quiebres de Stock</h3>
                      <p className="text-xs text-gray-400">Combinaciones PDV × SKU con inv = 0 en último snapshot</p>
                    </div>
                    <span className="text-xs font-bold text-red-600 bg-red-50 px-3 py-1 rounded-full">{quiebres.length} casos</span>
                  </div>
                  <div className="overflow-x-auto max-h-[400px]">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left">Cadena</th>
                          <th className="px-3 py-2 text-left">Tienda</th>
                          <th className="px-3 py-2 text-left">SKU</th>
                          <th className="px-3 py-2 text-left">Descripción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quiebres.slice(0, 500).map((d, i) => (
                          <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                            <td className="px-3 py-2">
                              <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                                    style={{ background: CADENA_COLORS[d.cadena] ?? '#6b7280' }}>{d.cadena}</span>
                            </td>
                            <td className="px-3 py-2 text-gray-800 max-w-[220px] truncate">{d.punto_venta}</td>
                            <td className="px-3 py-2 font-mono text-[11px] text-gray-500">{d.sku}</td>
                            <td className="px-3 py-2 text-gray-700 max-w-[280px] truncate">{d.descripcion}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {bajos.length > 0 && (
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
                          <th className="px-3 py-2 text-left">Tienda</th>
                          <th className="px-3 py-2 text-left">SKU</th>
                          <th className="px-3 py-2 text-left">Descripción</th>
                          <th className="px-3 py-2 text-right">Unidades</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bajos.slice(0, 500).map((d, i) => (
                          <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                            <td className="px-3 py-2">
                              <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                                    style={{ background: CADENA_COLORS[d.cadena] ?? '#6b7280' }}>{d.cadena}</span>
                            </td>
                            <td className="px-3 py-2 text-gray-800 max-w-[220px] truncate">{d.punto_venta}</td>
                            <td className="px-3 py-2 font-mono text-[11px] text-gray-500">{d.sku}</td>
                            <td className="px-3 py-2 text-gray-700 max-w-[240px] truncate">{d.descripcion}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-orange-700 font-bold">{d.inv_mano}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )
        })()}
      </div>
    )
  }

  const Inventarios = () => {
    if (loading.inventarios) return <ChartSkeleton />
    if (!inv || !inv.disponible) return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
        <p className="text-3xl mb-2">📦</p>
        <p className="text-sm font-semibold text-gray-600">Sin snapshot de inventario disponible</p>
        <p className="text-xs text-gray-400 mt-1">Cargá un archivo de inventario_unisuper para activar esta sección</p>
      </div>
    )
    const k = inv.kpis!
    const rows = inv.rows ?? []
    // pdv_valor viene en GTQ del endpoint. Si moneda='usd', dividimos por tasa.
    const fmtValorInv = (gtq: number) => isGtq
      ? 'Q ' + Math.round(gtq).toLocaleString('en-US')
      : '$' + Math.round(gtq / TASA_GTQ_USD).toLocaleString('en-US')

    // Agregación por cadena
    const byCadenaMap = new Map<string, { cadena: string; pdvs: Set<string>; skus: Set<string>; combos: number; con_stock: number; uds: number }>()
    for (const r of rows) {
      const key = r.cadena ?? '—'
      let a = byCadenaMap.get(key)
      if (!a) { a = { cadena: key, pdvs: new Set(), skus: new Set(), combos: 0, con_stock: 0, uds: 0 }; byCadenaMap.set(key, a) }
      a.pdvs.add(r.punto_venta)
      a.skus.add(r.sku)
      a.combos += 1
      if (r.inv_mano > 0) a.con_stock += 1
      a.uds += r.inv_mano
    }
    const porCadena = Array.from(byCadenaMap.values())
      .map(a => ({ cadena: a.cadena, pdvs: a.pdvs.size, skus: a.skus.size, combos: a.combos, con_stock: a.con_stock, uds: a.uds }))
      .sort((a, b) => b.uds - a.uds)
    const totalUds = porCadena.reduce((s, x) => s + x.uds, 0)

    // Top SKUs por inventario
    const bySkuMap = new Map<string, { sku: string; descripcion: string; subcategoria: string; pdvs: Set<string>; uds: number }>()
    for (const r of rows) {
      let a = bySkuMap.get(r.sku)
      if (!a) { a = { sku: r.sku, descripcion: r.descripcion, subcategoria: r.subcategoria, pdvs: new Set(), uds: 0 }; bySkuMap.set(r.sku, a) }
      a.pdvs.add(r.punto_venta)
      a.uds += r.inv_mano
    }
    const topSkus = Array.from(bySkuMap.values())
      .map(a => ({ ...a, pdvs: a.pdvs.size }))
      .sort((a, b) => b.uds - a.uds)
      .slice(0, 30)

    const combosTotal   = rows.length
    const skusConStock  = bySkuMap.size

    return (
      <div className="space-y-5">
        {/* Header estilo Éxito */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                Inventario · Unisuper GT
              </p>
              <h2 className="text-base font-bold text-gray-800 mt-0.5">
                Snapshot al <strong>{k.fecha_tiendas ?? '—'}</strong>
              </h2>
              <p className="text-xs text-gray-500 mt-1">Valores en GTQ (quetzales).</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <Kpi label="Total unidades"  value={fmtNum(k.pdv_inv)}  sub={`${k.pdv_tiendas_dist} PDVs`}                    color="#3a6fa8" />
            <Kpi label="Valor inventario" value={fmtValorInv(k.pdv_valor)} sub={moneda.toUpperCase()} color="#c8873a" />
            <Kpi label="SKUs con stock"   value={String(skusConStock)} sub={`de ${combosTotal.toLocaleString('en-US')} combos`} color="#2a7a58" />
            <Kpi label="Tiendas activas"  value={String(k.pdv_tiendas_dist)} sub={`${porCadena.length} cadenas`}          color="#a04d3a" />
          </div>
        </div>

        {/* Por Cadena */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">Por Cadena</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Distribución de inventario por cadena.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-2 text-left">Cadena</th>
                  <th className="px-4 py-2 text-right">PDVs</th>
                  <th className="px-4 py-2 text-right">SKUs</th>
                  <th className="px-4 py-2 text-right">Combos</th>
                  <th className="px-4 py-2 text-right">Unidades</th>
                  <th className="px-4 py-2 text-right">% Total</th>
                </tr>
              </thead>
              <tbody>
                {porCadena.map(c => {
                  const pct = totalUds > 0 ? (c.uds / totalUds) * 100 : 0
                  const color = CADENA_COLORS[c.cadena] ?? '#6b7280'
                  return (
                    <tr key={c.cadena} className="border-b border-gray-50">
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                          <span className="font-semibold text-gray-800">{c.cadena}</span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-700 tabular-nums">{c.pdvs}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums">{c.skus}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums">{c.combos.toLocaleString('en-US')}</td>
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
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">Top SKUs por Inventario</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Los 30 productos con mayor stock consolidado.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-2 text-left">SKU</th>
                  <th className="px-4 py-2 text-left">Producto</th>
                  <th className="px-4 py-2 text-left">Subcategoría</th>
                  <th className="px-4 py-2 text-right">PDVs</th>
                  <th className="px-4 py-2 text-right">Unidades</th>
                </tr>
              </thead>
              <tbody>
                {topSkus.map(s => (
                  <tr key={s.sku} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className="px-4 py-2.5 font-mono text-[11px] text-gray-500">{s.sku}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-800 max-w-[280px] truncate">{s.descripcion}</td>
                    <td className="px-4 py-2.5 text-gray-500">{s.subcategoria ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700 tabular-nums">{s.pdvs}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-800 tabular-nums">{fmtNum(s.uds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {invSku && invSku.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50">
              <h3 className="text-sm font-semibold text-gray-700">🏬 Inventario por SKU × Tienda</h3>
              <p className="text-[11px] text-gray-400">Con DOH calculado (stock / velocidad 90d) y clasificación de salud</p>
            </div>

            <div className="px-5 py-3 bg-gray-50/60 border-b border-gray-100 flex items-end gap-x-3 gap-y-2 flex-wrap text-xs">
              <div className="w-56">
                <MultiSelect
                  label="Salud"
                  options={['CRÍTICO', 'ATENCIÓN', 'SALUDABLE', 'COBERTURA ALTA', 'SOBRESTOCK', 'SIN VPD']
                    .map(s => ({ value: s, label: s }))}
                  value={invSaludFilter} onChange={setInvSaludFilter} placeholder="Todas"
                />
              </div>
              <span className="text-gray-400 pb-2">{invSkuFiltered?.length.toLocaleString('en-US')} filas</span>
            </div>

            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider sticky top-0">
                  <tr>
                    <th className="px-3 py-2.5 text-left">Producto</th>
                    <th className="px-3 py-2.5 text-left">Cadena</th>
                    <th className="px-3 py-2.5 text-left">Tienda</th>
                    <th className="px-3 py-2.5 text-right">VPD u/d</th>
                    <th className="px-3 py-2.5 text-right">Inv u</th>
                    <th className="px-3 py-2.5 text-right">DOH</th>
                    <th className="px-3 py-2.5 text-center">Salud</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {invSkuFiltered?.slice(0, 500).map((r, i) => {
                    const cfg = SALUD_CFG[r.salud] ?? { color: '#9ca3af', bg: '#f9fafb', label: r.salud }
                    return (
                      <tr key={i} className="hover:bg-gray-50/60">
                        <td className="px-3 py-2 font-medium text-gray-700 max-w-[240px]">
                          <p className="truncate">{r.descripcion}</p>
                          <p className="text-[9px] text-gray-400 font-mono">{r.sku}</p>
                        </td>
                        <td className="px-3 py-2">
                          <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold text-white"
                                style={{ background: CADENA_COLORS[r.cadena] ?? '#6b7280' }}>{r.cadena}</span>
                        </td>
                        <td className="px-3 py-2 text-gray-600 max-w-[180px] truncate">{r.punto_venta}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-500">{r.venta_dia > 0 ? r.venta_dia.toFixed(1) : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtNum(r.inv_mano)}</td>
                        <td className="px-3 py-2 text-right"><DohChip d={r.doh} /></td>
                        <td className="px-3 py-2 text-center">
                          <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold whitespace-nowrap"
                                style={{ backgroundColor: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {invSkuFiltered && invSkuFiltered.length > 500 && (
                <p className="text-center py-3 text-[11px] text-gray-400 bg-gray-50">Mostrando primeras 500 filas de {invSkuFiltered.length.toLocaleString('en-US')}</p>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  const Calidad = () => {
    if (loading.calidad) return <ChartSkeleton />
    if (!inv || !inv.disponible) return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
        <p className="text-3xl mb-2">📊</p>
        <p className="text-sm font-semibold text-gray-600">Sin snapshot de inventario disponible</p>
        <p className="text-xs text-gray-400 mt-1">Cargá un archivo de inventario_unisuper para activar esta sección</p>
      </div>
    )
    const rowsInv = inv.rows ?? []
    if (rowsInv.length === 0) return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
        <p className="text-3xl mb-2">📊</p>
        <p className="text-sm font-semibold text-gray-600">Sin datos de calidad</p>
      </div>
    )

    // Agregación por SKU con buckets por unidades (patrón Éxito)
    // Menos de 3 · Entre 3 y 10 · Mayor a 10 — solo PDVs con inv > 0
    const bySku = new Map<string, { sku: string; descripcion: string; menos_de_3: number; entre_3_y_10: number; mayor_a_10: number; total_pdvs: number }>()
    const allPdvs = new Set<string>()
    for (const r of rowsInv) {
      allPdvs.add(r.punto_venta)
      if (r.inv_mano <= 0) continue
      let a = bySku.get(r.sku)
      if (!a) { a = { sku: r.sku, descripcion: r.descripcion, menos_de_3: 0, entre_3_y_10: 0, mayor_a_10: 0, total_pdvs: 0 }; bySku.set(r.sku, a) }
      if (r.inv_mano < 3)       a.menos_de_3   += 1
      else if (r.inv_mano <= 10) a.entre_3_y_10 += 1
      else                      a.mayor_a_10   += 1
      a.total_pdvs += 1
    }
    const universo = allPdvs.size
    const pdvsConStock = new Set(rowsInv.filter(r => r.inv_mano > 0).map(r => r.punto_venta)).size

    const rows = Array.from(bySku.values())
      .filter(r => r.total_pdvs > 0)
      .map(r => ({
        ...r,
        pct_menos_de_3:   r.total_pdvs > 0 ? (r.menos_de_3   / r.total_pdvs) * 100 : 0,
        pct_entre_3_y_10: r.total_pdvs > 0 ? (r.entre_3_y_10 / r.total_pdvs) * 100 : 0,
        pct_mayor_a_10:   r.total_pdvs > 0 ? (r.mayor_a_10   / r.total_pdvs) * 100 : 0,
        cobertura_pct:    universo > 0 ? (r.total_pdvs / universo) * 100 : 0,
      }))
      .sort((a, b) => b.total_pdvs - a.total_pdvs)

    const t = rows.reduce((acc, r) => ({
      menos_de_3:   acc.menos_de_3   + r.menos_de_3,
      entre_3_y_10: acc.entre_3_y_10 + r.entre_3_y_10,
      mayor_a_10:   acc.mayor_a_10   + r.mayor_a_10,
      total_pdvs:   acc.total_pdvs   + r.total_pdvs,
    }), { menos_de_3: 0, entre_3_y_10: 0, mayor_a_10: 0, total_pdvs: 0 })
    const coberturaEfectiva = universo > 0 ? (pdvsConStock / universo) * 100 : 0
    const pctCritico   = t.total_pdvs > 0 ? (t.menos_de_3 / t.total_pdvs) * 100 : 0
    const pctSaludable = t.total_pdvs > 0 ? (t.mayor_a_10 / t.total_pdvs) * 100 : 0

    const chartData = rows.slice(0, 15).map(r => ({
      producto: (r.descripcion ?? r.sku).split(' ').slice(0, 4).join(' '),
      sku: r.sku,
      'Menos de 3':   r.menos_de_3,
      'Entre 3 y 10': r.entre_3_y_10,
      'Mayor a 10':   r.mayor_a_10,
    }))

    return (
      <div className="space-y-5">
        {/* Header + KPIs */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                Calidad de Inventario · Unisuper GT
              </p>
              <h2 className="text-base font-bold text-gray-800 mt-0.5">Nivel de inventario por SKU</h2>
              <p className="text-xs text-gray-500 mt-1">
                Snapshot al <strong>{inv.kpis?.fecha_tiendas ?? '—'}</strong> · Universo: <strong>{universo}</strong> PDVs con presencia Borden.
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
              <p className="text-2xl font-bold text-blue-700">{coberturaEfectiva.toFixed(1)}%</p>
              <p className="text-[10px] text-blue-600 mt-0.5">{pdvsConStock} / {universo} PDVs con al menos 1 SKU</p>
            </div>
          </div>
        </div>

        {/* Chart apilado */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-bold text-gray-800">Distribución de PDVs por Nivel de Stock</h3>
              <p className="text-[11px] text-gray-400">Cantidad de PDVs con inventario por producto (top 15)</p>
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
                  <linearGradient id="gradCriticoUni" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={1}/>
                    <stop offset="100%" stopColor="#f87171" stopOpacity={0.85}/>
                  </linearGradient>
                  <linearGradient id="gradMedioUni" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={1}/>
                    <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.85}/>
                  </linearGradient>
                  <linearGradient id="gradSaludableUni" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={1}/>
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0.85}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="producto" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false}
                  angle={-30} textAnchor="end" interval={0} height={80} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                  contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
                <Bar dataKey="Menos de 3"   stackId="a" fill="url(#gradCriticoUni)"   radius={[0,0,0,0]} maxBarSize={40} />
                <Bar dataKey="Entre 3 y 10" stackId="a" fill="url(#gradMedioUni)"     radius={[0,0,0,0]} maxBarSize={40} />
                <Bar dataKey="Mayor a 10"   stackId="a" fill="url(#gradSaludableUni)" radius={[8,8,0,0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tabla nivel inventario — detalle por producto */}
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
                {rows.map((r, i) => (
                  <tr key={r.sku} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
                    <td className="px-4 py-2.5 font-medium text-gray-800">
                      {r.descripcion ?? r.sku}
                      <span className="ml-2 text-[10px] text-gray-400 font-mono">{r.sku}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {r.menos_de_3 > 0
                        ? <span className="inline-block min-w-[38px] px-2 py-0.5 rounded font-semibold bg-red-100 text-red-700">{r.menos_de_3}</span>
                        : <span className="inline-block min-w-[38px] px-2 py-0.5 text-gray-300">0</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {r.entre_3_y_10 > 0
                        ? <span className="inline-block min-w-[38px] px-2 py-0.5 rounded font-semibold bg-amber-100 text-amber-700">{r.entre_3_y_10}</span>
                        : <span className="inline-block min-w-[38px] px-2 py-0.5 text-gray-300">0</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {r.mayor_a_10 > 0
                        ? <span className="inline-block min-w-[38px] px-2 py-0.5 rounded font-semibold bg-emerald-100 text-emerald-700">{r.mayor_a_10}</span>
                        : <span className="inline-block min-w-[38px] px-2 py-0.5 text-gray-300">0</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums bg-gray-50/60 font-bold text-gray-800">{r.total_pdvs}</td>
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
                  <td className="px-3 py-2.5 text-right tabular-nums text-blue-300"
                      title="Cobertura efectiva: PDVs distintos con al menos 1 SKU con stock / universo total">
                    {coberturaEfectiva.toFixed(1)}% <span className="text-[9px] font-normal text-gray-400">efectiva</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Composición % */}
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
                {rows.map((r, i) => (
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
      </div>
    )
  }

  const Pareto = () => {
    if (loading.pareto) return <ChartSkeleton />
    if (top.length === 0) return null
    const grandTotal = top.reduce((s, r) => s + r.valor_2026, 0)
    return (
      <div className="space-y-5">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-4 items-end">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Top N</p>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {[10, 20, 30, 50, 100].map(n => (
                <button key={n} onClick={() => setTopN(n)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${topN === n ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {n === 100 ? 'Todos' : n}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Pareto SKUs — Sell-Out YTD 2026</h3>
          <p className="text-xs text-gray-400 mb-4">Valor en dólares · curva acumulada</p>
          <div style={{ height: Math.max(360, 260 + top.length * 4) }}>
            <ResponsiveContainer>
              <ComposedChart data={top} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="descripcion" tick={{ fontSize: 10, fill: '#475569' }}
                       interval={0} angle={-55} textAnchor="end" height={170}
                       tickFormatter={(v: string) => v && v.length > 26 ? v.slice(0, 24) + '…' : v} />
                <YAxis yAxisId="left"  tickFormatter={fmtK} tick={{ fontSize: 11 }} width={50} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={v => v + '%'} tick={{ fontSize: 11 }} width={35} domain={[0, 100]} />
                <Tooltip formatter={(v: any, n: string) => n === 'Acumulado %' ? v + '%' : fmtValFull(Number(v))}
                         contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, maxWidth: 320 }} />
                <Bar yAxisId="left" dataKey="valor_2026" name="Valor 2026" radius={[2, 2, 0, 0]}>
                  {top.map((r, i) => (
                    <Cell key={i} fill={r.cum_share <= 80 ? '#c8873a' : r.cum_share <= 95 ? '#94a3b8' : '#e2e8f0'} />
                  ))}
                </Bar>
                <Line yAxisId="right" type="monotone" dataKey="cum_share" name="Acumulado %" stroke="#1d4ed8" strokeWidth={1.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3">
            {[['#c8873a', 'Clase A (≤80%)'], ['#94a3b8', 'Clase B (80–95%)'], ['#e2e8f0', 'Clase C (>95%)']].map(([c, l]) => (
              <div key={l} className="flex items-center gap-1.5 text-[11px] text-gray-500">
                <div className="w-3 h-3 rounded-sm" style={{ background: c }} />{l}
              </div>
            ))}
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <div className="w-6 h-0.5 rounded-full" style={{ background: '#1d4ed8' }} /> Acumulado %
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Detalle por SKU</h3>
              <p className="text-xs text-gray-400">YTD 2026 · sell-out Unisuper GT</p>
            </div>
            {grandTotal > 0 && <span className="text-xs font-semibold text-gray-500">{fmtValFull(grandTotal)} total</span>}
          </div>
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider sticky top-0">
                <tr>
                  <th className="px-3 py-2.5 text-left">#</th>
                  <th className="px-3 py-2.5 text-left">SKU</th>
                  <th className="px-3 py-2.5 text-left">Producto</th>
                  <th className="px-3 py-2.5 text-right">Valor 2026</th>
                  <th className="px-3 py-2.5 text-right">Unid</th>
                  <th className="px-3 py-2.5 text-right">vs 2025</th>
                  <th className="px-3 py-2.5 text-right bg-amber-50 text-amber-700">Share</th>
                  <th className="px-3 py-2.5 text-right bg-blue-50 text-blue-700">Acum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {top.map((r, i) => (
                  <tr key={r.sku} className="hover:bg-gray-50/60">
                    <td className="px-3 py-2 text-gray-400 tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-gray-500">{r.sku}</td>
                    <td className="px-3 py-2 font-medium text-gray-700 max-w-[280px] truncate">{r.descripcion}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtVal(r.valor_2026)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-500">{fmtNum(r.uni_2026)}</td>
                    <td className="px-3 py-2 text-right"><Delta d={r.delta} /></td>
                    <td className="px-3 py-2 text-right tabular-nums bg-amber-50/30 font-bold text-amber-700">{r.share_pct.toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right tabular-nums bg-blue-50/30 font-bold text-blue-700">{r.cum_share.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  const PedidosList = () => {
    if (loading.pedidos && !pedidos) return <ChartSkeleton />
    if (!pedidos || pedidos.pedidos.length === 0) {
      return (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
          <p className="text-3xl mb-2">📄</p>
          <p className="text-sm font-semibold text-gray-600">Sin pedidos registrados</p>
          <p className="text-xs text-gray-400 mt-1">No hay facturas de Sell-In cargadas para Unisuper Guatemala.</p>
        </div>
      )
    }
    const fmtDate = (iso: string) => {
      const [y, m, d] = iso.split('-')
      return `${d}/${m}/${y.slice(2)}`
    }
    return (
      <div className="space-y-3">
        <div className="flex items-baseline gap-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Pedidos Sell-In</p>
          <p className="text-xs text-gray-500">{pedidos.total_pedidos} facturas · Unisuper Guatemala</p>
        </div>
        {pedidos.pedidos.map(p => {
          const isOpen = pedidoExpanded === p.numero_factura
          return (
            <div key={p.numero_factura} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <button
                onClick={() => setPedidoExpanded(isOpen ? null : p.numero_factura)}
                className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 text-left">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="text-xs text-gray-400">{fmtDate(p.fecha)}</span>
                  <span className="font-mono text-sm font-semibold text-gray-800">{p.numero_factura}</span>
                  <span className="text-[10px] font-bold uppercase text-gray-400 tracking-widest">
                    {p.num_lineas} línea{p.num_lineas === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="flex items-center gap-5 flex-wrap">
                  <div className="text-right">
                    <p className="text-[9px] uppercase text-gray-400 tracking-widest">Cajas</p>
                    <p className="text-sm font-semibold text-gray-800 tabular-nums">{fmtNum(p.total_cajas)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] uppercase text-gray-400 tracking-widest">Venta {p.moneda}</p>
                    <p className="text-sm font-semibold text-gray-800 tabular-nums">{fmtVal(p.total_venta_neta)}</p>
                  </div>
                  <span className={`text-xs text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
                </div>
              </button>
              {isOpen && (
                <div className="border-t border-gray-100 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="px-3 py-2 text-left w-10">#</th>
                        <th className="px-3 py-2 text-left w-20">SKU</th>
                        <th className="px-3 py-2 text-left">Descripción</th>
                        <th className="px-3 py-2 text-left w-24">Subcategoría</th>
                        <th className="px-3 py-2 text-right w-16">Cajas</th>
                        <th className="px-3 py-2 text-right w-20">Precio</th>
                        <th className="px-3 py-2 text-right w-24">Venta neta</th>
                        <th className="px-3 py-2 text-right w-16">Margen %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.lineas.map(l => (
                        <tr key={l.linea} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="px-3 py-1.5 text-gray-400 tabular-nums">{l.linea}</td>
                          <td className="px-3 py-1.5 font-mono text-gray-600">{l.sku}</td>
                          <td className="px-3 py-1.5 text-gray-800">{l.descripcion}</td>
                          <td className="px-3 py-1.5 text-gray-500">{l.subcategoria ?? '—'}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(l.cajas)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{l.precio.toFixed(2)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{fmtVal(l.venta_neta)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{l.margen_pct !== null ? l.margen_pct.toFixed(1) + '%' : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  const renderSection = () => {
    switch (section) {
      case 'resumen':         return <Resumen />
      case 'evolucion':       return <Evolucion />
      case 'cobertura':       return <Cobertura />
      case 'inventarios':     return <Inventarios />
      case 'calidad':         return <Calidad />
      case 'pareto':          return <Pareto />
      case 'innovaciones':    return (
        <InnovacionesSection
          apiUrl="/api/comercial/ejecucion/gt/unisuper/innovaciones"
          titulo="Unisuper · Guatemala"
          subtitulo="🇬🇹 Detección automática: SKUs con primera venta en los últimos 180 días."
          monedaLabel="USD"
        />
      )
      case 'ofertas':         return <OfertasSection pais="GT" cadena="UNISUPER" />
      case 'precios':         return <ProximamentePlaceholder section="Lista de Precios" />
      case 'pedidos':         return <PedidosList />
      default: return <Resumen />
    }
  }

  // Memoizar el JSX del contenido para no re-renderizar al abrir/cerrar filtros
  // (showFiltros / hayFiltros no están en las deps). Solo se recomputa cuando
  // cambia algo que realmente afecta el render de la sección.
  const sectionJsx = useMemo(() => renderSection(), [
    section, kpis, tendencia, tendDaily, tendDailyLoading, tendVista, tendMetricas,
    cob, cobDetalle, inv, invSku, invSaludFilter, calidad, top, topN,
    daily, top5, pedidos, pedidoExpanded, moneda, evolVista, loading,
  ]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-5">
      {/* Header estilo Éxito: eyebrow + título grande + subtítulo + Actualizar */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Ejecución Unisuper</p>
          <h1 className="text-2xl font-bold text-gray-800">🇬🇹 Unisuper · Borden</h1>
          <p className="text-sm text-gray-400 mt-0.5">Guatemala · Sell-Out diario</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm">
          <RefreshCw size={13} className={Object.values(loading).some(Boolean) ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {/* Barra de filtros — patrón Éxito: chips resumen + toggle moneda pill group + reset */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4"
           style={{ ['--acc' as any]: '#f59e0b', ['--bg' as any]: '#ffffff', ['--surface' as any]: '#ffffff',
                    ['--border' as any]: '#e5e7eb', ['--t1' as any]: '#111827', ['--t2' as any]: '#374151', ['--t3' as any]: '#6b7280' }}>
        {/* Barra top: botón filtros + chips resumen · moneda · reset */}
        <div className="flex items-center flex-wrap gap-3 justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => setShowFiltros(v => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-lg">
              <SlidersHorizontal size={12} /> Filtros {showFiltros ? '▲' : '▼'}
            </button>
            {/* Chips resumen de selección */}
            {[
              { label: 'Cadena',       items: cadenasSel, onClear: () => setCadenasSel([]) },
              { label: 'Subcategoría', items: subcatsSel, onClear: () => setSubcatsSel([]) },
              { label: 'Tienda',       items: pdvsSel,    onClear: () => setPdvsSel([])    },
              { label: 'SKU',          items: skusSel,    onClear: () => setSkusSel([])    },
            ].filter(c => c.items.length > 0).map(c => (
              <span key={c.label}
                    className="inline-flex items-center gap-1 text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200 rounded-full px-2.5 py-1">
                <span className="text-amber-500">{c.label}:</span>
                <span>{c.items.length <= 2 ? c.items.join(', ') : `${c.items.length} sel.`}</span>
                <button type="button" onClick={c.onClear} className="ml-0.5 rounded-full hover:bg-amber-100 p-0.5" aria-label={`Limpiar ${c.label}`}>
                  <X size={10}/>
                </button>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Moneda — pill group: GTQ muestra la tasa vigente inline */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-gray-400">Moneda</span>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                {(['gtq','usd'] as const).map(m => {
                  const active = moneda === m
                  return (
                    <button key={m} type="button"
                      onClick={() => setMoneda(m)}
                      className={`px-4 py-1.5 text-xs font-semibold transition-colors ${active ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                      {m.toUpperCase()}
                      {m === 'gtq' && (
                        <span className={`ml-1.5 text-[10px] font-normal ${active ? 'text-white/80' : 'text-gray-400'}`}>
                          · {TASA_GTQ_USD.toFixed(2)}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
            {/* Reset global */}
            {(hayFiltros || moneda !== 'gtq') && (
              <button type="button"
                onClick={() => { limpiarFiltros(); setMoneda('gtq') }}
                className="self-end px-3 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 font-medium transition-colors">
                ↺ Reset
              </button>
            )}
          </div>
        </div>

        {/* Sección expandible con los multi-select — inline como Éxito */}
        {showFiltros && opts && (
          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <MultiSelect
              label="Cadena"
              options={opts.cadenas.map(c => ({ value: c.value, label: c.value }))}
              value={cadenasSel} onChange={setCadenasSel} placeholder="Todas" />
            <MultiSelect
              label="Subcategoría"
              options={opts.subcategorias.map(s => ({ value: s.value, label: s.value }))}
              value={subcatsSel} onChange={setSubcatsSel} placeholder="Todas" />
            <MultiSelect
              label="Tienda"
              options={opts.puntos.map(p => ({ value: p.value, label: p.value }))}
              value={pdvsSel} onChange={setPdvsSel} placeholder="Todas" />
            <MultiSelect
              label="SKU / Producto"
              options={opts.skus.map(s => ({ value: s.value, label: s.descripcion || s.value }))}
              value={skusSel} onChange={setSkusSel} placeholder="Todos" />
          </div>
        )}
      </div>

      {/* Section nav */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex overflow-x-auto">
          {SECTIONS.map(s => (
            <button key={s.key} onClick={() => setSection(s.key)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0
                ${section === s.key
                  ? 'border-amber-500 text-amber-600 bg-amber-50/40'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido — memoizado para NO re-renderizar al abrir/cerrar filtros.
          Solo se recomputa cuando cambian data o toggles relevantes al render. */}
      <div>{sectionJsx}</div>

      {/* Modal Drill-down Cobertura */}
      {cobDetalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
             onClick={() => setCobDetalle(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
               onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-gray-400">Detalle PDVs · SKU {cobDetalle.sku}</p>
                <h3 className="text-base font-bold text-gray-800">{cobDetalle.descripcion || cobDetalle.sku}</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Filtro: {cobDetalle.bucket === 'todos' ? 'Todos' :
                    cobDetalle.bucket === 'menos_de_3' ? '<3 pedidos (bajo)' :
                    cobDetalle.bucket === 'entre_3_y_10' ? '3-10 pedidos (medio)' : '>10 pedidos (fuerte)'}
                </p>
              </div>
              <button onClick={() => setCobDetalle(null)}
                className="w-9 h-9 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              {cobDetalle.loading ? (
                <div className="p-10 text-center text-gray-400 text-sm">Cargando…</div>
              ) : cobDetalle.pdvs.length === 0 ? (
                <div className="p-10 text-center text-gray-400 text-sm">Sin PDVs en este bucket</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider sticky top-0">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Cadena</th>
                      <th className="px-4 py-2.5 text-left">Tienda</th>
                      <th className="px-4 py-2.5 text-right">Pedidos</th>
                      <th className="px-4 py-2.5 text-right">Unidades</th>
                      <th className="px-4 py-2.5 text-right">Valor</th>
                      <th className="px-4 py-2.5 text-right">Última venta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {cobDetalle.pdvs.map((p, i) => (
                      <tr key={i} className="hover:bg-gray-50/60">
                        <td className="px-4 py-2">
                          <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold text-white"
                                style={{ background: CADENA_COLORS[p.cadena] ?? '#6b7280' }}>{p.cadena}</span>
                        </td>
                        <td className="px-4 py-2 text-gray-700 font-medium">{p.punto_venta}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{p.pedidos}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmtNum(p.unidades)}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-semibold">{fmtVal(p.valor)}</td>
                        <td className="px-4 py-2 text-right text-gray-400 text-[10px]">{p.ultima_venta}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
