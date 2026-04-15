'use client'
import { useEffect, useState, useCallback } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, Label
} from 'recharts'
import FiltroMulti from '@/components/ui/FiltroMulti'

const PAISES = ['CR','GT','SV','NI','HN','CO']
const CATS   = ['Quesos','Leches','Helados']
const PAISES_OPT = PAISES.map(p => ({ value: p }))
const CATS_OPT   = CATS.map(c => ({ value: c }))

const CAT_COLORS: Record<string, string> = {
  Quesos:  '#f59e0b',
  Leches:  '#60a5fa',
  Helados: '#34d399',
}
const DEFAULT_COLOR = '#a78bfa'

const fmtP = (v: number | null) => v !== null && v > 0 ? '$' + v.toFixed(2) : '—'
const fmt  = (v: number) => {
  if (!isFinite(v) || v === 0) return '—'
  if (v >= 1e6) return '$' + (v/1e6).toFixed(2) + 'M'
  if (v >= 1e3) return '$' + (v/1e3).toFixed(1) + 'K'
  return '$' + v.toFixed(2)
}

interface Row {
  sku: string; descripcion: string; categoria: string
  subcategoria: string | null; codigo_barras: string | null
  precio_2024: number | null; precio_2025: number | null; precio_2026: number | null
  var_precio: number | null; var_unidades: number | null; elasticidad: number | null
  u2025: number; u2026: number; v2026: number
}

function varColor(v: number | null) {
  if (v === null) return 'text-gray-400'
  if (v >= 3)  return 'text-green-600 font-semibold'
  if (v <= -3) return 'text-red-500 font-semibold'
  return 'text-amber-600 font-semibold'
}
function fmtVar(v: number | null) {
  if (v === null) return '—'
  return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'
}
function elastColor(e: number | null) {
  if (e === null) return 'text-gray-400'
  if (e < -1)  return 'text-red-500 font-semibold'   // elastic demand, price↑ hurts
  if (e > 1)   return 'text-green-600 font-semibold'  // unusual: price↑ units↑
  return 'text-amber-600 font-semibold'               // inelastic
}

// Group rows by categoria for Scatter series
function groupByCategoria(rows: Row[]) {
  const map: Record<string, { x: number; y: number; name: string; v2026: number }[]> = {}
  for (const r of rows) {
    if (r.precio_2026 === null || r.elasticidad === null) continue
    if (!map[r.categoria]) map[r.categoria] = []
    map[r.categoria].push({
      x: r.precio_2026,
      y: r.elasticidad,
      name: r.descripcion || r.sku,
      v2026: r.v2026,
    })
  }
  return map
}

interface ScatterDot { x: number; y: number; name: string; v2026: number }
function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: ScatterDot }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-3 text-xs space-y-1">
      <p className="font-semibold text-gray-800 max-w-[180px] truncate">{d.name}</p>
      <p className="text-gray-500">Precio 2026: <span className="font-medium text-gray-700">${d.x.toFixed(2)}</span></p>
      <p className="text-gray-500">Elasticidad: <span className="font-medium text-gray-700">{d.y.toFixed(2)}</span></p>
      <p className="text-gray-500">Venta 2026: <span className="font-medium text-gray-700">{fmt(d.v2026)}</span></p>
    </div>
  )
}

