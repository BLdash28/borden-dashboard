'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { TrendingUp, TrendingDown, Minus, RefreshCw } from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Customized, LabelList,
} from 'recharts'
import FiltroMulti from '@/components/ui/FiltroMulti'

const STORAGE_KEY = 'bl_sellin_res_v2'
type StoredFilters = { ano: number; meses: string[]; paises: string[]; cats: string[]; subcats: string[]; clientes: string[]; proveedores: string[]; tipos: string[] }
function saveStorage(s: StoredFilters) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch {}
}

const MESES      = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const MESES_FULL = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const MESES_OPT  = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: MESES[i + 1] }))
const TIPOS_OPT  = [
  { value: 'REGULAR',                 label: 'BL FOODS' },
  { value: 'LICENCIAMIENTO_HELADOS',  label: 'LICENCIAMIENTO HELADOS' },
  { value: 'LICENCIAMIENTO_COLOMBIA', label: 'LICENCIAMIENTO COLOMBIA' },
]

const fmt = (v: number) => {
  if (!isFinite(v)) return '$0'
  if (v >= 1e6) return '$' + (v/1e6).toFixed(2) + 'M'
  if (v >= 1e3) return '$' + (v/1e3).toFixed(1) + 'K'
  return '$' + v.toFixed(2)
}
const fmtFull = (v: number) =>
  '$' + (isFinite(v) ? v : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtN = (v: number) => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(0)+'K' : v.toFixed(0)
const fmtLblK = (v: any) => {
  const n = Number(v); if (!isFinite(n) || n === 0) return ''
  if (Math.abs(n) >= 1e9) return '$' + (n/1e9).toFixed(1) + 'MM'
  if (Math.abs(n) >= 1e6) return '$' + (n/1e6).toFixed(0) + 'M'
  if (Math.abs(n) >= 1e3) return '$' + (n/1e3).toFixed(0) + 'K'
  return '$' + Math.round(n)
}

interface Kpi { valor: number; delta: number }
interface KpiData {
  ingresos: Kpi; cajas: Kpi; margen: Kpi
  margen_pct: number; margen_pct_delta: number
  clientes: number; skus: number
  libras?: Kpi
  litros?: Kpi
}

const COLORS = { 2025: '#60a5fa', proyeccion: '#94a3b8', 2026: '#c8873a' }

function DeltaBadge({ delta, isPct = false }: { delta: number; isPct?: boolean }) {
  const pos = delta > 0.5
  const neg = delta < -0.5
  const cls = pos ? 'text-green-600 bg-green-50' : neg ? 'text-red-500 bg-red-50' : 'text-gray-400 bg-gray-50'
  const Icon = pos ? TrendingUp : neg ? TrendingDown : Minus
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>
      <Icon size={10} />
      {delta > 0 ? '+' : ''}{delta.toFixed(1)}{isPct ? 'pp' : '%'}
    </span>
  )
}

function LineMonthDividers(props: any) {
  const xAxis = props.xAxisMap?.[0]
  const yAxis = props.yAxisMap?.[0]
  if (!xAxis?.scale) return null
  const domain: string[] = xAxis.scale.domain?.() ?? []
  const step: number = xAxis.scale.step?.() ?? 0
  const mt = props.margin?.top ?? 0
  const y2 = yAxis?.scale ? yAxis.scale(0) : (props.height ?? 0) - (props.margin?.bottom ?? 0)
  return (
    <g>
      {domain.map((val: string) => {
        const x = xAxis.scale(val) ?? 0
        return <line key={val} x1={x} x2={x} y1={mt} y2={y2} stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 3" />
      })}
    </g>
  )
}

