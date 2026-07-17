'use client'

/**
 * Sección "Ofertas" reusable dentro de cada módulo de Ejecución.
 *
 * Muestra las ofertas del `pais` que incluyen la `cadena` del módulo,
 * permite crear nuevas (con país/cadena pre-poblados en el modal), ver el
 * detalle del análisis por SKU, y eliminar.
 *
 * Se apoya en:
 *   GET  /api/ofertas-impacto?pais=&cadena=
 *   POST /api/ofertas-impacto
 *   GET  /api/ofertas-impacto/[id]/analisis
 *   DELETE /api/ofertas-impacto/[id]
 *   GET  /api/ofertas-impacto/cadenas?pais=      (opciones para multi-select)
 *   GET  /api/ofertas/ean-lookup?q=              (autocomplete productos)
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Plus, RefreshCw, X, Loader2, Search, Trash2, AlertTriangle,
  TrendingUp, TrendingDown, ArrowUpRight, Pencil,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceArea, ResponsiveContainer,
} from 'recharts'
import FiltroMulti from '@/components/ui/FiltroMulti'

interface OfertaRow {
  id:               string
  nombre:           string
  mecanica:         string | null
  precio_regular:   string | number | null
  precio_oferta:    string | number | null
  pais:             string
  cadenas:          string[]
  vigencia_inicio:  string
  vigencia_fin:     string
  semanas_ventana:  number
  n_productos:      number
  created_at:       string
}

interface SeriePoint {
  semana:  string           // "YYYY-MM-DD"
  periodo: string | null    // 'antes' | 'durante' | 'despues' | null
  uds:     number | string
  val:     number | string
}

interface PorSku {
  upc:                       string
  descripcion:               string | null
  baseline_semanal:          string | null
  durante_semanal:           string | null
  despues_semanal:           string | null
  uplift_pct:                string | null
  pull_forward_flag:         boolean | null
  venta_incremental_neta:    string | null
  semanas_con_venta:         number
  semanas_baseline_totales:  number
  baseline_confiable:        boolean
  serie_semanal:             SeriePoint[]
}

const CHART_COLORS = [
  '#0071CE', '#F4821F', '#E53935', '#16a34a', '#7c3aed',
  '#0891b2', '#d97706', '#9333ea', '#059669', '#dc2626',
]

interface AnalisisTotal {
  baseline_semanal:              number | null
  durante_semanal:               number | null
  despues_semanal:               number | null
  venta_incremental_neta_total:  number | null
  pull_forward_skus:             number
  baseline_no_confiable_skus:    number
  total_skus:                    number
}

interface EanSugg {
  codigo_interno: string | null
  ean:            string | null
  descripcion:    string | null
}

interface ProductoSel {
  upc:          string
  item_nbr:     string
  descripcion:  string
}

function fmtDate(s: string | Date | null | undefined): string {
  if (!s) return '—'
  // pg devuelve DATE como Date object, la API lo serializa a ISO completo.
  // Extraemos siempre YYYY-MM-DD y anclamos a mediodía local para evitar drift de TZ.
  const str = typeof s === 'string' ? s : s instanceof Date ? s.toISOString() : String(s)
  const ymd = str.slice(0, 10)
  const d = new Date(ymd + 'T12:00:00')
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: '2-digit' })
}

/** Extrae YYYY-MM-DD para <input type="date"> (tolerante a Date/ISO/YYYY-MM-DD) */
function toYmd(s: string | Date | null | undefined): string {
  if (!s) return ''
  const str = typeof s === 'string' ? s : s instanceof Date ? s.toISOString() : String(s)
  return str.slice(0, 10)
}

