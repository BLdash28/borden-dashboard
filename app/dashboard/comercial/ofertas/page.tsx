'use client'

/*
──────────────────────────────────────────────────────────────────────
SQL — ejecutar en Neon/PostgreSQL antes de usar esta página:

CREATE TABLE IF NOT EXISTS dim_ofertas (
  id                    BIGSERIAL PRIMARY KEY,
  cliente               VARCHAR(200) NOT NULL,
  codigo_interno        VARCHAR(50),
  ean                   VARCHAR(30),
  descripcion           VARCHAR(300),
  baseline_mensual      NUMERIC(14,2) DEFAULT 0,
  baseline_diario       NUMERIC(14,4) DEFAULT 0,
  periodo_oferta_inicio DATE NOT NULL,
  periodo_oferta_fin    DATE NOT NULL,
  dias_oferta           INT           GENERATED ALWAYS AS
                          (CAST(periodo_oferta_fin - periodo_oferta_inicio + 1 AS INT)) STORED,
  precio_regular        NUMERIC(14,4) DEFAULT 0,
  precio_oferta         NUMERIC(14,4) DEFAULT 0,
  descuento_porcentaje  NUMERIC(8,4)  GENERATED ALWAYS AS
                          (CASE WHEN precio_regular > 0
                            THEN ROUND((precio_oferta / precio_regular - 1) * 100, 4)
                            ELSE 0 END) STORED,
  descuento_absoluto    NUMERIC(14,4) GENERATED ALWAYS AS
                          (precio_regular - precio_oferta) STORED,
  incremental_pct       NUMERIC(8,4)  GENERATED ALWAYS AS
                          (CASE WHEN precio_regular > 0
                            THEN ROUND((1 - precio_oferta / precio_regular) * 1.3 * 100, 4)
                            ELSE 0 END) STORED,
  inversion             NUMERIC(14,2) GENERATED ALWAYS AS
                          (CASE WHEN precio_regular > 0
                            THEN ROUND(
                              CAST(periodo_oferta_fin - periodo_oferta_inicio + 1 AS NUMERIC)
                              * baseline_diario
                              * (precio_regular - precio_oferta)
                              * (1 + (1 - precio_oferta / precio_regular) * 1.3),
                            2)
                            ELSE 0 END) STORED,
  created_at            TIMESTAMPTZ   DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dim_ofertas_cliente ON dim_ofertas (LOWER(cliente));
CREATE INDEX IF NOT EXISTS idx_dim_ofertas_ean     ON dim_ofertas (ean);
CREATE INDEX IF NOT EXISTS idx_dim_ofertas_inicio  ON dim_ofertas (periodo_oferta_inicio);
──────────────────────────────────────────────────────────────────────
*/

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Search, RefreshCw, Plus, Pencil, Trash2, X, Tag,
  ChevronLeft, ChevronRight, AlertTriangle, Check, BarChart2,
  ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import {
  ComposedChart, Bar, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Oferta {
  id: number
  cliente: string
  codigo_interno: string | null
  ean: string | null
  descripcion: string | null
  baseline_mensual: string
  baseline_diario: string
  periodo_oferta_inicio: string
  periodo_oferta_fin: string
  dias_oferta: number
  precio_regular: string
  precio_oferta: string
  descuento_porcentaje: string
  descuento_absoluto: string
  incremental_pct: string
  inversion: string
  created_at: string
}

interface EanSuggestion {
  codigo_interno: string | null
  ean: string | null
  descripcion: string | null
  precio_regular: number | null
}

const EMPTY_FORM = {
  cliente:               '',
  codigo_interno:        '',
  ean:                   '',
  descripcion:           '',
  baseline_mensual:      '',
  baseline_diario:       '',
  periodo_oferta_inicio: '',
  periodo_oferta_fin:    '',
  precio_regular:        '',
  precio_oferta:         '',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtUSD(v: string | number | null | undefined) {
  const n = Number(v)
  if (!v || isNaN(n)) return '—'
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtNum(v: string | number | null | undefined, dec = 2) {
  const n = Number(v)
  if (!v || isNaN(n)) return '—'
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}
function fmtDate(s: string) {
  if (!s) return '—'
  return new Date(s + 'T12:00:00').toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Computed in form (mirrors DB generated columns)
function calcDias(ini: string, fin: string): number | null {
  if (!ini || !fin || fin < ini) return null
  const d = Math.round((new Date(fin).getTime() - new Date(ini).getTime()) / 86400000) + 1
  return d > 0 ? d : null
}
function calcDescPct(regular: string, oferta: string): number | null {
  const r = Number(regular), o = Number(oferta)
  if (!r || isNaN(r) || isNaN(o)) return null
  return Math.round((o / r - 1) * 10000) / 100
}
function calcDescAbs(regular: string, oferta: string): number | null {
  const r = Number(regular), o = Number(oferta)
  if (isNaN(r) || isNaN(o)) return null
  return Math.round((r - o) * 10000) / 10000
}
function calcIncrementalPct(regular: string, oferta: string): number | null {
  const r = Number(regular), o = Number(oferta)
  if (!r || isNaN(r) || isNaN(o)) return null
  return Math.round((1 - o / r) * 1.3 * 10000) / 100
}
function calcInversion(
  dias: number | null, baseDiario: string,
  regular: string, oferta: string
): number | null {
  const d  = dias
  const bd = Number(baseDiario)
  const r  = Number(regular), o = Number(oferta)
  if (!d || isNaN(bd) || !bd || !r || isNaN(r) || isNaN(o)) return null
  const descAbs = r - o
  const incFactor = 1 + (1 - o / r) * 1.3
  return Math.round(d * bd * descAbs * incFactor * 100) / 100
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function CalcBadge({ label, value, prefix = '', suffix = '', dec = 2 }: {
  label: string; value: number | null; prefix?: string; suffix?: string; dec?: number
}) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
      <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-[15px] font-bold text-amber-700">
        {value === null ? <span className="text-amber-300 font-normal text-xs">—</span>
          : `${prefix}${value.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}${suffix}`}
      </p>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function OfertasPage() {
  const [ofertas,   setOfertas]   = useState<Oferta[]>([])
  const [total,     setTotal]     = useState(0)
  const [page,      setPage]      = useState(1)
  const [loading,   setLoading]   = useState(true)
  const [buscar,    setBuscar]    = useState('')
  const limit = 20

  // Modal state
  const [modalOpen,   setModalOpen]   = useState(false)
  const [editTarget,  setEditTarget]  = useState<Oferta | null>(null)
  const [saving,      setSaving]      = useState(false)
  const [formError,   setFormError]   = useState('')
  const [form,        setForm]        = useState({ ...EMPTY_FORM })

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Oferta | null>(null)
  const [deleting,     setDeleting]     = useState(false)

  // Análisis
  const [analisisTarget,  setAnalisisTarget]  = useState<Oferta | null>(null)
  const [analisisData,    setAnalisisData]    = useState<any>(null)
  const [analisisLoading, setAnalisisLoading] = useState(false)
  const [analisisError,   setAnalisisError]   = useState('')

  // EAN autocomplete
  const [eanQuery,       setEanQuery]       = useState('')
  const [eanSuggestions, setEanSuggestions] = useState<EanSuggestion[]>([])
  const [eanLoading,     setEanLoading]     = useState(false)
  const eanTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const eanRef   = useRef<HTMLDivElement>(null)

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchOfertas = useCallback((p: number, q: string) => {
    setLoading(true)
    const sp = new URLSearchParams({ page: String(p), limit: String(limit) })
    if (q.trim()) sp.set('buscar', q.trim())
    fetch('/api/ofertas?' + sp)
      .then(r => r.json())
      .then(j => { setOfertas(j.ofertas || []); setTotal(j.total || 0) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchOfertas(page, buscar) }, [])

  const refresh = () => { setPage(1); fetchOfertas(1, buscar) }

  const onSearch = (v: string) => {
    setBuscar(v)
    setPage(1)
    fetchOfertas(1, v)
  }

  // ── EAN lookup ─────────────────────────────────────────────────────────────

  const searchEan = (q: string) => {
    setEanQuery(q)
    setForm(f => ({ ...f, ean: q }))
    if (eanTimer.current) clearTimeout(eanTimer.current)
    if (!q.trim()) { setEanSuggestions([]); return }
    eanTimer.current = setTimeout(() => {
      setEanLoading(true)
      fetch('/api/ofertas/ean-lookup?q=' + encodeURIComponent(q))
        .then(r => r.json())
        .then(j => setEanSuggestions(j.productos || []))
        .finally(() => setEanLoading(false))
    }, 250)
  }

  const selectEan = (s: EanSuggestion) => {
    setEanQuery(s.ean || s.codigo_interno || '')
    setForm(f => ({
      ...f,
      ean:            s.ean            || f.ean,
      codigo_interno: s.codigo_interno || f.codigo_interno,
      descripcion:    s.descripcion    || f.descripcion,
      precio_regular: s.precio_regular != null ? String(s.precio_regular) : f.precio_regular,
    }))
    setEanSuggestions([])
  }

  // Close EAN dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (eanRef.current && !eanRef.current.contains(e.target as Node)) {
        setEanSuggestions([])
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Modal helpers ──────────────────────────────────────────────────────────

  const openAnalisis = (o: Oferta) => {
    setAnalisisTarget(o)
    setAnalisisData(null)
    setAnalisisError('')
    setAnalisisLoading(true)
    fetch(`/api/ofertas/analisis?id=${o.id}`)
      .then(r => r.json())
      .then(j => {
        if (j.error) { setAnalisisError(j.error); return }
        setAnalisisData(j)
      })
      .catch(e => setAnalisisError(e.message))
      .finally(() => setAnalisisLoading(false))
  }

  const openCreate = () => {
    setEditTarget(null)
    setForm({ ...EMPTY_FORM })
    setEanQuery('')
    setEanSuggestions([])
    setFormError('')
    setModalOpen(true)
  }

  const openEdit = (o: Oferta) => {
    setEditTarget(o)
    setForm({
      cliente:               o.cliente,
      codigo_interno:        o.codigo_interno  || '',
      ean:                   o.ean             || '',
      descripcion:           o.descripcion     || '',
      baseline_mensual:      o.baseline_mensual,
      baseline_diario:       o.baseline_diario,
      periodo_oferta_inicio: o.periodo_oferta_inicio?.slice(0, 10) || '',
      periodo_oferta_fin:    o.periodo_oferta_fin?.slice(0, 10)    || '',
      precio_regular:        o.precio_regular,
      precio_oferta:         o.precio_oferta,
    })
    setEanQuery(o.ean || '')
    setEanSuggestions([])
    setFormError('')
    setModalOpen(true)
  }

  const closeModal = () => { setModalOpen(false); setEditTarget(null) }

  const setF = (key: keyof typeof EMPTY_FORM, val: string) => {
    setForm(f => {
      const next = { ...f, [key]: val }
      // Auto-calc baseline_diario from baseline_mensual
      if (key === 'baseline_mensual') {
        const m = Number(val)
        next.baseline_diario = isNaN(m) || !m ? '' : (m / 30).toFixed(4)
      }
      return next
    })
  }

  // ── Computed preview ───────────────────────────────────────────────────────

  const previewDias    = calcDias(form.periodo_oferta_inicio, form.periodo_oferta_fin)
  const previewDescPct = calcDescPct(form.precio_regular, form.precio_oferta)
  const previewDescAbs = calcDescAbs(form.precio_regular, form.precio_oferta)
  const previewIncPct  = calcIncrementalPct(form.precio_regular, form.precio_oferta)
  const previewInv     = calcInversion(previewDias, form.baseline_diario, form.precio_regular, form.precio_oferta)

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setFormError('')
    if (!form.cliente.trim())           { setFormError('El campo Cliente es requerido');         return }
    if (!form.periodo_oferta_inicio)    { setFormError('Fecha de inicio requerida');             return }
    if (!form.periodo_oferta_fin)       { setFormError('Fecha de fin requerida');                return }
    if (form.periodo_oferta_fin < form.periodo_oferta_inicio)
      { setFormError('La fecha de fin debe ser posterior a la de inicio'); return }

    setSaving(true)
    try {
      const url    = editTarget ? `/api/ofertas/${editTarget.id}` : '/api/ofertas'
      const method = editTarget ? 'PATCH' : 'POST'
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          baseline_mensual: Number(form.baseline_mensual) || 0,
          baseline_diario:  Number(form.baseline_diario)  || 0,
          precio_regular:   Number(form.precio_regular)   || 0,
          precio_oferta:    Number(form.precio_oferta)    || 0,
        }),
      })
      const j = await res.json()
      if (!res.ok) { setFormError(j.error || 'Error al guardar'); return }
      closeModal()
      fetchOfertas(page, buscar)
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/ofertas/${deleteTarget.id}`, { method: 'DELETE' })
      if (res.ok) {
        setDeleteTarget(null)
        fetchOfertas(page, buscar)
      }
    } finally {
      setDeleting(false)
    }
  }

  // ── Pagination ─────────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(total / limit))

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Dimensiones</p>
          <h1 className="text-2xl font-bold text-gray-800">Ofertas</h1>
          <p className="text-sm text-gray-400 mt-1">Gestión de ofertas y promociones comerciales</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white shadow-sm"
            style={{ background: '#c8873a' }}>
            <Plus size={14} />
            Nueva Oferta
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Ofertas',       val: loading ? '…' : total },
          { label: 'Inversión Total',      val: loading ? '…' : fmtUSD(ofertas.reduce((s, o) => s + (Number(o.inversion) || calcInversion(Number(o.dias_oferta), String(o.baseline_diario), String(o.precio_regular), String(o.precio_oferta)) || 0), 0)) },
          { label: 'Descuento Promedio',  val: loading ? '…' : (ofertas.length ? Math.round(ofertas.reduce((s, o) => s + Number(o.descuento_porcentaje || 0), 0) / ofertas.length) + '%' : '—') },
          { label: 'Días Promedio',       val: loading ? '…' : (ofertas.length ? Math.round(ofertas.reduce((s, o) => s + Number(o.dias_oferta || 0), 0) / ofertas.length) + ' días' : '—') },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">{k.label}</p>
            <p className="text-2xl font-bold text-gray-800">{k.val}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={buscar}
            onChange={e => onSearch(e.target.value)}
            placeholder="Buscar por cliente, EAN o descripción…"
            className="w-full text-sm border border-gray-200 rounded-lg pl-9 pr-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-700">
            Registro de Ofertas
            {!loading && <span className="ml-2 text-sm font-normal text-gray-400">{total} oferta{total !== 1 ? 's' : ''}</span>}
          </h3>
        </div>

        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="flex items-center gap-2 text-gray-300 text-sm">
              <RefreshCw size={16} className="animate-spin" /> Cargando…
            </div>
          </div>
        ) : ofertas.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center gap-3 text-gray-400">
            <Tag size={32} className="text-gray-200" />
            <p className="text-sm">No hay ofertas registradas</p>
            <button onClick={openCreate}
              className="text-sm px-4 py-2 rounded-lg text-white font-medium"
              style={{ background: '#c8873a' }}>
              Crear primera oferta
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase tracking-widest border-b border-gray-100">
                    <th className="text-left py-2 pr-3">Cliente</th>
                    <th className="text-left py-2 pr-3">EAN / Cód.</th>
                    <th className="text-left py-2 pr-3">Descripción</th>
                    <th className="text-left py-2 pr-3">Período</th>
                    <th className="text-right py-2 pr-3">Días</th>
                    <th className="text-right py-2 pr-3">P. Regular</th>
                    <th className="text-right py-2 pr-3">P. Oferta</th>
                    <th className="text-right py-2 pr-3">Desc.%</th>
                    <th className="text-right py-2 pr-3">Incremental %</th>
                    <th className="text-right py-2">Inversión</th>
                    <th className="py-2 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {ofertas.map(o => {
                    const rowIncPct = Number(o.incremental_pct) ||
                      calcIncrementalPct(String(o.precio_regular), String(o.precio_oferta))
                    const rowInv = Number(o.inversion) ||
                      calcInversion(Number(o.dias_oferta), String(o.baseline_diario), String(o.precio_regular), String(o.precio_oferta))
                    return (
                      <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="py-2.5 pr-3 font-medium text-gray-800 max-w-[120px] truncate">{o.cliente}</td>
                        <td className="py-2.5 pr-3">
                          <div className="font-mono text-xs text-gray-500">{o.ean || '—'}</div>
                          {o.codigo_interno && <div className="text-[10px] text-gray-400">{o.codigo_interno}</div>}
                        </td>
                        <td className="py-2.5 pr-3 text-gray-600 max-w-[160px] truncate text-xs">{o.descripcion || '—'}</td>
                        <td className="py-2.5 pr-3 text-xs text-gray-500 whitespace-nowrap">
                          <span>{fmtDate(o.periodo_oferta_inicio)}</span>
                          <span className="text-gray-300 mx-1">→</span>
                          <span>{fmtDate(o.periodo_oferta_fin)}</span>
                        </td>
                        <td className="py-2.5 pr-3 text-right">
                          <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full font-medium">
                            {o.dias_oferta}d
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-right text-gray-600 font-mono text-xs">{fmtUSD(o.precio_regular)}</td>
                        <td className="py-2.5 pr-3 text-right text-gray-600 font-mono text-xs">{fmtUSD(o.precio_oferta)}</td>
                        <td className="py-2.5 pr-3 text-right">
                          <span className="text-amber-600 font-semibold text-xs">
                            {fmtNum(o.descuento_porcentaje, 0)}%
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-right text-amber-600 font-semibold text-xs">
                          {rowIncPct !== null ? fmtNum(rowIncPct, 2) + '%' : '—'}
                        </td>
                        <td className="py-2.5 text-right font-semibold text-xs text-gray-800">
                          {rowInv !== null ? fmtUSD(rowInv) : '—'}
                        </td>
                        <td className="py-2.5">
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={() => openAnalisis(o)}
                              title="Ver análisis de ventas"
                              className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors">
                              <BarChart2 size={12} />
                            </button>
                            <button onClick={() => openEdit(o)}
                              className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                              <Pencil size={12} />
                            </button>
                            <button onClick={() => setDeleteTarget(o)}
                              className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-400">
                  Página {page} de {totalPages} · {total} registros
                </p>
                <div className="flex items-center gap-1">
                  <button onClick={() => { const p = Math.max(1, page - 1); setPage(p); fetchOfertas(p, buscar) }}
                    disabled={page === 1}
                    className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
                    <ChevronLeft size={14} className="text-gray-600" />
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pg = Math.min(Math.max(page - 2, 1) + i, totalPages)
                    return (
                      <button key={pg} onClick={() => { setPage(pg); fetchOfertas(pg, buscar) }}
                        className={`w-7 h-7 text-xs rounded transition-colors font-medium
                          ${pg === page ? 'text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                        style={pg === page ? { background: '#c8873a' } : {}}>
                        {pg}
                      </button>
                    )
                  })}
                  <button onClick={() => { const p = Math.min(totalPages, page + 1); setPage(p); fetchOfertas(p, buscar) }}
                    disabled={page === totalPages}
                    className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
                    <ChevronRight size={14} className="text-gray-600" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Create / Edit Modal ───────────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <h2 className="font-bold text-gray-800 text-[15px]">
                  {editTarget ? 'Editar Oferta' : 'Nueva Oferta'}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {editTarget ? `ID #${editTarget.id}` : 'Complete los datos de la oferta'}
                </p>
              </div>
              <button onClick={closeModal} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400">
                <X size={16} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">

              {formError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
                  <AlertTriangle size={14} />
                  {formError}
                </div>
              )}

              {/* Cliente */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Cliente <span className="text-red-400">*</span>
                </label>
                <input value={form.cliente} onChange={e => setF('cliente', e.target.value)}
                  placeholder="Nombre del cliente / cadena"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              {/* EAN autocomplete */}
              <div ref={eanRef}>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  EAN / Código de barras
                </label>
                <div className="relative">
                  <input
                    value={eanQuery}
                    onChange={e => searchEan(e.target.value)}
                    placeholder="Buscar por EAN, SKU o descripción…"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  {eanLoading && (
                    <RefreshCw size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
                  )}
                  {eanSuggestions.length > 0 && (
                    <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                      {eanSuggestions.map((s, i) => (
                        <button key={i} onClick={() => selectEan(s)}
                          className="w-full text-left px-4 py-2.5 hover:bg-amber-50 transition-colors border-b border-gray-50 last:border-0">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                              {s.ean || s.codigo_interno || '—'}
                            </span>
                            <span className="text-sm text-gray-700 truncate">{s.descripcion}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Código interno + Descripción */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Código Interno</label>
                  <input value={form.codigo_interno} onChange={e => setF('codigo_interno', e.target.value)}
                    placeholder="SKU interno"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Descripción</label>
                  <input value={form.descripcion} onChange={e => setF('descripcion', e.target.value)}
                    placeholder="Nombre del producto"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>

              {/* Período */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Período de Oferta <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1">Inicio</p>
                    <input type="date" value={form.periodo_oferta_inicio}
                      onChange={e => setF('periodo_oferta_inicio', e.target.value)}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1">Fin</p>
                    <input type="date" value={form.periodo_oferta_fin}
                      onChange={e => setF('periodo_oferta_fin', e.target.value)}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                </div>
              </div>

              {/* Precios */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Precio Regular</label>
                  <input type="number" min="0" step="0.01" value={form.precio_regular}
                    onChange={e => setF('precio_regular', e.target.value)}
                    placeholder="0.00"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Precio Oferta</label>
                  <input type="number" min="0" step="0.01" value={form.precio_oferta}
                    onChange={e => setF('precio_oferta', e.target.value)}
                    placeholder="0.00"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>

              {/* Baseline Mensual */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Baseline Mensual</label>
                <input type="number" min="0" step="1" value={form.baseline_mensual}
                  onChange={e => setF('baseline_mensual', e.target.value)}
                  placeholder="Unidades / mes"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                {form.baseline_diario && (
                  <p className="text-[10px] text-gray-400 mt-1">
                    Diario auto: {Number(form.baseline_diario).toFixed(2)} uds/día
                  </p>
                )}
              </div>

              {/* Calculated fields preview */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Campos calculados</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <CalcBadge label="Días Oferta"    value={previewDias}    suffix=" días" />
                  <CalcBadge label="Desc. %"         value={previewDescPct} suffix="%" dec={0} />
                  <CalcBadge label="Desc. Absoluto"  value={previewDescAbs} prefix="$" />
                  <CalcBadge label="Incremental %"   value={previewIncPct}  suffix="%" />
                  <CalcBadge label="Inversión"       value={previewInv}     prefix="$" />
                </div>
              </div>

            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
              <button onClick={closeModal}
                className="px-5 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-60"
                style={{ background: '#c8873a' }}>
                {saving
                  ? <><RefreshCw size={13} className="animate-spin" /> Guardando…</>
                  : <><Check size={13} /> {editTarget ? 'Guardar cambios' : 'Crear oferta'}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ────────────────────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={18} className="text-red-500" />
              </div>
              <div>
                <h3 className="font-bold text-gray-800">Eliminar oferta</h3>
                <p className="text-xs text-gray-400 mt-0.5">Esta acción no se puede deshacer</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-1">
              ¿Eliminar la oferta de <span className="font-semibold">{deleteTarget.cliente}</span>?
            </p>
            {deleteTarget.descripcion && (
              <p className="text-xs text-gray-400 mb-5">{deleteTarget.descripcion}</p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
                Cancelar
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors disabled:opacity-60">
                {deleting ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Panel Análisis ─────────────────────────────────────────────────────── */}
      {analisisTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">

            {/* Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-gray-400 font-medium">Análisis de Ventas</p>
                <h2 className="font-bold text-gray-800 text-[15px] mt-0.5">
                  {analisisTarget.descripcion || analisisTarget.cliente}
                </h2>
                <p className="text-xs text-gray-400">
                  {analisisTarget.cliente} · EAN {analisisTarget.ean} · {fmtDate(analisisTarget.periodo_oferta_inicio)} → {fmtDate(analisisTarget.periodo_oferta_fin)}
                </p>
              </div>
              <button onClick={() => { setAnalisisTarget(null); setAnalisisData(null) }}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 mt-0.5">
                <X size={16} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-6">
              {analisisLoading && (
                <div className="h-40 flex items-center justify-center text-gray-400 text-sm animate-pulse">
                  Cargando análisis…
                </div>
              )}
              {analisisError && (
                <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-3 text-sm">
                  {analisisError}
                </div>
              )}
              {analisisData && !analisisLoading && (() => {
                const d   = analisisData
                const dur  = d.durante
                const hist = d.historico
                const cmp  = d.comparativa
                const hasDurante  = dur.dias_con_datos > 0
                const hasHistorico = hist.meses.length > 0
                const ML: Record<number,string> = {1:'Ene',2:'Feb',3:'Mar',4:'Abr',5:'May',6:'Jun',7:'Jul',8:'Ago',9:'Sep',10:'Oct',11:'Nov',12:'Dic'}

                const chartData = [
                  ...[...hist.meses].reverse().map((m: any) => ({
                    label: `${ML[m.mes]} ${String(m.ano).slice(2)}`,
                    uds: Number(m.uds_diario),
                    tipo: 'hist',
                  })),
                  { label: 'Baseline', uds: Number(d.oferta.baseline_diario), tipo: 'base' },
                  ...(hasDurante ? [{ label: 'Oferta', uds: dur.uds_diario, tipo: 'oferta' }] : []),
                ]

                const VarBadge = ({ v }: { v: number | null }) => {
                  if (v === null) return <span className="text-gray-400 text-xs">—</span>
                  const pos = v >= 0
                  return (
                    <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${pos ? 'text-green-600' : 'text-red-500'}`}>
                      {pos ? <ArrowUpRight size={11}/> : <ArrowDownRight size={11}/>}
                      {Math.abs(v).toFixed(1)}%
                    </span>
                  )
                }

                return (
                  <>
                    {!hasDurante && (
                      <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-4 py-3 text-sm">
                        No hay datos de ventas durante el período de oferta aún. El análisis muestra el histórico y la proyección vs baseline.
                      </div>
                    )}

                    {/* ── A: vs Baseline ── */}
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">A · Comparativa vs Baseline declarado</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          { label: 'Baseline diario', val: `${fmtNum(d.oferta.baseline_diario,1)} uds`, sub: `${fmtUSD(d.oferta.baseline_diario)} / día`, color: 'gray' },
                          { label: `Uds esperadas (${d.oferta.dias_oferta}d)`, val: cmp.uds_esperadas.toLocaleString('en-US',{maximumFractionDigits:0}), sub: 'baseline × días oferta', color: 'gray' },
                          { label: 'Uds reales', val: hasDurante ? cmp.uds_reales.toLocaleString() : '—', sub: hasDurante ? null : 'Sin datos aún', badge: hasDurante ? cmp.vs_baseline_uds_pct : null, color: hasDurante ? 'blue' : 'gray' },
                          { label: 'Uds incrementales', val: hasDurante ? (cmp.uds_incrementales >= 0 ? '+' : '') + cmp.uds_incrementales.toLocaleString('en-US',{maximumFractionDigits:0}) : '—', sub: 'reales − esperadas', color: hasDurante ? (cmp.uds_incrementales >= 0 ? 'green' : 'red') : 'gray' },
                        ].map(({ label, val, sub, badge, color }) => (
                          <div key={label} className={`rounded-xl p-4 border ${color==='blue'?'bg-blue-50 border-blue-100':color==='green'?'bg-green-50 border-green-100':color==='red'?'bg-red-50 border-red-100':'bg-gray-50 border-gray-100'}`}>
                            <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium mb-1">{label}</p>
                            <p className={`text-lg font-bold ${color==='blue'?'text-blue-700':color==='green'?'text-green-700':color==='red'?'text-red-600':'text-gray-800'}`}>{val}</p>
                            <p className="text-[11px] text-gray-400 mt-0.5">{badge !== undefined && badge !== null ? <VarBadge v={badge} /> : sub}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* ── B: vs Histórico ── */}
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">B · Comparativa vs Meses anteriores</h3>
                      {!hasHistorico ? (
                        <p className="text-sm text-gray-400">Sin historial de ventas previo para este EAN en la base de datos.</p>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                            {[
                              { label: 'Prom. diario hist.', val: `${fmtNum(hist.prom_uds_diario,1)} uds`, sub: `${hist.meses.length} mes(es)`, color: 'gray' },
                              { label: 'Prom. diario oferta', val: hasDurante ? `${fmtNum(dur.uds_diario,1)} uds` : '—', badge: hasDurante ? cmp.inc_uds_pct : null, color: hasDurante ? 'blue' : 'gray' },
                              { label: 'Valor diario hist.', val: fmtUSD(hist.prom_val_diario), sub: 'USD / día', color: 'gray' },
                              { label: 'Valor diario oferta', val: hasDurante ? fmtUSD(dur.val_diario) : '—', badge: hasDurante ? cmp.inc_val_pct : null, color: hasDurante ? 'blue' : 'gray' },
                            ].map(({ label, val, sub, badge, color }) => (
                              <div key={label} className={`rounded-xl p-4 border ${color==='blue'?'bg-blue-50 border-blue-100':'bg-gray-50 border-gray-100'}`}>
                                <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium mb-1">{label}</p>
                                <p className={`text-lg font-bold ${color==='blue'?'text-blue-700':'text-gray-800'}`}>{val}</p>
                                <p className="text-[11px] text-gray-400 mt-0.5">{badge !== undefined && badge !== null ? <VarBadge v={badge} /> : sub}</p>
                              </div>
                            ))}
                          </div>

                          {/* Gráfico */}
                          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 mb-4">
                            <p className="text-[11px] uppercase tracking-widest text-gray-400 font-medium mb-3">Unidades / día promedio por período</p>
                            <ResponsiveContainer width="100%" height={200}>
                              <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={36} />
                                <Tooltip formatter={(v: any) => [`${Number(v).toFixed(1)} uds/día`]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                                <Bar dataKey="uds" name="Uds/día" radius={[4,4,0,0]} maxBarSize={48}
                                  label={{ position: 'top', fontSize: 10, fill: '#6b7280', formatter: (v: any) => Number(v).toFixed(1) }}>
                                  {chartData.map((entry, i) => (
                                    <Cell key={i} fill={entry.tipo==='oferta'?'#3b82f6':entry.tipo==='base'?'#f59e0b':'#c8873a'} />
                                  ))}
                                </Bar>
                              </ComposedChart>
                            </ResponsiveContainer>
                            <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-400">
                              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{background:'#c8873a'}}/>Histórico</span>
                              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{background:'#f59e0b'}}/>Baseline</span>
                              {hasDurante && <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{background:'#3b82f6'}}/>Oferta</span>}
                            </div>
                          </div>

                          {/* Tabla */}
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-400 uppercase tracking-widest border-b border-gray-100">
                                <th className="text-left py-2 pr-4">Período</th>
                                <th className="text-right py-2 pr-4">Días</th>
                                <th className="text-right py-2 pr-4">Unidades</th>
                                <th className="text-right py-2 pr-4">Uds/día</th>
                                <th className="text-right py-2 pr-4">Valor</th>
                                <th className="text-right py-2">USD/día</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...hist.meses].reverse().map((m: any, i: number) => (
                                <tr key={i} className="border-b border-gray-50">
                                  <td className="py-2 pr-4 font-medium text-gray-700">{ML[m.mes]} {m.ano}</td>
                                  <td className="py-2 pr-4 text-right text-gray-500">{m.dias_con_venta}</td>
                                  <td className="py-2 pr-4 text-right text-gray-700">{Number(m.unidades).toLocaleString()}</td>
                                  <td className="py-2 pr-4 text-right font-semibold text-amber-700">{Number(m.uds_diario).toFixed(1)}</td>
                                  <td className="py-2 pr-4 text-right text-gray-600">{fmtUSD(m.valor)}</td>
                                  <td className="py-2 text-right text-gray-600">{fmtUSD(m.valor_diario)}</td>
                                </tr>
                              ))}
                              {hasDurante && (
                                <tr className="border-t-2 border-blue-200 bg-blue-50 font-semibold">
                                  <td className="py-2 pr-4 text-blue-700">Período oferta</td>
                                  <td className="py-2 pr-4 text-right text-blue-600">{dur.dias_con_datos}</td>
                                  <td className="py-2 pr-4 text-right text-blue-700">{dur.unidades.toLocaleString()}</td>
                                  <td className="py-2 pr-4 text-right text-blue-700">{fmtNum(dur.uds_diario,1)}</td>
                                  <td className="py-2 pr-4 text-right text-blue-700">{fmtUSD(dur.valor)}</td>
                                  <td className="py-2 text-right text-blue-700">{fmtUSD(dur.val_diario)}</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </>
                      )}
                    </div>
                  </>
                )
              })()}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