function MonthDividers(props: any) {
  const xAxis = props.xAxisMap?.[0]
  const yAxis = props.yAxisMap?.[0]
  if (!xAxis?.scale) return null
  const domain: number[] = xAxis.scale.domain?.() ?? []
  const bw: number       = xAxis.scale.bandwidth?.() ?? 0
  const mt = props.margin?.top ?? 0
  // y2 = pixel position of value 0 on the Y axis (the $0K line)
  const y2 = yAxis?.scale ? yAxis.scale(0) : (props.height ?? 0) - (props.margin?.bottom ?? 0)
  return (
    <g>
      {domain.slice(0, -1).map((val: number) => {
        const x = (xAxis.scale(val) ?? 0) + bw
        return <line key={val} x1={x} x2={x} y1={mt} y2={y2} stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 3" />
      })}
    </g>
  )
}

export default function SellInResumen() {
  const [ano,       setAno]       = useState(2026)
  const [meses,     setMeses]     = useState<string[]>([])
  const [paises,    setPaises]    = useState<string[]>([])
  const [cats,      setCats]      = useState<string[]>([])
  const [subcats,   setSubcats]   = useState<string[]>([])
  const [clientes,    setClientes]    = useState<string[]>([])
  const [proveedores, setProveedores] = useState<string[]>([])
  const [tipos,       setTipos]       = useState<string[]>(['REGULAR'])
  const initDone = useRef(false)

  // Opciones dinámicas (fetched del endpoint sell-in/opts)
  const [paisOpts,       setPaisOpts]       = useState<string[]>([])
  const [catOpts,        setCatOpts]        = useState<string[]>([])
  const [subcatOpts,     setSubcatOpts]     = useState<string[]>([])
  const [clienteOpts,    setClienteOpts]    = useState<string[]>([])
  const [proveedorOpts,  setProveedorOpts]  = useState<string[]>([])

  const [kpi,     setKpi]     = useState<KpiData | null>(null)
  const [mensual, setMensual] = useState<any[]>([])
  const [ytd,     setYtd]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async (a: number, ms: string[], ps: string[], cs: string[], scs: string[], cls: string[], prs: string[], ts: string[]) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ ano: String(a) })
      if (ms.length)  qs.set('mes',           ms.join(','))
      if (ps.length)  qs.set('pais',          ps.join(','))
      if (cs.length)  qs.set('categoria',     cs.join(','))
      if (scs.length) qs.set('subcategoria',  scs.join(','))
      if (cls.length) qs.set('cliente',       cls.join(','))
      if (prs.length) qs.set('proveedor',     prs.join(','))
      if (ts.length)  qs.set('tipo_negocio',  ts.join(','))

      const [kR, eR] = await Promise.all([
        fetch('/api/comercial/sell-in/kpis?' + qs).then(r => r.ok ? r.json() : {}) as Promise<any>,
        fetch('/api/comercial/sell-in/evolucion?' + qs).then(r => r.ok ? r.json() : {}) as Promise<any>,
      ])
      if (kR.kpis) setKpi(kR.kpis)
      if (eR.mensual) setMensual(eR.mensual)
      if (eR.ytd)     setYtd(eR.ytd)
    } catch {
      // mostrar vacío en lugar de quedar cargando
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (initDone.current) return
    initDone.current = true
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const s = JSON.parse(raw)
        if (s.ano)              setAno(s.ano)
        if (s.meses?.length)    setMeses(s.meses)
        if (s.paises?.length)   setPaises(s.paises)
        if (s.cats?.length)     setCats(s.cats)
        if (s.subcats?.length)  setSubcats(s.subcats)
        if (s.clientes?.length)    setClientes(s.clientes)
        if (s.proveedores?.length) setProveedores(s.proveedores)
        if (s.tipos?.length)       setTipos(s.tipos)
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { cargar(ano, meses, paises, cats, subcats, clientes, proveedores, tipos) }, [cargar, ano, meses, paises, cats, subcats, clientes, proveedores, tipos])

  // ── Fetch opciones dinámicas (sell-in/opts) ────────────────────────────
  // País: siempre disponible
  useEffect(() => {
    fetch('/api/ventas/sell-in/opts?dim=pais').then(r => r.json()).then(j => setPaisOpts(j.opts ?? []))
  }, [])

  // Categoría: filtrada por país
  useEffect(() => {
    const p = new URLSearchParams({ dim: 'categoria' })
    if (paises.length) p.set('paises', paises.join(','))
    fetch('/api/ventas/sell-in/opts?' + p).then(r => r.json()).then(j => setCatOpts(j.opts ?? []))
  }, [paises])

  // Subcategoría: SIEMPRE disponible — si hay país/categoría filtra opciones, si no muestra todas
  useEffect(() => {
    const p = new URLSearchParams({ dim: 'subcategoria' })
    if (cats.length)   p.set('categorias', cats.join(','))
    if (paises.length) p.set('paises', paises.join(','))
    fetch('/api/ventas/sell-in/opts?' + p).then(r => r.json()).then(j => {
      const opts = j.opts ?? []
      setSubcatOpts(opts)
      setSubcats(prev => prev.filter(v => opts.includes(v)))
    })
  }, [paises, cats])

  // Cliente: SIEMPRE disponible — si hay país, filtra; si no, muestra todos
  useEffect(() => {
    const p = new URLSearchParams({ dim: 'cliente' })
    if (paises.length) p.set('paises', paises.join(','))
    fetch('/api/ventas/sell-in/opts?' + p).then(r => r.json()).then(j => {
      const opts = j.opts ?? []
      setClienteOpts(opts)
      setClientes(prev => prev.filter(v => opts.includes(v)))
    })
  }, [paises])

  // Proveedor: SIEMPRE disponible — si hay país, filtra; si no, muestra todos
  useEffect(() => {
    const p = new URLSearchParams({ dim: 'proveedor' })
    if (paises.length) p.set('paises', paises.join(','))
    fetch('/api/ventas/sell-in/opts?' + p).then(r => r.json()).then(j => {
      const opts = j.opts ?? []
      setProveedorOpts(opts)
      setProveedores(prev => prev.filter(v => opts.includes(v)))
    })
  }, [paises])

  const persistir = (partial: Partial<StoredFilters>) => {
    saveStorage({ ano, meses, paises, cats, subcats, clientes, proveedores, tipos, ...partial })
  }

  const handlePaisChange = (ps: string[]) => {
    setPaises(ps)
    if (ps.includes('CO')) {
      const newTipos = tipos.includes('LICENCIAMIENTO_COLOMBIA') ? tipos : [...tipos, 'LICENCIAMIENTO_COLOMBIA']
      const newCats  = cats.includes('Quesos') ? cats : [...cats, 'Quesos']
      setTipos(newTipos)
      setCats(newCats)
      persistir({ paises: ps, tipos: newTipos, cats: newCats })
    } else {
      const newTipos = tipos.filter(t => t !== 'LICENCIAMIENTO_COLOMBIA')
      const newCats  = cats.filter(c => c !== 'Quesos')
      setTipos(newTipos)
      setCats(newCats)
      persistir({ paises: ps, tipos: newTipos, cats: newCats })
    }
  }

  const limpiarFiltros = () => {
    setMeses([]); setPaises([]); setCats([]); setSubcats([]); setClientes([]); setProveedores([])
    setTipos(['REGULAR'])
    saveStorage({ ano, meses: [], paises: [], cats: [], subcats: [], clientes: [], proveedores: [], tipos: ['REGULAR'] })
  }

  // Transform ytd for recharts
  const ytdData = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    const row: any = { mes: MESES[m] }
    ytd.forEach(s => { row[String(s.ano)] = s.vals[i] ?? null })
    return row
  })

  const prevKey = String(ano - 1)
  const currKey = String(ano)

  // Escala del eje Y — ticks cada $500,000
  const { ytdYMax, ytdTicks } = (() => {
    let max = 0
    for (const d of ytdData) {
      if (d[prevKey]       != null) max = Math.max(max, d[prevKey])
      if (d[currKey]       != null) max = Math.max(max, d[currKey])
      if (d['proyeccion']  != null) max = Math.max(max, d['proyeccion'])
    }
    if (max === 0) return { ytdYMax: undefined, ytdTicks: undefined }
    const step    = 500_000
    const ceiling = Math.ceil(max * 1.05 / step) * step
    const ticks   = Array.from({ length: Math.floor(ceiling / step) + 1 }, (_, i) => i * step)
    return { ytdYMax: ceiling, ytdTicks: ticks }
  })()

  const kpiCards = kpi ? [
    { label: 'Venta Neta YTD',    value: '$' + kpi.ingresos.valor.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), delta: kpi.ingresos.delta, icon: '💰', sub: null },
    { label: 'Utilidad Bruta YTD', value: '$' + kpi.margen.valor.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), delta: kpi.margen.delta, icon: '💵', sub: null },
    { label: 'Margen Bruto Prom. YTD', value: kpi.margen_pct.toFixed(1) + '%', delta: kpi.margen_pct_delta, icon: '📊', sub: null, isPct: true },
    { label: 'Cajas YTD',          value: Math.round(kpi.cajas.valor).toLocaleString('en-US'), delta: kpi.cajas.delta, icon: '📦', sub: null },
    { label: 'Libras Totales (Quesos) YTD', value: Math.round(kpi.libras?.valor ?? 0).toLocaleString('en-US') + ' lb', delta: kpi.libras?.delta ?? 0, icon: '⚖️', sub: null },
    { label: 'Litros Totales (Leches) YTD', value: Math.round(kpi.litros?.valor ?? 0).toLocaleString('en-US') + ' L',  delta: kpi.litros?.delta ?? 0, icon: '🥛', sub: null },
  ] : []

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Sell In</p>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800">Resumen Ejecutivo</h1>
          <p className="text-xs md:text-sm text-gray-400 mt-0.5">Comparativo vs año anterior · Facturación propia</p>
        </div>
        <button onClick={() => cargar(ano, meses, paises, cats, subcats, clientes, proveedores, tipos)}
          className="flex items-center gap-2 px-3 md:px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {/* Filtros — mismo formato que Sellout */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Filtros</p>
          <button onClick={limpiarFiltros} className="text-xs text-gray-400 hover:text-gray-600 underline">↺ Limpiar todo</button>
        </div>

        {/* 4 primeros arriba (Año/Mes/País/Categoría), 4 abajo (Subcategoría/Cliente/Proveedor/Tipo Negocio) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <div
              className="text-[10px] uppercase tracking-widest font-medium mb-1.5"
              style={{ color: 'var(--t3)' }}
            >
              Año
            </div>
            <select
              value={ano}
              onChange={e => {
                const v = Number(e.target.value)
                setAno(v)
                persistir({ ano: v })
              }}
              className="w-full px-3 py-2.5 rounded-lg border text-[13px] transition-all focus:outline-none cursor-pointer"
              style={{
                background: 'var(--bg)',
                borderColor: 'var(--border)',
                color: 'var(--acc)',
                fontWeight: 600,
                minHeight: 42,
              }}
            >
              {[2024, 2025, 2026].map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <FiltroMulti label="Mes" options={MESES_OPT} value={meses} onChange={v => { setMeses(v); persistir({ meses: v }) }} placeholder="Todos" className="" />
          <FiltroMulti label="País" options={paisOpts.map(p => ({ value: p }))} value={paises} onChange={handlePaisChange} placeholder="Todos los países" className="" />
          <FiltroMulti label="Tipo Negocio" options={TIPOS_OPT} value={tipos} onChange={ts => {
            setTipos(ts)
            if (ts.includes('LICENCIAMIENTO_COLOMBIA')) {
              const newCats = cats.includes('Quesos') ? cats : [...cats, 'Quesos']
              setCats(newCats)
              persistir({ cats: newCats, tipos: ts })
            } else {
              persistir({ tipos: ts })
            }
          }} placeholder="Todos" className="" />
          <FiltroMulti label="Categoría" options={catOpts.map(c => ({ value: c }))} value={cats}
            onChange={cs => { setCats(cs); persistir({ cats: cs }) }} placeholder="Todas las categorías" className="" />
          <FiltroMulti label="Subcategoría" options={subcatOpts.map(s => ({ value: s }))} value={subcats}
            onChange={ss => { setSubcats(ss); persistir({ subcats: ss }) }}
            placeholder="Todas" className="" />
          <FiltroMulti label="Cliente" options={clienteOpts.map(c => ({ value: c }))} value={clientes}
            onChange={cls => { setClientes(cls); persistir({ clientes: cls }) }}
            placeholder="Todos" className="" />
          <FiltroMulti label="Proveedor" options={proveedorOpts.map(p => ({ value: p }))} value={proveedores}
            onChange={ps => { setProveedores(ps); persistir({ proveedores: ps }) }}
            placeholder="Todos" className="" />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
        {loading
          ? Array(6).fill(0).map((_,i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 md:p-5 animate-pulse">
                <div className="h-3 bg-gray-100 rounded w-2/3 mb-3"/>
                <div className="h-7 bg-gray-100 rounded w-1/2 mb-2"/>
                <div className="h-4 bg-gray-100 rounded w-1/3"/>
              </div>
            ))
          : kpiCards.map(k => (
              <div key={k.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 md:p-5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] md:text-xs font-semibold text-gray-400 uppercase tracking-widest leading-tight">{k.label}</p>
                  <span className="text-base md:text-lg">{k.icon}</span>
                </div>
                <p className="text-lg md:text-2xl font-bold text-gray-800 mb-1.5 md:mb-2 break-all">{k.value}</p>
                <div className="flex items-center gap-1.5 text-[11px] text-gray-400 flex-wrap">
                  <DeltaBadge delta={k.delta} isPct={!!(k as any).isPct} />
                  <span>vs {ano - 1}</span>
                  {k.sub && <span className="text-gray-300">·</span>}
                  {k.sub && <span>{k.sub}</span>}
                </div>
              </div>
            ))
        }
      </div>

      {/* Info vacía */}
      {!loading && kpi && kpi.ingresos.valor === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center text-sm text-blue-600">
          Sin datos de Sell-In aún. Carga facturas con <code className="font-mono bg-blue-100 px-1 rounded">cargar_sellin.py</code>.
        </div>
      )}

      {/* Gráfico de barras: mensual por año */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 md:p-5">
        <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-bold text-gray-800">Venta Neta Mensual</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Comparativo {ano - 1} vs Proyección {ano} vs Real {ano}</p>
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"/> {prevKey}</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-400"/> Proyección {ano}</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"/> {currKey}</span>
          </div>
        </div>
        {loading
          ? <div className="h-52 md:h-64 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
          : (
            <div className="h-[240px] md:h-[280px] mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mensual} margin={{ top: 18, right: 10, left: 0, bottom: 0 }} barCategoryGap="28%" barGap={8}>
                <defs>
                  <linearGradient id="gradSellinResPrev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#3b82f6" stopOpacity={1}/>
                    <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.85}/>
                  </linearGradient>
                  <linearGradient id="gradSellinResProy" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#94a3b8" stopOpacity={1}/>
                    <stop offset="100%" stopColor="#cbd5e1" stopOpacity={0.85}/>
                  </linearGradient>
                  <linearGradient id="gradSellinResCurr" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#f59e0b" stopOpacity={1}/>
                    <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.85}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="mes" tickFormatter={m => MESES[m]} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => '$'+(v/1000).toFixed(0)+'K'} tick={{ fontSize: 11, fill: '#94a3b8' }} width={60} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v: number) => fmtFull(v)}
                  labelFormatter={m => MESES_FULL[Number(m)]}
                  cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                  contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                />
                <Bar dataKey={prevKey}     name={prevKey}             fill="url(#gradSellinResPrev)"  radius={[8,8,0,0]} maxBarSize={26}>
                  <LabelList dataKey={prevKey} position="top" offset={8} formatter={fmtLblK}
                    style={{ fontSize: 11, fill: '#1e40af', fontWeight: 700 }} />
                </Bar>
                <Bar dataKey="proyeccion"  name={`Proyección ${ano}`} fill="url(#gradSellinResProy)"  radius={[8,8,0,0]} maxBarSize={26}>
                  <LabelList dataKey="proyeccion" position="top" offset={8} formatter={fmtLblK}
                    style={{ fontSize: 11, fill: '#475569', fontWeight: 700 }} />
                </Bar>
                <Bar dataKey={currKey}     name={currKey}             fill="url(#gradSellinResCurr)"  radius={[8,8,0,0]} maxBarSize={26}>
                  <LabelList dataKey={currKey} position="top" offset={8} formatter={fmtLblK}
                    style={{ fontSize: 11, fill: '#92400e', fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>
          )
        }
      </div>

      {/* Gráfico de líneas: YTD acumulado */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 md:p-5">
        <h3 className="text-xs md:text-sm font-semibold text-gray-700 mb-0.5 md:mb-1">Venta Acumulada</h3>
        <p className="text-xs text-gray-400 mb-3 md:mb-4">Suma corrida mes a mes</p>
        {loading
          ? <div className="h-52 md:h-80 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
          : (
            <div className="h-[220px] md:h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={ytdData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradSellinYtdCurr" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={COLORS[2026]} stopOpacity={0.4}/>
                    <stop offset="60%"  stopColor={COLORS[2026]} stopOpacity={0.1}/>
                    <stop offset="100%" stopColor={COLORS[2026]} stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="gradSellinYtdPrev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={COLORS[2025]} stopOpacity={0.25}/>
                    <stop offset="100%" stopColor={COLORS[2025]} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={v => v >= 1_000_000 ? '$' + (v / 1_000_000).toFixed(1) + 'M' : '$' + (v / 1_000).toFixed(0) + 'K'}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  width={60} axisLine={false} tickLine={false}
                  domain={[0, ytdYMax ?? 'auto']}
                  ticks={ytdTicks}
                />
                <Tooltip content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const vPrev = payload.find(p => p.dataKey === prevKey)?.value as number | null
                  const vCurr = payload.find(p => p.dataKey === currKey)?.value as number | null
                  const pct = vPrev && vCurr && vPrev > 0 ? ((vCurr - vPrev) / vPrev) * 100 : null
                  return (
                    <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-xs">
                      <p className="font-semibold text-gray-700 mb-1">{MESES_FULL[MESES.indexOf(label)] ?? label}</p>
                      {payload.map((p: any) => (
                        <p key={p.dataKey} style={{ color: p.stroke }} className="leading-5">
                          {p.name}: {p.value != null ? fmtFull(p.value) : '—'}
                          {p.dataKey === currKey && pct != null && (
                            <span className={`ml-1.5 font-semibold ${pct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              ({pct >= 0 ? '+' : ''}{pct.toFixed(1)}% vs {ano - 1})
                            </span>
                          )}
                        </p>
                      ))}
                    </div>
                  )
                }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey={prevKey}      name={prevKey}             stroke={COLORS[2025]}      strokeWidth={2}
                      fill="url(#gradSellinYtdPrev)" dot={false} activeDot={{ r: 4 }} connectNulls={false} />
                <Line type="monotone" dataKey="proyeccion"   name={`Proyección ${ano}`} stroke={COLORS.proyeccion} strokeWidth={2} dot={false} connectNulls={false} strokeDasharray="5 3" />
                <Area type="monotone" dataKey={currKey}      name={currKey}             stroke={COLORS[2026]}      strokeWidth={2.5}
                      fill="url(#gradSellinYtdCurr)" dot={false}
                      activeDot={{ r: 5, strokeWidth: 2, fill: '#fff', stroke: COLORS[2026] }} connectNulls={false} />
                <Customized component={LineMonthDividers} />
              </AreaChart>
            </ResponsiveContainer>
            </div>
          )
        }
      </div>

    </div>
  )
}
