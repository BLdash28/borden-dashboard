'use client'
import { useEffect, useState, useCallback } from 'react'
import { TrendingUp, TrendingDown, Download, RefreshCw } from 'lucide-react'
import FiltroMulti from '@/components/ui/FiltroMulti'

const PAISES = ['CR','GT','SV','NI','HN','CO']
const CATS   = ['Quesos','Leches','Helados']
const PAISES_OPT = PAISES.map(p => ({ value: p }))
const CATS_OPT   = CATS.map(c => ({ value: c }))

const fmt = (v: number) => {
  if (!isFinite(v) || v === 0) return '—'
  if (v >= 1e6) return '$' + (v/1e6).toFixed(2) + 'M'
  if (v >= 1e3) return '$' + (v/1e3).toFixed(1) + 'K'
  return '$' + v.toFixed(2)
}
function fmtVar(v: number | null) {
  if (v === null) return '—'
  return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'
}
function varColor(v: number | null) {
  if (v === null) return 'text-gray-400'
  if (v >= 5)  return 'text-green-600 font-semibold'
  if (v <= -5) return 'text-red-500 font-semibold'
  return 'text-amber-600 font-semibold'
}

interface Row {
  sku: string; descripcion: string; categoria: string
  y2024: number; y2025: number; y2026: number
  var_2524: number | null; var_2625: number | null
}

type View = 'crecen' | 'caen'

export default function CrecimientoSKU() {
  const [paises, setPaises] = useState<string[]>([])
  const [cats,   setCats]   = useState<string[]>([])
  const [view,   setView]   = useState<View>('crecen')
  const [rows,   setRows]   = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async (ps: string[], cs: string[]) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (ps.length) qs.set('pais', ps.join(','))
      if (cs.length) qs.set('categoria', cs.join(','))
      const res = await fetch('/api/comercial/ejecucion/crecimiento?' + qs)
      if (!res.ok) throw new Error()
      const j = await res.json()
      setRows(j.rows ?? [])
    } catch { setRows([]) } finally { setLoading(false) }
  }, [])

  useEffect(() => { cargar(paises, cats) }, [cargar, paises, cats])

  const sorted = [...rows].sort((a, b) =>
    view === 'crecen'
      ? (b.var_2625 ?? -999) - (a.var_2625 ?? -999)
      : (a.var_2625 ?? 999)  - (b.var_2625 ?? 999)
  ).slice(0, 20)

  const descargarCSV = () => {
    const csv = ['SKU,Descripción,Categoría,2024,2025,2026,Var 25/24,Var 26/25',
      ...sorted.map(r => `"${r.sku}","${r.descripcion}","${r.categoria}",${r.y2024.toFixed(2)},${r.y2025.toFixed(2)},${r.y2026.toFixed(2)},${fmtVar(r.var_2524)},${fmtVar(r.var_2625)}`)
    ].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `crecimiento_sku_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Ejecución</p>
          <h1 className="text-2xl font-bold text-gray-800">Crecimiento SKU</h1>
          <p className="text-sm text-gray-400 mt-0.5">Top 20 SKUs · Comparativo 2024 / 2025 / 2026</p>
        </div>
        <button onClick={descargarCSV} disabled={sorted.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm disabled:opacity-40">
          <Download size={14} /> Exportar CSV
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Vista */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button onClick={() => setView('crecen')}
              className={`px-4 py-2 text-sm font-medium flex items-center gap-1.5 transition-colors ${view==='crecen'?'bg-green-500 text-white':'bg-white text-gray-600 hover:bg-gray-50'}`}>
              <TrendingUp size={13}/> Top Crecimiento
            </button>
            <button onClick={() => setView('caen')}
              className={`px-4 py-2 text-sm font-medium flex items-center gap-1.5 transition-colors ${view==='caen'?'bg-red-500 text-white':'bg-white text-gray-600 hover:bg-gray-50'}`}>
              <TrendingDown size={13}/> Top Caída
            </button>
          </div>
          <FiltroMulti label="País" options={PAISES_OPT} value={paises} onChange={setPaises} placeholder="Todos los países" />
          <FiltroMulti label="Categoría" options={CATS_OPT} value={cats} onChange={setCats} placeholder="Todas las categorías" />
          <button onClick={() => cargar(paises, cats)}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-600 hover:bg-gray-200">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        {loading
          ? <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
          : sorted.length === 0
            ? <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Sin datos disponibles.</div>
            : (
              <table className="w-full text-xs min-w-[700px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-gray-400 uppercase tracking-widest text-[10px]">
                    <th className="text-left py-3 px-4 w-6">#</th>
                    <th className="text-left py-3 px-3">SKU / Descripción</th>
                    <th className="text-left py-3 px-3">Cat.</th>
                    <th className="text-right py-3 px-3">2024</th>
                    <th className="text-right py-3 px-3">Var %</th>
                    <th className="text-right py-3 px-3">2025</th>
                    <th className="text-right py-3 px-3">Var %</th>
                    <th className="text-right py-3 px-4">2026</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r, i) => (
                    <tr key={r.sku} className={`border-b border-gray-50 hover:bg-amber-50/30 ${i%2===0?'':'bg-gray-50/30'}`}>
                      <td className="py-2 px-4 text-gray-400 font-mono">{i+1}</td>
                      <td className="py-2 px-3">
                        <p className="font-medium text-gray-700 truncate max-w-[220px]">{r.descripcion || r.sku}</p>
                        <p className="text-gray-400 font-mono">{r.sku}</p>
                      </td>
                      <td className="py-2 px-3 text-gray-500">{r.categoria}</td>
                      <td className="py-2 px-3 text-right text-gray-400">{fmt(r.y2024)}</td>
                      <td className={`py-2 px-3 text-right ${varColor(r.var_2524)}`}>{fmtVar(r.var_2524)}</td>
                      <td className="py-2 px-3 text-right text-gray-600">{fmt(r.y2025)}</td>
                      <td className={`py-2 px-3 text-right ${varColor(r.var_2625)}`}>{fmtVar(r.var_2625)}</td>
                      <td className="py-2 px-4 text-right font-bold text-gray-800">{fmt(r.y2026)}</td>
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
