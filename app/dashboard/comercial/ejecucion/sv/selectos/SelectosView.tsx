'use client'
import { useEffect, useRef, useState } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import InnovacionesSection from '@/components/ejecucion/InnovacionesSection'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, ComposedChart, PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, LabelList,
  ResponsiveContainer, Legend, ReferenceLine, Cell,
} from 'recharts'
import {
  TendenciaMensualChart, TendenciaDiariaChart, MetricaTogglePill,
  type TendMetrica, type TendData, type TendDailyRow,
} from '@/components/ui/tendencia-chart'
import { EjecucionLayout } from '@/components/ejecucion/shared'

// Categorías disponibles Selectos SV (para el filtro estándar Categoría)
const CATEGORIAS_SELECTOS = ['Quesos', 'Leches']

const HEALTH_CFG: Record<string, { label: string; color: string; bg: string }> = {
  'CRÍTICO':        { label: 'Crítico <7d',      color: '#dc2626', bg: '#fef2f2' },
  'ATENCIÓN':       { label: 'Atención 7-14d',   color: '#f59e0b', bg: '#fffbeb' },
  'OK':             { label: 'Saludable',         color: '#10b981', bg: '#f0fdf4' },
  'SALUDABLE':      { label: 'Saludable',         color: '#10b981', bg: '#f0fdf4' },
  'COB ALTA':       { label: 'Cob Alta 60-120d',  color: '#06b6d4', bg: '#ecfeff' },
  'COBERTURA ALTA': { label: 'Cob Alta 60-120d',  color: '#06b6d4', bg: '#ecfeff' },
  'SOBRESTOCK':     { label: 'Sobrestock >120d',  color: '#f97316', bg: '#fff7ed' },
  'SIN VPD':        { label: 'Sin VPD',           color: '#9ca3af', bg: '#f9fafb' },
}

const SECTIONS = [
  { key: 'resumen',          label: 'Resumen' },
  { key: 'evolucion',        label: 'Evolución Ventas' },
  { key: 'cobertura',        label: 'Cobertura' },
  { key: 'inventarios',      label: 'Inventarios' },
  { key: 'pedidos',          label: 'Pedidos' },
  { key: 'ofertas',          label: 'Ofertas' },
  { key: 'innovaciones',     label: 'Innovaciones' },
  { key: 'pareto',           label: 'Pareto' },
  { key: 'perdida',          label: 'Pérdida de Venta' },
  { key: 'precios',          label: 'Lista Precios' },
  { key: 'recomendaciones',  label: 'Recomendaciones' },
  { key: 'cliente',          label: 'Vista Cliente' },
]

const SEMAFORO: Record<string, string> = {
  rojo: 'bg-red-500', amarillo: 'bg-yellow-400',
  verde: 'bg-emerald-500', azul: 'bg-blue-400', sin_datos: 'bg-gray-300',
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
const fmtK = (v: unknown) => {
  const n = Number(v)
  if (!isFinite(n)) return '$0'
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K'
  return '$' + Math.round(n).toLocaleString('en-US')
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

function Skeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-gray-50">
      {Array(rows).fill(0).map((_, i) => (
        <div key={i} className="px-4 py-3 flex gap-4 animate-pulse">
          <div className="h-3 bg-gray-100 rounded flex-1" />
          <div className="h-3 bg-gray-100 rounded w-16" />
          <div className="h-3 bg-gray-100 rounded w-12" />
        </div>
      ))}
    </div>
  )
}

function Empty({ msg }: { msg: string }) {
  return <p className="text-center text-gray-300 py-12 text-sm">{msg}</p>
}

