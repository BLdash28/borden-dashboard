'use client'
import { useEffect, useState, useCallback } from 'react'
import { Download, RefreshCw, X, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react'
import FiltroMulti from '@/components/ui/FiltroMulti'

const PAISES   = ['CR','GT','SV','NI','HN','CO']
const CATS     = ['Quesos','Leches','Helados']
const PAISES_OPT = PAISES.map(p => ({ value: p }))
const CATS_OPT   = CATS.map(c => ({ value: c }))

const fmtN = (v: number) => v.toLocaleString('en-US')

const SEMAFORO_LABEL: Record<string, string> = {
  rojo: '≤7d', amarillo: '8–21d', verde: '22–60d', azul: '+60d', sin_datos: '—'
}
const SEMAFORO_DOT: Record<string, string> = {
  rojo: 'bg-red-500', amarillo: 'bg-amber-400', verde: 'bg-green-500',
  azul: 'bg-blue-400', sin_datos: 'bg-gray-300'
}
const SEMAFORO_CHIP: Record<string, string> = {
  rojo: 'bg-red-50 text-red-600', amarillo: 'bg-amber-50 text-amber-600',
  verde: 'bg-green-50 text-green-600', azul: 'bg-blue-50 text-blue-600',
  sin_datos: 'bg-gray-50 text-gray-400'
}
const SEMAFORO_ORD: Record<string, number> = {
  rojo: 1, amarillo: 2, verde: 3, azul: 4, sin_datos: 5
}

interface Row {
  upc: string; codigo_barras: string | null; sku: string | null; descripcion: string | null
  categoria: string | null; subcategoria: string | null
  inv_mano: number; tiendas: number; venta_dia: number
  fecha: string; doh: number | null; semaforo: string
}
interface TiendaRow {
  tienda_nbr: number; tienda_nombre: string; pais: string
  inv_mano: number; venta_dia: number; doh: number | null; semaforo: string
}
interface Detalle {
  upc: string; codigo_barras: string | null; sku: string | null; descripcion: string | null
  categoria: string | null; subcategoria: string | null
  tiendas: TiendaRow[]
}

type MainSortKey   = 'inv_mano' | 'tiendas' | 'venta_dia' | 'doh' | 'semaforo'
type PanelSortKey  = 'inv_mano' | 'venta_dia' | 'doh' | 'semaforo'
type SortDir       = 'asc' | 'desc'

const DEFAULT_SORT: { key: MainSortKey; dir: SortDir } = { key: 'inv_mano', dir: 'desc' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sortRows<T extends Record<string, any>>(
  arr: T[], key: string, dir: SortDir
): T[] {
  return [...arr].sort((a, b) => {
    let va: number, vb: number
    if (key === 'semaforo') {
      va = SEMAFORO_ORD[a.semaforo as string] ?? 5
      vb = SEMAFORO_ORD[b.semaforo as string] ?? 5
    } else {
      va = (a[key] as number | null) ?? (dir === 'asc' ? Infinity : -Infinity)
      vb = (b[key] as number | null) ?? (dir === 'asc' ? Infinity : -Infinity)
    }
    return dir === 'desc' ? vb - va : va - vb
  })
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronUp size={11} className="text-gray-300 ml-0.5" />
  return dir === 'desc'
    ? <ChevronDown size={11} className="text-gray-600 ml-0.5" />
    : <ChevronUp   size={11} className="text-gray-600 ml-0.5" />
}

function SortTh({
  label, colKey, sort, onSort, className = ''
}: {
  label: string
  colKey: string
  sort: { key: string; dir: SortDir }
  onSort: (k: string) => void
  className?: string
}) {
  const active = sort.key === colKey
  return (
    <th
      onClick={() => onSort(colKey)}
      className={`py-3 px-3 select-none cursor-pointer hover:text-gray-600 ${className}`}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        <SortIcon active={active} dir={sort.dir} />
      </span>
    </th>
  )
}

export default function InventarioTiendas() {
  const [paises,   setPaises]   = useState<string[]>([])
  const [cats,     setCats]     = useState<string[]>([])
  const [filtro,   setFiltro]   = useState<string>('todos')
  const [rows,     setRows]     = useState<Row[]>([])
  const [loading,  setLoading]  = useState(true)
  const [detalle,  setDetalle]  = useState<Detalle | null>(null)
  const [loadDet,  setLoadDet]  = useState(false)

  // Sort estado tabla principal
  const [mainSort, setMainSort] = useState<{ key: MainSortKey; dir: SortDir }>(DEFAULT_SORT)
  // Sort estado panel lateral
  const [panSort,  setPanSort]  = useState<{ key: PanelSortKey; dir: SortDir }>({ key: 'inv_mano', dir: 'desc' })

  const toggleMainSort = (key: string) => {
    setMainSort(prev => {
      if (prev.key !== key) return { key: key as MainSortKey, dir: 'desc' }
      if (prev.dir === 'desc') return { key: key as MainSortKey, dir: 'asc' }
      return DEFAULT_SORT
    })
  }
  const togglePanSort = (key: string) => {
    setPanSort(prev => {
      if (prev.key !== key) return { key: key as PanelSortKey, dir: 'desc' }
      if (prev.dir === 'desc') return { key: key as PanelSortKey, dir: 'asc' }
      return { key: 'inv_mano', dir: 'desc' }
    })
  }

  const cargar = useCallback(async (ps: string[], cs: string[]) => {
    setLoading(true)
    setMainSort(DEFAULT_SORT) // reset sort on filter change
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

  const abrirDetalle = async (row: Row) => {
    const { upc, codigo_barras } = row
    setPanSort({ key: 'inv_mano', dir: 'desc' })
    setLoadDet(true)
    setDetalle({ upc, codigo_barras: codigo_barras ?? null, sku: null, descripcion: null, categoria: null, subcategoria: null, tiendas: [] })
    try {
      const qs = new URLSearchParams()
      if (paises.length) qs.set('pais', paises.join(','))
      const res = await fetch(`/api/comercial/ejecucion/inventario/${encodeURIComponent(upc)}?${qs}`)
      if (!res.ok) throw new Error()
      setDetalle(await res.json())
    } catch { } finally { setLoadDet(false) }
  }

  // Filtrar por semáforo, luego ordenar
  const filtered  = filtro === 'todos' ? rows : rows.filter(r => r.semaforo === filtro)
  const display   = sortRows(filtered, mainSort.key, mainSort.dir)
  const panTiendas = detalle ? sortRows(detalle.tiendas, panSort.key, panSort.dir) : []

  const counts = rows.reduce((acc, r) => {
    acc[r.semaforo] = (acc[r.semaforo] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const descargarCSV = () => {
    const csv = [
      'Código Barras,SKU,Descripción,Categoría,Subcategoría,Inv Mano,Tiendas,Venta/Día,DOH,Semáforo',
      ...display.map(r =>
        `"${r.codigo_barras??r.upc}","${r.sku??''}","${r.descripcion??''}","${r.categoria??''}","${r.subcategoria??''}",` +
        `${r.inv_mano},${r.tiendas},${r.venta_dia.toFixed(2)},${r.doh?.toFixed(1)??'—'},${r.semaforo}`
      )
    ].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['\ufeff'+csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = `inventario_tiendas_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  const thBase = 'text-gray-400 uppercase tracking-widest text-[10px]'

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Ejecución</p>
          <h1 className="text-2xl font-bold text-gray-800">Inventario Tiendas</h1>
          <p className="text-sm text-gray-400 mt-0.5">Días de cobertura (DOH) por producto en tiendas Walmart</p>
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

      {/* Tabla principal */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        {loading
          ? <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
          : display.length === 0
            ? <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Sin datos disponibles.</div>
            : (
              <table className="w-full text-xs min-w-[800px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className={thBase}>
                    <th className="text-left py-3 px-4">UPC / Descripción</th>
                    <th className="text-left py-3 px-3">Categoría</th>
                    <th className="text-left py-3 px-3">Subcategoría</th>
                    <SortTh label="Inv. Mano"  colKey="inv_mano"  sort={mainSort} onSort={toggleMainSort} className="text-right" />
                    <SortTh label="Tiendas"    colKey="tiendas"   sort={mainSort} onSort={toggleMainSort} className="text-right" />
                    <SortTh label="Venta/Día"  colKey="venta_dia" sort={mainSort} onSort={toggleMainSort} className="text-right" />
                    <SortTh label="DOH"        colKey="doh"       sort={mainSort} onSort={toggleMainSort} className="text-right" />
                    <SortTh label="Estado"     colKey="semaforo"  sort={mainSort} onSort={toggleMainSort} className="text-center" />
                    <th className="py-3 px-3 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {display.map((r, i) => (
                    <tr
                      key={r.upc}
                      onClick={() => abrirDetalle(r)}
                      className={`border-b border-gray-50 cursor-pointer hover:bg-amber-50/40 transition-colors ${i%2===0?'':'bg-gray-50/30'}`}
                    >
                      <td className="py-2 px-4">
                        <p className="font-medium text-gray-700 truncate max-w-[220px]">{r.descripcion || r.codigo_barras || r.upc}</p>
                        <p className="text-gray-400 font-mono">{r.codigo_barras ?? r.upc}</p>
                      </td>
                      <td className="py-2 px-3 text-gray-500">{r.categoria ?? <span className="text-gray-300">—</span>}</td>
                      <td className="py-2 px-3 text-gray-400 text-[11px]">{r.subcategoria ?? <span className="text-gray-300">—</span>}</td>
                      <td className="py-2 px-3 text-right font-bold text-gray-800">{fmtN(r.inv_mano)}</td>
                      <td className="py-2 px-3 text-right text-gray-600">{r.tiendas}</td>
                      <td className="py-2 px-3 text-right text-gray-500">{r.venta_dia > 0 ? r.venta_dia.toFixed(1) : '—'}</td>
                      <td className="py-2 px-3 text-right font-bold text-gray-800">
                        {r.doh !== null ? r.doh.toFixed(1)+'d' : '—'}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${SEMAFORO_CHIP[r.semaforo]}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${SEMAFORO_DOT[r.semaforo]}`} />
                          {SEMAFORO_LABEL[r.semaforo]}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-gray-300"><ChevronRight size={14} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
        }
      </div>

      {/* Panel lateral — position:fixed relativo al viewport */}
      {detalle && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-black/20 z-40"
            onClick={() => setDetalle(null)}
          />

          {/* Panel */}
          <div
            className="fixed top-0 right-0 h-screen w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col"
            style={{ isolation: 'isolate' }}
          >
            {/* Header fijo del panel */}
            <div className="shrink-0 flex items-start justify-between p-5 border-b border-gray-100">
              <div className="flex-1 min-w-0 pr-3">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-0.5">Detalle por tienda</p>
                <p className="font-bold text-gray-800 text-sm leading-tight truncate">
                  {detalle.descripcion ?? detalle.upc}
                </p>
                <p className="font-mono text-xs text-gray-400 mt-0.5">{detalle.codigo_barras ?? detalle.upc}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {detalle.categoria && (
                    <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] font-medium">
                      {detalle.categoria}
                    </span>
                  )}
                  {detalle.subcategoria && (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px]">
                      {detalle.subcategoria}
                    </span>
                  )}
                  {detalle.sku && (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px] font-mono">
                      SKU {detalle.sku}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setDetalle(null)}
                className="shrink-0 text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"
              >
                <X size={16} />
              </button>
            </div>

            {/* Contenido scrolleable del panel */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {loadDet
                ? <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
                : detalle.tiendas.length === 0
                  ? <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Sin datos.</div>
                  : (
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                        <tr className={thBase}>
                          <th className="text-left py-2.5 px-4">Tienda</th>
                          <SortTh label="Inv."     colKey="inv_mano"  sort={panSort} onSort={togglePanSort} className="text-right" />
                          <SortTh label="Vta/Día"  colKey="venta_dia" sort={panSort} onSort={togglePanSort} className="text-right" />
                          <SortTh label="DOH"      colKey="doh"       sort={panSort} onSort={togglePanSort} className="text-right" />
                          <SortTh label="Estado"   colKey="semaforo"  sort={panSort} onSort={togglePanSort} className="text-center" />
                        </tr>
                      </thead>
                      <tbody>
                        {panTiendas.map((t, i) => (
                          <tr key={t.tienda_nbr} className={`border-b border-gray-50 ${i%2===0?'':'bg-gray-50/40'}`}>
                            <td className="py-2 px-4">
                              <p className="font-medium text-gray-700 truncate max-w-[180px]">{t.tienda_nombre}</p>
                              <p className="text-gray-400 font-mono">{t.pais} · #{t.tienda_nbr}</p>
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-gray-800">{fmtN(t.inv_mano)}</td>
                            <td className="py-2 px-3 text-right text-gray-500">
                              {t.venta_dia > 0 ? t.venta_dia.toFixed(1) : '—'}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-gray-800">
                              {t.doh !== null ? t.doh.toFixed(1)+'d' : '—'}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${SEMAFORO_CHIP[t.semaforo]}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${SEMAFORO_DOT[t.semaforo]}`} />
                                {SEMAFORO_LABEL[t.semaforo]}
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
        </>
      )}
    </div>
  )
}
