'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { Search, RefreshCw, Package, Plus, Pencil, X } from 'lucide-react'

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

const CATS = ['Quesos', 'Leches', 'Helados']

// ── Modal de crear / editar ───────────────────────────────────────────────────
function ProductoModal({
  producto, onClose, onSaved,
}: {
  producto: Producto | null   // null = nuevo
  onClose: () => void
  onSaved: (p: Producto) => void
}) {
  const esNuevo = producto === null
  const [sku,          setSku]          = useState(producto?.sku          ?? '')
  const [descripcion,  setDescripcion]  = useState(producto?.descripcion  ?? '')
  const [categoria,    setCategoria]    = useState(producto?.categoria    ?? '')
  const [subcategoria, setSubcategoria] = useState(producto?.subcategoria ?? '')
  const [codBarras,    setCodBarras]    = useState(producto?.codigo_barras ?? '')
  const [activo,       setActivo]       = useState(producto?.is_active    ?? true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const guardar = async () => {
    if (!sku.trim() || !descripcion.trim()) {
      setError('SKU y descripción son obligatorios')
      return
    }
    setSaving(true); setError('')
    try {
      const body = {
        sku, descripcion, categoria: categoria || null,
        subcategoria: subcategoria || null,
        codigo_barras: codBarras || null,
        is_active: activo,
        ...(esNuevo ? {} : { id: producto!.id }),
      }
      const res  = await fetch('/api/productos', {
        method: esNuevo ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error || 'Error guardando')
      onSaved(json.producto)
      onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const field = (label: string, value: string, set: (v: string) => void, opts?: { placeholder?: string; mono?: boolean }) => (
    <div>
      <label className="text-xs font-semibold text-gray-500 mb-1 block">{label}</label>
      <input
        value={value} onChange={e => set(e.target.value)}
        placeholder={opts?.placeholder}
        className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-400 ${opts?.mono ? 'font-mono' : ''}`}
      />
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="font-bold text-gray-800 text-base">{esNuevo ? 'Nuevo Producto' : 'Editar Producto'}</h3>
            {!esNuevo && <p className="text-xs text-gray-400 mt-0.5">{producto!.descripcion}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Campos */}
        <div className="space-y-3">
          {field('SKU / Código Interno', sku, setSku, { placeholder: 'Ej: 53000016052', mono: true })}
          {field('Descripción', descripcion, setDescripcion, { placeholder: 'Ej: QUESO IWS 500G' })}

          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Categoría</label>
            <select value={categoria} onChange={e => setCategoria(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-400">
              <option value="">Sin categoría</option>
              {CATS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {field('Subcategoría', subcategoria, setSubcategoria, { placeholder: 'Ej: IWS, Natural Slices…' })}
          {field('Código de Barras (EAN)', codBarras, setCodBarras, { placeholder: '7452105970291', mono: true })}

          {/* Activo / Descontinuado */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-semibold text-gray-500">Estado</span>
            <button
              type="button"
              onClick={() => setActivo(v => !v)}
              className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                activo
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-gray-100 text-gray-500 border-gray-200'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${activo ? 'bg-emerald-500' : 'bg-gray-400'}`} />
              {activo ? 'Activo' : 'Descontinuado'}
            </button>
          </div>
        </div>

        {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

        {/* Acciones */}
        <div className="flex gap-3 mt-5">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 font-semibold transition-colors">
            Cancelar
          </button>
          <button onClick={guardar} disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 disabled:opacity-50 transition-colors">
            {saving ? 'Guardando…' : esNuevo ? 'Crear Producto' : 'Guardar Cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function ProductosPage() {
  const [productos,  setProductos]  = useState<Producto[]>([])
  const [categorias, setCategorias] = useState<CatRow[]>([])
  const [loading,    setLoading]    = useState(true)
  const [modal,      setModal]      = useState<Producto | null | 'nuevo'>('cerrado' as any)

  const [fCat,    setFCat]    = useState('')
  const [fSub,    setFSub]    = useState('')
  const [fBuscar, setFBuscar] = useState('')

  const debounceT = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initDone  = useRef(false)

  const cargar = useCallback((cat: string, sub: string, buscar: string) => {
    setLoading(true)
    const p = new URLSearchParams()
    if (cat)           p.set('categoria',    cat)
    if (sub)           p.set('subcategoria', sub)
    if (buscar.trim()) p.set('buscar',       buscar.trim())

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

  const onCat    = (v: string) => { setFCat(v); setFSub(''); trigger(v, '', fBuscar) }
  const onSub    = (v: string) => { setFSub(v); trigger(fCat, v, fBuscar) }
  const onBuscar = (v: string) => { setFBuscar(v); trigger(fCat, fSub, v) }
  const limpiar  = () => { setFCat(''); setFSub(''); setFBuscar(''); cargar('', '', '') }

  const handleSaved = (p: Producto) => {
    setProductos(prev => {
      const idx = prev.findIndex(x => x.id === p.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = p; return next }
      return [p, ...prev]
    })
    // Refresh categories in case a new one was added
    initDone.current = false
    cargar(fCat, fSub, fBuscar)
  }

  const catsUnicas = [...new Set(categorias.map(c => c.categoria))].filter(Boolean)
  const subsUnicas = fCat
    ? [...new Set(categorias.filter(c => c.categoria === fCat).map(c => c.subcategoria))].filter(Boolean) as string[]
    : []

  const porcategoria = productos.reduce<Record<string, number>>((acc, p) => {
    const k = p.categoria || 'Sin categoría'
    acc[k] = (acc[k] || 0) + 1
    return acc
  }, {})

  const descontinuados = productos.filter(p => !p.is_active).length
  const modalProducto = modal === 'nuevo' ? null : (modal as Producto | null)
  const modalAbierto  = modal !== 'cerrado' as any

  return (
    <div className="p-6 space-y-6">

      {/* Modal */}
      {modalAbierto && (
        <ProductoModal
          producto={modalProducto}
          onClose={() => setModal('cerrado' as any)}
          onSaved={handleSaved}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Dimensiones</p>
          <h1 className="text-2xl font-bold text-gray-800">Productos</h1>
          <p className="text-sm text-gray-400 mt-1">Base maestra de productos</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={limpiar}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
          <button onClick={() => setModal('nuevo' as any)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:bg-amber-600 shadow-sm transition-colors">
            <Plus size={14} />
            Nuevo Producto
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Total Productos</p>
          <p className="text-2xl font-bold text-gray-800">{loading ? '…' : productos.length}</p>
          {!loading && descontinuados > 0 && (
            <p className="text-xs text-gray-400 mt-1">{descontinuados} descontinuado{descontinuados !== 1 ? 's' : ''}</p>
          )}
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
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={fBuscar} onChange={e => onBuscar(e.target.value)}
              placeholder="Buscar por nombre, SKU o código de barras…"
              className="w-full text-sm border border-gray-200 rounded-lg pl-9 pr-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>
          <select value={fCat} onChange={e => onCat(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
            <option value="">Todas las categorías</option>
            {catsUnicas.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={fSub} onChange={e => onSub(e.target.value)}
            disabled={!fCat || subsUnicas.length === 0}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-40">
            <option value="">Todas las subcategorías</option>
            {subsUnicas.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
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
                  <th className="text-left py-2 pr-4">Cód. Barras</th>
                  <th className="py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {productos.map((p, i) => (
                  <tr key={p.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors group ${!p.is_active ? 'opacity-50' : ''}`}>
                    <td className="py-2.5 pr-4 text-gray-400 text-xs">{i + 1}</td>
                    <td className="py-2.5 pr-4">
                      <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                        {p.sku || '—'}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 font-medium text-gray-800 max-w-xs">
                      <div className="flex items-center gap-2">
                        {p.descripcion}
                        {!p.is_active && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 whitespace-nowrap">
                            Descontinuado
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 pr-4">
                      {p.categoria ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${BADGE[p.categoria] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                          {p.categoria}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-2.5 pr-4 text-gray-500 text-xs">{p.subcategoria || '—'}</td>
                    <td className="py-2.5 pr-4 font-mono text-xs text-gray-500">{p.codigo_barras || '—'}</td>
                    <td className="py-2.5">
                      <button
                        onClick={() => setModal(p)}
                        className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-amber-50 text-gray-400 hover:text-amber-600 transition-all"
                        title="Editar producto">
                        <Pencil size={13} />
                      </button>
                    </td>
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
