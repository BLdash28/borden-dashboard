'use client'
import { useEffect, useState, useCallback } from 'react'
import { Download, RefreshCw } from 'lucide-react'
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

interface Row {
  sku: string; descripcion: string; categoria: string
  pdvs_activos: number; paises: number; valor: number
  precio_prom: number; cobertura_pct: number
}

export default function CoberturaPDV() {
  const [ano,       setAno]       = useState(2026)
  const [paises,    setPaises]    = useState<string[]>([])
  const [cats,      setCats]      = useState<string[]>([])
  const [rows,      setRows]      = useState<Row[]>([])
  const [totalPdvs, setTotalPdvs] = useState(0)
  const [loading,   setLoading]   = useState(true)

  const cargar = useCallback(async (a: number, ps: string[], cs: string[]) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ ano: String(a) })
      if (ps.length) qs.set('pais', ps.join(','))
      if (cs.length) qs.set('categoria', cs.join(','))
      const res = await fetch('/api/comercial/ejecucion/cobertura?' + qs)
      if (!res.ok) throw new Error()
      const j = await res.json()
      setRows(j.rows ?? [])
      setTotalPdvs(j.total_pdvs ?? 0)
    } catch { setRows([]) } finally { setLoading(false) }
  }, [])

  useEffect(() => { cargar(ano, paises, cats) }, [cargar, ano, paises, cats])

  const descargarCSV = () => {
    const csv = ['SKU,Descripción,Categoría,PDVs Activos,Países,Cobertura %,Venta,Precio Prom.',
      ...rows.map(r => `"${r.sku}","${r.descripcion}","${r.categoria}",${r.pdvs_activos},${r.paises},${r.cobertura_pct.toFixed(1)}%,${r.valor.toFixed(2)},${r.precio_prom.toFixed(4)}`)
    ].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `cobertura_pdv_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  const cobColor = (pct: number) =>
    pct >= 70 ? 'bg-green-400' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400'

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Ejecución</p>
          <h1 className="text-2xl font-bold text-gray-800">Cobertura PDV</h1>
          <p className="text-sm text-gray-400 mt-0.5">Presencia de cada SKU en puntos de venta · Total PDVs: {totalPdvs}</p>
        </div>
        <button onClick={descargarCSV} disabled={rows.length === 0}
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
          <FiltroMulti label="Categoría" options={CATS_OPT} value={cats} onChange={setCats} placeholder="Todas las categorías" />
          <button onClick={() => cargar(ano, paises, cats)}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-600 hover:bg-gray-200">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="flex items-center gap-4 mt-3 text-[11px]">
          <span className="text-gray-400">Cobertura:</span>
          <span className="text-green-600 font-semibold">● ≥70% Alta</span>
          <span className="text-amber-600 font-semibold">● 40–69% Media</span>
          <span className="text-red-500 font-semibold">● &lt;40% Baja</span>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        {loading
          ? <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
          : rows.length === 0
            ? <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Sin datos disponibles.</div>
            : (
              <table className="w-full text-xs min-w-[650px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-gray-400 uppercase tracking-widest text-[10px]">
                    <th className="text-left py-3 px-4">SKU / Descripción</th>
                    <th className="text-left py-3 px-3">Cat.</th>
                    <th className="text-right py-3 px-3">PDVs</th>
                    <th className="text-right py-3 px-3">Países</th>
                    <th className="text-right py-3 px-3">Cobertura</th>
                    <th className="text-right py-3 px-3">Venta</th>
                    <th className="text-right py-3 px-4">P. Prom.</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.sku} className={`border-b border-gray-50 hover:bg-amber-50/30 ${i%2===0?'':'bg-gray-50/30'}`}>
                      <td className="py-2 px-4">
                        <p className="font-medium text-gray-700 truncate max-w-[220px]">{r.descripcion || r.sku}</p>
                        <p className="text-gray-400 font-mono">{r.sku}</p>
                      </td>
                      <td className="py-2 px-3 text-gray-500">{r.categoria}</td>
                      <td className="py-2 px-3 text-right font-bold text-gray-800">{r.pdvs_activos}</td>
                      <td className="py-2 px-3 text-right text-gray-600">{r.paises}</td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${cobColor(r.cobertura_pct)}`}
                              style={{ width: `${Math.min(r.cobertura_pct, 100)}%` }} />
                          </div>
                          <span className="text-gray-600 w-9 text-right">{r.cobertura_pct.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right text-gray-600">{fmt(r.valor)}</td>
                      <td className="py-2 px-4 text-right text-gray-500">${r.precio_prom.toFixed(2)}</td>
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
