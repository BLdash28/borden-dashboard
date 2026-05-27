'use client'
import { useEffect, useState, useCallback } from 'react'
import { Download, RefreshCw, ChevronUp, ChevronDown } from 'lucide-react'
import FiltroMulti from '@/components/ui/FiltroMulti'

const CATS_OPT = [
  { value: 'Quesos' }, { value: 'Leches' }, { value: 'Helados' },
]

const fmtQ = (v: number) =>
  'Q' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtN = (v: number) => v.toLocaleString('en-US')

type SortDir = 'asc' | 'desc'
type SortKey = 'valor_gtq' | 'cantidad' | 'nombre_sucursal' | 'descripcion_sku' | 'categoria' | 'region'

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronUp size={11} className="text-gray-300 ml-0.5" />
  return dir === 'desc'
    ? <ChevronDown size={11} className="text-gray-600 ml-0.5" />
    : <ChevronUp   size={11} className="text-gray-600 ml-0.5" />
}

function SortTh({ label, colKey, sort, onSort, className = '' }: {
  label: string; colKey: string
  sort: { key: string; dir: SortDir }
  onSort: (k: string) => void
  className?: string
}) {
  return (
    <th onClick={() => onSort(colKey)}
      className={`py-3 px-3 select-none cursor-pointer hover:text-gray-600 ${className}`}>
      <span className="inline-flex items-center gap-0.5">
        {label}
        <SortIcon active={sort.key === colKey} dir={sort.dir} />
      </span>
    </th>
  )
}

interface Row {
  fecha: string; codigo_sucursal: number; nombre_sucursal: string
  region: string; categoria: string; subcategoria: string
  codigo_sku: string; descripcion_sku: string; cantidad: number; valor_gtq: number
}
interface Kpis {
  total_valor: number; total_cantidad: number; sucursales: number; skus: number; fecha: string
}

function sortRows(arr: Row[], key: SortKey, dir: SortDir): Row[] {
  return [...arr].sort((a, b) => {
    if (key === 'nombre_sucursal' || key === 'descripcion_sku' || key === 'categoria' || key === 'region') {
      const cmp = String(a[key] ?? '').localeCompare(String(b[key] ?? ''))
      return dir === 'asc' ? cmp : -cmp
    }
    const va = (a[key] as number) ?? 0
    const vb = (b[key] as number) ?? 0
    return dir === 'desc' ? vb - va : va - vb
  })
}

