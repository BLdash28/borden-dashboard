'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  RefreshCw, Search, Package, Box, AlertTriangle,
  TrendingUp, Calendar, BarChart2, ClipboardList,
  Plus, CheckCircle, XCircle,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, Legend,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Snapshot {
  id: number
  fecha_snapshot: string
  archivo_origen: string
  cargado_en: string
  total_items: string
}

interface Item {
  id: number
  tipo: string
  estado: string | null
  sku: string | null
  codigo: string | null
  categoria: string | null
  descripcion: string | null
  lote: string | null
  fecha_vence: string | null
  fecha_ingreso: string | null
  vida_util_dias: number | null
  unidad_medida: string | null
  total_cajas: string | null
  total_unidades: string | null
  total_litros: string | null
  inv_inicial: string | null
  despacho: string | null
  devolucion: string | null
  ingreso: string | null
  reclamo: string | null
  existencia: string | null
  comentarios: string | null
  dias_restantes: number | null
}

interface Totales {
  total_cajas: string | null
  total_unidades: string | null
  total_litros: string | null
  total_existencia: string | null
}

interface KpiData {
  fecha_snapshot: string
  pt: {
    total_cajas: number
    total_unidades: number
    total_litros: number
    total_items: number
    dias_prom_vida: number
    skus_rojo: number
    skus_amarillo: number
    skus_verde: number
    pct_vida_baja: number
  }
  por_estado: { estado: string; cajas: string; unidades: string; items: string }[]
  top_skus: { sku: string; descripcion: string; cajas: string; unidades: string }[]
  empaque: { tipo: string; categoria: string; existencia: string; items: string }[]
}

interface Movimiento {
  id: number
  fecha: string
  tipo_mov: string
  tipo_inv: string
  sku: string | null
  codigo: string | null
  lote: string | null
  cantidad_cajas: string | null
  cantidad_unid: string | null
  motivo: string | null
  comentario: string | null
  creado_en: string
}

