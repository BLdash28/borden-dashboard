'use client'
import React, { useState, useEffect, useMemo, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import FiltroMulti from '@/components/ui/FiltroMulti'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'

// ── Tipos ──────────────────────────────────────────────────────────────────────
interface Row {
  ano:              number
  mes:              number
  mes_label:        string
  empresa:          string
  valor_proyectado: number
  valor_real:       number
  diferencia:       number
  pct_cumplimiento: number | null
}

interface CatRow {
  id:               number | null
  ano:              number
  mes:              number
  empresa:          string
  categoria:        string
  pais:             string
  cliente:          string
  valor_proyectado: number
  real_usd:         number | null
  synthetic:        boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const MES_LABELS: Record<number, string> = {
  1:'Ene', 2:'Feb', 3:'Mar', 4:'Abr', 5:'May', 6:'Jun',
  7:'Jul', 8:'Ago', 9:'Sep', 10:'Oct', 11:'Nov', 12:'Dic',
}

function fmt(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDiff(n: number) {
  return (n >= 0 ? '+$' : '-$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtK(v: number) {
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M'
  if (v >= 1_000)     return '$' + (v / 1_000).toFixed(0) + 'K'
  return '$' + v
}

function PctBadge({ v }: { v: number | null }) {
  if (v === null) return <span className="text-gray-400 text-xs">—</span>
  const cls =
    v >= 100 ? 'bg-green-100 text-green-700' :
    v >=  85 ? 'bg-yellow-100 text-yellow-700' :
               'bg-red-100 text-red-700'
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {v}%
    </span>
  )
}

// ── Tooltip personalizado ──────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const proy = payload.find((p: any) => p.dataKey === 'proyectado')?.value ?? 0
  const real = payload.find((p: any) => p.dataKey === 'real')?.value ?? 0
  const dif  = real - proy
  const pct  = proy > 0 ? Math.round(real / proy * 1000) / 10 : null
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-sm min-w-[180px]">
      <p className="font-semibold text-gray-800 mb-2">{label}</p>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">Proyectado</span>
          <span className="font-medium text-[#3a6fa8]">{fmt(proy)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">Real</span>
          <span className="font-medium text-[#2a7a58]">{fmt(real)}</span>
        </div>
        <div className="border-t border-gray-100 pt-1 mt-1 flex justify-between gap-4">
          <span className="text-gray-500">Diferencia</span>
          <span className={`font-semibold ${dif >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {fmtDiff(dif)}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">Cumplimiento</span>
          <PctBadge v={pct} />
        </div>
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────
function ProyeccionInner() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const parse = (key: string) => {
    const v = searchParams.get(key)
    return v ? v.split(',').filter(Boolean) : []
  }

  const [fAno,       setFAno]       = useState<string[]>(() => { const v = parse('ano'); return v.length ? v : [String(new Date().getFullYear())] })
  const [fMes,       setFMes]       = useState<string[]>(() => parse('mes'))
  const [fEmpresa,   setFEmpresa]   = useState<string[]>(() => { const v = parse('empresa'); return v.length ? v : ['BL FOODS'] })
  const [fCategoria, setFCategoria] = useState<string[]>(() => parse('categoria'))
  const [fPais,      setFPais]      = useState<string[]>(() => parse('pais'))
  const [fCliente,   setFCliente]   = useState<string[]>(() => parse('cliente'))

  const [anos,        setAnos]        = useState<number[]>([])
  const [rows,        setRows]        = useState<Row[]>([])
  const [catRows,     setCatRows]     = useState<CatRow[]>([])  // filtrados por todos los filtros
  const [catRowsAll,  setCatRowsAll]  = useState<CatRow[]>([])  // sin sub-filtros, para opciones dropdown
  const [otrasProy,   setOtrasProy]   = useState<{ tipo: string; total: number; meses: number }[]>([])
  const [expanded,    setExpanded]    = useState<Set<string>>(new Set())
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')

  // Sincronizar filtros → URL
  useEffect(() => {
    const p = new URLSearchParams()
    if (fAno.length)       p.set('ano',       fAno.join(','))
    if (fMes.length)       p.set('mes',       fMes.join(','))
    if (fEmpresa.length)   p.set('empresa',   fEmpresa.join(','))
    if (fCategoria.length) p.set('categoria', fCategoria.join(','))
    if (fPais.length)      p.set('pais',      fPais.join(','))
    if (fCliente.length)   p.set('cliente',   fCliente.join(','))
    router.replace('?' + p.toString(), { scroll: false })
  }, [fAno, fMes, fEmpresa, fCategoria, fPais, fCliente, router])

  // Cascading resets
  useEffect(() => { setFCategoria([]); setFPais([]); setFCliente([]) }, [fEmpresa])
  useEffect(() => { setFPais([]); setFCliente([]) }, [fCategoria])
  useEffect(() => { setFCliente([]) },               [fPais])

  // Fetch base (ano/mes/empresa): actualiza rows, catRowsAll y catRows cuando no hay sub-filtro
  const fetchBase = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const p = new URLSearchParams()
      if (fAno.length)     p.set('ano',     fAno.join(','))
      if (fMes.length)     p.set('mes',     fMes.join(','))
      if (fEmpresa.length) p.set('empresa', fEmpresa.join(','))
      const res  = await fetch(`/api/ventas/proyeccion?${p}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setRows(data.rows ?? [])
      setCatRowsAll(data.catRows ?? [])
      setCatRows(data.catRows ?? [])
      setOtrasProy(data.otras_proyecciones ?? [])
      if (data.anos?.length) setAnos(data.anos)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }, [fAno, fMes, fEmpresa])

  useEffect(() => { fetchBase() }, [fetchBase])

  // Fetch filtrado (categoria/pais/cliente): re-fetch con sub-filtros activos
  const fetchFiltered = useCallback(async () => {
    if (!fCategoria.length && !fPais.length && !fCliente.length) {
      // Sin sub-filtro: restaurar catRows desde catRowsAll
      setCatRows(catRowsAll)
      return
    }
    try {
      const p = new URLSearchParams()
      if (fAno.length)       p.set('ano',       fAno.join(','))
      if (fMes.length)       p.set('mes',       fMes.join(','))
      if (fEmpresa.length)   p.set('empresa',   fEmpresa.join(','))
      if (fCategoria.length) p.set('categoria', fCategoria.join(','))
      if (fPais.length)      p.set('pais',      fPais.join(','))
      if (fCliente.length)   p.set('cliente',   fCliente.join(','))
      const res  = await fetch(`/api/ventas/proyeccion?${p}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setCatRows(data.catRows ?? [])
      setOtrasProy(data.otras_proyecciones ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos')
    }
  }, [fAno, fMes, fEmpresa, fCategoria, fPais, fCliente, catRowsAll])

  useEffect(() => { fetchFiltered() }, [fCategoria, fPais, fCliente]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Opciones de filtros jerárquicos (desde catRowsAll, sin sub-filtro) ────────
  const optCategorias = useMemo(() =>
    [...new Set(catRowsAll.map(r => r.categoria))].filter(Boolean).sort()
  , [catRowsAll])

  const optPaises = useMemo(() =>
    [...new Set(catRowsAll
      .filter(r => !fCategoria.length || fCategoria.includes(r.categoria))
      .map(r => r.pais)
    )].filter(Boolean).sort()
  , [catRowsAll, fCategoria])

  const optClientes = useMemo(() =>
    [...new Set(catRowsAll
      .filter(r =>
        (!fCategoria.length || fCategoria.includes(r.categoria)) &&
        (!fPais.length      || fPais.includes(r.pais))
      )
      .map(r => r.cliente)
    )].filter(Boolean).sort()
  , [catRowsAll, fCategoria, fPais])

  const activeSubFilter = fCategoria.length > 0 || fPais.length > 0 || fCliente.length > 0

  // Cuando hay sub-filtro activo, recalcular las filas de empresa-nivel desde catRows filtrados
  const tableRows = useMemo(() => {
    if (!activeSubFilter) return rows
    const grouped: Record<string, { proy: number; real: number }> = {}
    for (const c of catRows) {
      const k = `${c.ano}-${c.mes}-${c.empresa}`
      if (!grouped[k]) grouped[k] = { proy: 0, real: 0 }
      grouped[k].proy += c.valor_proyectado
      grouped[k].real += c.real_usd ?? 0
    }
    return rows
      .map(r => {
        const k = `${r.ano}-${r.mes}-${r.empresa}`
        const g = grouped[k]
        if (!g) return null
        const vp = g.proy, vr = g.real
        return { ...r, valor_proyectado: vp, valor_real: vr, diferencia: vr - vp,
                 pct_cumplimiento: vp > 0 ? Math.round(vr / vp * 1000) / 10 : null }
      })
      .filter((r): r is Row => r !== null)
  }, [rows, catRows, activeSubFilter])

  const mesesDisponibles = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => i + 1)
  , [])

  // catRows ya viene filtrado del API (por categoria/pais/cliente)
  // Solo sumamos directamente sin filtro adicional client-side
  let _proy = 0, _real = 0, _ultimoMes = 0
  for (const r of catRows) {
    _proy += r.valor_proyectado
    _real += r.real_usd ?? 0
    if ((r.real_usd ?? 0) > 0) _ultimoMes = Math.max(_ultimoMes, r.mes)
  }
  let _proyYTD = 0
  for (const r of catRows) {
    if (r.mes <= _ultimoMes) _proyYTD += r.valor_proyectado
  }
  const kpis = {
    proy:      _proy,
    real:      _real,
    dif:       _real - _proy,
    pct:       _proy > 0 ? Math.round(_real / _proy * 1000) / 10 : null,
    facing:    _proy > 0 && _ultimoMes > 0 ? Math.round(_proyYTD / _proy * 1000) / 10 : null,
    ultimoMes: _ultimoMes,
  }

  const chartDataMap: Record<number, { mes_label: string; proyectado: number; real: number }> = {}
  for (const r of catRows) {
    if (!chartDataMap[r.mes]) chartDataMap[r.mes] = { mes_label: MES_LABELS[r.mes] ?? String(r.mes), proyectado: 0, real: 0 }
    chartDataMap[r.mes].proyectado += r.valor_proyectado
    chartDataMap[r.mes].real       += r.real_usd ?? 0
  }
  const chartData = Object.entries(chartDataMap)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, v]) => v)

  const titulo =
    !fAno.length        ? 'Toda la historia' :
    fAno.length === 1 && !fMes.length ? `Año ${fAno[0]} completo` :
    fAno.length === 1 && fMes.length === 1 ? `${MES_LABELS[Number(fMes[0])]} ${fAno[0]}` :
    [fAno.join(', '), fMes.length ? fMes.map(m => MES_LABELS[Number(m)]).join(', ') : ''].filter(Boolean).join(' — ')

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      {/* Encabezado */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Proyección</h1>
        <p className="text-xs md:text-sm text-gray-500 mt-0.5">{titulo}</p>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap gap-2 md:gap-3">
          <FiltroMulti
            label="Año"
            options={anos.map(a => ({ value: String(a) }))}
            value={fAno}
            onChange={setFAno}
            placeholder="Todos"
            className="flex-1 min-w-[80px]"
          />
          <FiltroMulti
            label="Mes"
            options={mesesDisponibles.map(m => ({ value: String(m), label: MES_LABELS[m] }))}
            value={fMes}
            onChange={setFMes}
            placeholder="Todos"
            className="flex-1 min-w-[90px]"
          />
          <FiltroMulti
            label="País"
            options={optPaises.map(p => ({ value: p }))}
            value={fPais}
            onChange={setFPais}
            placeholder="Todos"
            className="flex-1 min-w-[80px]"
          />
          <FiltroMulti
            label="Tipo Negocio"
            options={[
              { value: 'BL FOODS' },
              { value: 'LICENCIAMIENTO', label: 'Licenciamiento' },
            ]}
            value={fEmpresa}
            onChange={setFEmpresa}
            placeholder="Todas"
            className="flex-[2] min-w-[140px]"
          />
          <FiltroMulti
            label="Categoría"
            options={optCategorias.map(c => ({ value: c }))}
            value={fCategoria}
            onChange={setFCategoria}
            placeholder="Todas"
            className="flex-1 min-w-[100px]"
          />
          <FiltroMulti
            label="Cliente"
            options={optClientes.map(c => ({ value: c }))}
            value={fCliente}
            onChange={setFCliente}
            placeholder="Todos"
            className="flex-[2] min-w-[140px]"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 md:p-5">
          <p className="text-xs font-semibold text-gray-500 mb-1 md:mb-2 leading-tight">Total Proyectado 2026</p>
          <p className="text-[10px] text-gray-400 mb-1">Original</p>
          <p className="text-lg md:text-2xl font-bold text-gray-900 break-all">{fmt(kpis.proy)}</p>
        </div>
        {/* Card por cada tipo adicional (Revisión, Forecast, etc.) */}
        {otrasProy.map(o => {
          const label = o.tipo.charAt(0) + o.tipo.slice(1).toLowerCase()
          const dif   = o.total - kpis.proy
          return (
            <div key={o.tipo} className="bg-white rounded-xl border border-blue-100 shadow-sm p-3 md:p-5 ring-1 ring-blue-50">
              <p className="text-xs font-semibold text-blue-700 mb-1 md:mb-2 leading-tight">Proyectado — {label}</p>
              <p className="text-[10px] text-gray-400 mb-1">vs original: {dif >= 0 ? '+' : '−'}{fmtK(Math.abs(dif))}</p>
              <p className="text-lg md:text-2xl font-bold text-blue-700 break-all">{fmt(o.total)}</p>
            </div>
          )
        })}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 md:p-5">
          <p className="text-xs font-semibold text-gray-500 mb-1 md:mb-2 leading-tight">Total Real YTD</p>
          <p className="text-lg md:text-2xl font-bold text-gray-900 break-all">{fmt(kpis.real)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 md:p-5">
          <p className="text-xs font-semibold text-gray-500 mb-1 md:mb-2 leading-tight">Diferencia USD YTG</p>
          <p className={`text-lg md:text-2xl font-bold break-all ${kpis.dif >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {fmtDiff(kpis.dif)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 md:p-5">
          <p className="text-xs font-semibold text-gray-500 mb-1 md:mb-2 leading-tight">% Cumplimiento</p>
          <div className="text-lg md:text-2xl font-bold">
            {kpis.pct === null
              ? <span className="text-gray-400 text-xs">—</span>
              : <span className={kpis.pct >= (kpis.facing ?? 0) ? 'text-green-600' : 'text-red-600'}>
                  {kpis.pct}%
                </span>
            }
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 md:p-5 col-span-2 sm:col-span-1">
          <p className="text-xs font-semibold text-gray-500 mb-0.5 md:mb-1 leading-tight">Facing</p>
          <p className="text-[10px] text-gray-400 mb-1 md:mb-2">
            Proy. hasta {kpis.ultimoMes > 0 ? MES_LABELS[kpis.ultimoMes] : '—'} / total anual
          </p>
          <div className="text-lg md:text-2xl font-bold">
            {kpis.facing !== null
              ? <span className="text-blue-600">{kpis.facing}%</span>
              : <span className="text-gray-400 text-xs">—</span>
            }
          </div>
        </div>
      </div>

      {/* Gráfico */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 md:p-5">
          <h2 className="text-xs md:text-sm font-semibold text-gray-700 mb-3 md:mb-4">Proyectado vs Real por Mes</h2>
          <div className="h-[200px] md:h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="mes_label" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={72} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f9fafb' }} />
              <Legend
                wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                formatter={(v: string) => v.charAt(0).toUpperCase() + v.slice(1)}
              />
              <Bar dataKey="proyectado" name="Proyectado" fill="#3a6fa8" radius={[3, 3, 0, 0]} maxBarSize={40} />
              <Bar dataKey="real"       name="Real"       fill="#2a7a58" radius={[3, 3, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-3 md:px-5 py-3 md:py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Detalle</h2>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-gray-400">Cargando…</div>
        ) : tableRows.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">Sin datos para el período seleccionado</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  {['Mes', 'Tipo Negocio', 'Categoría / País / Cliente', 'Proyectado USD', 'Real USD', 'Diferencia', '% Cumpl.'].map(h => (
                    <th key={h} className={`px-4 py-3 text-xs font-semibold text-gray-500 ${
                      ['Proyectado USD','Real USD','Diferencia'].includes(h) ? 'text-right' :
                      h === '% Cumpl.' ? 'text-center' : ''
                    }`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tableRows.map((r, i) => {
                  const expandKey = `${r.ano}-${r.mes}-${r.empresa}`
                  const hasCats   = r.empresa === 'LICENCIAMIENTO' || r.empresa === 'BL FOODS'

                  // catRows ya viene filtrado del API — solo filtrar por empresa+mes
                  const subRows = catRows.filter(c =>
                    c.ano === r.ano && c.mes === r.mes && c.empresa === r.empresa
                  )

                  // Si hay filtro activo y esta fila no tiene sub-rows → ocultar
                  if (activeSubFilter && hasCats && subRows.length === 0) return null

                  // Auto-expandir cuando hay filtro activo
                  const isExp = activeSubFilter ? subRows.length > 0 : expanded.has(expandKey)

                  const isBlue   = r.empresa === 'BL FOODS'
                  const badgeCls = isBlue ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                  const hoverCls = hasCats
                    ? (isBlue ? 'cursor-pointer hover:bg-blue-50/30' : 'cursor-pointer hover:bg-purple-50/40')
                    : 'hover:bg-gray-50/60'
                  const subBg    = isBlue ? 'bg-blue-50/20 border-l-2 border-blue-200' : 'bg-purple-50/30 border-l-2 border-purple-200'

                  const toggleExp = () => {
                    if (!hasCats || activeSubFilter) return
                    setExpanded(prev => {
                      const s = new Set(prev)
                      s.has(expandKey) ? s.delete(expandKey) : s.add(expandKey)
                      return s
                    })
                  }

                  return (
                    <React.Fragment key={`grp-${i}`}>
                      {/* Fila empresa */}
                      <tr
                        onClick={toggleExp}
                        className={`transition-colors ${hoverCls}`}
                      >
                        <td className="px-4 py-3 text-gray-700 font-medium whitespace-nowrap">
                          {r.mes_label} {r.ano}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {hasCats && (
                              <ChevronRight
                                size={13}
                                className={`transition-transform flex-shrink-0 ${isBlue ? 'text-blue-400' : 'text-purple-400'} ${isExp ? 'rotate-90' : ''}`}
                              />
                            )}
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badgeCls}`}>
                              {r.empresa === 'LICENCIAMIENTO' ? 'Licenciamiento' : r.empresa}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3" />
                        <td className="px-4 py-3 text-right text-gray-700">{fmt(r.valor_proyectado)}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{fmt(r.valor_real)}</td>
                        <td className={`px-4 py-3 text-right font-semibold ${
                          r.diferencia >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {fmtDiff(r.diferencia)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <PctBadge v={r.pct_cumplimiento} />
                        </td>
                      </tr>

                      {/* Sub-filas de categoría */}
                      {isExp && subRows.map((c, ci) => {
                        return (
                          <tr key={`cat-${i}-${ci}`} className={subBg}>
                            <td className="px-4 py-2" />
                            <td className="px-4 py-2" />
                            <td className="px-4 py-2">
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-semibold text-gray-600">{c.categoria}</span>
                                </div>
                                <span className="text-[11px] text-gray-500">{c.pais} — {c.cliente}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2 text-right text-xs text-gray-500">
                              {c.valor_proyectado > 0 ? fmt(c.valor_proyectado) : <span className="text-gray-300">—</span>}
                            </td>
                            {/* Real USD — solo lectura desde sellin */}
                            <td className="px-4 py-2 text-right text-xs text-gray-700">
                              {c.real_usd !== null ? fmt(c.real_usd) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-2 text-right text-xs">
                              {c.real_usd !== null ? (
                                <span className={`font-semibold ${(c.real_usd - c.valor_proyectado) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {fmtDiff(c.real_usd - c.valor_proyectado)}
                                </span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-center text-xs">
                              {c.real_usd !== null && c.valor_proyectado > 0 ? (
                                <PctBadge v={Math.round(c.real_usd / c.valor_proyectado * 1000) / 10} />
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ProyeccionPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-400 text-sm">Cargando…</div>}>
      <ProyeccionInner />
    </Suspense>
  )
}
