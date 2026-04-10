'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import BarChartPro from '@/components/dashboard/BarChartPro'
import { DollarSign, TrendingUp, TrendingDown, AlertTriangle, Award, RefreshCw } from 'lucide-react'

// Fórmulas: Margen = Precio venta − Costo · Ganancia % = (Margen / Precio venta) × 100

const sel = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"

function fmt4(n: any) { return Number(n || 0).toFixed(4) }
function fmt2(n: any) { return Number(n || 0).toFixed(2) }
function toNum(v: any) { return isNaN(Number(v)) ? 0 : Number(v) }

const ESTADO_CFG = {
  critico:    { label: 'Crítico (<10%)',  bg: 'bg-red-50',     border: 'border-red-100',    text: 'text-red-700',    badge: 'bg-red-100 text-red-700',        bar: '#ef4444' },
  bajo:       { label: 'Bajo (10–20%)',   bg: 'bg-amber-50',   border: 'border-amber-100',  text: 'text-amber-700',  badge: 'bg-amber-100 text-amber-700',    bar: '#f59e0b' },
  ok:         { label: 'OK (≥20%)',       bg: 'bg-emerald-50', border: 'border-emerald-100',text: 'text-emerald-700',badge: 'bg-emerald-100 text-emerald-700',bar: '#10b981' },
  sin_precio: { label: 'Sin precio ref.', bg: 'bg-gray-50',    border: 'border-gray-100',   text: 'text-gray-500',   badge: 'bg-gray-100 text-gray-500',      bar: '#d1d5db' },
}

interface CostoRow {
  pais: string; sku: string; descripcion: string
  costo: any; fuente_costo: string; fecha_costo: string
  precio_venta: any; margen: any; ganancia_pct: any
  estado_margen: 'critico'|'bajo'|'ok'|'sin_precio'
}

