'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { Download, RefreshCw, ChevronRight } from 'lucide-react'
import FiltroMulti from '@/components/ui/FiltroMulti'

const STORAGE_KEY = 'bl_sellout_ytd_v1'

const MESES_LABEL = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const PAISES      = ['CR','GT','SV','NI','HN','CO']
const PAISES_OPT  = PAISES.map(p => ({ value: p }))

const TRIMESTRES = [
  { label: 'Q1 · Ene – Mar', short: 'Q1', meses: [1,2,3],    headerCls: 'text-blue-700 bg-blue-50/80 border-blue-200'    },
  { label: 'Q2 · Abr – Jun', short: 'Q2', meses: [4,5,6],    headerCls: 'text-green-700 bg-green-50/80 border-green-200' },
  { label: 'Q3 · Jul – Sep', short: 'Q3', meses: [7,8,9],    headerCls: 'text-purple-700 bg-purple-50/80 border-purple-200' },
  { label: 'Q4 · Oct – Dic', short: 'Q4', meses: [10,11,12], headerCls: 'text-amber-700 bg-amber-50/80 border-amber-200' },
]

const fmt = (v: number) => {
  if (!isFinite(v)) return '—'
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Formato compacto para celdas de tabla ancha (K / M abreviados).
const fmtCompact = (v: number) => {
  if (!isFinite(v) || v === 0) return '—'
  const abs = Math.abs(v)
  if (abs >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M'
  if (abs >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K'
  return '$' + v.toFixed(0)
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

export default function SellOutYTD() {
  const [dim,        setDim]        = useState<DimKey>('cliente')
  const [paises,     setPaises]     = useState<string[]>([])
  const [clientes,   setClientes]   = useState<string[]>([])
  const [categorias, setCategorias] = useState<string[]>([])
  const [subcats,    setSubcats]    = useState<string[]>([])
  const initDone = useRef(false)
  const [rows,   setRows]   = useState<VarRow[]>([])
  const [totals, setTotals] = useState<Totals>({ total2025: 0, total2026: 0, meses: {} })
  const [ultimoDia, setUltimoDia] = useState<number | null>(null)
  const [loading,setLoading]= useState(true)

  const [clienteOpts,   setClienteOpts]   = useState<{ value: string }[]>([])
  const [categoriaOpts, setCategoriaOpts] = useState<{ value: string }[]>([])
  const [subcatOpts,    setSubcatOpts]    = useState<{ value: string }[]>([])

  const [expanded,       setExpanded]       = useState<Set<string>>(new Set())
  const [subRows,        setSubRows]        = useState<Record<string, VarRow[]>>({})
  const [loadingClients, setLoadingClients] = useState<Set<string>>(new Set())

  const buildQs = useCallback((extra?: Record<string, string>) => {
    const qs = new URLSearchParams({ dim })
    if (paises.length)     qs.set('pais',         paises.join(','))
    if (clientes.length)   qs.set('cliente',      clientes.join(','))
    if (categorias.length) qs.set('categoria',    categorias.join(','))
    if (subcats.length)    qs.set('subcategoria', subcats.join(','))
    if (extra) Object.entries(extra).forEach(([k, v]) => qs.set(k, v))
    return qs
  }, [dim, paises, clientes, categorias, subcats])

  const cargar = useCallback(async () => {
    setLoading(true)
    setExpanded(new Set())
    setSubRows({})
    try {
      const res = await fetch('/api/comercial/sellout/ytd?' + buildQs())
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = await res.json()
      setRows(j.rows ?? [])
      setTotals(j.totals ?? { total2025: 0, total2026: 0, meses: {} })
      setUltimoDia(typeof j.ultimoDia === 'number' ? j.ultimoDia : null)
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
        if (s.clientes?.length)   setClientes(s.clientes)
        if (s.categorias?.length) setCategorias(s.categorias)
        if (s.subcats?.length)    setSubcats(s.subcats)
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveStorage = useCallback((patch: Record<string, unknown>) => {
    try {
      const base = { dim, paises, clientes, categorias, subcats }
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...base, ...patch }))
    } catch {}
  }, [dim, paises, clientes, categorias, subcats])

  // Cascada de opciones — usa /api/ventas/dimension (mv_sellout_agg)
  useEffect(() => {
    const qs = new URLSearchParams({ dim: 'cliente' })
    if (paises.length) qs.set('paises', paises.join(','))
    fetch('/api/ventas/dimension?' + qs).then(r => r.json()).then(j => {
      const opts = (j.rows ?? []).map((r: { nombre: string }) => ({ value: r.nombre })).filter((o: { value: string }) => o.value)
      setClienteOpts(opts)
      setClientes(prev => prev.filter(c => opts.some((o: { value: string }) => o.value === c)))
    })
  }, [paises])

  useEffect(() => {
    const qs = new URLSearchParams({ dim: 'categoria' })
    if (paises.length)   qs.set('paises',   paises.join(','))
    if (clientes.length) qs.set('clientes', clientes.join(','))
    fetch('/api/ventas/dimension?' + qs).then(r => r.json()).then(j => {
      const opts = (j.rows ?? []).map((r: { nombre: string }) => ({ value: r.nombre })).filter((o: { value: string }) => o.value)
      setCategoriaOpts(opts)
      setCategorias(prev => prev.filter(c => opts.some((o: { value: string }) => o.value === c)))
    })
  }, [paises, clientes])

  useEffect(() => {
    const qs = new URLSearchParams({ dim: 'subcategoria' })
    if (paises.length)     qs.set('paises',     paises.join(','))
    if (clientes.length)   qs.set('clientes',   clientes.join(','))
    if (categorias.length) qs.set('categorias', categorias.join(','))
    fetch('/api/ventas/dimension?' + qs).then(r => r.json()).then(j => {
      const opts = (j.rows ?? []).map((r: { nombre: string }) => ({ value: r.nombre })).filter((o: { value: string }) => o.value)
      setSubcatOpts(opts)
      setSubcats(prev => prev.filter(c => opts.some((o: { value: string }) => o.value === c)))
    })
  }, [paises, clientes, categorias])

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
      const res = await fetch('/api/comercial/sellout/ytd?' + qs)
      const j   = await res.json()
      setSubRows(prev => ({ ...prev, [clientName]: j.rows ?? [] }))
    } finally {
      setLoadingClients(prev => { const s = new Set(prev); s.delete(clientName); return s })
    }
  }, [expanded, subRows, buildQs])

  // Meses activos = donde existe algún dato 2026
  const allMeses = [1,2,3,4,5,6,7,8,9,10,11,12]
  const ultimoMes2026 = Math.max(0, ...allMeses.filter(m => (totals.meses[m]?.y2026 ?? 0) > 0))
  const mesesVisibles = ultimoMes2026 > 0 ? allMeses.filter(m => m <= ultimoMes2026) : allMeses

  const visibleTrimestres = TRIMESTRES.filter(t => t.meses.some(m => mesesVisibles.includes(m)))

  // Resumen YTD del período visible (mismos meses en ambos años)
  const ytdTotal2025 = mesesVisibles.reduce((s, m) => s + (totals.meses[m]?.y2025 ?? 0), 0)
  const ytdTotal2026 = mesesVisibles.reduce((s, m) => s + (totals.meses[m]?.y2026 ?? 0), 0)
  const ytdVar       = ytdTotal2025 > 0 ? ((ytdTotal2026 - ytdTotal2025) / ytdTotal2025) * 100 : null

  const diaSuffix = ultimoDia ? ` ${ultimoDia}` : ''
  const mesLabel = ultimoMes2026 > 0
    ? `2025 vs 2026 · Hasta ${MESES_LABEL[ultimoMes2026]}${diaSuffix}`
    : '2025 vs 2026'

  const descargarCSV = () => {
    const header = [dim === 'cliente' ? 'Cliente' : 'Categoría']
    mesesVisibles.forEach(m => {
      const ml = MESES_LABEL[m]
      header.push(`${ml} 2025`, `${ml} 2026`)
    })
    const csv = [header.join(','),
      ...rows.map(r => {
        const line: string[] = [`"${r.dim}"`]
        mesesVisibles.forEach(m => {
          const d = r.meses[m] ?? { y2025: 0, y2026: 0, var: null }
          line.push(d.y2025.toFixed(2), d.y2026.toFixed(2))
        })
        return line.join(',')
      })
    ].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `ytd_sellout_${dim}_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Sell Out</p>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800">YTD Sell-Out</h1>
          <p className="text-xs md:text-sm text-gray-400 mt-0.5">{mesLabel} · Hasta el último mes de cierre</p>
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
          <FiltroMulti label="País" options={PAISES_OPT} value={paises}
            onChange={ps => { setPaises(ps); saveStorage({ paises: ps }) }}
            placeholder="Todos los países" />
          <FiltroMulti label="Cliente" options={clienteOpts} value={clientes}
            onChange={cs => { setClientes(cs); saveStorage({ clientes: cs }) }}
            placeholder="Todos los clientes" />
          <FiltroMulti label="Categoría" options={categoriaOpts} value={categorias}
            onChange={cs => { setCategorias(cs); saveStorage({ categorias: cs }) }}
            placeholder="Todas las categorías" />
          <FiltroMulti label="Subcategoría" options={subcatOpts} value={subcats}
            onChange={ss => { setSubcats(ss); saveStorage({ subcats: ss }) }}
            placeholder="Todas las subcategorías" />
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm h-40 flex items-center justify-center text-gray-300 text-sm">
          Cargando...
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm h-40 flex flex-col items-center justify-center text-gray-400 text-sm gap-2">
          <span className="text-3xl">📭</span>
          Sin datos de Sell-Out disponibles.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Resumen YTD del período visible */}
          <div className="bg-white rounded-xl border border-amber-100 shadow-sm p-4 md:p-5 ring-1 ring-amber-50">
            <div className="flex items-baseline justify-between flex-wrap gap-3">
              <div>
                <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-widest">Resumen YTD</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {ultimoMes2026 > 0 ? `Ene → ${MESES_LABEL[ultimoMes2026]}${diaSuffix} · Mismo período en ambos años` : '—'}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 mt-3 text-center">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">YTD 2025</p>
                <p className="text-lg md:text-2xl font-bold text-gray-700 tabular-nums">{fmt(ytdTotal2025)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">YTD 2026</p>
                <p className="text-lg md:text-2xl font-bold text-gray-900 tabular-nums">{fmt(ytdTotal2026)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Variación</p>
                <p className={`text-lg md:text-2xl font-bold tabular-nums ${varColor(ytdVar)}`}>{fmtVar(ytdVar)}</p>
                <p className="text-[10px] text-gray-400 tabular-nums mt-0.5">
                  Δ {ytdTotal2026 - ytdTotal2025 >= 0 ? '+' : '−'}{fmt(Math.abs(ytdTotal2026 - ytdTotal2025))}
                </p>
              </div>
            </div>
          </div>

          {/* Tabla única horizontal: todos los meses visibles + Totales + Variación al final */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
            <table className="w-full text-[11px] border-collapse" style={{ minWidth: `${160 + mesesVisibles.length * 120 + 220}px`, tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '150px' }} />
                {mesesVisibles.flatMap(m => [
                  <col key={`${m}-25`} style={{ width: '60px' }} />,
                  <col key={`${m}-26`} style={{ width: '60px' }} />,
                ])}
                <col style={{ width: '78px' }} />
                <col style={{ width: '78px' }} />
                <col style={{ width: '64px' }} />
              </colgroup>
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-[9px] uppercase tracking-wide text-gray-400">
                  <th rowSpan={2} className="text-left py-1.5 px-2 border-r border-gray-200 align-middle">
                    {dim === 'cliente' ? 'Cliente' : 'Categoría'}
                  </th>
                  {mesesVisibles.map(m => {
                    const trim = TRIMESTRES.find(t => t.meses.includes(m))
                    return (
                      <th key={m} colSpan={2}
                        className={`py-1 text-center border-l border-gray-200 ${trim?.headerCls ?? ''}`}>
                        {MESES_LABEL[m]}
                      </th>
                    )
                  })}
                  <th colSpan={2} className="py-1 text-center border-l-2 border-gray-300 text-amber-700 bg-amber-50/80">
                    YTD
                  </th>
                  <th rowSpan={2} className="py-1 text-center border-l border-gray-300 align-middle text-amber-700 bg-amber-50/80">
                    Var %
                  </th>
                </tr>
                <tr className="bg-gray-50 border-b border-gray-200 text-[9px] uppercase tracking-wide text-gray-400">
                  {mesesVisibles.flatMap(m => [
                    <th key={`${m}-25`} className="text-right py-1 px-1 font-normal border-l border-gray-200">&apos;25</th>,
                    <th key={`${m}-26`} className="text-right py-1 px-1 font-normal">&apos;26</th>,
                  ])}
                  <th className="text-right py-1 px-1 font-normal border-l-2 border-gray-300 bg-amber-50/40">&apos;25</th>
                  <th className="text-right py-1 px-1 font-normal bg-amber-50/40">&apos;26</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const isExp     = expanded.has(r.dim)
                  const isLoading = loadingClients.has(r.dim)
                  const canExpand = dim === 'cliente'
                  // Totales YTD por fila usando solo meses visibles
                  const rowTot25 = mesesVisibles.reduce((s, m) => s + (r.meses[m]?.y2025 ?? 0), 0)
                  const rowTot26 = mesesVisibles.reduce((s, m) => s + (r.meses[m]?.y2026 ?? 0), 0)
                  const rowVar   = rowTot25 > 0 ? ((rowTot26 - rowTot25) / rowTot25) * 100 : (rowTot26 > 0 ? 100 : null)

                  return [
                    <tr key={`row-${i}`}
                      onClick={() => canExpand && toggleClient(r.dim)}
                      className={`border-b border-gray-50 ${canExpand ? 'cursor-pointer hover:bg-amber-50/30' : 'hover:bg-amber-50/30'} ${i%2===0?'':'bg-gray-50/30'}`}>
                      <td className="py-1.5 px-2 font-medium text-gray-700 border-r border-gray-100 tabular-nums">
                        <div className="flex items-center gap-1">
                          {canExpand && (
                            <ChevronRight size={11} className={`flex-shrink-0 text-gray-400 transition-transform ${isExp ? 'rotate-90' : ''}`} />
                          )}
                          <span className="truncate text-[11px]">{r.dim || '—'}</span>
                        </div>
                      </td>
                      {mesesVisibles.flatMap(m => {
                        const d = r.meses[m] ?? { y2025: 0, y2026: 0, var: null }
                        return [
                          <td key={`${m}-25`} className="py-1.5 px-1 text-right text-gray-500 border-l border-gray-100 tabular-nums">{fmtCompact(d.y2025)}</td>,
                          <td key={`${m}-26`} className="py-1.5 px-1 text-right text-gray-700 tabular-nums">{fmtCompact(d.y2026)}</td>,
                        ]
                      })}
                      <td className="py-1.5 px-1 text-right font-semibold text-gray-600 border-l-2 border-gray-200 bg-amber-50/20 tabular-nums">{fmtCompact(rowTot25)}</td>
                      <td className="py-1.5 px-1 text-right font-semibold text-gray-800 bg-amber-50/20 tabular-nums">{fmtCompact(rowTot26)}</td>
                      <td className={`py-1.5 px-1 text-right border-l border-gray-200 bg-amber-50/20 tabular-nums ${varColor(rowVar)}`}>{fmtVar(rowVar)}</td>
                    </tr>,

                    ...(canExpand && isExp
                      ? isLoading
                        ? [<tr key={`sub-loading-${i}`} className="bg-amber-50/20">
                            <td colSpan={1 + mesesVisibles.length * 2 + 3} className="py-2 px-8 text-xs text-gray-400">Cargando categorías…</td>
                          </tr>]
                        : (subRows[r.dim] ?? []).map((sub, si) => {
                            const subTot25 = mesesVisibles.reduce((s, m) => s + (sub.meses[m]?.y2025 ?? 0), 0)
                            const subTot26 = mesesVisibles.reduce((s, m) => s + (sub.meses[m]?.y2026 ?? 0), 0)
                            const subVar   = subTot25 > 0 ? ((subTot26 - subTot25) / subTot25) * 100 : (subTot26 > 0 ? 100 : null)
                            return (
                              <tr key={`sub-${i}-${si}`} className="bg-amber-50/20 border-b border-amber-100/50">
                                <td className="py-1 pl-6 pr-2 text-gray-500 italic truncate border-r border-gray-100 text-[10px]">{sub.dim}</td>
                                {mesesVisibles.flatMap(m => {
                                  const d = sub.meses[m] ?? { y2025: 0, y2026: 0, var: null }
                                  return [
                                    <td key={`${m}-25`} className="py-1 px-1 text-right text-gray-400 text-[10px] border-l border-gray-100 tabular-nums">{fmtCompact(d.y2025)}</td>,
                                    <td key={`${m}-26`} className="py-1 px-1 text-right text-gray-600 text-[10px] tabular-nums">{fmtCompact(d.y2026)}</td>,
                                  ]
                                })}
                                <td className="py-1 px-1 text-right text-gray-500 text-[10px] font-semibold border-l-2 border-gray-200 bg-amber-50/30 tabular-nums">{fmtCompact(subTot25)}</td>
                                <td className="py-1 px-1 text-right text-gray-700 text-[10px] font-semibold bg-amber-50/30 tabular-nums">{fmtCompact(subTot26)}</td>
                                <td className={`py-1 px-1 text-right text-[10px] border-l border-gray-200 bg-amber-50/30 tabular-nums ${varColor(subVar)}`}>{fmtVar(subVar)}</td>
                              </tr>
                            )
                          })
                      : [])
                  ]
                })}
              </tbody>
              <tfoot className="border-t-2 border-gray-300 bg-gray-50">
                <tr className="font-bold text-gray-800 text-[11px]">
                  <td className="py-2 px-2 text-[10px] uppercase tracking-wide text-gray-500 border-r border-gray-100">TOTAL</td>
                  {mesesVisibles.flatMap(m => {
                    const d = totals.meses[m] ?? { y2025: 0, y2026: 0 }
                    return [
                      <td key={`${m}-25`} className="py-2 px-1 text-right border-l border-gray-100 tabular-nums">{fmtCompact(d.y2025)}</td>,
                      <td key={`${m}-26`} className="py-2 px-1 text-right tabular-nums">{fmtCompact(d.y2026)}</td>,
                    ]
                  })}
                  <td className="py-2 px-1 text-right border-l-2 border-gray-300 bg-amber-100/40 tabular-nums">{fmtCompact(ytdTotal2025)}</td>
                  <td className="py-2 px-1 text-right bg-amber-100/40 tabular-nums">{fmtCompact(ytdTotal2026)}</td>
                  <td className={`py-2 px-1 text-right border-l border-gray-300 bg-amber-100/40 tabular-nums ${varColor(ytdVar)}`}>{fmtVar(ytdVar)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