function fmtNum(v: string | number | null | undefined, dec = 1): string {
  if (v === null || v === undefined || v === '') return '—'
  const n = Number(v)
  if (!isFinite(n)) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function fmtPct(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  const n = Number(v)
  if (!isFinite(n)) return '—'
  return (n > 0 ? '+' : '') + n.toFixed(1) + '%'
}

function estadoOferta(inicio: string, fin: string): { label: string; cls: string } {
  const hoy = new Date().toISOString().slice(0, 10)
  if (fin < hoy)    return { label: 'Cerrada', cls: 'bg-gray-100 text-gray-500' }
  if (inicio > hoy) return { label: 'Próxima', cls: 'bg-blue-100 text-blue-700' }
  return { label: 'En curso', cls: 'bg-amber-100 text-amber-700' }
}

// Moneda local por país — se usa en labels y placeholders del form.
const MONEDA_POR_PAIS: Record<string, { simbolo: string; ejemploDisplay: string }> = {
  CR: { simbolo: '₡',   ejemploDisplay: '"₡1,990" · "2x ₡3,500"' },
  GT: { simbolo: 'Q',   ejemploDisplay: '"Q 15.90" · "2x Q 25"'  },
  HN: { simbolo: 'L',   ejemploDisplay: '"L 45.00" · "3x L 100"' },
  NI: { simbolo: 'C$',  ejemploDisplay: '"C$ 35" · "2x C$ 60"'   },
  SV: { simbolo: '$',   ejemploDisplay: '"$1.99" · "2x $3.50"'   },
  CO: { simbolo: '$',   ejemploDisplay: '"$5,900" · "2x $10,000"' },
}

function monedaDe(pais: string): { simbolo: string; ejemploDisplay: string } {
  return MONEDA_POR_PAIS[pais] ?? { simbolo: '$', ejemploDisplay: '"$1.99" · "2x $3.50"' }
}

/** Formatea un precio con símbolo de moneda del país. Devuelve '—' si nulo. */
function fmtPrecio(v: string | number | null | undefined, pais: string): string {
  if (v === null || v === undefined || v === '') return '—'
  const n = Number(v)
  if (!isFinite(n)) return '—'
  const { simbolo } = monedaDe(pais)
  // Sin decimales para monedas "grandes" (colon, colombiano); 2 decimales para USD.
  const dec = pais === 'SV' || pais === 'HN' ? 2 : 0
  return `${simbolo}${n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`
}

function upliftColor(v: string | null): string {
  if (v === null) return 'text-gray-400'
  const n = Number(v)
  if (n >  10) return 'text-emerald-600 font-semibold'
  if (n <   0) return 'text-red-500 font-semibold'
  return 'text-amber-600'
}

export function OfertasSection({ pais, cadena }: { pais: string; cadena: string }) {
  const [ofertas, setOfertas] = useState<OfertaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [detalleId, setDetalleId] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const qs = new URLSearchParams({ pais, cadena, limit: '50' })
      const r = await fetch('/api/ofertas-impacto?' + qs)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Error')
      setOfertas(j.ofertas ?? [])
    } catch (e: any) {
      setError(e.message ?? 'Error')
      setOfertas([])
    } finally {
      setLoading(false)
    }
  }, [pais, cadena])

  useEffect(() => { cargar() }, [cargar])

  const eliminar = async (id: string, nombre: string) => {
    if (!confirm(`¿Eliminar la oferta "${nombre}"?`)) return
    const r = await fetch('/api/ofertas-impacto/' + id, { method: 'DELETE' })
    if (r.ok) { setDetalleId(null); cargar() }
    else alert('No se pudo eliminar')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-bold text-gray-800">Ofertas · Impacto</h2>
          <p className="text-xs text-gray-400">
            Promociones activas en {cadena} · {pais} y su impacto real vs baseline por SKU
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={cargar}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refrescar
          </button>
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700">
            <Plus size={12} /> Agregar oferta
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        {loading ? (
          <div className="h-32 flex items-center justify-center text-gray-300 text-sm">Cargando…</div>
        ) : error ? (
          <div className="h-32 flex items-center justify-center text-red-500 text-sm">{error}</div>
        ) : ofertas.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center text-gray-400 text-sm gap-2">
            <Plus size={22} className="text-gray-300" />
            No hay ofertas registradas para {cadena} en {pais}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-widest text-gray-400 border-b border-gray-100">
                <th className="py-2 px-3">Estado</th>
                <th className="py-2 px-3">Nombre</th>
                <th className="py-2 px-3">Mecánica</th>
                <th className="py-2 px-3">Precio Regular</th>
                <th className="py-2 px-3">Precio Oferta</th>
                <th className="py-2 px-3">Cadenas</th>
                <th className="py-2 px-3">Vigencia</th>
                <th className="py-2 px-3 text-right">SKUs</th>
                <th className="py-2 px-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {ofertas.map(o => {
                const est = estadoOferta(o.vigencia_inicio, o.vigencia_fin)
                return (
                  <tr key={o.id}
                    onClick={() => setDetalleId(o.id)}
                    className="border-b border-gray-50 hover:bg-blue-50/40 cursor-pointer">
                    <td className="py-2.5 px-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${est.cls}`}>
                        {est.label}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-medium text-gray-800">{o.nombre}</td>
                    <td className="py-2.5 px-3 text-gray-500 text-xs max-w-[220px] truncate">{o.mecanica ?? '—'}</td>
                    <td className="py-2.5 px-3 text-gray-500 tabular-nums text-xs whitespace-nowrap line-through">
                      {fmtPrecio(o.precio_regular, o.pais)}
                    </td>
                    <td className="py-2.5 px-3 text-blue-700 font-semibold tabular-nums text-xs whitespace-nowrap">
                      {fmtPrecio(o.precio_oferta, o.pais)}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-gray-600">
                      {o.cadenas.length <= 2 ? o.cadenas.join(', ') : `${o.cadenas.length} cadenas`}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-gray-500 tabular-nums">
                      {fmtDate(o.vigencia_inicio)} → {fmtDate(o.vigencia_fin)}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{o.n_productos}</td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="inline-flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setDetalleId(o.id)}
                          className="p-1.5 rounded-md hover:bg-blue-100 text-blue-700" title="Ver análisis">
                          <ArrowUpRight size={13} />
                        </button>
                        <button onClick={() => setEditingId(o.id)}
                          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600" title="Editar">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => eliminar(o.id, o.nombre)}
                          className="p-1.5 rounded-md hover:bg-red-100 text-red-600" title="Eliminar">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showNew && (
        <OfertaFormModal
          pais={pais}
          cadenaDefault={cadena}
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); cargar() }} />
      )}
      {editingId && (
        <OfertaFormModal
          pais={pais}
          cadenaDefault={cadena}
          editingId={editingId}
          onClose={() => setEditingId(null)}
          onSaved={() => { setEditingId(null); cargar() }} />
      )}
      {detalleId && (
        <DetalleOfertaModal
          id={detalleId}
          onClose={() => setDetalleId(null)}
          onEdit={id => { setDetalleId(null); setEditingId(id) }}
          onDeleted={() => { setDetalleId(null); cargar() }} />
      )}
    </div>
  )
}


