'use client'
import { useEffect, useState, useCallback } from 'react'
import { Download, RefreshCw } from 'lucide-react'

const PAISES = ['CR','GT','SV','NI','HN','CO']

const fmt = (v: number) => {
  if (!isFinite(v) || v === 0) return '—'
  if (v >= 1e6) return '$' + (v/1e6).toFixed(2) + 'M'
  if (v >= 1e3) return '$' + (v/1e3).toFixed(1) + 'K'
  return '$' + v.toFixed(2)
}

interface Row {
  rank: number; sku: string; descripcion: string; categoria: string
  valor: number; pct_acum: number; es_cola: boolean
}
interface Resumen {
  total_skus: number; skus_top50: number; skus_cola50: number
  pct_cola: number; valor_cola: number; valor_top: number
}

export default function LongTail() {
  const [ano,     setAno]     = useState(2026)
  const [pais,    setPais]    = useState('')
  const [soloCola,setSoloCola]= useState(false)
  const [rows,    setRows]    = useState<Row[]>([])
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async (a: number, p: string) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ ano: String(a) })
      if (p) qs.set('pais', p)
      const res = await fetch('/api/comercial/ejecucion/cola?' + qs)
      if (!res.ok) throw new Error()
      const j = await res.json()
      setRows(j.rows ?? [])
      setResumen(j.resumen ?? null)
    } catch { setRows([]); setResumen(null) } finally { setLoading(false) }
  }, [])

  useEffect(() => { cargar(ano, pais) }, [cargar, ano, pais])

  const display = soloCola ? rows.filter(r => r.es_cola) : rows

  const descargarCSV = () => {
    const csv = ['#,SKU,Descripción,Categoría,Venta,% Acumulado,Segmento',
      ...display.map(r => `${r.rank},"${r.sku}","${r.descripcion}","${r.categoria}",${Number(r.valor||0).toFixed(2)},${Number(r.pct_acum||0).toFixed(1)}%,${r.es_cola?'Cola 50%':'Top 50%'}`)
    ].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `long_tail_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Ejecución</p>
          <h1 className="text-2xl font-bold text-gray-800">Long Tail 50%</h1>
          <p className="text-sm text-gray-400 mt-0.5">SKUs que componen la cola de venta (último 50% del total)</p>
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
          <select value={pais} onChange={e => setPais(e.target.value)}
            className="flex-1 min-w-[130px] border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400">
            <option value="">Todos los países</option>
            {PAISES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={soloCola} onChange={e => setSoloCola(e.target.checked)}
              className="rounded border-gray-300 text-amber-500 focus:ring-amber-400" />
            Solo Long Tail
          </label>
          <button onClick={() => cargar(ano, pais)}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-600 hover:bg-gray-200">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Resumen */}
      {resumen && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total SKUs',        value: String(resumen.total_skus ?? 0) },
            { label: 'SKUs Cola 50%',     value: String(resumen.skus_cola50 ?? 0) },
            { label: '% SKUs en cola',    value: (Number(resumen.pct_cola) || 0).toFixed(1) + '%' },
            { label: 'Venta Long Tail',   value: fmt(Number(resumen.valor_cola) || 0) },
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
              <table className="w-full text-xs min-w-[580px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-gray-400 uppercase tracking-widest text-[10px]">
                    <th className="text-left py-3 px-4 w-8">#</th>
                    <th className="text-left py-3 px-3">SKU / Descripción</th>
                    <th className="text-left py-3 px-3">Cat.</th>
                    <th className="text-right py-3 px-3">Venta</th>
                    <th className="text-right py-3 px-3">% Acum.</th>
                    <th className="text-center py-3 px-4">Segmento</th>
                  </tr>
                </thead>
                <tbody>
                  {display.map((r, i) => (
                    <tr key={r.sku} className={`border-b border-gray-50 hover:bg-amber-50/30 ${r.es_cola?'opacity-70':''} ${i%2===0?'':'bg-gray-50/30'}`}>
                      <td className="py-2 px-4 text-gray-400 font-mono">{r.rank}</td>
                      <td className="py-2 px-3">
                        <p className="font-medium text-gray-700 truncate max-w-[220px]">{r.descripcion || r.sku}</p>
                        <p className="text-gray-400 font-mono">{r.sku}</p>
                      </td>
                      <td className="py-2 px-3 text-gray-500">{r.categoria}</td>
                      <td className="py-2 px-3 text-right font-bold text-gray-800">{fmt(r.valor)}</td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${r.es_cola ? 'bg-gray-300' : 'bg-amber-400'}`}
                              style={{ width: `${Math.min(Number(r.pct_acum) || 0, 100)}%` }} />
                          </div>
                          <span className="text-gray-600 w-10 text-right">{Number(r.pct_acum || 0).toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="py-2 px-4 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${r.es_cola ? 'bg-gray-100 text-gray-500' : 'bg-amber-50 text-amber-600'}`}>
                          {r.es_cola ? 'Cola 50%' : 'Top 50%'}
                        </span>
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
