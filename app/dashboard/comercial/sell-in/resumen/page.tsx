'use client'
import { useEffect, useState, useCallback } from 'react'
import { TrendingUp, TrendingDown, Minus, RefreshCw } from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import FiltroMulti from '@/components/ui/FiltroMulti'

const MESES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const PAISES = ['CR','GT','SV','NI','HN','CO']
const CATS   = ['Quesos','Leches','Helados']
const TIPOS  = ['REGULAR','LICENCIAMIENTO_HELADOS','LICENCIAMIENTO_COLOMBIA']

const PAISES_OPT = PAISES.map(p => ({ value: p }))
const CATS_OPT   = CATS.map(c => ({ value: c }))

const fmt = (v: number) => {
  if (!isFinite(v)) return '$0'
  if (v >= 1e6) return '$' + (v/1e6).toFixed(2) + 'M'
  if (v >= 1e3) return '$' + (v/1e3).toFixed(1) + 'K'
  return '$' + v.toFixed(2)
}
const fmtN = (v: number) => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(0)+'K' : v.toFixed(0)

interface Kpi { valor: number; delta: number }
interface KpiData {
  ingresos: Kpi; unidades: Kpi; margen: Kpi; margen_pct: Kpi
  clientes: number; skus: number
}

const COLORS = { 2024: '#94a3b8', 2025: '#60a5fa', 2026: '#c8873a' }

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

export default function SellInResumen() {
  const [ano,    setAno]    = useState(2026)
  const [paises, setPaises] = useState<string[]>([])
  const [cats,   setCats]   = useState<string[]>([])
  const [tipo,   setTipo]   = useState('')

  const [kpi,     setKpi]     = useState<KpiData | null>(null)
  const [mensual, setMensual] = useState<any[]>([])
  const [ytd,     setYtd]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async (a: number, ps: string[], cs: string[], t: string) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ ano: String(a) })
      if (ps.length) qs.set('pais', ps.join(','))
      if (cs.length) qs.set('categoria', cs.join(','))
      if (t) qs.set('tipo_negocio', t)

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

  useEffect(() => { cargar(ano, paises, cats, tipo) }, [cargar, ano, paises, cats, tipo])

  // Transform ytd for recharts
  const ytdData = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    const row: any = { mes: MESES[m] }
    ytd.forEach(s => { row[String(s.ano)] = s.vals[i] ?? 0 })
    return row
  })

  const kpiCards = kpi ? [
    { label: 'Venta Neta',    value: fmt(kpi.ingresos.valor),            delta: kpi.ingresos.delta,   icon: '💰' },
    { label: 'Unidades',      value: fmtN(kpi.unidades.valor),           delta: kpi.unidades.delta,   icon: '📦' },
    { label: 'Margen USD',    value: fmt(kpi.margen.valor),              delta: kpi.margen.delta,     icon: '📊' },
    { label: '% Margen',      value: kpi.margen_pct.valor.toFixed(1)+'%',delta: kpi.margen_pct.delta, icon: '🎯', isPct: true },
  ] : []

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Sell In</p>
          <h1 className="text-2xl font-bold text-gray-800">Resumen Ejecutivo</h1>
          <p className="text-sm text-gray-400 mt-0.5">Comparativo vs año anterior · Facturación propia</p>
        </div>
        <button onClick={() => cargar(ano, paises, cats, tipo)}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Año</p>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {[2024, 2025, 2026].map(a => (
                <button key={a} onClick={() => setAno(a)}
                  className={`px-4 py-1.5 text-sm font-medium transition-colors ${ano===a?'bg-amber-500 text-white':'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {a}
                </button>
              ))}
            </div>
          </div>
          <FiltroMulti label="País" options={PAISES_OPT} value={paises} onChange={setPaises} placeholder="Todos" />
          <FiltroMulti label="Categoría" options={CATS_OPT} value={cats} onChange={setCats} placeholder="Todas" />
          <div className="flex-1 min-w-[180px]">
            <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Tipo Negocio</p>
            <select value={tipo} onChange={e => setTipo(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400">
              <option value="">Todos</option>
              {TIPOS.map(t => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? Array(4).fill(0).map((_,i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse">
                <div className="h-3 bg-gray-100 rounded w-2/3 mb-3"/>
                <div className="h-7 bg-gray-100 rounded w-1/2 mb-2"/>
                <div className="h-4 bg-gray-100 rounded w-1/3"/>
              </div>
            ))
          : kpiCards.map(k => (
              <div key={k.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{k.label}</p>
                  <span className="text-lg">{k.icon}</span>
                </div>
                <p className="text-2xl font-bold text-gray-800 mb-2">{k.value}</p>
                <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                  <DeltaBadge delta={k.delta} isPct={k.isPct} />
                  <span>vs {ano - 1}</span>
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
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Venta Neta Mensual — 2024 / 2025 / 2026</h3>
        {loading
          ? <div className="h-52 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
          : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={mensual} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="mes" tickFormatter={m => MESES[m]} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => '$'+(v/1000).toFixed(0)+'K'} tick={{ fontSize: 11 }} width={52} />
                <Tooltip formatter={(v: number) => fmt(v)} labelFormatter={m => MESES[Number(m)]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {([2024, 2025, 2026] as const).map(a => (
                  <Bar key={a} dataKey={a} name={String(a)} fill={COLORS[a]} radius={[3,3,0,0]} maxBarSize={22} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )
        }
      </div>

      {/* Gráfico de líneas: YTD acumulado */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">YTD Acumulado — Venta Neta</h3>
        <p className="text-xs text-gray-400 mb-4">Suma corrida mes a mes</p>
        {loading
          ? <div className="h-52 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
          : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={ytdData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => '$'+(v/1000).toFixed(0)+'K'} tick={{ fontSize: 11 }} width={52} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {([2024, 2025, 2026] as const).map(a => (
                  <Line key={a} type="monotone" dataKey={String(a)} name={String(a)}
                    stroke={COLORS[a]} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )
        }
      </div>
    </div>
  )
}