export default function UnisuporInventario() {
  const [cats,      setCats]      = useState<string[]>([])
  const [sucs,      setSucs]      = useState<string[]>([])
  const [fechas,    setFechas]    = useState<string[]>([])
  const [fecha,     setFecha]     = useState<string>('')
  const [rows,      setRows]      = useState<Row[]>([])
  const [kpis,      setKpis]      = useState<Kpis | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [sort,      setSort]      = useState<{ key: SortKey; dir: SortDir }>({ key: 'valor_gtq', dir: 'desc' })
  const [exporting, setExporting] = useState(false)

  const sucOptions = [...new Set(rows.map(r => r.nombre_sucursal))].sort().map(v => ({ value: v }))

  const toggleSort = (k: string) => {
    setSort(prev => {
      if (prev.key !== k) return { key: k as SortKey, dir: 'desc' }
      if (prev.dir === 'desc') return { key: k as SortKey, dir: 'asc' }
      return { key: 'valor_gtq', dir: 'desc' }
    })
  }

  const cargar = useCallback(async (cs: string[], ss: string[], f: string) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (cs.length) qs.set('categoria', cs.join(','))
      if (ss.length) qs.set('sucursal',  ss.join(','))
      if (f)         qs.set('fecha',     f)
      const res = await fetch('/api/comercial/unisuper-gt/inventario?' + qs)
      if (!res.ok) throw new Error()
      const j = await res.json()
      setRows(j.rows ?? [])
      setKpis(j.kpis ?? null)
      if (!fechas.length && j.fechas?.length) {
        setFechas(j.fechas)
        if (!f && j.kpis?.fecha) setFecha(j.kpis.fecha)
      }
    } catch { setRows([]) } finally { setLoading(false) }
  }, [fechas.length])

  useEffect(() => { cargar(cats, sucs, fecha) }, [cats, sucs, fecha]) // eslint-disable-line

  const display = sortRows(rows, sort.key, sort.dir)

  const exportCSV = () => {
    setExporting(true)
    try {
      const csv = [
        'Fecha\tSucursal\tRegión\tCategoría\tSubcategoría\tCódigo SKU\tDescripción\tCantidad\tValor (GTQ)',
        ...display.map(r =>
          `${r.fecha}\t${r.nombre_sucursal}\t${r.region ?? ''}\t${r.categoria}\t${r.subcategoria}\t` +
          `${r.codigo_sku}\t${r.descripcion_sku}\t${r.cantidad}\t${r.valor_gtq}`
        ),
      ].join('\n')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
      a.download = `unisuper_inventario_${fecha || 'latest'}.csv`
      a.click()
    } finally { setExporting(false) }
  }

  const thBase = 'text-gray-400 uppercase tracking-widest text-[10px] font-semibold text-left'

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Unisuper GT</p>
          <h1 className="text-2xl font-bold text-gray-800">Inventario</h1>
          {kpis?.fecha && (
            <p className="text-sm text-gray-400 mt-0.5">Datos al {kpis.fecha}</p>
          )}
        </div>
        <button onClick={exportCSV} disabled={display.length === 0 || exporting}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm disabled:opacity-40">
          <Download size={14} className={exporting ? 'animate-pulse' : ''} />
          {exporting ? 'Generando...' : 'Exportar CSV'}
        </button>
      </div>

      {/* KPI cards */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Valor Inventario', value: fmtQ(kpis.total_valor),    sub: 'GTQ' },
            { label: 'Unidades',         value: fmtN(kpis.total_cantidad),  sub: 'unidades' },
            { label: 'Sucursales',       value: fmtN(kpis.sucursales),      sub: 'activas' },
            { label: 'SKUs',             value: fmtN(kpis.skus),            sub: 'productos' },
          ].map(kpi => (
            <div key={kpi.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wider">{kpi.label}</p>
              <p className="text-xl font-bold text-gray-800 mt-1">{kpi.value}</p>
              <p className="text-xs text-gray-400">{kpi.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">Fecha</span>
            <select
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
            >
              {fechas.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <FiltroMulti label="Categoría" options={CATS_OPT} value={cats} onChange={setCats} placeholder="Todas" />
          <FiltroMulti label="Sucursal"  options={sucOptions} value={sucs} onChange={setSucs} placeholder="Todas" />
          <button onClick={() => cargar(cats, sucs, fecha)}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-600 hover:bg-gray-200">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        {loading
          ? <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
          : display.length === 0
            ? <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Sin datos disponibles.</div>
            : (
              <table className="w-full text-xs min-w-[750px]">
                <thead>
                  <tr className={`${thBase} border-b border-gray-100`}>
                    <SortTh label="Sucursal"    colKey="nombre_sucursal" sort={sort} onSort={toggleSort} className={thBase + ' pl-4'} />
                    <SortTh label="Región"      colKey="region"          sort={sort} onSort={toggleSort} className={thBase} />
                    <SortTh label="Categoría"   colKey="categoria"       sort={sort} onSort={toggleSort} className={thBase} />
                    <th className={thBase + ' py-3 px-3'}>SKU</th>
                    <SortTh label="Descripción" colKey="descripcion_sku" sort={sort} onSort={toggleSort} className={thBase} />
                    <SortTh label="Cantidad"    colKey="cantidad"        sort={sort} onSort={toggleSort} className={thBase + ' text-right'} />
                    <SortTh label="Valor (GTQ)" colKey="valor_gtq"       sort={sort} onSort={toggleSort} className={thBase + ' text-right pr-4'} />
                  </tr>
                </thead>
                <tbody>
                  {display.map((r, i) => (
                    <tr key={`${r.codigo_sucursal}-${r.codigo_sku}`}
                      className={`border-b border-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                      <td className="py-2.5 px-3 pl-4 text-gray-700 font-medium truncate max-w-[160px]">{r.nombre_sucursal}</td>
                      <td className="py-2.5 px-3 text-gray-500">{r.region ?? '—'}</td>
                      <td className="py-2.5 px-3 text-gray-500">{r.categoria}</td>
                      <td className="py-2.5 px-3 text-gray-400 font-mono">{r.codigo_sku}</td>
                      <td className="py-2.5 px-3 text-gray-700 max-w-[200px] truncate">{r.descripcion_sku}</td>
                      <td className="py-2.5 px-3 text-right text-gray-700">{fmtN(r.cantidad)}</td>
                      <td className="py-2.5 px-3 pr-4 text-right font-semibold text-gray-800">{fmtQ(r.valor_gtq)}</td>
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
