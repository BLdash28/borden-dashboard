'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { Download, RefreshCw, ChevronRight } from 'lucide-react'
import FiltroMulti from '@/components/ui/FiltroMulti'

const STORAGE_KEY = 'bl_sellin_var_v1'

const MESES_LABEL = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const PAISES_OPT  = ['CR','GT','SV','NI','HN','CO'].map(p => ({ value: p }))
const TIPOS_OPT   = [
  { value: 'REGULAR',                 label: 'BL FOODS' },
  { value: 'LICENCIAMIENTO_HELADOS',  label: 'LICENCIAMIENTO HELADOS' },
  { value: 'LICENCIAMIENTO_COLOMBIA', label: 'LICENCIAMIENTO COLOMBIA' },
]

const TRIMESTRES = [
  { label: 'Q1 · Ene – Abr', short: 'Q1', meses: [1,2,3,4],    headerCls: 'text-blue-700 bg-blue-50/80 border-blue-200',      subCls: 'text-blue-700 bg-blue-50/60'   },
  { label: 'Q2 · May – Ago', short: 'Q2', meses: [5,6,7,8],    headerCls: 'text-green-700 bg-green-50/80 border-green-200',   subCls: 'text-green-700 bg-green-50/60'  },
  { label: 'Q3 · Sep – Dic', short: 'Q3', meses: [9,10,11,12], headerCls: 'text-purple-700 bg-purple-50/80 border-purple-200', subCls: 'text-purple-700 bg-purple-50/60' },
]