const EMPTY_FORM = {
  fecha: new Date().toISOString().slice(0, 10),
  tipo_mov: 'ENTRADA',
  tipo_inv: 'PRODUCTO_TERMINADO',
  sku: '',
  codigo: '',
  lote: '',
  cantidad_cajas: '',
  cantidad_unid: '',
  motivo: '',
  comentario: '',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtN(v: string | number | null | undefined, dec = 0) {
  const n = Number(v)
  if (v === null || v === undefined || isNaN(n)) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function fmtFecha(s: string | null) {
  if (!s) return '—'
  return new Date(s + (s.includes('T') ? '' : 'T12:00:00')).toLocaleDateString('es-GT', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

// Cobertura en días: (stock_actual / despacho_período) × 30
function calcCobertura(item: Item): string {
  const desp = Number(item.despacho)
  if (!desp) return '—'
  const stock = item.tipo === 'PRODUCTO_TERMINADO'
    ? Number(item.total_cajas ?? item.existencia ?? 0)
    : Number(item.existencia ?? 0)
  if (!stock) return '—'
  return fmtN((stock / desp) * 30, 0) + 'd'
}

function semaforo(dias: number | null): { color: string; bg: string; label: string } {
  if (dias === null) return { color: 'text-gray-400', bg: 'bg-gray-100', label: 'Sin fecha' }
  if (dias < 30)    return { color: 'text-red-600',   bg: 'bg-red-100',   label: `${dias}d` }
  if (dias <= 90)   return { color: 'text-amber-600', bg: 'bg-amber-100', label: `${dias}d` }
  return { color: 'text-green-700', bg: 'bg-green-100', label: `${dias}d` }
}

const ESTADO_LABELS: Record<string, string> = {
  DISPONIBLE:        'Disponible',
  DESPACHO:          'Despacho',
  VIDA_UTIL_BAJA:    'Vida Útil Baja',
  PRUEBA_INDUSTRIAL: 'Prueba Industrial',
}

const TIPO_LABELS: Record<string, string> = {
  PRODUCTO_TERMINADO: 'Producto Terminado',
  EMPAQUE:            'Material de Empaque',
  CINTA:              'Cinta / Tira',
}

const ESTADO_COLORS: Record<string, string> = {
  DISPONIBLE:        '#22c55e',
  DESPACHO:          '#3b82f6',
  VIDA_UTIL_BAJA:    '#f59e0b',
  PRUEBA_INDUSTRIAL: '#a78bfa',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon, colorClass = 'border-l-amber-400',
}: {
  label: string; value: string | number; sub?: string
  icon: React.ReactNode; colorClass?: string
}) {
  return (
    <div className={`bg-white rounded-xl border border-gray-100 shadow-sm p-5 border-l-4 ${colorClass}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{label}</p>
        <span className="text-gray-300">{icon}</span>
      </div>
      <p className="text-2xl font-bold text-gray-800">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function SemaforoChip({ dias }: { dias: number | null }) {
  const s = semaforo(dias)
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${s.bg} ${s.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dias === null ? 'bg-gray-400' : dias < 30 ? 'bg-red-500' : dias <= 90 ? 'bg-amber-500' : 'bg-green-500'}`} />
      {s.label}
    </span>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function InventarioBordenPT() {
  const [tab, setTab] = useState<'consulta' | 'movimientos' | 'kpis'>('consulta')

  // Snapshots disponibles
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [fechaActiva, setFechaActiva] = useState<string>('')

  // Tab 1 — Consulta
  const [items, setItems]         = useState<Item[]>([])
  const [totales, setTotales]     = useState<Totales | null>(null)
  const [loadingItems, setLoadingItems] = useState(false)
  const [filtroTipo, setFiltroTipo]     = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroBuscar, setFiltroBuscar] = useState('')
  const [filtroLote, setFiltroLote]     = useState('')
  const [filtroSem, setFiltroSem]       = useState('')

  // Tab 2 — Movimientos
  const [movimientos, setMovimientos]   = useState<Movimiento[]>([])
  const [loadingMovs, setLoadingMovs]   = useState(false)
  const [formMov, setFormMov]           = useState({ ...EMPTY_FORM })
  const [savingMov, setSavingMov]       = useState(false)
  const [movError, setMovError]         = useState('')
  const [movOk, setMovOk]               = useState(false)

  // Tab 3 — KPIs
  const [kpiData, setKpiData]       = useState<KpiData | null>(null)
  const [loadingKpis, setLoadingKpis] = useState(false)

  // ── Carga inicial de snapshots ──────────────────────────────────────────────

  const fetchSnapshots = useCallback(async () => {
    const r = await fetch('/api/inventario/snapshots')
    const j = await r.json()
    const snaps: Snapshot[] = j.snapshots || []
    setSnapshots(snaps)
    if (snaps.length > 0 && !fechaActiva) {
      setFechaActiva(snaps[0].fecha_snapshot)
    }
  }, [fechaActiva])

  useEffect(() => { fetchSnapshots() }, [])

  // ── Tab 1: Items ──────────────────────────────────────────────────────────

  const fetchItems = useCallback(async () => {
    if (!fechaActiva) return
    setLoadingItems(true)
    const p = new URLSearchParams({ fecha: fechaActiva })
    if (filtroTipo)   p.set('tipo',     filtroTipo)
    if (filtroEstado) p.set('estado',   filtroEstado)
    if (filtroBuscar.trim()) p.set('buscar', filtroBuscar.trim())
    if (filtroLote.trim())   p.set('lote',   filtroLote.trim())
    if (filtroSem)    p.set('semaforo', filtroSem)

    const r = await fetch('/api/inventario/items?' + p)
    const j = await r.json()
    setItems(j.items || [])
    setTotales(j.totales || null)
    setLoadingItems(false)
  }, [fechaActiva, filtroTipo, filtroEstado, filtroBuscar, filtroLote, filtroSem])

  useEffect(() => { if (tab === 'consulta') fetchItems() }, [tab, fetchItems])
  useEffect(() => { if (tab === 'consulta') fetchItems() }, [fechaActiva])

  // ── Tab 2: Movimientos ────────────────────────────────────────────────────

  const fetchMovimientos = useCallback(async () => {
    setLoadingMovs(true)
    const p = fechaActiva ? `?fecha=${fechaActiva}` : ''
    const r = await fetch('/api/inventario/movimientos' + p)
    const j = await r.json()
    setMovimientos(j.movimientos || [])
    setLoadingMovs(false)
  }, [fechaActiva])

  useEffect(() => { if (tab === 'movimientos') fetchMovimientos() }, [tab, fetchMovimientos])

  const handleSaveMov = async () => {
    setMovError('')
    setMovOk(false)
    if (!formMov.tipo_mov || !formMov.tipo_inv || !formMov.fecha) {
      setMovError('Fecha, tipo de movimiento y tipo de inventario son requeridos.')
      return
    }
    setSavingMov(true)
    try {
      const res = await fetch('/api/inventario/movimientos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formMov,
          cantidad_cajas: formMov.cantidad_cajas ? Number(formMov.cantidad_cajas) : null,
          cantidad_unid:  formMov.cantidad_unid  ? Number(formMov.cantidad_unid)  : null,
        }),
      })
      const j = await res.json()
      if (!res.ok) { setMovError(j.error || 'Error al guardar'); return }
      setMovOk(true)
      setFormMov({ ...EMPTY_FORM })
      fetchMovimientos()
    } finally {
      setSavingMov(false)
    }
  }

  // ── Tab 3: KPIs ──────────────────────────────────────────────────────────

  const fetchKpis = useCallback(async () => {
    if (!fechaActiva) return
    setLoadingKpis(true)
    const r = await fetch(`/api/inventario/kpis?fecha=${fechaActiva}`)
    const j = await r.json()
    setKpiData(j.error ? null : j)
    setLoadingKpis(false)
  }, [fechaActiva])

  useEffect(() => { if (tab === 'kpis') fetchKpis() }, [tab, fetchKpis])
  useEffect(() => { if (tab === 'kpis') fetchKpis() }, [fechaActiva])

  // ── Helpers UI ────────────────────────────────────────────────────────────

  const setFM = (key: keyof typeof EMPTY_FORM, val: string) =>
    setFormMov(f => ({ ...f, [key]: val }))

  const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400'
  const selectCls = inputCls

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Header + selector de snapshot */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Operaciones · Logística</p>
          <h1 className="text-2xl font-bold text-gray-800">Inventario PT Borden</h1>
          <p className="text-xs text-gray-400 mt-0.5">Snapshots de inventario de Producto Terminado</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 font-medium">Snapshot:</label>
          <select
            value={fechaActiva}
            onChange={e => setFechaActiva(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            {snapshots.length === 0 && <option value="">Sin snapshots</option>}
            {snapshots.map(s => (
              <option key={s.fecha_snapshot} value={s.fecha_snapshot}>
                {fmtFecha(s.fecha_snapshot)} ({s.total_items} items)
              </option>
            ))}
          </select>
          <button onClick={fetchSnapshots}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Sin snapshots */}
      {snapshots.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-700">
          No hay snapshots cargados. Ejecuta <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono text-xs">python cargar_inventario.py &lt;archivo.xlsx&gt;</code> para cargar el primero.
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {([
          { key: 'consulta',     label: 'Consulta',    icon: <Search size={13} />        },
          { key: 'movimientos',  label: 'Movimientos', icon: <ClipboardList size={13} /> },
          { key: 'kpis',         label: 'KPIs',        icon: <BarChart2 size={13} />     },
        ] as const).map(t => (
          <button key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all
              ${tab === t.key ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: CONSULTA ─────────────────────────────────────────────────── */}
      {tab === 'consulta' && (
        <div className="space-y-4">

          {/* Filtros */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex flex-wrap gap-3 items-end">

              {/* Tipo */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-medium">Tipo</label>
                <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 min-w-[180px]">
                  <option value="">Todos los tipos</option>
                  <option value="PRODUCTO_TERMINADO">Producto Terminado</option>
                  <option value="EMPAQUE">Material de Empaque</option>
                  <option value="CINTA">Cinta / Tira</option>
                </select>
              </div>

              {/* Estado (solo PT) */}
              {(filtroTipo === 'PRODUCTO_TERMINADO' || !filtroTipo) && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase tracking-widest text-gray-400 font-medium">Estado PT</label>
                  <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 min-w-[180px]">
                    <option value="">Todos los estados</option>
                    <option value="DISPONIBLE">Disponible</option>
                    <option value="DESPACHO">Despacho</option>
                    <option value="VIDA_UTIL_BAJA">Vida Útil Baja</option>
                    <option value="PRUEBA_INDUSTRIAL">Prueba Industrial</option>
                  </select>
                </div>
              )}

              {/* Semáforo */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-medium">Semáforo</label>
                <select value={filtroSem} onChange={e => setFiltroSem(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 min-w-[150px]">
                  <option value="">Todos</option>
                  <option value="rojo">🔴 Rojo (&lt;30d)</option>
                  <option value="amarillo">🟡 Amarillo (30–90d)</option>
                  <option value="verde">🟢 Verde (&gt;90d)</option>
                  <option value="gris">⚪ Sin fecha</option>
                </select>
              </div>

              {/* SKU / Descripción */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-medium">SKU / Descripción</label>
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={filtroBuscar} onChange={e => setFiltroBuscar(e.target.value)}
                    placeholder="Buscar…"
                    className="text-sm border border-gray-200 rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 w-48"
                  />
                </div>
              </div>

              {/* Lote */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-medium">Lote</label>
                <input value={filtroLote} onChange={e => setFiltroLote(e.target.value)}
                  placeholder="Filtrar lote…"
                  className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 w-36"
                />
              </div>

              <button onClick={fetchItems}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white shadow-sm"
                style={{ background: '#c8873a' }}>
                <Search size={13} /> Buscar
              </button>

              {(filtroTipo || filtroEstado || filtroBuscar || filtroLote || filtroSem) && (
                <button onClick={() => {
                  setFiltroTipo(''); setFiltroEstado(''); setFiltroBuscar('')
                  setFiltroLote(''); setFiltroSem('')
                }} className="text-xs text-gray-400 hover:text-gray-600 underline py-2">
                  Limpiar filtros
                </button>
              )}
            </div>
          </div>

          {/* Tabla */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="font-semibold text-gray-700 text-sm">
                {loadingItems ? 'Cargando…' : `${items.length} registros`}
              </span>
              {fechaActiva && (
                <span className="text-xs text-gray-400">Snapshot: {fmtFecha(fechaActiva)}</span>
              )}
            </div>

            {loadingItems ? (
              <div className="h-48 flex items-center justify-center text-gray-300 text-sm">
                <RefreshCw size={16} className="animate-spin mr-2" /> Cargando…
              </div>
            ) : items.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
                Sin resultados para los filtros aplicados
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[900px]">
                  <thead>
                    <tr className="text-[10px] text-gray-400 uppercase tracking-widest bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-2.5">Tipo / Estado</th>
                      <th className="text-left px-3 py-2.5">SKU / Cód.</th>
                      <th className="text-left px-3 py-2.5">Descripción</th>
                      <th className="text-left px-3 py-2.5">Lote</th>
                      <th className="text-left px-3 py-2.5">Vence</th>
                      <th className="text-center px-3 py-2.5">Vida útil</th>
                      <th className="text-right px-3 py-2.5">Cajas</th>
                      <th className="text-right px-3 py-2.5">Unidades</th>
                      <th className="text-right px-3 py-2.5">Litros / Exist.</th>
                      <th className="text-right px-4 py-2.5">Cobertura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => {
                      const s = semaforo(item.dias_restantes)
                      const esPT = item.tipo === 'PRODUCTO_TERMINADO'
                      return (
                        <tr key={item.id} className="border-b border-gray-50 hover:bg-amber-50/30 transition-colors">
                          <td className="px-4 py-2.5">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] font-semibold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded w-fit">
                                {TIPO_LABELS[item.tipo] || item.tipo}
                              </span>
                              {item.estado && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded w-fit"
                                  style={{
                                    background: ESTADO_COLORS[item.estado] + '22',
                                    color: ESTADO_COLORS[item.estado],
                                  }}>
                                  {ESTADO_LABELS[item.estado] || item.estado}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 font-mono font-semibold text-amber-700">
                            {item.sku || item.codigo || '—'}
                          </td>
                          <td className="px-3 py-2.5 text-gray-700 max-w-[200px]">
                            <span className="line-clamp-2">{item.descripcion || '—'}</span>
                          </td>
                          <td className="px-3 py-2.5 text-gray-500 font-mono">{item.lote || '—'}</td>
                          <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{fmtFecha(item.fecha_vence)}</td>
                          <td className="px-3 py-2.5 text-center">
                            <SemaforoChip dias={item.dias_restantes} />
                          </td>
                          <td className="px-3 py-2.5 text-right font-medium text-gray-800">
                            {esPT ? fmtN(item.total_cajas) : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-600">
                            {esPT ? fmtN(item.total_unidades) : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold text-emerald-700">
                            {esPT ? fmtN(item.total_litros) : fmtN(item.existencia)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium text-sky-700">
                            {calcCobertura(item)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {/* Totales */}
                  {totales && (
                    <tfoot>
                      <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold text-gray-700">
                        <td colSpan={6} className="px-4 py-2.5 text-right text-xs uppercase tracking-widest text-gray-400">Totales</td>
                        <td className="px-3 py-2.5 text-right">{fmtN(totales.total_cajas)}</td>
                        <td className="px-3 py-2.5 text-right">{fmtN(totales.total_unidades)}</td>
                        <td className="px-3 py-2.5 text-right text-emerald-700">{fmtN(totales.total_litros || totales.total_existencia)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2: MOVIMIENTOS ──────────────────────────────────────────────── */}
      {tab === 'movimientos' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Formulario */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h3 className="font-semibold text-gray-700 text-sm">Registrar movimiento</h3>

            {movError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-xs text-red-600">
                <AlertTriangle size={13} />{movError}
              </div>
            )}
            {movOk && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 text-xs text-green-700">
                <CheckCircle size={13} />Movimiento registrado correctamente
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-medium block mb-1">Fecha *</label>
                <input type="date" value={formMov.fecha} onChange={e => setFM('fecha', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-medium block mb-1">Tipo movimiento *</label>
                <select value={formMov.tipo_mov} onChange={e => setFM('tipo_mov', e.target.value)} className={selectCls}>
                  <option value="ENTRADA">Entrada</option>
                  <option value="SALIDA">Salida</option>
                  <option value="AJUSTE">Ajuste</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-widest text-gray-400 font-medium block mb-1">Tipo de inventario *</label>
              <select value={formMov.tipo_inv} onChange={e => setFM('tipo_inv', e.target.value)} className={selectCls}>
                <option value="PRODUCTO_TERMINADO">Producto Terminado</option>
                <option value="EMPAQUE">Material de Empaque</option>
                <option value="CINTA">Cinta / Tira</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-medium block mb-1">SKU</label>
                <input value={formMov.sku} onChange={e => setFM('sku', e.target.value)} placeholder="020201076" className={inputCls} />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-medium block mb-1">Código</label>
                <input value={formMov.codigo} onChange={e => setFM('codigo', e.target.value)} placeholder="203030216" className={inputCls} />
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-widest text-gray-400 font-medium block mb-1">Lote</label>
              <input value={formMov.lote} onChange={e => setFM('lote', e.target.value)} placeholder="310126T2" className={inputCls} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-medium block mb-1">Cantidad cajas</label>
                <input type="number" step="0.01" value={formMov.cantidad_cajas} onChange={e => setFM('cantidad_cajas', e.target.value)} placeholder="0" className={inputCls} />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-gray-400 font-medium block mb-1">Cantidad unidades</label>
                <input type="number" step="1" value={formMov.cantidad_unid} onChange={e => setFM('cantidad_unid', e.target.value)} placeholder="0" className={inputCls} />
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-widest text-gray-400 font-medium block mb-1">Motivo</label>
              <select value={formMov.motivo} onChange={e => setFM('motivo', e.target.value)} className={selectCls}>
                <option value="">Seleccionar…</option>
                <option value="Producción">Producción</option>
                <option value="Exportación">Exportación</option>
                <option value="Devolución cliente">Devolución cliente</option>
                <option value="Ajuste inventario">Ajuste inventario</option>
                <option value="Reclamo">Reclamo</option>
                <option value="Merma">Merma</option>
                <option value="Otro">Otro</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-widest text-gray-400 font-medium block mb-1">Comentario</label>
              <textarea value={formMov.comentario} onChange={e => setFM('comentario', e.target.value)}
                rows={2} placeholder="Observaciones adicionales…"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
            </div>

            <button onClick={handleSaveMov} disabled={savingMov}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-60"
              style={{ background: '#c8873a' }}>
              {savingMov ? <><RefreshCw size={13} className="animate-spin" /> Guardando…</> : <><Plus size={13} /> Registrar movimiento</>}
            </button>
          </div>

          {/* Historial */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-700 text-sm">Historial de movimientos</h3>
              <button onClick={fetchMovimientos} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
                <RefreshCw size={13} className={loadingMovs ? 'animate-spin' : ''} />
              </button>
            </div>

            {loadingMovs ? (
              <div className="h-48 flex items-center justify-center text-gray-300 text-sm">Cargando…</div>
            ) : movimientos.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-gray-400 text-sm gap-2">
                <ClipboardList size={28} className="text-gray-200" />
                Sin movimientos registrados
              </div>
            ) : (
              <div className="overflow-y-auto max-h-[540px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="text-[10px] text-gray-400 uppercase tracking-widest border-b border-gray-100">
                      <th className="text-left px-4 py-2.5">Fecha</th>
                      <th className="text-left px-3 py-2.5">Mov.</th>
                      <th className="text-left px-3 py-2.5">SKU/Cód.</th>
                      <th className="text-left px-3 py-2.5">Lote</th>
                      <th className="text-right px-3 py-2.5">Cajas</th>
                      <th className="text-right px-4 py-2.5">Uds.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimientos.map(m => {
                      const colorMov = m.tipo_mov === 'ENTRADA' ? 'text-green-600 bg-green-50' :
                        m.tipo_mov === 'SALIDA' ? 'text-red-500 bg-red-50' : 'text-blue-600 bg-blue-50'
                      return (
                        <tr key={m.id} className="border-b border-gray-50 hover:bg-amber-50/30">
                          <td className="px-4 py-2 text-gray-500">{fmtFecha(m.fecha)}</td>
                          <td className="px-3 py-2">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${colorMov}`}>
                              {m.tipo_mov}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-amber-700">{m.sku || m.codigo || '—'}</td>
                          <td className="px-3 py-2 text-gray-500">{m.lote || '—'}</td>
                          <td className="px-3 py-2 text-right font-medium">{fmtN(m.cantidad_cajas, 2)}</td>
                          <td className="px-4 py-2 text-right">{fmtN(m.cantidad_unid)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 3: KPIs ─────────────────────────────────────────────────────── */}
      {tab === 'kpis' && (
        <div className="space-y-5">
          {loadingKpis ? (
            <div className="h-48 flex items-center justify-center text-gray-300 text-sm">
              <RefreshCw size={16} className="animate-spin mr-2" /> Cargando…
            </div>
          ) : !kpiData ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
              Sin datos disponibles para el snapshot seleccionado
            </div>
          ) : (
            <>
              {/* KPI Cards PT */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard label="Total Cajas PT"    value={fmtN(kpiData.pt.total_cajas)}    sub="disponibles + despacho" icon={<Box size={18}/>}        colorClass="border-l-amber-400"  />
                <KpiCard label="Total Unidades"     value={fmtN(kpiData.pt.total_unidades)} sub="unidades producto"      icon={<Package size={18}/>}    colorClass="border-l-blue-400"   />
                <KpiCard label="Total Litros"       value={fmtN(kpiData.pt.total_litros)}   sub="volumen total"          icon={<TrendingUp size={18}/>}  colorClass="border-l-emerald-400"/>
                <KpiCard label="Vida Útil Prom."    value={`${fmtN(kpiData.pt.dias_prom_vida)} días`} sub="promedio portafolio" icon={<Calendar size={18}/>} colorClass="border-l-purple-400" />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard label="SKUs en Alerta Roja"  value={kpiData.pt.skus_rojo}    sub="<30 días de vida útil"   icon={<XCircle size={18}/>}     colorClass="border-l-red-400"    />
                <KpiCard label="SKUs en Amarillo"      value={kpiData.pt.skus_amarillo} sub="30–90 días"            icon={<AlertTriangle size={18}/>} colorClass="border-l-amber-400"  />
                <KpiCard label="SKUs en Verde"         value={kpiData.pt.skus_verde}   sub=">90 días"               icon={<CheckCircle size={18}/>}  colorClass="border-l-green-400"  />
                <KpiCard label="% Inventario Baja V.U." value={`${fmtN(kpiData.pt.pct_vida_baja, 1)}%`} sub="cajas con <30d" icon={<BarChart2 size={18}/>} colorClass="border-l-red-300"    />
              </div>

              {/* Gráfico por estado */}
              {kpiData.por_estado.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">Cajas por estado</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={kpiData.por_estado} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="estado"
                        tickFormatter={v => ESTADO_LABELS[v] || v}
                        tick={{ fontSize: 11, fill: '#9ca3af' }}
                        axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={50} />
                      <Tooltip formatter={(v: any) => [fmtN(v) + ' cajas']} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="cajas" radius={[4, 4, 0, 0]} maxBarSize={60}>
                        {kpiData.por_estado.map((entry, i) => (
                          <Cell key={i} fill={ESTADO_COLORS[entry.estado] || '#c8873a'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Top SKUs */}
              {kpiData.top_skus.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">Top SKUs por cajas</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={kpiData.top_skus.slice(0, 8)}
                      layout="vertical"
                      margin={{ top: 4, right: 60, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="sku" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={70} />
                      <Tooltip
                        formatter={(v: any) => [fmtN(v) + ' cajas']}
                        labelFormatter={(label: string) => {
                          const s = kpiData.top_skus.find(x => x.sku === label)
                          return s?.descripcion?.slice(0, 40) || label
                        }}
                        contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="cajas" fill="#c8873a" radius={[0, 4, 4, 0]} maxBarSize={28}
                        label={{ position: 'right', fontSize: 10, fill: '#6b7280', formatter: (v: any) => fmtN(v) }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Tabla rotación histórica: comparar snapshots */}
              {snapshots.length > 1 && (() => {
                // Placeholder: muestra tabla de snapshots disponibles para comparar
                return (
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">Snapshots disponibles</h3>
                    <p className="text-xs text-gray-400 mb-4">Carga más snapshots con <code className="bg-gray-100 px-1 rounded font-mono">python cargar_inventario.py</code> para ver comparativas históricas.</p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[10px] text-gray-400 uppercase tracking-widest border-b border-gray-100">
                          <th className="text-left py-2 pr-4">Fecha</th>
                          <th className="text-left py-2 pr-4">Archivo</th>
                          <th className="text-right py-2 pr-4">Items</th>
                          <th className="text-right py-2">Cargado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {snapshots.map(s => (
                          <tr key={s.id} className={`border-b border-gray-50 ${s.fecha_snapshot === fechaActiva ? 'bg-amber-50' : ''}`}>
                            <td className="py-2 pr-4 font-semibold text-gray-700">{fmtFecha(s.fecha_snapshot)}</td>
                            <td className="py-2 pr-4 text-gray-500">{s.archivo_origen || '—'}</td>
                            <td className="py-2 pr-4 text-right">{s.total_items}</td>
                            <td className="py-2 text-right text-gray-400">{fmtFecha(s.cargado_en)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })()}

              {/* Empaque / Cinta */}
              {kpiData.empaque.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">Existencia Empaque / Cinta</h3>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] text-gray-400 uppercase tracking-widest border-b border-gray-100">
                        <th className="text-left py-2 pr-4">Tipo</th>
                        <th className="text-left py-2 pr-4">Categoría</th>
                        <th className="text-right py-2 pr-4">Items</th>
                        <th className="text-right py-2">Existencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kpiData.empaque.map((e, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="py-2 pr-4 font-medium text-gray-700">{TIPO_LABELS[e.tipo] || e.tipo}</td>
                          <td className="py-2 pr-4 text-gray-500">{e.categoria || '—'}</td>
                          <td className="py-2 pr-4 text-right">{e.items}</td>
                          <td className="py-2 text-right font-semibold text-emerald-700">{fmtN(e.existencia)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
