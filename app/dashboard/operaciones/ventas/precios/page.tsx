'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { Tag, AlertTriangle, TrendingUp, TrendingDown, CheckCircle, Package, RefreshCw } from 'lucide-react'

const sel = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"

function fmt4(n: any) { return Number(n || 0).toFixed(4) }
function fmt2(n: any) { return Number(n || 0).toFixed(2) }
function toNum(v: any) { return isNaN(Number(v)) ? 0 : Number(v) }

const ALERTA_CFG = {
  bajo:     { label: 'Por debajo', bg: 'bg-red-50',     border: 'border-red-200',    text: 'text-red-700',    badge: 'bg-red-100 text-red-700',    dot: 'bg-red-400'    },
  alto:     { label: 'Por encima', bg: 'bg-amber-50',   border: 'border-amber-200',  text: 'text-amber-700',  badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-400'  },
  ok:       { label: 'En rango',   bg: 'bg-emerald-50', border: 'border-emerald-200',text: 'text-emerald-700',badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-400' },
  sin_dato: { label: 'Sin dato',   bg: 'bg-gray-50',    border: 'border-gray-200',   text: 'text-gray-500',   badge: 'bg-gray-100 text-gray-500',  dot: 'bg-gray-300'   },
}

interface PrecioRow {
  pais: string; sku: string; descripcion: string; cliente: string; zona: string
  precio_objetivo: any; precio_minimo: any; precio_maximo: any; precio_real: any
  variacion_pct: any; alerta: 'bajo'|'alto'|'ok'|'sin_dato'; fecha: string
}

export default function PreciosPage() {
  const [rows,     setRows]     = useState<PrecioRow[]>([])
  const [kpis,     setKpis]     = useState<any>(null)
  const [skus,     setSkus]     = useState<{ sku: string; descripcion: string }[]>([])
  const [clientes, setClientes] = useState<string[]>([])
  const [zonas,    setZonas]    = useState<string[]>([])

  const [fSku,    setFSku]    = useState('Todos')
  const [fCliente,setFCliente]= useState('Todos')
  const [fZona,   setFZona]   = useState('Todas')
  const [fAlerta, setFAlerta] = useState('Todas')

  const [loading, setLoading] = useState(true)
  const [empty,   setEmpty]   = useState(false)
  const debounceT = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    fetch('/api/operaciones/ventas/precios?tipo=filtros')
      .then(r => r.json())
      .then(j => {
        setSkus(j.skus    || [])
        setClientes(['Todos', ...(j.clientes || [])])
        setZonas(['Todas', ...(j.zonas || [])])
      })
      .catch(() => {})
  }, [])

  const fetchData = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams()
    if (fSku     !== 'Todos') p.set('sku',     fSku)
    if (fCliente !== 'Todos') p.set('cliente', fCliente)
    if (fZona    !== 'Todas') p.set('zona',    fZona)
    const q = p.toString()

    Promise.all([
      fetch(`/api/operaciones/ventas/precios?tipo=kpis&${q}`).then(r => r.json()),
      fetch(`/api/operaciones/ventas/precios?tipo=control&${q}`).then(r => r.json()),
    ]).then(([kJ, rJ]) => {
      if (rJ.empty) { setEmpty(true); setLoading(false); return }
      setEmpty(false); setKpis(kJ); setRows(rJ.rows || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [fSku, fCliente, fZona])

  useEffect(() => {
    clearTimeout(debounceT.current)
    debounceT.current = setTimeout(fetchData, 300)
  }, [fetchData])

  const filtered   = fAlerta === 'Todas' ? rows : rows.filter(r => r.alerta === fAlerta)
  const alertaRows = rows.filter(r => r.alerta === 'bajo' || r.alerta === 'alto')

  const scatterData = rows
    .filter(r => r.precio_real != null)
    .map(r => ({ x: toNum(r.precio_objetivo), y: toNum(r.precio_real), nombre: r.descripcion, alerta: r.alerta }))

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Operaciones · Ventas</p>
          <h1 className="text-2xl font-bold text-gray-800">Control de Precio</h1>
          <p className="text-xs text-gray-400 mt-0.5">Monitoreo de precio objetivo vs precio real por SKU</p>
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
          {[
            { label: 'Cliente', val: fCliente, set: setFCliente, opts: clientes },
            { label: 'Zona',    val: fZona,    set: setFZona,    opts: zonas    },
          ].map(f => (
            <div key={f.label}>
              <label className="text-xs text-gray-500 mb-1 block">{f.label}</label>
              <select value={f.val} onChange={e => f.set(e.target.value)} className={sel}>
                {f.opts.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Alerta</label>
            <select value={fAlerta} onChange={e => setFAlerta(e.target.value)} className={sel}>
              <option value="Todas">Todas</option>
              <option value="bajo">Por debajo</option>
              <option value="alto">Por encima</option>
              <option value="ok">En rango</option>
              <option value="sin_dato">Sin dato</option>
            </select>
          </div>
        </div>
      </div>

      {/* Empty */}
      {empty && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-16 text-center">
          <Tag className="mx-auto mb-3 text-gray-200" size={48} />
          <p className="font-medium text-gray-600">No hay datos de precios</p>
          <p className="text-sm text-gray-400 mt-1">Carga datos en la tabla <code className="text-amber-600">precios</code></p>
        </div>
      )}

      {!empty && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'SKUs monitoreados', val: toNum(kpis?.total_skus),           accent: 'border-l-blue-500'    },
              { label: 'Alertas ↓ bajo',   val: toNum(kpis?.alertas_bajo),          accent: 'border-l-red-400'     },
              { label: 'Alertas ↑ alto',   val: toNum(kpis?.alertas_alto),          accent: 'border-l-amber-500'   },
              { label: 'Variación promedio',val: fmt2(kpis?.variacion_promedio_pct) + '%', accent: 'border-l-emerald-500' },
            ].map(k => (
              <div key={k.label} className={`bg-white rounded-xl border border-gray-100 shadow-sm p-5 border-l-4 ${k.accent}`}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">{k.label}</p>
                {loading
                  ? <div className="h-7 w-16 bg-gray-100 rounded animate-pulse" />
                  : <p className="text-2xl font-bold text-gray-800">{k.val}</p>}
              </div>
            ))}
          </div>

          {/* Panel alertas */}
          {!loading && alertaRows.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={15} className="text-red-600" />
                <h3 className="text-sm font-semibold text-red-700">
                  SKUs con precio fuera de rango ({alertaRows.length})
                </h3>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {alertaRows.map((r, i) => {
                  const cfg = ALERTA_CFG[r.alerta]
                  const varN = toNum(r.variacion_pct)
                  return (
                    <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg border ${cfg.bg} ${cfg.border}`}>
                      <div>
                        <span className={`text-sm font-medium ${cfg.text}`}>{r.descripcion || r.sku}</span>
                        {r.cliente && <span className="text-gray-500 text-xs ml-2">· {r.cliente}</span>}
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-gray-500">Objetivo: <span className="text-gray-800 font-medium">{fmt4(r.precio_objetivo)}</span></span>
                        <span className="text-gray-500">Real: <span className={`font-bold ${cfg.text}`}>{fmt4(r.precio_real)}</span></span>
                        <span className={`font-bold ${cfg.text}`}>{varN > 0 ? '+' : ''}{fmt2(varN)}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Scatter */}
          {!loading && scatterData.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="font-semibold text-gray-700 mb-1">Precio Objetivo vs Precio Real</h3>
              <p className="text-xs text-gray-400 mb-4">Cada punto es un SKU · la línea diagonal representa paridad perfecta</p>
              <ResponsiveContainer width="100%" height={220}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis type="number" dataKey="x" tick={{ fill: '#9ca3af', fontSize: 11 }}
                    label={{ value: 'Precio Objetivo', fill: '#9ca3af', fontSize: 11, dy: 14 }} />
                  <YAxis type="number" dataKey="y" tick={{ fill: '#9ca3af', fontSize: 11 }}
                    label={{ value: 'Precio Real', fill: '#9ca3af', fontSize: 11, angle: -90, dx: -14 }} />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}
                    formatter={(v: any, name: string) => [fmt4(v), name === 'x' ? 'Objetivo' : 'Real']}
                    labelFormatter={(_: any, payload: any) => payload?.[0]?.payload?.nombre || ''}
                  />
                  {scatterData.length > 1 && (
                    <ReferenceLine segment={[
                      { x: Math.min(...scatterData.map(d => d.x)), y: Math.min(...scatterData.map(d => d.x)) },
                      { x: Math.max(...scatterData.map(d => d.x)), y: Math.max(...scatterData.map(d => d.x)) },
                    ]} stroke="#d1d5db" strokeDasharray="4 4" />
                  )}
                  <Scatter data={scatterData} shape={(props: any) => {
                    const colors: Record<string,string> = { bajo:'#ef4444', alto:'#f59e0b', ok:'#10b981', sin_dato:'#9ca3af' }
                    return <circle cx={props.cx} cy={props.cy} r={5} fill={colors[props.alerta] || '#9ca3af'} fillOpacity={0.8} />
                  }} />
                </ScatterChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2 justify-center text-xs text-gray-500">
                {[['bg-red-400','Por debajo'],['bg-amber-400','Por encima'],['bg-emerald-500','En rango']].map(([c,l]) => (
                  <span key={l} className="flex items-center gap-1.5">
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${c}`} />{l}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tabla */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-700">Detalle de Precios</h3>
              <span className="text-xs text-gray-400">{filtered.length} registros</span>
            </div>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase tracking-widest bg-gray-50 border-b border-gray-100">
                    {['SKU','Descripción','Cliente','Objetivo','Mín','Máx','Real','Var %','Estado'].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
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
                        const cfg = ALERTA_CFG[r.alerta] || ALERTA_CFG.sin_dato
                        const varN = toNum(r.variacion_pct)
                        return (
                          <tr key={i} className="border-b border-gray-50 hover:bg-amber-50 transition-colors">
                            <td className="px-4 py-3 font-mono text-xs font-semibold text-amber-700">{r.sku}</td>
                            <td className="px-4 py-3 text-gray-700">{r.descripcion}</td>
                            <td className="px-4 py-3 text-gray-500">{r.cliente || '—'}</td>
                            <td className="px-4 py-3 text-gray-700 font-medium">{fmt4(r.precio_objetivo)}</td>
                            <td className="px-4 py-3 text-gray-400">{fmt4(r.precio_minimo)}</td>
                            <td className="px-4 py-3 text-gray-400">{fmt4(r.precio_maximo)}</td>
                            <td className="px-4 py-3 font-semibold text-gray-800">
                              {r.precio_real != null ? fmt4(r.precio_real) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className={`px-4 py-3 font-semibold ${varN > 0 ? 'text-amber-600' : varN < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                              {r.variacion_pct != null ? (varN > 0 ? '+' : '') + fmt2(varN) + '%' : '—'}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.badge}`}>
                                {cfg.label}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