const fmt = (v: number) => {
  if (!isFinite(v)) return '—'
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

function qSub(trimMeses: number[], data: Record<number, MesData>, activeMeses: number[]) {
  const ms = trimMeses.filter(m => activeMeses.includes(m))
  const s25 = ms.reduce((s, m) => s + (data[m]?.y2025 ?? 0), 0)
  const s26 = ms.reduce((s, m) => s + (data[m]?.y2026 ?? 0), 0)
  return { s25, s26, v: s25 > 0 ? ((s26 - s25) / s25) * 100 : null }
}

function qSubTotals(trimMeses: number[], totals: Totals, activeMeses: number[]) {
  const ms = trimMeses.filter(m => activeMeses.includes(m))
  const s25 = ms.reduce((s, m) => s + (totals.meses[m]?.y2025 ?? 0), 0)
  const s26 = ms.reduce((s, m) => s + (totals.meses[m]?.y2026 ?? 0), 0)
  return { s25, s26, v: s25 > 0 ? ((s26 - s25) / s25) * 100 : null }
}

export default function SellInVariaciones() {
  const [dim,        setDim]        = useState<DimKey>('cliente')
  const [paises,     setPaises]     = useState<string[]>([])
  const [tipos,      setTipos]      = useState<string[]>(['REGULAR'])
  const [clientes,   setClientes]   = useState<string[]>([])
  const [categorias, setCategorias] = useState<string[]>([])
  const initDone = useRef(false)
  const [rows,   setRows]   = useState<VarRow[]>([])
  const [totals, setTotals] = useState<Totals>({ total2025: 0, total2026: 0, meses: {} })
  const [meses,  setMeses]  = useState<number[]>([])
  const [loading,setLoading]= useState(true)

  const [clienteOpts,   setClienteOpts]   = useState<{ value: string }[]>([])
  const [categoriaOpts, setCategoriaOpts] = useState<{ value: string }[]>([])

  const [expanded,       setExpanded]       = useState<Set<string>>(new Set())
  const [subRows,        setSubRows]        = useState<Record<string, VarRow[]>>({})
  const [loadingClients, setLoadingClients] = useState<Set<string>>(new Set())

  const buildQs = useCallback((extra?: Record<string, string>) => {
    const qs = new URLSearchParams({ dim })
    if (paises.length)     qs.set('pais',         paises.join(','))
    if (tipos.length)      qs.set('tipo_negocio', tipos.join(','))
    if (clientes.length)   qs.set('cliente',      clientes.join(','))
    if (categorias.length) qs.set('categoria',    categorias.join(','))
    if (extra) Object.entries(extra).forEach(([k, v]) => qs.set(k, v))
    return qs
  }, [dim, paises, tipos, clientes, categorias])

  const cargar = useCallback(async () => {
    setLoading(true)
    setExpanded(new Set())
    setSubRows({})
    try {
      const res = await fetch('/api/comercial/sell-in/variaciones?' + buildQs())
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = await res.json()
      setRows(j.rows ?? [])
      setTotals(j.totals ?? { total2025: 0, total2026: 0, meses: {} })
      setMeses(j.meses ?? [])
    } catch {
      setRows([])
    } finally { setLoading(false) }
  }, [buildQs])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    if (initDone.current) return
    initDone.current = true
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const s = JSON.parse(raw)
        if (s.dim)                setDim(s.dim)
        if (s.paises?.length)     setPaises(s.paises)
        if (s.tipos?.length)      setTipos(s.tipos)
        if (s.clientes?.length)   setClientes(s.clientes)
        if (s.categorias?.length) setCategorias(s.categorias)
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cascada: cargar opciones de clientes/categorias filtradas por país
  useEffect(() => {
    const qs = new URLSearchParams({ dim: 'cliente' })
    if (paises.length) qs.set('paises', paises.join(','))
    fetch('/api/ventas/sell-in/opts?' + qs).then(r => r.json()).then(j => {
      const opts = (j.opts ?? []).map((v: string) => ({ value: v }))
      setClienteOpts(opts)
      setClientes(prev => prev.filter(c => j.opts?.includes(c)))
    })
  }, [paises])

  useEffect(() => {
    const qs = new URLSearchParams({ dim: 'categoria' })
    if (paises.length) qs.set('paises', paises.join(','))
    fetch('/api/ventas/sell-in/opts?' + qs).then(r => r.json()).then(j => {
      const opts = (j.opts ?? []).map((v: string) => ({ value: v }))
      setCategoriaOpts(opts)
      setCategorias(prev => prev.filter(c => j.opts?.includes(c)))
    })
  }, [paises])

  const saveStorage = useCallback((patch: Record<string, unknown>) => {
    try {
      const base = { dim, paises, tipos, clientes, categorias }
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...base, ...patch }))
    } catch {}
  }, [dim, paises, tipos, clientes, categorias])

  const toggleClient = useCallback(async (clientName: string) => {
    if (expanded.has(clientName)) {
      setExpanded(prev => { const s = new Set(prev); s.delete(clientName); return s })
      return
    }
    setExpanded(prev => new Set([...prev, clientName]))
    if (subRows[clientName]) return

    setLoadingClients(prev => new Set([...prev, clientName]))
    try {
      const qs = buildQs({ dim: 'categoria', cliente: clientName })
      const res = await fetch('/api/comercial/sell-in/variaciones?' + qs)
      const j   = await res.json()
      setSubRows(prev => ({ ...prev, [clientName]: j.rows ?? [] }))
    } finally {
      setLoadingClients(prev => { const s = new Set(prev); s.delete(clientName); return s })
    }
  }, [expanded, subRows, buildQs])

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

  // Only show trimestres that have at least one active month
  const visibleTrimestres = TRIMESTRES.filter(t => t.meses.some(m => meses.includes(m)))

  const mesLabel = '2025 vs 2026 · Año completo'

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Sell In</p>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800">YTD y Variaciones</h1>
          <p className="text-xs md:text-sm text-gray-400 mt-0.5">{mesLabel}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={cargar}
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
          <div>
            <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Vista</p>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {(['cliente','categoria'] as DimKey[]).map(d => (
                <button key={d} onClick={() => { setDim(d); saveStorage({ dim: d }) }}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${dim===d?'bg-amber-500 text-white':'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {d === 'cliente' ? 'Por Cliente' : 'Por Categoría'}
                </button>
              ))}
            </div>
          </div>
          <FiltroMulti label="Tipo Negocio" options={TIPOS_OPT}  value={tipos}
            onChange={ts => { setTipos(ts); saveStorage({ tipos: ts }) }} placeholder="Todos" />
          <FiltroMulti label="País" options={PAISES_OPT} value={paises}
            onChange={ps => { setPaises(ps); saveStorage({ paises: ps }) }} placeholder="Todos los países" />
          <FiltroMulti label="Cliente" options={clienteOpts} value={clientes}
            onChange={cs => { setClientes(cs); saveStorage({ clientes: cs }) }}
            placeholder={paises.length ? 'Todos los clientes' : 'Todos los clientes'} />
          <FiltroMulti label="Categoría" options={categoriaOpts} value={categorias}
            onChange={cs => { setCategorias(cs); saveStorage({ categorias: cs }) }}
            placeholder="Todas las categorías" />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[11px]">
          <span className="text-gray-400">Variación:</span>
          <span className="text-green-600 font-semibold">● &gt;+5% Bueno</span>
          <span className="text-amber-600 font-semibold">● −5% a +5% Neutral</span>
          <span className="text-red-500 font-semibold">● &lt;−5% Alerta</span>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm h-40 flex items-center justify-center text-gray-300 text-sm">
          Cargando...
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm h-40 flex flex-col items-center justify-center text-gray-400 text-sm gap-2">
          <span className="text-3xl">📭</span>
          Sin datos disponibles.
        </div>
      ) : (
        <div className="space-y-4">
          {visibleTrimestres.map((trim, ti) => {
            const isLast = ti === visibleTrimestres.length - 1
            // Only include months that are actually in the YTD range
            const trimMeses = trim.meses.filter(m => meses.includes(m))
            const colSpanSection = 1 + trimMeses.length * 3 + 3

            return (
              <div key={trim.label} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
                <table className="w-full text-xs border-collapse" style={{ minWidth: `${180 + trimMeses.length * 165 + 180}px`, tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '180px' }} />
                    {trimMeses.flatMap(m => [
                      <col key={`${m}-25`} style={{ width: '95px' }} />,
                      <col key={`${m}-26`} style={{ width: '95px' }} />,
                      <col key={`${m}-v`}  style={{ width: '70px' }} />,
                    ])}
                    <col style={{ width: '95px' }} />
                    <col style={{ width: '95px' }} />
                    <col style={{ width: '70px' }} />
                  </colgroup>
                  <thead>
                    {/* Fila 1: Etiqueta trimestre */}
                    <tr>
                      <th colSpan={colSpanSection}
                        className={`py-2 px-4 text-left text-[11px] font-semibold tracking-wide border-b ${trim.headerCls}`}>
                        {trim.label}
                      </th>
                    </tr>
                    {/* Fila 2: Meses + columna totalizadora */}
                    <tr className="bg-gray-50 border-b border-gray-100 text-[10px] uppercase tracking-widest text-gray-400">
                      <th className="text-left py-2 px-4 border-r border-gray-200">
                        {dim === 'cliente' ? 'Cliente' : 'Categoría'}
                      </th>
                      {trimMeses.map(m => (
                        <th key={m} colSpan={3} className="py-1.5 text-center border-l border-gray-200">
                          {MESES_LABEL[m]}
                        </th>
                      ))}
                      {isLast ? (
                        <th colSpan={3} className="py-1.5 text-center border-l border-gray-300 text-amber-600 bg-amber-50/40 font-semibold">
                          Total Anual
                        </th>
                      ) : (
                        <th colSpan={3} className={`py-1.5 text-center border-l border-gray-300 font-semibold ${trim.subCls}`}>
                          Sub {trim.short}
                        </th>
                      )}
                    </tr>
                    {/* Fila 3: Años */}
                    <tr className="bg-gray-50 border-b border-gray-200 text-[10px] uppercase tracking-widest text-gray-400">
                      <th className="py-1.5 px-4 border-r border-gray-200" />
                      {trimMeses.flatMap(m => [
                        <th key={`${m}-25`} className="text-right py-1.5 px-2 font-normal border-l border-gray-200">2025</th>,
                        <th key={`${m}-26`} className="text-right py-1.5 px-1 font-normal">2026</th>,
                        <th key={`${m}-v`}  className="text-right py-1.5 px-2 font-normal">Var%</th>,
                      ])}
                      <th className="text-right py-1.5 px-2 font-normal border-l border-gray-300">2025</th>
                      <th className="text-right py-1.5 px-1 font-normal">2026</th>
                      <th className="text-right py-1.5 px-2 font-normal">Var%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const isExp     = expanded.has(r.dim)
                      const isLoading = loadingClients.has(r.dim)
                      const canExpand = dim === 'cliente'
                      const q = isLast
                        ? { s25: r.total2025, s26: r.total2026, v: r.varTotal }
                        : qSub(trim.meses, r.meses, meses)

                      return [
                        <tr key={`row-${ti}-${i}`}
                          onClick={() => canExpand && toggleClient(r.dim)}
                          className={`border-b border-gray-50 ${canExpand ? 'cursor-pointer hover:bg-amber-50/30' : 'hover:bg-amber-50/30'} ${i%2===0?'':'bg-gray-50/30'}`}>
                          <td className="py-2 px-4 font-medium text-gray-700 border-r border-gray-100">
                            <div className="flex items-center gap-1.5">
                              {canExpand && (
                                <ChevronRight size={12} className={`flex-shrink-0 text-gray-400 transition-transform ${isExp ? 'rotate-90' : ''}`} />
                              )}
                              <span className="truncate">{r.dim || '—'}</span>
                            </div>
                          </td>
                          {trimMeses.flatMap(m => {
                            const d = r.meses[m] ?? { y2025: 0, y2026: 0, var: null }
                            return [
                              <td key={`${m}-25`} className="py-2 px-2 text-right text-gray-500 border-l border-gray-100">{fmt(d.y2025)}</td>,
                              <td key={`${m}-26`} className="py-2 px-1 text-right text-gray-700">{fmt(d.y2026)}</td>,
                              <td key={`${m}-v`}  className={`py-2 px-2 text-right ${varColor(d.var)}`}>{fmtVar(d.var)}</td>,
                            ]
                          })}
                          <td className="py-2 px-2 text-right text-gray-500 border-l border-gray-300 bg-gray-50/60">{fmt(q.s25)}</td>
                          <td className="py-2 px-1 text-right font-semibold text-gray-800 bg-gray-50/60">{fmt(q.s26)}</td>
                          <td className={`py-2 px-2 text-right bg-gray-50/60 ${varColor(q.v)}`}>{fmtVar(q.v)}</td>
                        </tr>,

                        ...(canExpand && isExp
                          ? isLoading
                            ? [<tr key={`sub-loading-${ti}-${i}`} className="bg-amber-50/20">
                                <td colSpan={colSpanSection} className="py-2 px-8 text-xs text-gray-400">Cargando categorías…</td>
                              </tr>]
                            : (subRows[r.dim] ?? []).map((sub, si) => {
                                const sq = isLast
                                  ? { s25: sub.total2025, s26: sub.total2026, v: sub.varTotal }
                                  : qSub(trim.meses, sub.meses, meses)
                                return (
                                  <tr key={`sub-${ti}-${i}-${si}`} className="bg-amber-50/20 border-b border-amber-100/50">
                                    <td className="py-1.5 pl-10 pr-4 text-gray-500 italic truncate border-r border-gray-100">{sub.dim}</td>
                                    {trimMeses.flatMap(m => {
                                      const d = sub.meses[m] ?? { y2025: 0, y2026: 0, var: null }
                                      return [
                                        <td key={`${m}-25`} className="py-1.5 px-2 text-right text-gray-400 text-[11px] border-l border-gray-100">{fmt(d.y2025)}</td>,
                                        <td key={`${m}-26`} className="py-1.5 px-1 text-right text-gray-600 text-[11px]">{fmt(d.y2026)}</td>,
                                        <td key={`${m}-v`}  className={`py-1.5 px-2 text-right text-[11px] ${varColor(d.var)}`}>{fmtVar(d.var)}</td>,
                                      ]
                                    })}
                                    <td className="py-1.5 px-2 text-right text-gray-400 border-l border-gray-300 bg-gray-50/60 text-[11px]">{fmt(sq.s25)}</td>
                                    <td className="py-1.5 px-1 text-right font-semibold text-gray-700 bg-gray-50/60 text-[11px]">{fmt(sq.s26)}</td>
                                    <td className={`py-1.5 px-2 text-right bg-gray-50/60 text-[11px] ${varColor(sq.v)}`}>{fmtVar(sq.v)}</td>
                                  </tr>
                                )
                              })
                          : [])
                      ]
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-gray-300 bg-gray-50">
                    <tr className="font-bold text-gray-800">
                      <td className="py-2.5 px-4 text-xs uppercase tracking-widest text-gray-500 border-r border-gray-100">TOTAL</td>
                      {trimMeses.flatMap(m => {
                        const d = totals.meses[m] ?? { y2025: 0, y2026: 0 }
                        const v = d.y2025 > 0 ? ((d.y2026 - d.y2025) / d.y2025) * 100 : null
                        return [
                          <td key={`${m}-25`} className="py-2.5 px-2 text-right border-l border-gray-100">{fmt(d.y2025)}</td>,
                          <td key={`${m}-26`} className="py-2.5 px-1 text-right">{fmt(d.y2026)}</td>,
                          <td key={`${m}-v`}  className={`py-2.5 px-2 text-right ${varColor(v)}`}>{fmtVar(v)}</td>,
                        ]
                      })}
                      {isLast ? (() => (
                        <>
                          <td className="py-2.5 px-2 text-right border-l border-gray-300 bg-gray-100/60">{fmt(totals.total2025)}</td>
                          <td className="py-2.5 px-1 text-right bg-gray-100/60">{fmt(totals.total2026)}</td>
                          <td className={`py-2.5 px-2 text-right bg-gray-100/60 ${varColor(totalVar)}`}>{fmtVar(totalVar)}</td>
                        </>
                      ))() : (() => {
                        const qt = qSubTotals(trim.meses, totals, meses)
                        return (
                          <>
                            <td className="py-2.5 px-2 text-right border-l border-gray-300 bg-gray-100/60">{fmt(qt.s25)}</td>
                            <td className="py-2.5 px-1 text-right bg-gray-100/60">{fmt(qt.s26)}</td>
                            <td className={`py-2.5 px-2 text-right bg-gray-100/60 ${varColor(qt.v)}`}>{fmtVar(qt.v)}</td>
                          </>
                        )
                      })()}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