export default function PrecioElasticidad() {
  const [paises,  setPaises]  = useState<string[]>([])
  const [cats,    setCats]    = useState<string[]>([])
  const [rows,    setRows]    = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async (ps: string[], cs: string[]) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (ps.length) qs.set('pais', ps.join(','))
      if (cs.length) qs.set('categoria', cs.join(','))
      const res = await fetch('/api/comercial/ejecucion/precio?' + qs)
      if (!res.ok) throw new Error()
      const j = await res.json()
      setRows(j.rows ?? [])
    } catch { setRows([]) } finally { setLoading(false) }
  }, [])

  useEffect(() => { cargar(paises, cats) }, [cargar, paises, cats])

  const descargarCSV = () => {
    const csv = ['SKU,Descripción,Categoría,Subcategoría,Cód.Barras,Precio 2024,Precio 2025,Precio 2026,Var Precio%,Var Unidades%,Elasticidad,Und. 2025,Und. 2026,Venta 2026',
      ...rows.map(r => `"${r.sku}","${r.descripcion}","${r.categoria}","${r.subcategoria??''}","${r.codigo_barras??''}",${r.precio_2024?.toFixed(4)??''},${r.precio_2025?.toFixed(4)??''},${r.precio_2026?.toFixed(4)??''},${fmtVar(r.var_precio)},${fmtVar(r.var_unidades)},${r.elasticidad?.toFixed(2)??''},${r.u2025},${r.u2026},${r.v2026.toFixed(2)}`)
    ].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `precio_elasticidad_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  const scatterGroups = groupByCategoria(rows)
  const hasScatter = Object.values(scatterGroups).some(arr => arr.length > 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Ejecución</p>
          <h1 className="text-2xl font-bold text-gray-800">Precio &amp; Elasticidad</h1>
          <p className="text-sm text-gray-400 mt-0.5">Evolución de precio promedio 2024 · 2025 · 2026</p>
        </div>
        <button onClick={descargarCSV} disabled={rows.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm disabled:opacity-40">
          <Download size={14} /> Exportar CSV
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <FiltroMulti label="País" options={PAISES_OPT} value={paises} onChange={setPaises} placeholder="Todos los países" />
          <FiltroMulti label="Categoría" options={CATS_OPT} value={cats} onChange={setCats} placeholder="Todas las categorías" />
          <button onClick={() => cargar(paises, cats)}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-600 hover:bg-gray-200">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="flex items-center gap-4 mt-3 text-[11px]">
          <span className="text-gray-400">Var. precio 26/25:</span>
          <span className="text-green-600 font-semibold">● &gt;+3% Sube</span>
          <span className="text-amber-600 font-semibold">● ±3% Estable</span>
          <span className="text-red-500 font-semibold">● &lt;−3% Baja</span>
        </div>
      </div>

      {loading
        ? <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
        : rows.length === 0
          ? <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Sin datos disponibles.</div>
          : (
            <>
              {/* Scatter chart */}
              {hasScatter && (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-1">Precio vs. Elasticidad</h3>
                  <p className="text-[11px] text-gray-400 mb-4">
                    Cada punto es un SKU. Eje X = precio 2026 · Eje Y = elasticidad (ΔUnd% / ΔPrecio%)
                  </p>
                  <ResponsiveContainer width="100%" height={300}>
                    <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis type="number" dataKey="x" name="Precio" tickFormatter={v => '$'+v.toFixed(2)} tick={{ fontSize: 10, fill: '#9ca3af' }}>
                        <Label value="Precio 2026 (USD)" offset={-10} position="insideBottom" style={{ fontSize: 10, fill: '#6b7280' }} />
                      </XAxis>
                      <YAxis type="number" dataKey="y" name="Elasticidad" tickFormatter={v => v.toFixed(1)} tick={{ fontSize: 10, fill: '#9ca3af' }}>
                        <Label value="Elasticidad" angle={-90} position="insideLeft" style={{ fontSize: 10, fill: '#6b7280' }} />
                      </YAxis>
                      <ReferenceLine y={0} stroke="#d1d5db" strokeDasharray="4 2" />
                      <ReferenceLine y={1}  stroke="#86efac" strokeDasharray="4 2" strokeWidth={1} />
                      <ReferenceLine y={-1} stroke="#fca5a5" strokeDasharray="4 2" strokeWidth={1} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 12, paddingTop: 16 }} />
                      {Object.entries(scatterGroups).map(([cat, data]) => (
                        <Scatter
                          key={cat}
                          name={cat}
                          data={data}
                          fill={CAT_COLORS[cat] ?? DEFAULT_COLOR}
                          fillOpacity={0.75}
                        />
                      ))}
                    </ScatterChart>
                  </ResponsiveContainer>
                  <p className="text-[10px] text-gray-400 text-center mt-2">
                    Líneas de referencia: roja = elástico (&lt;−1) · verde = inelástico inverso (&gt;+1)
                  </p>
                </div>
              )}

              {/* Tabla */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
                <table className="w-full text-xs min-w-[900px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr className="text-gray-400 uppercase tracking-widest text-[10px]">
                      <th className="text-left py-3 px-4">SKU / Descripción</th>
                      <th className="text-left py-3 px-3">Cat.</th>
                      <th className="text-left py-3 px-3">Subcat.</th>
                      <th className="text-left py-3 px-3">Cód. Barras</th>
                      <th className="text-right py-3 px-3">P. 2024</th>
                      <th className="text-right py-3 px-3">P. 2025</th>
                      <th className="text-right py-3 px-3">Var %</th>
                      <th className="text-right py-3 px-3">P. 2026</th>
                      <th className="text-right py-3 px-3">Elasticidad</th>
                      <th className="text-right py-3 px-3">Und. 2026</th>
                      <th className="text-right py-3 px-4">Venta 2026</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.sku} className={`border-b border-gray-50 hover:bg-amber-50/30 ${i%2===0?'':'bg-gray-50/30'}`}>
                        <td className="py-2 px-4">
                          <p className="font-medium text-gray-700 truncate max-w-[200px]">{r.descripcion || r.sku}</p>
                          <p className="text-gray-400 font-mono">{r.sku}</p>
                        </td>
                        <td className="py-2 px-3 text-gray-500">{r.categoria}</td>
                        <td className="py-2 px-3 text-gray-400">{r.subcategoria ?? '—'}</td>
                        <td className="py-2 px-3 text-gray-400 font-mono text-[10px]">{r.codigo_barras ?? '—'}</td>
                        <td className="py-2 px-3 text-right text-gray-400">{fmtP(r.precio_2024)}</td>
                        <td className="py-2 px-3 text-right text-gray-600">{fmtP(r.precio_2025)}</td>
                        <td className={`py-2 px-3 text-right ${varColor(r.var_precio)}`}>{fmtVar(r.var_precio)}</td>
                        <td className="py-2 px-3 text-right font-bold text-gray-800">{fmtP(r.precio_2026)}</td>
                        <td className={`py-2 px-3 text-right ${elastColor(r.elasticidad)}`}>
                          {r.elasticidad !== null ? r.elasticidad.toFixed(2) : '—'}
                        </td>
                        <td className="py-2 px-3 text-right text-gray-500">{r.u2026.toLocaleString()}</td>
                        <td className="py-2 px-4 text-right text-gray-600">{fmt(r.v2026)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-[11px] text-gray-400 text-center">
                Elasticidad = ΔUnd% / ΔPrecio% (2025→2026). Solo se calcula cuando |ΔPrecio| &gt; 0.1%.
              </p>
            </>
          )
      }
    </div>
  )
}
