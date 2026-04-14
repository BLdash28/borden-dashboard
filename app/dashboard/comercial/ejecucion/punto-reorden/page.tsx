'use client'
import { useEffect, useState, useCallback } from 'react'
import { AlertTriangle, Download, RefreshCw } from 'lucide-react'

const PAISES = ['CR','GT','SV','NI','HN','CO']

interface Row {
  sku: string; descripcion: string; categoria: string
  qty_pdv: number; venta_dia: number; doh: number; urgencia: string
}

const URG_STYLES: Record<string, string> = {
  critico: 'bg-red-50 text-red-600 border-red-200',
  alerta:  'bg-amber-50 text-amber-600 border-amber-200',
}

export default function PuntoReorden() {
  const [pais,    setPais]    = useState('')
  const [umbral,  setUmbral]  = useState(14)
  const [rows,    setRows]    = useState<Row[]>([])
  const [criticos,setCriticos]= useState(0)
  const [alertas, setAlertas] = useState(0)
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async (p: string, u: number) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ umbral: String(u) })
      if (p) qs.set('pais', p)
      const res = await fetch('/api/comercial/ejecucion/punto-reorden?' + qs)
      if (!res.ok) throw new Error()
      const j = await res.json()
      setRows(j.rows ?? [])
      setCriticos(j.criticos ?? 0)
      setAlertas(j.alertas ?? 0)
    } catch { setRows([]) } finally { setLoading(false) }
  }, [])

  useEffect(() => { cargar(pais, umbral) }, [cargar, pais, umbral])

  const descargarCSV = () => {
    const csv = ['SKU,Descripción,Categoría,Qty PDV,Venta/Día,DOH,Urgencia',
      ...rows.map(r => `"${r.sku}","${r.descripcion}","${r.categoria}",${r.qty_pdv},${r.venta_dia.toFixed(2)},${r.doh.toFixed(1)},${r.urgencia}`)
    ].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `punto_reorden_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Ejecución</p>
          <h1 className="text-2xl font-bold text-gray-800">Punto de Reorden</h1>
          <p className="text-sm text-gray-400 mt-0.5">SKUs cuyo inventario PDV está bajo el umbral de cobertura</p>
        </div>
        <button onClick={descargarCSV} disabled={rows.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm disabled:opacity-40">
          <Download size={14} /> Exportar CSV
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <select value={pais} onChange={e => setPais(e.target.value)}
            className="flex-1 min-w-[130px] border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400">
            <option value="">Todos los países</option>
            {PAISES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 whitespace-nowrap">Umbral DOH:</label>
            <select value={umbral} onChange={e => setUmbral(parseInt(e.target.value))}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400">
              {[7, 14, 21, 30].map(d => <option key={d} value={d}>{d} días</option>)}
            </select>
          </div>
          <button onClick={() => cargar(pais, umbral)}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-600 hover:bg-gray-200">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Alert cards */}
      {!loading && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
            <AlertTriangle size={20} className="text-red-500 flex-shrink-0" />
            <div>
              <p className="text-xs text-red-400 font-semibold uppercase tracking-widest">Críticos (≤7d)</p>
              <p className="text-2xl font-bold text-red-600">{criticos}</p>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
            <AlertTriangle size={20} className="text-amber-500 flex-shrink-0" />
            <div>
              <p className="text-xs text-amber-500 font-semibold uppercase tracking-widest">En Alerta (7–{umbral}d)</p>
              <p className="text-2xl font-bold text-amber-600">{alertas}</p>
            </div>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        {loading
          ? <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
          : rows.length === 0
            ? (
              <div className="h-40 flex flex-col items-center justify-center text-gray-400 text-sm gap-2">
                <span className="text-3xl">✅</span>
                Sin SKUs bajo el umbral de {umbral} días. ¡Inventario OK!
              </div>
            )
            : (
              <table className="w-full text-xs min-w-[580px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-gray-400 uppercase tracking-widest text-[10px]">
                    <th className="text-left py-3 px-4">SKU / Descripción</th>
                    <th className="text-left py-3 px-3">Cat.</th>
                    <th className="text-right py-3 px-3">Qty PDV</th>
                    <th className="text-right py-3 px-3">Venta/Día</th>
                    <th className="text-right py-3 px-3">DOH</th>
                    <th className="text-center py-3 px-4">Urgencia</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.sku} className={`border-b border-gray-50 hover:bg-red-50/20 ${i%2===0?'':'bg-gray-50/30'}`}>
                      <td className="py-2 px-4">
                        <p className="font-medium text-gray-700 truncate max-w-[220px]">{r.descripcion || r.sku}</p>
                        <p className="text-gray-400 font-mono">{r.sku}</p>
                      </td>
                      <td className="py-2 px-3 text-gray-500">{r.categoria}</td>
                      <td className="py-2 px-3 text-right font-bold text-gray-800">{r.qty_pdv}</td>
                      <td className="py-2 px-3 text-right text-gray-500">{r.venta_dia.toFixed(1)}</td>
                      <td className="py-2 px-3 text-right font-bold text-red-600">{r.doh.toFixed(1)}d</td>
                      <td className="py-2 px-4 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${URG_STYLES[r.urgencia] || 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                          {r.urgencia === 'critico' ? '🔴 Crítico' : '🟡 Alerta'}
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
