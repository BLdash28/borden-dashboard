'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Download, RefreshCw, Save, CheckCircle, AlertTriangle,
  XCircle, ChevronUp, ChevronDown, Loader2
} from 'lucide-react'

// ── Constantes ────────────────────────────────────────────────────────────────
const PAISES   = ['CR','GT','SV','NI','HN']
const CATS     = ['Quesos','Leches','Helados']
const FORMATOS_OPTS = ['Bodegas','Descuentos','Supermercados','Hipermercado']
const TC: Record<string,number> = { CR:510, GT:7.75, HN:25, NI:37, SV:1 }
const MONEDA: Record<string,string> = { CR:'CRC', GT:'GTQ', HN:'HNL', NI:'NIO', SV:'USD' }

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtP  = (v: number, mono = 'USD') => v > 0 ? `${mono === 'USD' ? '$' : mono+' '}${v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}` : '—'
const fmtN  = (v: number) => v.toLocaleString('en-US')
const fmtPct= (v: number | null) => v === null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%'
const fmtUPC= (v: string | number | null | undefined): string => {
  if (v == null || v === '') return '—'
  const s = String(v)
  // Convierte notación científica (ej: "7.44113E+12") al entero completo
  if (/[eE]/.test(s)) return Math.round(Number(s)).toString()
  return s
}

