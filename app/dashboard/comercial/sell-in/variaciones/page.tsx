'use client'
import { useEffect, useState, useCallback } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import FiltroMulti from '@/components/ui/FiltroMulti'

const MESES_LABEL = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const PAISES = ['CR','GT','SV','NI','HN','CO']
const PAISES_OPT = PAISES.map(p => ({ value: p }))

const fmt = (v: number) => {
  if (!isFinite(v) || v === 0) return '—'
  if (v >= 1e6) return '$' + (v/1e6).toFixed(2) + 'M'
  if (v >= 1e3) return '$' + (v/1e3).toFixed(1) + 'K'
  return '$' + v.toFixed(2)
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

type DimKey = 'cliente' | 'categoria'

interface MesData { y2025: number; y2026: number; var: number | null }
interface VarRow {
  dim: string
  meses: Record<number, MesData>
  total2025: number
  total2026: number
  varTotal: number | null
}
interface Totals {
  total2025: number
  total2026: number
  meses: Record<number, { y2025: number; y2026: number }>
}

export default function SellInVariaciones() {
  const [dim,    setDim]    = useState<DimKey>('cliente')
  const [paises, setPaises] = useState<string[]>([])
  const [rows,   setRows]   = useState<VarRow[]>([])
  const [totals, setTotals] = useState<Totals>({ total2025: 0, total2026: 0, meses: {} })
  const [meses,  setMeses]  = useState<number[]>([])
  const [loading,setLoading]= useState(true)

  const cargar = useCallback(async (d: DimKey, ps: string[]) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ dim: d })
      if (ps.length) qs.set('pais', ps.join(','))
      const res = await fetch('/api/comercial/sell-in/variaciones?' + qs)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = await res.json()
      setRows(j.rows ?? [])
      setTotals(j.totals ?? { total2025: 0, total2026: 0, meses: {} })
      setMeses(j.meses ?? [])
    } catch {
      setRows([])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { cargar(dim, paises) }, [cargar, dim, paises])

  const descargarCSV = () => {
    const header = [dim === 'cliente' ? 'Cliente' : 'Categoría']
    meses.forEach(m => {
      const ml = MESES_LABEL[m]
      header.push(`${ml} 2025`, `${ml} 2026`, `Var% ${ml}`)
    })
    header.push('Total 2025', 'Total 2026', 'Var% Total')

    const csv = [header.join(','),
      ...rows.map(r => {
        const line: string[] = [`"${r.dim}"`]
        meses.forEach(m => {
          const d = r.meses[m] ?? { y2025: 0, y2026: 0, var: null }
          line.push(d.y2025.toFixed(2), d.y2026.toFixed(2), fmtVar(d.var))
        })
        line.push(r.total2025.toFixed(2), r.total2026.toFixed(2), fmtVar(r.varTotal))
        return line.join(',')
      })
    ].join('\n')

    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `variaciones_sellin_${dim}_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  const totalVar = totals.total2025 > 0
    ? ((totals.total2026 - totals.total2025) / totals.total2025) * 100
    : null

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Sell In</p>
          <h1 className="text-2xl font-bold text-gray-800">YTD y Variaciones</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {meses.length > 0
              ? `${MESES_LABEL[meses[0]]} – ${MESES_LABEL[meses[meses.length - 1]]} · 2025 vs 2026`
              : '2025 vs 2026'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => cargar(dim, paises)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={descargarCSV} disabled={rows.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm disabled:opacity-40">
            <Download size={14} /> Exportar CSV
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {(['cliente','categoria'] as DimKey[]).map(d => (
              <button key={d} onClick={() => setDim(d)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${dim===d?'bg-amber-500 text-white':'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {d === 'cliente' ? 'Por Cliente' : 'Por Categoría'}
              </button>
            ))}
          </div>
          <FiltroMulti label="País" options={PAISES_OPT} value={paises} onChange={setPaises} placeholder="Todos los países" />
        </div>
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
                Sin datos disponibles
              </div>
            )
            : (
              <table className="w-full text-xs" style={{ minWidth: `${200 + meses.length * 210 + 200}px` }}>
                <thead className="bg-gray-50 border-b border-gray-200">
                  {/* Grupo de meses */}
                  <tr className="text-gray-400 uppercase tracking-widest text-[10px]">
                    <th className="text-left py-2 px-4 w-48" rowSpan={2}>
                      {dim === 'cliente' ? 'Cliente' : 'Categoría'}
                    </th>
                    {meses.map(m => (
                      <th key={m} colSpan={3} className="text-center py-2 px-2 border-l border-gray-200">
                        {MESES_LABEL[m]}
                      </th>
                    ))}
                    <th colSpan={3} className="text-center py-2 px-2 border-l border-gray-200 text-amber-600">
                      Total
                    </th>
                  </tr>
                  <tr className="text-gray-400 uppercase tracking-widest text-[10px]">
                    {meses.map(m => (
                      <>
                        <th key={`${m}-25`} className="text-right py-2 px-2 border-l border-gray-200 font-normal">2025</th>
                        <th key={`${m}-26`} className="text-right py-2 px-2 font-normal">2026</th>
                        <th key={`${m}-v`}  className="text-right py-2 px-2 font-normal">Var%</th>
                      </>
                    ))}
                    <th className="text-right py-2 px-2 border-l border-gray-200 font-normal">2025</th>
                    <th className="text-right py-2 px-2 font-normal">2026</th>
                    <th className="text-right py-2 px-4 font-normal">Var%</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={`border-b border-gray-50 hover:bg-amber-50/30 ${i%2===0?'':'bg-gray-50/30'}`}>
                      <td className="py-2 px-4 font-medium text-gray-700 max-w-[180px] truncate">{r.dim || '—'}</td>
                      {meses.map(m => {
                        const d = r.meses[m] ?? { y2025: 0, y2026: 0, var: null }
                        return (
                          <>
                            <td key={`${m}-25`} className="py-2 px-2 text-right text-gray-500 border-l border-gray-100">{fmt(d.y2025)}</td>
                            <td key={`${m}-26`} className="py-2 px-2 text-right text-gray-700">{fmt(d.y2026)}</td>
                            <td key={`${m}-v`}  className={`py-2 px-2 text-right ${varColor(d.var)}`}>{fmtVar(d.var)}</td>
                          </>
                        )
                      })}
                      <td className="py-2 px-2 text-right text-gray-500 border-l border-gray-200">{fmt(r.total2025)}</td>
                      <td className="py-2 px-2 text-right font-bold text-gray-800">{fmt(r.total2026)}</td>
                      <td className={`py-2 px-4 text-right ${varColor(r.varTotal)}`}>{fmtVar(r.varTotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-gray-300 bg-gray-50">
                  <tr className="font-bold text-gray-800">
                    <td className="py-2.5 px-4 text-xs uppercase tracking-widest text-gray-500">TOTAL</td>
                    {meses.map(m => {
                      const d = totals.meses[m] ?? { y2025: 0, y2026: 0 }
                      const v = d.y2025 > 0 ? ((d.y2026 - d.y2025) / d.y2025) * 100 : null
                      return (
                        <>
                          <td key={`${m}-25`} className="py-2.5 px-2 text-right border-l border-gray-200">{fmt(d.y2025)}</td>
                          <td key={`${m}-26`} className="py-2.5 px-2 text-right">{fmt(d.y2026)}</td>
                          <td key={`${m}-v`}  className={`py-2.5 px-2 text-right ${varColor(v)}`}>{fmtVar(v)}</td>
                        </>
                      )
                    })}
                    <td className="py-2.5 px-2 text-right border-l border-gray-200">{fmt(totals.total2025)}</td>
                    <td className="py-2.5 px-2 text-right">{fmt(totals.total2026)}</td>
                    <td className={`py-2.5 px-4 text-right ${varColor(totalVar)}`}>{fmtVar(totalVar)}</td>
                  </tr>
                </tfoot>
              </table>
            )
        }
      </div>
    </div>
  )
}