// ══════════════════════════════════════════════════════════════════════════
// Modal: Formulario (Crear / Editar oferta)
// ══════════════════════════════════════════════════════════════════════════

function OfertaFormModal({
  pais, cadenaDefault, editingId, onClose, onSaved,
}: {
  pais: string
  cadenaDefault: string
  editingId?: string
  onClose: () => void
  onSaved: () => void
}) {
  const isEditing = !!editingId

  const [nombre,   setNombre]        = useState('')
  const [mecanica, setMecanica]      = useState('')
  const [precioRegular, setPrecioRegular] = useState('')
  const [precioOferta,  setPrecioOferta]  = useState('')
  const [vigInicio, setVigInicio] = useState('')
  const [vigFin,    setVigFin]    = useState('')
  const [semanas,   setSemanas]   = useState(4)

  const [cadenasOpts, setCadenasOpts] = useState<string[]>([])
  const [cadenasSel,  setCadenasSel]  = useState<string[]>([cadenaDefault])

  const [busqueda, setBusqueda] = useState('')
  const [suggs, setSuggs] = useState<EanSugg[]>([])
  const [searching, setSearching] = useState(false)
  const [showSuggs, setShowSuggs] = useState(false)
  const [productos, setProductos] = useState<ProductoSel[]>([])
  const searchTimer = useRef<NodeJS.Timeout | null>(null)

  const [saving, setSaving] = useState(false)
  const [loadingInitial, setLoadingInitial] = useState(!!editingId)
  const [error,  setError]  = useState<string | null>(null)

  const moneda = monedaDe(pais)

  // Cargar cadenas disponibles del país
  useEffect(() => {
    fetch('/api/ofertas-impacto/cadenas?pais=' + pais)
      .then(r => r.json())
      .then(j => {
        const opts = (j.cadenas ?? []) as string[]
        setCadenasOpts(opts.includes(cadenaDefault) ? opts : [cadenaDefault, ...opts])
      })
      .catch(() => setCadenasOpts([cadenaDefault]))
  }, [pais, cadenaDefault])

  // Precargar datos si estamos editando
  useEffect(() => {
    if (!editingId) return
    setLoadingInitial(true)
    fetch('/api/ofertas-impacto/' + editingId)
      .then(async r => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? 'Error cargando oferta')
        const o = j.oferta as OfertaRow
        setNombre(o.nombre ?? '')
        setMecanica(o.mecanica ?? '')
        setPrecioRegular(o.precio_regular != null ? String(o.precio_regular) : '')
        setPrecioOferta( o.precio_oferta  != null ? String(o.precio_oferta)  : '')
        setVigInicio(toYmd(o.vigencia_inicio))
        setVigFin(   toYmd(o.vigencia_fin))
        setSemanas(o.semanas_ventana ?? 4)
        setCadenasSel(Array.isArray(o.cadenas) ? o.cadenas : [])
        const prods = (j.productos ?? []) as Array<{ upc: string; item_nbr: string | null; descripcion: string | null }>
        setProductos(prods.map(p => ({
          upc:         p.upc,
          item_nbr:    p.item_nbr ?? '',
          descripcion: p.descripcion ?? '',
        })))
      })
      .catch((e: any) => setError(e.message ?? 'Error cargando oferta'))
      .finally(() => setLoadingInitial(false))
  }, [editingId])

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (busqueda.trim().length < 2) { setSuggs([]); return }
    searchTimer.current = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await fetch('/api/ofertas/ean-lookup?q=' + encodeURIComponent(busqueda.trim()))
        const j = await r.json()
        setSuggs(j.productos ?? [])
        setShowSuggs(true)
      } finally { setSearching(false) }
    }, 250)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [busqueda])

  const toggleCadena = (c: string) =>
    setCadenasSel(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])

  const agregarProducto = (s: EanSugg) => {
    if (!s.ean || productos.some(p => p.upc === s.ean)) return
    setProductos(prev => [...prev, { upc: s.ean!, item_nbr: '', descripcion: s.descripcion ?? '' }])
    setBusqueda(''); setSuggs([]); setShowSuggs(false)
  }

  const guardar = async () => {
    setError(null)
    if (!nombre.trim())          return setError('El nombre es requerido')
    if (!vigInicio || !vigFin)   return setError('Vigencia requerida')
    if (vigFin < vigInicio)      return setError('Fecha fin debe ser >= inicio')
    if (cadenasSel.length === 0) return setError('Seleccioná al menos una cadena')
    if (productos.length === 0)  return setError('Agregá al menos un producto')

    setSaving(true)
    try {
      const body = {
        nombre:          nombre.trim(),
        mecanica:        mecanica.trim() || null,
        precio_display:  null,  // campo legacy: ya no se usa desde el front
        precio_regular:  precioRegular ? Number(precioRegular) : null,
        precio_oferta:   precioOferta  ? Number(precioOferta)  : null,
        pais,
        cadenas:         cadenasSel,
        vigencia_inicio: vigInicio,
        vigencia_fin:    vigFin,
        semanas_ventana: semanas,
        productos:       productos.map(p => ({
          upc:         p.upc,
          item_nbr:    p.item_nbr || null,
          descripcion: p.descripcion || null,
        })),
      }
      const r = await fetch(
        isEditing ? '/api/ofertas-impacto/' + editingId : '/api/ofertas-impacto',
        {
          method:  isEditing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
        },
      )
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? (isEditing ? 'Error al actualizar' : 'Error al crear'))
      onSaved()
    } catch (e: any) {
      setError(e.message ?? 'Error al guardar')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto"
         onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-8 flex flex-col overflow-hidden"
           onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-800">
              {isEditing ? 'Editar oferta' : 'Nueva oferta'}
            </h3>
            <p className="text-xs text-gray-400">
              País {pais}{!isEditing && ` · cadena default: ${cadenaDefault}`}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {loadingInitial && (
            <div className="py-8 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Cargando datos de la oferta…
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Nombre <span className="text-red-500">*</span></label>
              <input value={nombre} onChange={e => setNombre(e.target.value)}
                placeholder='Ej. "Precio mágico troceados"'
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/20" />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Mecánica</label>
              <input value={mecanica} onChange={e => setMecanica(e.target.value)}
                placeholder="Descripción breve"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/20" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                Precio regular <span className="text-gray-400">({moneda.simbolo})</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium pointer-events-none">
                  {moneda.simbolo}
                </span>
                <input value={precioRegular} onChange={e => setPrecioRegular(e.target.value)}
                  type="number" step="0.01" placeholder="0"
                  className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/20" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                Precio oferta <span className="text-gray-400">({moneda.simbolo})</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium pointer-events-none">
                  {moneda.simbolo}
                </span>
                <input value={precioOferta} onChange={e => setPrecioOferta(e.target.value)}
                  type="number" step="0.01" placeholder="0"
                  className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/20" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Vigencia inicio <span className="text-red-500">*</span></label>
              <input value={vigInicio} onChange={e => setVigInicio(e.target.value)}
                type="date"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/20" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Vigencia fin <span className="text-red-500">*</span></label>
              <input value={vigFin} onChange={e => setVigFin(e.target.value)}
                type="date"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/20" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Semanas ventana</label>
              <input value={semanas}
                onChange={e => setSemanas(Math.max(1, Math.min(12, Number(e.target.value) || 4)))}
                type="number" min={1} max={12}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/20" />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              Cadenas <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {cadenasOpts.map(c => {
                const active = cadenasSel.includes(c)
                return (
                  <button key={c} type="button" onClick={() => toggleCadena(c)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      active
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}>
                    {c}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-gray-500 block">
              Productos <span className="text-red-500">*</span> — {productos.length} agregados
            </label>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                onFocus={() => busqueda.length >= 2 && setShowSuggs(true)}
                placeholder="Buscar por SKU, EAN o descripción…"
                className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/20" />
              {searching && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />}
              {showSuggs && suggs.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
                  {suggs.map(s => {
                    const ya = productos.some(p => p.upc === s.ean)
                    return (
                      <button key={s.ean ?? Math.random()} type="button"
                        onClick={() => !ya && agregarProducto(s)}
                        disabled={ya}
                        className={`w-full text-left px-3 py-2 border-b border-gray-50 text-sm flex items-center justify-between gap-3 ${
                          ya ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : 'hover:bg-blue-50'
                        }`}>
                        <div>
                          <p className="font-medium text-gray-800 text-xs">{s.descripcion ?? '—'}</p>
                          <p className="text-[10px] text-gray-400 tabular-nums">EAN {s.ean} · SKU {s.codigo_interno ?? '—'}</p>
                        </div>
                        {ya ? <span className="text-[10px]">Ya agregado</span> : <Plus size={13} />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {productos.length > 0 && (
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-[10px] uppercase tracking-widest text-gray-400">
                      <th className="py-2 px-3">Descripción</th>
                      <th className="py-2 px-3">EAN</th>
                      <th className="py-2 px-3">Item #</th>
                      <th className="py-2 px-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {productos.map(p => (
                      <tr key={p.upc} className="border-t border-gray-50">
                        <td className="py-2 px-3 text-gray-800 text-xs">{p.descripcion || '—'}</td>
                        <td className="py-2 px-3 tabular-nums text-gray-500 text-xs">{p.upc}</td>
                        <td className="py-2 px-3">
                          <input value={p.item_nbr}
                            onChange={e => setProductos(prev => prev.map(x => x.upc === p.upc ? { ...x, item_nbr: e.target.value } : x))}
                            placeholder="—"
                            className="w-full border border-gray-100 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400/40" />
                        </td>
                        <td className="py-2 px-3">
                          <button onClick={() => setProductos(prev => prev.filter(x => x.upc !== p.upc))}
                            className="p-1 rounded-md hover:bg-red-100 text-red-600" title="Quitar">
                            <X size={12} />
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

        <div className="px-6 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={guardar} disabled={saving || loadingInitial}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
            {saving && <Loader2 size={13} className="animate-spin" />}
            {isEditing ? 'Guardar cambios' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  )
}


// ══════════════════════════════════════════════════════════════════════════
// Modal: Detalle + análisis por SKU
// ══════════════════════════════════════════════════════════════════════════

function DetalleOfertaModal({ id, onClose, onEdit, onDeleted }: {
  id: string
  onClose: () => void
  onEdit: (id: string) => void
  onDeleted: () => void
}) {
  const [oferta,  setOferta]  = useState<OfertaRow | null>(null)
  const [porSku,  setPorSku]  = useState<PorSku[]>([])
  const [total,   setTotal]   = useState<AnalisisTotal | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    setLoading(true); setError(null)
    fetch('/api/ofertas-impacto/' + id + '/analisis')
      .then(async r => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? 'Error')
        setOferta(j.oferta)
        setPorSku(j.por_sku ?? [])
        setTotal(j.total)
      })
      .catch((e: any) => setError(e.message ?? 'Error'))
      .finally(() => setLoading(false))
  }, [id])

  const eliminar = async () => {
    if (!oferta) return
    if (!confirm(`¿Eliminar la oferta "${oferta.nombre}"?`)) return
    const r = await fetch('/api/ofertas-impacto/' + id, { method: 'DELETE' })
    if (r.ok) onDeleted()
    else alert('No se pudo eliminar')
  }

  const enCurso = oferta ? oferta.vigencia_fin >= new Date().toISOString().slice(0, 10) : false

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto"
         onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl my-8 flex flex-col overflow-hidden"
           onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            {oferta ? (
              <>
                <h3 className="text-base font-bold text-gray-800">{oferta.nombre}</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {oferta.pais} · {oferta.cadenas.join(' + ')} · {fmtDate(oferta.vigencia_inicio)} → {fmtDate(oferta.vigencia_fin)}
                  {enCurso && <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold">EN CURSO</span>}
                </p>
              </>
            ) : <span className="text-sm text-gray-400">Cargando…</span>}
          </div>
          <div className="flex gap-2">
            {oferta && (
              <>
                <button onClick={() => onEdit(id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-700 rounded-lg text-xs hover:bg-gray-50">
                  <Pencil size={12} /> Editar
                </button>
                <button onClick={eliminar}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-xs hover:bg-red-50">
                  <Trash2 size={12} /> Eliminar
                </button>
              </>
            )}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="px-6 py-4 max-h-[75vh] overflow-y-auto space-y-4">
          {loading && <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Cargando análisis…</div>}
          {error   && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">{error}</div>}

          {oferta && !loading && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Precio</p>
                  <p className="text-gray-800 font-medium tabular-nums text-sm">
                    {oferta.precio_regular != null && (
                      <span className="text-gray-400 line-through mr-2 font-normal">
                        {fmtPrecio(oferta.precio_regular, oferta.pais)}
                      </span>
                    )}
                    <span className="text-blue-700 font-semibold">
                      {fmtPrecio(oferta.precio_oferta, oferta.pais)}
                    </span>
                  </p>
                </div>
                <MetaCell label="Mecánica"        value={oferta.mecanica ?? '—'} small />
                <MetaCell label="Ventana"         value={`${oferta.semanas_ventana} semanas`} />
                <MetaCell label="SKUs"            value={String(total?.total_skus ?? 0)} />
              </div>

              {total && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <KpiCard label="Baseline (uds/sem)"    value={fmtNum(total.baseline_semanal, 0)} sub="Suma de baselines por-SKU" />
                  <KpiCard label="Durante (uds/sem)"     value={fmtNum(total.durante_semanal, 0)}  sub="Promedio semanal en vigencia" />
                  <KpiCard label="Después (uds/sem)"     value={enCurso ? 'En curso' : fmtNum(total.despues_semanal, 0)}
                                                          sub={enCurso ? 'Se calcula al cerrar' : `${oferta.semanas_ventana} sem post-vigencia`}
                                                          tone={enCurso ? 'muted' : undefined} />
                  <KpiCard label="Incremental neta"      value={fmtNum(total.venta_incremental_neta_total, 0)}
                                                          sub="Exceso durante − déficit después"
                                                          tone={total.venta_incremental_neta_total !== null && total.venta_incremental_neta_total > 0 ? 'good' : 'bad'} />
                </div>
              )}

              <OfertasChart
                ofertaId={id}
                vigenciaInicio={oferta.vigencia_inicio}
                vigenciaFin={oferta.vigencia_fin} />

              {total && (total.pull_forward_skus > 0 || total.baseline_no_confiable_skus > 0) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2">
                  <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                  <div>
                    {total.pull_forward_skus > 0 && <p><strong>{total.pull_forward_skus}</strong> SKU{total.pull_forward_skus > 1 ? 's' : ''} con pull-forward.</p>}
                    {total.baseline_no_confiable_skus > 0 && <p><strong>{total.baseline_no_confiable_skus}</strong> SKU{total.baseline_no_confiable_skus > 1 ? 's' : ''} con baseline poco confiable.</p>}
                  </div>
                </div>
              )}

              <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-widest text-gray-400 border-b border-gray-100 bg-gray-50/50">
                      <th className="py-2 px-3">SKU / Descripción</th>
                      <th className="py-2 px-3 text-right">Baseline<br/>(uds/sem)</th>
                      <th className="py-2 px-3 text-right">Durante</th>
                      <th className="py-2 px-3 text-right">Uplift %</th>
                      <th className="py-2 px-3 text-right">Después</th>
                      <th className="py-2 px-3 text-center">Pull-fwd</th>
                      <th className="py-2 px-3 text-right">Incremental<br/>neta</th>
                      <th className="py-2 px-3 text-center">Baseline<br/>N/N sem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porSku.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-gray-400 text-sm">
                          Sin productos en esta oferta
                        </td>
                      </tr>
                    ) : porSku.map(r => {
                      const rowCls = r.pull_forward_flag === true
                        ? 'bg-red-50/40 border-b border-red-100/40'
                        : 'border-b border-gray-50'
                      return (
                        <tr key={r.upc} className={rowCls}>
                          <td className="py-2.5 px-3">
                            <p className="text-gray-800 font-medium text-xs">{r.descripcion ?? '—'}</p>
                            <p className="text-[10px] text-gray-400 tabular-nums">EAN {r.upc}</p>
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-gray-600">{fmtNum(r.baseline_semanal, 1)}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-gray-800 font-semibold">{fmtNum(r.durante_semanal, 1)}</td>
                          <td className={`py-2.5 px-3 text-right tabular-nums ${upliftColor(r.uplift_pct)}`}>
                            <span className="inline-flex items-center gap-0.5">
                              {r.uplift_pct !== null && Number(r.uplift_pct) > 0 && <TrendingUp size={11} />}
                              {r.uplift_pct !== null && Number(r.uplift_pct) < 0 && <TrendingDown size={11} />}
                              {fmtPct(r.uplift_pct)}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-gray-600">
                            {r.despues_semanal === null ? <span className="text-gray-300 text-xs">En curso</span> : fmtNum(r.despues_semanal, 1)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {r.pull_forward_flag === true && <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">Sí</span>}
                            {r.pull_forward_flag === false && <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-600">No</span>}
                            {r.pull_forward_flag === null && <span className="text-gray-300 text-xs">—</span>}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums">
                            {r.venta_incremental_neta === null ? (
                              <span className="text-gray-300 text-xs">—</span>
                            ) : (
                              <span className={Number(r.venta_incremental_neta) > 0 ? 'text-emerald-600 font-semibold' : Number(r.venta_incremental_neta) < 0 ? 'text-red-500 font-semibold' : 'text-gray-500'}>
                                {fmtNum(r.venta_incremental_neta, 0)}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-medium tabular-nums ${r.baseline_confiable ? 'text-gray-500' : 'text-amber-700'}`}
                              title={r.baseline_confiable ? 'Baseline confiable' : 'Baseline poco confiable'}>
                              {!r.baseline_confiable && <AlertTriangle size={10} />}
                              {r.semanas_con_venta}/{r.semanas_baseline_totales}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <p className="text-[10px] text-gray-400">
                Baseline por-SKU sobre las {oferta.semanas_ventana} semanas previas al inicio de vigencia,
                sumando ventas de todas las cadenas ({oferta.cadenas.join(' + ')}) antes de derivar el promedio.
                Pull-forward compara "después" contra el propio baseline de cada SKU.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}


// ══════════════════════════════════════════════════════════════════════════
// Chart de tendencia DIARIA — LineChart Recharts
// ══════════════════════════════════════════════════════════════════════════

interface SerieDiaria {
  desde:            string
  hasta:            string
  vigencia_inicio:  string
  vigencia_fin:     string
  por_sku: Array<{
    upc:         string
    descripcion: string | null
    puntos:      Array<{ fecha: string; uds: number; val: number }>
  }>
}

function OfertasChart({ ofertaId, vigenciaInicio, vigenciaFin }: {
  ofertaId:       string
  vigenciaInicio: string
  vigenciaFin:    string
}) {
  const [vista, setVista]     = useState<'agregado' | 'individual'>('agregado')
  const [skusSel, setSkusSel] = useState<string[]>([])
  const [data, setData]       = useState<SerieDiaria | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch('/api/ofertas-impacto/' + ofertaId + '/serie-diaria')
      .then(r => r.json())
      .then((d: SerieDiaria) => {
        setData(d)
        // Auto-seleccionar el primer SKU con datos
        const primero = d.por_sku.find(s => s.puntos.length > 0) ?? d.por_sku[0]
        if (primero) setSkusSel([primero.upc])
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [ofertaId])

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-4 h-[300px] flex items-center justify-center text-gray-300 text-sm">
        <Loader2 size={14} className="animate-spin mr-2" /> Cargando serie diaria…
      </div>
    )
  }

  if (!data || data.por_sku.every(s => s.puntos.length === 0)) {
    return null
  }

  // Union de fechas ordenadas
  const fechas = Array.from(new Set(
    data.por_sku.flatMap(s => s.puntos.map(p => p.fecha)),
  )).sort()

  // SKUs elegidos en el multi-select (solo relevante cuando vista === 'individual')
  const skusElegidos = vista === 'individual'
    ? data.por_sku.filter(s => skusSel.includes(s.upc))
    : []

  // Armar el dataset del chart
  const chartData = fechas.map(fecha => {
    const row: any = { fecha }
    if (vista === 'agregado') {
      row.total = data.por_sku.reduce((sum, sku) => {
        const p = sku.puntos.find(x => x.fecha === fecha)
        return sum + (p ? p.uds : 0)
      }, 0)
    } else {
      skusElegidos.forEach(sku => {
        const p = sku.puntos.find(x => x.fecha === fecha)
        const key = sku.descripcion ?? sku.upc
        row[key] = p ? p.uds : 0
      })
    }
    return row
  })

  const vigInicioStr = toYmd(vigenciaInicio)
  const vigFinStr    = toYmd(vigenciaFin)

  // Puntos de referencia para el área verde de vigencia
  const duranteX1 = chartData.find(d => d.fecha >= vigInicioStr)?.fecha
  const duranteX2 = [...chartData].reverse().find(d => d.fecha <= vigFinStr)?.fecha

  const fmtFecha = (s: string) => {
    const d = new Date(s.slice(0, 10) + 'T12:00:00')
    if (isNaN(d.getTime())) return s
    return d.toLocaleDateString('es-CR', { day: '2-digit', month: 'short' })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-bold text-gray-800">Tendencia diaria de ventas</h3>
          <p className="text-[10px] text-gray-400">
            Unidades vendidas por día · área verde = vigencia de la oferta
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {vista === 'individual' && (
            <div className="min-w-[200px]">
              <FiltroMulti
                label=""
                options={data.por_sku.map(s => ({ value: s.upc, label: s.descripcion ?? s.upc }))}
                value={skusSel}
                onChange={setSkusSel}
                placeholder="Elegí SKUs..."
                className="w-[220px]" />
            </div>
          )}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {(['agregado', 'individual'] as const).map(v => (
              <button key={v} onClick={() => setVista(v)}
                className={`px-3 py-1.5 text-[11px] font-medium transition-colors ${
                  vista === v ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}>
                {v === 'agregado' ? 'Agregado' : 'Individual'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis
              dataKey="fecha"
              tickFormatter={fmtFecha}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={{ stroke: '#e5e7eb' }}
              minTickGap={20} />
            <YAxis
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={{ stroke: '#e5e7eb' }}
              tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : String(v)} />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
              labelFormatter={fmtFecha}
              formatter={(v: any, name: any) => [Number(v).toLocaleString('en-US', { maximumFractionDigits: 1 }), name]} />
            {duranteX1 && duranteX2 && (
              <ReferenceArea x1={duranteX1} x2={duranteX2} fill="#16a34a" fillOpacity={0.08}
                stroke="#16a34a" strokeOpacity={0.25} strokeDasharray="3 3" />
            )}
            {vista === 'agregado' ? (
              <Line type="monotone" dataKey="total" stroke="#0071CE" strokeWidth={2}
                dot={false} activeDot={{ r: 4 }} name="Unidades totales" />
            ) : (
              <>
                {skusElegidos.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} iconType="line" />}
                {skusElegidos.map((sku, i) => {
                  const key = sku.descripcion ?? sku.upc
                  return (
                    <Line key={sku.upc} type="monotone" dataKey={key}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      strokeWidth={2}
                      dot={skusElegidos.length === 1 ? { r: 2 } : false}
                      activeDot={{ r: 4 }} />
                  )
                })}
              </>
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}


function MetaCell({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">{label}</p>
      <p className={small ? 'text-xs text-gray-700' : 'text-gray-800 font-medium'}>{value}</p>
    </div>
  )
}

function KpiCard({ label, value, sub, tone }: {
  label: string
  value: string
  sub?:  string
  tone?: 'good' | 'bad' | 'muted'
}) {
  const cls =
    tone === 'good'  ? 'text-emerald-700' :
    tone === 'bad'   ? 'text-red-600'     :
    tone === 'muted' ? 'text-gray-400'    :
                       'text-gray-800'
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">{label}</p>
      <p className={`text-xl md:text-2xl font-bold tabular-nums ${cls}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}