// ── Alert helpers ─────────────────────────────────────────────────────────────
type AlertLevel = 'ok' | 'warn' | 'critical' | 'none'
function AlertChip({ nivel, label }: { nivel: AlertLevel; label: string }) {
  const cls = nivel === 'ok'       ? 'bg-green-50 text-green-700 border-green-200'
            : nivel === 'warn'     ? 'bg-amber-50 text-amber-700 border-amber-200'
            : nivel === 'critical' ? 'bg-red-50 text-red-600 border-red-200'
            : 'bg-gray-50 text-gray-400 border-gray-200'
  const Icon = nivel === 'ok'       ? CheckCircle
             : nivel === 'warn'     ? AlertTriangle
             : nivel === 'critical' ? XCircle
             : AlertTriangle
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-medium ${cls}`}>
      <Icon size={12} />
      {label}
    </div>
  )
}

// ── Interfaces ────────────────────────────────────────────────────────────────
interface Metricas {
  sku: string; descripcion: string; categoria: string
  subcategoria: string | null; codigo_barras: string | null
  pvp: number; precio_hist: number; tc: number; moneda: string
  so_prom_mes: number; val_prom_mes: number; ventas_8d: number
  inv_tiendas: number; inv_cedi: number; inv_total: number
  dias_stock: number | null; estado_stock: string
  delta_yoy: number | null; tendencia: string
  factor_elast: number; registros_elast: number
  elast_reg_bajo: number; elast_reg_alto: number
  elast_vol_bajo: number; elast_vol_alto: number
}
interface Producto { sku: string; descripcion: string; categoria: string; subcategoria: string | null }
interface MonitorRow {
  id: number; fecha_captura: string; pais: string; formato: string; cadena: string
  sku: string; codigo_barras: string | null; descripcion: string
  precio_walmart: number | null; precio_oferta: number | null
  precio_pvp: number | null; diferencia_pct: number | null
  url_producto: string | null; encontrado: boolean; estado: string
}
interface Oferta {
  id: number; fecha_registro: string; pais: string; cliente: string
  formatos: string; producto: string; upc: string | null
  pvp: number; pct_descuento: number; precio_oferta: number
  fecha_inicio: string; fecha_fin: string; dias: number
  so_proy_uds: number; so_proy_valor: number
  impacto_local: number; impacto_usd: number
  inv_total: number; tendencia: string; estado_stock: string; estado: string
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function PrecioCalculadora() {
  const [tab, setTab] = useState<'calc' | 'historial' | 'analisis' | 'monitor'>('calc')

  // ── Inputs ──────────────────────────────────────────────────────────────────
  const [pais,        setPais]        = useState('CR')
  const [categoria,   setCategoria]   = useState('')
  const [subcategoria,setSubcategoria]= useState('')
  const [selectedDesc, setSelectedDesc] = useState('')
  const [formatos,    setFormatos]    = useState<string[]>([])
  const [precioMagico,setPrecioMagico]= useState<string>('')
  const [descPct,     setDescPct]     = useState<string>('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin,    setFechaFin]    = useState('')
  const [cliente,     setCliente]     = useState('Walmart')

  // ── Data ────────────────────────────────────────────────────────────────────
  const [allProductos, setAllProductos] = useState<Producto[]>([])
  const [productos,    setProductos]    = useState<Producto[]>([])
  const [metricas,    setMetricas]    = useState<Metricas | null>(null)
  const [ofertas,     setOfertas]     = useState<Oferta[]>([])
  const [loadingProd, setLoadingProd] = useState(false)
  const [loadingMet,  setLoadingMet]  = useState(false)
  const [loadingOfs,  setLoadingOfs]  = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)

  // ── Análisis tab ─────────────────────────────────────────────────────────────
  const [analisisRows, setAnalisisRows] = useState<any[]>([])
  const [loadingAn,    setLoadingAn]    = useState(false)
  const [anPaises,     setAnPaises]     = useState<string[]>([])
  const [anCats,       setAnCats]       = useState<string[]>([])

  // ── Monitor de precios tab ───────────────────────────────────────────────────
  const [monitorRows,    setMonitorRows]    = useState<MonitorRow[]>([])
  const [loadingMonitor, setLoadingMonitor] = useState(false)
  const [runningMonitor, setRunningMonitor] = useState(false)
  const [monitorMsg,     setMonitorMsg]     = useState<{ text: string; ok: boolean } | null>(null)
  const [monitorFiltros, setMonitorFiltros] = useState<string[]>([])   // filtros de tabla (vacío = todos)
  const [monitorAno,     setMonitorAno]     = useState<string>('')     // '' = 2025+2026
  const [monitorMes,     setMonitorMes]     = useState<string>('')     // '' = todos los meses

  // Simulación manual: overrides de SO, inventario y factor base
  const [soPromSim,      setSoPromSim]      = useState<string>('')
  const [invTotalSim,    setInvTotalSim]    = useState<string>('')
  const [factorBaseSim,  setFactorBaseSim]  = useState<string>('')

  // Precio web por formato para el producto actualmente seleccionado
  type WebPrice = { precio: number | null; cadena: string; encontrado: boolean; loading: boolean }
  const [webPrices, setWebPrices] = useState<Record<string, WebPrice>>({})

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Carga completa: SOLO para los dropdowns de categoría/subcategoría ────────
  // Nunca toca `productos` para evitar race conditions con la carga filtrada.
  const cargarTodos = useCallback(async (p: string) => {
    if (!p) return
    setLoadingProd(true)
    try {
      const res = await fetch('/api/comercial/ejecucion/precio/calculadora?' + new URLSearchParams({ pais: p }))
      const j   = res.ok ? await res.json() : { productos: [] }
      setAllProductos(j.productos ?? [])
    } finally { setLoadingProd(false) }
  }, [])

  // ── Carga filtrada: SOLO para el dropdown de producto ─────────────────────────
  const cargarFiltrados = useCallback(async (p: string, cat: string, sub: string) => {
    if (!p || !cat) { setProductos([]); return }
    setLoadingProd(true)
    const qs = new URLSearchParams({ pais: p, categoria: cat })
    if (sub) qs.set('subcategoria', sub)
    try {
      const res = await fetch('/api/comercial/ejecucion/precio/calculadora?' + qs)
      const j   = res.ok ? await res.json() : { productos: [] }
      setProductos(j.productos ?? [])
    } finally { setLoadingProd(false) }
  }, [])

  // Al cambiar país: carga completa (sólo cascada), resetea producto dropdown
  useEffect(() => {
    setSelectedDesc(''); setSubcategoria(''); setCategoria(''); setMetricas(null)
    setProductos([])
    cargarTodos(pais)
  }, [pais, cargarTodos])

  // Opciones derivadas de la lista COMPLETA (cascada client-side)
  const categorias    = [...new Set(allProductos.map(p => p.categoria).filter(Boolean))].sort()
  const subcategorias = [...new Set(
    allProductos
      .filter(p => !categoria || p.categoria === categoria)
      .map(p => p.subcategoria)
      .filter(Boolean) as string[]
  )].sort()

  // Filtro client-side estricto: garantiza que el dropdown nunca muestre
  // productos de otra categoría sin importar qué llegue del servidor.
  const productosMostrados = productos.filter(p =>
    (!categoria    || p.categoria    === categoria) &&
    (!subcategoria || p.subcategoria === subcategoria)
  )

  // Derivar SKU desde la descripción seleccionada.
  // Busca en productosMostrados primero, luego en productos/allProductos como fallback
  // para el caso en que cargarFiltrados actualice la lista mientras hay una selección activa.
  const _findByDesc = (list: Producto[]) =>
    list.find(p => p.descripcion.trim() === selectedDesc.trim())
  const selectedProduct = _findByDesc(productosMostrados) ?? _findByDesc(productos) ?? _findByDesc(allProductos)
  const sku = selectedProduct?.sku ?? ''

  // ── Cargar métricas del SKU ──────────────────────────────────────────────────
  const cargarMetricas = useCallback(async (s: string, p: string, fmts: string[]) => {
    if (!s || !p) return
    setLoadingMet(true)
    setMetricas(null)
    const qs = new URLSearchParams({ pais: p, sku: s })
    if (fmts.length) qs.set('formatos', fmts.join(','))
    try {
      const res = await fetch('/api/comercial/ejecucion/precio/calculadora?' + qs)
      if (res.ok) setMetricas(await res.json())
    } finally { setLoadingMet(false) }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => cargarMetricas(sku, pais, formatos), 300)
  }, [sku, pais, formatos, cargarMetricas])

  // Limpiar precios web y overrides de simulación al cambiar producto o país
  useEffect(() => { setWebPrices({}); setSoPromSim(''); setInvTotalSim(''); setFactorBaseSim('') }, [sku, pais])

  // Recalcular descPct cuando cambia pvp (ej: nuevo producto o monitor actualiza el PVP)
  useEffect(() => {
    const p = metricas?.pvp ?? 0
    if (!precioMagico || !p) return
    const pm = parseFloat(precioMagico) || 0
    if (pm > 0 && p > 0) setDescPct(String(Math.round((p - pm) / p * 100)))
  }, [metricas?.pvp]) // eslint-disable-line

  // Toggle de formato: si hay SKU seleccionado y el formato se activa, scrape inmediato
  const toggleFormato = useCallback(async (f: string) => {
    const wasOn = formatos.includes(f)
    setFormatos(prev => wasOn ? prev.filter(x => x !== f) : [...prev, f])

    if (wasOn) {
      setWebPrices(prev => { const n = { ...prev }; delete n[f]; return n })
      return
    }

    if (!sku) return  // sin producto seleccionado, solo toggle sin scrape

    setWebPrices(prev => ({ ...prev, [f]: { precio: null, cadena: '', encontrado: false, loading: true } }))
    try {
      const res = await fetch('/api/comercial/ejecucion/precio/monitor-walmart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pais, formatos: [f], sku }),
      })
      const j = res.ok ? await res.json() : null
      const r = j?.resultados?.[0]
      setWebPrices(prev => ({ ...prev, [f]: {
        precio:     r?.precioLista ?? r?.precioOferta ?? null,
        cadena:     r?.cadena     ?? '',
        encontrado: r?.encontrado ?? false,
        loading:    false,
      } }))
    } catch {
      setWebPrices(prev => ({ ...prev, [f]: { precio: null, cadena: '', encontrado: false, loading: false } }))
    }
  }, [formatos, sku, pais])

  // ── Cargar historial ─────────────────────────────────────────────────────────
  const cargarOfertas = useCallback(async () => {
    setLoadingOfs(true)
    const qs = new URLSearchParams()
    if (pais) qs.set('pais', pais)
    try {
      const res = await fetch('/api/comercial/ejecucion/precio/ofertas?' + qs)
      if (res.ok) { const j = await res.json(); setOfertas(j.rows ?? []) }
    } finally { setLoadingOfs(false) }
  }, [pais])

  useEffect(() => { if (tab === 'historial') cargarOfertas() }, [tab, cargarOfertas])

  // ── Cargar análisis ──────────────────────────────────────────────────────────
  const cargarAnalisis = useCallback(async (ps: string[], cs: string[]) => {
    setLoadingAn(true)
    const qs = new URLSearchParams()
    if (ps.length) qs.set('pais', ps.join(','))
    if (cs.length) qs.set('categoria', cs.join(','))
    try {
      const res = await fetch('/api/comercial/ejecucion/precio?' + qs)
      if (res.ok) { const j = await res.json(); setAnalisisRows(j.rows ?? []) }
    } finally { setLoadingAn(false) }
  }, [])

  useEffect(() => { if (tab === 'analisis') cargarAnalisis(anPaises, anCats) }, [tab]) // eslint-disable-line

  // ── Cargar monitor ───────────────────────────────────────────────────────────
  const cargarMonitor = useCallback(async (p: string, ano: string, mes: string) => {
    setLoadingMonitor(true)
    const qs = new URLSearchParams({ pais: p })
    if (ano) qs.set('ano', ano)
    if (ano && mes) qs.set('mes', mes)
    try {
      const res = await fetch('/api/comercial/ejecucion/precio/monitor-walmart?' + qs)
      if (res.ok) { const j = await res.json(); setMonitorRows(j.rows ?? []) }
    } finally { setLoadingMonitor(false) }
  }, [])

  const ejecutarMonitor = async () => {
    if (!pais) return
    setRunningMonitor(true)
    setMonitorMsg(null)
    try {
      // Siempre escanea todos los formatos disponibles del país
      const res = await fetch('/api/comercial/ejecucion/precio/monitor-walmart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pais,
          formatos: FORMATOS_OPTS,
          ...(monitorAno ? { ano: parseInt(monitorAno) } : {}),
          ...(monitorAno && monitorMes ? { mes: parseInt(monitorMes) } : {}),
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok) {
        setMonitorMsg({ text: `✓ Escaneados ${j.procesados} productos`, ok: true })
        cargarMonitor(pais, monitorAno, monitorMes)
      } else {
        setMonitorMsg({ text: j.error || `Error ${res.status}`, ok: false })
      }
    } catch (e: any) {
      setMonitorMsg({ text: e?.message ?? 'Error de red', ok: false })
    } finally { setRunningMonitor(false) }
  }

  useEffect(() => { if (tab === 'monitor') cargarMonitor(pais, monitorAno, monitorMes) }, [tab, pais]) // eslint-disable-line

  // ── Cálculos del simulador ───────────────────────────────────────────────────
  const pvp         = metricas?.pvp ?? 0
  const tc          = metricas?.tc ?? TC[pais] ?? 1
  const moneda      = metricas?.moneda ?? MONEDA[pais] ?? 'USD'
  const pm          = parseFloat(precioMagico) || 0
  const dp          = parseFloat(descPct) || 0
  const precioOferta = pm > 0 ? pm : (dp > 0 ? pvp * (1 - dp / 100) : pvp)
  const descResultante = pvp > 0 ? ((pvp - precioOferta) / pvp) * 100 : 0

  const diasOferta  = (() => {
    if (!fechaInicio || !fechaFin) return 0
    const diff = (new Date(fechaFin).getTime() - new Date(fechaInicio).getTime()) / 86400000
    return Math.max(0, Math.round(diff) + 1)
  })()

  const soProm      = soPromSim     ? (parseFloat(soPromSim)     || 0)  : (metricas?.so_prom_mes  ?? 0)
  const invTotal    = invTotalSim   ? (parseFloat(invTotalSim)   || 0)  : (metricas?.inv_tiendas  ?? 0)
  const factorBase  = factorBaseSim ? (parseFloat(factorBaseSim) || 1.1) : (metricas?.factor_elast ?? 1.1)

  const quincena = (() => {
    if (!fechaInicio) return '—'
    const d = new Date(fechaInicio).getDate()
    return d <= 15 ? '1ra quincena' : '2da quincena'
  })()

  // Fórmula Excel exacta: 1+(baseElast-1)*descEfectivo/0.15, ×1.08 si quincena
  const descEfectivo = pvp > 0
    ? (pm > 0 ? (pvp - pm) / pvp : dp > 0 ? dp / 100 : 0)
    : 0
  const esQuincena  = quincena !== '—'
  const rawFactor   = descEfectivo <= 0
    ? Math.max(0.5, 1 - factorBase * 0.1)
    : 1 + (factorBase - 1) * descEfectivo / 0.15
  const factorElast = parseFloat(Math.min(2.0, Math.max(0.5,
    rawFactor * (esQuincena ? 1.08 : 1.0)
  )).toFixed(2))

  const soProyUds   = soProm > 0 && diasOferta > 0
    ? Math.round(soProm * factorElast * diasOferta / 30) : 0
  const soProyValor = soProyUds * precioOferta
  const ingresoSin  = pvp * soProm
  const ingresoCon  = soProyUds * precioOferta
  const impactoLocal = (pvp - precioOferta) * soProyUds
  const impactoUsd   = tc > 0 ? impactoLocal / tc : impactoLocal

  // ── Alertas ──────────────────────────────────────────────────────────────────
  const alertBrand  : AlertLevel = descResultante > 25 ? 'critical' : descResultante > 15 ? 'warn' : 'ok'
  const alertLogist : AlertLevel = soProyUds > invTotal && invTotal > 0 ? 'critical'
                                 : soProyUds > invTotal * 0.8 ? 'warn' : 'ok'
  const alertDesc   : AlertLevel = descResultante > 30 ? 'critical' : descResultante > 20 ? 'warn' : 'ok'
  const alertStock  : AlertLevel = metricas?.dias_stock === null ? 'none'
                                 : (metricas?.dias_stock ?? 0) > 60 ? 'warn'
                                 : (metricas?.dias_stock ?? 0) > 90 ? 'critical' : 'ok'

  // ── Guardar oferta ───────────────────────────────────────────────────────────
  const guardar = async (estado: 'Borrador' | 'Aprobada') => {
    if (!sku || !metricas) return
    setSaving(true)
    try {
      await fetch('/api/comercial/ejecucion/precio/ofertas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pais, cliente, formatos: formatos.join(', '),
          producto: metricas.descripcion, upc: metricas.codigo_barras,
          pvp, pct_descuento: parseFloat(descResultante.toFixed(2)), precio_oferta: precioOferta,
          fecha_inicio: fechaInicio || null, fecha_fin: fechaFin || null,
          dias: diasOferta, quincena,
          so_prom_mes: soProm, factor_elast: factorElast,
          so_proy_uds: soProyUds, so_proy_valor: parseFloat(soProyValor.toFixed(2)),
          impacto_local: parseFloat(impactoLocal.toFixed(2)),
          impacto_usd: parseFloat(impactoUsd.toFixed(2)),
          inv_total: invTotal,
          tendencia: metricas.tendencia, estado_stock: metricas.estado_stock, estado,
        }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally { setSaving(false) }
  }

  // ── Clase de input ───────────────────────────────────────────────────────────
  const inp = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-blue-50/60'
  const sel = inp + ' cursor-pointer'

  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div>
        <p className="text-xs text-gray-400 uppercase tracking-widest">Ejecución</p>
        <h1 className="text-2xl font-bold text-gray-800">Precio &amp; Calculadora de Ofertas</h1>
        <p className="text-sm text-gray-400 mt-0.5">Simulador de impacto financiero y registro de promos</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {([
          { id: 'calc',      label: 'Calculadora' },
          { id: 'historial', label: 'Registro de Ofertas' },
          { id: 'analisis',  label: 'Análisis de Precio' },
          { id: 'monitor',   label: 'Monitoreo de Precios' },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.id ? 'border-amber-500 text-amber-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ TAB CALCULADORA ══════════════════════════════════════════════════════ */}
      {tab === 'calc' && (
        <div className="space-y-4">

          {/* Bloque 1 — Selección */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-3">📌 Selección de Oferta</p>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">País</label>
                <select value={pais} onChange={e => setPais(e.target.value)} className={sel}>
                  {PAISES.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Cliente</label>
                <div className="flex items-center h-9 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 font-medium">
                  Walmart
                </div>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">
                  Categoría {loadingProd && <Loader2 size={10} className="inline animate-spin ml-1" />}
                </label>
                <select value={categoria}
                  onChange={e => {
                    const v = e.target.value
                    setCategoria(v); setSubcategoria(''); setSelectedDesc(''); setMetricas(null)
                    cargarFiltrados(pais, v, '')
                  }}
                  className={sel} disabled={loadingProd}>
                  <option value="">Todas</option>
                  {categorias.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Subcategoría</label>
                <select value={subcategoria}
                  onChange={e => {
                    const v = e.target.value
                    setSubcategoria(v); setSelectedDesc(''); setMetricas(null)
                    cargarFiltrados(pais, categoria, v)
                  }}
                  className={sel} disabled={!categoria || loadingProd}>
                  <option value="">Todas</option>
                  {subcategorias.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="xl:col-span-2">
                <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Producto</label>
                <select value={selectedDesc} onChange={e => { setSelectedDesc(e.target.value); setMetricas(null) }}
                  className={sel}>
                  <option value="">— Seleccionar —</option>
                  {productosMostrados.map(p => (
                    <option key={p.descripcion} value={p.descripcion}>{p.descripcion}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Moneda / TC</label>
                <div className="flex items-center h-9 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-600">
                  {moneda} / {tc.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Precio y descuento */}
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3 mt-3">
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Precio Mágico</label>
                <input type="number" step="0.01" value={precioMagico}
                  onChange={e => {
                    const val = e.target.value
                    setPrecioMagico(val)
                    if (!val) { setDescPct(''); return }
                    const pm = parseFloat(val) || 0
                    if (pm > 0 && pvp > 0) setDescPct(String(Math.round((pvp - pm) / pvp * 100)))
                  }}
                  placeholder={pvp > 0 ? pvp.toFixed(2) : '0.00'} className={inp} />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Descuento %</label>
                <input type="number" step="0.5" min="0" max="50" value={descPct}
                  onChange={e => {
                    const val = e.target.value
                    setDescPct(val)
                    if (!val) { setPrecioMagico(''); return }
                    const dp = parseFloat(val) || 0
                    if (dp > 0 && pvp > 0) setPrecioMagico((pvp * (1 - dp / 100)).toFixed(2))
                  }}
                  placeholder="0" className={inp} />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">% Resultante</label>
                {(() => {
                  const pct = descResultante > 0 ? descResultante : (dp > 0 && pvp === 0 ? dp : 0)
                  return (
                    <div className={`flex items-center h-9 px-3 rounded-lg border text-sm font-semibold ${
                      pct > 25 ? 'border-red-300 bg-red-50 text-red-600' :
                      pct > 15 ? 'border-amber-300 bg-amber-50 text-amber-700' :
                      pct > 0  ? 'border-green-300 bg-green-50 text-green-700' :
                      'border-gray-200 bg-gray-50 text-gray-400'
                    }`}>
                      {pct > 0 ? pct.toFixed(1) + '%' : '—'}
                    </div>
                  )
                })()}
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Fecha Inicio</label>
                <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className={inp} />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Fecha Fin</label>
                <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} className={inp} />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Días / Quincena</label>
                <div className="flex items-center h-9 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-600">
                  {diasOferta > 0 ? `${diasOferta}d · ${quincena}` : '—'}
                </div>
              </div>
            </div>

            {/* Formatos */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Formatos:</span>
              {FORMATOS_OPTS.map(f => {
                const wp = webPrices[f]
                const isOn = formatos.includes(f)
                return (
                  <button key={f} onClick={() => toggleFormato(f)}
                    className={`flex flex-col items-center px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      isOn
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                    }`}>
                    <span>{isOn ? 'SÍ' : 'NO'} · {f}</span>
                    {wp?.loading && (
                      <span className="flex items-center gap-0.5 text-[9px] font-normal opacity-80 mt-0.5">
                        <Loader2 size={8} className="animate-spin" /> buscando…
                      </span>
                    )}
                    {wp && !wp.loading && (
                      <span className={`text-[9px] font-semibold mt-0.5 ${
                        wp.encontrado ? (isOn ? 'text-white/90' : 'text-green-600') : (isOn ? 'text-white/60' : 'text-gray-400')
                      }`}>
                        {wp.encontrado && wp.precio != null
                          ? fmtP(wp.precio, moneda)
                          : 'No encontrado'}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Bloque 2 — Detalle del Producto */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-3">
              📊 Detalle del Producto
              {loadingMet && <Loader2 size={10} className="inline animate-spin ml-2" />}
            </p>
            {!metricas && !loadingMet ? (
              <p className="text-sm text-gray-400 text-center py-4">Selecciona un producto para ver los datos</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                {/* Sell Out y Total Inv — editables para simulación */}
                <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3">
                  <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Sell Out Prom/Mes</p>
                  <input
                    type="number" min="0"
                    value={soPromSim !== '' ? soPromSim : (metricas ? String(Math.round(metricas.so_prom_mes)) : '')}
                    onChange={e => setSoPromSim(e.target.value)}
                    placeholder={metricas ? String(Math.round(metricas.so_prom_mes)) : '—'}
                    className="w-full text-sm font-bold text-gray-800 bg-transparent focus:outline-none focus:text-blue-600"
                  />
                  <p className="text-[10px] text-gray-400">{soPromSim ? '✏ simulado' : 'unidades/mes'}</p>
                </div>
                <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3">
                  <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Inventario Tiendas</p>
                  <input
                    type="number" min="0"
                    value={invTotalSim !== '' ? invTotalSim : (metricas ? String(metricas.inv_tiendas) : '')}
                    onChange={e => setInvTotalSim(e.target.value)}
                    placeholder={metricas ? String(metricas.inv_tiendas) : '—'}
                    className="w-full text-sm font-bold text-gray-800 bg-transparent focus:outline-none focus:text-blue-600"
                  />
                  <p className="text-[10px] text-gray-400">{invTotalSim ? '✏ simulado' : 'unidades'}</p>
                </div>
                <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3">
                  <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">Factor Base (Params)</p>
                  <input
                    type="number" min="1" max="2" step="0.01"
                    value={factorBaseSim !== '' ? factorBaseSim : (metricas ? metricas.factor_elast.toFixed(2) : '')}
                    onChange={e => setFactorBaseSim(e.target.value)}
                    placeholder={metricas ? metricas.factor_elast.toFixed(2) : '1.10'}
                    className="w-full text-sm font-bold text-gray-800 bg-transparent focus:outline-none focus:text-blue-600"
                  />
                  <p className="text-[10px] text-gray-400">
                    {factorBaseSim
                      ? `✏ → ${factorElast}x efecto`
                      : metricas
                        ? `${metricas.elast_reg_bajo}↓ ${metricas.elast_reg_alto}↑ días`
                        : '—'}
                  </p>
                </div>
                {[
                  { label: 'PVP Original',        value: fmtP(pvp, moneda),                      sub: moneda },
                  { label: 'Precio Hist. Pond.',   value: fmtP(metricas?.precio_hist??0, moneda), sub: 'promedio' },
                  { label: 'UPC / Cód. Barras',    value: fmtUPC(metricas?.codigo_barras), sub: 'código' },
                  { label: 'Ventas Últ. 8 Días',   value: metricas ? fmtN(metricas.ventas_8d) : '—',              sub: 'unidades' },
                  { label: 'Inventario Tiendas',   value: metricas ? fmtN(metricas.inv_tiendas) : '—',            sub: 'unidades' },
                  { label: 'Warehouse (CEDI)',      value: metricas ? fmtN(metricas.inv_cedi) : '—',              sub: 'cajas' },
                  { label: 'Días de Stock Est.',   value: metricas?.dias_stock !== null ? `${metricas?.dias_stock}d` : 'Sin venta', sub: metricas?.estado_stock ?? '' },
                  { label: 'Tendencia Venta',      value: metricas?.tendencia ?? '—',             sub: 'vs período anterior' },
                  { label: 'Δ YoY (26 vs 25)',     value: fmtPct(metricas?.delta_yoy ?? null),    sub: 'variación anual' },
                  { label: 'Elasticidad',          value: metricas ? `${factorElast}x` : '—', sub: factorBaseSim ? `base ${factorBase.toFixed(4)}x · manual` : metricas ? `base ${factorBase.toFixed(4)}x · ${metricas.registros_elast}d` : '—' },
                  { label: 'Categoría',            value: metricas?.categoria ?? '—',             sub: metricas?.subcategoria ?? '' },
                ].map(kpi => (
                  <div key={kpi.label} className="rounded-lg border border-gray-100 bg-gray-50/50 p-3">
                    <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1 truncate">{kpi.label}</p>
                    <p className="text-sm font-bold text-gray-800 truncate">{kpi.value}</p>
                    <p className="text-[10px] text-gray-400 truncate">{kpi.sub}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bloque 3 — Simulador */}
          {metricas && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-3">🚀 Simulador de Oferta</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Precio Oferta',        value: fmtP(precioOferta, moneda),               color: 'text-amber-600' },
                  { label: 'Factor Elasticidad',   value: `${factorElast}x`,                         color: 'text-blue-600' },
                  { label: 'S.O. Proy. Unidades',  value: fmtN(soProyUds),                           color: 'text-gray-800' },
                  { label: 'S.O. Proy. Valor',     value: fmtP(soProyValor, moneda),                 color: 'text-green-600' },
                  { label: 'Ingreso sin Oferta',   value: fmtP(ingresoSin, moneda),   sub: moneda !== 'USD' ? fmtP(ingresoSin / tc, 'USD') : null,  color: 'text-gray-500' },
                  { label: 'Ingreso con Oferta',   value: fmtP(ingresoCon, moneda),   sub: moneda !== 'USD' ? fmtP(ingresoCon / tc, 'USD') : null,  color: 'text-green-600' },
                  { label: '💰 Impacto $ (Cobro Promo)', value: fmtP(impactoLocal, moneda), sub: moneda !== 'USD' ? fmtP(impactoUsd, 'USD') : null, color: impactoLocal > 0 ? 'text-red-600 font-bold' : 'text-gray-400' },
                ].map(k => (
                  <div key={k.label} className={`rounded-lg border p-4 ${k.label.includes('💰') ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50/50'}`}>
                    <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">{k.label}</p>
                    <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
                    {k.sub && <p className="text-[10px] text-gray-400 mt-0.5">{k.sub}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bloque 4 — Alertas */}
          {metricas && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-3">🚨 Alertas y Controles</p>
              <div className="flex flex-wrap gap-2">
                <AlertChip nivel={alertBrand}
                  label={`Brand Equity: ${descResultante.toFixed(1)}% desc ${alertBrand === 'ok' ? '✓' : alertBrand === 'warn' ? '— límite' : '⚠ excede 25%'}`} />
                <AlertChip nivel={alertLogist}
                  label={`Logística: ${fmtN(soProyUds)} proy vs ${fmtN(invTotal)} inv ${alertLogist === 'critical' ? '⚠ insuficiente' : ''}`} />
                <AlertChip nivel={alertDesc}
                  label={`Descuento vs PVP: ${descResultante.toFixed(1)}% ${alertDesc === 'critical' ? '⚠ >30%' : ''}`} />
                <AlertChip nivel={alertStock}
                  label={`Stock: ${metricas.estado_stock}`} />
                <AlertChip nivel={metricas.delta_yoy !== null && metricas.delta_yoy < -10 ? 'warn' : 'ok'}
                  label={`Tendencia YoY: ${fmtPct(metricas.delta_yoy)}`} />
              </div>
            </div>
          )}

          {/* Acciones */}
          {metricas && (
            <div className="flex items-center gap-3">
              <button onClick={() => guardar('Borrador')} disabled={saving || !sku}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                <Save size={14} className={saving ? 'animate-pulse' : ''} />
                Guardar Borrador
              </button>
              <button onClick={() => guardar('Aprobada')} disabled={saving || !sku}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-40">
                <CheckCircle size={14} />
                Aprobar Oferta
              </button>
              {saved && (
                <span className="text-sm text-green-600 font-medium flex items-center gap-1">
                  <CheckCircle size={13} /> Guardado
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══ TAB HISTORIAL ════════════════════════════════════════════════════════ */}
      {tab === 'historial' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">Registro de Ofertas</p>
            <button onClick={cargarOfertas}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-lg text-xs text-gray-600 hover:bg-gray-200">
              <RefreshCw size={11} className={loadingOfs ? 'animate-spin' : ''} /> Actualizar
            </button>
          </div>
          {loadingOfs ? (
            <div className="h-32 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
          ) : ofertas.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-gray-400 text-sm">Sin ofertas registradas.</div>
          ) : (
            <table className="w-full text-xs min-w-[1000px]">
              <thead>
                <tr className="text-gray-400 uppercase tracking-widest text-[10px] border-b border-gray-100 bg-gray-50">
                  {['Fecha','País','Producto','PVP','Desc%','P.Oferta','Inicio','Fin','S.O.Proy Uds','S.O.Proy $','Impacto USD','Inv','Stock','Estado'].map(h => (
                    <th key={h} className="py-2.5 px-3 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ofertas.map((o, i) => (
                  <tr key={o.id} className={`border-b border-gray-50 ${i%2===0?'':'bg-gray-50/40'}`}>
                    <td className="py-2 px-3 text-gray-500">{new Date(o.fecha_registro).toLocaleDateString()}</td>
                    <td className="py-2 px-3 font-medium">{o.pais}</td>
                    <td className="py-2 px-3 text-gray-700 max-w-[180px] truncate">{o.producto}</td>
                    <td className="py-2 px-3 text-right">{o.pvp?.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right text-amber-600">{o.pct_descuento?.toFixed(1)}%</td>
                    <td className="py-2 px-3 text-right font-semibold">{o.precio_oferta?.toFixed(2)}</td>
                    <td className="py-2 px-3 text-gray-500">{o.fecha_inicio}</td>
                    <td className="py-2 px-3 text-gray-500">{o.fecha_fin}</td>
                    <td className="py-2 px-3 text-right">{fmtN(o.so_proy_uds)}</td>
                    <td className="py-2 px-3 text-right">{o.so_proy_valor?.toFixed(0)}</td>
                    <td className="py-2 px-3 text-right text-red-500">${o.impacto_usd?.toFixed(0)}</td>
                    <td className="py-2 px-3 text-right">{fmtN(o.inv_total)}</td>
                    <td className="py-2 px-3">{o.estado_stock}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        o.estado === 'Aprobada' ? 'bg-green-100 text-green-700' :
                        o.estado === 'Rechazada' ? 'bg-red-100 text-red-600' :
                        'bg-gray-100 text-gray-500'
                      }`}>{o.estado}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ══ TAB MONITOR ══════════════════════════════════════════════════════════ */}
      {tab === 'monitor' && (
        <div className="space-y-4">
          {/* Controles */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
            <div className="flex items-center gap-4 flex-wrap">
              {/* País */}
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">País</p>
                <select value={pais} onChange={e => { setPais(e.target.value); setMonitorFiltros([]) }}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-blue-50/60 focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer">
                  {PAISES.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>

              {/* Filtros de formato (post-escaneo) */}
              <div className="flex-1">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5">
                  Filtrar por formato <span className="normal-case font-normal">(vacío = todos)</span>
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  {FORMATOS_OPTS.map(f => (
                    <button key={f}
                      onClick={() => setMonitorFiltros(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f])}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        monitorFiltros.includes(f)
                          ? 'bg-amber-500 text-white border-amber-500'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                      }`}>
                      {f}
                    </button>
                  ))}
                  {monitorFiltros.length > 0 && (
                    <button onClick={() => setMonitorFiltros([])}
                      className="px-2 py-1 text-[10px] text-gray-400 hover:text-gray-600 underline">
                      Limpiar
                    </button>
                  )}
                </div>
              </div>

              {/* Período del PVP */}
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">PVP — Período</p>
                <div className="flex items-center gap-1.5">
                  <select value={monitorAno} onChange={e => { setMonitorAno(e.target.value); setMonitorMes(''); cargarMonitor(pais, e.target.value, '') }}
                    className="text-sm border border-gray-200 rounded-lg px-2 py-2 bg-blue-50/60 focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer">
                    <option value="">2025–2026</option>
                    <option value="2025">2025</option>
                    <option value="2026">2026</option>
                  </select>
                  {monitorAno && (
                    <select value={monitorMes} onChange={e => { setMonitorMes(e.target.value); cargarMonitor(pais, monitorAno, e.target.value) }}
                      className="text-sm border border-gray-200 rounded-lg px-2 py-2 bg-blue-50/60 focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer">
                      <option value="">Todos los meses</option>
                      {['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'].map((m,i) => (
                        <option key={i+1} value={String(i+1)}>{m}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Acciones */}
              <div className="flex items-center gap-2 ml-auto">
                {monitorMsg && (
                  <span className={`text-xs font-medium ${monitorMsg.ok ? 'text-green-600' : 'text-red-500'}`}>
                    {monitorMsg.text}
                  </span>
                )}
                <button onClick={() => cargarMonitor(pais, monitorAno, monitorMes)} disabled={loadingMonitor}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 rounded-lg text-xs text-gray-600 hover:bg-gray-200 disabled:opacity-40">
                  <RefreshCw size={12} className={loadingMonitor ? 'animate-spin' : ''} /> Actualizar tabla
                </button>
                <button onClick={ejecutarMonitor} disabled={runningMonitor || !pais}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-40">
                  {runningMonitor ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                  {runningMonitor ? 'Escaneando…' : 'Escanear todos los formatos'}
                </button>
              </div>
            </div>
          </div>

          {/* Tabla resultados */}
          {(() => {
            const rowsFiltradas = monitorFiltros.length === 0
              ? monitorRows
              : monitorRows.filter(r => monitorFiltros.includes(r.formato))
            return (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
            {loadingMonitor ? (
              <div className="h-40 flex items-center justify-center text-gray-300 text-sm">
                <Loader2 size={18} className="animate-spin mr-2" /> Cargando…
              </div>
            ) : rowsFiltradas.length === 0 ? (
              <div className="h-40 flex flex-col items-center justify-center text-gray-400 text-sm gap-2">
                <p>{monitorRows.length === 0 ? `Sin datos escaneados aún para ${pais}.` : 'Sin resultados para los filtros seleccionados.'}</p>
                {monitorRows.length === 0 && <p className="text-xs text-gray-300">Presiona "Escanear todos los formatos".</p>}
              </div>
            ) : (
              <table className="w-full text-xs min-w-[1100px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-gray-400 uppercase tracking-widest text-[10px]">
                    {['Descripción','Cód. Barras','Formato','Cadena','PVP Borden','P. Lista (Orig.)','P. Oferta','Dif %','Estado','Fecha','URL'].map(h => (
                      <th key={h} className="text-left py-2.5 px-3 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rowsFiltradas.map((r, i) => {
                    const estadoCls = r.estado === 'ok'           ? 'bg-green-100 text-green-700'
                                    : r.estado === 'diferencia'   ? 'bg-amber-100 text-amber-700'
                                    : r.estado === 'no_encontrado'? 'bg-gray-100 text-gray-500'
                                    : 'bg-red-100 text-red-600'
                    const dif = r.diferencia_pct != null ? Number(r.diferencia_pct) : null
                    const difColor  = dif === null       ? 'text-gray-400'
                                    : Math.abs(dif) > 10 ? 'text-red-600 font-bold'
                                    : Math.abs(dif) > 5  ? 'text-amber-600 font-semibold'
                                    : 'text-green-600'
                    return (
                      <tr key={r.id} className={`border-b border-gray-50 ${i%2===0?'':'bg-gray-50/40'}`}>
                        <td className="py-2 px-3 max-w-[200px]">
                          <p className="font-medium text-gray-700 truncate">{r.descripcion}</p>
                          <p className="text-gray-400 font-mono text-[10px]">{r.sku}</p>
                        </td>
                        <td className="py-2 px-3 font-mono text-gray-400 text-[10px]">{fmtUPC(r.codigo_barras)}</td>
                        <td className="py-2 px-3 text-gray-600">{r.formato}</td>
                        <td className="py-2 px-3 text-gray-400 text-[10px]">{r.cadena}</td>
                        <td className="py-2 px-3 text-right text-gray-600">{r.precio_pvp != null ? Number(r.precio_pvp).toFixed(2) : '—'}</td>
                        <td className="py-2 px-3 text-right font-semibold text-gray-800">{r.precio_walmart != null ? Number(r.precio_walmart).toFixed(2) : '—'}</td>
                        <td className={`py-2 px-3 text-right text-[11px] ${
                          r.precio_oferta != null && r.precio_walmart != null && Number(r.precio_oferta) < Number(r.precio_walmart)
                            ? 'text-amber-600 font-semibold'
                            : 'text-gray-400'
                        }`}>
                          {r.precio_oferta != null ? Number(r.precio_oferta).toFixed(2) : '—'}
                        </td>
                        <td className={`py-2 px-3 text-right ${difColor}`}>
                          {dif != null ? (dif >= 0 ? '+' : '') + dif.toFixed(1) + '%' : '—'}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${estadoCls}`}>
                            {r.estado === 'ok' ? 'OK' : r.estado === 'diferencia' ? 'DIFERENCIA' : r.estado === 'no_encontrado' ? 'NO ENCONTRADO' : 'ERROR'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-gray-400 whitespace-nowrap">
                          {new Date(r.fecha_captura).toLocaleDateString('es-CR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                        </td>
                        <td className="py-2 px-3">
                          {r.url_producto ? (
                            <a href={r.url_producto} target="_blank" rel="noopener noreferrer"
                              className="text-blue-500 hover:underline text-[10px]">Ver →</a>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
            )
          })()}
        </div>
      )}

      {/* ══ TAB ANÁLISIS ═════════════════════════════════════════════════════════ */}
      {tab === 'analisis' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-3 flex-wrap">
              <select value={anPaises[0]??''} onChange={e => setAnPaises(e.target.value ? [e.target.value] : [])} className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none">
                <option value="">Todos los países</option>
                {PAISES.map(p => <option key={p}>{p}</option>)}
              </select>
              <select value={anCats[0]??''} onChange={e => setAnCats(e.target.value ? [e.target.value] : [])} className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none">
                <option value="">Todas las categorías</option>
                {CATS.map(c => <option key={c}>{c}</option>)}
              </select>
              <button onClick={() => cargarAnalisis(anPaises, anCats)}
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-600 hover:bg-gray-200">
                <RefreshCw size={13} className={loadingAn ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
            {loadingAn ? (
              <div className="h-32 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
            ) : (
              <table className="w-full text-xs min-w-[900px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-gray-400 uppercase tracking-widest text-[10px]">
                    {['SKU / Descripción','Cat.','Cód. Barras','P. 2024','P. 2025','Var %','P. 2026','Elasticidad','Und. 2026','Venta 2026'].map(h => (
                      <th key={h} className="text-left py-3 px-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analisisRows.map((r: any, i) => (
                    <tr key={r.sku} className={`border-b border-gray-50 hover:bg-amber-50/20 ${i%2===0?'':'bg-gray-50/30'}`}>
                      <td className="py-2 px-3">
                        <p className="font-medium text-gray-700 truncate max-w-[200px]">{r.descripcion||r.sku}</p>
                        <p className="text-gray-400 font-mono">{r.sku}</p>
                      </td>
                      <td className="py-2 px-3 text-gray-500">{r.categoria}</td>
                      <td className="py-2 px-3 text-gray-400 font-mono text-[10px]">{r.codigo_barras??'—'}</td>
                      <td className="py-2 px-3 text-right text-gray-400">{r.precio_2024?'$'+r.precio_2024:'—'}</td>
                      <td className="py-2 px-3 text-right text-gray-600">{r.precio_2025?'$'+r.precio_2025:'—'}</td>
                      <td className={`py-2 px-3 text-right font-semibold ${r.var_precio===null?'text-gray-400':r.var_precio>=3?'text-green-600':r.var_precio<=-3?'text-red-500':'text-amber-600'}`}>
                        {r.var_precio===null?'—':(r.var_precio>=0?'+':'')+r.var_precio?.toFixed(1)+'%'}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-gray-800">{r.precio_2026?'$'+r.precio_2026:'—'}</td>
                      <td className={`py-2 px-3 text-right font-semibold ${r.elasticidad===null?'text-gray-400':r.elasticidad<-1?'text-red-500':r.elasticidad>1?'text-green-600':'text-amber-600'}`}>
                        {r.elasticidad!==null?r.elasticidad?.toFixed(2):'—'}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-500">{r.u2026?.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right text-gray-600">{r.v2026>0?'$'+(r.v2026/1000).toFixed(1)+'K':'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
