'use client'
import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import FiltroMulti from '@/components/ui/FiltroMulti'
import { useTableSort, SortableTh } from '@/components/ui/table-sort'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell, LabelList,
} from 'recharts'

// ── Helpers de formato de charts (estándar del dashboard) ────────────────────
const fmtK = (v: number) => {
  const n = Number(v); if (!isFinite(n) || n === 0) return ''
  if (Math.abs(n) >= 1e9) return '$' + (n/1e9).toFixed(1) + 'MM'
  if (Math.abs(n) >= 1e6) return '$' + (n/1e6).toFixed(0) + 'M'
  if (Math.abs(n) >= 1e3) return '$' + (n/1e3).toFixed(0) + 'K'
  return '$' + Math.round(n)
}

// ── Constantes ──────────────────────────────────────────────────────────────
const MESES_FULL = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
                    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const MESES_SHORT = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const COLORS = { '2024': '#d1d5db', '2025': '#60a5fa', '2026': '#c8873a' } as Record<string,string>
const PAIS_FLAG: Record<string,string> = {
  CR:'🇨🇷', GT:'🇬🇹', SV:'🇸🇻', NI:'🇳🇮', HN:'🇭🇳', CO:'🇨🇴', PA:'🇵🇦',
}

// ── Formatters ───────────────────────────────────────────────────────────────
const fmtUsd = (v: number) => {
  if (!v || !isFinite(v)) return '$0'
  if (v >= 1_000_000) return '$' + (v/1_000_000).toFixed(2) + 'M'
  if (v >= 1_000)     return '$' + (v/1_000).toFixed(1) + 'K'
  return '$' + v.toFixed(0)
}
const fmtFull = (v: number) =>
  '$' + (v||0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtPct = (v: number | null) =>
  v === null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%'
const fmtNum = (v: number) =>
  (v||0).toLocaleString('en-US', { maximumFractionDigits: 0 })

// ── Tooltip ───────────────────────────────────────────────────────────────────
const TooltipUsd = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{MESES_FULL[Number(label)] ?? label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center justify-between gap-4 leading-5">
          <span style={{ color: p.color ?? p.fill }} className="font-medium">{p.name}</span>
          <span className="font-mono text-gray-800">{p.value != null ? fmtFull(p.value) : '—'}</span>
        </div>
      ))}
    </div>
  )
}

// ── Tipos ─────────────────────────────────────────────────────────────────────
type Tab = 'evolucion' | 'clientes' | 'paises' | 'categorias' | 'skus'

