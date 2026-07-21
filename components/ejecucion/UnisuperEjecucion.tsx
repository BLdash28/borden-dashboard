'use client'
import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { TrendingUp, TrendingDown, Minus, Download } from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, LabelList,
  ResponsiveContainer, Cell,
} from 'recharts'
import MultiSelect from '@/components/dashboard/MultiSelect'
import ChartSkeleton from '@/components/ui/ChartSkeleton'

// InnovacionesSection es lazy — ya lo era en la implementación anterior
const InnovacionesSection = dynamic(
  () => import('@/components/ejecucion/InnovacionesSection'),
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
}

const SECTIONS = [
  { key: 'resumen',       label: 'Resumen'      },
  { key: 'evolucion',     label: 'Evolución'    },
  { key: 'cobertura',     label: 'Cobertura'    },
  { key: 'inventarios',   label: 'Inventarios'  },
  { key: 'pareto',        label: 'Pareto SKUs'  },
  { key: 'innovaciones',  label: 'Innovaciones' },
] as const
type SectionKey = typeof SECTIONS[number]['key']

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

interface CobData {
  universo: number
  cobertura_efectiva: number
  por_cadena: { cadena: string; pdvs_activos: number; skus: number; uds: number; cobertura_pct: number }[]
  por_sku:    { sku: string; descripcion: string; subcategoria: string; pdvs_con_venta: number; universo: number; cobertura_pct: number; uds_90d: number; valor_90d: number }[]
}