export default function CostosPage() {
  const [rows,    setRows]    = useState<CostoRow[]>([])
  const [kpis,    setKpis]    = useState<any>(null)
  const [skus,    setSkus]    = useState<{ sku: string; descripcion?: string }[]>([])

  const [fSku,    setFSku]    = useState('Todos')
  const [fEstado, setFEstado] = useState('Todos')
  const [loading, setLoading] = useState(true)
  const [empty,   setEmpty]   = useState(false)
  const debounceT = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    fetch('/api/operaciones/ventas/costos?tipo=filtros')
      .then(r => r.json())
      .then(j => setSkus(j.skus || []))
      .catch(() => {})
  }, [])

  const fetchData = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams()
    if (fSku !== 'Todos') p.set('sku', fSku)
    const q = p.toString()

    Promise.all([
      fetch(`/api/operaciones/ventas/costos?tipo=kpis&${q}`).then(r => r.json()),
      fetch(`/api/operaciones/ventas/costos?tipo=margen&${q}`).then(r => r.json()),
    ]).then(([kJ, rJ]) => {
      if (rJ.empty) { setEmpty(true); setLoading(false); return }
      setEmpty(false); setKpis(kJ); setRows(rJ.rows || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [fSku])

  useEffect(() => {
    clearTimeout(debounceT.current)
    debounceT.current = setTimeout(fetchData, 300)
  }, [fetchData])

  const filtered   = fEstado === 'Todos' ? rows : rows.filter(r => r.estado_margen === fEstado)
  const alertas    = rows.filter(r => r.estado_margen === 'critico' || r.estado_margen === 'bajo')

  const chartData  = [...rows]
    .filter(r => r.ganancia_pct != null)
    .sort((a, b) => toNum(a.ganancia_pct) - toNum(b.ganancia_pct))
    .slice(0, 15)
    .map(r => ({
      nombre:   (r.descripcion || r.sku)?.slice(0, 24),
      ganancia: toNum(r.ganancia_pct),
      estado:   r.estado_margen,
    }))

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Operaciones · Ventas</p>
          <h1 className="text-2xl font-bold text-gray-800">Costos y Márgenes</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Margen = Precio venta − Costo · Ganancia % = (Margen / Precio venta) × 100 · Umbral alerta: &lt;20%
          </p>
        </div>
        <button onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Filtros</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">SKU</label>
            <select value={fSku} onChange={e => setFSku(e.target.value)} className={sel}>
              <option value="Todos">Todos</option>
              {skus.map(s => <option key={s.sku} value={s.sku}>{s.descripcion || s.sku}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Estado</label>
            <select value={fEstado} onChange={e => setFEstado(e.target.value)} className={sel}>
              <option value="Todos">Todos</option>
              <option value="critico">Crítico (&lt;10%)</option>
              <option value="bajo">Bajo (10–20%)</option>
              <option value="ok">OK (≥20%)</option>
              <option value="sin_precio">Sin precio ref.</option>
            </select>
          </div>
        </div>
      </div>

      {/* Empty */}
      {empty && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-16 text-center">
          <DollarSign className="mx-auto mb-3 text-gray-200" size={48} />
          <p className="font-medium text-gray-600">No hay datos de costos ni precios</p>
          <p className="text-sm text-gray-400 mt-1">
            Registra compras en <strong className="text-amber-600">Barrel &amp; Block</strong> y
            define precios en <strong className="text-blue-600">Control de Precio</strong>
          </p>
        </div>
      )}

      {!empty && (
        <>
          {/* KPIs — fila 1 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Ganancia % promedio',  val: fmt2(kpis?.ganancia_promedio_pct) + '%', accent: 'border-l-emerald-500', icon: TrendingUp   },
              { label: 'Margen prom. unitario', val: fmt4(kpis?.margen_promedio),             accent: 'border-l-blue-500',    icon: DollarSign   },
              { label: 'Ganancia % máxima',    val: fmt2(kpis?.ganancia_maxima_pct) + '%',   accent: 'border-l-amber-500',   icon: TrendingUp   },
              { label: 'Ganancia % mínima',    val: fmt2(kpis?.ganancia_minima_pct) + '%',   accent: 'border-l-red-400',     icon: TrendingDown },
            ].map(k => (
              <div key={k.label} className={`bg-white rounded-xl border border-gray-100 shadow-sm p-5 border-l-4 ${k.accent}`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{k.label}</p>
                  <k.icon size={16} className="text-gray-300" />
                </div>
                {loading
                  ? <div className="h-7 w-20 bg-gray-100 rounded animate-pulse" />
                  : <p className="text-2xl font-bold text-gray-800">{k.val}</p>}
              </div>
            ))}
          </div>

          {/* KPIs — fila 2 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'SKUs analizados', val: toNum(kpis?.total_skus),      accent: 'border-l-purple-500' },
              { label: 'SKUs críticos',   val: toNum(kpis?.skus_criticos),   accent: 'border-l-red-400'    },
              { label: 'Margen bajo',     val: toNum(kpis?.skus_bajo_margen),accent: 'border-l-amber-500'  },
              { label: 'Margen OK',       val: toNum(kpis?.skus_ok),         accent: 'border-l-emerald-500'},
            ].map(k => (
              <div key={k.label} className={`bg-white rounded-xl border border-gray-100 shadow-sm p-5 border-l-4 ${k.accent}`}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">{k.label}</p>
                {loading
                  ? <div className="h-7 w-12 bg-gray-100 rounded animate-pulse" />
                  : <p className="text-2xl font-bold text-gray-800">{k.val}</p>}
              </div>
            ))}
          </div>

          {/* SKU más/menos rentable */}
          {!loading && (kpis?.sku_mas_rentable || kpis?.sku_menos_rentable) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {kpis?.sku_mas_rentable && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-3">
                  <Award size={20} className="text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-emerald-600 uppercase tracking-widest">SKU más rentable</p>
                    <p className="text-sm font-medium text-gray-800">{kpis.sku_mas_rentable}</p>
                  </div>
                </div>
              )}
              {kpis?.sku_menos_rentable && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
                  <TrendingDown size={20} className="text-red-500 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-red-500 uppercase tracking-widest">Menor ganancia</p>
                    <p className="text-sm font-medium text-gray-800">{kpis.sku_menos_rentable}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Alertas */}
          {!loading && alertas.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={15} className="text-red-600" />
                <h3 className="text-sm font-semibold text-red-700">
                  Alertas de ganancia — {alertas.length} SKUs bajo el umbral del 20%
                </h3>
              </div>
              <div className="space-y-2 max-h-44 overflow-y-auto">
                {alertas.map((r, i) => {
                  const cfg = ESTADO_CFG[r.estado_margen]
                  return (
                    <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg border ${cfg.bg} ${cfg.border}`}>
                      <div className="min-w-0">
                        <p className={`text-sm font-medium truncate ${cfg.text}`}>{r.descripcion || r.sku}</p>
                        <p className="text-xs text-gray-400">
                          Fuente: <span className={r.fuente_costo === 'Barrel & Block' ? 'text-amber-600' : 'text-gray-500'}>{r.fuente_costo}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-xs shrink-0 ml-3">
                        <span className="text-gray-500">Costo: <span className="font-medium text-gray-800">{fmt4(r.costo)}</span></span>
                        <span className="text-gray-500">P.venta: <span className="font-medium text-gray-800">{r.precio_venta != null ? fmt4(r.precio_venta) : '—'}</span></span>
                        <span className={`text-sm font-bold ${cfg.text}`}>{r.ganancia_pct != null ? fmt2(r.ganancia_pct) + '%' : '—'}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Gráfico Ganancia % */}
          {!loading && chartData.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="font-semibold text-gray-700 mb-1">Ganancia % por SKU</h3>
              <p className="text-xs text-gray-400 mb-4">Ordenado de menor a mayor · Referencias en 10% (crítico) y 20% (umbral)</p>
              <BarChartPro
                data={chartData}
                dataKey="ganancia"
                nameKey="nombre"
                layout="vertical"
                colors={chartData.map(d => ESTADO_CFG[d.estado as keyof typeof ESTADO_CFG]?.bar || '#d1d5db')}
                height={250}
                formatter={(v) => fmt2(v) + '%'}
                tooltipUnit="Ganancia %"
                xTickFmt={(v: any) => v + '%'}
                yWidth={160}
                margin={{ left: 10, right: 40 }}
                refLine={{ y: 20, label: '20%', color: '#f59e0b' }}
              />
            </div>
          )}

          {/* Tabla */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-700">Rentabilidad por SKU</h3>
              <span className="text-xs text-gray-400">{filtered.length} SKUs</span>
            </div>
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase tracking-widest bg-gray-50 border-b border-gray-100">
                    {['#','SKU','Descripción','Costo','Precio Venta','Margen $','Ganancia %','Fuente Costo','Estado'].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 6 }).map((_, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          {Array.from({ length: 9 }).map((_, j) => (
                            <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                          ))}
                        </tr>
                      ))
                    : filtered.map((r, i) => {
                        const cfg = ESTADO_CFG[r.estado_margen] || ESTADO_CFG.sin_precio
                        const gN  = toNum(r.ganancia_pct)
                        const esBB = r.fuente_costo === 'Barrel & Block'
                        return (
                          <tr key={i} className="border-b border-gray-50 hover:bg-amber-50 transition-colors">
                            <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>
                            <td className="px-4 py-3 font-mono text-xs font-semibold text-amber-700">{r.sku}</td>
                            <td className="px-4 py-3 text-gray-700">{r.descripcion}</td>
                            <td className="px-4 py-3 font-semibold text-gray-800">{fmt4(r.costo)}</td>
                            <td className="px-4 py-3 text-gray-600">
                              {r.precio_venta != null ? fmt4(r.precio_venta) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {r.margen != null ? fmt4(r.margen) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className={`px-4 py-3 font-bold text-base ${cfg.text}`}>
                              {r.ganancia_pct != null ? fmt2(gN) + '%' : '—'}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                esBB ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                              }`}>
                                {r.fuente_costo}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cfg.badge}`}>
                                {cfg.label.split('(')[0].trim()}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Leyenda + oportunidades */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Criterios de ganancia</p>
              <div className="space-y-2">
                {Object.entries(ESTADO_CFG).map(([k, v]) => (
                  <div key={k} className={`px-3 py-2 rounded-lg border flex items-center gap-2 ${v.bg} ${v.border}`}>
                    <div className="w-2 h-2 rounded-full" style={{ background: v.bar }} />
                    <p className={`text-xs font-medium ${v.text}`}>{v.label}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Oportunidades detectadas</p>
              <ul className="space-y-2 text-xs text-gray-600">
                {[
                  ['text-red-600',     '▸ SKUs críticos:',   'revisar si el costo puede reducirse o subir el precio.'],
                  ['text-amber-600',   '▸ Margen bajo:',     'candidatos a renegociación con Barrel & Block.'],
                  ['text-gray-400',    '▸ Sin precio ref.:', 'definir objetivo en Control de Precio para activar el cálculo.'],
                  ['text-emerald-600', '▸ SKUs OK:',         'proteger su posición de precio para financiar el portafolio.'],
                ].map(([c, t, d]) => (
                  <li key={t} className="flex items-start gap-2">
                    <span className={`${c} mt-0.5 shrink-0`}>{t}</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
