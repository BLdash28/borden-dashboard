'use client'
import { useEffect, useState, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const PAISES = ['CR','GT','SV','NI','HN','CO']
const COLORS = ['#f59e0b','#60a5fa','#34d399','#f87171','#a78bfa','#fb923c','#38bdf8']

const fmt = (v: number) => {
  if (!isFinite(v) || v === 0) return '—'
  if (v >= 1e6) return '$' + (v/1e6).toFixed(2) + 'M'
  if (v >= 1e3) return '$' + (v/1e3).toFixed(1) + 'K'
  return '$' + v.toFixed(2)
}

interface SomRow { pais: string; total: number; categorias: Record<string, { valor: number; som: number }> }

export default function SOMPage() {
  const [ano,        setAno]        = useState(2026)
  const [pais,       setPais]       = useState('')
  const [rows,       setRows]       = useState<SomRow[]>([])
  const [categorias, setCategorias] = useState<string[]>([])
  const [loading,    setLoading]    = useState(true)

  const cargar = useCallback(async (a: number, p: string) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ ano: String(a) })
      if (p) qs.set('pais', p)
      const res = await fetch('/api/comercial/ejecucion/som?' + qs)
      if (!res.ok) throw new Error()
      const j = await res.json()
      setRows(j.rows ?? [])
      setCategorias(j.categorias ?? [])
    } catch { setRows([]) } finally { setLoading(false) }
  }, [])

  useEffect(() => { cargar(ano, pais) }, [cargar, ano, pais])

  // Pie chart data: total por categoría sumando todos los países
  const pieData = categorias.map(cat => ({
    name: cat,
    value: rows.reduce((s, r) => s + (r.categorias[cat]?.valor ?? 0), 0),
  })).filter(d => d.value > 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Ejecución</p>
          <h1 className="text-2xl font-bold text-gray-800">Share of Market</h1>
          <p className="text-sm text-gray-400 mt-0.5">Participación de venta por categoría y país · Sell-Out interno</p>
        </div>
        <button onClick={() => cargar(ano, pais)}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {[2024,2025,2026].map(a => (
              <button key={a} onClick={() => setAno(a)}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${ano===a?'bg-amber-500 text-white':'bg-white text-gray-600 hover:bg-gray-50'}`}>{a}</button>
            ))}
          </div>
          <select value={pais} onChange={e => setPais(e.target.value)}
            className="flex-1 min-w-[130px] border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400">
            <option value="">Todos los países</option>
            {PAISES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      {loading
        ? <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
        : rows.length === 0
          ? <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Sin datos disponibles.</div>
          : (
            <>
              {/* Donut chart */}
              {pieData.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">Participación por Categoría</h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={65} outerRadius={100}
                        dataKey="value" nameKey="name" paddingAngle={3}>
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmt(v)} />
                      <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Tabla por país */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
                <table className="w-full text-xs min-w-[500px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr className="text-gray-400 uppercase tracking-widest text-[10px]">
                      <th className="text-left py-3 px-4">País</th>
                      {categorias.map(c => (
                        <th key={c} className="text-right py-3 px-3">{c}</th>
                      ))}
                      <th className="text-right py-3 px-4">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.pais} className={`border-b border-gray-50 hover:bg-amber-50/30 ${i%2===0?'':'bg-gray-50/30'}`}>
                        <td className="py-2.5 px-4 font-semibold text-gray-700">{r.pais}</td>
                        {categorias.map(c => {
                          const d = r.categorias[c]
                          return (
                            <td key={c} className="py-2.5 px-3 text-right">
                              {d ? (
                                <div>
                                  <p className="font-medium text-gray-700">{fmt(d.valor)}</p>
                                  <p className="text-gray-400">{d.som.toFixed(1)}%</p>
                                </div>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                          )
                        })}
                        <td className="py-2.5 px-4 text-right font-bold text-gray-800">{fmt(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-gray-300 bg-gray-50">
                    <tr className="font-bold text-gray-800">
                      <td className="py-2.5 px-4 text-xs uppercase tracking-widest text-gray-500">TOTAL</td>
                      {categorias.map(c => {
                        const tot = rows.reduce((s, r) => s + (r.categorias[c]?.valor ?? 0), 0)
                        return <td key={c} className="py-2.5 px-3 text-right">{fmt(tot)}</td>
                      })}
                      <td className="py-2.5 px-4 text-right">{fmt(rows.reduce((s,r) => s + r.total, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <p className="text-xs text-gray-400 text-center">
                Nota: SOM calculado sobre venta interna (Sell-Out). Para participación de mercado real se requiere data de competencia.
              </p>
            </>
          )
      }
    </div>
  )
}
