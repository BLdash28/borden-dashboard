'use client'
import { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, ReferenceLine } from 'recharts'
import { PieChart as PIcon, TrendingUp, TrendingDown, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react'

const MESES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const sel = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"

function fmt$(n: any) {
  const v = Number(n || 0)
  if (Math.abs(v) >= 1_000_000) return '$' + (v / 1_000_000).toFixed(2) + 'M'
  if (Math.abs(v) >= 1_000)     return '$' + (v / 1_000).toFixed(1) + 'K'
  return '$' + v.toFixed(2)
}
function toNum(v: any) { return isNaN(Number(v)) ? 0 : Number(v) }

function estadoBadge(pct: number) {
  if (pct >= 100)  return 'bg-emerald-100 text-emerald-700'
  if (pct >= 90)   return 'bg-amber-100 text-amber-700'
  return 'bg-red-100 text-red-700'
}
function estadoColor(pct: number) {
  if (pct >= 100) return '#2a7a58'
  if (pct >= 90)  return '#c8873a'
  return '#c0402f'
}

export default function PresupuestoPage() {
  const [kpis,       setKpis]       = useState<any>(null)
  const [detalle,    setDetalle]    = useState<any[]>([])
  const [categorias, setCategorias] = useState<any[]>([])
  const [anos,       setAnos]       = useState<number[]>([])
  const [meses,      setMeses]      = useState<number[]>([])
  const [fAno, setFAno] = useState('')
  const [fMes, setFMes] = useState('')
  const [loading, setLoading] = useState(true)
  const [empty,   setEmpty]   = useState(false)

  useEffect(() => {
    fetch('/api/finanzas/presupuesto?tipo=filtros').then(r => r.json()).then(j => {
      const ps = j.periodos || []
      setAnos(Array.from(new Set<number>(ps.map((p: any) => toNum(p.ano)))).sort((a, b) => b - a))
      setMeses(Array.from(new Set<number>(ps.map((p: any) => toNum(p.mes)))).sort((a, b) => a - b))
    }).catch(() => {})
  }, [])

  const fetchData = useCallback(() => {
    setLoading(true)
    const q = new URLSearchParams()
    if (fAno) q.set('ano', fAno)
    if (fMes) q.set('mes', fMes)
    const qs = q.toString()
    Promise.all([
      fetch(`/api/finanzas/presupuesto?tipo=kpis&${qs}`).then(r => r.json()),
      fetch(`/api/finanzas/presupuesto?tipo=detalle&${qs}`).then(r => r.json()),
      fetch(`/api/finanzas/presupuesto?tipo=por_categoria&${qs}`).then(r => r.json()),
    ]).then(([k, d, c]) => {
      if (d.empty) { setEmpty(true); setLoading(false); return }
      setEmpty(false)
      setKpis(k)
      setDetalle(d.rows || [])
      setCategorias(c.rows || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [fAno, fMes])

  useEffect(() => { fetchData() }, [fetchData])

  const cumplimiento = toNum(kpis?.cumplimiento_pct)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Finanzas</p>
          <h1 className="text-2xl font-bold text-gray-800">Presupuesto vs Real</h1>
          <p className="text-xs text-gray-400 mt-0.5">Seguimiento y desviaciones por categoría</p>
        </div>
        <button onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="grid grid-cols-2 gap-3 max-w-sm">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Año</label>
            <select value={fAno} onChange={e => setFAno(e.target.value)} className={sel}>
              <option value=''>Todos</option>
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Mes</label>
            <select value={fMes} onChange={e => setFMes(e.target.value)} className={sel}>
              <option value=''>Todos</option>
              {meses.map(m => <option key={m} value={m}>{MESES[m]}</option>)}
            </select>
          </div>
        </div>
      </div>

      {empty && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-16 text-center">
          <PIcon className="mx-auto mb-3 text-gray-200" size={48} />
          <p className="font-medium text-gray-600">Sin datos de presupuesto</p>
          <p className="text-sm text-gray-400 mt-1">Ejecuta <code className="text-amber-600">db/finanzas_schema.sql</code> y carga datos.</p>
        </div>
      )}

      {!empty && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { icon: PIcon,        label: 'Presupuesto',   val: fmt$(kpis?.total_presupuesto), accent: 'border-l-gray-400' },
              { icon: TrendingUp,   label: 'Real',          val: fmt$(kpis?.total_real),        accent: 'border-l-blue-500' },
              { icon: TrendingDown, label: 'Variación',     val: fmt$(kpis?.variacion),         accent: toNum(kpis?.variacion) >= 0 ? 'border-l-emerald-500' : 'border-l-red-400' },
              { icon: CheckCircle,  label: 'Cumplimiento',  val: cumplimiento.toFixed(1) + '%', accent: cumplimiento >= 100 ? 'border-l-emerald-500' : cumplimiento >= 90 ? 'border-l-amber-500' : 'border-l-red-400' },
              { icon: CheckCircle,  label: 'Ítems OK',      val: String(kpis?.items_ok || 0),   accent: 'border-l-emerald-500' },
              { icon: AlertCircle,  label: 'Ítems Crítico', val: String(kpis?.items_critico || 0), accent: 'border-l-red-400' },
            ].map(k => (
              <div key={k.label} className={`bg-white rounded-xl border border-gray-100 shadow-sm p-5 border-l-4 ${k.accent}`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest leading-tight">{k.label}</p>
                  <k.icon size={15} className="text-gray-300 shrink-0" />
                </div>
                {loading ? <div className="h-6 w-16 bg-gray-100 rounded animate-pulse" />
                  : <p className="text-xl font-bold text-gray-800">{k.val}</p>}
              </div>
            ))}
          </div>

          {/* Barra de progreso global */}
          {!loading && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-700">Cumplimiento Global</h3>
                <span className={`text-lg font-bold ${cumplimiento >= 100 ? 'text-emerald-600' : cumplimiento >= 90 ? 'text-amber-600' : 'text-red-600'}`}>
                  {cumplimiento.toFixed(1)}%
                </span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(cumplimiento, 100)}%`, background: estadoColor(cumplimiento) }} />
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1.5">
                <span>0%</span><span className="text-amber-500">90%</span><span className="text-emerald-500">100%</span>
              </div>
            </div>
          )}

          {/* Gráfico por categoría */}
          {!loading && categorias.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="font-semibold text-gray-700 mb-1">Presupuesto vs Real por Categoría</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={categorias} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={v => fmt$(v)} />
                  <YAxis type="category" dataKey="categoria" tick={{ fill: '#6b7280', fontSize: 11 }} width={120} />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}
                    formatter={(v: any, n: string) => [fmt$(v), n === 'presupuesto' ? 'Presupuesto' : 'Real']} />
                  <Legend formatter={v => v === 'presupuesto' ? 'Presupuesto' : 'Real'} />
                  <Bar dataKey="presupuesto" fill="#9ca3af" radius={[0,4,4,0]} />
                  <Bar dataKey="real" radius={[0,4,4,0]}>
                    {categorias.map((row, i) => (
                      <Cell key={i} fill={estadoColor(toNum(row.cumplimiento_pct))} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Tabla detalle */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-700">Detalle por ítem</h3>
              <span className="text-xs text-gray-400">{detalle.length} ítems</span>
            </div>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="text-xs text-gray-400 uppercase tracking-widest bg-gray-50 border-b border-gray-100">
                    {['Categoría','Concepto','Presupuesto','Real','Variación','Cumplimiento'].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? Array.from({length:6}).map((_,i) => (
                    <tr key={i} className="border-b border-gray-50">
                      {[1,2,3,4,5,6].map(j => <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse"/></td>)}
                    </tr>
                  )) : detalle.map((r, i) => {
                    const cumpl = toNum(r.cumplimiento_pct)
                    const vari  = toNum(r.variacion)
                    return (
                      <tr key={i} className="border-b border-gray-50 hover:bg-amber-50 transition-colors">
                        <td className="px-4 py-3 text-xs text-gray-500">{r.categoria}</td>
                        <td className="px-4 py-3 text-gray-700 font-medium">{r.concepto}</td>
                        <td className="px-4 py-3 text-gray-600">{fmt$(r.presupuesto)}</td>
                        <td className="px-4 py-3 font-semibold text-gray-800">{fmt$(r.real)}</td>
                        <td className={`px-4 py-3 font-semibold ${vari >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {vari >= 0 ? '+' : ''}{fmt$(vari)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden min-w-[48px]">
                              <div className="h-full rounded-full"
                                style={{ width: `${Math.min(cumpl, 100)}%`, background: estadoColor(cumpl) }} />
                            </div>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${estadoBadge(cumpl)}`}>
                              {cumpl.toFixed(1)}%
                            </span>
                          </div>
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
