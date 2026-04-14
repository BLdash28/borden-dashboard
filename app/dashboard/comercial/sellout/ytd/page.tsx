'use client'
import { useEffect, useState, useCallback } from 'react'
import { Download, RefreshCw } from 'lucide-react'

const MESES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const PAISES = ['CR','GT','SV','NI','HN','CO']

const fmt = (v: number) => {
  if (!isFinite(v) || v === 0) return '—'
  if (v >= 1e6) return '$' + (v/1e6).toFixed(2) + 'M'
  if (v >= 1e3) return '$' + (v/1e3).toFixed(1) + 'K'
  return '$' + v.toFixed(2)
}

type DimKey = 'pais' | 'cadena' | 'categoria' | 'sku'

interface VarRow {
  dim:      string
  y2024:    number
  y2025:    number
  y2026:    number
  var_2524: number | null
  var_2625: number | null
}

function varColor(v: number | null) {
  if (v === null) return 'text-gray-400'
  if (v >= 5)  return 'text-green-600 font-semibold'
  if (v <= -5) return 'text-red-500 font-semibold'
  return 'text-amber-600 font-semibold'
}

function fmtVar(v: number | null) {
  if (v === null) return '—'
  return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'
}

const DIM_LABELS: Record<DimKey, string> = {
  pais: 'País', cadena: 'Cadena', categoria: 'Categoría', sku: 'SKU'
}

export default function SellOutYTD() {
  const [dim,    setDim]    = useState<DimKey>('pais')
  const [pais,   setPais]   = useState('')
  const [mes,    setMes]    = useState('')
  const [rows,   setRows]   = useState<VarRow[]>([])
  const [totals, setTotals] = useState({ y2024: 0, y2025: 0, y2026: 0 })
  const [loading,setLoading]= useState(true)

  const cargar = useCallback(async (d: DimKey, p: string, m: string) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ dim: d })
      if (p) qs.set('pais', p)
      if (m) qs.set('meses', m)
      const res = await fetch('/api/comercial/sellout/variaciones?' + qs)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = await res.json()
      setRows(j.rows ?? [])
      setTotals(j.totals ?? { y2024: 0, y2025: 0, y2026: 0 })
    } catch {
      setRows([])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { cargar(dim, pais, mes) }, [cargar, dim, pais, mes])

  const descargarCSV = () => {
    const h = [DIM_LABELS[dim], '2024', 'Var 25/24 %', '2025', 'Var 26/25 %', '2026']
    const csv = [h.join(','),
      ...rows.map(r => [`"${r.dim}"`, r.y2024.toFixed(2),
        fmtVar(r.var_2524), r.y2025.toFixed(2), fmtVar(r.var_2625),
        r.y2026.toFixed(2)].join(','))
    ].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `variaciones_sellout_${dim}_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  const totalVar2524 = totals.y2024 > 0 ? ((totals.y2025 - totals.y2024) / totals.y2024) * 100 : null
  const totalVar2625 = totals.y2025 > 0 ? ((totals.y2026 - totals.y2025) / totals.y2025) * 100 : null

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Sell Out</p>
          <h1 className="text-2xl font-bold text-gray-800">YTD y Variaciones</h1>
          <p className="text-sm text-gray-400 mt-0.5">Comparativo 2024 · 2025 · 2026</p>
        </div>
        <button onClick={descargarCSV} disabled={rows.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm disabled:opacity-40">
          <Download size={14} /> Exportar CSV
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Dimensión */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {(['pais','cadena','categoria','sku'] as DimKey[]).map(d => (
              <button key={d} onClick={() => setDim(d)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${dim===d?'bg-amber-500 text-white':'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {DIM_LABELS[d]}
              </button>
            ))}
          </div>
          {/* País */}
          <div className="flex-1 min-w-[130px]">
            <select value={pais} onChange={e => setPais(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400">
              <option value="">Todos los países</option>
              {PAISES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          {/* Mes */}
          <div className="flex-1 min-w-[160px]">
            <select value={mes} onChange={e => setMes(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400">
              <option value="">Todos los meses (YTD)</option>
              {Array.from({length:12},(_,i)=>i+1).map(m => (
                <option key={m} value={m}>{MESES[m]}</option>
              ))}
            </select>
          </div>
          <button onClick={() => cargar(dim, pais, mes)}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-600 hover:bg-gray-200">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Leyenda */}
        <div className="flex items-center gap-4 mt-3 text-[11px]">
          <span className="text-gray-400">Variación:</span>
          <span className="text-green-600 font-semibold">● &gt;+5% Bueno</span>
          <span className="text-amber-600 font-semibold">● −5% a +5% Neutral</span>
          <span className="text-red-500 font-semibold">● &lt;−5% Alerta</span>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        {loading
          ? <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
          : rows.length === 0
            ? (
              <div className="h-40 flex flex-col items-center justify-center text-gray-400 text-sm gap-2">
                <span className="text-3xl">📭</span>
                Sin datos de Sell-Out disponibles.
              </div>
            )
            : (
              <table className="w-full text-xs min-w-[650px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-gray-400 uppercase tracking-widest text-[10px]">
                    <th className="text-left py-3 px-4 w-52">{DIM_LABELS[dim]}</th>
                    <th className="text-right py-3 px-3">2024</th>
                    <th className="text-right py-3 px-3">Var %</th>
                    <th className="text-right py-3 px-3">2025</th>
                    <th className="text-right py-3 px-3">Var %</th>
                    <th className="text-right py-3 px-4">2026</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={`border-b border-gray-50 hover:bg-amber-50/30 ${i%2===0?'':'bg-gray-50/30'}`}>
                      <td className="py-2 px-4 font-medium text-gray-700 max-w-[200px] truncate">{r.dim || '—'}</td>
                      <td className="py-2 px-3 text-right text-gray-500">{fmt(r.y2024)}</td>
                      <td className={`py-2 px-3 text-right ${varColor(r.var_2524)}`}>{fmtVar(r.var_2524)}</td>
                      <td className="py-2 px-3 text-right text-gray-600">{fmt(r.y2025)}</td>
                      <td className={`py-2 px-3 text-right ${varColor(r.var_2625)}`}>{fmtVar(r.var_2625)}</td>
                      <td className="py-2 px-4 text-right font-bold text-gray-800">{fmt(r.y2026)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-gray-300 bg-gray-50">
                  <tr className="font-bold text-gray-800">
                    <td className="py-2.5 px-4 text-xs uppercase tracking-widest text-gray-500">TOTAL</td>
                    <td className="py-2.5 px-3 text-right">{fmt(totals.y2024)}</td>
                    <td className={`py-2.5 px-3 text-right ${varColor(totalVar2524)}`}>{fmtVar(totalVar2524)}</td>
                    <td className="py-2.5 px-3 text-right">{fmt(totals.y2025)}</td>
                    <td className={`py-2.5 px-3 text-right ${varColor(totalVar2625)}`}>{fmtVar(totalVar2625)}</td>
                    <td className="py-2.5 px-4 text-right">{fmt(totals.y2026)}</td>
                  </tr>
                </tfoot>
              </table>
            )
        }
      </div>
    </div>
  )
}