interface Tendencias {
  kpis: {
    valor_26: number; valor_25: number
    uds_26: number;   uds_25: number
    var_valor_pct: number | null; var_uds_pct: number | null
  }
  mensual:       any[]
  ytd:           any[]
  por_cliente:   any[]
  por_pais:      any[]
  por_categoria: any[]
  top_skus:      any[]
  opciones:      { clientes?: string[]; paises?: string[]; categorias?: string[] }
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, varPct }: { label: string; value: string; sub?: string; varPct?: number | null }) {
  const color = varPct == null ? 'text-gray-400' : varPct >= 0 ? 'text-emerald-600' : 'text-red-500'
  const Icon  = varPct == null ? Minus : varPct >= 0 ? TrendingUp : TrendingDown
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col gap-1">
      <p className="text-xs text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="text-xl font-bold text-gray-800">{value}</p>
      {varPct !== undefined && (
        <div className={`flex items-center gap-1 text-xs font-medium ${color}`}>
          <Icon size={12} />
          <span>{fmtPct(varPct ?? null)} vs 2025</span>
        </div>
      )}
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

// ── Comparativa Table ─────────────────────────────────────────────────────────
function CompTable({ rows, keyCol, label }: { rows: any[]; keyCol: string; label: string }) {
  if (!rows.length) return <p className="text-sm text-gray-400 py-6 text-center">Sin datos</p>
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-gray-100 text-gray-400 uppercase text-[11px] tracking-wider">
          <th className="text-left py-2 pr-3">{label}</th>
          <th className="text-right py-2 px-2">2025</th>
          <th className="text-right py-2 px-2">2026</th>
          <th className="text-right py-2 pl-2">Var %</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const vp: number | null = r.var_pct
          const color = vp == null ? 'text-gray-400' : vp >= 0 ? 'text-emerald-600' : 'text-red-500'
          return (
            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
              <td className="py-2 pr-3 font-medium text-gray-700">
                {PAIS_FLAG[r[keyCol]] ? `${PAIS_FLAG[r[keyCol]]} ` : ''}{r[keyCol]}
              </td>
              <td className="text-right py-2 px-2 text-gray-500 font-mono">{fmtUsd(r.valor_2025 ?? 0)}</td>
              <td className="text-right py-2 px-2 font-semibold text-gray-800 font-mono">{fmtUsd(r.valor_2026 ?? 0)}</td>
              <td className={`text-right py-2 pl-2 font-semibold ${color}`}>{fmtPct(vp)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TendenciasPage() {
  const [tab,      setTab]      = useState<Tab>('evolucion')
  const [paises,   setPaises]   = useState<string[]>([])
  const [cats,     setCats]     = useState<string[]>([])
  const [clientes, setClientes] = useState<string[]>([])
  const [data,     setData]     = useState<Tendencias | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(false)

  const cargar = useCallback(async (ps: string[], cs: string[], cls: string[]) => {
    setLoading(true); setError(false)
    try {
      const qs = new URLSearchParams()
      if (ps.length)  qs.set('pais',      ps.join(','))
      if (cs.length)  qs.set('categoria', cs.join(','))
      if (cls.length) qs.set('cliente',   cls.join(','))
      const res = await fetch('/api/comercial/sellout/tendencias?' + qs)
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch { setError(true) }
    finally  { setLoading(false) }
  }, [])

  useEffect(() => { cargar(paises, cats, clientes) }, [cargar, paises, cats, clientes])

  const opts = data?.opciones ?? {}
  const paisOpts  = (opts.paises      ?? ['CR','GT','SV','NI','HN','CO']).map(v => ({ value: v }))
  const catOpts   = (opts.categorias  ?? ['Quesos','Leches','Helados']).map(v => ({ value: v }))
  const cliOpts   = (opts.clientes    ?? []).map(v => ({ value: v }))

  // ── Timeline continuo (2024 → 2026) ────────────────────────────────────
  // Mensual: un valor por mes flat, Ene-24 → hoy.
  const mensualContinuo: { mes_str: string; valor: number }[] = (() => {
    if (!data?.mensual) return []
    const byMes: Record<number, any> = {}
    for (const r of data.mensual) byMes[Number(r.mes)] = r
    const out: { mes_str: string; valor: number }[] = []
    for (const ano of [2024, 2025, 2026] as const) {
      for (let m = 1; m <= 12; m++) {
        const row = byMes[m]
        if (!row) continue
        const raw = row[String(ano)]
        const valor = raw == null ? 0 : Number(raw)
        if (valor <= 0) continue
        out.push({ mes_str: `${MESES_SHORT[m]}-${String(ano).slice(2)}`, valor })
      }
    }
    return out
  })()

  // YTD acumulado como running total continuo (no resetea por año)
  const ytdContinuo: { mes_str: string; acumulado: number }[] = (() => {
    if (!mensualContinuo.length) return []
    let acc = 0
    return mensualContinuo.map(r => {
      acc += r.valor
      return { mes_str: r.mes_str, acumulado: acc }
    })
  })()

  const ytdMax = (() => {
    if (!ytdContinuo.length) return undefined
    const m = Math.max(...ytdContinuo.map(r => r.acumulado))
    if (!m) return undefined
    const step = m >= 20_000_000 ? 5_000_000 : m >= 5_000_000 ? 1_000_000 : m >= 2_000_000 ? 500_000 : m >= 500_000 ? 200_000 : 100_000
    return Math.ceil(m * 1.05 / step) * step
  })()

  const ytdTicks = ytdMax ? (() => {
    const step = ytdMax >= 20_000_000 ? 5_000_000 : ytdMax >= 5_000_000 ? 1_000_000 : ytdMax >= 2_000_000 ? 500_000 : ytdMax >= 500_000 ? 200_000 : 100_000
    return Array.from({ length: Math.floor(ytdMax / step) + 1 }, (_, i) => i * step)
  })() : undefined

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-5">
      {/* Header */}
      <div>
        <p className="text-xs text-gray-400 uppercase tracking-widest">Sell Out</p>
        <h1 className="text-xl md:text-2xl font-bold text-gray-800">Tendencias</h1>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 md:p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <FiltroMulti label="País"      options={paisOpts} value={paises}   onChange={setPaises}   placeholder="Todos los países"     />
          <FiltroMulti label="Categoría" options={catOpts}  value={cats}     onChange={setCats}     placeholder="Todas las categorías" />
          <FiltroMulti label="Cliente"   options={cliOpts}  value={clientes} onChange={setClientes} placeholder="Todos los clientes"   />
          <button onClick={() => cargar(paises, cats, clientes)}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-600 hover:bg-gray-200 transition-colors">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {loading
        ? <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[0,1,2,3].map(i => <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm h-[88px] animate-pulse bg-gray-50" />)}
          </div>
        : data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Ventas YTD 2026"   value={fmtUsd(data.kpis.valor_26)} varPct={data.kpis.var_valor_pct} />
            <KpiCard label="Unidades YTD 2026" value={fmtNum(data.kpis.uds_26)}   varPct={data.kpis.var_uds_pct}   />
            <KpiCard label="Ventas YTD 2025"   value={fmtUsd(data.kpis.valor_25)} sub="Mismo período año anterior" />
            <KpiCard label="Clientes activos"  value={String(data.por_cliente.length)} sub="Cadenas con venta 2026" />
          </div>
        )
      }

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-gray-200 overflow-x-auto">
        {([
          ['evolucion',  'Evolución Anual'],
          ['clientes',   'Por Cliente'],
          ['paises',     'Por País'],
          ['categorias', 'Por Categoría'],
          ['skus',       'Top SKUs'],
        ] as [Tab, string][]).map(([t, lbl]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors -mb-px ${
              tab === t ? 'border-amber-500 text-amber-600' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 h-64 flex items-center justify-center">
          <RefreshCw size={20} className="animate-spin text-gray-300" />
        </div>
      ) : error ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 h-40 flex items-center justify-center text-sm text-red-400">
          Error cargando datos. Intenta de nuevo.
        </div>
      ) : !data ? null : (

        <>
          {/* ── TAB: EVOLUCIÓN ─────────────────────────────────── */}
          {tab === 'evolucion' && (
            <div className="space-y-5">
              {/* Mensual — timeline continuo 2024 → 2026 */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 md:p-5">
                <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700">Venta Neta Mensual</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Timeline continuo 2024 → 2026</p>
                  </div>
                </div>
                <div className="h-[240px] md:h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mensualContinuo} margin={{ top:10, right:12, left:0, bottom:0 }} barCategoryGap="18%">
                      <defs>
                        <linearGradient id="gradTendCont" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#c8873a" stopOpacity={1}/>
                          <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.85}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="mes_str" tick={{ fontSize:10, fill:'#64748b' }} axisLine={false} tickLine={false} interval={mensualContinuo.length > 24 ? 1 : 0} />
                      <YAxis tickFormatter={fmtK} tick={{ fontSize:11, fill:'#94a3b8' }} width={62} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(v: any) => [fmtFull(Number(v)), 'Venta']}
                        cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                        contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                      />
                      <Bar dataKey="valor" name="Venta" fill="url(#gradTendCont)" radius={[6,6,0,0]} maxBarSize={22}>
                        <LabelList dataKey="valor" position="top"
                          formatter={(v: any) => Number(v) > 0 ? fmtK(Number(v)) : ''}
                          style={{ fontSize: 8, fill: '#92400e', fontWeight: 700 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* YTD — acumulado running continuo 2024 → 2026 */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 md:p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-1">Venta Acumulada</h3>
                <p className="text-xs text-gray-400 mb-4">Suma corrida continua Ene-24 → hoy</p>
                <div className="h-[220px] md:h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={ytdContinuo} margin={{ top:4, right:12, left:0, bottom:0 }}>
                      <defs>
                        <linearGradient id="gradTendYtdCont" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor={COLORS['2026']} stopOpacity={0.4}/>
                          <stop offset="60%"  stopColor={COLORS['2026']} stopOpacity={0.1}/>
                          <stop offset="100%" stopColor={COLORS['2026']} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="mes_str" tick={{ fontSize:10, fill: '#64748b' }} axisLine={false} tickLine={false} interval={ytdContinuo.length > 24 ? 1 : 0} />
                      <YAxis
                        tickFormatter={v => v>=1_000_000 ? '$'+(v/1_000_000).toFixed(1)+'M' : '$'+(v/1_000).toFixed(0)+'K'}
                        tick={{ fontSize:11, fill: '#94a3b8' }} width={60} axisLine={false} tickLine={false}
                        domain={[0, ytdMax ?? 'auto']} ticks={ytdTicks}
                      />
                      <Tooltip
                        formatter={(v: any) => [fmtFull(Number(v)), 'Acumulado']}
                        contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                      />
                      <Area type="monotone" dataKey="acumulado" name="Acumulado" stroke={COLORS['2026']} strokeWidth={2.5}
                            fill="url(#gradTendYtdCont)" dot={false}
                            activeDot={{ r: 5, strokeWidth: 2, fill: '#fff', stroke: COLORS['2026'] }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB: POR CLIENTE ───────────────────────────────── */}
          {tab === 'clientes' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Bar chart */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 md:p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Ventas 2026 por Cliente</h3>
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.por_cliente} layout="vertical" margin={{ top:0, right:60, left:4, bottom:0 }} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                      <XAxis type="number" tickFormatter={v => '$'+(v/1000).toFixed(0)+'K'} tick={{ fontSize:10 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="cliente" tick={{ fontSize:11 }} width={78} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v: number) => fmtFull(v)} />
                      <Bar dataKey="valor_2025" name="2025" fill={COLORS['2025']} radius={[0,3,3,0]} maxBarSize={14} />
                      <Bar dataKey="valor_2026" name="2026" fill={COLORS['2026']} radius={[0,3,3,0]} maxBarSize={14} />
                      <Legend wrapperStyle={{ fontSize:11 }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Table */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 md:p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Comparativo 2025 vs 2026</h3>
                <CompTable rows={data.por_cliente} keyCol="cliente" label="Cliente" />
              </div>
            </div>
          )}

          {/* ── TAB: POR PAÍS ──────────────────────────────────── */}
          {tab === 'paises' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 md:p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Ventas 2026 por País</h3>
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.por_pais} layout="vertical" margin={{ top:0, right:60, left:4, bottom:0 }} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                      <XAxis type="number" tickFormatter={v => '$'+(v/1000).toFixed(0)+'K'} tick={{ fontSize:10 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="pais" tick={{ fontSize:11 }} width={36} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v: number) => fmtFull(v)} />
                      <Bar dataKey="valor_2025" name="2025" fill={COLORS['2025']} radius={[0,3,3,0]} maxBarSize={14} />
                      <Bar dataKey="valor_2026" name="2026" fill={COLORS['2026']} radius={[0,3,3,0]} maxBarSize={14} />
                      <Legend wrapperStyle={{ fontSize:11 }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 md:p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Comparativo 2025 vs 2026</h3>
                <CompTable rows={data.por_pais} keyCol="pais" label="País" />
              </div>
            </div>
          )}

          {/* ── TAB: POR CATEGORÍA ─────────────────────────────── */}
          {tab === 'categorias' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 md:p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Categorías 2026</h3>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.por_categoria} layout="vertical" margin={{ top:0, right:60, left:4, bottom:0 }} barCategoryGap="28%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                      <XAxis type="number" tickFormatter={v => '$'+(v/1000).toFixed(0)+'K'} tick={{ fontSize:10 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="categoria" tick={{ fontSize:11 }} width={72} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v: number, n: string) => [fmtFull(v), n]} />
                      <Bar dataKey="valor" name="Valor USD" radius={[0,3,3,0]} maxBarSize={16}>
                        {data.por_categoria.map((_: any, i: number) => (
                          <Cell key={i} fill={i === 0 ? COLORS['2026'] : i === 1 ? COLORS['2025'] : '#a3b4c8'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 md:p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Detalle Categorías</h3>
                <CategoriasDetalleTable rows={data.por_categoria} />
              </div>
            </div>
          )}

          {/* ── TAB: TOP SKUs ──────────────────────────────────── */}
          {tab === 'skus' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 md:p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Top 10 SKUs · 2026 vs 2025</h3>
              <p className="text-xs text-gray-400 mb-4">Agrupado por código de barras</p>
              <TopSkusTendenciasTable rows={data.top_skus} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ═════ Sub-componente: Detalle Categorías (ordenable) ═════ */
function CategoriasDetalleTable({ rows }: { rows: any[] }) {
  type Col = 'categoria' | 'valor' | 'unidades'
  const { toggleSort, sorted, SortArrow } = useTableSort<any, Col>(
    rows, 'valor', 'desc',
    {
      categoria: (a, b) => (a.categoria ?? '').localeCompare(b.categoria ?? ''),
      valor:     (a, b) => (a.valor ?? 0) - (b.valor ?? 0),
      unidades:  (a, b) => (a.unidades ?? 0) - (b.unidades ?? 0),
    },
  )
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-gray-100 text-gray-400 uppercase text-[11px] tracking-wider">
          <SortableTh onClick={() => toggleSort('categoria')} arrow={<SortArrow col="categoria"/>} className="py-2 pr-3">Categoría</SortableTh>
          <SortableTh onClick={() => toggleSort('valor')} arrow={<SortArrow col="valor"/>} align="right" className="py-2 px-2">Valor USD</SortableTh>
          <SortableTh onClick={() => toggleSort('unidades')} arrow={<SortArrow col="unidades"/>} align="right" className="py-2 pl-2">Unidades</SortableTh>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r: any, i: number) => (
          <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
            <td className="py-2 pr-3 font-medium text-gray-700">{r.categoria}</td>
            <td className="text-right py-2 px-2 font-mono text-gray-800 font-semibold">{fmtFull(r.valor)}</td>
            <td className="text-right py-2 pl-2 text-gray-500">{fmtNum(r.unidades)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/* ═════ Sub-componente: Top SKUs Tendencias (ordenable) ═════ */
function TopSkusTendenciasTable({ rows }: { rows: any[] }) {
  type Col = 'descripcion' | 'categoria' | 'valor_2025' | 'valor_2026' | 'var_abs' | 'var_pct' | 'uds_2026'
  const { toggleSort, sorted, SortArrow } = useTableSort<any, Col>(
    rows, 'valor_2026', 'desc',
    {
      descripcion: (a, b) => (a.descripcion ?? '').localeCompare(b.descripcion ?? ''),
      categoria:   (a, b) => (a.categoria ?? '').localeCompare(b.categoria ?? ''),
      valor_2025:  (a, b) => (a.valor_2025 ?? 0) - (b.valor_2025 ?? 0),
      valor_2026:  (a, b) => (a.valor_2026 ?? 0) - (b.valor_2026 ?? 0),
      var_abs:     (a, b) => ((a.valor_2026 ?? 0) - (a.valor_2025 ?? 0)) - ((b.valor_2026 ?? 0) - (b.valor_2025 ?? 0)),
      var_pct:     (a, b) => (a.var_pct ?? -Infinity) - (b.var_pct ?? -Infinity),
      uds_2026:    (a, b) => (a.uds_2026 ?? 0) - (b.uds_2026 ?? 0),
    },
  )
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[680px]">
        <thead>
          <tr className="border-b border-gray-100 text-gray-400 uppercase text-[11px] tracking-wider">
            <th className="text-left py-2 pr-2">#</th>
            <SortableTh onClick={() => toggleSort('descripcion')} arrow={<SortArrow col="descripcion"/>} className="py-2 pr-3">Descripción</SortableTh>
            <SortableTh onClick={() => toggleSort('categoria')} arrow={<SortArrow col="categoria"/>} className="py-2 pr-3">Categoría</SortableTh>
            <SortableTh onClick={() => toggleSort('valor_2025')} arrow={<SortArrow col="valor_2025"/>} align="right" className="py-2 px-2">2025 USD</SortableTh>
            <SortableTh onClick={() => toggleSort('valor_2026')} arrow={<SortArrow col="valor_2026"/>} align="right" className="py-2 px-2">2026 USD</SortableTh>
            <SortableTh onClick={() => toggleSort('var_abs')} arrow={<SortArrow col="var_abs"/>} align="right" className="py-2 px-2">Var $</SortableTh>
            <SortableTh onClick={() => toggleSort('var_pct')} arrow={<SortArrow col="var_pct"/>} align="right" className="py-2 px-2">Var %</SortableTh>
            <SortableTh onClick={() => toggleSort('uds_2026')} arrow={<SortArrow col="uds_2026"/>} align="right" className="py-2 pl-2">Uds 2026</SortableTh>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r: any, i: number) => {
            const vp: number | null = r.var_pct
            const color = vp == null ? 'text-gray-400' : vp >= 0 ? 'text-emerald-600' : 'text-red-500'
            const varAbs = r.valor_2026 - r.valor_2025
            return (
              <tr key={i} className="border-b border-gray-50 hover:bg-amber-50/30 transition-colors">
                <td className="py-2.5 pr-2 text-gray-300 font-mono">{String(i+1).padStart(2,'0')}</td>
                <td className="py-2.5 pr-3 font-medium text-gray-800 max-w-[200px] truncate">{r.descripcion}</td>
                <td className="py-2.5 pr-3 text-gray-500">{r.categoria}</td>
                <td className="text-right py-2.5 px-2 font-mono text-gray-500">{fmtUsd(r.valor_2025)}</td>
                <td className="text-right py-2.5 px-2 font-mono font-semibold text-gray-800">{fmtUsd(r.valor_2026)}</td>
                <td className={`text-right py-2.5 px-2 font-mono font-semibold ${color}`}>
                  {varAbs >= 0 ? '+' : ''}{fmtUsd(varAbs)}
                </td>
                <td className={`text-right py-2.5 px-2 font-semibold ${color}`}>
                  <span className="flex items-center justify-end gap-0.5">
                    {vp != null && (vp >= 0 ? <TrendingUp size={10}/> : <TrendingDown size={10}/>)}
                    {fmtPct(vp)}
                  </span>
                </td>
                <td className="text-right py-2.5 pl-2 text-gray-500">{fmtNum(r.uds_2026)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
