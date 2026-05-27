'use client'
import { useEffect, useState, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import FiltroMulti from '@/components/ui/FiltroMulti'
import {
  BarChart, Bar, LineChart, Line, ComposedChart,
  XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, LabelList,
  ReferenceLine, Customized,
} from 'recharts'

const PAISES_OPT = ['CR','GT','SV','NI','HN','CO'].map(p => ({ value: p }))
const CATS_OPT   = ['Quesos','Leches','Helados'].map(c => ({ value: c }))
const MESES      = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const MESES_FULL = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const COLORS = { '2024': '#d1d5db', '2025': '#60a5fa', '2026': '#c8873a' }

const fmtK = (v: number) => {
  if (v === 0) return '0'
  if (Math.abs(v) >= 1000) return (v / 1000).toFixed(2).replace('.00','') + 'k'
  return v % 1 === 0 ? String(v) : v.toFixed(0)
}
const fmtPrecio  = (v: number) => v % 1 === 0 ? String(v) : parseFloat(v.toFixed(2)).toString()
const fmtPct     = (v: number | null) => v === null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%'
const fmtUsd     = (v: number) => {
  if (v === 0) return '$0'
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M'
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K'
  return '$' + v.toFixed(0)
}
const fmtFull    = (v: number) =>
  '$' + (isFinite(v) ? v : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface Punto {
  mes_label: string
  ventas_unidades: number
  ventas_valor: number
  precio_usd_unidad: number
  var_unidades?: number | null
  var_precio?: number | null
}

// Label sobre barras
const BarLabel = ({ x, y, width, value, formatter }: any) => {
  if (value === 0 || value == null) return null
  return (
    <text x={x + width / 2} y={y - 4} textAnchor="middle" fontSize={10} fill="#374151" fontWeight={500}>
      {formatter(value)}
    </text>
  )
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 text-white rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="font-bold mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="flex gap-2 justify-between">
          <span style={{ color: p.color }}>{p.name}:</span>
          <span className="font-mono font-semibold">{p.name === 'Precio Usd / Unidad' ? fmtPrecio(p.value) : fmtK(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

const VarTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 text-white rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="font-bold mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="flex gap-2 justify-between">
          <span style={{ color: p.fill }}>{p.name}:</span>
          <span className="font-mono font-semibold">{fmtPct(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

function MonthDividers(props: any) {
  const xAxis = props.xAxisMap?.[0]
  const yAxis = props.yAxisMap?.[0]
  if (!xAxis?.scale) return null
  const domain: number[] = xAxis.scale.domain?.() ?? []
  const bw: number       = xAxis.scale.bandwidth?.() ?? 0
  const mt = props.margin?.top ?? 0
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

function LineMonthDividers(props: any) {
  const xAxis = props.xAxisMap?.[0]
  const yAxis = props.yAxisMap?.[0]
  if (!xAxis?.scale) return null
  const domain: string[] = xAxis.scale.domain?.() ?? []
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

export default function TendenciasPage() {
  const [tab,       setTab]       = useState<'tendencias' | 'variaciones' | 'evolucion'>('tendencias')
  const [paises,    setPaises]    = useState<string[]>([])
  const [cats,      setCats]      = useState<string[]>([])
  const [formatos,  setFormatos]  = useState<string[]>([])
  const [fmtOpts,   setFmtOpts]   = useState<{value:string}[]>([])
  const [puntos,    setPuntos]    = useState<Punto[]>([])
  const [varData,   setVarData]   = useState<Punto[]>([])
  const [mensual,   setMensual]   = useState<any[]>([])
  const [ytdData,   setYtdData]   = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)

  const cargar = useCallback(async (ps: string[], cs: string[], fs: string[]) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ meses: '13' })
      if (ps.length) qs.set('pais',      ps.join(','))
      if (cs.length) qs.set('categoria', cs.join(','))
      if (fs.length) qs.set('formato',   fs.join(','))

      const eQs = new URLSearchParams()
      if (ps.length) eQs.set('pais',      ps.join(','))
      if (cs.length) eQs.set('categoria', cs.join(','))

      const [tRes, eRes] = await Promise.all([
        fetch('/api/comercial/sellout/tendencias?' + qs),
        fetch('/api/comercial/sellout/evolucion?' + eQs),
      ])
      if (!tRes.ok) throw new Error()
      const j = await tRes.json()
      setPuntos(j.puntos ?? [])
      setVarData(j.variaciones ?? [])
      if (j.available_formatos?.length && fmtOpts.length === 0)
        setFmtOpts(j.available_formatos.map((f: string) => ({ value: f })))

      if (eRes.ok) {
        const ej = await eRes.json()
        // mensual already pivoted: [{ mes, 2024, 2025, 2026 }]
        setMensual((ej.mensual ?? []).map((r: any) => ({ ...r, mes_label: MESES[r.mes] ?? String(r.mes) })))
        // ytd: [{ ano, vals: [acc1..acc12] }] → transform to [{ mes, "2024": x, "2025": x, "2026": x }]
        const ytdRaw: { ano: number; vals: (number | null)[] }[] = ej.ytd ?? []
        const ytdRows = Array.from({ length: 12 }, (_, i) => {
          const row: any = { mes: MESES[i + 1] }
          ytdRaw.forEach(s => { row[String(s.ano)] = s.vals[i] ?? null })
          return row
        })
        setYtdData(ytdRows)
      }
    } catch {
      setPuntos([])
      setVarData([])
      setMensual([])
      setYtdData([])
    } finally { setLoading(false) }
  }, [fmtOpts.length])

  useEffect(() => { cargar(paises, cats, formatos) }, [cargar, paises, cats, formatos])

  // YTD Y-axis scale — ticks cada $500K
  const { ytdYMax, ytdTicks } = (() => {
    let max = 0
    for (const d of ytdData) {
      for (const k of ['2024','2025','2026']) {
        if (d[k] != null) max = Math.max(max, d[k])
      }
    }
    if (max === 0) return { ytdYMax: undefined, ytdTicks: undefined }
    const step    = 500_000
    const ceiling = Math.ceil(max * 1.05 / step) * step
    const ticks   = Array.from({ length: Math.floor(ceiling / step) + 1 }, (_, i) => i * step)
    return { ytdYMax: ceiling, ytdTicks: ticks }
  })()

  const data = tab === 'tendencias' ? puntos : varData

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-5">
      {/* Header */}
      <div>
        <p className="text-xs text-gray-400 uppercase tracking-widest">Sell Out</p>
        <h1 className="text-xl md:text-2xl font-bold text-gray-800">Tendencias</h1>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-gray-200 overflow-x-auto">
        {(['tendencias', 'variaciones', 'evolucion'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}>
            {t === 'tendencias' ? 'Tendencias' : t === 'variaciones' ? 'Tendencia Variaciones %' : 'Evolución de Ventas'}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <FiltroMulti label="País"      options={PAISES_OPT} value={paises}   onChange={setPaises}   placeholder="Todos los países" />
          <FiltroMulti label="Categoría" options={CATS_OPT}   value={cats}     onChange={setCats}     placeholder="Todas las categorías" />
          <FiltroMulti label="Formato"   options={fmtOpts}    value={formatos} onChange={setFormatos} placeholder="Todos los formatos" />
          <button onClick={() => cargar(paises, cats, formatos)}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-600 hover:bg-gray-200">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Gráficos */}
      {loading
        ? <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 h-80 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
        : tab === 'evolucion'
          ? (
            <div className="space-y-5">
              {/* Mensual */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 md:p-5">
                <h3 className="text-xs md:text-sm font-semibold text-gray-700 mb-3 md:mb-4">Venta Neta Mensual — 2024 / 2025 / 2026</h3>
                {mensual.length === 0
                  ? <div className="h-40 md:h-52 flex items-center justify-center text-gray-400 text-sm">Sin datos.</div>
                  : (
                    <div className="h-[160px] md:h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={mensual} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="mes_label" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={v => '$'+(v/1000).toFixed(0)+'K'} tick={{ fontSize: 11 }} width={52} />
                        <Tooltip
                          formatter={(v: number) => fmtFull(v)}
                          labelFormatter={(l: string) => MESES_FULL[MESES.indexOf(l)] ?? l}
                          position={{ y: 170 }}
                          allowEscapeViewBox={{ y: true }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="2024" name="2024" fill={COLORS['2024']} radius={[3,3,0,0]} maxBarSize={22} />
                        <Bar dataKey="2025" name="2025" fill={COLORS['2025']} radius={[3,3,0,0]} maxBarSize={22} />
                        <Bar dataKey="2026" name="2026" fill={COLORS['2026']} radius={[3,3,0,0]} maxBarSize={22} />
                        <Customized component={MonthDividers} />
                      </BarChart>
                    </ResponsiveContainer>
                    </div>
                  )
                }
              </div>

              {/* YTD acumulado */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 md:p-5">
                <h3 className="text-xs md:text-sm font-semibold text-gray-700 mb-0.5 md:mb-1">Venta Acumulada</h3>
                <p className="text-xs text-gray-400 mb-3 md:mb-4">Suma corrida mes a mes</p>
                {ytdData.length === 0
                  ? <div className="h-52 md:h-80 flex items-center justify-center text-gray-400 text-sm">Sin datos.</div>
                  : (
                    <div className="h-[220px] md:h-[360px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={ytdData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis
                          tickFormatter={v => v >= 1_000_000 ? '$' + (v / 1_000_000).toFixed(1) + 'M' : '$' + (v / 1_000).toFixed(0) + 'K'}
                          tick={{ fontSize: 11 }}
                          width={60}
                          domain={[0, ytdYMax ?? 'auto']}
                          ticks={ytdTicks}
                        />
                        <Tooltip content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null
                          const v25 = payload.find(p => p.dataKey === '2025')?.value as number | null
                          const v26 = payload.find(p => p.dataKey === '2026')?.value as number | null
                          const pct = v25 && v26 && v25 > 0 ? ((v26 - v25) / v25) * 100 : null
                          return (
                            <div className="bg-white border border-gray-200 rounded-lg shadow-md px-3 py-2 text-xs">
                              <p className="font-semibold text-gray-700 mb-1">{MESES_FULL[MESES.indexOf(label)] ?? label}</p>
                              {payload.map((p: any) => (
                                <p key={p.dataKey} style={{ color: p.stroke }} className="leading-5">
                                  {p.name}: {p.value != null ? fmtFull(p.value) : '—'}
                                  {p.dataKey === '2026' && pct != null && (
                                    <span className={`ml-1.5 font-semibold ${pct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                      ({pct >= 0 ? '+' : ''}{pct.toFixed(1)}% vs 2025)
                                    </span>
                                  )}
                                </p>
                              ))}
                            </div>
                          )
                        }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line type="monotone" dataKey="2024" name="2024" stroke={COLORS['2024']} strokeWidth={2} dot={false} connectNulls={false} />
                        <Line type="monotone" dataKey="2025" name="2025" stroke={COLORS['2025']} strokeWidth={2} dot={false} connectNulls={false} />
                        <Line type="monotone" dataKey="2026" name="2026" stroke={COLORS['2026']} strokeWidth={2} dot={false} connectNulls={false} />
                        <Customized component={LineMonthDividers} />
                      </LineChart>
                    </ResponsiveContainer>
                    </div>
                  )
                }
              </div>
            </div>
          )
          : data.length === 0
            ? <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 h-80 flex items-center justify-center text-gray-400 text-sm">Sin datos disponibles.</div>
            : (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 md:p-5">
                {tab === 'tendencias'
                  ? (
                    <>
                      <p className="text-xs md:text-sm text-gray-500 mb-3 md:mb-4">
                        Tendencia en Usd al día: {new Date().toLocaleDateString('es-CR', { day:'2-digit', month:'short' }).replace(' ','/').replace('.','')}</p>
                      <div className="h-[260px] md:h-[420px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={puntos} margin={{ top: 28, right: 30, left: 10, bottom: 5 }} barGap={4}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                          <XAxis dataKey="mes_label" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                          <YAxis yAxisId="precio" orientation="left"
                            tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false}
                            label={{ value: 'Precio Usd / Unidad', angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 10, fill: '#9ca3af' } }} />
                          <YAxis yAxisId="unidades" orientation="right"
                            tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false}
                            label={{ value: 'Ventas Unidades', angle: 90, position: 'insideRight', offset: 10, style: { fontSize: 10, fill: '#9ca3af' } }} />
                          <Tooltip content={<CustomTooltip />} />
                          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                          <Bar yAxisId="precio" dataKey="precio_usd_unidad" name="Precio Usd / Unidad"
                            fill="#2dd4bf" radius={[3,3,0,0]} maxBarSize={40}>
                            <LabelList content={<BarLabel formatter={fmtPrecio} />} />
                          </Bar>
                          <Bar yAxisId="unidades" dataKey="ventas_unidades" name="Ventas Unidades"
                            fill="#374151" radius={[3,3,0,0]} maxBarSize={40}>
                            <LabelList content={<BarLabel formatter={fmtK} />} />
                          </Bar>
                        </ComposedChart>
                      </ResponsiveContainer>
                      </div>
                    </>
                  )
                  : (
                    <>
                      <p className="text-xs md:text-sm text-gray-500 mb-3 md:mb-4">Variación mes a mes (%)</p>
                      <div className="h-[260px] md:h-[420px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={varData.slice(1)} margin={{ top: 28, right: 30, left: 10, bottom: 5 }} barGap={4}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                          <XAxis dataKey="mes_label" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false}
                            tickFormatter={v => v + '%'} />
                          <ReferenceLine y={0} stroke="#d1d5db" />
                          <Tooltip content={<VarTooltip />} />
                          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                          <Bar dataKey="var_unidades" name="Var. Unidades %"
                            fill="#2dd4bf" radius={[3,3,0,0]} maxBarSize={40}>
                            <LabelList content={<BarLabel formatter={(v: number) => fmtPct(v)} />} />
                          </Bar>
                          <Bar dataKey="var_precio" name="Var. Precio %"
                            fill="#374151" radius={[3,3,0,0]} maxBarSize={40}>
                            <LabelList content={<BarLabel formatter={(v: number) => fmtPct(v)} />} />
                          </Bar>
                        </ComposedChart>
                      </ResponsiveContainer>
                      </div>
                    </>
                  )
                }
              </div>
            )
      }
    </div>
  )
}
