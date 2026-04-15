'use client'
import { useEffect, useState, useCallback } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import FiltroMulti from '@/components/ui/FiltroMulti'

const PAISES = ['CR','GT','SV','NI','HN','CO']
const CATS   = ['Quesos','Leches','Helados']
const PAISES_OPT = PAISES.map(p => ({ value: p }))
const CATS_OPT   = CATS.map(c => ({ value: c }))

const fmtN = (v: number) => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(0)+'K' : v.toFixed(0)

interface Row {
  sku: string; descripcion: string; categoria: string
  qty_pdv: number; pdvs: number; venta_dia: number
  doh: number | null; semaforo: string
}

const SEMAFORO_LABEL: Record<string, string> = {
  rojo: '≤7d', amarillo: '8–21d', verde: '22–60d', azul: '+60d', sin_datos: '—'
}
const SEMAFORO_DOT: Record<string, string> = {
  rojo: 'bg-red-500', amarillo: 'bg-amber-400', verde: 'bg-green-500', azul: 'bg-blue-400', sin_datos: 'bg-gray-300'
}

export default function InventarioPDV() {
  const [paises,  setPaises]  = useState<string[]>([])
  const [cats,    setCats]    = useState<string[]>([])
  const [filtro,  setFiltro]  = useState<string>('todos')
  const [rows,    setRows]    = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async (ps: string[], cs: string[]) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (ps.length) qs.set('pais', ps.join(','))
      if (cs.length) qs.set('categoria', cs.join(','))
      const res = await fetch('/api/comercial/ejecucion/inventario?' + qs)
      if (!res.ok) throw new Error()
      const j = await res.json()
      setRows(j.rows ?? [])
    } catch { setRows([]) } finally { setLoading(false) }
  }, [])

  useEffect(() => { cargar(paises, cats) }, [cargar, paises, cats])

  const display = filtro === 'todos' ? rows : rows.filter(r => r.semaforo === filtro)

  const counts = rows.reduce((acc, r) => {
    acc[r.semaforo] = (acc[r.semaforo] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const descargarCSV = () => {
    const csv = ['SKU,Descripción,Categoría,Qty PDV,PDVs,Venta/Día,DOH,Semáforo',
      ...display.map(r => `"${r.sku}","${r.descripcion}","${r.categoria}",${r.qty_pdv},${r.pdvs},${r.venta_dia.toFixed(2)},${r.doh?.toFixed(1) ?? '—'},${r.semaforo}`)
    ].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `inventario_pdv_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Ejecución</p>
          <h1 className="text-2xl font-bold text-gray-800">Inventario PDV</h1>
          <p className="text-sm text-gray-400 mt-0.5">Días de cobertura (DOH) por SKU en punto de venta</p>
        </div>
        <button onClick={descargarCSV} disabled={display.length === 0}
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

        {/* Semáforo filters */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {(['todos','rojo','amarillo','verde','azul'] as const).map(s => (
            <button key={s} onClick={() => setFiltro(s)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors border ${filtro===s?'border-gray-400 bg-gray-100':'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'}`}>
              {s !== 'todos' && <span className={`w-2 h-2 rounded-full ${SEMAFORO_DOT[s]}`} />}
              {s === 'todos' ? `Todos (${rows.length})` : `${s.charAt(0).toUpperCase()+s.slice(1)} ${SEMAFORO_LABEL[s]} (${counts[s]||0})`}
            </button>
          ))}
        </div>
      </div>

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
                    <th className="text-left py-3 px-4">SKU / Descripción</th>
                    <th className="text-left py-3 px-3">Cat.</th>
                    <th className="text-right py-3 px-3">Qty PDV</th>
                    <th className="text-right py-3 px-3">PDVs</th>
                    <th className="text-right py-3 px-3">Venta/Día</th>
                    <th className="text-right py-3 px-3">DOH</th>
                    <th className="text-center py-3 px-4">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {display.map((r, i) => (
                    <tr key={r.sku} className={`border-b border-gray-50 hover:bg-amber-50/30 ${i%2===0?'':'bg-gray-50/30'}`}>
                      <td className="py-2 px-4">
                        <p className="font-medium text-gray-700 truncate max-w-[220px]">{r.descripcion || r.sku}</p>
                        <p className="text-gray-400 font-mono">{r.sku}</p>
                      </td>
                      <td className="py-2 px-3 text-gray-500">{r.categoria}</td>
                      <td className="py-2 px-3 text-right font-bold text-gray-800">{fmtN(r.qty_pdv)}</td>
                      <td className="py-2 px-3 text-right text-gray-600">{r.pdvs}</td>
                      <td className="py-2 px-3 text-right text-gray-500">{r.venta_dia > 0 ? r.venta_dia.toFixed(1) : '—'}</td>
                      <td className="py-2 px-3 text-right font-bold text-gray-800">
                        {r.doh !== null ? r.doh.toFixed(1) + 'd' : '—'}
                      </td>
                      <td className="py-2 px-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          r.semaforo === 'rojo'     ? 'bg-red-50 text-red-600' :
                          r.semaforo === 'amarillo' ? 'bg-amber-50 text-amber-600' :
                          r.semaforo === 'verde'    ? 'bg-green-50 text-green-600' :
                          r.semaforo === 'azul'     ? 'bg-blue-50 text-blue-600' :
                          'bg-gray-50 text-gray-400'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${SEMAFORO_DOT[r.semaforo]}`} />
                          {SEMAFORO_LABEL[r.semaforo]}
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