export default function EjecucionSelectos() {
  const [section, setSection] = useState('resumen')
  // Filtro estándar Categoría (multi-select). Se persiste como CSV en localStorage.
  const [categoriaSel, setCategoriaSel] = useState<string[]>([])

  // Compat: derivar `div` legacy desde la selección multi para no romper la lógica
  // interna que hace `div === 'QUESO'` etc. Reglas:
  //   - vacío o ambas categorías → TOTAL
  //   - solo Quesos → QUESO
  //   - solo Leches → LECHE
  const div: 'TOTAL' | 'QUESO' | 'LECHE' =
    categoriaSel.length !== 1 ? 'TOTAL'
      : categoriaSel[0] === 'Quesos' ? 'QUESO'
      : categoriaSel[0] === 'Leches' ? 'LECHE'
      : 'TOTAL'

  const goSection = (key: string) => {
    setSection(key)
    window.location.hash = key
    localStorage.setItem('selectos-sv-section', key)
  }

  // Restore section + categoria filter from localStorage (or hash fallback) after hydration
  useEffect(() => {
    const saved = localStorage.getItem('selectos-sv-section')
    const h = window.location.hash.slice(1)
    const target = (h && SECTIONS.some(s => s.key === h) ? h : null)
                ?? (saved && SECTIONS.some(s => s.key === saved) ? saved : null)
    if (target) setSection(target)
    const savedCat = localStorage.getItem('selectos-sv-categoria')
    if (savedCat) {
      try { const arr = JSON.parse(savedCat); if (Array.isArray(arr)) setCategoriaSel(arr) } catch {}
    }
  }, [])

  // Persistir Categoría en localStorage
  useEffect(() => {
    localStorage.setItem('selectos-sv-categoria', JSON.stringify(categoriaSel))
  }, [categoriaSel])

  // ── Data ──
  const [inv,        setInv]        = useState<any[]>([])
  const [cedi,       setCedi]       = useState<any[]>([])
  const [reorden,    setReorden]    = useState<any>(null)
  const [sellin,     setSellin]     = useState<any>(null)
  const [sellinQ,    setSellinQ]    = useState<any>(null)
  const [sellinL,    setSellinL]    = useState<any>(null)
  const [proyData,   setProyData]   = useState<any>(null)
  const [invValor,   setInvValor]   = useState<number>(0)
  const [selloutKpi, setSelloutKpi] = useState<any>(null)
  const [invKpis,    setInvKpis]    = useState<any>(null)
  const [insights,   setInsights]   = useState<any>(null)
  const [crec,       setCrec]       = useState<any[]>([])
  const [cob,             setCob]             = useState<any>(null)
  const [invDetail,       setInvDetail]       = useState<any>(null)
  const [skuTienda,       setSkuTienda]       = useState<any[] | null>(null)
  const [skuTiendaLoading, setSkuTiendaLoading] = useState(false)
  const [skuTiendaFilters, setSkuTiendaFilters] = useState({ salud: '', nse: '', tienda: '', prod: '' })
  const [cediSearch, setCediSearch] = useState('')
  const [forecast,   setForecast]   = useState<any>(null)
  const [ofertas,       setOfertas]       = useState<any[]>([])
  const [pareto,        setPareto]        = useState<any>(null)
  const [precios,       setPrecios]       = useState<any[]>([])
  const [priceDivF,     setPriceDivF]     = useState<'total'|'queso'|'leche'>('total')
  const [priceCatF,     setPriceCatF]     = useState('')
  const [invDate,       setInvDate]       = useState<string | null>(null)
  const [loading,       setLoading]       = useState<Record<string, boolean>>({})
  const [selectosData,  setSelectosData]  = useState<any>(null)
  const selectosDataRef = useRef(false)

  // Evolucion charts
  const [evolTimeseries, setEvolTimeseries] = useState<any>(null)
  const [evolTop5,       setEvolTop5]       = useState<any>(null)
  const [evolCompar,     setEvolCompar]     = useState<any>(null)
  const [evolCat,        setEvolCat]        = useState('')
  const [evolTopN,       setEvolTopN]       = useState(5)
  const [evolMedida,     setEvolMedida]     = useState<'valor' | 'unidades'>('valor')
  const [evolLogScale,   setEvolLogScale]   = useState(false)
  const [evolVista,       setEvolVista]       = useState<'mensual' | 'diaria'>('mensual')
  const [evolDesde,       setEvolDesde]       = useState('')
  const [evolHasta,       setEvolHasta]       = useState('')
  const [evolSubcat,      setEvolSubcat]      = useState<string[]>([])
  const [evolSubcatOpts,  setEvolSubcatOpts]  = useState<string[]>([])
  const [evolTop5Cat,      setEvolTop5Cat]      = useState('')
  const [evolDiario,       setEvolDiario]       = useState<any>(null)
  const evolInitRef = useRef(false)

  // Cobertura state
  const [cobNse,        setCobNse]        = useState<any>(null)
  const [cobVista,      setCobVista]      = useState<'numerica' | 'ponderada'>('numerica')
  const [cobSort,       setCobSort]       = useState<'gap' | 'actual' | 'maxima'>('gap')
  const [cobCat,        setCobCat]        = useState('')
  const [cobSubcat,     setCobSubcat]     = useState<string[]>([])
  const [cobSubcatOpts, setCobSubcatOpts] = useState<string[]>([])
  const cobInitRef = useRef(false)

  // Tendencia reusable (chart Sell-Out Mensual/Diaria en Pedidos)
  const [selTend, setSelTend] = useState<TendData | null>(null)
  const [selTendMetricas, setSelTendMetricas] = useState<TendMetrica[]>(['valor', 'unidades', 'precio'])
  const [selTendVista, setSelTendVista] = useState<'mensual' | 'diaria'>('mensual')
  const [selTendDaily, setSelTendDaily] = useState<TendDailyRow[]>([])
  const [selTendDailyLoading, setSelTendDailyLoading] = useState(false)
  const toggleSelTendMetrica = (m: TendMetrica) => {
    setSelTendMetricas(prev => {
      const has = prev.includes(m)
      if (has && prev.length === 1) return prev
      return has ? prev.filter(x => x !== m) : [...prev, m]
    })
  }

  const setL = (k: string, v: boolean) => setLoading(p => ({ ...p, [k]: v }))

  // Re-fetch timeseries + top5 when filters change (after initial load)
  useEffect(() => {
    if (!evolInitRef.current) return
    // Reload subcategory options when category changes; reset selected subcat
    setEvolSubcat([])
    const scUrl = evolCat
      ? `/api/comercial/ejecucion/evolucion/selectos-subcategorias?categoria=${evolCat}`
      : '/api/comercial/ejecucion/evolucion/selectos-subcategorias'
    fetch(scUrl).then(r => r.json()).then(d => setEvolSubcatOpts(d.subcategorias ?? []))

    const tsP = new URLSearchParams()
    if (evolCat) tsP.set('categoria', evolCat)
    const t5P = new URLSearchParams({ top: String(evolTopN) })
    if (evolTop5Cat)       t5P.set('categoria',    evolTop5Cat)
    if (evolSubcat.length) t5P.set('subcategoria', evolSubcat.join(','))
    Promise.all([
      fetch(`/api/comercial/ejecucion/evolucion/selectos-timeseries?${tsP}`).then(r => r.json()),
      fetch(`/api/comercial/ejecucion/evolucion/selectos-top5?${t5P}`).then(r => r.json()),
    ]).then(([ts, t5]) => {
      setEvolTimeseries(ts)
      setEvolTop5(t5)
    })
  }, [evolCat, evolTopN, evolTop5Cat]) // eslint-disable-line

  // Re-fetch timeseries + top5 when subcategoria changes
  useEffect(() => {
    if (!evolInitRef.current) return
    const tsP = new URLSearchParams()
    if (evolCat)           tsP.set('categoria',    evolCat)
    if (evolSubcat.length) tsP.set('subcategoria', evolSubcat.join(','))
    const t5P = new URLSearchParams({ top: String(evolTopN) })
    if (evolTop5Cat)       t5P.set('categoria',    evolTop5Cat)
    if (evolSubcat.length) t5P.set('subcategoria', evolSubcat.join(','))
    Promise.all([
      fetch(`/api/comercial/ejecucion/evolucion/selectos-timeseries?${tsP}`).then(r => r.json()),
      fetch(`/api/comercial/ejecucion/evolucion/selectos-top5?${t5P}`).then(r => r.json()),
    ]).then(([ts, t5]) => { setEvolTimeseries(ts); setEvolTop5(t5) })
  }, [evolSubcat]) // eslint-disable-line

  // Fetch daily data when vista=diaria or relevant filters change
  useEffect(() => {
    if (!evolInitRef.current) return
    if (evolVista !== 'diaria') return
    const p = new URLSearchParams()
    if (evolCat)           p.set('categoria',    evolCat)
    if (evolSubcat.length) p.set('subcategoria', evolSubcat.join(','))
    // date range: desde/hasta as YYYY-MM → use first/last day of month
    if (evolDesde) p.set('desde', evolDesde + '-01')
    if (evolHasta) {
      const [y, m] = evolHasta.split('-').map(Number)
      const lastDay = new Date(y, m, 0).getDate()
      p.set('hasta', `${evolHasta}-${String(lastDay).padStart(2, '0')}`)
    }
    fetch(`/api/comercial/ejecucion/evolucion/selectos-diario?${p}`)
      .then(r => r.json()).then(d => setEvolDiario(d))
  }, [evolVista, evolCat, evolSubcat, evolDesde, evolHasta]) // eslint-disable-line

  // Re-fetch cobertura when cobCat changes (reset subcat, reload subcategory options)
  useEffect(() => {
    if (!cobInitRef.current) return
    setCobSubcat([])
    const scUrl = cobCat
      ? `/api/comercial/ejecucion/evolucion/selectos-subcategorias?categoria=${cobCat}`
      : '/api/comercial/ejecucion/evolucion/selectos-subcategorias'
    fetch(scUrl).then(r => r.json()).then(d => setCobSubcatOpts(d.subcategorias ?? []))
    const q = new URLSearchParams({ pais: 'SV' })
    if (cobCat) q.set('categoria', cobCat)
    const nseQ = new URLSearchParams()
    if (cobCat) nseQ.set('categoria', cobCat)
    setL('cobertura', true)
    Promise.all([
      fetch('/api/comercial/ejecucion/cobertura?' + q).then(r => r.json()),
      fetch('/api/comercial/ejecucion/cobertura/nse?' + nseQ).then(r => r.json()),
    ]).then(([cobR, nseR]) => { setCob(cobR); setCobNse(nseR) })
      .finally(() => setL('cobertura', false))
  }, [cobCat]) // eslint-disable-line

  // Tendencia mensual Selectos — solo cuando estamos en Pedidos
  useEffect(() => {
    if (section !== 'pedidos') return
    setSelTend(null)
    const cats = categoriaSel
    const p = new URLSearchParams()
    if (cats.length) p.set('categoria', cats.join(','))
    fetch(`/api/comercial/ejecucion/sv/selectos/tendencia-mensual?${p}`)
      .then(r => r.json())
      .then((d: TendData) => setSelTend(d))
      .catch(() => setSelTend({ desde: null, hasta: null, labels: [], total: [], por_sku: [] }))
  }, [section, categoriaSel])

  // Tendencia diaria Selectos (dedicado)
  useEffect(() => {
    if (section !== 'pedidos' || selTendVista !== 'diaria') return
    setSelTendDailyLoading(true)
    const cats = categoriaSel
    const p = new URLSearchParams()
    if (cats.length) p.set('categoria', cats.join(','))
    fetch(`/api/comercial/ejecucion/sv/selectos/tendencia-diaria?${p}`)
      .then(r => r.json())
      .then(d => setSelTendDaily(d.rows ?? []))
      .catch(() => setSelTendDaily([]))
      .finally(() => setSelTendDailyLoading(false))
  }, [section, selTendVista, categoriaSel])

  // Reset diaria al cambiar división
  useEffect(() => { setSelTendDaily([]) }, [categoriaSel])

  // Re-fetch cobertura when cobSubcat changes
  useEffect(() => {
    if (!cobInitRef.current) return
    const q = new URLSearchParams({ pais: 'SV' })
    if (cobCat)           q.set('categoria',    cobCat)
    if (cobSubcat.length) q.set('subcategoria', cobSubcat.join(','))
    const nseQ = new URLSearchParams()
    if (cobCat)           nseQ.set('categoria',    cobCat)
    if (cobSubcat.length) nseQ.set('subcategoria', cobSubcat.join(','))
    setL('cobertura', true)
    Promise.all([
      fetch('/api/comercial/ejecucion/cobertura?' + q).then(r => r.json()),
      fetch('/api/comercial/ejecucion/cobertura/nse?' + nseQ).then(r => r.json()),
    ]).then(([cobR, nseR]) => { setCob(cobR); setCobNse(nseR) })
      .finally(() => setL('cobertura', false))
  }, [cobSubcat]) // eslint-disable-line

  // ── Fetch ──
  useEffect(() => {
    const cats = categoriaSel
    const base = new URLSearchParams({ pais: 'SV' })
    if (cats.length) base.set('categoria', cats.join(','))
    const q = base.toString()

    const sec = section === 'innovaciones' ? 'evolucion' : section

    if (sec === 'resumen') {
      setL('resumen', true)
      const qSellin = 'pais=SV&cliente=CALLEJA' + (cats.length ? '&categoria=' + cats.join(',') : '')
      Promise.all([
        fetch('/api/comercial/ejecucion/inventario?' + q).then(r => r.json()),
        fetch('/api/comercial/ejecucion/inventario/cedi?' + q).then(r => r.json()),
        fetch('/api/comercial/ejecucion/punto-reorden?' + q).then(r => r.json()),
        fetch('/api/comercial/sell-in/kpis?' + qSellin).then(r => r.json()),
        fetch('/api/comercial/sell-in/kpis?pais=SV&cliente=CALLEJA&categoria=Quesos').then(r => r.json()),
        fetch('/api/comercial/sell-in/kpis?pais=SV&cliente=CALLEJA&categoria=Leches').then(r => r.json()),
        fetch('/api/ventas/proyeccion?ano=2026&pais=SV&cliente=CALLEJA').then(r => r.json()),
        fetch('/api/comercial/ejecucion/inventario/selectos').then(r => r.json()),
        fetch('/api/comercial/sellout/selectos').then(r => r.json()),
        fetch('/api/comercial/ejecucion/inventario/selectos-kpis').then(r => r.json()),
        fetch('/api/comercial/ejecucion/inventario/selectos-insights').then(r => r.json()),
      ]).then(([invR, cediR, reoR, slR, slQ, slL, proyR, invSR, soR, ikR, insR]) => {
        if (invR.rows?.length) setInv(invR.rows); else setInv([])
        // Fecha del inventario Selectos (fact_selectos_inventario), no el Walmart genérico
        setInvDate(invSR?.fecha ?? invR.rows?.[0]?.fecha ?? null)
        setCedi(cediR.rows ?? [])
        if (reoR.rows) setReorden(reoR)
        if (slR.kpis)  setSellin(slR.kpis)
        if (slQ.kpis)  setSellinQ(slQ.kpis)
        if (slL.kpis)  setSellinL(slL.kpis)
        setProyData(proyR)
        setInvValor(invSR.pdv_valor ?? invSR.total_valor ?? 0)
        if (soR.ytd_2026) setSelloutKpi(soR)
        if (ikR.pdv)      setInvKpis(ikR)
        if (insR.pareto)  setInsights(insR)
      }).finally(() => setL('resumen', false))

    } else if (sec === 'evolucion') {
      setL('evolucion', true)
      evolInitRef.current = true
      if (section === 'innovaciones' && !insights) {
        fetch('/api/comercial/ejecucion/inventario/selectos-insights').then(r => r.json())
          .then(r => { if (r.monthly) setInsights(r) })
      }
      if (section === 'innovaciones' && !selectosDataRef.current) {
        selectosDataRef.current = true
        fetch('/dashboards/selectos_data.json').then(r => r.json()).then(d => setSelectosData(d))
      }
      const tsP = new URLSearchParams()
      if (evolCat)           tsP.set('categoria',    evolCat)
      if (evolSubcat.length) tsP.set('subcategoria', evolSubcat.join(','))
      const t5P = new URLSearchParams({ top: String(evolTopN) })
      if (evolTop5Cat)       t5P.set('categoria',    evolTop5Cat)
      if (evolSubcat.length) t5P.set('subcategoria', evolSubcat.join(','))
      // Load subcategory options for both sections
      const t5ScUrl = evolTop5Cat
        ? `/api/comercial/ejecucion/evolucion/selectos-subcategorias?categoria=${evolTop5Cat}`
        : '/api/comercial/ejecucion/evolucion/selectos-subcategorias'
      fetch(t5ScUrl).then(r => r.json()).then(d => setEvolSubcatOpts(d.subcategorias ?? []))
      const scUrl = evolCat
        ? `/api/comercial/ejecucion/evolucion/selectos-subcategorias?categoria=${evolCat}`
        : '/api/comercial/ejecucion/evolucion/selectos-subcategorias'
      fetch(scUrl).then(r => r.json()).then(d => setEvolSubcatOpts(d.subcategorias ?? []))
      Promise.all([
        fetch(`/api/comercial/ejecucion/evolucion/selectos-timeseries?${tsP}`).then(r => r.json()),
        fetch(`/api/comercial/ejecucion/evolucion/selectos-top5?${t5P}`).then(r => r.json()),
        fetch('/api/comercial/ejecucion/evolucion/selectos-comparativo').then(r => r.json()),
        fetch('/api/comercial/sell-in/kpis?pais=SV&cliente=CALLEJA').then(r => r.json()),
        fetch('/api/comercial/sell-in/kpis?pais=SV&cliente=CALLEJA&categoria=Quesos').then(r => r.json()),
        fetch('/api/comercial/sell-in/kpis?pais=SV&cliente=CALLEJA&categoria=Leches').then(r => r.json()),
        fetch('/api/ventas/proyeccion?ano=2026&pais=SV&cliente=CALLEJA').then(r => r.json()),
        fetch('/api/comercial/sellout/selectos').then(r => r.json()),
      ]).then(([ts, t5, cp, slR, slQ, slL, proyR, soR]) => {
        setEvolTimeseries(ts)
        setEvolTop5(t5)
        setEvolCompar(cp)
        if (slR.kpis)     setSellin(slR.kpis)
        if (slQ.kpis)     setSellinQ(slQ.kpis)
        if (slL.kpis)     setSellinL(slL.kpis)
        setProyData(proyR)
        if (soR.ytd_2026) setSelloutKpi(soR)
      }).finally(() => setL('evolucion', false))

    } else if (sec === 'cobertura') {
      setL('cobertura', true)
      cobInitRef.current = true
      const cobQ = new URLSearchParams({ pais: 'SV' })
      if (cats.length) cobQ.set('categoria', cats.join(','))
      const nseQ = new URLSearchParams()
      if (cats.length) nseQ.set('categoria', cats.join(','))
      fetch('/api/comercial/ejecucion/evolucion/selectos-subcategorias')
        .then(r => r.json()).then(d => setCobSubcatOpts(d.subcategorias ?? []))
      Promise.all([
        fetch('/api/comercial/ejecucion/cobertura?' + cobQ).then(r => r.json()),
        fetch('/api/comercial/ejecucion/cobertura/nse?' + nseQ).then(r => r.json()),
      ]).then(([cobR, nseR]) => { setCob(cobR); setCobNse(nseR) })
        .finally(() => setL('cobertura', false))

    } else if (sec === 'inventarios') {
      setL('inventarios', true)
      setSkuTiendaLoading(true)
      const invFetches: Promise<any>[] = [
        fetch('/api/comercial/ejecucion/inventario/selectos-kpis').then(r => r.json()),
        fetch('/api/comercial/ejecucion/inventario/selectos-inv-detail').then(r => r.json()),
        fetch('/api/comercial/ejecucion/inventario/cedi?' + q).then(r => r.json()),
        fetch('/api/comercial/ejecucion/inventario/selectos-sku-tienda').then(r => r.json()),
      ]
      if (!selectosDataRef.current) { selectosDataRef.current = true; invFetches.push(fetch('/dashboards/selectos_data.json').then(r => r.json())) }
      Promise.all(invFetches).then(([ikR, idR, cediR, skuR, sdR]) => {
        if (sdR) setSelectosData(sdR)
        if (ikR.pdv)    setInvKpis(ikR)
        if (idR.health) setInvDetail(idR)
        setCedi(cediR.rows ?? [])
        setSkuTienda(skuR.rows ?? [])
      }).finally(() => { setL('inventarios', false); setSkuTiendaLoading(false) })

    } else if (sec === 'pedidos') {
      setL('pedidos', true)
      const fets: Promise<any>[] = []
      if (!selectosDataRef.current) { selectosDataRef.current = true; fets.push(fetch('/dashboards/selectos_data.json').then(r => r.json())) }
      else fets.push(Promise.resolve(null))
      Promise.all(fets).then(([sdR]) => { if (sdR) setSelectosData(sdR) }).finally(() => setL('pedidos', false))

    } else if (sec === 'ofertas') {
      setL('ofertas', true)
      if (!selectosDataRef.current) {
        selectosDataRef.current = true
        fetch('/dashboards/selectos_data.json').then(r => r.json()).then(d => setSelectosData(d)).finally(() => setL('ofertas', false))
      } else setL('ofertas', false)

    } else if (sec === 'pareto') {
      setL('pareto', true)
      if (!selectosDataRef.current) {
        selectosDataRef.current = true
        fetch('/dashboards/selectos_data.json').then(r => r.json()).then(d => setSelectosData(d)).finally(() => setL('pareto', false))
      } else setL('pareto', false)

    } else if (sec === 'perdida') {
      setL('perdida', true)
      const fetches: Promise<any>[] = [
        fetch('/api/comercial/ejecucion/inventario/selectos-insights').then(r => r.json()),
      ]
      if (!inv.length) fetches.push(fetch('/api/comercial/ejecucion/inventario/selectos-kpis').then(r => r.json()))
      if (!selectosDataRef.current) { selectosDataRef.current = true; fetches.push(fetch('/dashboards/selectos_data.json').then(r => r.json())) }
      Promise.all(fetches).then(([insR, ikR, sdR]) => {
        if (insR?.monthly) setInsights(insR)
        if (ikR?.pdv)      setInvKpis(ikR)
        if (sdR)           setSelectosData(sdR)
      }).finally(() => setL('perdida', false))

    } else if (sec === 'precios' || sec === 'cliente') {
      setL(sec, true)
      const fetches: Promise<any>[] = []
      if (!selectosDataRef.current) { selectosDataRef.current = true; fetches.push(fetch('/dashboards/selectos_data.json').then(r => r.json())) }
      else fetches.push(Promise.resolve(null))
      Promise.all(fetches).then(([sdR]) => { if (sdR) setSelectosData(sdR) }).finally(() => setL(sec, false))

    } else if (sec === 'recomendaciones') {
      // Load resumen + pareto if not loaded
      if (!inv.length) {
        setL('resumen', true)
        Promise.all([
          fetch('/api/comercial/ejecucion/inventario?' + q).then(r => r.json()),
          fetch('/api/comercial/ejecucion/punto-reorden?' + q).then(r => r.json()),
        ]).then(([invR, reoR]) => {
          if (invR.rows?.length) setInv(invR.rows)
          if (reoR.rows) setReorden(reoR)
        }).finally(() => setL('resumen', false))
      }
      if (!pareto) {
        setL('pareto', true)
        fetch('/api/comercial/ejecucion/distribucion?' + q).then(r => r.json())
          .then(r => setPareto(r))
          .finally(() => setL('pareto', false))
      }
    }
  }, [section, categoriaSel]) // eslint-disable-line

  // ── Derived ──
  const criticosPdv  = inv.filter(r => r.semaforo === 'rojo').length
  const alertasPdv   = inv.filter(r => r.semaforo === 'amarillo').length
  const invTotal     = inv.reduce((s, r) => s + r.inv_mano, 0)
  const sinStockCedi = Math.max(0, inv.length - cedi.length)
  const invFecha     = invDate
    ? new Date(invDate).toLocaleDateString('es-SV', { day: '2-digit', month: 'short', year: 'numeric' })
    : null

  const isLoading = (sec: string) => !!loading[sec === 'innovaciones' ? 'evolucion' : sec === 'perdida' ? 'perdida' : sec]

  // ── Shared helpers ──
  const MN_LABEL: Record<string, string> = {
    '01':'Ene','02':'Feb','03':'Mar','04':'Abr','05':'May','06':'Jun',
    '07':'Jul','08':'Ago','09':'Sep','10':'Oct','11':'Nov','12':'Dic',
  }
  const sdMonthLabel = (m: string) => {
    const [y, mo] = m.split('-')
    return (MN_LABEL[mo] ?? mo) + (y !== '2026' ? ' ' + y.slice(2) : '')
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

  function HealthChip({ h }: { h: string }) {
    const MAP: Record<string, string> = {
      'SALUDABLE':      'bg-emerald-100 text-emerald-700',
      'SOBRESTOCK':     'bg-amber-100   text-amber-700',
      'COBERTURA ALTA': 'bg-blue-100    text-blue-600',
      'RIESGO':         'bg-orange-100  text-orange-700',
      'ATENCIÓN':       'bg-orange-100  text-orange-700',
      'CRÍTICO':        'bg-red-100     text-red-700',
      'QUIEBRE':        'bg-red-100     text-red-700',
      'Sin datos':      'bg-gray-100    text-gray-400',
    }
    return <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold ${MAP[h] ?? 'bg-gray-100 text-gray-400'}`}>{h}</span>
  }

  function TendenciaChip({ t }: { t: string }) {
    const MAP: Record<string, string> = {
      'Crecimiento':    'bg-emerald-100 text-emerald-700',
      'Estable':        'bg-gray-100    text-gray-500',
      'Declive':        'bg-red-100     text-red-600',
      'Lanzamiento 2026': 'bg-purple-100 text-purple-700',
    }
    return <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-semibold ${MAP[t] ?? 'bg-gray-100 text-gray-400'}`}>{t ?? '—'}</span>
  }

  function UrgChip({ u }: { u: string }) {
    const MAP: Record<string, string> = {
      'Alta':   'bg-red-100    text-red-700',
      'Media':  'bg-amber-100  text-amber-700',
      'Baja':   'bg-gray-100   text-gray-500',
      'CRÍTICA':'bg-red-100    text-red-700',
    }
    return <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold ${MAP[u] ?? 'bg-gray-100 text-gray-400'}`}>{u}</span>
  }

  // ── Sections ──────────────────────────────────────────────────────────────

  function Resumen() {
    const L = isLoading('resumen')

    // Projection KPIs from catRows
    const catRows = proyData?.catRows ?? []
    let proyTotal = 0, proyReal = 0, proyLastMes = 0
    for (const r of catRows) {
      proyTotal += r.valor_proyectado
      proyReal  += (r.real_usd ?? 0)
      if ((r.real_usd ?? 0) > 0) proyLastMes = Math.max(proyLastMes, r.mes)
    }
    let proyYTD = 0
    for (const r of catRows) { if (r.mes <= proyLastMes) proyYTD += r.valor_proyectado }
    const cumplYTD = proyYTD > 0 ? (proyReal / proyYTD * 100) : null
    const cumplFY  = proyTotal > 0 ? (proyReal / proyTotal * 100) : null

    // Category breakdown
    const qVal = sellinQ?.ingresos?.valor ?? 0
    const lVal = sellinL?.ingresos?.valor ?? 0
    const catBreak = [
      qVal > 0 ? `Queso ${fmtFull(qVal)}` : null,
      lVal > 0 ? `Leche ${fmtFull(lVal)}` : null,
    ].filter(Boolean).join(' + ') || 'YTD 2026'

    // Growth text: delta=100 means prev=0 (no 2025 data)
    const growthText = (delta: number | null | undefined) => {
      if (delta == null || !isFinite(delta)) return 'N/A'
      if (delta >= 100 || delta === 0) return 'N/A (sin 2025)'
      return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`
    }

    const topCards = [
      { label: 'Inv. PDV ($)',   value: invValor > 0 ? fmtFull(invValor) : '—', sub: `${inv.length} SKUs · ${invTotal.toLocaleString('en-US')} u`, bg: 'bg-white border-gray-100', icon: '📦', tc: 'text-gray-800' },
      { label: 'Críticos PDV',   value: criticosPdv, sub: 'DOH ≤ 7 días',   bg: criticosPdv > 0 ? 'bg-red-50 border-red-200'    : 'bg-white border-gray-100', icon: '🔴', tc: criticosPdv > 0 ? 'text-red-700'    : 'text-gray-800' },
      { label: 'En Alerta PDV',  value: alertasPdv,  sub: 'DOH 8–21 días',  bg: alertasPdv  > 0 ? 'bg-amber-50 border-amber-200'  : 'bg-white border-gray-100', icon: '⚠️', tc: alertasPdv  > 0 ? 'text-amber-700'  : 'text-gray-800' },
      { label: 'Sin Stock CEDI', value: sinStockCedi, sub: 'SKUs sin reabasto', bg: sinStockCedi > 0 ? 'bg-purple-50 border-purple-200' : 'bg-white border-gray-100', icon: '🏭', tc: sinStockCedi > 0 ? 'text-purple-700' : 'text-gray-800' },
    ]

    return (
      <div className="space-y-4">

        {/* Cards removidos por pedido del usuario (2026-07-23):
            Top 4 chips, Sell-In dark, Sell-Out dark, Inventory KPI grid.
            Se mantienen Hallazgos Críticos y Punto de Reorden abajo. */}


        {/* Hallazgos Críticos */}
        {!L && HallazgosCriticos()}

        {/* Punto de reorden */}
        {!L && reorden?.rows.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <div><h3 className="text-sm font-semibold text-gray-700">Punto de Reorden</h3><p className="text-xs text-gray-400">SKUs con DOH ≤ 14 días en PDV</p></div>
              <div className="flex gap-2">
                {reorden.criticos > 0 && <span className="text-xs bg-red-50 text-red-600 px-2.5 py-0.5 rounded-full border border-red-100 font-semibold">{reorden.criticos} crítico{reorden.criticos !== 1 ? 's' : ''}</span>}
                {reorden.alertas  > 0 && <span className="text-xs bg-amber-50 text-amber-600 px-2.5 py-0.5 rounded-full border border-amber-100 font-semibold">{reorden.alertas} alerta{reorden.alertas !== 1 ? 's' : ''}</span>}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="bg-gray-50 text-gray-400 uppercase tracking-widest text-[10px]">
                  <th className="text-left px-4 py-2.5">Descripción</th><th className="text-left px-4 py-2.5">Cat.</th>
                  <th className="text-right px-4 py-2.5">Stock (u)</th><th className="text-right px-4 py-2.5">V/día</th>
                  <th className="text-right px-4 py-2.5">DOH</th><th className="px-4 py-2.5">Estado</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {reorden.rows.map((r: any) => (
                    <tr key={r.sku} className={r.urgencia === 'critico' ? 'bg-red-50/40' : 'hover:bg-gray-50/60'}>
                      <td className="px-4 py-2.5 font-medium text-gray-700"><span className="text-gray-400 mr-1.5 font-normal">{r.sku}</span>{r.descripcion}</td>
                      <td className="px-4 py-2.5 text-gray-400">{r.categoria}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{r.qty_pdv.toLocaleString('en-US')}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{r.venta_dia.toFixed(1)}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold"><span className={r.urgencia === 'critico' ? 'text-red-600' : 'text-amber-600'}>{r.doh !== null ? Math.round(r.doh) + 'd' : '—'}</span></td>
                      <td className="px-4 py-2.5"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${r.urgencia === 'critico' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{r.urgencia === 'critico' ? 'Crítico' : 'Alerta'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    )
  }

  function HallazgosCriticos() {
    const ins = insights
    if (!ins) return null

    type Nivel = 'alta' | 'media' | 'baja' | 'info'
    type Finding = { icon: string; titulo: string; detalle: string; nivel: Nivel }
    const findings: Finding[] = []

    // 1. OOS / Ventas perdidas
    if (ins.oos_count > 0) {
      findings.push({
        icon: '🔶',
        titulo: `Ventas perdidas ${ins.oos_meses} por OOS: ${fmtFull(ins.oos_perdida_val)} (${Math.round(ins.oos_perdida_uni).toLocaleString('en-US')} u)`,
        detalle: `Estimación vs baseline mensual ${fmtFull(ins.baseline_val)}. El valle ${ins.oos_meses} fue desabastecimiento, no caída de demanda — ${ins.ultimo_mes?.mes_nombre} 2026 confirmó recuperación a ${fmtFull(ins.ultimo_mes?.ventas_val)} (cifra real). Prevenir este escenario es la prioridad #1.`,
        nivel: 'alta',
      })
    } else {
      findings.push({
        icon: '✅',
        titulo: 'Sin quiebres de stock detectados en 2026',
        detalle: `Todos los meses registraron ventas sobre el 30% del baseline ${fmtFull(ins.baseline_val)}/mes. Mantener monitoreo continuo.`,
        nivel: 'baja',
      })
    }

    // 2. Inventario crítico (DOH < 7)
    const nCrit = ins.criticos?.length ?? 0
    const critTop = (ins.criticos ?? []).slice(0, 3)
    findings.push({
      icon: nCrit > 0 ? '⚠️' : '✅',
      titulo: `Inventario crítico al snapshot: ${nCrit} SKU${nCrit !== 1 ? 's' : ''} con DOH < 7 días`,
      detalle: nCrit > 0
        ? `${critTop.map((c: any) => `${c.descripcion} (${Math.round(c.doh)}d)`).join(' · ')}. Requiere reabasto urgente desde CEDI.`
        : `0 combinaciones SKU×Tienda en quiebre. Inventario en rango normal al ${ins.ultimo_mes?.mes_nombre ?? '—'} 2026.`,
      nivel: nCrit > 5 ? 'alta' : nCrit > 0 ? 'media' : 'baja',
    })

    // 3. Demanda último mes vs baseline
    const lastVal = ins.ultimo_mes?.ventas_val ?? 0
    const pctBase = ins.baseline_val > 0 ? (lastVal / ins.baseline_val * 100) : 0
    findings.push({
      icon: pctBase >= 80 ? '✅' : pctBase >= 50 ? '⚠️' : '🔴',
      titulo: `Demanda ${pctBase >= 80 ? 'saludable confirmada' : 'bajo baseline'} — ${ins.ultimo_mes?.mes_nombre ?? '—'} 2026: ${fmtFull(lastVal)}`,
      detalle: `${pctBase >= 80 ? 'Retornó a nivel baseline.' : 'Por debajo del baseline.'} Promedio últimos meses con stock: ${fmtFull(ins.baseline_val)}/mes. Cumplimiento: ${pctBase.toFixed(0)}%.`,
      nivel: pctBase >= 80 ? 'baja' : pctBase >= 50 ? 'media' : 'alta',
    })

    // 4. Excedentes (DOH > 60)
    const nExc = ins.excedentes?.length ?? 0
    const excTop = (ins.excedentes ?? [])[0]
    if (nExc > 0) {
      findings.push({
        icon: '🔥',
        titulo: `${nExc} SKU${nExc !== 1 ? 's' : ''} concentra${nExc === 1 ? '' : 'n'} el excedente`,
        detalle: excTop
          ? `${excTop.descripcion} (DOH ${Math.round(excTop.doh)}d) tiene ${Math.round(excTop.inv_uni).toLocaleString('en-US')} u por encima de cobertura objetivo. Una sola promoción ataca el grueso del problema.`
          : `${nExc} SKUs con DOH > 60 días requieren activación comercial.`,
        nivel: 'media',
      })
    }

    // 5. Innovaciones
    const nInno = ins.innovaciones?.length ?? 0
    const innoTop = (ins.innovaciones ?? []).slice(0, 2)
    if (nInno > 0) {
      findings.push({
        icon: '📋',
        titulo: `${nInno} SKU nuevo${nInno !== 1 ? 's' : ''} en 2026 — vigilancia activa`,
        detalle: `${innoTop.map((i: any) => i.descripcion).join(' · ')}. Monitorear sell-through los primeros 90 días para validar adopción y replicar el éxito en otros lanzamientos.`,
        nivel: 'info',
      })
    }

    // 6. Pareto
    const { a, b, c } = ins.pareto ?? { a: 0, b: 0, c: 0 }
    if (a + b + c > 0) {
      findings.push({
        icon: '🧩',
        titulo: `Concentración Pareto: ${a} SKUs Clase A`,
        detalle: `${a} SKUs generan 80% del valor activo. Pareto B: ${b} · C: ${c}. Foco operativo: monitor diario de cobertura para Clase A.`,
        nivel: 'info',
      })
    }

    const COLORS: Record<Nivel, string> = {
      alta:  'border-l-red-500    bg-red-50/30',
      media: 'border-l-yellow-400 bg-yellow-50/20',
      baja:  'border-l-emerald-500 bg-emerald-50/20',
      info:  'border-l-blue-400   bg-blue-50/10',
    }

    return (
      <div className="space-y-3">

        {/* NSE insight header */}
        {ins.nse?.insight && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
              📊 Insights por NSE (Nivel Socioeconómico)
            </p>
            <p className="text-xs text-gray-500 leading-relaxed">{ins.nse.insight}</p>
            {ins.nse.grupos?.length > 0 && (
              <div className="mt-3 flex gap-3">
                {ins.nse.grupos.map((g: any) => (
                  <div key={g.nse} className={`flex-1 rounded-lg px-3 py-2 ${
                    g.nse === 'A' ? 'bg-amber-50' : g.nse === 'C' ? 'bg-blue-50' : 'bg-gray-100'
                  }`}>
                    <p className={`text-[9px] font-bold uppercase tracking-widest mb-0.5 ${
                      g.nse === 'A' ? 'text-amber-600' : g.nse === 'C' ? 'text-blue-500' : 'text-gray-500'
                    }`}>NSE {g.nse}</p>
                    <p className="text-sm font-bold text-gray-700">{g.n_tiendas} tiendas</p>
                    <p className="text-[10px] text-gray-500 font-semibold">{(g.pct_valor ?? 0).toFixed(0)}% del valor</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Hallazgos */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h3 className="text-sm font-bold text-gray-800">🎯 Hallazgos Críticos</h3>
          </div>
        <div className="divide-y divide-gray-50">
          {findings.map((f, i) => (
            <div key={i} className={`px-5 py-3 border-l-4 ${COLORS[f.nivel]}`}>
              <p className="text-sm font-bold text-gray-800 mb-0.5">{f.icon} {f.titulo}</p>
              <p className="text-xs text-gray-500 leading-relaxed">{f.detalle}</p>
            </div>
          ))}
        </div>
        </div>

      </div>
    )
  }

  function Evolucion() {
    const L  = isLoading('evolucion')
    const ts = evolTimeseries
    const t5 = evolTop5
    const cp = evolCompar

    const SKU_COLORS = ['#c8873a', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#f59e0b', '#06b6d4', '#84cc16', '#f43f5e', '#a78bfa']
    const MN_SHORT = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
    const desdeMonth = evolDesde ? parseInt(evolDesde.split('-')[1]) : 1
    const hastaMonth = evolHasta ? parseInt(evolHasta.split('-')[1]) : 12
    const displayedSeries = (ts?.series ?? []).filter((r: any) => r.mes >= desdeMonth && r.mes <= hastaMonth)

    // ── Timeline continuo 2024 → 2026 (flatten para chart evolución) ──
    // Respeta el toggle evolMedida (valor/unidades) y el rango de meses.
    const continuoSeries: { mes_str: string; valor: number }[] = (() => {
      const byMes: Record<number, any> = {}
      for (const m of (ts?.series ?? [])) byMes[Number(m.mes)] = m
      const out: { mes_str: string; valor: number }[] = []
      for (const ano of [2024, 2025, 2026] as const) {
        for (let m = desdeMonth; m <= hastaMonth; m++) {
          const row = byMes[m]
          if (!row) continue
          const key = evolMedida === 'valor'
            ? (ano === 2024 ? 'y2024' : ano === 2025 ? 'y2025' : 'y2026')
            : (ano === 2024 ? 'u2024' : ano === 2025 ? 'u2025' : 'u2026')
          const raw = row[key]
          const valor = raw == null ? 0 : Number(raw)
          if (valor <= 0) continue
          out.push({ mes_str: `${MN_SHORT[m]}-${String(ano).slice(2)}`, valor })
        }
      }
      return out
    })()

    if (L) return <div className="space-y-4">{Array(3).fill(0).map((_, i) => (
      <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse">
        <div className="h-4 bg-gray-100 rounded w-1/3 mb-4" />
        <div className="h-[220px] bg-gray-50 rounded" />
      </div>
    ))}</div>

    return (
      <div className="space-y-6">

        {/* ── Sección 1: Evolución mensual por año ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-gray-800">📈 Evolución de Ventas — Portafolio Activo</h3>
            <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">SELLOUT</span>
          </div>
          <p className="text-xs text-gray-400 mb-3">Portafolio Activo · Selectos El Salvador</p>
          {/* Controls bar */}
          <div className="flex items-center gap-x-3 gap-y-2 flex-wrap text-xs mb-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
            <span className="text-gray-400 font-medium">Vista:</span>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {(['mensual', 'diaria'] as const).map(v => (
                <button key={v} onClick={() => setEvolVista(v)}
                  className={`px-3 py-1.5 font-medium transition-colors capitalize ${evolVista === v ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
            <span className="text-gray-400 font-medium">Categoría:</span>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {[{ key: '', label: 'Todas' }, { key: 'Quesos', label: 'Queso' }, { key: 'Leches', label: 'Leche' }].map(c => (
                <button key={c.key} onClick={() => setEvolCat(c.key)}
                  className={`px-3 py-1.5 font-medium transition-colors ${evolCat === c.key ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {c.label}
                </button>
              ))}
            </div>
            {evolSubcatOpts.length > 0 && (<>
              <span className="text-gray-400 font-medium">Subcategoría:</span>
              <div className="flex flex-wrap gap-1">
                {evolSubcatOpts.map(s => (
                  <button key={s} onClick={() => setEvolSubcat(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s])}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${evolSubcat.includes(s) ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-amber-50'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </>)}
            <span className="text-gray-400 font-medium">Medida:</span>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {([['valor', 'Valor $'], ['unidades', 'Unidades']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setEvolMedida(k)}
                  className={`px-3 py-1.5 font-medium transition-colors ${evolMedida === k ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {l}
                </button>
              ))}
            </div>
            <span className="text-gray-400 font-medium">Desde:</span>
            <input type="month" value={evolDesde} min="2024-01" max="2026-12"
              onChange={e => setEvolDesde(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
            <span className="text-gray-400 font-medium">Hasta:</span>
            <input type="month" value={evolHasta} min="2024-01" max="2026-12"
              onChange={e => setEvolHasta(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
            <button
              onClick={() => { setEvolVista('mensual'); setEvolCat(''); setEvolSubcat([]); setEvolDesde(''); setEvolHasta('') }}
              className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 font-medium transition-colors">
              ↺ Reset
            </button>
          </div>

          {evolVista === 'diaria' ? (
            /* ── Vista diaria ── */
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
                      <linearGradient id="gradSelEvolDia" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor="#c8873a" stopOpacity={0.35}/>
                        <stop offset="60%"  stopColor="#c8873a" stopOpacity={0.08}/>
                        <stop offset="100%" stopColor="#c8873a" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false}
                      interval={Math.max(0, Math.floor(evolDiario.series.length / 20) - 1)} />
                    <YAxis
                      tickFormatter={v => evolMedida === 'valor'
                        ? (v >= 1e3 ? '$' + (v / 1e3).toFixed(0) + 'K' : '$' + v)
                        : (v >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : String(v))
                      }
                      tick={{ fontSize: 11, fill: '#94a3b8' }} width={55} axisLine={false} tickLine={false}
                    />
                    <Tooltip
                      labelFormatter={(l: string) => l}
                      formatter={(v: number) => [
                        evolMedida === 'valor' ? fmtFull(v) : v?.toLocaleString('en-US'),
                        evolMedida === 'valor' ? 'Venta ($)' : 'Unidades',
                      ]}
                      contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                    />
                    <Area type="monotone" dataKey={evolMedida === 'valor' ? 'valor' : 'unidades'}
                      stroke="#c8873a" strokeWidth={2.5} fill="url(#gradSelEvolDia)" dot={false}
                      activeDot={{ r: 5, strokeWidth: 2, fill: '#fff', stroke: '#c8873a' }} connectNulls />
                  </AreaChart>
                </ResponsiveContainer>
              </>
            ) : (
              <div className="h-[280px] bg-gray-50 rounded-lg animate-pulse flex items-center justify-center">
                <span className="text-xs text-gray-300">Cargando datos diarios...</span>
              </div>
            )
          ) : (
            /* ── Vista mensual (2024 / 2025 / 2026) ── */
            <>
              {/* YTD + OOS banners */}
              {ts && (
                <div className="flex gap-3 mb-4 flex-wrap">
                  <div className={`flex-1 min-w-[180px] rounded-lg px-4 py-2.5 border ${ts.delta_ytd >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                    <p className={`text-[9px] font-bold uppercase tracking-widest mb-0.5 ${ts.delta_ytd >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      Crecimiento YTD Sell-Out vs 2025
                    </p>
                    <p className={`text-lg font-bold ${ts.delta_ytd >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {ts.delta_ytd >= 100 || ts.ytd_2025 === 0 ? 'Sin datos 2025' : `${ts.delta_ytd > 0 ? '+' : ''}${ts.delta_ytd.toFixed(1)}%`}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {fmtFull(ts.ytd_2026)} · 2026 YTD {ts.ultimo_mes_nombre ? `Ene–${ts.ultimo_mes_nombre}` : ''}
                    </p>
                  </div>
                  {ts.oos_meses.length > 0 ? (
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

              {ts ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={continuoSeries} margin={{ top: 10, right: 16, left: 8, bottom: 4 }} barCategoryGap="18%">
                    <defs>
                      <linearGradient id="gradSelEvoCont" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#c8873a" stopOpacity={1}/>
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.85}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="mes_str" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false}
                      interval={continuoSeries.length > 24 ? 1 : 0} />
                    <YAxis
                      tickFormatter={v => evolMedida === 'valor'
                        ? (v >= 1e3 ? '$' + (v / 1e3).toFixed(0) + 'K' : '$' + v)
                        : (v >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : String(v))
                      }
                      tick={{ fontSize: 11, fill: '#94a3b8' }} width={55} axisLine={false} tickLine={false}
                    />
                    <Tooltip
                      formatter={(v: number, name: string) => [
                        evolMedida === 'valor' ? fmtFull(v) : v?.toLocaleString('en-US'),
                        name,
                      ]}
                      cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                      contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                    />
                    {ts.baseline_val > 0 && evolMedida === 'valor' && (
                      <ReferenceLine y={ts.baseline_val} stroke="#f59e0b" strokeDasharray="4 4"
                        label={{ value: 'Baseline', fontSize: 9, fill: '#f59e0b', position: 'insideTopRight' }} />
                    )}
                    <Bar dataKey="valor" name={evolMedida === 'valor' ? 'Venta' : 'Unidades'}
                      fill="url(#gradSelEvoCont)" radius={[6, 6, 0, 0]} maxBarSize={24}>
                      <LabelList dataKey="valor" position="top"
                        formatter={(v: any) => {
                          const n = Number(v); if (!isFinite(n) || n === 0) return ''
                          if (evolMedida === 'valor') {
                            if (Math.abs(n) >= 1e6) return '$' + (n/1e6).toFixed(1) + 'M'
                            if (Math.abs(n) >= 1e3) return '$' + (n/1e3).toFixed(0) + 'K'
                            return '$' + Math.round(n)
                          }
                          if (Math.abs(n) >= 1e6) return (n/1e6).toFixed(1) + 'M'
                          if (Math.abs(n) >= 1e3) return (n/1e3).toFixed(0) + 'K'
                          return String(Math.round(n))
                        }}
                        style={{ fontSize: 8, fill: '#92400e', fontWeight: 700 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <div className="h-[280px] bg-gray-50 rounded-lg animate-pulse" />}

              <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-400 flex-wrap">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-500 inline-block" />Timeline continuo 2024 → 2026</span>
                {ts?.baseline_val > 0 && evolMedida === 'valor' && (
                  <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 border-t-2 border-dashed border-amber-400 inline-block" />Baseline {fmtFull(ts.baseline_val)}/mes</span>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Sección 2: Top N SKUs ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-gray-800">🏆 {evolTopN === 5 ? 'Top 5 SKUs' : t5?.skus?.length ? `${t5.skus.length} SKUs` : 'Todos los SKUs'} — Evolución Mensual 2026</h3>
          </div>
          <p className="text-xs text-gray-400 mb-3">Por venta acumulada · Selectos</p>
          {/* Controls bar */}
          <div className="flex items-center gap-x-3 gap-y-2 flex-wrap text-xs mb-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
            <span className="text-gray-400 font-medium">Medida:</span>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {([['valor', 'Valor ($)'], ['unidades', 'Unidades']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setEvolMedida(k)}
                  className={`px-3 py-1.5 font-medium transition-colors ${evolMedida === k ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {l}
                </button>
              ))}
            </div>
            <span className="text-gray-400 font-medium">Categoría:</span>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {[{ key: '', label: 'Todas' }, { key: 'Quesos', label: 'Queso' }, { key: 'Leches', label: 'Leche' }].map(c => (
                <button key={c.key} onClick={() => setEvolTop5Cat(c.key)}
                  className={`px-3 py-1.5 font-medium transition-colors ${evolTop5Cat === c.key ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {c.label}
                </button>
              ))}
            </div>
            {evolSubcatOpts.length > 0 && (<>
              <span className="text-gray-400 font-medium">Subcategoría:</span>
              <div className="flex flex-wrap gap-1">
                {evolSubcatOpts.map(s => (
                  <button key={s} onClick={() => setEvolSubcat(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s])}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${evolSubcat.includes(s) ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-amber-50'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </>)}
            <span className="text-gray-400 font-medium">Mostrar:</span>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              <button onClick={() => setEvolTopN(5)}
                className={`px-3 py-1.5 font-medium transition-colors ${evolTopN === 5 ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                Top 5
              </button>
              <button onClick={() => setEvolTopN(200)}
                className={`px-3 py-1.5 font-medium transition-colors ${evolTopN !== 5 ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {evolTopN !== 5 && t5?.skus?.length ? `Todas (${t5.skus.length})` : 'Todas'}
              </button>
            </div>
            <span className="text-gray-400 font-medium">Escala:</span>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {([['lineal', 'Lineal'], ['log', 'Log']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setEvolLogScale(k === 'log')}
                  className={`px-3 py-1.5 font-medium transition-colors ${(k === 'log') === evolLogScale ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {t5?.skus?.length > 0 ? (() => {
            const corte = ts?.ultimo_mes ?? 12
            const chartData = Array.from({ length: corte }, (_, i) => i + 1).map(m => {
              const row: Record<string, any> = { mes: m, mes_nombre: MN_SHORT[m] }
              for (const sku of (t5.skus as any[])) {
                const pt = sku.series.find((s: any) => s.mes === m)
                if (pt) {
                  const v = evolMedida === 'valor' ? pt.valor : pt.unidades
                  row[sku.sku] = evolLogScale && v <= 0 ? null : v
                }
              }
              return row
            })
            return (
              <ResponsiveContainer width="100%" height={380}>
                <LineChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="mes_nombre" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis
                    scale={evolLogScale ? 'log' : 'auto'}
                    domain={evolLogScale ? [1, 'auto'] : [0, 'auto']}
                    allowDataOverflow={evolLogScale}
                    tickFormatter={v => evolMedida === 'valor'
                      ? (v >= 1e3 ? '$' + (v / 1e3).toFixed(0) + 'K' : '$' + v)
                      : (v >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : String(v))
                    }
                    tick={{ fontSize: 11, fill: '#94a3b8' }} width={55} axisLine={false} tickLine={false}
                  />
                  <Tooltip
                    formatter={(v: number, name: string) => {
                      const s = (t5.skus as any[]).find((x: any) => x.sku === name)
                      return [
                        evolMedida === 'valor' ? fmtFull(v) : v?.toLocaleString('en-US'),
                        s ? s.descripcion.substring(0, 22) : name,
                      ]
                    }}
                    contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  />
                  <Legend
                    formatter={(name: string) => {
                      const s = (t5.skus as any[]).find((x: any) => x.sku === name)
                      return s ? s.descripcion.substring(0, 18) : name
                    }}
                  />
                  {(t5.skus as any[]).map((sku: any, i: number) => (
                    <Line key={sku.sku} type="monotone" dataKey={sku.sku} name={sku.sku}
                      stroke={SKU_COLORS[i % SKU_COLORS.length]} strokeWidth={2.5} dot={false}
                      activeDot={{ r: 5, strokeWidth: 2, fill: '#fff', stroke: SKU_COLORS[i % SKU_COLORS.length] }}
                      connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )
          })() : <Empty msg="Sin datos de SKUs" />}
        </div>

        {/* ── Sección 3: Sell-In vs Sell-Out ── */}
        <div className="space-y-4">

          {/* Sell-In dark block */}
          {sellin && (() => {
            const qVal = sellinQ?.ingresos?.valor ?? 0
            const lVal = sellinL?.ingresos?.valor ?? 0
            const siBreak = [
              qVal > 0 ? `Queso ${fmt$(qVal)}` : null,
              lVal > 0 ? `Leche ${fmt$(lVal)}` : null,
            ].filter(Boolean).join(' + ') || 'YTD 2026'

            const catRows  = proyData?.catRows ?? []
            let proyTotal = 0, proyReal = 0, proyLastMes = 0
            for (const r of catRows) {
              proyTotal += r.valor_proyectado
              proyReal  += (r.real_usd ?? 0)
              if ((r.real_usd ?? 0) > 0) proyLastMes = Math.max(proyLastMes, r.mes)
            }
            let proyYTD = 0
            for (const r of catRows) { if (r.mes <= proyLastMes) proyYTD += r.valor_proyectado }
            const cumplYTD = proyYTD > 0 ? (proyReal / proyYTD * 100) : 0
            const cumplFY  = proyTotal > 0 ? (proyReal / proyTotal * 100) : 0

            const qPlan = catRows.filter((r: any) => r.categoria === 'Quesos').reduce((s: number, r: any) => s + r.valor_proyectado, 0)
            const lPlan = catRows.filter((r: any) => r.categoria === 'Leches').reduce((s: number, r: any) => s + r.valor_proyectado, 0)
            const planBreak = [
              qPlan > 0 ? `Queso ${fmt$(qPlan)}` : null,
              lPlan > 0 ? `Leche ${fmt$(lPlan)}` : null,
            ].filter(Boolean).join(' + ') || 'Plan completo · CALLEJA'

            const gT = (d: number | null | undefined) => {
              if (d == null || !isFinite(d)) return 'N/A'
              if (d >= 100 || d === 0) return 'N/A (sin 2025)'
              return `${d > 0 ? '+' : ''}${d.toFixed(1)}%`
            }

            return (
              <div className="bg-[#1b3b5f] rounded-xl p-5 text-white">
                <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-widest mb-3">📦 Sell-In · BL Foods → Super Selectos</p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-white/10 rounded-xl p-4">
                    <p className="text-[9px] font-semibold text-blue-300 uppercase tracking-widest mb-1">🔥 HOY · SELL-IN REAL YTD 2026</p>
                    <p className="text-3xl font-bold mb-1">{fmtFull(sellin.ingresos.valor)}</p>
                    <p className="text-xs text-blue-300 mb-3">{siBreak}</p>
                    <div className="border-t border-white/10 pt-3 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[8px] uppercase tracking-widest text-blue-300 mb-1">Crecimiento YTD vs 2025</p>
                        <p className="text-sm font-bold text-yellow-300">{gT(sellin.ingresos.delta)}</p>
                      </div>
                      <div>
                        <p className="text-[8px] uppercase tracking-widest text-blue-300 mb-1">Cumplimiento YTD vs Plan</p>
                        <p className="text-sm font-bold text-yellow-300">{cumplYTD.toFixed(1)}%</p>
                        <p className="text-[10px] text-blue-300 mt-0.5">Plan YTD: {fmtFull(proyYTD)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white/10 rounded-xl p-4">
                    <p className="text-[9px] font-semibold text-blue-300 uppercase tracking-widest mb-1">📊 PROYECCIÓN · CIERRE FY 2026</p>
                    <p className="text-3xl font-bold mb-1">{fmtFull(proyTotal)}</p>
                    <p className="text-xs text-blue-300 mb-3">{planBreak}</p>
                    <div className="border-t border-white/10 pt-3 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[8px] uppercase tracking-widest text-blue-300 mb-1">Crecimiento FY Esperado vs 2025</p>
                        <p className="text-sm font-bold text-yellow-300">N/A (sin 2025)</p>
                      </div>
                      <div>
                        <p className="text-[8px] uppercase tracking-widest text-blue-300 mb-1">Cumplimiento FY Proyectado</p>
                        <p className="text-sm font-bold text-yellow-300">{cumplFY.toFixed(1)}%</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Sell-Out dark block */}
          {selloutKpi && (() => {
            const soQ = selloutKpi.ytd_2026?.quesos ?? 0
            const soL = selloutKpi.ytd_2026?.leches ?? 0
            const soBreak = [
              soQ > 0 ? `Queso ${fmt$(soQ)}` : null,
              soL > 0 ? `Leche ${fmt$(soL)}` : null,
            ].filter(Boolean).join(' + ') || 'YTD 2026'

            const nMeses  = selloutKpi.ultimo_mes || 1
            const qAvgMes = soQ / nMeses
            const lAvgMes = soL / nMeses
            const fyBreak = [
              qAvgMes > 0 ? `Queso ${fmt$(qAvgMes * 12)}` : null,
              lAvgMes > 0 ? `Leche ${fmt$(lAvgMes * 12)}` : null,
            ].filter(Boolean).join(' + ') || `Promedio mensual × 12`

            const gT = (d: number) => {
              if (!isFinite(d) || d >= 100) return 'N/A (sin 2025)'
              return `${d > 0 ? '+' : ''}${d.toFixed(1)}%`
            }

            return (
              <div className="bg-[#1b3b5f] rounded-xl p-5 text-white">
                <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-widest mb-3">🛍️ Sell-Out YTD 2026 & Proyección Fiscal</p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-white/10 rounded-xl p-4">
                    <p className="text-[9px] font-semibold text-blue-300 uppercase tracking-widest mb-1">🔥 HOY · SELL-OUT REAL YTD 2026</p>
                    <p className="text-3xl font-bold mb-1">{fmtFull(selloutKpi.ytd_2026.total)}</p>
                    <p className="text-xs text-blue-300 mb-3">{soBreak}{ts?.ultimo_mes_nombre ? ` · Ene–${ts.ultimo_mes_nombre}` : ''}</p>
                    <div className="border-t border-white/10 pt-3 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[8px] uppercase tracking-widest text-blue-300 mb-1">YTD 2026 vs YTD 2025</p>
                        <p className="text-sm font-bold text-yellow-300">
                          {selloutKpi.ytd_2025.total > 0 ? gT(selloutKpi.delta_ytd) : 'Sin datos 2025'}
                        </p>
                        <p className="text-[10px] text-blue-300 mt-0.5">vs {fmtFull(selloutKpi.ytd_2025.total)} en 2025</p>
                      </div>
                      <div>
                        <p className="text-[8px] uppercase tracking-widest text-blue-300 mb-1">Promedio Mensual</p>
                        <p className="text-sm font-bold text-yellow-300">{fmtFull(selloutKpi.ytd_2026.total / nMeses)}</p>
                        <p className="text-[10px] text-blue-300 mt-0.5">/mes · {nMeses} meses</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white/10 rounded-xl p-4">
                    <p className="text-[9px] font-semibold text-blue-300 uppercase tracking-widest mb-1">📈 PROYECCIÓN · SELL-OUT FY 2026</p>
                    <p className="text-3xl font-bold mb-1">{fmtFull(selloutKpi.fy_2026_est)}</p>
                    <p className="text-xs text-blue-300 mb-3">{fyBreak}</p>
                    <div className="border-t border-white/10 pt-3 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[8px] uppercase tracking-widest text-blue-300 mb-1">FY 2025 (Referencia)</p>
                        <p className="text-sm font-bold text-yellow-300">{fmtFull(selloutKpi.fy_2025.total)}</p>
                        <p className="text-[10px] text-blue-300 mt-0.5">año completo</p>
                      </div>
                      <div>
                        <p className="text-[8px] uppercase tracking-widest text-blue-300 mb-1">Crecimiento FY vs 2025</p>
                        <p className="text-sm font-bold text-yellow-300">
                          {selloutKpi.fy_2025.total > 0 ? gT(selloutKpi.delta_fy) : 'N/A (sin 2025)'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Vista consolidada */}
          {selloutKpi && sellin && (
            <p className="text-xs text-gray-400 leading-relaxed px-1">
              📋 <span className="font-semibold text-gray-600">Vista consolidada:</span> Sell-out combinado Queso + Leche UHT.
              {' '}Total FY 2026 sell-out proy: <span className="font-semibold text-gray-700">{fmtFull(selloutKpi.fy_2026_est)}</span>
              {(proyData?.catRows?.length ?? 0) > 0 && (() => {
                const t = (proyData.catRows as any[]).reduce((s: number, r: any) => s + r.valor_proyectado, 0)
                return t > 0 ? <> · Sell-In plan FY: <span className="font-semibold text-gray-700">{fmtFull(t)}</span></> : null
              })()}
            </p>
          )}

          {/* Gráficas mensuales — líneas */}
          {cp && (cp.quesos?.length > 0 || cp.leches?.length > 0) && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">Sell-In vs Sell-Out · Comparativo mensual</p>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Sell-In = facturas BL Foods → Super Selectos (CIF, asignadas al mes que llegan a PDV).
                  Sell-Out = venta al consumidor desde sell-out reportado.
                  Margen comercial = Sell-Out − Sell-In = lo que captura Super Selectos como retailer.
                  Líneas continuas = real, punteadas = proyectado.
                </p>
              </div>
              <div className="space-y-6">
                {cp.quesos?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-2">🧀 Queso</p>
                    <ResponsiveContainer width="100%" height={210}>
                      <AreaChart data={cp.quesos} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                        <defs>
                          <linearGradient id="gradCpQ_si" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%"   stopColor="#94a3b8" stopOpacity={0.25}/>
                            <stop offset="100%" stopColor="#94a3b8" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="gradCpQ_so" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%"   stopColor="#c8873a" stopOpacity={0.4}/>
                            <stop offset="100%" stopColor="#c8873a" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="mes_nombre" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={v => v >= 1e3 ? '$' + (v / 1e3).toFixed(0) + 'K' : '$' + v} tick={{ fontSize: 10, fill: '#94a3b8' }} width={48} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(v: number, n: string) => [fmtFull(v), n === 'sellin' ? 'Sell-In' : 'Sell-Out']}
                          contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}/>
                        <Legend formatter={(n: string) => n === 'sellin' ? 'Sell-In' : 'Sell-Out'} />
                        <Area type="monotone" dataKey="sellin"  name="sellin"  stroke="#94a3b8" strokeWidth={2} fill="url(#gradCpQ_si)" dot={false} activeDot={{ r: 4 }} connectNulls />
                        <Area type="monotone" dataKey="sellout" name="sellout" stroke="#c8873a" strokeWidth={2.5} fill="url(#gradCpQ_so)" dot={false} activeDot={{ r: 5, strokeWidth: 2, fill: '#fff', stroke: '#c8873a' }} connectNulls />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {cp.leches?.length > 0 && (
                  <div className="border-t border-gray-50 pt-5">
                    <p className="text-xs font-semibold text-gray-600 mb-2">🥛 Leche UHT</p>
                    <ResponsiveContainer width="100%" height={210}>
                      <AreaChart data={cp.leches} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                        <defs>
                          <linearGradient id="gradCpL_si" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%"   stopColor="#94a3b8" stopOpacity={0.25}/>
                            <stop offset="100%" stopColor="#94a3b8" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="gradCpL_so" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%"   stopColor="#3b82f6" stopOpacity={0.4}/>
                            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="mes_nombre" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={v => v >= 1e3 ? '$' + (v / 1e3).toFixed(0) + 'K' : '$' + v} tick={{ fontSize: 10, fill: '#94a3b8' }} width={48} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(v: number, n: string) => [fmtFull(v), n === 'sellin' ? 'Sell-In' : 'Sell-Out']}
                          contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}/>
                        <Legend formatter={(n: string) => n === 'sellin' ? 'Sell-In' : 'Sell-Out'} />
                        <Area type="monotone" dataKey="sellin"  name="sellin"  stroke="#94a3b8" strokeWidth={2} fill="url(#gradCpL_si)" dot={false} activeDot={{ r: 4 }} connectNulls />
                        <Area type="monotone" dataKey="sellout" name="sellout" stroke="#3b82f6" strokeWidth={2.5} fill="url(#gradCpL_so)" dot={false} activeDot={{ r: 5, strokeWidth: 2, fill: '#fff', stroke: '#3b82f6' }} connectNulls />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

      </div>
    )
  }

  function Cobertura() {
    const L = isLoading('cobertura')

    if (L) return (
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse">
          <div className="h-4 bg-gray-100 rounded w-1/3 mb-3" />
          <div className="h-3 bg-gray-50 rounded w-full mb-2" />
          <div className="grid grid-cols-4 gap-3 mt-4">
            {Array(4).fill(0).map((_, i) => <div key={i} className="h-20 bg-gray-50 rounded-lg" />)}
          </div>
        </div>
        {Array(3).fill(0).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse">
            <div className="h-4 bg-gray-100 rounded w-1/3 mb-4" />
            <div className="h-[200px] bg-gray-50 rounded" />
          </div>
        ))}
      </div>
    )

    if (!cob?.rows?.length) return <Empty msg="Sin datos de cobertura" />

    const allRows: any[]  = cob.rows
    const totalPdvs       = cob.total_pdvs
    const skuSaludables   = allRows.filter((r: any) => r.cobertura_pct >= 70).length
    const skuBaja         = allRows.filter((r: any) => r.cobertura_pct < 50).length

    // ── Bullet chart helpers ──
    const bulletRows = allRows
      .map((r: any) => ({
        ...r,
        _actual: cobVista === 'ponderada' ? r.cobertura_ponderada : r.cobertura_pct,
        _max:    r.cobertura_maxima,
      }))
      .sort((a: any, b: any) => {
        if (cobSort === 'gap')    return b.gap_pp    - a.gap_pp
        if (cobSort === 'actual') return b._actual   - a._actual
        return b._max - a._max
      })

    const barColor = (pct: number) =>
      pct >= 70 ? '#10b981' : pct >= 50 ? '#f59e0b' : pct >= 30 ? '#f97316' : '#ef4444'

    // ── Heatmap helpers ──
    const nseGroups: string[] = (cobNse?.groups ?? []).map((g: any) => g.nse).sort()
    const heatSkus: any[] = cobNse?.skus ?? []

    // NSE cell color: 0% = red, 100% = green
    const heatBg = (pct: number) => {
      if (pct >= 70) return { bg: '#d1fae5', tc: '#065f46' }
      if (pct >= 50) return { bg: '#fef3c7', tc: '#92400e' }
      if (pct > 0)   return { bg: '#fee2e2', tc: '#991b1b' }
      return { bg: '#fef2f2', tc: '#dc2626' }
    }

    return (
      <div className="space-y-5">

        {/* ── Panel 1: Análisis Visual KPIs ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-sm font-semibold text-gray-800">🎯 Cobertura de Distribución — Análisis Visual</h3>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed mb-4">
            <span className="font-semibold">📘 Cobertura numérica</span> = % de tiendas con stock del SKU (sobre {totalPdvs} tiendas Super Selectos).{' '}
            <span className="font-semibold">Cobertura ponderada</span> = mismas tiendas pero pesadas por su contribución a la venta total de Borden (ej: 50% puede ser 70% si las que tienen stock son las que más venden).{' '}
            <span className="font-semibold">Máxima histórica</span> = mejor mes alcanzado de cobertura.{' '}
            <span className="font-semibold">Gap</span> = "pp" = puntos porcentuales (ej: gap 21.9pp = la cobertura actual está 21.9 puntos abajo del máximo histórico).
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                label: `COBERTURA NUMÉRICA · QUESO + LECHE`,
                value: cob.avg_cob + '%',
                sub:   `vs máx histórica ${cob.max_historica}% · gap ${cob.gap_global}pp`,
                tc:    'text-emerald-600',
              },
              {
                label: 'COBERTURA PONDERADA',
                value: cob.avg_ponderada + '%',
                sub:   `por contribución de venta · ${allRows.length} SKUs`,
                tc:    'text-emerald-600',
              },
              {
                label: 'SKUS SALUDABLES',
                value: skuSaludables,
                sub:   'cobertura ≥ 70% red',
                tc:    skuSaludables > 0 ? 'text-emerald-600' : 'text-red-600',
              },
              {
                label: 'SKUS BAJA COBERTURA',
                value: skuBaja,
                sub:   'por debajo de 50% red — oportunidad',
                tc:    skuBaja > 0 ? 'text-red-600' : 'text-gray-800',
              },
            ].map(c => (
              <div key={c.label} className="border border-gray-100 rounded-xl p-4">
                <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mb-2 leading-tight">{c.label}</p>
                <p className={`text-2xl font-bold mb-1 ${c.tc}`}>{c.value}</p>
                <p className="text-xs text-gray-400">{c.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Panel 2: NSE Bar Chart ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">📊 Por NSE — ¿Dónde están las brechas?</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Comparativa entre cobertura actual y máxima histórica por nivel socioeconómico de tienda.
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#d1d5db' }}/> Máxima Histórica</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#1b3b5f' }}/> Cobertura Actual</span>
            </div>
          </div>
          {cobNse?.groups?.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={cobNse.groups.map((g: any) => ({
                  nse:    `NSE ${g.nse} (${g.n_tiendas} tiendas)`,
                  actual: parseFloat(g.cob_actual_avg.toFixed(1)),
                  maxima: parseFloat(Math.max(g.cob_actual_avg, g.cob_max_avg).toFixed(1)),
                }))}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                barCategoryGap="25%"
              >
                <defs>
                  <linearGradient id="gradNseMax" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#d1d5db" stopOpacity={1}/>
                    <stop offset="100%" stopColor="#e5e7eb" stopOpacity={0.85}/>
                  </linearGradient>
                  <linearGradient id="gradNseActual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#1b3b5f" stopOpacity={1}/>
                    <stop offset="100%" stopColor="#3a6fa8" stopOpacity={0.85}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="nse" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tickFormatter={v => v + '%'} tick={{ fontSize: 11, fill: '#94a3b8' }} width={60} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number, n: string) => [v.toFixed(1) + '%', n === 'maxima' ? 'Máxima Histórica' : 'Cobertura Actual']}
                  cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                  contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
                <Bar dataKey="maxima" name="maxima" fill="url(#gradNseMax)" radius={[8, 8, 0, 0]} maxBarSize={34}>
                  <LabelList dataKey="maxima" position="top" formatter={(v: number) => v.toFixed(0) + '%'} style={{ fontSize: 9, fill: '#4b5563', fontWeight: 700 }} />
                </Bar>
                <Bar dataKey="actual" name="actual" fill="url(#gradNseActual)" radius={[8, 8, 0, 0]} maxBarSize={34}>
                  <LabelList dataKey="actual" position="top" formatter={(v: number) => v.toFixed(0) + '%'} style={{ fontSize: 9, fill: '#1e3a8a', fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] bg-gray-50 rounded-lg flex items-center justify-center">
              <p className="text-xs text-gray-300">Sin datos de NSE — la cobertura por nivel socioeconómico no está disponible</p>
            </div>
          )}
        </div>

        {/* ── Panel 3: Bullet Chart ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-1">📋 Bullet Chart por SKU — Actual vs Máxima Histórica</h3>
          <p className="text-xs text-gray-400 mb-4">
            Cada barra muestra: <span className="font-medium text-gray-500">línea gris clara</span> = máxima histórica ·{' '}
            <span className="font-medium text-gray-500">barra coloreada</span> = cobertura actual. La diferencia = espacio para crecer recuperando distribución previa.
          </p>

          <div className="flex items-center gap-x-4 gap-y-2 flex-wrap text-xs mb-4">
            <div className="flex items-center gap-2">
              <span className="text-gray-400 font-medium">Ordenar por:</span>
              {([['gap', 'Mayor Gap'], ['actual', 'Cobertura Actual'], ['maxima', 'Cobertura Máxima']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setCobSort(k)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors border ${cobSort === k ? 'bg-[#1b3b5f] text-white border-[#1b3b5f]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                  {l}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400 font-medium">Vista:</span>
              {([['numerica', 'Numérica'], ['ponderada', 'Ponderada por venta']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setCobVista(k)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors border ${cobVista === k ? 'bg-[#1b3b5f] text-white border-[#1b3b5f]' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Bullet bars */}
          <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
            {bulletRows.map((r: any) => (
              <div key={r.sku} className="flex items-center gap-3 py-1.5">
                {/* SKU label */}
                <div className="w-52 flex-shrink-0">
                  <p className="text-xs font-semibold text-gray-700 truncate">{r.descripcion}</p>
                  <p className="text-[10px] text-gray-400">{r.sku} · {r.categoria}</p>
                </div>
                {/* Bullet bar — scale: 100% = total tiendas (121) */}
                <div className="flex-1 relative h-7 bg-gray-100 rounded overflow-hidden">
                  {/* Historical max % of total stores */}
                  <div className="absolute inset-y-0 left-0 bg-gray-200 rounded"
                    style={{ width: `${Math.min(r._max, 100)}%` }} />
                  {/* Actual % of total stores */}
                  <div className="absolute inset-y-0 left-0 rounded transition-all"
                    style={{ width: `${Math.min(r._actual, 100)}%`, backgroundColor: barColor(r._actual) }} />
                  {/* Max marker line */}
                  {r._max > r._actual && (
                    <div className="absolute inset-y-0 w-0.5 bg-gray-500 opacity-60"
                      style={{ left: `${Math.min(r._max, 100)}%` }} />
                  )}
                </div>
                {/* Numbers */}
                <div className="flex gap-4 text-right flex-shrink-0">
                  <div className="w-12">
                    <p className="text-[9px] text-gray-400">Actual</p>
                    <p className="text-xs font-bold" style={{ color: barColor(r._actual) }}>{r._actual.toFixed(0)}%</p>
                    <p className="text-[9px] text-gray-400">{r.pdvs_activos} PDVs</p>
                  </div>
                  <div className="w-12">
                    <p className="text-[9px] text-gray-400">Máx hist.</p>
                    <p className="text-xs font-semibold text-gray-500">{r._max.toFixed(0)}%</p>
                    <p className="text-[9px] text-gray-400">{r.pdvs_max} PDVs</p>
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

        {/* ── Panel 4: Heatmap NSE × SKU ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h3 className="text-sm font-semibold text-gray-800">🌡️ Heatmap NSE × SKU</h3>
            <p className="text-xs text-gray-400">Cada celda muestra el % de tiendas con stock del SKU en cada nivel NSE. Verde = buena distribución, rojo = baja.</p>
          </div>

          {heatSkus.length > 0 && nseGroups.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="text-xs border-collapse" style={{ minWidth: '100%' }}>
                <thead>
                  {/* Row 1: group labels */}
                  <tr className="bg-gray-50">
                    <th className="text-left px-4 py-2 font-semibold text-gray-700 border-b border-gray-200 w-72" rowSpan={2}>Producto</th>
                    <th className="text-center px-3 py-2 font-semibold text-gray-600 border-b border-gray-200 w-20" rowSpan={2}>% Venta</th>
                    {nseGroups.map(nse => (
                      <th key={nse} colSpan={2}
                        className="text-center px-2 py-2 font-bold text-gray-700 border-b border-gray-100 border-l border-l-gray-300">
                        NSE {nse}
                        <span className="ml-1.5 text-[9px] font-normal text-gray-400">
                          ({(cobNse?.groups ?? []).find((g: any) => g.nse === nse)?.n_tiendas ?? 0} tiendas)
                        </span>
                      </th>
                    ))}
                  </tr>
                  {/* Row 2: sub-column labels */}
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {nseGroups.flatMap(nse => [
                      <th key={`${nse}-act-h`}
                        className="text-center px-4 py-1.5 text-[9px] font-semibold text-gray-500 uppercase tracking-widest border-l border-l-gray-300 w-28">
                        Actual
                      </th>,
                      <th key={`${nse}-max-h`}
                        className="text-center px-3 py-1.5 text-[9px] font-normal text-gray-300 uppercase tracking-widest w-16">
                        Máx
                      </th>,
                    ])}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {heatSkus.map((s: any) => (
                    <tr key={s.sku} className="hover:bg-gray-50/60">
                      <td className="px-4 py-2.5 border-r border-gray-100">
                        <p className="font-semibold text-gray-700 truncate max-w-[260px]">{s.descripcion}</p>
                        <p className="text-[10px] text-gray-400">{s.sku}</p>
                      </td>
                      <td className="px-3 py-2.5 text-center border-r border-gray-100">
                        <span className="font-semibold text-blue-600" style={{
                          background: `rgba(59,130,246,${Math.min(s.pct_venta / 20, 0.25)})`,
                          padding: '1px 5px', borderRadius: 3,
                        }}>{s.pct_venta.toFixed(1)}%</span>
                      </td>
                      {nseGroups.flatMap(nse => {
                        const cell = s.nse?.[nse]
                        const act  = cell?.cob_actual ?? 0
                        const mx   = cell?.cob_max    ?? 0
                        const { bg, tc } = heatBg(act)
                        return [
                          <td key={`${nse}-act`}
                            className="text-center px-4 py-2.5 font-bold border-l border-l-gray-300"
                            style={{ backgroundColor: bg, color: tc, minWidth: '7rem' }}>
                            {act.toFixed(0)}%
                          </td>,
                          <td key={`${nse}-max`}
                            className="text-center px-3 py-2.5 text-[10px] text-gray-400 border-r border-gray-100"
                            style={{ minWidth: '4rem' }}>
                            {mx.toFixed(0)}%
                          </td>,
                        ]
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center">
              <p className="text-xs text-gray-300">Sin datos de NSE por tienda — disponible cuando el mapeo NSE esté activo para Selectos</p>
            </div>
          )}
        </div>

      </div>
    )
  }

  function Inventarios() {
    const L  = isLoading('inventarios')
    const ik = invKpis
    const id = invDetail

    const urgenciaStyle: Record<string, string> = {
      'CRÍTICO': 'bg-red-100 text-red-700',
      'ALTO':    'bg-amber-100 text-amber-700',
      'MEDIO':   'bg-gray-100 text-gray-500',
    }

    function loadSkuTienda() {
      const p = new URLSearchParams()
      if (skuTiendaFilters.salud)  p.set('salud',  skuTiendaFilters.salud)
      if (skuTiendaFilters.nse)    p.set('nse',    skuTiendaFilters.nse)
      if (skuTiendaFilters.tienda) p.set('tienda', skuTiendaFilters.tienda)
      if (skuTiendaFilters.prod)   p.set('prod',   skuTiendaFilters.prod)
      setSkuTiendaLoading(true)
      fetch('/api/comercial/ejecucion/inventario/selectos-sku-tienda?' + p)
        .then(r => r.json())
        .then(d => setSkuTienda(d.rows ?? []))
        .finally(() => setSkuTiendaLoading(false))
    }

    function downloadSkuTiendaCSV() {
      if (!skuTienda?.length) return
      const cols = ['SKU', 'Producto', 'Categoría', 'Tienda', 'NSE', 'Inv u', 'Inv $', 'VPD u/d', 'DOH', 'CEDI disp.', 'Salud']
      const rows = skuTienda.map(r => [
        r.sku, `"${r.descripcion}"`, `"${r.categoria}"`, `"${r.tienda}"`, r.nse,
        r.inv_uni, r.inv_valor.toFixed(2), (typeof r.vpd_dia === 'number' && !isNaN(r.vpd_dia) ? r.vpd_dia.toFixed(2) : ''),
        r.doh ?? '', r.cedi_disp ? 'Sí' : 'No', r.salud,
      ].join(','))
      const blob = new Blob([cols.join(',') + '\n' + rows.join('\n')], { type: 'text/csv' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
      a.download = 'inventario-sku-tienda.csv'; a.click()
    }

    if (L) return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array(4).fill(0).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
              <div className="h-3 bg-gray-100 rounded w-2/3 mb-3" /><div className="h-7 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse h-40" />
        <div className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse h-40" />
      </div>
    )

    return (
      <div className="space-y-5">

        {/* ── Panel 1: Header KPIs ── */}
        {ik && (() => {
          const pctCedi = ik.total.valor > 0 ? (ik.cedi.valor / ik.total.valor * 100) : 0
          const pctPdv  = 100 - pctCedi
          const fecha = ik.pdv.ultima_fecha
            ? new Date(ik.pdv.ultima_fecha).toLocaleDateString('es-SV', { day: '2-digit', month: 'short', year: 'numeric' })
            : null
          return (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-sm font-semibold text-gray-800">📦 Inventarios{fecha ? ` al ${fecha}` : ''} · CEDI + PDV</h3>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: 'INV CEDI',     value: fmtFull(ik.cedi.valor),  sub: `${ik.cedi.unidades.toLocaleString('en-US')} u · ${ik.cedi.tiendas} CEDI`, tc: 'text-blue-700', bg: 'bg-blue-50 border-blue-100' },
                  { label: 'INV PDV',      value: fmtFull(ik.pdv.valor),   sub: `${ik.pdv.unidades.toLocaleString('en-US')} u · ${ik.pdv.tiendas} tiendas`, tc: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-100' },
                  { label: 'TOTAL SISTEMA', value: fmtFull(ik.total.valor), sub: `${ik.total.unidades.toLocaleString('en-US')} u totales`, tc: 'text-gray-800', bg: 'bg-white border-gray-100' },
                  { label: 'DISTRIBUCIÓN', value: `${pctCedi.toFixed(0)}% CEDI`, sub: `${pctPdv.toFixed(0)}% PDV — ratio deseable <40% CEDI`, tc: 'text-gray-700', bg: 'bg-gray-50 border-gray-100' },
                ].map(c => (
                  <div key={c.label} className={`rounded-xl border shadow-sm p-4 ${c.bg}`}>
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">{c.label}</p>
                    <p className={`text-xl font-bold mb-1 ${c.tc}`}>{c.value}</p>
                    <p className="text-xs text-gray-500">{c.sub}</p>
                  </div>
                ))}
              </div>
              {/* Distribution bar */}
              {ik.total.valor > 0 && (
                <div className="mt-4">
                  <div className="flex rounded-full overflow-hidden h-3">
                    <div className="bg-blue-400 transition-all" style={{ width: `${pctCedi}%` }} />
                    <div className="bg-emerald-400 transition-all" style={{ width: `${pctPdv}%` }} />
                  </div>
                  <div className="flex gap-4 mt-1.5 text-[10px] text-gray-400">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />CEDI {pctCedi.toFixed(1)}%</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />PDV {pctPdv.toFixed(1)}%</span>
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {/* ── DOH Cards ── */}
        {ik && ik.baseline.uni_mes > 0 && (() => {
          const vpd       = ik.baseline.uni_mes / 30
          const dohTienda = ik.pdv.unidades  / vpd
          const dohCedi   = ik.cedi.unidades / vpd
          const dohTotal  = ik.total.unidades / vpd
          const dohStyle = (d: number) => {
            if (d < 7)   return { bg: 'bg-red-50 border-red-200',     tc: 'text-red-700' }
            if (d < 14)  return { bg: 'bg-amber-50 border-amber-200', tc: 'text-amber-700' }
            if (d < 60)  return { bg: 'bg-white border-gray-100',     tc: 'text-emerald-700' }
            if (d < 120) return { bg: 'bg-blue-50 border-blue-100',   tc: 'text-blue-700' }
            return { bg: 'bg-purple-50 border-purple-200', tc: 'text-purple-700' }
          }
          return (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Days on Hand</p>
              <p className="text-[10px] text-gray-400 mb-3">VPD baseline: {vpd.toFixed(1)} u/d · Inventario / Venta promedio diaria</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'DOH EN TIENDA', value: dohTienda.toFixed(1) + 'd', sub: `${ik.pdv.unidades.toLocaleString('en-US')} u PDV`, icon: '🏪', ...dohStyle(dohTienda) },
                  { label: 'DOH EN CEDI',   value: dohCedi.toFixed(1)   + 'd', sub: `${ik.cedi.unidades.toLocaleString('en-US')} u CEDI`, icon: '🏭', ...dohStyle(dohCedi) },
                  { label: 'DOH TOTAL',     value: dohTotal.toFixed(1)  + 'd', sub: `${ik.total.unidades.toLocaleString('en-US')} u sistema`, icon: '📦', ...dohStyle(dohTotal) },
                ].map(c => (
                  <div key={c.label} className={`rounded-xl border shadow-sm p-4 ${c.bg}`}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest leading-tight">{c.label}</p>
                      <span className="text-base">{c.icon}</span>
                    </div>
                    <p className={`text-2xl font-bold mb-0.5 ${c.tc}`}>{c.value}</p>
                    <p className="text-xs text-gray-500">{c.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* ── Panel 2: Salud Portafolio ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Donut chart */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            {(() => {
              const sd = selectosData
              // Prefer selectos_data.json sku_rows for richer health data
              const skuRowsHealth = sd?.sku_rows?.length
                ? (() => {
                    const map: Record<string, number> = {}
                    for (const r of (sd.sku_rows ?? [])) {
                      const h = r.health ?? 'Sin datos'
                      // Normalize: ATENCIÓN encoding fix
                      const key = h.includes('ATEN') ? 'ATENCIÓN' : h
                      map[key] = (map[key] ?? 0) + 1
                    }
                    const total = Object.values(map).reduce((s, v) => s + v, 0)
                    return Object.entries(map).map(([salud, count]) => ({
                      salud, count, pct: total > 0 ? Math.round(count / total * 100) : 0,
                    }))
                  })()
                : (id?.health ?? [])

              const total = skuRowsHealth.reduce((s: number, h: any) => s + (h.count ?? 0), 0)
              const divLabel = div === 'TOTAL' ? 'Queso + Leche' : div === 'QUESO' ? 'Queso' : 'Leche'
              const ORDER: Record<string, number> = { 'SALUDABLE': 0, 'OK': 0, 'ATENCIÓN': 1, 'COBERTURA ALTA': 2, 'COB ALTA': 2, 'SOBRESTOCK': 3, 'CRÍTICO': 4, 'Sin datos': 5, 'SIN VPD': 6 }
              const sorted = [...skuRowsHealth].sort((a: any, b: any) => (ORDER[a.salud] ?? 9) - (ORDER[b.salud] ?? 9))
              const pieData = sorted.map((h: any) => {
                const cfg = HEALTH_CFG[h.salud] ?? { color: '#9ca3af', label: h.salud }
                return { name: cfg.label ?? h.salud, value: h.count ?? 0, color: cfg.color }
              })

              const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, value, name }: any) => {
                const RADIAN = Math.PI / 180
                const radius = innerRadius + (outerRadius - innerRadius) * 0.5
                const x = cx + radius * Math.cos(-midAngle * RADIAN)
                const y = cy + radius * Math.sin(-midAngle * RADIAN)
                return value > 0 ? (
                  <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>
                    {value}
                  </text>
                ) : null
              }

              return (
                <>
                  <h3 className="text-sm font-semibold text-gray-800 mb-0.5">
                    🩺 Salud Portafolio Activo ({total} SKUs · {divLabel})
                  </h3>
                  <p className="text-xs text-gray-400 mb-3">Por SKU único · DOH basado en VPD mes actual</p>
                  {pieData.length > 0 ? (
                    <>
                      <div className="flex justify-center">
                        <PieChart width={240} height={220}>
                          <Pie data={pieData} cx={115} cy={105} innerRadius={55} outerRadius={100}
                            dataKey="value" labelLine={false} label={renderLabel}>
                            {pieData.map((entry: any, i: number) => (
                              <Cell key={i} fill={entry.color}/>
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: number, name: string) => [v + ' SKUs', name]}/>
                        </PieChart>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 justify-center">
                        {pieData.map((e: any) => (
                          <span key={e.name} className="flex items-center gap-1 text-[10px] text-gray-600">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{backgroundColor: e.color}}/>
                            {e.name} <span className="font-semibold">({e.value} · {total > 0 ? Math.round(e.value/total*100) : 0}%)</span>
                          </span>
                        ))}
                      </div>
                    </>
                  ) : <Empty msg="Sin datos de salud" />}
                </>
              )
            })()}
          </div>

          {/* KPI urgency cards */}
          {ik && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">⚠️ Alertas de Inventario</h3>
              <p className="text-xs text-gray-400 mb-4">Combinaciones SKU × Tienda con acción requerida</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'CRÍTICOS PDV',  value: ik.critico_sala,  sub: 'DOH < 7 días',       tc: 'text-red-600',    bg: ik.critico_sala  > 0 ? 'bg-red-50 border-red-100'       : 'bg-white border-gray-100' },
                  { label: 'EN ALERTA PDV', value: ik.alerta_sala,   sub: 'DOH 7–14 días',      tc: 'text-amber-600',  bg: ik.alerta_sala   > 0 ? 'bg-amber-50 border-amber-100'   : 'bg-white border-gray-100' },
                  { label: 'SOBRESTOCK',    value: ik.skus_ofertar,  sub: 'DOH > 60 días',      tc: 'text-cyan-600',   bg: ik.skus_ofertar  > 0 ? 'bg-cyan-50 border-cyan-100'     : 'bg-white border-gray-100' },
                  { label: 'QUIEBRE CEDI',  value: ik.quiebre_cedi,  sub: 'SKUs sin stock CEDI', tc: 'text-purple-600', bg: ik.quiebre_cedi  > 0 ? 'bg-purple-50 border-purple-100' : 'bg-white border-gray-100' },
                ].map(c => (
                  <div key={c.label} className={`rounded-xl border p-4 ${c.bg}`}>
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">{c.label}</p>
                    <p className={`text-2xl font-bold ${c.tc}`}>{c.value}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{c.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Panel 3: CEDI Faltantes ── */}
        {id?.cedi_faltantes && (() => {
          const cf = id.cedi_faltantes
          if (!cf.rows?.length) return (
            <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-5">
              <h3 className="text-sm font-semibold text-emerald-800">✅ Sin CEDI Faltantes</h3>
              <p className="text-xs text-emerald-600 mt-1">Todos los SKUs activos tienen stock disponible en CEDI (RANSA).</p>
            </div>
          )
          return (
            <div className="rounded-xl border-l-4 border-red-500 bg-gradient-to-r from-red-50 to-red-50/20 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-red-100">
                <h3 className="text-sm font-semibold text-red-800">🚨 CEDI Faltantes — SKUs SIN stock en bodega RANSA</h3>
                <p className="text-xs text-red-600 mt-1">SKUs activos que NO tienen inventario en CEDI. Dependen únicamente del stock en PDV. Si el PDV se agota antes del próximo pedido = QUIEBRE NACIONAL.</p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-5">
                {[
                  { label: 'SKUS SIN CEDI',    value: cf.kpis.sin_cedi,                    tc: 'text-red-700' },
                  { label: 'CRÍTICOS DOH<14D',  value: cf.kpis.criticos_doh14,              tc: cf.kpis.criticos_doh14 > 0 ? 'text-red-700' : 'text-gray-700' },
                  { label: 'TOTAL UNIDADES PDV', value: Math.round(cf.kpis.pdv_uni).toLocaleString('en-US'), tc: 'text-gray-800' },
                  { label: 'VALOR PDV EXPUESTO', value: fmtFull(cf.kpis.pdv_valor),         tc: 'text-gray-800' },
                ].map(c => (
                  <div key={c.label} className="bg-white rounded-lg border border-red-100 p-3">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">{c.label}</p>
                    <p className={`text-xl font-bold ${c.tc}`}>{c.value}</p>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto border-t border-red-100">
                <table className="w-full text-xs">
                  <thead><tr className="bg-red-50/60 text-gray-500 uppercase tracking-widest text-[10px]">
                    <th className="text-left px-4 py-2.5">Producto</th><th className="text-left px-4 py-2.5">Cat.</th>
                    <th className="text-right px-4 py-2.5">VPD u/d</th><th className="text-right px-4 py-2.5">PDV u</th>
                    <th className="text-right px-4 py-2.5">PDV $</th><th className="text-right px-4 py-2.5">DOH PDV</th>
                    <th className="text-center px-4 py-2.5">Urgencia</th>
                  </tr></thead>
                  <tbody className="divide-y divide-red-50">
                    {cf.rows.map((r: any) => (
                      <tr key={r.sku} className="hover:bg-red-50/30">
                        <td className="px-4 py-2.5 font-medium text-gray-700"><span className="text-gray-400 mr-1.5 text-[10px]">{r.sku}</span>{r.descripcion}</td>
                        <td className="px-4 py-2.5 text-gray-400">{r.categoria}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-600">{r.vpd_dia.toFixed(1)}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{Math.round(r.pdv_uni).toLocaleString('en-US')}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{fmtFull(r.pdv_valor)}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold">
                          <span className={r.doh_pdv !== null && r.doh_pdv < 14 ? 'text-red-600' : r.doh_pdv !== null && r.doh_pdv < 30 ? 'text-amber-600' : 'text-gray-600'}>
                            {r.doh_pdv !== null ? r.doh_pdv + 'd' : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${urgenciaStyle[r.urgencia] ?? 'bg-gray-100 text-gray-500'}`}>{r.urgencia}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })()}

        {/* ── Panel 4: CEDI RANSA Table ── */}
        {cedi.length > 0 && (() => {
          const filtered = cedi.filter((r: any) =>
            !cediSearch || r.descripcion?.toLowerCase().includes(cediSearch.toLowerCase()) || r.sku?.includes(cediSearch)
          )
          return (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">🏭 Inventario en CEDI (RANSA)</h3>
                  <p className="text-xs text-gray-400">Stock disponible para despacho a tiendas</p>
                </div>
                <input value={cediSearch} onChange={e => setCediSearch(e.target.value)} placeholder="Buscar producto…"
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-400 w-48" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="bg-gray-50 text-gray-400 uppercase tracking-widest text-[10px]">
                    <th className="text-left px-4 py-2.5">Código</th><th className="text-left px-4 py-2.5">Producto</th>
                    <th className="text-left px-4 py-2.5">Cat.</th>
                    <th className="text-right px-4 py-2.5">CEDI u</th><th className="text-right px-4 py-2.5">CEDI $</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map((r: any, i: number) => (
                      <tr key={(r.sku ?? r.descripcion ?? '') + i} className="hover:bg-gray-50/60">
                        <td className="px-4 py-2.5 font-mono text-gray-400 text-[10px]">{r.sku ?? '—'}</td>
                        <td className="px-4 py-2.5 font-medium text-gray-700">{r.descripcion ?? '—'}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-semibold ${r.categoria?.toLowerCase().includes('leche') ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-700'}`}>
                            {r.categoria ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono">{(r.inv_mano_cajas ?? 0).toLocaleString('en-US')}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-600">—</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })()}

        {/* ── Panel 5: SKU × Tienda ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h3 className="text-sm font-semibold text-gray-800">🏬 Inventario por SKU × Tienda (activos)</h3>
            <p className="text-xs text-gray-400">Detalle completo con DOH, NSE y salud por combinación</p>
          </div>
          {/* Filters */}
          <div className="px-5 py-3 bg-gray-50/60 border-b border-gray-100 flex items-center gap-x-3 gap-y-2 flex-wrap text-xs">
            <span className="text-gray-400 font-medium">Salud:</span>
            <select value={skuTiendaFilters.salud}
              onChange={e => setSkuTiendaFilters(p => ({ ...p, salud: e.target.value }))}
              className="border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400">
              <option value="">Todas</option>
              {['CRÍTICO', 'ATENCIÓN', 'OK', 'COB ALTA', 'SOBRESTOCK', 'SIN VPD'].map(s => <option key={s}>{s}</option>)}
            </select>
            <span className="text-gray-400 font-medium">NSE:</span>
            <select value={skuTiendaFilters.nse}
              onChange={e => setSkuTiendaFilters(p => ({ ...p, nse: e.target.value }))}
              className="border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400">
              <option value="">Todos</option>
              {['A', 'C', 'D'].map(n => <option key={n}>{n}</option>)}
            </select>
            <input value={skuTiendaFilters.tienda} onChange={e => setSkuTiendaFilters(p => ({ ...p, tienda: e.target.value }))}
              placeholder="Tienda…" className="border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400 w-36" />
            <input value={skuTiendaFilters.prod} onChange={e => setSkuTiendaFilters(p => ({ ...p, prod: e.target.value }))}
              placeholder="Producto…" className="border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400 w-40" />
            <button onClick={loadSkuTienda}
              className="px-3 py-1.5 bg-[#1b3b5f] text-white rounded-lg font-medium hover:bg-[#0f2a47] transition-colors">
              {skuTiendaLoading ? 'Cargando…' : skuTienda ? 'Actualizar' : 'Cargar datos'}
            </button>
            {skuTienda && (
              <button onClick={downloadSkuTiendaCSV}
                className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg font-medium hover:bg-gray-50 transition-colors">
                ⬇ CSV
              </button>
            )}
            {skuTienda && <span className="text-gray-400">{skuTienda.length.toLocaleString('en-US')} filas</span>}
          </div>
          {skuTiendaLoading ? <Skeleton rows={8} /> : skuTienda === null ? (
            <div className="px-5 py-10 text-center">
              <p className="text-xs text-gray-300">Presiona "Cargar datos" para ver el detalle por tienda</p>
            </div>
          ) : skuTienda.length === 0 ? <Empty msg="Sin resultados con los filtros aplicados" /> : (
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-50 text-gray-400 uppercase tracking-widest text-[10px]">
                    <th className="text-left px-4 py-2.5">Producto</th><th className="text-left px-4 py-2.5">Cat.</th>
                    <th className="text-left px-4 py-2.5">Tienda</th><th className="text-center px-3 py-2.5">NSE</th>
                    <th className="text-right px-3 py-2.5">VPD u/d</th><th className="text-right px-3 py-2.5">Inv u</th>
                    <th className="text-right px-3 py-2.5">Inv $</th><th className="text-right px-3 py-2.5">DOH</th>
                    <th className="text-center px-3 py-2.5">CEDI</th><th className="text-center px-3 py-2.5">Salud</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {skuTienda.map((r: any, i: number) => {
                    const saludKey = r.salud ?? ''
                    const cfg = HEALTH_CFG[saludKey] ?? { color: '#9ca3af', bg: '#f9fafb', label: saludKey || 'N/A' }
                    const vpd = typeof r.vpd_dia === 'number' && !isNaN(r.vpd_dia) ? r.vpd_dia : null
                    return (
                      <tr key={i} className="hover:bg-gray-50/60">
                        <td className="px-4 py-2 font-medium text-gray-700 max-w-[200px]">
                          <p className="truncate">{r.descripcion}</p>
                          <p className="text-[9px] text-gray-400 font-normal">{r.sku}</p>
                        </td>
                        <td className="px-4 py-2 text-gray-400">{r.categoria}</td>
                        <td className="px-4 py-2 text-gray-600 max-w-[140px] truncate">{r.tienda}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold ${r.nse === 'A' ? 'bg-amber-50 text-amber-700' : r.nse === 'C' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>{r.nse}</span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-gray-500">{vpd !== null ? vpd.toFixed(1) : '—'}</td>
                        <td className="px-3 py-2 text-right font-mono">{r.inv_uni.toLocaleString('en-US')}</td>
                        <td className="px-3 py-2 text-right font-mono text-gray-600">{fmtFull(r.inv_valor)}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold" style={{ color: cfg.color }}>
                          {r.doh !== null ? r.doh + 'd' : '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold ${r.cedi_disp ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                            {r.cedi_disp ? 'Disponible' : 'Sin CEDI'}
                          </span>
                        </td>
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

        {/* ── Panel 6: Sugerencia de Distribución CEDI → PDV ── */}
        <SugerenciaDistribucion skuTienda={skuTienda} selectosData={selectosData} />

      </div>
    )
  }

  function SugerenciaDistribucion({ skuTienda, selectosData }: { skuTienda: any[] | null, selectosData: any }) {
    const [catFilter,  setCatFilter]  = useState('')
    const [skuFilter,  setSkuFilter]  = useState('')
    const [nseFilter,  setNseFilter]  = useState('')

    // Build suggestion rows: PDV rows with CRÍTICO/ATENCIÓN health that have CEDI stock available
    // Since we may not have CEDI actual stock qty, use cedi_disp flag + health status
    const allRows: any[] = skuTienda ?? []
    const cediSkus = new Set(allRows.filter((r: any) => r.cedi_disp).map((r: any) => r.sku))

    const suggestions = allRows.filter((r: any) => {
      const needsReplen = r.salud === 'CRÍTICO' || r.salud === 'ATENCIÓN'
      const hasCedi     = r.cedi_disp
      if (!needsReplen || !hasCedi) return false
      if (catFilter && r.categoria !== catFilter)                    return false
      if (nseFilter && r.nse !== nseFilter)                          return false
      if (skuFilter && !r.descripcion.toLowerCase().includes(skuFilter.toLowerCase())) return false
      return true
    })

    // Aggregate to get DOH post if we distribute
    const sugRows = suggestions.map((r: any) => {
      const dohActual   = r.doh ?? 0
      const vpd         = typeof r.vpd_dia === 'number' && !isNaN(r.vpd_dia) ? r.vpd_dia : null
      // Suggest sending enough to reach 21d coverage
      const cajasTarget = vpd ? Math.max(0, Math.ceil((21 - dohActual) * vpd)) : null
      const dohPost     = cajasTarget !== null && vpd ? Math.round(dohActual + cajasTarget / vpd) : null
      return { ...r, cajas_sug: cajasTarget, doh_post: dohPost }
    })

    const cats = [...new Set(allRows.map((r: any) => r.categoria).filter(Boolean))].sort()
    const totalLineas = sugRows.length
    const totalCajas  = sugRows.reduce((s: number, r: any) => s + (r.cajas_sug ?? 0), 0)
    const universoTiendas = new Set(sugRows.map((r: any) => r.tienda)).size

    const exportCSV = () => {
      if (!sugRows.length) return
      const header = 'Código,Producto,Categoría,Tienda,NSE,Inv Actual,DOH Actual,DOH Post,Cajas Sugeridas\n'
      const lines  = sugRows.map((r: any) =>
        `${r.sku},"${r.descripcion}",${r.categoria},${r.tienda},${r.nse},${r.inv_uni},${r.doh ?? ''},${r.doh_post ?? ''},${r.cajas_sug ?? ''}`
      ).join('\n')
      const blob = new Blob([header + lines], { type: 'text/csv' })
      const a    = document.createElement('a')
      a.href     = URL.createObjectURL(blob)
      a.download = 'distribucion_cedi_pdv.csv'
      a.click()
    }

    return (
      <div className="rounded-xl overflow-hidden shadow-sm border border-emerald-100">
        {/* gradient header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-500 px-5 py-4">
          <h3 className="text-sm font-bold text-white">🚚 Sugerencia de Distribución CEDI → PDV</h3>
          <p className="text-xs text-emerald-100 mt-0.5">
            SKUs en estado CRÍTICO o ATENCIÓN con stock disponible en CEDI · Carga los datos de la tabla para generar el plan
          </p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 divide-x divide-emerald-100 bg-emerald-50/60">
          {[
            { label: 'Líneas distribución', value: totalLineas.toLocaleString('en-US'), sub: 'desde RANSA/COMALAPA' },
            { label: 'Total cajas a distribuir', value: totalCajas.toLocaleString('en-US'), sub: 'para alcanzar DOH ≥ 21d' },
            { label: 'Universo tiendas', value: universoTiendas.toLocaleString('en-US'), sub: 'PDV con necesidad activa' },
          ].map(k => (
            <div key={k.label} className="px-5 py-3">
              <p className="text-[9px] font-bold text-emerald-700 uppercase tracking-widest">{k.label}</p>
              <p className="text-xl font-bold text-emerald-800">{k.value}</p>
              <p className="text-[10px] text-emerald-600">{k.sub}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white px-5 py-3 border-b border-emerald-100 flex flex-wrap items-center gap-2">
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 bg-white">
            <option value="">Todas las categorías</option>
            {cats.map((c: string) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={nseFilter} onChange={e => setNseFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 bg-white">
            <option value="">Todos los NSE</option>
            {['A','C','D'].map(n => <option key={n} value={n}>NSE {n}</option>)}
          </select>
          <input value={skuFilter} onChange={e => setSkuFilter(e.target.value)} placeholder="Buscar SKU…"
            className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 flex-1 min-w-[120px]"/>
          <button onClick={exportCSV} disabled={!sugRows.length}
            className="ml-auto text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed">
            ⬇ Descargar plan
          </button>
        </div>

        {/* Table */}
        {!skuTienda ? (
          <div className="bg-white px-5 py-8 text-center text-xs text-gray-400">
            Carga primero los datos de Inventario por SKU × Tienda para generar el plan de distribución.
          </div>
        ) : sugRows.length === 0 ? (
          <div className="bg-white px-5 py-8 text-center">
            <p className="text-sm font-semibold text-gray-500">No matching records</p>
            <p className="text-xs text-gray-400 mt-1">Sin SKUs con necesidad activa bajo los filtros seleccionados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto bg-white max-h-[500px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-gray-50 text-gray-400 uppercase tracking-widest text-[10px]">
                <tr>
                  <th className="text-left px-4 py-2.5">Código</th>
                  <th className="text-left px-4 py-2.5">Producto</th>
                  <th className="text-left px-3 py-2.5">Categoría</th>
                  <th className="text-left px-3 py-2.5">Tienda</th>
                  <th className="text-center px-2 py-2.5">NSE</th>
                  <th className="text-right px-3 py-2.5">Inv Actual</th>
                  <th className="text-right px-3 py-2.5">DOH Actual</th>
                  <th className="text-center px-3 py-2.5">Status</th>
                  <th className="text-center px-2 py-2.5">→</th>
                  <th className="text-center px-3 py-2.5">Enviar</th>
                  <th className="text-right px-3 py-2.5">Cajas</th>
                  <th className="text-right px-3 py-2.5">DOH Post</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sugRows.map((r: any, i: number) => {
                  const saludKey = r.salud ?? ''
                  const cfg      = HEALTH_CFG[saludKey] ?? { color: '#9ca3af', bg: '#f9fafb', label: saludKey || 'N/A' }
                  return (
                    <tr key={i} className="hover:bg-emerald-50/30">
                      <td className="px-4 py-2 font-mono text-[10px] text-gray-400">{r.sku}</td>
                      <td className="px-4 py-2 font-medium text-gray-700 max-w-[180px] truncate">{r.descripcion}</td>
                      <td className="px-3 py-2 text-gray-400">{r.categoria}</td>
                      <td className="px-3 py-2 text-gray-600">{r.tienda}</td>
                      <td className="px-2 py-2 text-center">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold ${r.nse === 'A' ? 'bg-amber-50 text-amber-700' : r.nse === 'C' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>{r.nse}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{r.inv_uni.toLocaleString('en-US')}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold" style={{ color: cfg.color }}>
                        {r.doh !== null ? r.doh + 'd' : '—'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold whitespace-nowrap"
                          style={{ backgroundColor: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                      </td>
                      <td className="px-2 py-2 text-center text-gray-400 font-bold">→</td>
                      <td className="px-3 py-2 text-center">
                        <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700">CEDI</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-700">
                        {r.cajas_sug !== null ? r.cajas_sug.toLocaleString('en-US') : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-blue-600 font-semibold">
                        {r.doh_post !== null ? r.doh_post + 'd' : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  function Pedidos() {
    const L  = isLoading('pedidos')
    const sd = selectosData
    if (L) return <div className="space-y-4">{Array(3).fill(0).map((_,i)=><div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse h-28"/>)}</div>
    if (!sd) return <Empty msg="Cargando datos del dashboard…" />

    const dk    = sd.division_kpis ?? {}
    const divD  = div === 'QUESO' ? (dk.queso ?? {}) : div === 'LECHE' ? (dk.leche ?? {}) : (dk.total ?? {})
    const skus  = (sd.sku_rows ?? []).filter((r: any) => div === 'TOTAL' || (div === 'QUESO' ? r.division === 'Quesos' || r.division === 'Queso' : r.division === 'Leches' || r.division === 'Leche'))
    const skusSorted = [...skus].sort((a: any, b: any) => (a.doh_pdv ?? 9999) - (b.doh_pdv ?? 9999))

    const siMonths = sd.sell_in_monthly ?? {}
    const siKeys   = Object.keys(siMonths).sort()
    const siChart  = siKeys.map((m: string) => ({
      name: sdMonthLabel(m),
      sellin: Math.round(siMonths[m]?.real ?? 0),
    }))

    const urgOffers = (sd.ofertas ?? []).filter((r: any) => r.urgencia === 'Alta' || r.urgencia === 'CRÍTICA')

    return (
      <div className="space-y-4">

        {/* ── Card 1: Plan Comercial vs Sistema ── */}
        <div className="rounded-xl p-5 space-y-4" style={{background:'linear-gradient(135deg,#fef9c3 0%,#fef3c7 100%)',borderLeft:'4px solid #ca8a04'}}>
          <h3 className="text-sm font-bold text-amber-900">📋 Plan Comercial — Cumplimiento Real</h3>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { label: 'Sell-In YTD 2026',  value: fmt$(divD.sell_in_ytd_2026  ?? 0), sub: 'facturado a Calleja',  border: '#0f4c81', tc: '#0f4c81' },
              { label: 'Sell-Out YTD 2026', value: fmt$(divD.sell_out_ytd_2026 ?? 0), sub: 'venta en tiendas',     border: '#16a34a', tc: '#166534' },
              { label: 'Sell-Out FY 2025',  value: fmt$(divD.sell_out_fy_2025  ?? 0), sub: 'base año anterior',    border: '#6b7280', tc: '#374151' },
            ].map(c => (
              <div key={c.label} className="bg-white rounded-lg p-3" style={{borderLeft:`3px solid ${c.border}`}}>
                <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{color: c.border}}>{c.label}</p>
                <p className="text-xl font-bold" style={{color: c.tc}}>{c.value}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{c.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Card 2: Sell-In mensual ── */}
        {siChart.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-1">📦 Sell-In Mensual (Calleja SV)</h3>
            <p className="text-xs text-gray-400 mb-4">Valor facturado a Calleja por mes</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={siChart} margin={{top:10,right:16,left:8,bottom:4}} barCategoryGap="20%">
                <defs>
                  <linearGradient id="gradSelSellin" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3a6fa8" stopOpacity={1}/>
                    <stop offset="100%" stopColor="#5b8ec7" stopOpacity={0.85}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
                <XAxis dataKey="name" tick={{fontSize:12, fill:'#64748b'}} axisLine={false} tickLine={false}/>
                <YAxis tickFormatter={v => fmt$(v)} tick={{fontSize:11, fill:'#94a3b8'}} width={52} axisLine={false} tickLine={false}/>
                <Tooltip
                  formatter={(v: number) => [fmt$(v),'Sell-In']}
                  cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                  contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                />
                <Bar dataKey="sellin" fill="url(#gradSelSellin)" radius={[8,8,0,0]} maxBarSize={40}>
                  <LabelList dataKey="sellin" position="top"
                    formatter={(v: any) => {
                      const n = Number(v); if (!isFinite(n) || n === 0) return ''
                      if (Math.abs(n) >= 1e6) return '$' + (n/1e6).toFixed(1) + 'M'
                      if (Math.abs(n) >= 1e3) return '$' + (n/1e3).toFixed(0) + 'K'
                      return '$' + Math.round(n)
                    }}
                    style={{ fontSize: 9, fill: '#1e3a8a', fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Card 3: Sell-Out mensual/diaria (tendencia reusable) ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">
                🛒 Sell-Out {selTendVista === 'mensual' ? 'Mensual' : 'Diaria'} (Selectos)
              </h3>
              {(() => {
                let precioUlt = 0
                let refLabel  = ''
                if (selTendVista === 'diaria' && selTendDaily.length > 0) {
                  const last = selTendDaily[selTendDaily.length - 1]
                  precioUlt = last.unidades > 0 ? last.valor_usd / last.unidades : 0
                  refLabel = last.dia_str
                } else if (selTendVista === 'mensual' && selTend?.total) {
                  const withData = selTend.total.filter(p => (p.unidades ?? 0) > 0)
                  const last = withData[withData.length - 1]
                  if (last) { precioUlt = last.precio_usd; refLabel = last.mes_str }
                }
                const precioFmt = '$' + precioUlt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                return (
                  <p className="text-xs text-gray-400">
                    Venta real en tiendas (fact_ventas_selectos)
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
                  <button key={v} onClick={() => setSelTendVista(v)}
                    className={`px-3 py-1 font-semibold transition-colors ${selTendVista === v ? 'bg-amber-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    {v === 'mensual' ? 'Mensual' : 'Diaria'}
                  </button>
                ))}
              </div>
              <MetricaTogglePill metricas={selTendMetricas} onToggle={toggleSelTendMetrica} activeClass="bg-amber-500 text-white" />
            </div>
          </div>
          {selTendVista === 'mensual' ? (
            <TendenciaMensualChart
              tendencia={selTend}
              metricas={selTendMetricas}
              moneda="usd"
              skuFilter={[]}
            />
          ) : (
            <TendenciaDiariaChart
              rows={selTendDaily}
              metricas={selTendMetricas}
              moneda="usd"
              loading={selTendDailyLoading}
            />
          )}
        </div>

        {/* ── Card 4: Cobertura & Salud por SKU ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">📊 Cobertura y Salud por SKU</h3>
              <p className="text-xs text-gray-400">Ordenado por DOH ascendente · {skusSorted.length} SKUs activos</p>
            </div>
            <span className="text-xs bg-amber-50 text-amber-700 px-2.5 py-0.5 rounded-full border border-amber-100 font-semibold">{sd.metadata?.inv_date ?? ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="bg-gray-50 text-gray-400 uppercase tracking-widest text-[10px]">
                <th className="text-left px-4 py-2.5">Producto</th>
                <th className="text-center px-3 py-2.5">Pareto</th>
                <th className="text-right px-3 py-2.5">Inv PDV (u)</th>
                <th className="text-right px-3 py-2.5">VPD u/d</th>
                <th className="text-right px-3 py-2.5">DOH PDV</th>
                <th className="text-right px-3 py-2.5">Cob. %</th>
                <th className="text-center px-3 py-2.5">Salud</th>
                <th className="text-center px-3 py-2.5">Tendencia</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {skusSorted.map((r: any) => (
                  <tr key={r.sku} className="hover:bg-gray-50/60">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-700">{r.producto}</p>
                      <p className="text-[9px] text-gray-400 font-mono">{r.sku}</p>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold ${r.pareto === 'A' ? 'bg-amber-100 text-amber-700' : r.pareto === 'B' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>{r.pareto}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">{Math.round(r.pdv_uni ?? 0).toLocaleString('en-US')}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-500">{(r.vpd_uni ?? 0).toFixed(1)}</td>
                    <td className="px-3 py-2.5 text-right"><DohChip d={r.doh_pdv}/></td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-600">{(r.cob_num ?? 0).toFixed(1)}%</td>
                    <td className="px-3 py-2.5 text-center"><HealthChip h={r.health ?? 'Sin datos'}/></td>
                    <td className="px-3 py-2.5 text-center"><TendenciaChip t={r.tendencia ?? '—'}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Card 5: SKUs con excedente (ofertas candidatos) ── */}
        {urgOffers.length > 0 && (
          <div className="rounded-xl p-5" style={{background:'linear-gradient(135deg,#dcfce7 0%,#bbf7d0 100%)',borderLeft:'4px solid #16a34a'}}>
            <h3 className="text-sm font-bold text-green-900 mb-2">⚡ SKUs con Excedente — Candidatos a Activación</h3>
            <p className="text-xs text-green-700 mb-3">DOH elevado · considerar oferta comercial para drenar inventario</p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {urgOffers.map((r: any) => (
                <div key={r.sku} className="bg-white rounded-lg p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-800">{r.producto}</p>
                    <p className="text-[10px] text-gray-400">Excedente: {Math.round(r.excedente_uni ?? 0).toLocaleString('en-US')} u · DOH {(r.doh_total ?? 0).toFixed(0)}d</p>
                  </div>
                  <UrgChip u={r.urgencia}/>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    )
  }

  function Ofertas() {
    const L  = isLoading('ofertas')
    const sd = selectosData
    if (L) return <div className="space-y-4">{Array(2).fill(0).map((_,i)=><div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse h-28"/>)}</div>
    if (!sd) return <Empty msg="Cargando datos del dashboard…" />

    const offRows  = sd.ofertas    ?? []
    const offKpis  = sd.ofertas_kpis ?? {}

    const MECA_DOH: { min: number; max: number; label: string; badge: string; mec: string }[] = [
      { min: 250, max: Infinity, label: 'AGRESIVA', badge: 'bg-red-100 text-red-700',    mec: '2×1 / 50% off bundle (Jun–Sep)' },
      { min: 180, max: 250,      label: 'ALTA',     badge: 'bg-amber-100 text-amber-700', mec: 'Combo 2 SKUs + precio especial (Jun–Ago)' },
      { min: 150, max: 180,      label: 'ALTA',     badge: 'bg-amber-100 text-amber-700', mec: 'Descuento directo + end-cap (Jul–Ago)' },
      { min: 120, max: 150,      label: 'MEDIA',    badge: 'bg-blue-100 text-blue-600',   mec: 'Pague 1 lleve 2do al 50% (Jul)' },
      { min: 90,  max: 120,      label: 'BAJA',     badge: 'bg-gray-100 text-gray-500',   mec: 'Material POP + degustación (Ago)' },
    ]
    const getMeca = (doh: number) => MECA_DOH.find(m => doh >= m.min && doh < m.max) ?? null

    const skusWithExcess = (sd.sku_rows ?? []).filter((r: any) => (r.doh_pdv ?? 0) > 90)
      .sort((a: any, b: any) => (b.doh_pdv ?? 0) - (a.doh_pdv ?? 0))

    return (
      <div className="space-y-4">

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'SKUs con Excedente', value: offKpis.n_total ?? skusWithExcess.length, sub: 'DOH PDV > 90d', tc: 'text-gray-800', bg: 'bg-white border-gray-100' },
            { label: 'Urgencia Alta',      value: offKpis.n_altas ?? offRows.filter((r: any) => r.urgencia === 'Alta').length, sub: 'requieren activación pronto', tc: 'text-red-700', bg: 'bg-red-50 border-red-100' },
            { label: 'Excedente Total',    value: (offKpis.total_excedente_uni ?? 0).toLocaleString('en-US') + ' u', sub: 'unidades sobre cobertura 60d', tc: 'text-amber-700', bg: 'bg-amber-50 border-amber-100' },
            { label: 'Período Plan',       value: 'Jun – Oct',  sub: '5 meses escalonados', tc: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-100' },
          ].map(c => (
            <div key={c.label} className={`rounded-xl border shadow-sm p-4 ${c.bg}`}>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">{c.label}</p>
              <p className={`text-xl font-bold mb-0.5 ${c.tc}`}>{c.value}</p>
              <p className="text-xs text-gray-400">{c.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Sección 1: Ofertas Comerciales (liquidación excedentes) ── */}
        <div className="rounded-xl p-5 space-y-4" style={{background:'linear-gradient(135deg,#dcfce7 0%,#bbf7d0 100%)',borderLeft:'4px solid #16a34a'}}>
          <div>
            <h3 className="text-sm font-bold text-green-900">🎯 Ofertas Comerciales — Drenar Excedentes (Jun – Oct 2026)</h3>
            <p className="text-xs text-green-700 mt-1">Plan de activaciones escalonadas por nivel de DOH. Mecánicas comerciales visibles y vendibles para el cliente.</p>
          </div>

          {skusWithExcess.length === 0 ? (
            <p className="text-xs text-green-800 bg-white/60 rounded-lg p-3">✅ Sin SKUs con DOH &gt; 90d al momento. Portafolio saludable.</p>
          ) : (
            <>
              {/* Parrilla mensual simplificada */}
              <div>
                <h4 className="text-xs font-semibold text-green-900 mb-2">🗓 Parrilla mensual (plan activaciones)</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs bg-white rounded-lg overflow-hidden">
                    <thead>
                      <tr className="bg-gray-50 text-gray-400 uppercase tracking-widest text-[10px]">
                        <th className="text-left px-3 py-2">Producto</th>
                        <th className="text-center px-2 py-2">DOH PDV</th>
                        <th className="text-center px-2 py-2">Intensidad</th>
                        {['Jun','Jul','Ago','Sep','Oct'].map(m => <th key={m} className="text-center px-2 py-2">{m}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {skusWithExcess.slice(0, 15).map((r: any) => {
                        const meca = getMeca(r.doh_pdv ?? 0)
                        const months = ['Jun','Jul','Ago','Sep','Oct']
                        const activeMths = (r.doh_pdv ?? 0) > 250 ? [0,1,2,3] :
                          (r.doh_pdv ?? 0) > 180 ? [0,1,2] :
                          (r.doh_pdv ?? 0) > 150 ? [1,2] :
                          (r.doh_pdv ?? 0) > 120 ? [1] : [2]
                        return (
                          <tr key={r.sku} className="hover:bg-gray-50/60">
                            <td className="px-3 py-2 font-medium text-gray-700">{r.producto}</td>
                            <td className="px-2 py-2 text-center"><DohChip d={r.doh_pdv}/></td>
                            <td className="px-2 py-2 text-center">
                              {meca ? <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold ${meca.badge}`}>{meca.label}</span> : '—'}
                            </td>
                            {months.map((_, mi) => (
                              <td key={mi} className="px-2 py-2 text-center">
                                {activeMths.includes(mi) ? (
                                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500"/>
                                ) : (
                                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-100"/>
                                )}
                              </td>
                            ))}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Detalle mecánicas */}
              <div className="bg-white/70 rounded-lg p-3 text-xs text-green-900">
                <p className="font-semibold mb-1.5">Escalado de mecánicas según DOH al PDV:</p>
                <ul className="space-y-1 text-[11px]">
                  {MECA_DOH.map((m, i) => (
                    <li key={i}>▸ DOH {m.min === 250 ? '≥250d' : `${m.min}–${m.max}d`} → <span className={`inline-flex px-1.5 py-0.5 rounded font-bold ${m.badge}`}>{m.label}</span> {m.mec}</li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>

        {/* ── Sección 2: Tabla detallada de SKUs con excedente ── */}
        {offRows.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50">
              <h3 className="text-sm font-semibold text-gray-800">📦 Candidatos a Liquidación Preventiva</h3>
              <p className="text-xs text-gray-400">SKUs con excedente sobre meta de cobertura</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="bg-gray-50 text-gray-400 uppercase tracking-widest text-[10px]">
                  <th className="text-left px-4 py-2.5">Producto</th>
                  <th className="text-center px-3 py-2.5">Pareto</th>
                  <th className="text-right px-3 py-2.5">DOH Total</th>
                  <th className="text-right px-3 py-2.5">Excedente (u)</th>
                  <th className="text-center px-3 py-2.5">Urgencia</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {offRows.map((r: any) => (
                    <tr key={r.sku} className="hover:bg-gray-50/60">
                      <td className="px-4 py-2.5 font-medium text-gray-700">
                        <p>{r.producto}</p>
                        <p className="text-[9px] text-gray-400 font-mono">{r.sku}</p>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold ${r.pareto === 'A' ? 'bg-amber-100 text-amber-700' : r.pareto === 'B' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>{r.pareto}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right"><DohChip d={r.doh_total}/></td>
                      <td className="px-3 py-2.5 text-right font-mono text-amber-700 font-semibold">{Math.round(r.excedente_uni ?? 0).toLocaleString('en-US')}</td>
                      <td className="px-3 py-2.5 text-center"><UrgChip u={r.urgencia}/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    )
  }

  function Innovaciones() {
    const L    = isLoading('innovaciones')
    const sd   = selectosData
    const innos: any[] = sd?.innovations ?? insights?.innovaciones ?? []

    if (L) return (
      <div className="space-y-3">
        {Array(3).fill(0).map((_, i) => <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse h-28"/>)}
      </div>
    )

    const divFilter = div === 'QUESO' ? (r: any) => (r.division === 'Quesos' || r.division === 'Queso')
                    : div === 'LECHE' ? (r: any) => (r.division === 'Leches' || r.division === 'Leche')
                    : () => true
    const filtered  = innos.filter(divFilter)

    if (!filtered.length) return (
      <div className="space-y-3">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
          <p className="text-3xl mb-2">🎉</p>
          <p className="text-sm font-semibold text-gray-700">Sin innovaciones en esta división</p>
          <p className="text-xs text-gray-400 mt-1">No hay SKUs con menos de 4 meses de venta</p>
        </div>
      </div>
    )

    const totalInv = filtered.reduce((s: number, r: any) => s + (r.inv_val ?? 0), 0)
    const totalVPD = filtered.reduce((s: number, r: any) => s + (r.vpd_uni_15d ?? 0), 0)
    const avgCob   = filtered.length ? filtered.reduce((s: number, r: any) => s + (r.cobertura_pct ?? 0), 0) / filtered.length : 0
    const divLabel = div === 'QUESO' ? '🧀 Queso' : div === 'LECHE' ? '🥛 Leche' : 'Queso + Leche'

    return (
      <div className="space-y-4">

        {/* ── KPIs ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: `Innovaciones activas · ${divLabel}`, value: filtered.length, sub: 'SKUs con <4 meses de venta', tc: 'text-purple-700', bg: 'bg-purple-50 border-purple-100' },
              { label: 'Inventario total',                    value: fmtK(totalInv),  sub: 'capital en lanzamientos',   tc: 'text-blue-700',   bg: 'bg-blue-50 border-blue-100' },
              { label: 'VPD 15d total',                       value: totalVPD.toFixed(1) + ' u/d', sub: 'velocidad real de venta', tc: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-100' },
              { label: 'Cobertura red promedio',              value: avgCob.toFixed(0) + '%', sub: 'tiendas con presencia', tc: 'text-gray-800', bg: 'bg-white border-gray-100' },
            ].map(c => (
              <div key={c.label} className={`rounded-xl border shadow-sm p-4 ${c.bg}`}>
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2 leading-tight">{c.label}</p>
                <p className={`text-xl font-bold mb-0.5 ${c.tc}`}>{c.value}</p>
                <p className="text-xs text-gray-400">{c.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Per-SKU cards ── */}
        {filtered.map((r: any) => {
          const firstSale = r.first_sale ?? r.primera_venta
          const fmtDate   = firstSale
            ? new Date(firstSale).toLocaleDateString('es-SV', { day: '2-digit', month: 'short', year: 'numeric' })
            : null
          const daysAge   = r.days_since_launch ?? (firstSale ? Math.floor((Date.now() - new Date(firstSale).getTime()) / 86400000) : null)
          const monthAge  = daysAge !== null ? Math.floor(daysAge / 30) : null
          const cobertura = r.cobertura_pct ?? 0
          const vpd15     = r.vpd_uni_15d ?? 0
          const invVal    = r.inv_val ?? 0
          const doh15     = r.doh_15d ?? 0
          const storesWith = r.stores_with_either ?? 0
          const totalSt   = r.total_stores ?? 123
          const monthly   = r.monthly_trend ?? []

          // Trend chart data
          const trendData = monthly.map((t: any) => ({ name: sdMonthLabel(t.month ?? ''), uni: t.uni ?? 0 }))

          return (
            <div key={r.sku} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 border-l-4 border-l-purple-500">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <p className="text-sm font-bold text-gray-800">{r.producto}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded mr-1.5">{r.sku}</span>
                    {fmtDate && <>Primera venta: <strong>{fmtDate}</strong>{daysAge !== null ? ` (${daysAge}d)` : ''}</>}
                    {r.launch_month && <> · Lanzó en <strong>{r.launch_month}</strong></>}
                  </p>
                </div>
                <span className="inline-flex px-2 py-1 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 flex-shrink-0">🚀 INNOVACIÓN</span>
              </div>

              {/* KPI strips */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
                <div className="rounded-lg p-2.5 bg-purple-50 border border-purple-100">
                  <p className="text-[9px] font-semibold text-purple-600 uppercase tracking-wide mb-0.5">Cobertura Red</p>
                  <p className="text-base font-bold text-purple-700">{cobertura.toFixed(1)}%</p>
                  <p className="text-[10px] text-purple-500">{storesWith}/{totalSt} tiendas</p>
                </div>
                <div className="rounded-lg p-2.5 bg-emerald-50 border border-emerald-100">
                  <p className="text-[9px] font-semibold text-emerald-600 uppercase tracking-wide mb-0.5">VPD últimos 15d</p>
                  <p className="text-base font-bold text-emerald-700">{vpd15.toFixed(1)} u/d</p>
                  <p className="text-[10px] text-emerald-500">velocidad real venta</p>
                </div>
                <div className="rounded-lg p-2.5 bg-blue-50 border border-blue-100">
                  <p className="text-[9px] font-semibold text-blue-600 uppercase tracking-wide mb-0.5">DOH 15d</p>
                  <p className="text-base font-bold text-blue-700">{doh15.toFixed(0)} días</p>
                  <p className="text-[10px] text-blue-500">cobertura actual</p>
                </div>
                <div className="rounded-lg p-2.5 bg-amber-50 border border-amber-100">
                  <p className="text-[9px] font-semibold text-amber-600 uppercase tracking-wide mb-0.5">Inventario</p>
                  <p className="text-base font-bold text-amber-700">{fmtK(invVal)}</p>
                  <p className="text-[10px] text-amber-500">{(r.inv_uni ?? 0).toLocaleString('en-US')} u</p>
                </div>
              </div>

              {/* Trend chart */}
              {trendData.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-400 mb-1.5 font-semibold">Evolución de ventas (unidades)</p>
                  <ResponsiveContainer width="100%" height={80}>
                    <BarChart data={trendData} margin={{top:2,right:4,left:0,bottom:2}}>
                      <XAxis dataKey="name" tick={{fontSize:9}} axisLine={false} tickLine={false}/>
                      <YAxis hide/>
                      <Tooltip formatter={(v: number) => [v.toLocaleString('en-US') + ' u','Unidades']}/>
                      <Bar dataKey="uni" fill="#7c3aed" radius={[3,3,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Store count footer */}
              <div className="mt-3 pt-3 border-t border-gray-50 flex items-center gap-4 text-[10px] text-gray-500">
                {monthAge !== null && (
                  <span className={`inline-flex px-2 py-0.5 rounded font-semibold ${monthAge <= 2 ? 'bg-blue-50 text-blue-600' : monthAge <= 4 ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                    {monthAge}m de vida
                  </span>
                )}
                {r.stores_stock_no_sale > 0 && <span className="text-amber-600">⚠️ {r.stores_stock_no_sale} tiendas stock sin venta</span>}
                {r.stores_sale_no_stock > 0 && <span className="text-red-600">🔴 {r.stores_sale_no_stock} tiendas con quiebre</span>}
                <span className="ml-auto">{storesWith} tiendas con presencia</span>
              </div>
            </div>
          )
        })}

        {/* ── Recomendaciones ── */}
        <div className="rounded-xl p-5" style={{background:'linear-gradient(135deg,#dbeafe 0%,#bfdbfe 100%)',borderLeft:'4px solid #1e40af'}}>
          <h3 className="text-sm font-bold text-blue-900 mb-2">🎯 Recomendaciones para Gestión de Innovaciones</h3>
          <ul className="space-y-2 text-xs text-blue-800">
            <li>▸ Monitorear sell-through los primeros <strong>90 días</strong> para validar adopción del SKU.</li>
            <li>▸ DOH calculado con <strong>VPD 15 días</strong> (no baseline) porque la velocidad evoluciona rápido en lanzamientos.</li>
            <li>▸ Meta de éxito = <strong>&gt;60% cobertura de tiendas</strong> en primeros 2 meses.</li>
            <li>▸ Si &lt;30% cobertura a los 3 meses: revisar distribución y negociar espacio adicional en góndola.</li>
            <li>▸ Si DOH &gt; 30d: frenar reabasto hasta normalizar rotación.</li>
          </ul>
        </div>

      </div>
    )
  }

  function Pareto() {
    const L  = isLoading('pareto')
    const sd = selectosData
    if (L) return <div className="space-y-4">{Array(2).fill(0).map((_,i)=><div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse h-28"/>)}</div>

    // Prefer rich sku_rows from selectos_data.json, fallback to pareto API rows
    const useSkuRows = !!(sd?.sku_rows?.length)
    const rawRows: any[] = useSkuRows
      ? [...(sd.sku_rows ?? [])].filter((r: any) => div === 'TOTAL' || (div === 'QUESO' ? r.division === 'Quesos' || r.division === 'Queso' : r.division === 'Leches' || r.division === 'Leche'))
      : (pareto?.rows ?? [])

    if (!rawRows.length) return <Empty msg="Sin datos de Pareto" />

    const rows = useSkuRows
      ? [...rawRows].sort((a, b) => (b.val_active ?? 0) - (a.val_active ?? 0))
      : rawRows

    // Recalculate cumulative % on filtered rows
    const totalVal = rows.reduce((s: number, r: any) => s + (useSkuRows ? (r.val_active ?? 0) : parseFloat(r.valor ?? '0')), 0)
    let cumul = 0
    const rowsWithPct = rows.map((r: any, i: number) => {
      const val = useSkuRows ? (r.val_active ?? 0) : parseFloat(r.valor ?? '0')
      cumul += val
      const pct_acum = totalVal > 0 ? cumul / totalVal * 100 : 0
      return {
        ...r,
        _val:       val,
        _pct_ind:   totalVal > 0 ? val / totalVal * 100 : 0,
        _pct_acum:  pct_acum,
        _pareto:    pct_acum <= 80 ? 'A' : pct_acum <= 95 ? 'B' : 'C',
        _rank:      i + 1,
      }
    })

    const claseA = rowsWithPct.filter((r: any) => r._pareto === 'A')
    const claseB = rowsWithPct.filter((r: any) => r._pareto === 'B')
    const claseC = rowsWithPct.filter((r: any) => r._pareto === 'C')

    const chartData = rowsWithPct.slice(0, 30).map((r: any) => {
      const name = (useSkuRows ? r.producto : r.descripcion) ?? r.sku ?? ''
      return {
        name:     name.length > 18 ? name.slice(0, 18) + '…' : name,
        valor:    Math.round(r._val),
        pct_acum: parseFloat(r._pct_acum.toFixed(1)),
      }
    })

    return (
      <div className="space-y-5">

        {/* ── KPI cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'SKUs Totales',   value: rowsWithPct.length, sub: 'portafolio activo 2026',                                      tc: 'text-gray-800',   bg: 'bg-white border-gray-100' },
            { label: 'Clase A (80%)',  value: claseA.length,       sub: `${(claseA.length / rowsWithPct.length * 100).toFixed(0)}% portafolio → 80% valor`, tc: 'text-amber-700',  bg: 'bg-amber-50 border-amber-100' },
            { label: 'Clase B (95%)',  value: claseB.length,       sub: '80–95% del valor acum.',                                    tc: 'text-blue-700',   bg: 'bg-blue-50 border-blue-100' },
            { label: 'Clase C (100%)', value: claseC.length,       sub: 'cola · bajo impacto',                                       tc: 'text-gray-500',   bg: 'bg-gray-50 border-gray-100' },
          ].map(c => (
            <div key={c.label} className={`rounded-xl border shadow-sm p-4 ${c.bg}`}>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">{c.label}</p>
              <p className={`text-2xl font-bold mb-0.5 ${c.tc}`}>{c.value}</p>
              <p className="text-xs text-gray-400">{c.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Pareto chart ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-gray-800">📊 Pareto 80/20 — SKUs</h3>
            <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">Viendo: {div === 'TOTAL' ? 'TOTAL' : div === 'QUESO' ? '🧀 Queso' : '🥛 Leche'}</span>
          </div>
          <p className="text-xs text-gray-400 mb-4">Un solo gráfico con todos los SKUs del portafolio activo. Clase A = 80% acumulado, B = 80–95%, C = &gt;95%.</p>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 44, left: 0, bottom: 72 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 8.5 }} angle={-45} textAnchor="end" interval={0} />
              <YAxis yAxisId="left" tickFormatter={v => fmt$(v)} tick={{ fontSize: 10 }} width={52} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={v => v + '%'} tick={{ fontSize: 10 }} width={36} />
              <Tooltip formatter={(v: number, name: string) =>
                name === 'pct_acum' ? [v.toFixed(1) + '%', '% Acumulado'] : [fmt$(v), 'Venta']} />
              <Bar yAxisId="left" dataKey="valor" name="valor" radius={[2, 2, 0, 0]}>
                {chartData.map((_: any, i: number) => (
                  <Cell key={i} fill={i < claseA.length ? '#c8873a' : i < claseA.length + claseB.length ? '#3b82f6' : '#d1d5db'} />
                ))}
              </Bar>
              <Line yAxisId="right" type="monotone" dataKey="pct_acum" name="pct_acum" stroke="#1b3b5f" strokeWidth={2} dot={false} />
              <ReferenceLine yAxisId="right" y={80} stroke="#dc2626" strokeDasharray="4 4" label={{ value: '80%', position: 'insideRight', fontSize: 9, fill: '#dc2626' }} />
              <ReferenceLine yAxisId="right" y={95} stroke="#3b82f6" strokeDasharray="4 4" label={{ value: '95%', position: 'insideRight', fontSize: 9, fill: '#3b82f6' }} />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2 text-[10px] text-gray-400 justify-center flex-wrap">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#c8873a] inline-block"/>Clase A (≤80%)</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-400 inline-block"/>Clase B (80–95%)</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-gray-300 inline-block"/>Clase C (&gt;95%)</span>
          </div>
        </div>

        {/* ── Pareto A — Salud ── (matching HTML health table) */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">SKUs Pareto A — Salud</h3>
            <p className="text-xs text-gray-400">{claseA.length} SKUs concentran el 80% del valor de venta</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="bg-gray-50 text-gray-400 uppercase tracking-widest text-[10px]">
                <th className="text-left px-4 py-2.5">Producto</th>
                <th className="text-right px-3 py-2.5">% Ind</th>
                <th className="text-right px-3 py-2.5">Acum %</th>
                <th className="text-right px-3 py-2.5">VPD u/d</th>
                <th className="text-right px-3 py-2.5">Inv u</th>
                <th className="text-right px-3 py-2.5">DOH</th>
                <th className="text-center px-3 py-2.5">Salud</th>
                {useSkuRows && <th className="text-center px-3 py-2.5">Tendencia</th>}
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {claseA.map((r: any) => (
                  <tr key={r.sku} className="hover:bg-gray-50/60">
                    <td className="px-4 py-2.5 font-medium text-gray-700">{useSkuRows ? r.producto : r.descripcion}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-gray-500">{r._pct_ind.toFixed(1)}%</td>
                    <td className="px-3 py-2.5 text-right font-mono text-amber-700 font-semibold">{r._pct_acum.toFixed(1)}%</td>
                    <td className="px-3 py-2.5 text-right font-mono">{(useSkuRows ? r.vpd_uni : r.vpd_dia)?.toFixed?.(2) ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{Math.round(useSkuRows ? (r.total_inv_uni ?? r.pdv_uni ?? 0) : (r.inv_uni ?? 0)).toLocaleString('en-US')}</td>
                    <td className="px-3 py-2.5 text-right"><DohChip d={useSkuRows ? r.doh_pdv : r.doh}/></td>
                    <td className="px-3 py-2.5 text-center"><HealthChip h={r.health ?? 'Sin datos'}/></td>
                    {useSkuRows && <td className="px-3 py-2.5 text-center"><TendenciaChip t={r.tendencia ?? '—'}/></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Full table ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">Concentración de Venta — Portafolio Completo</h3>
            <p className="text-xs text-gray-400">SKUs ordenados de mayor a menor · 2026</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="bg-gray-50 text-gray-400 uppercase tracking-widest text-[10px]">
                <th className="text-right px-4 py-2.5">#</th>
                <th className="text-left px-4 py-2.5">Descripción</th>
                {useSkuRows && <th className="text-left px-3 py-2.5">División</th>}
                <th className="text-right px-4 py-2.5">Venta (USD)</th>
                <th className="text-right px-4 py-2.5">% Acum.</th>
                <th className="text-center px-4 py-2.5">Clase</th>
                {useSkuRows && <th className="text-center px-3 py-2.5">Salud</th>}
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {rowsWithPct.map((r: any) => (
                  <tr key={r.sku} className={`hover:bg-gray-50/60 ${r._pareto === 'C' ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-2 text-right text-gray-400 font-mono">{r._rank}</td>
                    <td className="px-4 py-2 font-medium text-gray-700">
                      <p>{useSkuRows ? r.producto : r.descripcion}</p>
                      <p className="text-[9px] text-gray-400 font-mono">{r.sku}</p>
                    </td>
                    {useSkuRows && <td className="px-3 py-2 text-gray-400 text-[10px]">{r.division}</td>}
                    <td className="px-4 py-2 text-right font-mono text-gray-700">{fmt$(r._val)}</td>
                    <td className="px-4 py-2 text-right font-mono">
                      <span className={r._pareto === 'A' ? 'text-amber-700 font-semibold' : r._pareto === 'B' ? 'text-blue-600 font-semibold' : 'text-gray-400'}>
                        {r._pct_acum.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold ${r._pareto === 'A' ? 'bg-amber-100 text-amber-700' : r._pareto === 'B' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>{r._pareto}</span>
                    </td>
                    {useSkuRows && <td className="px-3 py-2 text-center"><HealthChip h={r.health ?? 'Sin datos'}/></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    )
  }

  function PerdidaVenta() {
    const L   = isLoading('perdida')
    const ins = insights
    const sd  = selectosData

    if (L) return (
      <div className="space-y-4">
        {Array(3).fill(0).map((_, i) => <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse h-32"/>)}
      </div>
    )

    // Prefer rich oos_analysis from selectos_data.json
    const oos          = sd?.oos_analysis ?? null
    const sdMonths     = sd?.months       ?? []
    const sdMonthlyVal = sd?.monthly_val  ?? []
    const baselineVal  = oos?.baseline_avg_val ?? ins?.baseline_val ?? 0
    const baselineUni  = oos?.baseline_avg_uni ?? ins?.baseline_uni ?? 0
    const totalLostVal = oos?.total_lost_val ?? ins?.oos_perdida_val ?? 0
    const totalLostUni = oos?.total_lost_uni ?? ins?.oos_perdida_uni ?? 0
    const oosMonthsMap = oos?.months ?? {}
    const oosMonthKeys = Object.keys(oosMonthsMap)

    if (!baselineVal && !ins?.monthly?.length) return <Empty msg="Sin datos de análisis de desabasto" />

    // Build chart from selectos_data months (Oct 25 – most recent)
    const CHART_MONTHS = ['2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04','2026-05']
    const chartData = CHART_MONTHS.map(m => {
      const sdIdx  = sdMonths.indexOf(m)
      const actual = sdIdx >= 0 ? sdMonthlyVal[sdIdx] : (ins?.monthly?.find((x: any) => `2026-${String(x.mes).padStart(2,'0')}` === m || `2025-${String(x.mes).padStart(2,'0')}` === m)?.ventas_val ?? 0)
      const isOos  = m in oosMonthsMap || (ins?.monthly?.find((x: any) => (`2026-${String(x.mes).padStart(2,'0')}` === m) && x.es_oos))
      const lost   = isOos ? Math.max(0, baselineVal - actual) : 0
      return {
        name:     sdMonthLabel(m),
        actual:   Math.round(actual),
        baseline: Math.round(baselineVal),
        perdida:  Math.round(lost),
        isOos,
        isPartial: m === '2026-05',
      }
    })

    const oosMonthLabels = oosMonthKeys.map(m => sdMonthLabel(m)).join(', ') ||
      (ins?.oos_count ? ins.oos_meses : '') || ''

    const lastPoint   = chartData.filter(d => d.actual > 0).pop()
    const pctRecover  = baselineVal > 0 && lastPoint ? lastPoint.actual / baselineVal * 100 : null

    return (
      <div className="space-y-5">

        {/* ── Card 1: Explicación ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-2">
            💸 Análisis de Pérdida de Venta por Desabasto
            {oosMonthKeys.length > 0 && ` (${oosMonthLabels})`}
          </h3>
          <p className="text-sm text-gray-600">
            {oosMonthKeys.length > 0
              ? <>El valle en {oosMonthLabels} NO fue declive de demanda — fue <strong>desabastecimiento</strong>. Esta estimación cuantifica las ventas perdidas usando como baseline el promedio de los meses con stock saludable.</>
              : <>Sin meses de desabasto detectados en 2026. El inventario se mantuvo saludable. La baseline representa el promedio de meses representativos: <strong>{sd?.metadata?.baseline_months?.join(', ') ?? 'Nov–Ene'}</strong>.</>
            }
          </p>

          {/* KPI strips */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
            {[
              {
                label: 'Ventas Perdidas Totales',
                value: fmtK(totalLostVal),
                sub:   `${totalLostUni.toLocaleString('en-US')} unidades no vendidas`,
                tc:    totalLostVal > 0 ? 'text-red-700'     : 'text-emerald-700',
                bg:    totalLostVal > 0 ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100',
              },
              {
                label: 'Baseline Mensual',
                value: fmtFull(baselineVal),
                sub:   'avg meses con stock',
                tc:    'text-gray-800', bg: 'bg-white border-gray-100',
              },
              {
                label: 'Meses con OOS',
                value: oosMonthKeys.length || ins?.oos_count || 0,
                sub:   oosMonthLabels || 'sin quiebres detectados',
                tc:    oosMonthKeys.length > 0 ? 'text-orange-700' : 'text-emerald-700',
                bg:    oosMonthKeys.length > 0 ? 'bg-orange-50 border-orange-100' : 'bg-emerald-50 border-emerald-100',
              },
              {
                label: 'Recuperación',
                value: pctRecover !== null ? `${pctRecover.toFixed(0)}%` : '—',
                sub:   `${lastPoint?.name ?? ''} 2026 vs baseline`,
                tc:    (pctRecover ?? 0) >= 80 ? 'text-emerald-700' : 'text-amber-700',
                bg:    (pctRecover ?? 0) >= 80 ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100',
              },
            ].map(c => (
              <div key={c.label} className={`rounded-xl border shadow-sm p-4 ${c.bg}`}>
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">{c.label}</p>
                <p className={`text-2xl font-bold mb-0.5 ${c.tc}`}>{c.value}</p>
                <p className="text-xs text-gray-400">{c.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Card 2: Chart ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-1">Comparativa: Baseline vs Real vs Pérdida</h3>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis dataKey="name" tick={{ fontSize: 11 }}/>
              <YAxis tickFormatter={v => fmt$(v)} tick={{ fontSize: 10 }} width={56}/>
              <Tooltip formatter={(v: number, name: string) => [
                fmtFull(v),
                name === 'baseline' ? 'Baseline Esperado' : name === 'actual' ? 'Ventas Reales' : 'Pérdida Estimada',
              ]}/>
              <Bar dataKey="perdida" name="perdida" fill="rgba(220,38,38,0.35)" stackId="a" />
              <Bar dataKey="actual" name="actual" stackId="a">
                {chartData.map((d: any, i: number) => (
                  <Cell key={i} fill={d.isOos ? '#dc2626' : d.isPartial ? 'rgba(15,76,129,0.25)' : '#0f4c81'} />
                ))}
              </Bar>
              <Line type="monotone" dataKey="baseline" name="baseline" stroke="#16a34a" strokeWidth={2} strokeDasharray="6 4" dot={false}/>
            </ComposedChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-400 mt-3 leading-relaxed">
            <strong>Baseline = promedio de meses con stock</strong>: {fmtK(baselineVal)} val/mes y {baselineUni.toLocaleString('en-US')} u/mes.{' '}
            {totalLostVal > 0
              ? `La diferencia entre baseline y real durante ${oosMonthLabels} representa la oportunidad perdida.`
              : 'Sin pérdida estimada — todos los meses mantuvieron ventas sobre el 30% del baseline.'
            }
          </p>
          {oosMonthKeys.length > 0 && (
            <div className="mt-3 p-3 bg-orange-50 border border-orange-100 rounded-lg">
              <p className="text-xs text-orange-700 font-semibold">⚠️ Los meses {oosMonthLabels} fueron <strong>desabastecimiento</strong>, no caída de demanda.</p>
              <p className="text-xs text-orange-600 mt-0.5">El siguiente período con inventario confirmó recuperación de la demanda. Prevenir con cobertura ≥21 días es la prioridad operativa #1.</p>
            </div>
          )}
        </div>

        {/* ── Card 3: Excedentes de inventario ── */}
        {ins?.excedentes?.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
              <div><h3 className="text-sm font-semibold text-gray-700">📦 Excedentes (DOH &gt; 60d)</h3><p className="text-xs text-gray-400">SKUs con cobertura alta — candidatos a oferta/activación</p></div>
              <span className="text-xs bg-blue-50 text-blue-600 px-2.5 py-0.5 rounded-full border border-blue-100 font-semibold">{ins.excedentes.length} SKUs</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="bg-gray-50 text-gray-400 uppercase tracking-widest text-[10px]">
                  <th className="text-left px-4 py-2.5">Descripción</th>
                  <th className="text-right px-4 py-2.5">Inv (u)</th>
                  <th className="text-right px-4 py-2.5">VPD u/d</th>
                  <th className="text-right px-4 py-2.5">DOH</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {ins.excedentes.map((r: any) => (
                    <tr key={r.codigo_barra} className="hover:bg-blue-50/20">
                      <td className="px-4 py-2.5 font-medium text-gray-700"><span className="text-gray-400 mr-1.5 font-normal text-[10px]">{r.codigo_barra}</span>{r.descripcion}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{Math.round(r.inv_uni).toLocaleString('en-US')}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-500">{r.vpd_dia?.toFixed(1) ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right"><DohChip d={r.doh}/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Also show sku_rows sobrestock from selectos_data if available */}
        {sd?.sku_rows?.filter((r: any) => r.health === 'SOBRESTOCK' || r.health === 'COBERTURA ALTA').length > 0 && !ins?.excedentes?.length && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50">
              <h3 className="text-sm font-semibold text-gray-700">📦 SKUs con Cobertura Elevada</h3>
              <p className="text-xs text-gray-400">SOBRESTOCK o COBERTURA ALTA — candidatos a activación comercial</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="bg-gray-50 text-gray-400 uppercase tracking-widest text-[10px]">
                  <th className="text-left px-4 py-2.5">Producto</th>
                  <th className="text-right px-3 py-2.5">Inv PDV (u)</th>
                  <th className="text-right px-3 py-2.5">VPD u/d</th>
                  <th className="text-right px-3 py-2.5">DOH PDV</th>
                  <th className="text-center px-3 py-2.5">Salud</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {sd.sku_rows.filter((r: any) => r.health === 'SOBRESTOCK' || r.health === 'COBERTURA ALTA')
                    .sort((a: any, b: any) => (b.doh_pdv ?? 0) - (a.doh_pdv ?? 0))
                    .map((r: any) => (
                      <tr key={r.sku} className="hover:bg-blue-50/20">
                        <td className="px-4 py-2.5 font-medium text-gray-700">{r.producto}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{Math.round(r.pdv_uni ?? 0).toLocaleString('en-US')}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-gray-500">{(r.vpd_uni ?? 0).toFixed(1)}</td>
                        <td className="px-3 py-2.5 text-right"><DohChip d={r.doh_pdv}/></td>
                        <td className="px-3 py-2.5 text-center"><HealthChip h={r.health}/></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    )
  }

  function ListaPrecios() {
    const L    = isLoading('precios')
    const sd   = selectosData
    const divF = priceDivF,  setDivF = setPriceDivF
    const catF = priceCatF,  setCatF = setPriceCatF

    if (L) return <div className="space-y-4">{Array(2).fill(0).map((_,i) => <div key={i} className="rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse h-32 bg-white"/>)}</div>
    if (!sd) return <Empty msg="Cargando datos del dashboard…" />

    const allList: any[] = sd.price_list ?? []
    const quesoList = allList.filter((p: any) => !String(p.sku ?? '').startsWith('7452'))
    const lecheList = allList.filter((p: any) =>  String(p.sku ?? '').startsWith('7452'))

    const visible  = divF === 'leche' ? lecheList : divF === 'queso' ? quesoList : allList
    const filtered = catF ? visible.filter((p: any) => p.categoria === catF) : visible
    const cats     = [...new Set(allList.map((p: any) => p.categoria).filter(Boolean))].sort()

    const avgMargin   = filtered.length ? filtered.reduce((s: number, p: any) => s + (p.margen_bruto_pct ?? 0), 0) / filtered.length : 0
    const orderEx     = sd.order_value_exworks  ?? 0
    const orderPvp    = sd.order_value_pvp      ?? 0
    const divLabel    = divF === 'leche' ? '🥛 Leche UHT' : divF === 'queso' ? '🧀 Queso' : 'Queso + Leche'
    const subLabel    = divF === 'leche' ? '5 UHT 1L' : divF === 'queso' ? `${quesoList.length} quesos` : `${allList.length} activos`

    const downloadCSV = () => {
      const cols = 'SKU,Producto,Categoría,U/Caja,Costo Ex $/Caja,Costo $/U,PVP s/IVA,PVP c/IVA,Margen %\n'
      const rows = filtered.map((p: any) =>
        `${p.sku},"${p.producto_local ?? p.name}",${p.categoria},${p.units_per_case},${p.exworks_case},${p.cost_unit},${p.pvp_sin_iva},${p.pvp_unit},${p.margen_bruto_pct?.toFixed(1)}`
      ).join('\n')
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([cols + rows], { type: 'text/csv' }))
      a.download = 'lista_precios_selectos.csv'; a.click()
    }

    const showQueso = divF !== 'leche'
    const showLeche = divF !== 'queso'

    return (
      <div className="space-y-4">

        {/* ── Queso card (yellow) ── */}
        {showQueso && (
          <div className="rounded-xl overflow-hidden shadow-sm border border-amber-200">
            <div className="px-5 py-4" style={{ background: 'linear-gradient(135deg,#fef9c3 0%,#fef3c7 100%)', borderLeft: '4px solid #ca8a04' }}>
              <h3 className="text-sm font-bold text-amber-900">💵 Lista de Precios · Costo Exworks vs PVP</h3>
              <p className="text-xs text-amber-800 mt-0.5">
                Precios BL Foods → Super Selectos (Exworks por caja) y PVP al consumidor.{' '}
                <strong>Margen bruto Borden</strong> = (PVP sin IVA − Costo unitario) / PVP sin IVA. IVA El Salvador = 13%.
              </p>

              {/* KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
                {[
                  { label: `SKUs con precios · ${divLabel}`, value: filtered.length, sub: subLabel, tc: 'text-amber-800' },
                  { label: 'Margen Bruto Borden prom.', value: `${avgMargin.toFixed(1)}%`, sub: '(PVP s/IVA - costo) / PVP s/IVA', tc: 'text-amber-700' },
                  { label: 'Pedido 21-may Exworks', value: fmt$(orderEx), sub: 'BL Foods → Super Selectos', tc: 'text-amber-800' },
                  { label: 'Pedido 21-may PVP', value: fmt$(orderPvp), sub: 'Super Selectos → consumidor', tc: 'text-amber-800' },
                ].map(k => (
                  <div key={k.label} className="bg-white/70 rounded-lg border border-amber-200 px-4 py-3">
                    <p className="text-[9px] font-bold text-amber-600 uppercase tracking-widest mb-1">{k.label}</p>
                    <p className={`text-xl font-bold ${k.tc}`}>{k.value}</p>
                    <p className="text-[10px] text-amber-600">{k.sub}</p>
                  </div>
                ))}
              </div>

              {/* Filters */}
              <div className="flex items-center gap-3 mt-4 flex-wrap text-xs">
                <span className="text-amber-700 font-medium">División:</span>
                <select value={divF} onChange={e => setDivF(e.target.value as any)}
                  className="border border-amber-300 rounded-lg px-2.5 py-1.5 bg-white text-amber-900 text-xs">
                  <option value="total">Todas</option>
                  <option value="queso">Queso</option>
                  <option value="leche">Leche</option>
                </select>
                <span className="text-amber-700 font-medium">Categoría:</span>
                <select value={catF} onChange={e => setCatF(e.target.value)}
                  className="border border-amber-300 rounded-lg px-2.5 py-1.5 bg-white text-amber-900 text-xs">
                  <option value="">Todas</option>
                  {cats.map((c: string) => <option key={c}>{c}</option>)}
                </select>
                <button onClick={downloadCSV}
                  className="px-3 py-1.5 bg-[#1b3b5f] text-white rounded-lg font-medium text-xs hover:bg-[#0f2a47] transition-colors">
                  ⬇ Descargar lista CSV
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto bg-white">
              <table className="w-full text-xs">
                <thead><tr className="bg-amber-50 text-amber-700 uppercase tracking-widest text-[10px]">
                  <th className="text-left px-4 py-2.5">Código</th>
                  <th className="text-left px-4 py-2.5">Producto</th>
                  <th className="text-left px-3 py-2.5">Categoría</th>
                  <th className="text-right px-3 py-2.5">U/Caja</th>
                  <th className="text-right px-3 py-2.5">Costo Ex $/Caja</th>
                  <th className="text-right px-3 py-2.5">Costo $/U</th>
                  <th className="text-right px-3 py-2.5">PVP s/IVA</th>
                  <th className="text-right px-3 py-2.5">PVP c/IVA</th>
                  <th className="text-center px-3 py-2.5">Margen %</th>
                </tr></thead>
                <tbody className="divide-y divide-amber-50">
                  {filtered.length === 0 ? (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-300 text-xs">Sin datos con los filtros seleccionados</td></tr>
                  ) : filtered.map((p: any) => {
                    const mg = p.margen_bruto_pct ?? 0
                    const mgCls = mg >= 20 ? 'bg-emerald-100 text-emerald-700' : mg >= 10 ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-700'
                    return (
                      <tr key={p.sku} className="hover:bg-amber-50/40">
                        <td className="px-4 py-2.5 font-mono text-[10px] text-gray-400">{p.sku}</td>
                        <td className="px-4 py-2.5 font-medium text-gray-700 max-w-[220px]">{p.producto_local ?? p.name}</td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-600">{p.categoria}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-gray-500">{p.units_per_case || '—'}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold text-gray-800">{p.exworks_case ? '$' + p.exworks_case.toFixed(2) : '—'}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-gray-600">{p.cost_unit ? '$' + p.cost_unit.toFixed(2) : '—'}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-gray-600">{p.pvp_sin_iva ? '$' + p.pvp_sin_iva.toFixed(2) : '—'}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold text-gray-800">{p.pvp_unit ? '$' + p.pvp_unit.toFixed(2) : '—'}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold ${mgCls}`}>{mg.toFixed(1)}%</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Leche UHT card (teal) ── */}
        {showLeche && (
          <div className="rounded-xl overflow-hidden shadow-sm" style={{ background: 'linear-gradient(135deg,#f0fdfa 0%,#ccfbf1 100%)', borderLeft: '4px solid #0891b2', border: '1px solid #99f6e4' }}>
            <div className="px-5 py-4">
              <h3 className="text-sm font-bold text-teal-700">🥛 Lista de Precios · División Leche UHT</h3>
              <p className="text-xs text-teal-600 mt-0.5">5 variedades de leche UHT 1 L. Margen Borden 15%. PVP sin IVA $1.55-1.59 según variedad. Mínimo de pedido 65 cs por SKU.</p>
            </div>
            {lecheList.length > 0 ? (
              <div className="overflow-x-auto bg-white/60">
                <table className="w-full text-xs">
                  <thead><tr className="bg-teal-50 text-teal-700 uppercase tracking-widest text-[10px]">
                    <th className="text-left px-4 py-2.5">Código</th>
                    <th className="text-left px-4 py-2.5">Variedad</th>
                    <th className="text-right px-3 py-2.5">U/Caja</th>
                    <th className="text-right px-3 py-2.5">Costo Ex $/Caja</th>
                    <th className="text-right px-3 py-2.5">Costo $/U</th>
                    <th className="text-right px-3 py-2.5">PVP s/IVA</th>
                    <th className="text-right px-3 py-2.5">PVP c/IVA</th>
                    <th className="text-center px-3 py-2.5">Margen %</th>
                  </tr></thead>
                  <tbody className="divide-y divide-teal-50">
                    {lecheList.map((p: any) => {
                      const mg = p.margen_bruto_pct ?? 0
                      const mgCls = mg >= 20 ? 'bg-emerald-100 text-emerald-700' : mg >= 10 ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-700'
                      return (
                        <tr key={p.sku} className="hover:bg-teal-50/40">
                          <td className="px-4 py-2.5 font-mono text-[10px] text-gray-400">{p.sku}</td>
                          <td className="px-4 py-2.5 font-medium text-gray-700">{p.producto_local ?? p.name}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-gray-500">{p.units_per_case || '—'}</td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold text-gray-800">{p.exworks_case ? '$' + p.exworks_case.toFixed(2) : '—'}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-gray-600">{p.cost_unit ? '$' + p.cost_unit.toFixed(2) : '—'}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-gray-600">{p.pvp_sin_iva ? '$' + p.pvp_sin_iva.toFixed(2) : '—'}</td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold text-gray-800">{p.pvp_unit ? '$' + p.pvp_unit.toFixed(2) : '—'}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold ${mgCls}`}>{mg.toFixed(1)}%</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-5 py-6 text-center">
                <p className="text-xs text-teal-500">Sin datos de precios Leche UHT disponibles aún.</p>
                <p className="text-[10px] text-teal-400 mt-1">Los SKUs de leche (código 7452…) no tienen precios registrados en el sistema.</p>
              </div>
            )}
          </div>
        )}

      </div>
    )
  }

  function VistaCliente() {
    const L  = isLoading('cliente')
    const sd = selectosData
    if (L) return <div className="space-y-4">{Array(4).fill(0).map((_,i) => <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse h-28"/>)}</div>
    if (!sd) return <Empty msg="Cargando datos del dashboard…" />

    const dk   = sd.division_kpis ?? {}
    const dkT  = dk.total  ?? {}
    const dkQ  = dk.queso  ?? dkT
    const dkL  = dk.leche  ?? dkT
    const meta = sd.metadata ?? {}
    const oos  = sd.oos_analysis ?? {}
    const ofk  = sd.ofertas_kpis ?? {}

    const showQ = div !== 'LECHE'
    const showL = div !== 'QUESO'

    const skuRows: any[] = sd.sku_rows ?? []
    const quesoSkus = skuRows.filter((r: any) => r.division === 'Quesos' || r.division === 'Queso' || !r.division)
    const lecheSkus = skuRows.filter((r: any) => r.division === 'Leches' || r.division === 'Leche')

    const top4WinQ  = quesoSkus.filter((r: any) => r.pareto === 'A' && (r.tendencia === 'Crecimiento' || r.tendencia === 'Estable')).slice(0, 4)
    const top4RiskQ = quesoSkus.filter((r: any) => r.pareto === 'A' && (r.health === 'CRÍTICO' || r.health === 'ATENCIÓN')).slice(0, 4)

    const gapQ  = (dkQ.sell_in_target_fy ?? 0) - (dkQ.sistema_fy_fob ?? dkQ.sell_in_ytd_2026 ?? 0)
    const gapL  = (dkL.sell_in_target_fy ?? 0) - (dkL.sistema_fy_fob ?? dkL.sell_in_ytd_2026 ?? 0)
    const cumQ  = dkQ.cumplimiento_fy_pct ?? (dkQ.sistema_fy_fob && dkQ.sell_in_target_fy ? dkQ.sistema_fy_fob / dkQ.sell_in_target_fy * 100 : 0)
    const cumL  = dkL.cumplimiento_fy_pct ?? (dkL.sistema_fy_fob && dkL.sell_in_target_fy ? dkL.sistema_fy_fob / dkL.sell_in_target_fy * 100 : 0)
    const quiebres = sd.kpis?.quiebre_tienda ?? 0
    const baselineAvg = oos.baseline_avg_val ?? 0

    const HeroKpi = ({ label, value, sub, color }: { label: string; value: string | number; sub: string; color: string }) => {
      const bg: Record<string, string> = { blue: 'bg-blue-50 border-blue-200', green: 'bg-emerald-50 border-emerald-200', yellow: 'bg-amber-50 border-amber-200', red: 'bg-red-50 border-red-200' }
      const tc: Record<string, string> = { blue: 'text-blue-800', green: 'text-emerald-800', yellow: 'text-amber-800', red: 'text-red-700' }
      return (
        <div className={`rounded-xl border px-4 py-3 ${bg[color] ?? 'bg-gray-50 border-gray-200'}`}>
          <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">{label}</p>
          <p className={`text-xl font-bold ${tc[color] ?? 'text-gray-800'}`}>{value}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>
        </div>
      )
    }

    const TimelineCard = ({ horizon, title, items, accent }: { horizon: string; title: string; items: string[]; accent: string }) => (
      <div className={`rounded-xl border-l-4 border bg-white shadow-sm p-4 ${accent}`}>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">{horizon}</p>
        <h4 className="text-sm font-bold text-gray-800 mb-2">{title}</h4>
        <ul className="space-y-1">
          {items.map((it, i) => <li key={i} className="text-xs text-gray-600 flex gap-1.5"><span className="text-gray-300 mt-0.5">›</span>{it}</li>)}
        </ul>
      </div>
    )

    return (
      <div className="space-y-5 print:space-y-4">

        {/* ── Print bar ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-3 flex items-center justify-between print:hidden">
          <p className="text-xs text-gray-500"><strong>📄 Vista lista para imprimir / exportar a PDF</strong> · Diseñada para compartir con Super Selectos.</p>
          <button onClick={() => window.print()}
            className="px-4 py-2 bg-[#1b3b5f] text-white rounded-lg text-xs font-semibold hover:bg-[#0f2a47] transition-colors">
            🖨️ Imprimir / PDF
          </button>
        </div>

        {/* ── Header ── */}
        <div className="bg-[#1b3b5f] text-white rounded-xl shadow-sm px-6 py-5">
          <h2 className="text-xl font-bold">BL Foods · Reporte Sell-Out &amp; Inventario</h2>
          <p className="text-blue-200 text-sm mt-0.5">
            {showQ && showL ? 'TOTAL (Queso + Leche UHT)' : showQ ? '🧀 Queso' : '🥛 Leche UHT'} — Super Selectos, El Salvador
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-xs text-blue-200">
            <div><span className="font-semibold text-white">Período:</span> Oct 2024 – May 2026</div>
            <div><span className="font-semibold text-white">Inventario al:</span> {meta.inv_date ?? '—'}</div>
            <div><span className="font-semibold text-white">SKUs activos:</span> {skuRows.length} de {meta.n_total_sku ?? skuRows.length}</div>
            <div><span className="font-semibold text-white">Tiendas:</span> {meta.n_stores ?? 123}</div>
          </div>
        </div>

        {/* ── QUESO BLOCK ── */}
        {showQ && (<>
          <div className="rounded-xl px-5 py-3.5 shadow-sm" style={{ background: 'linear-gradient(135deg,#fef9c3 0%,#fef3c7 100%)', borderLeft: '5px solid #ca8a04' }}>
            <h3 className="text-base font-bold text-amber-900">🧀 División Queso · Reporte Detallado</h3>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">📈 Cumplimiento Plan Comercial 2026 · Queso</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <HeroKpi label="Sell-In Real YTD"    value={fmtK(dkQ.sell_in_ytd_2026 ?? 0)}      sub="FY plan vs real"             color="blue"/>
              <HeroKpi label="Target Comercial FY" value={fmtFull(dkQ.sell_in_target_fy ?? 0)}   sub="Plan comercial FY"           color="green"/>
              <HeroKpi label="% Cumplimiento FY"   value={`${cumQ.toFixed(1)}%`}                  sub={`${fmtK(dkQ.sistema_fy_fob ?? dkQ.sell_in_ytd_2026 ?? 0)} sistema`} color="yellow"/>
              <HeroKpi label="Gap a Target"        value={gapQ >= 0 ? fmtK(gapQ) : '✓ Cumple'}   sub={gapQ >= 0 ? 'faltante FY' : 'target alcanzado'} color={gapQ >= 0 ? 'red' : 'green'}/>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">💰 Sell-In vs Sell-Out 2026 · Queso</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <HeroKpi label="Sell-In FY 2026"  value={fmtK(dkQ.sell_in_fy_2026 ?? 0)}   sub={`vs ${fmtK(dkQ.sell_in_fy_2025 ?? 0)} en 2025 → ${(dkQ.sell_in_growth_fy ?? 0) >= 0 ? '+' : ''}${(dkQ.sell_in_growth_fy ?? 0).toFixed(1)}%`} color="blue"/>
              <HeroKpi label="Sell-Out FY 2026" value={fmtK(dkQ.sell_out_fy_2026 ?? 0)}  sub={`vs ${fmtK(dkQ.sell_out_fy_2025 ?? 0)} en 2025`} color="green"/>
              <HeroKpi label="Sell-In YTD"      value={fmtK(dkQ.sell_in_ytd_2026 ?? 0)}  sub="facturas YTD" color="yellow"/>
              <HeroKpi label="Sell-Out YTD"     value={fmtK(dkQ.sell_out_ytd_2026 ?? 0)} sub={`${(((dkQ.sell_out_ytd_2026 ?? 0) / Math.max(1, dkQ.sell_in_ytd_2026 ?? 1)) * 100).toFixed(0)}% del sell-in convertido`} color="blue"/>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <HeroKpi label="Baseline Mensual Saludable" value={fmtK(baselineAvg)}                        sub="avg meses con stock"         color="green"/>
              <HeroKpi label="Venta Perdida (OOS)"        value={fmtK(oos.total_lost_val ?? 0)}            sub={`${(oos.total_lost_uni ?? 0).toLocaleString('en-US')} u no vendidas`} color="red"/>
              <HeroKpi label="Capital Excedente"          value={fmtK(ofk.total_excedente_val ?? 0)}       sub={`concentrado en ${ofk.n_total ?? 0} SKU(s)`} color="yellow"/>
              <HeroKpi label="Quiebres Activos"           value={quiebres}                                  sub="SKU × Tienda sin stock"      color="blue"/>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Resumen Ejecutivo · Queso</h3>
            <div className="space-y-2 text-sm text-gray-700 leading-relaxed">
              <p>La marca BL Foods mantiene una <strong>trayectoria de expansión sólida en Super Selectos</strong> desde su relanzamiento en octubre 2025. La demanda promedio mensual saludable se ubica en <strong>{fmtFull(baselineAvg)}</strong>.</p>
              <p>El <strong>valle Feb-Mar 2026 fue causado por desabastecimiento (OOS)</strong>, no por declive de demanda. La pérdida estimada de {fmtK(oos.total_lost_val ?? 0)} es demanda recuperable con planificación más robusta.</p>
              <p>3 frentes inmediatos: (1) continuidad de suministro + safety stock; (2) atender {quiebres} quiebres con reabasto dirigido; (3) liquidar excedente para liberar capital.</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Oportunidades vs Riesgos · Queso (Clase A)</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
                <h4 className="text-sm font-bold text-emerald-700 mb-2">🚀 Para Empujar</h4>
                {top4WinQ.length > 0 ? (
                  <ul className="space-y-1.5">{top4WinQ.map((r: any) => (
                    <li key={r.sku} className="text-xs text-gray-700"><strong>{r.producto}</strong> — VPD {(r.vpd_uni ?? 0).toFixed(1)}u/d · {r.tendencia}</li>
                  ))}</ul>
                ) : <p className="text-xs text-gray-400">Sin SKUs identificados en filtro actual.</p>}
              </div>
              <div className="rounded-xl border border-red-200 bg-red-50/40 p-4">
                <h4 className="text-sm font-bold text-red-700 mb-2">⚠️ Riesgo Inmediato</h4>
                {top4RiskQ.length > 0 ? (
                  <ul className="space-y-1.5">{top4RiskQ.map((r: any) => (
                    <li key={r.sku} className="text-xs text-gray-700"><strong>{r.producto}</strong> — DOH {r.doh_pdv ?? '—'}d · {r.health}</li>
                  ))}</ul>
                ) : <p className="text-xs text-gray-400 font-medium">Sin riesgos agudos en Clase A.</p>}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Plan de Acción Queso · 30 / 60 / 90 días</h3>
            <div className="grid md:grid-cols-3 gap-3">
              <TimelineCard horizon="30 días" title="Recuperar Continuidad" accent="border-l-red-400"
                items={[`Confirmar ingreso mayo y cobertura por SKU.`, `Cerrar ${quiebres} quiebres SKU×Tienda.`, 'Oferta defensiva en SKUs excedentes.', 'Reconciliar venta real cierre mayo.']}/>
              <TimelineCard horizon="30–60 días" title="Prevenir OOS" accent="border-l-amber-400"
                items={['Safety stock por SKU Clase A.', 'Monitor DOH < 21d Pareto A.', 'Forecast colaborativo mensual BL Foods ↔ Super Selectos.', 'Tracking semanal nuevos SKUs.']}/>
              <TimelineCard horizon="60–90 días" title="Acelerar Crecimiento" accent="border-l-emerald-400"
                items={['Distribución secundaria top 10 tiendas.', 'Calendario promo Q3.', 'Racionalizar SKUs no-activos.', 'Health Score & benchmarks.']}/>
            </div>
          </div>
        </>)}

        {/* ── LECHE BLOCK ── */}
        {showL && (<>
          <div className="rounded-xl px-5 py-3.5 shadow-sm" style={{ background: 'linear-gradient(135deg,#f0fdfa 0%,#ccfbf1 100%)', borderLeft: '5px solid #0891b2' }}>
            <h3 className="text-base font-bold text-teal-700">🥛 División Leche UHT · Reporte Detallado</h3>
            <p className="text-xs text-teal-600 mt-0.5">Lanzamiento Abr-2026. 5 variedades UHT 1L. Distribución inicial 121 tiendas. <strong>Mayo 2026:</strong> primera ventana real de venta.</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">📈 Cumplimiento Plan Comercial 2026 · Leche</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <HeroKpi label="Sell-In Real YTD"    value={fmtK(dkL.sell_in_ytd_2026 ?? 0)}     sub="FY 2026 (real + proy)"   color="blue"/>
              <HeroKpi label="Target Comercial FY" value={fmtFull(dkL.sell_in_target_fy ?? 0)}  sub="Plan BL Foods FY"        color="green"/>
              <HeroKpi label="% Cumplimiento FY"   value={`${cumL.toFixed(1)}%`}                 sub={`${fmtK(dkL.sistema_fy_fob ?? dkL.sell_in_ytd_2026 ?? 0)} sistema`} color="yellow"/>
              <HeroKpi label="Gap a Target"        value={gapL >= 0 ? fmtK(gapL) : '✓ Cumple'}  sub={gapL >= 0 ? 'faltante FY' : 'alcanzado'} color={gapL >= 0 ? 'red' : 'green'}/>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">💰 Sell-In vs Sell-Out 2026 · Leche</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <HeroKpi label="Sell-In FY 2026"  value={fmtK(dkL.sell_in_fy_2026 ?? 0)}   sub="Innovación · sin base 2025"         color="blue"/>
              <HeroKpi label="Sell-Out FY 2026" value={fmtK(dkL.sell_out_fy_2026 ?? 0)}  sub="May real + proyección Jun-Dec"       color="green"/>
              <HeroKpi label="Sell-In YTD"      value={fmtK(dkL.sell_in_ytd_2026 ?? 0)}  sub="facturas BL Foods"                   color="yellow"/>
              <HeroKpi label="Sell-Out YTD"     value={fmtK(dkL.sell_out_ytd_2026 ?? 0)} sub="depleción stock inicial mayo"        color="blue"/>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Resumen Ejecutivo · Leche UHT</h3>
            <div className="space-y-2 text-sm text-gray-700 leading-relaxed">
              <p>El lanzamiento de Leche UHT inicia con un <strong>stock inicial significativo en abril/mayo 2026</strong>. La ventana real de sell-out arranca en mayo, con depleción del inventario inicial.</p>
              <p>No hay baseline 2025 (innovación). El equipo necesita <strong>60-90 días de venta sostenida</strong> para definir un VPD confiable por variedad. Hasta entonces, las proyecciones son indicativas.</p>
              <p>3 frentes inmediatos: (1) monitor semanal sell-through por variedad; (2) revisar mix de pedido próximo container al cierre jun; (3) ampliar facing en 121 tiendas activas.</p>
            </div>
          </div>

          {lecheSkus.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">🥛 Portafolio Leche UHT — Estado Actual</h3>
              <div className="rounded-xl border border-teal-200 bg-teal-50/30 p-4">
                <h4 className="text-xs font-bold text-teal-700 uppercase tracking-widest mb-2">{lecheSkus.length} variedades activas (121 tiendas)</h4>
                <ul className="space-y-1.5">
                  {lecheSkus.map((r: any) => (
                    <li key={r.sku} className="text-xs text-gray-700">
                      <strong>{r.producto}</strong> — VPD {(r.vpd_uni ?? 0).toFixed(2)} u/d · Inv {(r.total_inv_uni ?? 0).toLocaleString('en-US')} u · DOH {r.doh_pdv ?? '—'}d
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Plan de Acción Leche UHT · 30 / 60 / 90 días</h3>
            <div className="grid md:grid-cols-3 gap-3">
              <TimelineCard horizon="30 días" title="Post-Arribo Jun 5" accent="border-l-teal-400"
                items={['Confirmar entrega container en tránsito.', 'Verificar facing en 121 tiendas.', 'Monitor sell-through semanal por variedad.', 'Material POP educativo en góndola.']}/>
              <TimelineCard horizon="30–60 días" title="Definir Baseline" accent="border-l-amber-400"
                items={['Calcular VPD confiable por variedad.', 'Revisar mix container BL Foods jul.', 'Identificar variedades a escalar vs ajustar.', 'Cadencia mensual de pedidos.']}/>
              <TimelineCard horizon="60–90 días" title="Ampliar Distribución" accent="border-l-emerald-400"
                items={['Evaluar entrada en NSE C/D con SKU ancla.', 'Cobertura objetivo: definir target Q3.', 'Diferenciación vs marcas locales.', 'Revisar elasticidad-precio.']}/>
            </div>
          </div>
        </>)}

        {/* ── Decisiones ── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Decisiones que Requieren Tu Aprobación</h3>
          <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
            <p className="text-xs font-bold text-blue-700 mb-2">📌 Para próxima reunión BL Foods ↔ Super Selectos:</p>
            <ol className="space-y-1.5 list-decimal list-inside">
              {showQ && <li className="text-xs text-gray-700"><strong>Queso:</strong> confirmar reabasto mayo + plan {quiebres} quiebres + oferta excedente Procesado.</li>}
              {showQ && <li className="text-xs text-gray-700"><strong>Queso:</strong> validar safety stock para SKUs Clase A.</li>}
              {showL && <li className="text-xs text-gray-700"><strong>Leche:</strong> aprobar mix container BL Foods jul (5 variedades · min 65 cs/SKU).</li>}
              {showL && <li className="text-xs text-gray-700"><strong>Leche:</strong> definir ventana de evaluación 60-90d post-arribo.</li>}
              <li className="text-xs text-gray-700">Acordar cadencia Business Review mensual con este tablero.</li>
            </ol>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="bg-gray-50 rounded-xl border border-gray-100 px-5 py-3 flex items-center justify-between text-xs text-gray-400">
          <span>Reporte basado en Ventas Sell-Out Oct 2024 – May 2026 e Inventario snapshot {meta.inv_date ?? '—'}.</span>
          <span className="font-semibold text-gray-600">Borden · {new Date().toLocaleDateString('es-SV', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>

      </div>
    )
  }

  function Recomendaciones() {
    const recs: { tipo: string; msg: string; sku?: string; nivel: 'alta' | 'media' | 'baja' }[] = []
    reorden?.rows.filter((r: any) => r.urgencia === 'critico').forEach((r: any) => {
      recs.push({ tipo: 'Reorden Urgente', msg: `${r.descripcion} — DOH ${Math.round(r.doh ?? 0)}d, reordenar inmediatamente`, sku: r.sku, nivel: 'alta' })
    })
    reorden?.rows.filter((r: any) => r.urgencia === 'alerta').forEach((r: any) => {
      recs.push({ tipo: 'Reorden Próximo', msg: `${r.descripcion} — DOH ${Math.round(r.doh ?? 0)}d, planificar pedido esta semana`, sku: r.sku, nivel: 'media' })
    })
    pareto?.rows.filter((r: any) => !r.es_top75).slice(0, 3).forEach((r: any) => {
      recs.push({ tipo: 'Cola Larga', msg: `${r.descripcion} — bajo impacto (${fmt$(r.valor)}), evaluar portafolio`, sku: r.sku, nivel: 'baja' })
    })
    if (!recs.length) return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
        <p className="text-3xl mb-2">✅</p>
        <p className="text-sm font-semibold text-gray-700">Sin alertas activas</p>
        <p className="text-xs text-gray-400 mt-1">Todos los indicadores en rango normal. Carga Resumen y Pareto para generar recomendaciones.</p>
      </div>
    )
    const BG = { alta: 'border-l-red-500 bg-red-50/20', media: 'border-l-amber-400 bg-amber-50/20', baja: 'border-l-gray-300 bg-gray-50' }
    const BADGE = { alta: 'bg-red-100 text-red-700', media: 'bg-amber-100 text-amber-700', baja: 'bg-gray-100 text-gray-500' }
    return (
      <div className="space-y-3">
        {recs.map((r, i) => (
          <div key={i} className={`bg-white rounded-xl border border-gray-100 shadow-sm p-4 border-l-4 ${BG[r.nivel]}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${BADGE[r.nivel]}`}>{r.tipo}</span>
                  {r.sku && <span className="text-[10px] text-gray-400 font-mono">{r.sku}</span>}
                </div>
                <p className="text-sm text-gray-700">{r.msg}</p>
              </div>
              <span className="text-lg flex-shrink-0">{r.nivel === 'alta' ? '🔴' : r.nivel === 'media' ? '🟡' : '⚪'}</span>
            </div>
          </div>
        ))}
      </div>
    )
  }

  const renderSection = () => {
    switch (section) {
      case 'resumen':         return Resumen()
      case 'evolucion':       return Evolucion()
      case 'cobertura':       return Cobertura()
      case 'inventarios':     return Inventarios()
      case 'pedidos':         return Pedidos()
      case 'ofertas':         return Ofertas()
      case 'innovaciones':    return (
        <InnovacionesSection
          apiUrl="/api/comercial/ejecucion/sv/selectos/innovaciones"
          titulo="Selectos · El Salvador"
          subtitulo="🇸🇻 Detección automática: SKUs con primera venta en los últimos 180 días."
          monedaLabel="USD"
        />
      )
      case 'pareto':          return Pareto()
      case 'perdida':         return PerdidaVenta()
      case 'precios':         return ListaPrecios()
      case 'recomendaciones': return Recomendaciones()
      case 'cliente':         return VistaCliente()
      default:                return Resumen()
    }
  }

  return (
    <EjecucionLayout
      eyebrow="Ejecución Selectos"
      title="Selectos"
      flag="🇸🇻"
      subtitle={`Portafolio BL Foods${invFecha ? ` · Inventario al ${invFecha}` : ''}`}
      loading={Object.values(loading).some(Boolean)}
      accent="amber"
      storageKey="selectos-sv"
      sections={SECTIONS}
      section={section}
      onSection={goSection}
      filters={[
        { key: 'categoria', label: 'Categoría', value: categoriaSel, onChange: setCategoriaSel,
          options: CATEGORIAS_SELECTOS.map(c => ({ value: c })) },
      ]}
    >
      {renderSection()}
    </EjecucionLayout>
  )
}
