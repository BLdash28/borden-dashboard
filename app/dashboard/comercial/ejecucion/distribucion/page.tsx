'use client'
import { useEffect, useState, useCallback } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import FiltroMulti from '@/components/ui/FiltroMulti'

const PAISES = ['CR','GT','SV','NI','HN','CO']
const PAISES_OPT = PAISES.map(p => ({ value: p }))

const fmt = (v: number) => {
  if (!isFinite(v) || v === 0) return '—'
  if (v >= 1e6) return '$' + (v/1e6).toFixed(2) + 'M'
  if (v >= 1e3) return '$' + (v/1e3).toFixed(1) + 'K'
  return '$' + v.toFixed(2)
}

interface Row {
  rank: number; sku: string; descripcion: string; categoria: string
  valor: number; pct_acum: number; es_top75: boolean
}
interface Resumen { total_skus: number; skus_top75: number; pct_skus: number; valor_total: number }

export default function Distribucion75() {
  const [ano,     setAno]     = useState(2026)
  const [paises,  setPaises]  = useState<string[]>([])
  const [rows,    setRows]    = useState<Row[]>([])
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [loading, setLoading] = useState(true)
  const [soloTop, setSoloTop] = useState(false)

  const cargar = useCallback(async (a: number, ps: string[]) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ ano: String(a) })
      if (ps.length) qs.set('pais', ps.join(','))
      const res = await fetch('/api/comercial/ejecucion/distribucion?' + qs)
      if (!res.ok) throw new Error()
      const j = await res.json()
      setRows(j.rows ?? [])
      setResumen(j.resumen ?? null)
    } catch { setRows([]); setResumen(null) } finally { setLoading(false) }
  }, [])

  useEffect(() => { cargar(ano, paises) }, [cargar, ano, paises])

  const display = soloTop ? rows.filter(r => r.es_top75) : rows

  const descargarCSV = () => {
    const csv = ['#,SKU,Descripción,Categoría,Valor,% Acumulado,Top 75%',
      ...display.map(r => `${r.rank},"${r.sku}","${r.descripcion}","${r.categoria}",${Number(r.valor || 0).toFixed(2)},${Number(r.pct_acum || 0).toFixed(1)}%,${r.es_top75?'Sí':'No'}`)
    ].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `distribucion_75_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Ejecución</p>
          <h1 className="text-2xl font-bold text-gray-800">Distribución 75%</h1>
          <p className="text-sm text-gray-400 mt-0.5">SKUs que concentran el 75% de la venta (Pareto)</p>
        </div>
        <button onClick={descargarCSV} disabled={display.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm disabled:opacity-40">
          <Download size={14} /> Exportar CSV
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
          <FiltroMulti label="País" options={PAISES_OPT} value={paises} onChange={setPaises} placeholder="Todos los países" />
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={soloTop} onChange={e => setSoloTop(e.target.checked)}
              className="rounded border-gray-300 text-amber-500 focus:ring-amber-400" />
            Solo Top 75%
          </label>
          <button onClick={() => cargar(ano, paises)}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-600 hover:bg-gray-200">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Resumen cards */}
      {resumen && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total SKUs',    value: String(resumen.total_skus) },
            { label: 'SKUs Top 75%', value: String(resumen.skus_top75) },
            { label: '% de SKUs',    value: Number(resumen.pct_skus || 0).toFixed(1) + '%' },
            { label: 'Venta Total',  value: fmt(Number(resumen.valor_total) || 0) },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">{k.label}</p>
              <p className="text-xl font-bold text-gray-800">{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        {loading
          ? <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
          : display.length === 0
            ? <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Sin datos disponibles.</div>
            : (
              <table className="w-full text-xs min-w-[600px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-gray-400 uppercase tracking-widest text-[10px]">
                    <th className="text-left py-3 px-4 w-8">#</th>
                    <th className="text-left py-3 px-3">SKU / Descripción</th>
                    <th className="text-left py-3 px-3">Cat.</th>
                    <th className="text-right py-3 px-3">Venta</th>
                    <th className="text-right py-3 px-4">% Acum.</th>
                  </tr>
                </thead>
                <tbody>
                  {display.map((r, i) => (
                    <tr key={r.sku} className={`border-b border-gray-50 hover:bg-amber-50/30 ${r.es_top75 ? '' : 'opacity-60'} ${i%2===0?'':'bg-gray-50/30'}`}>
                      <td className="py-2 px-4 text-gray-400 font-mono">{r.rank}</td>
                      <td className="py-2 px-3">
                        <p className="font-medium text-gray-700 truncate max-w-[240px]">{r.descripcion || r.sku}</p>
                        <p className="text-gray-400 font-mono">{r.sku}</p>
                      </td>
                      <td className="py-2 px-3 text-gray-500">{r.categoria}</td>
                      <td className="py-2 px-3 text-right font-bold text-gray-800">{fmt(Number(r.valor) || 0)}</td>
                      <td className="py-2 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${r.es_top75 ? 'bg-amber-400' : 'bg-gray-300'}`}
                              style={{ width: `${Math.min(Number(r.pct_acum) || 0, 100)}%` }} />
                          </div>
                          <span className="text-gray-600 w-10 text-right">{Number(r.pct_acum || 0).toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
        }
      </div>
    </div>
  )
}
