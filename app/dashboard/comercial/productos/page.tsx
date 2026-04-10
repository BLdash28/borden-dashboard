'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { Search, RefreshCw, Package } from 'lucide-react'

interface Producto {
  id: number
  sku: string
  descripcion: string
  categoria: string | null
  subcategoria: string | null
  codigo_barras: string | null
  is_active: boolean
}

interface CatRow { categoria: string; subcategoria: string | null }

const BADGE: Record<string, string> = {
  Quesos:  'bg-amber-50 text-amber-700 border-amber-200',
  Leches:  'bg-blue-50 text-blue-700 border-blue-200',
  Helados: 'bg-purple-50 text-purple-700 border-purple-200',
}

export default function ProductosPage() {
  const [productos,   setProductos]   = useState<Producto[]>([])
  const [categorias,  setCategorias]  = useState<CatRow[]>([])
  const [loading,     setLoading]     = useState(true)

  const [fCat,    setFCat]    = useState('')
  const [fSub,    setFSub]    = useState('')
  const [fBuscar, setFBuscar] = useState('')

  const debounceT = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initDone  = useRef(false)

  const cargar = useCallback((cat: string, sub: string, buscar: string) => {
    setLoading(true)
    const p = new URLSearchParams()
    if (cat)          p.set('categoria',    cat)
    if (sub)          p.set('subcategoria', sub)
    if (buscar.trim()) p.set('buscar',      buscar.trim())

    fetch('/api/productos?' + p.toString())
      .then(r => r.json())
      .then(j => {
        setProductos(j.productos || [])
        if (!initDone.current) {
          setCategorias(j.categorias || [])
          initDone.current = true
        }
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { cargar('', '', '') }, [cargar])

  const trigger = (cat: string, sub: string, buscar: string) => {
    if (debounceT.current) clearTimeout(debounceT.current)
    debounceT.current = setTimeout(() => cargar(cat, sub, buscar), 250)
  }

  const onCat = (v: string) => {
    setFCat(v)
    setFSub('')
    trigger(v, '', fBuscar)
  }
  const onSub    = (v: string) => { setFSub(v);    trigger(fCat, v,   fBuscar) }
  const onBuscar = (v: string) => { setFBuscar(v); trigger(fCat, fSub, v)      }

  const limpiar = () => {
    setFCat(''); setFSub(''); setFBuscar('')
    cargar('', '', '')
  }

  // Categorías únicas para el selector
  const catsUnicas = [...new Set(categorias.map(c => c.categoria))].filter(Boolean)

  // Subcategorías filtradas al cat seleccionado
  const subsUnicas = fCat
    ? [...new Set(categorias.filter(c => c.categoria === fCat).map(c => c.subcategoria))].filter(Boolean) as string[]
    : []

  // Agrupación por categoría para mostrar el conteo
  const porcategoria = productos.reduce<Record<string, number>>((acc, p) => {
    const k = p.categoria || 'Sin categoría'
    acc[k] = (acc[k] || 0) + 1
    return acc
  }, {})

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Dimensiones</p>
          <h1 className="text-2xl font-bold text-gray-800">Productos</h1>
          <p className="text-sm text-gray-400 mt-1">Base maestra de productos activos</p>
        </div>
        <button onClick={limpiar}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Total Productos</p>
          <p className="text-2xl font-bold text-gray-800">{loading ? '…' : productos.length}</p>
        </div>
        {Object.entries(porcategoria).map(([cat, count]) => (
          <div key={cat} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">{cat}</p>
            <p className="text-2xl font-bold text-gray-800">{loading ? '…' : count}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Filtros</p>
          <button onClick={limpiar} className="text-xs text-gray-400 hover:text-gray-600 underline">
            Limpiar todo
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

          {/* Búsqueda */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={fBuscar}
              onChange={e => onBuscar(e.target.value)}
              placeholder="Buscar por nombre, SKU o código de barras…"
              className="w-full text-sm border border-gray-200 rounded-lg pl-9 pr-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {/* Categoría */}
          <div>
            <select value={fCat} onChange={e => onCat(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
              <option value="">Todas las categorías</option>
              {catsUnicas.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Subcategoría */}
          <div>
            <select value={fSub} onChange={e => onSub(e.target.value)}
              disabled={!fCat || subsUnicas.length === 0}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-40">
              <option value="">Todas las subcategorías</option>
              {subsUnicas.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-700">
            Catálogo de Productos
            {!loading && (
              <span className="ml-2 text-sm font-normal text-gray-400">
                {productos.length} producto{productos.length !== 1 ? 's' : ''}
              </span>
            )}
          </h3>
        </div>

        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="flex items-center gap-2 text-gray-300 text-sm">
              <RefreshCw size={16} className="animate-spin" /> Cargando…
            </div>
          </div>
        ) : productos.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center gap-3 text-gray-400">
            <Package size={32} className="text-gray-200" />
            <p className="text-sm">Sin productos con los filtros seleccionados</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase tracking-widest border-b border-gray-100">
                  <th className="text-left py-2 pr-4 w-8">#</th>
                  <th className="text-left py-2 pr-4">SKU</th>
                  <th className="text-left py-2 pr-4">Descripción</th>
                  <th className="text-left py-2 pr-4">Categoría</th>
                  <th className="text-left py-2 pr-4">Subcategoría</th>
                  <th className="text-left py-2">Cód. Barras</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((p, i) => (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="py-2.5 pr-4 text-gray-400 text-xs">{i + 1}</td>
                    <td className="py-2.5 pr-4">
                      <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                        {p.sku || '—'}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 font-medium text-gray-800 max-w-xs">{p.descripcion}</td>
                    <td className="py-2.5 pr-4">
                      {p.categoria ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${BADGE[p.categoria] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                          {p.categoria}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-2.5 pr-4 text-gray-500 text-xs">{p.subcategoria || '—'}</td>
                    <td className="py-2.5 font-mono text-xs text-gray-500">{p.codigo_barras || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
