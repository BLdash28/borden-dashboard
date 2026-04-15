'use client'
import { useEffect, useState, useCallback } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import FiltroMulti from '@/components/ui/FiltroMulti'

const PAISES = ['CR','GT','SV','NI','HN','CO']
const CATS   = ['Quesos','Leches','Helados']
const PAISES_OPT = PAISES.map(p => ({ value: p }))
const CATS_OPT   = CATS.map(c => ({ value: c }))

const fmtP = (v: number | null) => v !== null && v > 0 ? '$' + v.toFixed(2) : '—'
const fmt  = (v: number) => {
  if (!isFinite(v) || v === 0) return '—'
  if (v >= 1e6) return '$' + (v/1e6).toFixed(2) + 'M'
  if (v >= 1e3) return '$' + (v/1e3).toFixed(1) + 'K'
  return '$' + v.toFixed(2)
}

interface Row {
  sku: string; descripcion: string; categoria: string
  precio_2024: number | null; precio_2025: number | null; precio_2026: number | null
  var_precio: number | null; u2026: number; v2026: number
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
    const csv = ['SKU,Descripción,Categoría,Precio 2024,Precio 2025,Precio 2026,Var %,Unidades 2026,Venta 2026',
      ...rows.map(r => `"${r.sku}","${r.descripcion}","${r.categoria}",${r.precio_2024?.toFixed(4) ?? ''},${r.precio_2025?.toFixed(4) ?? ''},${r.precio_2026?.toFixed(4) ?? ''},${fmtVar(r.var_precio)},${r.u2026},${r.v2026.toFixed(2)}`)
    ].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `precio_sku_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Ejecución</p>
          <h1 className="text-2xl font-bold text-gray-800">Precio por SKU</h1>
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

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        {loading
          ? <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
          : rows.length === 0
            ? <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Sin datos disponibles.</div>
            : (
              <table className="w-full text-xs min-w-[700px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-gray-400 uppercase tracking-widest text-[10px]">
                    <th className="text-left py-3 px-4">SKU / Descripción</th>
                    <th className="text-left py-3 px-3">Cat.</th>
                    <th className="text-right py-3 px-3">P. 2024</th>
                    <th className="text-right py-3 px-3">P. 2025</th>
                    <th className="text-right py-3 px-3">Var %</th>
                    <th className="text-right py-3 px-3">P. 2026</th>
                    <th className="text-right py-3 px-3">Und. 2026</th>
                    <th className="text-right py-3 px-4">Venta 2026</th>
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
                      <td className="py-2 px-3 text-right text-gray-400">{fmtP(r.precio_2024)}</td>
                      <td className="py-2 px-3 text-right text-gray-600">{fmtP(r.precio_2025)}</td>
                      <td className={`py-2 px-3 text-right ${varColor(r.var_precio)}`}>{fmtVar(r.var_precio)}</td>
                      <td className="py-2 px-3 text-right font-bold text-gray-800">{fmtP(r.precio_2026)}</td>
                      <td className="py-2 px-3 text-right text-gray-500">{r.u2026.toLocaleString()}</td>
                      <td className="py-2 px-4 text-right text-gray-600">{fmt(r.v2026)}</td>
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
