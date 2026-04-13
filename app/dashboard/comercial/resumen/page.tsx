'use client'
import { showError } from '@/lib/toast'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import {
  RefreshCw, TrendingUp, ShoppingCart, DollarSign, Calendar,
  X, ArrowUpRight, ArrowDownRight, Info,
} from 'lucide-react'
import BarChartPro from '@/components/dashboard/BarChartPro'
import LineChartPro from '@/components/dashboard/LineChartPro'
import DonutChartPro from '@/components/dashboard/DonutChartPro'
import { useDashboardFilters, MESES_LABEL } from '@/lib/context/DashboardFilters'
import GlobalFilterBar from '@/components/dashboard/GlobalFilterBar'
import {
  LineChart, Line, BarChart, Bar, Cell,
  ComposedChart, Area, ReferenceLine,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

const COLORS = ['#c8873a','#2a7a58','#3a6fa8','#6b4fa8','#c0402f','#2a8a8a']
const AMBER = '#f59e0b'
const VIOLET = '#8b5cf6'
const TEAL  = '#0d9488'

const fmt = (n: number) =>
  isNaN(n) || !isFinite(n) ? '$0' :
  n >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'M' :
  n >= 1e3 ? '$' + (n / 1e3).toFixed(1) + 'K' :
  '$' + n.toFixed(0)

const fmtP = (n: number) => isNaN(n) || !n ? '—' : '$' + n.toFixed(2)

const fmtFull = (n: number) =>
  isNaN(n) || !isFinite(n) ? '$0.00' :
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const toNum = (v: any): number => {
  const n = parseFloat(String(v))
  return isNaN(n) ? 0 : n
}

// ── Interfaces ──────────────────────────────────────────
interface EvoRow     { label: string; precio: number; unidades: number; variacion: number | null }
interface PeriodCell { key: string; label: string; hasData: boolean; valor: number; unidades: number }

// ── Helpers UI ──────────────────────────────────────────
function VarBadge({ v }: { v: number | null }) {
  if (v === null) return <span className="text-[11px]" style={{ color: 'var(--t3)' }}>—</span>
  const pos = v >= 0
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-bold"
      style={{ color: pos ? '#10b981' : '#ef4444' }}>
      {pos ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
      {Math.abs(v).toFixed(1)}%
    </span>
  )
}

function ModalTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const precio  = payload.find((p: any) => p.dataKey === 'precio')
  const variac  = payload.find((p: any) => p.dataKey === 'variacion')
  return (
    <div className="rounded-xl px-3 py-2.5 shadow-2xl min-w-[150px]"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--t3)' }}>{label}</p>
      {precio && (
        <div className="flex items-center justify-between gap-4 mb-1">
          <span className="text-[10px]" style={{ color: 'var(--t3)' }}>Precio prom.</span>
          <span className="text-[13px] font-bold" style={{ color: AMBER }}>{fmtP(precio.value)}</span>
        </div>
      )}
      {variac && variac.value !== null && variac.value !== undefined && (
        <div className="flex items-center justify-between gap-4">
          <span className="text-[10px]" style={{ color: 'var(--t3)' }}>Variación</span>
          <span className="text-[13px] font-bold" style={{ color: variac.value >= 0 ? '#10b981' : '#ef4444' }}>
            {variac.value >= 0 ? '+' : ''}{variac.value.toFixed(1)}%
          </span>
        </div>
      )}
      {!precio && !variac && payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <span className="text-[10px]" style={{ color: 'var(--t3)' }}>{p.name}</span>
          <span className="text-[13px] font-bold" style={{ color: p.fill ?? p.color ?? AMBER }}>
            {typeof p.value === 'number' ? fmtP(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

function ChartSkeleton() {
  return <div className="h-[220px] flex items-center justify-center animate-pulse rounded-lg" style={{ background: 'var(--border)' }} />
}
function ChartEmpty() {
  return <div className="h-[220px] flex items-center justify-center text-[12px]" style={{ color: 'var(--t3)' }}>Sin datos</div>
}

// ══════════════════════════════════════════════════════════
//  PÁGINA PRINCIPAL
// ══════════════════════════════════════════════════════════
export default function ResumenPage() {
  const { fPaises, fCats, fSubcats, fClientes, fFormatos, fAnos, fMeses, buildParams } = useDashboardFilters()

  const [kpi,           setKpi]          = useState<any>(null)
  const [dias,          setDias]         = useState<any[]>([])
  const [meses,         setMeses]        = useState<any[]>([])
  const [categorias,    setCategorias]   = useState<any[]>([])
  const [paises,        setPaises]       = useState<any[]>([])
  const [subcategorias, setSubcategorias] = useState<any[]>([])
  const [clientes,      setClientes]     = useState<any[]>([])
  const [topSkus,       setTopSkus]      = useState<any[]>([])
  const [skuSort, setSkuSort] = useState<{ key: 'valor' | 'unidades'; dir: 'asc' | 'desc' }>({ key: 'valor', dir: 'desc' })
  const [loading,       setLoading]      = useState(true)
  const [modo,          setModo]         = useState<'mes' | 'ano' | 'todos'>('todos')

  // Chart range slider (local, index-based)
  const [sliderRange, setSliderRange] = useState<[number, number]>([0, 9999])

  // Chart view toggle
  const [chartView, setChartView] = useState<'mensual' | 'anual'>('mensual')

  // Modal state
  const [activeModal, setActiveModal] = useState<'ventas' | 'unidades' | 'precio' | 'meses' | null>(null)
  const [modalTab,    setModalTab]    = useState<'chart' | 'table'>('chart')

  const debounceT = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ESC cierra modal
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setActiveModal(null) }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [])

  const cargar = useCallback((p: URLSearchParams) => {
    setLoading(true)

    fetch('/api/ventas/resumen?' + p.toString())
      .then(r => r.json())
      .then(j => {
        if (j.error) { showError(j.error || 'Error al cargar datos'); return }
        setKpi(j.kpi)
        const diasRaw = (j.dias || []).map((d: any) => ({
          dia: toNum(d.dia),
          ventas_valor:    toNum(d.ventas_valor),
          ventas_unidades: toNum(d.ventas_unidades),
        })).sort((a: any, b: any) => a.dia - b.dia)
        setDias(diasRaw)
        const mesesRaw = (j.meses || []).map((m: any) => ({
          ano: toNum(m.ano), mes: toNum(m.mes),
          ventas_valor:    toNum(m.ventas_valor),
          ventas_unidades: toNum(m.ventas_unidades),
        })).sort((a: any, b: any) => a.ano !== b.ano ? a.ano - b.ano : a.mes - b.mes)
        const multiAnio = mesesRaw.length > 0 && mesesRaw.some((m: any) => m.ano !== mesesRaw[0].ano)
        const mesesLabeled = mesesRaw.map((m: any) => ({
          ...m,
          mes_label: multiAnio
            ? (MESES_LABEL[m.mes] || String(m.mes)) + ' ' + String(m.ano).slice(2)
            : (MESES_LABEL[m.mes] || String(m.mes)),
        }))
        setMeses(mesesLabeled)
        setCategorias((j.categorias    || []).map((c: any) => ({ ...c, ventas_valor: toNum(c.ventas_valor) })))
        setPaises(    (j.paises        || []).map((p: any) => ({ ...p, ventas_valor: toNum(p.ventas_valor) })))
        setSubcategorias(j.subcategorias || [])
        setClientes(     j.clientes      || [])
        setTopSkus(j.top_skus || [])
        setModo(j.modo === 'ano' ? 'ano' : j.modo === 'mes' ? 'mes' : 'todos')
        // Reset slider to show all data
        const allData = diasRaw.length > 0 ? diasRaw : mesesLabeled
        setSliderRange([0, Math.max(allData.length - 1, 0)])
      })
      .finally(() => setLoading(false))
  }, [])

  // Re-fetch when any filter changes
  useEffect(() => {
    if (debounceT.current) clearTimeout(debounceT.current)
    debounceT.current = setTimeout(() => cargar(buildParams()), 300)
  }, [fPaises, fCats, fSubcats, fClientes, fFormatos, fAnos, fMeses, cargar, buildParams]) // eslint-disable-line


  // ── Métricas para drill-down ─────────────────────────
  const metrics = useMemo(() => {
    const sourceData = modo === 'mes' ? dias : meses
    if (!sourceData.length || !kpi) return null

    const periodoLabel = modo === 'mes' ? 'Días' : 'Meses'

    // Evolución precio por período
    let prevP = 0
    const evoData: EvoRow[] = sourceData.map((d: any) => {
      const label   = modo === 'mes' ? `D${d.dia}` : d.mes_label
      const val     = toNum(d.ventas_valor)
      const uni     = toNum(d.ventas_unidades)
      const precio  = uni > 0 ? val / uni : 0
      const variacion = prevP > 0 ? ((precio - prevP) / prevP) * 100 : null
      prevP = precio
      return { label, precio, unidades: Math.round(uni), variacion }
    })

    const precios    = evoData.map(e => e.precio).filter(p => p > 0)
    const precioMin  = precios.length ? Math.min(...precios) : 0
    const precioMax  = precios.length ? Math.max(...precios) : 0
    const totalVal   = toNum(kpi.total_valor)
    const totalUni   = toNum(kpi.total_unidades)
    const precioPromedio = totalUni > 0 ? totalVal / totalUni : 0
    const varActual  = evoData.length >= 2 ? evoData[evoData.length - 1].variacion : null

    // Cobertura de períodos (con venta vs sin venta)
    const cells: PeriodCell[] = []

    if (modo === 'mes') {
      const anoN     = fAnos.length === 1 ? parseInt(fAnos[0]) : new Date().getFullYear()
      const mesN     = fMeses.length === 1 ? parseInt(fMeses[0]) : new Date().getMonth() + 1
      const totalDays = new Date(anoN, mesN, 0).getDate()
      const dataMap  = new Map(dias.map((d: any) => [d.dia, d]))
      for (let d = 1; d <= totalDays; d++) {
        const entry = dataMap.get(d)
        cells.push({
          key: String(d), label: `D${d}`, hasData: !!entry,
          valor:    entry ? toNum(entry.ventas_valor)    : 0,
          unidades: entry ? Math.round(toNum(entry.ventas_unidades)) : 0,
        })
      }
    } else if (modo === 'ano') {
      const dataMap = new Map(meses.map((m: any) => [m.mes, m]))
      for (let m = 1; m <= 12; m++) {
        const entry = dataMap.get(m)
        cells.push({
          key: String(m), label: MESES_LABEL[m] || String(m), hasData: !!entry,
          valor:    entry ? toNum(entry.ventas_valor)    : 0,
          unidades: entry ? Math.round(toNum(entry.ventas_unidades)) : 0,
        })
      }
    } else {
      // todos: generar rango de min a max mes
      if (meses.length) {
        const sorted  = [...meses].sort((a: any, b: any) => a.ano !== b.ano ? a.ano - b.ano : a.mes - b.mes)
        const dataMap = new Map(sorted.map((m: any) => [`${m.ano}-${m.mes}`, m]))
        const { ano: fa, mes: fm } = sorted[0]
        const { ano: la, mes: lm } = sorted[sorted.length - 1]
        let a = fa, m = fm
        while (a < la || (a === la && m <= lm)) {
          const key   = `${a}-${m}`
          const entry = dataMap.get(key)
          const label = (MESES_LABEL[m] || String(m)) + ' ' + String(a).slice(2)
          cells.push({ key, label, hasData: !!entry, valor: entry ? toNum(entry.ventas_valor) : 0, unidades: entry ? Math.round(toNum(entry.ventas_unidades)) : 0 })
          m++; if (m > 12) { m = 1; a++ }
        }
      }
    }

    const conVenta = cells.filter(c => c.hasData).length
    let maxStreak = 0, cur = 0, endStreak = 0
    cells.forEach(c => { if (c.hasData) { cur++; maxStreak = Math.max(maxStreak, cur) } else cur = 0 })
    for (let i = cells.length - 1; i >= 0; i--) { if (cells[i].hasData) endStreak++; else break }

    return { precioPromedio, precioMin, precioMax, varActual, evoData, conVenta, total: cells.length, cells, maxStreak, endStreak, periodoLabel }
  }, [dias, meses, kpi, modo, fAnos, fMeses])

  const openModal = (id: 'ventas' | 'unidades' | 'precio' | 'meses') => {
    setModalTab('chart')
    setActiveModal(id)
  }

  // Annual aggregation for chartView === 'anual'
  const anoData = useMemo(() => {
    const byAno: Record<number, { ano: number; mes_label: string; ventas_valor: number; ventas_unidades: number }> = {}
    meses.forEach((m: any) => {
      const a = toNum(m.ano)
      if (!byAno[a]) byAno[a] = { ano: a, mes_label: String(a), ventas_valor: 0, ventas_unidades: 0 }
      byAno[a].ventas_valor    += toNum(m.ventas_valor)
      byAno[a].ventas_unidades += toNum(m.ventas_unidades)
    })
    const sorted = Object.values(byAno).sort((a, b) => a.ano - b.ano)
    return sorted.map((row, i) => ({
      ...row,
      variacion: i === 0 ? null : (() => {
        const prev = sorted[i - 1].ventas_valor
        return prev > 0 ? ((row.ventas_valor - prev) / prev) * 100 : null
      })(),
    }))
  }, [meses])

  // ── Derived display ───────────────────────────────────
  const chartData  = modo === 'mes' ? dias : meses
  const chartKey   = modo === 'mes' ? 'dia' : 'mes_label'
  const chartTitle = modo === 'mes' ? 'Ventas Diarias POS' : 'Ventas Mensuales'
  const chartXFmt  = (v: any) => modo === 'mes' ? 'D' + v : String(v)

  const titulo = (() => {
    if (fAnos.length === 1 && fMeses.length === 1)
      return MESES_LABEL[Number(fMeses[0])] + ' ' + fAnos[0]
    if (fAnos.length > 0 && fMeses.length === 0)
      return fAnos.join(', ')
    if (fMeses.length > 0)
      return fMeses.map(m => MESES_LABEL[Number(m)]).join(', ') + (fAnos.length ? ' · ' + fAnos.join(', ') : '')
    return 'Todos los períodos'
  })()

  const precioActual = toNum(kpi?.total_valor) / Math.max(toNum(kpi?.total_unidades), 1)

  // ─────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] tracking-[2px] uppercase font-medium mb-1" style={{ color: 'var(--t3)' }}>
            Comercial · Visión General
          </p>
          <h1 className="text-xl font-bold" style={{ color: 'var(--t1)' }}>Resumen Ejecutivo</h1>
        </div>
        <button
          onClick={() => cargar(buildParams())}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] border transition-all hover:opacity-80"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--t3)' }}
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Global filters */}
      <GlobalFilterBar />

      {/* KPIs — 3 cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

        {/* Card 1: Ventas Totales — INTERACTIVA */}
        <div
          onClick={() => !loading && kpi && openModal('ventas')}
          title="Click para ver desglose de ventas"
          className="card p-4 relative overflow-hidden transition-all duration-200 group"
          style={{ cursor: !loading && kpi ? 'pointer' : 'default' }}
          onMouseEnter={e => { if (kpi) (e.currentTarget as HTMLElement).style.borderColor = '#c8873a80' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
        >
          <div className="absolute top-0 left-0 bottom-0 w-0.5" style={{ background: '#c8873a' }} />
          {kpi && (
            <span className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-[9px] flex items-center gap-0.5" style={{ color: '#c8873a' }}>
              <Info size={9} /> detalle
            </span>
          )}
          <div className="flex items-center justify-between mb-2">
            <p className="text-[9px] tracking-[2px] uppercase font-semibold" style={{ color: 'var(--t3)' }}>Ventas Totales USD</p>
            <DollarSign size={14} style={{ color: '#c8873a' }} />
          </div>
          <p className="text-2xl font-bold" style={{ color: 'var(--t1)' }}>
            {loading ? '...' : fmtFull(toNum(kpi?.total_valor))}
          </p>
          <p className="text-[10px] mt-1 truncate" style={{ color: 'var(--t3)' }}>{titulo}</p>
          <div className="absolute inset-0 ring-1 ring-inset ring-transparent group-hover:ring-amber-600/30 rounded-[inherit] pointer-events-none transition-all duration-200" />
        </div>

        {/* Card 2: Unidades — INTERACTIVA */}
        <div
          onClick={() => !loading && kpi && openModal('unidades')}
          title="Click para ver desglose de unidades"
          className="card p-4 relative overflow-hidden transition-all duration-200 group"
          style={{ cursor: !loading && kpi ? 'pointer' : 'default' }}
          onMouseEnter={e => { if (kpi) (e.currentTarget as HTMLElement).style.borderColor = '#3b82f680' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
        >
          <div className="absolute top-0 left-0 bottom-0 w-0.5" style={{ background: '#3b82f6' }} />
          {kpi && (
            <span className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-[9px] flex items-center gap-0.5" style={{ color: '#3b82f6' }}>
              <Info size={9} /> detalle
            </span>
          )}
          <div className="flex items-center justify-between mb-2">
            <p className="text-[9px] tracking-[2px] uppercase font-semibold" style={{ color: 'var(--t3)' }}>Ventas Unidades</p>
            <ShoppingCart size={14} style={{ color: '#3b82f6' }} />
          </div>
          <p className="text-2xl font-bold" style={{ color: 'var(--t1)' }}>
            {loading ? '...' : toNum(kpi?.total_unidades).toLocaleString()}
          </p>
          <p className="text-[10px] mt-1" style={{ color: 'var(--t3)' }}>unidades vendidas</p>
          <div className="absolute inset-0 ring-1 ring-inset ring-transparent group-hover:ring-blue-400/30 rounded-[inherit] pointer-events-none transition-all duration-200" />
        </div>

        {/* Card 3: Precio Promedio — INTERACTIVA */}
        <div
          onClick={() => !loading && metrics && openModal('precio')}
          title="Click para ver evolución de precio"
          className="card p-4 relative overflow-hidden transition-all duration-200 group"
          style={{
            cursor: !loading && metrics ? 'pointer' : 'default',
          }}
          onMouseEnter={e => { if (metrics) (e.currentTarget as HTMLElement).style.borderColor = AMBER + '80' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
        >
          <div className="absolute top-0 left-0 bottom-0 w-0.5" style={{ background: AMBER }} />

          {/* Hint */}
          {metrics && (
            <span className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-[9px] flex items-center gap-0.5" style={{ color: AMBER }}>
              <Info size={9} /> detalle
            </span>
          )}

          <div className="flex items-center justify-between mb-2">
            <p className="text-[9px] tracking-[2px] uppercase font-semibold" style={{ color: 'var(--t3)' }}>Precio Promedio</p>
            <TrendingUp size={14} style={{ color: AMBER }} />
          </div>
          <p className="text-2xl font-bold" style={{ color: 'var(--t1)' }}>
            {loading ? '...' : fmtP(precioActual)}
          </p>
          <div className="flex items-center justify-between mt-1">
            <p className="text-[10px]" style={{ color: 'var(--t3)' }}>por unidad</p>
            {!loading && metrics && <VarBadge v={metrics.varActual} />}
          </div>

          {/* Hover glow */}
          <div className="absolute inset-0 ring-1 ring-inset ring-transparent group-hover:ring-amber-400/30 rounded-[inherit] pointer-events-none transition-all duration-200" />
        </div>

      </div>

      {/* Tendencia — full width with range slider */}
      <div className="card p-5">
        <div className="flex items-start justify-between mb-0.5">
          <h3 className="font-semibold text-[13px]" style={{ color: 'var(--t1)' }}>
            {chartView === 'anual' ? 'Ventas Anuales' : chartTitle}
          </h3>
          <div className="flex rounded-lg p-0.5 flex-shrink-0 ml-3" style={{ background: 'var(--border)' }}>
            {(['mensual', 'anual'] as const).map(v => (
              <button
                key={v}
                onClick={() => { setChartView(v); setSliderRange([0, 9999]) }}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium transition-all"
                style={chartView === v
                  ? { background: 'var(--card)', color: 'var(--acc)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
                  : { color: 'var(--t3)' }}
              >
                {v === 'mensual' ? 'Mes' : 'Año'}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11px] mb-4" style={{ color: 'var(--t3)' }}>USD · {titulo}</p>
        {loading ? (
          <div className="h-[380px] flex items-center justify-center animate-pulse rounded-lg" style={{ background: 'var(--border)' }} />
        ) : chartView === 'anual' ? (
          anoData.length === 0
            ? <div className="h-[380px] flex items-center justify-center text-[12px]" style={{ color: 'var(--t3)' }}>Sin datos</div>
            : <ResponsiveContainer width="100%" height={380}>
                <ComposedChart data={anoData} margin={{ top: 16, right: 56, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="mes_label" tick={{ fontSize: 11, fill: 'var(--t3)' }} />
                  {/* Left axis: ventas absolutas */}
                  <YAxis
                    yAxisId="val"
                    orientation="left"
                    tickFormatter={fmt}
                    tick={{ fontSize: 10, fill: 'var(--t3)' }}
                    width={62}
                  />
                  {/* Right axis: variación % */}
                  <YAxis
                    yAxisId="var"
                    orientation="right"
                    tickFormatter={(v: number) => v.toFixed(0) + '%'}
                    tick={{ fontSize: 10, fill: 'var(--t3)' }}
                    width={48}
                  />
                  <Tooltip
                    content={({ active, payload, label }: any) => {
                      if (!active || !payload?.length) return null
                      const val = payload.find((p: any) => p.dataKey === 'ventas_valor')
                      const vari = payload.find((p: any) => p.dataKey === 'variacion')
                      return (
                        <div className="rounded-xl px-3 py-2.5 shadow-2xl min-w-[160px]"
                          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                          <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--t3)' }}>{label}</p>
                          {val && (
                            <div className="flex justify-between gap-4 mb-1">
                              <span className="text-[10px]" style={{ color: 'var(--t3)' }}>Ventas</span>
                              <span className="text-[13px] font-bold" style={{ color: '#c8873a' }}>{fmt(Number(val.value))}</span>
                            </div>
                          )}
                          {vari && vari.value !== null && (
                            <div className="flex justify-between gap-4">
                              <span className="text-[10px]" style={{ color: 'var(--t3)' }}>Variación</span>
                              <span className="text-[13px] font-bold"
                                style={{ color: Number(vari.value) >= 0 ? '#10b981' : '#ef4444' }}>
                                {Number(vari.value) >= 0 ? '+' : ''}{Number(vari.value).toFixed(1)}%
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    }}
                  />
                  {/* Area: volumen de ventas (fondo) */}
                  <Area
                    yAxisId="val"
                    dataKey="ventas_valor"
                    stroke="#c8873a"
                    fill="#c8873a18"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: '#c8873a', stroke: 'none' }}
                    name="Ventas"
                    type="monotone"
                  />
                  {/* Línea de variación % */}
                  <ReferenceLine yAxisId="var" y={0} stroke="var(--t3)" strokeDasharray="4 4" strokeWidth={1} />
                  <Line
                    yAxisId="var"
                    dataKey="variacion"
                    stroke="#3b82f6"
                    strokeWidth={2.5}
                    type="monotone"
                    dot={(props: any) => {
                      const { cx, cy, payload } = props
                      if (payload.variacion === null || payload.variacion === undefined) return <g key={props.key ?? cx} />
                      const color = payload.variacion >= 0 ? '#10b981' : '#ef4444'
                      return (
                        <g key={props.key ?? cx}>
                          <circle cx={cx} cy={cy} r={5} fill={color} stroke="var(--surface)" strokeWidth={2} />
                        </g>
                      )
                    }}
                    activeDot={{ r: 6, stroke: 'none' }}
                    name="Variación"
                    connectNulls={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
        ) : chartData.length === 0 ? (
          <div className="h-[380px] flex items-center justify-center text-[12px]" style={{ color: 'var(--t3)' }}>Sin datos</div>
        ) : (() => {
          const maxIdx = chartData.length - 1
          const lo = Math.min(sliderRange[0], maxIdx)
          const hi = Math.min(sliderRange[1], maxIdx)
          const visible = chartData.slice(lo, hi + 1)
          const labelLeft  = visible[0]                   ? (modo === 'mes' ? 'D' + visible[0].dia                   : visible[0].mes_label)                   : ''
          const labelRight = visible[visible.length - 1]  ? (modo === 'mes' ? 'D' + visible[visible.length - 1].dia  : visible[visible.length - 1].mes_label)  : ''
          return (
            <>
              <LineChartPro
                data={visible} nameKey={chartKey} dataKey="ventas_valor"
                color="#c8873a" height={380} formatter={fmt} tooltipUnit="USD"
                xTickFmt={chartXFmt}
                xInterval={modo === 'ano' ? 0 : Math.max(Math.ceil(visible.length / 10) - 1, 0)}
                dot
              />
              {/* Range slider */}
              {chartData.length > 1 && (
                <div className="mt-4 px-1">
                  <div className="relative">
                    <input
                      type="range" min={0} max={maxIdx} value={lo}
                      onChange={e => setSliderRange([Math.min(Number(e.target.value), hi - 1), hi])}
                      className="absolute w-full appearance-none bg-transparent pointer-events-none"
                      style={{ zIndex: 3, height: 4 }}
                    />
                    <input
                      type="range" min={0} max={maxIdx} value={hi}
                      onChange={e => setSliderRange([lo, Math.max(Number(e.target.value), lo + 1)])}
                      className="w-full appearance-none bg-transparent"
                      style={{ zIndex: 4, height: 4, accentColor: 'var(--acc)' }}
                    />
                  </div>
                  <div className="flex justify-between mt-1.5 text-[10px]" style={{ color: 'var(--t3)' }}>
                    <span>Desde: <span style={{ color: 'var(--t2)' }}>{labelLeft}</span></span>
                    <span>Hasta: <span style={{ color: 'var(--t2)' }}>{labelRight}</span></span>
                  </div>
                </div>
              )}
            </>
          )
        })()}
      </div>

      {/* 4 Donuts — Categoría (USD + UND), Cliente (USD + UND) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="card p-5">
          <h3 className="font-semibold text-[13px] mb-0.5" style={{ color: 'var(--t1)' }}>Categoría · Valor</h3>
          <p className="text-[11px] mb-4" style={{ color: 'var(--t3)' }}>USD · {titulo}</p>
          {loading ? <ChartSkeleton /> : categorias.length === 0 ? <ChartEmpty /> : (() => {
            const total = categorias.reduce((s: number, c: any) => s + toNum(c.ventas_valor), 0)
            return <DonutChartPro data={categorias.map((c: any) => ({ cat: c.categoria, qty: toNum(c.ventas_valor) }))} total={total} colorMap={{}} fallbackColors={COLORS} height={220} />
          })()}
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-[13px] mb-0.5" style={{ color: 'var(--t1)' }}>Categoría · Volumen</h3>
          <p className="text-[11px] mb-4" style={{ color: 'var(--t3)' }}>Unidades · {titulo}</p>
          {loading ? <ChartSkeleton /> : categorias.length === 0 ? <ChartEmpty /> : (() => {
            const total = categorias.reduce((s: number, c: any) => s + toNum(c.ventas_unidades), 0)
            return <DonutChartPro data={categorias.map((c: any) => ({ cat: c.categoria, qty: toNum(c.ventas_unidades) }))} total={total} colorMap={{}} fallbackColors={COLORS} height={220} />
          })()}
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-[13px] mb-0.5" style={{ color: 'var(--t1)' }}>Cliente · Valor</h3>
          <p className="text-[11px] mb-4" style={{ color: 'var(--t3)' }}>USD · {titulo}</p>
          {loading ? <ChartSkeleton /> : clientes.length === 0 ? <ChartEmpty /> : (() => {
            const total = clientes.reduce((s: number, c: any) => s + toNum(c.ventas_valor), 0)
            return <DonutChartPro data={clientes.map((c: any) => ({ cat: c.nombre, qty: toNum(c.ventas_valor) }))} total={total} colorMap={{}} fallbackColors={['#c8873a','#3a6fa8','#2a7a58','#6b4fa8','#c0402f','#2a8a8a','#a8863a','#3a8a4f','#7a3a8a','#3a5a8a']} height={220} />
          })()}
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-[13px] mb-0.5" style={{ color: 'var(--t1)' }}>Cliente · Volumen</h3>
          <p className="text-[11px] mb-4" style={{ color: 'var(--t3)' }}>Unidades · {titulo}</p>
          {loading ? <ChartSkeleton /> : clientes.length === 0 ? <ChartEmpty /> : (() => {
            const total = clientes.reduce((s: number, c: any) => s + toNum(c.ventas_unidades), 0)
            return <DonutChartPro data={clientes.map((c: any) => ({ cat: c.nombre, qty: toNum(c.ventas_unidades) }))} total={total} colorMap={{}} fallbackColors={['#c8873a','#3a6fa8','#2a7a58','#6b4fa8','#c0402f','#2a8a8a','#a8863a','#3a8a4f','#7a3a8a','#3a5a8a']} height={220} />
          })()}
        </div>
      </div>

      {/* Top 10 SKUs */}
      <div className="card p-5">
        <h3 className="font-semibold text-[13px] mb-4" style={{ color: 'var(--t1)' }}>Top 10 SKUs · {titulo}</h3>
        {loading
          ? <p className="text-[12px]" style={{ color: 'var(--t3)' }}>Cargando...</p>
          : topSkus.length === 0
            ? <p className="text-[12px]" style={{ color: 'var(--t3)' }}>Sin datos</p>
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]" style={{ minWidth: 520 }}>
                  <thead>
                    <tr className="border-b text-[10px] uppercase tracking-widest" style={{ borderColor: 'var(--border)', color: 'var(--t3)' }}>
                      <th className="text-left py-2 pr-4 w-8">#</th>
                      <th className="text-left py-2 pr-4">Cód. Barras</th>
                      <th className="text-left py-2 pr-4">SKU</th>
                      <th className="text-left py-2 pr-4">Descripción</th>
                      <th className="text-right py-2 pr-4 cursor-pointer select-none whitespace-nowrap"
                        style={{ color: skuSort.key === 'valor' ? 'var(--acc)' : 'var(--t3)' }}
                        onClick={() => setSkuSort(prev => prev.key === 'valor' ? { key: 'valor', dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { key: 'valor', dir: 'desc' })}>
                        Ventas USD {skuSort.key === 'valor' ? (skuSort.dir === 'desc' ? ' ↓' : ' ↑') : ' ↕'}
                      </th>
                      <th className="text-right py-2 cursor-pointer select-none whitespace-nowrap"
                        style={{ color: skuSort.key === 'unidades' ? 'var(--acc)' : 'var(--t3)' }}
                        onClick={() => setSkuSort(prev => prev.key === 'unidades' ? { key: 'unidades', dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { key: 'unidades', dir: 'desc' })}>
                        Unidades {skuSort.key === 'unidades' ? (skuSort.dir === 'desc' ? ' ↓' : ' ↑') : ' ↕'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...topSkus]
                      .sort((a: any, b: any) => {
                        const diff = skuSort.key === 'valor'
                          ? toNum(b.ventas_valor) - toNum(a.ventas_valor)
                          : toNum(b.ventas_unidades) - toNum(a.ventas_unidades)
                        return skuSort.dir === 'asc' ? -diff : diff
                      })
                      .map((s: any, i: number) => (
                      <tr key={i} className="border-b transition-colors" style={{ borderColor: 'var(--border)' }}>
                        <td className="py-2 pr-4" style={{ color: 'var(--t3)' }}>{i + 1}</td>
                        <td className="py-2 pr-4 font-mono text-[11px]" style={{ color: 'var(--t3)' }}>{s.codigo_barras ?? '—'}</td>
                        <td className="py-2 pr-4 font-mono text-[11px]" style={{ color: 'var(--acc)' }}>{s.sku}</td>
                        <td className="py-2 pr-4 max-w-xs truncate" style={{ color: 'var(--t2)' }}>{s.descripcion}</td>
                        <td className="py-2 pr-4 text-right font-semibold" style={{ color: skuSort.key === 'valor' ? 'var(--t1)' : 'var(--t2)' }}>{fmt(toNum(s.ventas_valor))}</td>
                        <td className="py-2 text-right" style={{ color: skuSort.key === 'unidades' ? 'var(--t1)' : 'var(--t2)' }}>{toNum(s.ventas_unidades).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        }
      </div>

      {/* ══ MODALES ══════════════════════════════════════════ */}
      <div className={`fixed inset-0 z-50 flex items-end md:items-center justify-center transition-all duration-300 ${activeModal ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={() => setActiveModal(null)} />

        <div className={`relative w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl rounded-t-3xl md:rounded-2xl transition-all duration-300 ${activeModal ? 'translate-y-0 scale-100' : 'translate-y-8 md:scale-95'}`}
          style={{ background: 'var(--surface)' }}>

          {/* ── Modal: Ventas Totales USD ─────────────── */}
          {activeModal === 'ventas' && kpi && (
            <>
              <div className="flex items-center justify-between px-6 pt-5 pb-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#c8873a20' }}>
                    <DollarSign size={18} style={{ color: '#c8873a' }} />
                  </div>
                  <div>
                    <h2 className="font-bold text-[17px]" style={{ color: 'var(--t1)' }}>Desglose Ventas USD</h2>
                    <p className="text-[11px]" style={{ color: 'var(--t3)' }}>{titulo}</p>
                  </div>
                </div>
                <button onClick={() => setActiveModal(null)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--border)' }}>
                  <X size={15} style={{ color: 'var(--t2)' }} />
                </button>
              </div>

              {/* KPI mini-cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-4 sm:px-6 py-4 shrink-0">
                {[
                  { label: 'Total USD',    value: fmt(toNum(kpi.total_valor)),    color: '#c8873a' },
                  { label: 'Top País',     value: paises[0]?.pais ?? '—',         color: '#3a6fa8' },
                  { label: 'Top Categoría', value: categorias[0]?.categoria ?? '—', color: '#2a7a58' },
                ].map(k => (
                  <div key={k.label} className="rounded-xl p-3 text-center" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <p className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--t3)' }}>{k.label}</p>
                    <p className="text-xl font-bold truncate" style={{ color: k.color }}>{k.value}</p>
                  </div>
                ))}
              </div>

              {/* Tabs */}
              <div className="flex gap-1 px-6 shrink-0">
                {(['chart', 'table'] as const).map(t => (
                  <button key={t} onClick={() => setModalTab(t)}
                    className="px-4 py-1.5 text-[11px] font-semibold rounded-lg transition-all"
                    style={modalTab === t ? { background: '#c8873a', color: '#fff' } : { color: 'var(--t3)' }}>
                    {t === 'chart' ? 'Tendencia' : 'Por País / Categoría'}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-auto px-6 py-4">
                {modalTab === 'chart' ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={chartData} margin={{ top: 4, right: 16, left: 4, bottom: chartData.length > 10 ? 56 : 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey={chartKey} tick={{ fontSize: 10, fill: 'var(--t3)' }}
                        angle={chartData.length > 10 ? -40 : 0}
                        textAnchor={chartData.length > 10 ? 'end' : 'middle'}
                        height={chartData.length > 10 ? 56 : 30}
                        interval={Math.max(Math.ceil(chartData.length / 12) - 1, 0)}
                        tickFormatter={chartXFmt} />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--t3)' }} tickFormatter={fmt} width={64} />
                      <Tooltip content={<ModalTooltip />} />
                      <Line dataKey="ventas_valor" name="USD" stroke="#c8873a" strokeWidth={2.5}
                        dot={{ r: 3, fill: '#c8873a' }} activeDot={{ r: 6 }} type="monotone" animationDuration={600} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Por país */}
                    <div>
                      <p className="text-[10px] uppercase tracking-widest font-semibold mb-3" style={{ color: 'var(--t3)' }}>Por País</p>
                      {paises.map((p: any, i: number) => {
                        const total = paises.reduce((s: number, x: any) => s + toNum(x.ventas_valor), 0)
                        const pct   = total > 0 ? (toNum(p.ventas_valor) / total) * 100 : 0
                        return (
                          <div key={i} className="mb-2">
                            <div className="flex justify-between text-[11px] mb-0.5">
                              <span className="font-semibold" style={{ color: 'var(--t1)' }}>{p.pais}</span>
                              <span style={{ color: 'var(--t3)' }}>{fmt(toNum(p.ventas_valor))} · {pct.toFixed(1)}%</span>
                            </div>
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                              <div className="h-full rounded-full" style={{ width: pct + '%', background: COLORS[i % COLORS.length] }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {/* Por categoría */}
                    <div>
                      <p className="text-[10px] uppercase tracking-widest font-semibold mb-3" style={{ color: 'var(--t3)' }}>Por Categoría</p>
                      {categorias.map((c: any, i: number) => {
                        const total = categorias.reduce((s: number, x: any) => s + toNum(x.ventas_valor), 0)
                        const pct   = total > 0 ? (toNum(c.ventas_valor) / total) * 100 : 0
                        return (
                          <div key={i} className="mb-2">
                            <div className="flex justify-between text-[11px] mb-0.5">
                              <span className="font-semibold" style={{ color: 'var(--t1)' }}>{c.categoria}</span>
                              <span style={{ color: 'var(--t3)' }}>{fmt(toNum(c.ventas_valor))} · {pct.toFixed(1)}%</span>
                            </div>
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                              <div className="h-full rounded-full" style={{ width: pct + '%', background: COLORS[(i + 2) % COLORS.length] }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Modal: Ventas Unidades ────────────────── */}
          {activeModal === 'unidades' && kpi && (
            <>
              <div className="flex items-center justify-between px-6 pt-5 pb-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#3b82f620' }}>
                    <ShoppingCart size={18} style={{ color: '#3b82f6' }} />
                  </div>
                  <div>
                    <h2 className="font-bold text-[17px]" style={{ color: 'var(--t1)' }}>Desglose Unidades</h2>
                    <p className="text-[11px]" style={{ color: 'var(--t3)' }}>{titulo}</p>
                  </div>
                </div>
                <button onClick={() => setActiveModal(null)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--border)' }}>
                  <X size={15} style={{ color: 'var(--t2)' }} />
                </button>
              </div>

              {/* KPI mini-cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-4 sm:px-6 py-4 shrink-0">
                {[
                  { label: 'Total Unidades', value: toNum(kpi.total_unidades).toLocaleString(), color: '#3b82f6' },
                  { label: 'Top SKU Uds',    value: topSkus[0] ? toNum(topSkus[0].ventas_unidades).toLocaleString() : '—', color: '#6366f1' },
                  { label: 'SKU Top',        value: topSkus[0]?.descripcion?.split(' ').slice(0,2).join(' ') ?? '—', color: '#10b981' },
                ].map(k => (
                  <div key={k.label} className="rounded-xl p-3 text-center" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <p className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--t3)' }}>{k.label}</p>
                    <p className="text-xl font-bold truncate" style={{ color: k.color }}>{k.value}</p>
                  </div>
                ))}
              </div>

              {/* Tabs */}
              <div className="flex gap-1 px-6 shrink-0">
                {(['chart', 'table'] as const).map(t => (
                  <button key={t} onClick={() => setModalTab(t)}
                    className="px-4 py-1.5 text-[11px] font-semibold rounded-lg transition-all"
                    style={modalTab === t ? { background: '#3b82f6', color: '#fff' } : { color: 'var(--t3)' }}>
                    {t === 'chart' ? 'Tendencia' : 'Top SKUs'}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-auto px-6 py-4">
                {modalTab === 'chart' ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={chartData} margin={{ top: 4, right: 16, left: 4, bottom: chartData.length > 10 ? 56 : 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey={chartKey} tick={{ fontSize: 10, fill: 'var(--t3)' }}
                        angle={chartData.length > 10 ? -40 : 0}
                        textAnchor={chartData.length > 10 ? 'end' : 'middle'}
                        height={chartData.length > 10 ? 56 : 30}
                        interval={Math.max(Math.ceil(chartData.length / 12) - 1, 0)}
                        tickFormatter={chartXFmt} />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--t3)' }} tickFormatter={v => v >= 1000 ? (v/1000).toFixed(0)+'K' : v} width={56} />
                      <Tooltip content={<ModalTooltip />} />
                      <Bar dataKey="ventas_unidades" name="Unidades" fill="#3b82f6" radius={[3,3,0,0]} animationDuration={600} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-widest border-b" style={{ borderColor: 'var(--border)', color: 'var(--t3)' }}>
                          <th className="text-left py-2 pr-2 w-6">#</th>
                          <th className="text-left py-2 pr-4">SKU</th>
                          <th className="text-left py-2 pr-4">Descripción</th>
                          <th className="text-right py-2 pr-4 cursor-pointer select-none whitespace-nowrap"
                            style={{ color: skuSort.key === 'unidades' ? 'var(--acc)' : 'var(--t3)' }}
                            onClick={() => setSkuSort(prev => prev.key === 'unidades' ? { key: 'unidades', dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { key: 'unidades', dir: 'desc' })}>
                            Unidades {skuSort.key === 'unidades' ? (skuSort.dir === 'desc' ? ' ↓' : ' ↑') : ' ↕'}
                          </th>
                          <th className="text-right py-2 cursor-pointer select-none whitespace-nowrap"
                            style={{ color: skuSort.key === 'valor' ? 'var(--acc)' : 'var(--t3)' }}
                            onClick={() => setSkuSort(prev => prev.key === 'valor' ? { key: 'valor', dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { key: 'valor', dir: 'desc' })}>
                            Ventas USD {skuSort.key === 'valor' ? (skuSort.dir === 'desc' ? ' ↓' : ' ↑') : ' ↕'}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...topSkus]
                          .sort((a: any, b: any) => {
                            const diff = skuSort.key === 'valor'
                              ? toNum(b.ventas_valor) - toNum(a.ventas_valor)
                              : toNum(b.ventas_unidades) - toNum(a.ventas_unidades)
                            return skuSort.dir === 'asc' ? -diff : diff
                          })
                          .map((s: any, i: number) => (
                          <tr key={i} className="border-b" style={{ borderColor: 'var(--border)' }}>
                            <td className="py-2 pr-2" style={{ color: 'var(--t3)' }}>{i + 1}</td>
                            <td className="py-2 pr-4 font-mono text-[11px]" style={{ color: '#3b82f6' }}>{s.sku}</td>
                            <td className="py-2 pr-4 max-w-[200px] truncate" style={{ color: 'var(--t2)' }}>{s.descripcion}</td>
                            <td className="py-2 pr-4 text-right" style={{ color: skuSort.key === 'unidades' ? 'var(--t1)' : 'var(--t3)' }}>{toNum(s.ventas_unidades).toLocaleString()}</td>
                            <td className="py-2 text-right" style={{ color: skuSort.key === 'valor' ? 'var(--t1)' : 'var(--t3)' }}>{fmt(toNum(s.ventas_valor))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Modal: Precio Promedio ─────────────────── */}
          {activeModal === 'precio' && metrics && (
            <>
              <div className="flex items-center justify-between px-6 pt-5 pb-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: AMBER + '20' }}>
                    <TrendingUp size={18} style={{ color: AMBER }} />
                  </div>
                  <div>
                    <h2 className="font-bold text-[17px]" style={{ color: 'var(--t1)' }}>Evolución del Precio Promedio</h2>
                    <p className="text-[11px]" style={{ color: 'var(--t3)' }}>{titulo}</p>
                  </div>
                </div>
                <button onClick={() => setActiveModal(null)}
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                  style={{ background: 'var(--border)' }}>
                  <X size={15} style={{ color: 'var(--t2)' }} />
                </button>
              </div>

              {/* KPI mini-cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 sm:px-6 py-4 shrink-0">
                {[
                  { label: 'Precio Actual',   value: fmtP(metrics.precioPromedio), color: AMBER },
                  { label: 'Mínimo',          value: fmtP(metrics.precioMin),      color: '#6366f1' },
                  { label: 'Máximo',          value: fmtP(metrics.precioMax),      color: '#10b981' },
                  {
                    label: 'Var. vs anterior',
                    value: metrics.varActual !== null
                      ? (metrics.varActual >= 0 ? '+' : '') + metrics.varActual.toFixed(1) + '%'
                      : '—',
                    color: metrics.varActual !== null && metrics.varActual >= 0 ? '#10b981' : '#ef4444',
                  },
                ].map(kpi => (
                  <div key={kpi.label} className="rounded-xl p-3 text-center" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <p className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--t3)' }}>{kpi.label}</p>
                    <p className="text-xl font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
                  </div>
                ))}
              </div>

              {/* Tabs */}
              <div className="flex gap-1 px-6 shrink-0">
                {(['chart', 'table'] as const).map(t => (
                  <button key={t} onClick={() => setModalTab(t)}
                    className="px-4 py-1.5 text-[11px] font-semibold rounded-lg transition-all"
                    style={modalTab === t
                      ? { background: AMBER, color: '#fff' }
                      : { color: 'var(--t3)', background: 'transparent' }}>
                    {t === 'chart' ? 'Gráfico' : 'Tabla'}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-auto px-6 py-4">
                {modalTab === 'chart' ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <ComposedChart data={metrics.evoData} margin={{ top: 8, right: 48, left: 4, bottom: metrics.evoData.length > 10 ? 56 : 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--t3)' }}
                        angle={metrics.evoData.length > 10 ? -40 : 0}
                        textAnchor={metrics.evoData.length > 10 ? 'end' : 'middle'}
                        height={metrics.evoData.length > 10 ? 56 : 30}
                        interval={Math.max(Math.ceil(metrics.evoData.length / 12) - 1, 0)} />
                      <YAxis yAxisId="precio" tick={{ fontSize: 10, fill: 'var(--t3)' }} tickFormatter={fmtP} width={64} />
                      <YAxis yAxisId="var" orientation="right" tick={{ fontSize: 10, fill: 'var(--t3)' }}
                        tickFormatter={(v: number) => v.toFixed(0) + '%'} width={44} />
                      <Tooltip content={<ModalTooltip />} />
                      <ReferenceLine yAxisId="var" y={0} stroke="var(--border)" strokeWidth={1} />
                      <Bar yAxisId="var" dataKey="variacion" name="Variación" maxBarSize={28} radius={[3,3,0,0]}>
                        {metrics.evoData.map((row, i) => (
                          <Cell key={i} fill={row.variacion === null ? 'transparent' : row.variacion >= 0 ? '#10b981' : '#ef4444'} opacity={0.7} />
                        ))}
                      </Bar>
                      <Line yAxisId="precio" dataKey="precio" name="Precio" stroke={AMBER} strokeWidth={2.5}
                        dot={{ r: 3, fill: AMBER }} activeDot={{ r: 6, fill: AMBER }}
                        type="monotone" animationDuration={600} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-widest border-b" style={{ borderColor: 'var(--border)', color: 'var(--t3)' }}>
                          <th className="text-left py-2 pr-4">Período</th>
                          <th className="text-right py-2 pr-4">Precio Prom.</th>
                          <th className="text-right py-2 pr-4">Unidades</th>
                          <th className="text-right py-2">Variación %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {metrics.evoData.map((row, i) => (
                          <tr key={i} className="border-b" style={{ borderColor: 'var(--border)' }}>
                            <td className="py-2 pr-4" style={{ color: 'var(--t2)' }}>{row.label}</td>
                            <td className="py-2 pr-4 text-right font-semibold" style={{ color: 'var(--t1)' }}>{fmtP(row.precio)}</td>
                            <td className="py-2 pr-4 text-right" style={{ color: 'var(--t3)' }}>{row.unidades.toLocaleString()}</td>
                            <td className="py-2 text-right"><VarBadge v={row.variacion} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Modal: Meses/Días con Venta ──────────── */}
          {activeModal === 'meses' && metrics && (
            <>
              <div className="flex items-center justify-between px-6 pt-5 pb-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: VIOLET + '20' }}>
                    <Calendar size={18} style={{ color: VIOLET }} />
                  </div>
                  <div>
                    <h2 className="font-bold text-[17px]" style={{ color: 'var(--t1)' }}>
                      Cobertura de {metrics.periodoLabel}
                    </h2>
                    <p className="text-[11px]" style={{ color: 'var(--t3)' }}>{titulo}</p>
                  </div>
                </div>
                <button onClick={() => setActiveModal(null)}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--border)' }}>
                  <X size={15} style={{ color: 'var(--t2)' }} />
                </button>
              </div>

              {/* KPI mini-cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-4 sm:px-6 py-4 shrink-0">
                {[
                  { label: `Con venta`,   value: String(metrics.conVenta),              color: '#10b981' },
                  { label: `Sin venta`,   value: String(metrics.total - metrics.conVenta), color: '#ef4444' },
                  { label: '% Presencia', value: metrics.total > 0 ? ((metrics.conVenta / metrics.total) * 100).toFixed(0) + '%' : '0%', color: AMBER },
                  { label: 'Racha máx.',  value: String(metrics.maxStreak),             color: VIOLET },
                ].map(kpi => (
                  <div key={kpi.label} className="rounded-xl p-3 text-center" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <p className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--t3)' }}>{kpi.label}</p>
                    <p className="text-xl font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
                  </div>
                ))}
              </div>

              {/* Tabs */}
              <div className="flex gap-1 px-6 shrink-0">
                {(['chart', 'table'] as const).map(t => (
                  <button key={t} onClick={() => setModalTab(t)}
                    className="px-4 py-1.5 text-[11px] font-semibold rounded-lg transition-all"
                    style={modalTab === t
                      ? { background: VIOLET, color: '#fff' }
                      : { color: 'var(--t3)', background: 'transparent' }}>
                    {t === 'chart' ? 'Visualización' : 'Detalle'}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-auto px-6 py-4">
                {modalTab === 'chart' ? (
                  metrics.cells.length <= 31 ? (
                    // Grid visual (≤ 31 períodos: mes/año)
                    <div>
                      <div className={`grid gap-2 ${metrics.cells.length <= 12 ? 'grid-cols-6 md:grid-cols-12' : 'grid-cols-7'}`}>
                        {metrics.cells.map(cell => (
                          <div key={cell.key}
                            title={`${cell.label}: ${cell.hasData ? fmt(cell.valor) : 'Sin ventas'}`}
                            className="relative rounded-lg p-2 text-center cursor-default transition-transform hover:scale-105"
                            style={{
                              background: cell.hasData ? VIOLET + '18' : 'var(--bg)',
                              border: `1.5px solid ${cell.hasData ? VIOLET + '50' : 'var(--border)'}`,
                            }}>
                            <p className="text-[10px] font-semibold" style={{ color: cell.hasData ? VIOLET : 'var(--t3)' }}>{cell.label}</p>
                            {cell.hasData
                              ? <p className="text-[9px] mt-0.5" style={{ color: 'var(--t3)' }}>{fmt(cell.valor)}</p>
                              : <p className="text-[10px] mt-0.5" style={{ color: 'var(--border)' }}>—</p>
                            }
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-4 mt-4 text-[11px]" style={{ color: 'var(--t3)' }}>
                        <span className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded" style={{ background: VIOLET + '40', border: `1px solid ${VIOLET}50` }} />
                          Con ventas
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }} />
                          Sin ventas
                        </span>
                        <span className="ml-auto">
                          Racha actual: <strong style={{ color: VIOLET }}>{metrics.endStreak} {metrics.periodoLabel.toLowerCase()}</strong>
                        </span>
                      </div>
                    </div>
                  ) : (
                    // Bar chart para muchos períodos (todos mode)
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={metrics.cells} margin={{ top: 4, right: 16, left: 4, bottom: metrics.cells.length > 20 ? 56 : 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--t3)' }}
                          angle={metrics.cells.length > 20 ? -40 : 0}
                          textAnchor={metrics.cells.length > 20 ? 'end' : 'middle'}
                          height={metrics.cells.length > 20 ? 56 : 30}
                          interval={Math.max(Math.ceil(metrics.cells.length / 16) - 1, 0)} />
                        <YAxis tick={{ fontSize: 10, fill: 'var(--t3)' }} tickFormatter={v => fmt(v)} width={60} />
                        <Tooltip content={<ModalTooltip />} />
                        <Bar dataKey="valor" name="Ventas" radius={[3, 3, 0, 0]}>
                          {metrics.cells.map((entry, idx) => (
                            <Cell key={idx} fill={entry.hasData ? VIOLET : 'var(--border)'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-widest border-b" style={{ borderColor: 'var(--border)', color: 'var(--t3)' }}>
                          <th className="text-left py-2 pr-4">Período</th>
                          <th className="text-center py-2 pr-4">Estado</th>
                          <th className="text-right py-2 pr-4">Ventas USD</th>
                          <th className="text-right py-2">Unidades</th>
                        </tr>
                      </thead>
                      <tbody>
                        {metrics.cells.map((cell, i) => (
                          <tr key={i} className="border-b" style={{ borderColor: 'var(--border)', opacity: cell.hasData ? 1 : 0.45 }}>
                            <td className="py-2 pr-4" style={{ color: 'var(--t2)' }}>{cell.label}</td>
                            <td className="py-2 pr-4 text-center">
                              {cell.hasData
                                ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: VIOLET + '20', color: VIOLET }}>✓ Con venta</span>
                                : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">✗ Sin venta</span>
                              }
                            </td>
                            <td className="py-2 pr-4 text-right font-semibold" style={{ color: 'var(--t1)' }}>{cell.hasData ? fmt(cell.valor) : '—'}</td>
                            <td className="py-2 text-right" style={{ color: 'var(--t3)' }}>{cell.hasData ? cell.unidades.toLocaleString() : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

    </div>
  )
}
