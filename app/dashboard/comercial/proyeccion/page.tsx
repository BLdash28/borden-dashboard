'use client'
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { ChevronRight, Pencil } from 'lucide-react'
import MultiSelect from '@/components/dashboard/MultiSelect'
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
  id:               number
  ano:              number
  mes:              number
  empresa:          string
  categoria:        string
  pais:             string
  cliente:          string
  valor_proyectado: number
  real_usd:         number | null
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
export default function ProyeccionPage() {
  const [fAno,       setFAno]       = useState('')
  const [fMes,       setFMes]       = useState('')
  const [fEmpresa,   setFEmpresa]   = useState('')
  const [fCategoria, setFCategoria] = useState<string[]>([])
  const [fPais,      setFPais]      = useState<string[]>([])
  const [fCliente,   setFCliente]   = useState<string[]>([])

  const [anos,     setAnos]     = useState<number[]>([])
  const [rows,     setRows]     = useState<Row[]>([])
  const [catRows,  setCatRows]  = useState<CatRow[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  // Inline edit state
  const [editingId,  setEditingId]  = useState<number | null>(null)
  const [editValue,  setEditValue]  = useState('')
  const [savingId,   setSavingId]   = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Cascading resets
  useEffect(() => { setFMes('') },                             [fAno])
  useEffect(() => { setFCategoria([]); setFPais([]); setFCliente([]) }, [fEmpresa])
  useEffect(() => { setFPais([]); setFCliente([]) },           [fCategoria])
  useEffect(() => { setFCliente([]) },                         [fPais])

  const fetchData = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const p = new URLSearchParams()
      if (fAno)     p.set('ano',     fAno)
      if (fMes)     p.set('mes',     fMes)
      if (fEmpresa) p.set('empresa', fEmpresa)

      const res  = await fetch(`/api/ventas/proyeccion?${p}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      setRows(data.rows ?? [])
      setCatRows(data.catRows ?? [])
      if (data.anos?.length) setAnos(data.anos)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }, [fAno, fMes, fEmpresa])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Opciones de filtros jerárquicos ──────────────────────────────────────────
  const optCategorias = useMemo(() =>
    [...new Set(catRows.map(r => r.categoria))].sort()
  , [catRows])

  const optPaises = useMemo(() =>
    [...new Set(catRows
      .filter(r => !fCategoria.length || fCategoria.includes(r.categoria))
      .map(r => r.pais)
    )].filter(Boolean).sort()
  , [catRows, fCategoria])

  const optClientes = useMemo(() =>
    [...new Set(catRows
      .filter(r =>
        (!fCategoria.length || fCategoria.includes(r.categoria)) &&
        (!fPais.length      || fPais.includes(r.pais))
      )
      .map(r => r.cliente)
    )].filter(Boolean).sort()
  , [catRows, fCategoria, fPais])

  // ¿Hay filtro de sub-categoría activo?
  const activeSubFilter = fCategoria.length > 0 || fPais.length > 0 || fCliente.length > 0

  // Focus input when editing starts
  useEffect(() => {
    if (editingId !== null) inputRef.current?.focus()
  }, [editingId])

  const startEdit = (id: number, current: number | null) => {
    setEditingId(id)
    setEditValue(current !== null ? String(current) : '')
  }

  const saveEdit = async () => {
    if (editingId === null) return
    const id       = editingId
    const raw      = editValue.trim().replace(/,/g, '')
    const real_usd = raw === '' ? null : Number(raw)

    setEditingId(null)

    // Optimistic update
    setCatRows(prev => prev.map(r => r.id === id ? { ...r, real_usd } : r))

    setSavingId(id)
    try {
      const res = await fetch('/api/ventas/proyeccion/real', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, real_usd }),
      })
      if (!res.ok) throw new Error('Error al guardar')
    } catch {
      // Revert on error
      fetchData()
    } finally {
      setSavingId(null)
    }
  }

  const mesesDisponibles = useMemo(() => {
    const s = new Set(rows.map(r => r.mes))
    return Array.from(s).sort((a, b) => a - b)
  }, [rows])

  const kpis = useMemo(() => {
    const proy = rows.reduce((s, r) => s + r.valor_proyectado, 0)
    const real = rows.reduce((s, r) => s + r.valor_real,       0)
    const dif  = real - proy
    const pct  = proy > 0 ? Math.round(real / proy * 1000) / 10 : null
    return { proy, real, dif, pct }
  }, [rows])

  const chartData = useMemo(() => {
    const map: Record<number, { mes_label: string; proyectado: number; real: number }> = {}
    for (const r of rows) {
      if (!map[r.mes]) map[r.mes] = { mes_label: r.mes_label, proyectado: 0, real: 0 }
      map[r.mes].proyectado += r.valor_proyectado
      map[r.mes].real       += r.valor_real
    }
    return Object.entries(map)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, v]) => v)
  }, [rows])

  const titulo =
    !fAno        ? 'Toda la historia' :
    !fMes        ? `Año ${fAno} completo` :
    `${MES_LABELS[Number(fMes)]} ${fAno}`

  return (
    <div className="p-6 space-y-6">
      {/* Encabezado */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Proyección</h1>
        <p className="text-sm text-gray-500 mt-0.5">{titulo}</p>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">Año</label>
          <select
            value={fAno}
            onChange={e => setFAno(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm min-w-[90px] focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            <option value="">Todos</option>
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">Mes</label>
          <select
            value={fMes}
            onChange={e => setFMes(e.target.value)}
            disabled={!fAno}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm min-w-[110px] disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            <option value="">Todos</option>
            {mesesDisponibles.map(m => (
              <option key={m} value={m}>{MES_LABELS[m]}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">Empresa</label>
          <select
            value={fEmpresa}
            onChange={e => setFEmpresa(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm min-w-[160px] focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            <option value="">Todas</option>
            <option value="LICENCIAMIENTO">LICENCIAMIENTO</option>
            <option value="BL FOODS">BL FOODS</option>
          </select>
        </div>

        {/* Separador */}
        <div className="h-8 w-px bg-gray-200 self-end mb-1 hidden sm:block" />

        {/* Categoría */}
        <div className="min-w-[130px]">
          <MultiSelect
            label="Categoría"
            options={optCategorias.map(c => ({ value: c, label: c }))}
            value={fCategoria}
            onChange={setFCategoria}
            placeholder="Todas"
            selectAllLabel="Todas"
          />
        </div>

        {/* País */}
        <div className="min-w-[120px]">
          <MultiSelect
            label="País"
            options={optPaises.map(p => ({ value: p, label: p }))}
            value={fPais}
            onChange={setFPais}
            placeholder="Todos"
            selectAllLabel="Todos"
          />
        </div>

        {/* Cliente */}
        <div className="min-w-[160px]">
          <MultiSelect
            label="Cliente"
            options={optClientes.map(c => ({ value: c, label: c }))}
            value={fCliente}
            onChange={setFCliente}
            placeholder="Todos"
            selectAllLabel="Todos"
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs text-gray-500 font-medium mb-1">Total Proyectado</p>
          <p className="text-xl font-bold text-gray-900">{fmt(kpis.proy)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs text-gray-500 font-medium mb-1">Total Real</p>
          <p className="text-xl font-bold text-gray-900">{fmt(kpis.real)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs text-gray-500 font-medium mb-1">Diferencia USD</p>
          <p className={`text-xl font-bold ${kpis.dif >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {fmtDiff(kpis.dif)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs text-gray-500 font-medium mb-2">% Cumplimiento</p>
          <div className="text-2xl font-bold"><PctBadge v={kpis.pct} /></div>
        </div>
      </div>

      {/* Gráfico */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Proyectado vs Real por Mes</h2>
          <ResponsiveContainer width="100%" height={320}>
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
      )}

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Detalle</h2>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-gray-400">Cargando…</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">Sin datos para el período seleccionado</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  {['Mes', 'Empresa / Categoría', 'Proyectado USD', 'Real USD', 'Diferencia', '% Cumpl.'].map(h => (
                    <th key={h} className={`px-4 py-3 text-xs font-semibold text-gray-500 ${
                      ['Proyectado USD','Real USD','Diferencia'].includes(h) ? 'text-right' :
                      h === '% Cumpl.' ? 'text-center' : ''
                    }`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r, i) => {
                  const expandKey = `${r.ano}-${r.mes}-${r.empresa}`
                  const hasCats   = r.empresa === 'LICENCIAMIENTO' || r.empresa === 'BL FOODS'

                  // Sub-rows filtrados por los filtros jerárquicos
                  const subRows = catRows.filter(c =>
                    c.ano === r.ano && c.mes === r.mes && c.empresa === r.empresa &&
                    (!fCategoria.length || fCategoria.includes(c.categoria)) &&
                    (!fPais.length      || fPais.includes(c.pais))           &&
                    (!fCliente.length   || fCliente.includes(c.cliente))
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
                              {r.empresa}
                            </span>
                          </div>
                        </td>
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
                        const isEditingThis = editingId === c.id
                        const isSaving      = savingId === c.id

                        return (
                          <tr key={`cat-${i}-${ci}`} className={subBg}>
                            <td className="px-4 py-2 pl-10 text-gray-500 text-xs whitespace-nowrap">
                              {c.categoria}
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[11px] font-semibold text-gray-600">{c.pais}</span>
                                <span className="text-[10px] text-gray-400">{c.cliente}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2 text-right text-xs text-gray-500">
                              {c.valor_proyectado > 0 ? fmt(c.valor_proyectado) : <span className="text-gray-300">—</span>}
                            </td>
                            {/* Real USD — editable inline */}
                            <td className="px-4 py-2 text-right text-xs">
                              {isEditingThis ? (
                                <input
                                  ref={inputRef}
                                  type="text"
                                  value={editValue}
                                  onChange={e => setEditValue(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') saveEdit()
                                    if (e.key === 'Escape') setEditingId(null)
                                  }}
                                  onBlur={saveEdit}
                                  className="w-28 text-right border border-blue-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                                  placeholder="0.00"
                                />
                              ) : (
                                <button
                                  onClick={e => { e.stopPropagation(); startEdit(c.id, c.real_usd) }}
                                  className={`group flex items-center justify-end gap-1 w-full text-right ${
                                    isSaving ? 'opacity-50' : 'hover:text-blue-600'
                                  }`}
                                  title="Editar real USD"
                                >
                                  <span className={c.real_usd !== null ? 'text-gray-700' : 'text-gray-300'}>
                                    {c.real_usd !== null ? fmt(c.real_usd) : '—'}
                                  </span>
                                  <Pencil size={10} className="text-gray-300 group-hover:text-blue-400 flex-shrink-0" />
                                </button>
                              )}
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