interface InvData {
  disponible: boolean
  kpis?: { fecha_tiendas: string | null; pdv_inv: number; pdv_valor: number; pdv_tiendas_dist: number; skus_total: number }
  rows?: { sku: string; codigo_barras: string; descripcion: string; subcategoria: string; cadena: string; punto_venta: string; inv_mano: number }[]
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

export default function UnisuperEjecucion() {
  const [section, setSection] = useState<SectionKey>('resumen')

  // Filtros
  const [cadenasSel,  setCadenasSel]  = useState<string[]>([])
  const [subcatsSel,  setSubcatsSel]  = useState<string[]>([])
  const [pdvsSel,     setPdvsSel]     = useState<string[]>([])
  const [skusSel,     setSkusSel]     = useState<string[]>([])
  const [showFiltros, setShowFiltros] = useState(false)

  const [opts, setOpts] = useState<FiltrosOpts | null>(null)

  // Data por sección
  const [kpis, setKpis] = useState<KpisData | null>(null)
  const [cob,  setCob]  = useState<CobData  | null>(null)
  const [inv,  setInv]  = useState<InvData  | null>(null)
  const [top,  setTop]  = useState<TopSku[]>([])
  const [topN, setTopN] = useState(50)

  const [loading, setLoading] = useState<Record<SectionKey, boolean>>({
    resumen: false, evolucion: false, cobertura: false, inventarios: false, pareto: false, innovaciones: false,
  })

  const filterQS = useMemo(() => {
    const p = new URLSearchParams()
    if (cadenasSel.length) p.set('cadenas',       cadenasSel.join(','))
    if (subcatsSel.length) p.set('subcategorias', subcatsSel.join(','))
    if (pdvsSel.length)    p.set('punto_venta',   pdvsSel.join(','))
    if (skusSel.length)    p.set('skus',          skusSel.join(','))
    return p.toString()
  }, [cadenasSel, subcatsSel, pdvsSel, skusSel])

  // Cargar opciones de filtros al mount
  useEffect(() => {
    fetch('/api/comercial/ejecucion/gt/unisuper/filtros-opciones')
      .then(r => r.json()).then(setOpts).catch(() => {})
  }, [])

  // Cargar data según sección + filtros
  useEffect(() => {
    if (section === 'resumen' || section === 'evolucion') {
      setLoading(l => ({ ...l, [section]: true }))
      fetch('/api/comercial/ejecucion/gt/unisuper/kpis?' + filterQS)
        .then(r => r.json()).then(setKpis)
        .finally(() => setLoading(l => ({ ...l, [section]: false })))
    } else if (section === 'cobertura') {
      setLoading(l => ({ ...l, cobertura: true }))
      fetch('/api/comercial/ejecucion/gt/unisuper/cobertura?' + filterQS)
        .then(r => r.json()).then(setCob)
        .finally(() => setLoading(l => ({ ...l, cobertura: false })))
    } else if (section === 'inventarios') {
      setLoading(l => ({ ...l, inventarios: true }))
      fetch('/api/comercial/ejecucion/gt/unisuper/inventario?' + filterQS)
        .then(r => r.json()).then(setInv)
        .finally(() => setLoading(l => ({ ...l, inventarios: false })))
    } else if (section === 'pareto') {
      setLoading(l => ({ ...l, pareto: true }))
      fetch('/api/comercial/ejecucion/gt/unisuper/top-skus?top=' + topN + '&' + filterQS)
        .then(r => r.json()).then(d => setTop(d.rows ?? []))
        .finally(() => setLoading(l => ({ ...l, pareto: false })))
    }
  }, [section, filterQS, topN])

  const limpiarFiltros = () => {
    setCadenasSel([]); setSubcatsSel([]); setPdvsSel([]); setSkusSel([])
  }
  const hayFiltros = cadenasSel.length + subcatsSel.length + pdvsSel.length + skusSel.length > 0

  // ── Render helpers ───────────────────────────────────────────────────────
  const Resumen = () => {
    if (loading.resumen) return <ChartSkeleton />
    if (!kpis) return null
    const soPrev = kpis.ytd_2025
    return (
      <div className="space-y-5">
        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Venta 2026 YTD" value={fmt$(kpis.ytd_2026)} sub={`vs ${fmt$(soPrev)}`} delta={kpis.delta_ytd} color="#c8873a" />
          <Kpi label="Unidades 2026" value={fmtNum(kpis.uni_2026)} sub="acumulado" color="#3a6fa8" />
          <Kpi label="Cadenas activas" value={String(kpis.por_cadena.filter(c => c.valor_2026 > 0).length)} sub={`de ${kpis.por_cadena.length}`} color="#2a7a58" />
          <Kpi label="Último dato" value={kpis.ultima_fecha ? String(kpis.ultima_fecha).slice(0, 10) : '—'} sub={kpis.ultimo_mes_nombre + ' 2026'} color="#a04d3a" />
        </div>

        {/* Por cadena — tabla */}
        {kpis.por_cadena.length > 0 && (
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
                  {kpis.por_cadena.map((c, i) => {
                    const pct = kpis.ytd_2026 > 0 ? (c.valor_2026 / kpis.ytd_2026) * 100 : 0
                    return (
                      <tr key={c.cadena} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                                style={{ background: CADENA_COLORS[c.cadena] ?? '#6b7280' }}>
                            {c.cadena}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-gray-800">{fmt$(c.valor_2026)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{fmtNum(c.uni_2026)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">{c.valor_2025 > 0 ? fmt$(c.valor_2025) : <span className="text-gray-300">—</span>}</td>
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

        {/* Chart mensual 2025 vs 2026 */}
        {kpis.monthly.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">📈 Evolución mensual · 2025 vs 2026</h3>
            <div className="h-[300px]">
              <ResponsiveContainer>
                <BarChart data={kpis.monthly} margin={{ top: 12, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="uni-y25" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.5} />
                    </linearGradient>
                    <linearGradient id="uni-y26" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#c8873a" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#c8873a" stopOpacity={0.55} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="mes_nombre" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} width={55} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: any) => fmt$(Number(v))}
                           contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  <Bar dataKey="y2025" name="2025" fill="url(#uni-y25)" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="y2026" name="2026" fill="url(#uni-y26)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Por subcategoría */}
        {kpis.por_categoria.length > 0 && (
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
                  {kpis.por_categoria.map((c, i) => {
                    const pct = kpis.ytd_2026 > 0 ? (c.valor_2026 / kpis.ytd_2026) * 100 : 0
                    return (
                      <tr key={c.categoria} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className="px-3 py-2.5 font-medium text-gray-700">{c.categoria}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{fmt$(c.valor_2026)}</td>
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
    // Reutiliza el mismo dataset que Resumen pero muestra solo el chart mensual grande
    if (loading.evolucion) return <ChartSkeleton />
    if (!kpis) return null
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">📈 Evolución mensual detallada · 2025 vs 2026</h3>
        <div className="h-[400px]">
          <ResponsiveContainer>
            <ComposedChart data={kpis.monthly} margin={{ top: 12, right: 30, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="uni-ev-25" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.5} />
                </linearGradient>
                <linearGradient id="uni-ev-26" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#c8873a" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#c8873a" stopOpacity={0.55} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="mes_nombre" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tickFormatter={fmtK} tick={{ fontSize: 11 }} width={55} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={fmtNum} tick={{ fontSize: 11 }} width={55} />
              <Tooltip formatter={(v: any, n: string) => n.startsWith('u') ? fmtNum(Number(v)) + ' und' : fmt$(Number(v))}
                       contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
              <Bar yAxisId="left" dataKey="y2025" name="Valor 2025" fill="url(#uni-ev-25)" radius={[8, 8, 0, 0]} />
              <Bar yAxisId="left" dataKey="y2026" name="Valor 2026" fill="url(#uni-ev-26)" radius={[8, 8, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="u2026" name="Unidades 2026" stroke="#1d4ed8" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
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
                    <th className="px-3 py-2.5 text-right bg-blue-50 text-blue-700">SKUs/PDV</th>
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
                      <td className="px-3 py-2.5 text-right tabular-nums bg-blue-50/40 font-bold text-blue-700">{c.cobertura_pct.toFixed(1)}%</td>
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
              <h3 className="text-sm font-semibold text-gray-700">📦 Cobertura por SKU</h3>
              <p className="text-[11px] text-gray-400">PDVs donde se ha vendido el SKU / universo total</p>
            </div>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider sticky top-0">
                  <tr>
                    <th className="px-3 py-2.5 text-left">SKU</th>
                    <th className="px-3 py-2.5 text-left">Producto</th>
                    <th className="px-3 py-2.5 text-left">Subcat</th>
                    <th className="px-3 py-2.5 text-right">PDVs</th>
                    <th className="px-3 py-2.5 text-right bg-blue-50 text-blue-700">Cobertura</th>
                    <th className="px-3 py-2.5 text-right">Uds 90d</th>
                    <th className="px-3 py-2.5 text-right">Valor 90d</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {cob.por_sku.map(r => (
                    <tr key={r.sku} className="hover:bg-gray-50/60">
                      <td className="px-3 py-2 font-mono text-[10px] text-gray-500">{r.sku}</td>
                      <td className="px-3 py-2 font-medium text-gray-700">{r.descripcion}</td>
                      <td className="px-3 py-2 text-gray-400 text-[10px]">{r.subcategoria}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.pdvs_con_venta}/{r.universo}</td>
                      <td className="px-3 py-2 text-right tabular-nums bg-blue-50/30 font-bold text-blue-700">{r.cobertura_pct.toFixed(1)}%</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtNum(r.uds_90d)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmt$(r.valor_90d)}</td>
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
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Unidades en tienda" value={fmtNum(k.pdv_inv)} sub={k.fecha_tiendas ?? ''} color="#3a6fa8" />
          <Kpi label="Valor inventario" value={'Q' + Math.round(k.pdv_valor).toLocaleString('en-US')} sub="GTQ" color="#c8873a" />
          <Kpi label="Tiendas con stock" value={fmtNum(k.pdv_tiendas_dist)} color="#2a7a58" />
          <Kpi label="SKUs en snapshot" value={String(k.skus_total)} color="#a04d3a" />
        </div>

        {inv.rows && inv.rows.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50">
              <h3 className="text-sm font-semibold text-gray-700">🏬 Inventario por SKU × Tienda</h3>
              <p className="text-[11px] text-gray-400">{inv.rows.length.toLocaleString('en-US')} filas · snapshot {k.fecha_tiendas}</p>
            </div>
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider sticky top-0">
                  <tr>
                    <th className="px-3 py-2.5 text-left">SKU</th>
                    <th className="px-3 py-2.5 text-left">Producto</th>
                    <th className="px-3 py-2.5 text-left">Cadena</th>
                    <th className="px-3 py-2.5 text-left">Tienda</th>
                    <th className="px-3 py-2.5 text-right">Unidades</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {inv.rows.slice(0, 500).map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50/60">
                      <td className="px-3 py-2 font-mono text-[10px] text-gray-500">{r.sku}</td>
                      <td className="px-3 py-2 font-medium text-gray-700 max-w-[280px] truncate">{r.descripcion}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold text-white"
                              style={{ background: CADENA_COLORS[r.cadena] ?? '#6b7280' }}>{r.cadena}</span>
                      </td>
                      <td className="px-3 py-2 text-gray-600 max-w-[180px] truncate">{r.punto_venta}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtNum(r.inv_mano)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {inv.rows.length > 500 && (
                <p className="text-center py-3 text-[11px] text-gray-400 bg-gray-50">Mostrando primeras 500 filas de {inv.rows.length.toLocaleString('en-US')}</p>
              )}
            </div>
          </div>
        )}
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
          <p className="text-xs text-gray-400 mb-4">Valor en dólares · curva acumulada · hover para ver nombre completo</p>
          <div style={{ height: Math.max(360, 260 + top.length * 4) }}>
            <ResponsiveContainer>
              <ComposedChart data={top} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="descripcion" tick={{ fontSize: 10, fill: '#475569' }}
                       interval={0} angle={-55} textAnchor="end" height={170}
                       tickFormatter={(v: string) => v && v.length > 26 ? v.slice(0, 24) + '…' : v} />
                <YAxis yAxisId="left"  tickFormatter={fmtK} tick={{ fontSize: 11 }} width={50} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={v => v + '%'} tick={{ fontSize: 11 }} width={35} domain={[0, 100]} />
                <Tooltip formatter={(v: any, n: string) => n === 'Acumulado %' ? v + '%' : fmtFull(Number(v))}
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
            {grandTotal > 0 && <span className="text-xs font-semibold text-gray-500">{fmtFull(grandTotal)} total</span>}
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
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmt$(r.valor_2026)}</td>
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

  const renderSection = () => {
    switch (section) {
      case 'resumen':      return <Resumen />
      case 'evolucion':    return <Evolucion />
      case 'cobertura':    return <Cobertura />
      case 'inventarios':  return <Inventarios />
      case 'pareto':       return <Pareto />
      case 'innovaciones': return (
        <InnovacionesSection
          apiUrl="/api/comercial/ejecucion/gt/unisuper/innovaciones"
          titulo="Unisuper · Guatemala"
          subtitulo="🇬🇹 Detección automática: SKUs con primera venta en los últimos 180 días."
          monedaLabel="USD"
        />
      )
      default: return <Resumen />
    }
  }

  return (
    <div className="space-y-5">
      {/* Header con filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="px-5 py-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-400">Ejecución</p>
            <h1 className="text-lg font-bold text-gray-800">🇬🇹 Unisuper · Guatemala</h1>
          </div>
          <button onClick={() => setShowFiltros(v => !v)}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
            {showFiltros ? '▲ Ocultar filtros' : '▼ Mostrar filtros'}
            {hayFiltros && <span className="ml-2 text-amber-600 font-bold">·</span>}
          </button>
        </div>

        {showFiltros && opts && (
          <div className="px-5 pb-5 border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-widest text-gray-400">Filtros</p>
              {hayFiltros && (
                <button onClick={limpiarFiltros} className="text-xs text-gray-400 hover:text-gray-600 underline">
                  ↺ Limpiar todo
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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

      {/* Contenido */}
      <div>{renderSection()}</div>
    </div>
  )
}
