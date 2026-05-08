/*
SQL para crear la tabla config_reportes:

CREATE TABLE config_reportes (
  id               BIGSERIAL PRIMARY KEY,
  nombre           VARCHAR NOT NULL,
  tipo_reporte     VARCHAR NOT NULL,
  canales          VARCHAR[] DEFAULT '{}',
  destinatarios    JSONB DEFAULT '[]',
  formato          VARCHAR DEFAULT 'excel',
  frecuencia       VARCHAR NOT NULL,
  cron_expresion   VARCHAR,
  dia_semana       INT,
  dia_mes          INT,
  hora_envio       TIME,
  filtros          JSONB DEFAULT '{}',
  activo           BOOLEAN DEFAULT true,
  ultima_ejecucion TIMESTAMPTZ,
  ultimo_status    VARCHAR,
  ultimo_mensaje   TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
*/

'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, Pencil, Trash2, X, Send, Mail, MessageCircle,
  Loader2, ChevronDown, AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── TypeScript interfaces ────────────────────────────────────────────────────

interface Destinatario {
  nombre: string
  email?: string
  telefono?: string
  canales: string[]
}

interface Reporte {
  id: number
  nombre: string
  tipo_reporte: string
  canales: string[]
  destinatarios: Destinatario[]
  formato: string
  frecuencia: string
  cron_expresion: string | null
  dia_semana: number | null
  dia_mes: number | null
  hora_envio: string | null
  filtros: any
  activo: boolean
  ultima_ejecucion: string | null
  ultimo_status: string | null
  ultimo_mensaje: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIPO_LABELS: Record<string, string> = {
  ventas_por_pais:    'Ventas por País',
  top_productos:      'Top Productos',
  kpis_resumen:       'KPIs Resumen',
  top_tiendas:        'Top Tiendas',
  cobertura_quiebres: 'Cobertura / Quiebres',
}

const DIAS_SEMANA = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
]

const PAISES_OPTS  = ['CR', 'GT', 'SV', 'NI', 'HN', 'CO']
const CATEG_OPTS   = ['Queso', 'Leche', 'Helado']
const PERIODO_OPTS = [
  { value: 'ultimo_mes',       label: 'Último mes' },
  { value: 'ultima_semana',    label: 'Última semana' },
  { value: 'ultimo_trimestre', label: 'Último trimestre' },
]

const EMPTY_FORM = {
  nombre:        '',
  tipo_reporte:  'ventas_por_pais',
  canales:       [] as string[],
  destinatarios: [] as Destinatario[],
  formato:       'excel',
  frecuencia:    'diario',
  dias_semana:   [1] as number[],
  dia_mes:       1 as number | null,
  hora_envio:    '08:00',
  filtros:       { pais: [] as string[], categoria: [] as string[], periodo: '' },
  activo:        true,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildCron(
  frecuencia: string,
  diasSemana: number[],
  diaMes: number | null,
  horaEnvio: string,
): string {
  const [hh, mm] = (horaEnvio || '08:00').split(':')
  if (frecuencia === 'diario')  return `${mm} ${hh} * * *`
  if (frecuencia === 'semanal') return `${mm} ${hh} * * ${(diasSemana.length ? diasSemana : [1]).sort().join(',')}`
  if (frecuencia === 'mensual') return `${mm} ${hh} ${diaMes ?? 1} * *`
  return ''
}

function cronHuman(
  frecuencia: string,
  diasSemana: number[],
  diaMes: number | null,
  horaEnvio: string,
): string {
  const hora = horaEnvio || '08:00'
  if (frecuencia === 'diario')
    return `Todos los días a las ${hora}`
  if (frecuencia === 'semanal') {
    const dias = (diasSemana.length ? diasSemana : [1])
      .sort()
      .map(v => DIAS_SEMANA.find(d => d.value === v)?.label ?? String(v))
      .join(', ')
    return `Cada ${dias} a las ${hora}`
  }
  if (frecuencia === 'mensual')
    return `El día ${diaMes ?? 1} de cada mes a las ${hora}`
  return ''
}

function formatDate(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('es-CR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function toggleArr<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FrecuenciaBadge({ frecuencia }: { frecuencia: string }) {
  const map: Record<string, string> = {
    diario:   'bg-blue-100 text-blue-700',
    semanal:  'bg-purple-100 text-purple-700',
    mensual:  'bg-amber-100 text-amber-700',
  }
  const labels: Record<string, string> = {
    diario: 'Diario', semanal: 'Semanal', mensual: 'Mensual',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[frecuencia] ?? 'bg-gray-100 text-gray-600'}`}>
      {labels[frecuencia] ?? frecuencia}
    </span>
  )
}

function TipoBadge({ tipo }: { tipo: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
      {TIPO_LABELS[tipo] ?? tipo}
    </span>
  )
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-gray-400 text-xs">—</span>
  const map: Record<string, string> = {
    ok:    'bg-green-100 text-green-700',
    error: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReporteriaPage() {
  const supabase = createClient()

  const [authorized,  setAuthorized]  = useState<boolean | null>(null)
  const [reportes,    setReportes]    = useState<Reporte[]>([])
  const [loading,     setLoading]     = useState(true)
  const [modal,       setModal]       = useState<'create' | 'edit' | null>(null)
  const [selected,    setSelected]    = useState<Reporte | null>(null)
  const [form,        setForm]        = useState({ ...EMPTY_FORM })
  const [saving,      setSaving]      = useState(false)
  const [confirmDel,  setConfirmDel]  = useState<number | null>(null)
  const [deleting,    setDeleting]    = useState(false)
  const [running,     setRunning]     = useState<number | null>(null)

  // ── Auth check ─────────────────────────────────────────────────────────────
  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setAuthorized(false); return }
      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', user.id).single()
      setAuthorized(profile?.role === 'superadmin')
    })()
  }, [])

  // ── Load reportes ──────────────────────────────────────────────────────────
  const loadReportes = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/config-reportes')
      const json = await res.json()
      setReportes(json.reportes ?? [])
    } catch {
      toast.error('Error cargando reportes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authorized) loadReportes()
  }, [authorized])

  // ── Modal helpers ──────────────────────────────────────────────────────────
  const openCreate = () => {
    setForm({ ...EMPTY_FORM, canales: [], destinatarios: [], filtros: { pais: [], categoria: [], periodo: '' } })
    setSelected(null)
    setModal('create')
  }

  const openEdit = (r: Reporte) => {
    setForm({
      nombre:        r.nombre,
      tipo_reporte:  r.tipo_reporte,
      canales:       r.canales ?? [],
      destinatarios: r.destinatarios ?? [],
      formato:       r.formato ?? 'excel',
      frecuencia:    r.frecuencia,
      dias_semana:   r.dia_semana != null ? [r.dia_semana] : [1],
      dia_mes:       r.dia_mes,
      hora_envio:    r.hora_envio ?? '08:00',
      filtros: {
        pais:      r.filtros?.pais      ?? [],
        categoria: r.filtros?.categoria ?? [],
        periodo:   r.filtros?.periodo   ?? '',
      },
      activo: r.activo,
    })
    setSelected(r)
    setModal('edit')
  }

  const closeModal = () => {
    setModal(null)
    setSelected(null)
  }

  // ── Form field helpers ─────────────────────────────────────────────────────
  const setField = (key: string, value: any) =>
    setForm(f => ({ ...f, [key]: value }))

  const setFiltro = (key: string, value: any) =>
    setForm(f => ({ ...f, filtros: { ...f.filtros, [key]: value } }))

  const toggleCanal = (canal: string) =>
    setField('canales', toggleArr(form.canales, canal))

  const addDestinatario = () =>
    setField('destinatarios', [
      ...form.destinatarios,
      { nombre: '', email: '', telefono: '', canales: [] },
    ])

  const removeDestinatario = (idx: number) =>
    setField('destinatarios', form.destinatarios.filter((_, i) => i !== idx))

  const updateDestinatario = (idx: number, key: string, value: any) =>
    setField(
      'destinatarios',
      form.destinatarios.map((d, i) => i === idx ? { ...d, [key]: value } : d),
    )

  const toggleDestCanal = (idx: number, canal: string) =>
    updateDestinatario(idx, 'canales', toggleArr(form.destinatarios[idx].canales, canal))

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.nombre.trim()) { toast.error('El nombre es requerido'); return }
    if (form.canales.length === 0) { toast.error('Selecciona al menos un canal'); return }

    const cronExpr = buildCron(form.frecuencia, form.dias_semana, form.dia_mes, form.hora_envio)
    const payload = { ...form, cron_expresion: cronExpr, dia_semana: form.dias_semana[0] ?? 1 }

    setSaving(true)
    try {
      if (modal === 'create') {
        const res  = await fetch('/api/config-reportes', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Error creando reporte')
        toast.success('Reporte creado')
      } else if (modal === 'edit' && selected) {
        const res  = await fetch(`/api/config-reportes/${selected.id}`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Error actualizando reporte')
        toast.success('Reporte actualizado')
      }
      closeModal()
      loadReportes()
    } catch (e: any) {
      toast.error(e.message ?? 'Error guardando')
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = async (id: number) => {
    setDeleting(true)
    try {
      const res  = await fetch(`/api/config-reportes/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error eliminando')
      toast.success('Reporte eliminado')
      setConfirmDel(null)
      loadReportes()
    } catch (e: any) {
      toast.error(e.message ?? 'Error eliminando')
    } finally {
      setDeleting(false)
    }
  }

  // ── Run now ─────────────────────────────────────────────────────────────────
  const handleRun = async (id: number) => {
    setRunning(id)
    try {
      const res  = await fetch(`/api/reportes/run/${id}`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.mensaje ?? 'Error ejecutando')
      toast.success(json.mensaje ?? 'Reporte enviado')
      loadReportes()
    } catch (e: any) {
      toast.error(e.message ?? 'Error al enviar')
    } finally {
      setRunning(null)
    }
  }

  // ── Computed cron display ───────────────────────────────────────────────────
  const cronExpr   = buildCron(form.frecuencia, form.dias_semana, form.dia_mes, form.hora_envio)
  const cronText   = cronHuman(form.frecuencia, form.dias_semana, form.dia_mes, form.hora_envio)

  // ── Render guards ───────────────────────────────────────────────────────────
  if (authorized === null) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-gray-400" size={28} />
      </div>
    )
  }

  if (authorized === false) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertTriangle className="text-amber-400" size={36} />
        <p className="text-gray-600 font-medium">Sin acceso — solo superadmin</p>
      </div>
    )
  }

  // ── Main render ─────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Configuraciones</p>
          <h1 className="text-2xl font-bold text-gray-800">Reportería Automática</h1>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={16} />
          Nuevo Reporte
        </button>
      </div>

      {/* Table card */}
      <div className="rounded-xl border border-gray-100 shadow-sm bg-white overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="animate-spin text-gray-400" size={24} />
          </div>
        ) : reportes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2">
            <p className="text-sm">No hay reportes configurados</p>
            <button onClick={openCreate} className="text-amber-500 text-sm hover:underline">
              Crear el primero
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Nombre', 'Tipo', 'Canales', 'Frecuencia', 'Estado', 'Último Status', 'Última Ejecución', 'Acciones'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {reportes.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    {/* Nombre */}
                    <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{r.nombre}</td>

                    {/* Tipo */}
                    <td className="px-4 py-3">
                      <TipoBadge tipo={r.tipo_reporte} />
                    </td>

                    {/* Canales */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {r.canales?.includes('email') && (
                          <span title="Email"><Mail size={15} className="text-blue-500" /></span>
                        )}
                        {r.canales?.includes('whatsapp') && (
                          <span title="WhatsApp"><MessageCircle size={15} className="text-green-500" /></span>
                        )}
                        {!r.canales?.length && <span className="text-gray-400">—</span>}
                      </div>
                    </td>

                    {/* Frecuencia */}
                    <td className="px-4 py-3">
                      <FrecuenciaBadge frecuencia={r.frecuencia} />
                    </td>

                    {/* Estado */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${r.activo ? 'text-green-600' : 'text-gray-400'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${r.activo ? 'bg-green-500' : 'bg-gray-300'}`} />
                        {r.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>

                    {/* Último status */}
                    <td className="px-4 py-3">
                      <StatusBadge status={r.ultimo_status} />
                    </td>

                    {/* Última ejecución */}
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                      {formatDate(r.ultima_ejecucion)}
                    </td>

                    {/* Acciones */}
                    <td className="px-4 py-3">
                      {confirmDel === r.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-red-600 font-medium">¿Eliminar?</span>
                          <button
                            onClick={() => handleDelete(r.id)}
                            disabled={deleting}
                            className="text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                          >
                            {deleting ? '...' : 'Sí'}
                          </button>
                          <button
                            onClick={() => setConfirmDel(null)}
                            className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          {/* Enviar ahora */}
                          <button
                            onClick={() => handleRun(r.id)}
                            disabled={running === r.id}
                            title="Enviar ahora"
                            className="p-1.5 rounded-md text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-40"
                          >
                            {running === r.id
                              ? <Loader2 size={14} className="animate-spin" />
                              : <Send size={14} />}
                          </button>
                          {/* Editar */}
                          <button
                            onClick={() => openEdit(r)}
                            title="Editar"
                            className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <Pencil size={14} />
                          </button>
                          {/* Eliminar */}
                          <button
                            onClick={() => setConfirmDel(r.id)}
                            title="Eliminar"
                            className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal ──────────────────────────────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 pb-6 px-4 bg-black/40 overflow-y-auto">
          <div className="relative w-full max-w-3xl bg-white rounded-xl shadow-xl">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800">
                {modal === 'create' ? 'Nuevo Reporte' : 'Editar Reporte'}
              </h2>
              <button
                onClick={closeModal}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-8 max-h-[calc(100vh-12rem)] overflow-y-auto">

              {/* ── Sección 1: Básico ─────────────────────────────────────── */}
              <section>
                <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-1 border-b border-gray-100">
                  1. Básico
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Nombre */}
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Nombre <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.nombre}
                      onChange={e => setField('nombre', e.target.value)}
                      placeholder="Ej: Reporte semanal de ventas CR"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>

                  {/* Tipo de reporte */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de reporte</label>
                    <div className="relative">
                      <select
                        value={form.tipo_reporte}
                        onChange={e => setField('tipo_reporte', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                      >
                        {Object.entries(TIPO_LABELS).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                  </div>

                  {/* Activo */}
                  <div className="flex items-center gap-3 pt-5">
                    <button
                      type="button"
                      onClick={() => setField('activo', !form.activo)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${form.activo ? 'bg-amber-500' : 'bg-gray-200'}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.activo ? 'translate-x-6' : 'translate-x-1'}`}
                      />
                    </button>
                    <span className="text-sm text-gray-600">{form.activo ? 'Activo' : 'Inactivo'}</span>
                  </div>
                </div>
              </section>

              {/* ── Sección 2: Canales ────────────────────────────────────── */}
              <section>
                <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-1 border-b border-gray-100">
                  2. Canales de envío
                </h3>
                <div className="flex items-center gap-6">
                  {/* Email */}
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.canales.includes('email')}
                      onChange={() => toggleCanal('email')}
                      className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-400"
                    />
                    <Mail size={16} className="text-blue-500" />
                    <span className="text-sm text-gray-700">Email</span>
                  </label>
                  {/* WhatsApp */}
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.canales.includes('whatsapp')}
                      onChange={() => toggleCanal('whatsapp')}
                      className="w-4 h-4 rounded border-gray-300 text-green-500 focus:ring-green-400"
                    />
                    <MessageCircle size={16} className="text-green-500" />
                    <span className="text-sm text-gray-700">WhatsApp</span>
                  </label>
                </div>
              </section>

              {/* ── Sección 3: Destinatarios ──────────────────────────────── */}
              <section>
                <div className="flex items-center justify-between mb-4 pb-1 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700">3. Destinatarios</h3>
                  <button
                    type="button"
                    onClick={addDestinatario}
                    className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700"
                  >
                    <Plus size={13} /> Agregar
                  </button>
                </div>

                {form.destinatarios.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">Sin destinatarios. Haz clic en "Agregar".</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-gray-100">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Nombre</th>
                          {form.canales.includes('email')    && <th className="text-left px-3 py-2 font-medium text-gray-500">Email</th>}
                          {form.canales.includes('whatsapp') && <th className="text-left px-3 py-2 font-medium text-gray-500">Teléfono</th>}
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Canales</th>
                          <th className="px-2 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {form.destinatarios.map((d, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={d.nombre}
                                onChange={e => updateDestinatario(idx, 'nombre', e.target.value)}
                                placeholder="Nombre"
                                className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                              />
                            </td>
                            {form.canales.includes('email') && (
                              <td className="px-3 py-2">
                                <input
                                  type="email"
                                  value={d.email ?? ''}
                                  onChange={e => updateDestinatario(idx, 'email', e.target.value)}
                                  placeholder="correo@ejemplo.com"
                                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                                />
                              </td>
                            )}
                            {form.canales.includes('whatsapp') && (
                              <td className="px-3 py-2">
                                <input
                                  type="tel"
                                  value={d.telefono ?? ''}
                                  onChange={e => updateDestinatario(idx, 'telefono', e.target.value)}
                                  placeholder="+50688880000"
                                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400"
                                />
                              </td>
                            )}
                            {/* Canales por destinatario */}
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-3">
                                {form.canales.includes('email') && (
                                  <label className="flex items-center gap-1 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={d.canales.includes('email')}
                                      onChange={() => toggleDestCanal(idx, 'email')}
                                      className="w-3 h-3"
                                    />
                                    <Mail size={12} className="text-blue-500" />
                                  </label>
                                )}
                                {form.canales.includes('whatsapp') && (
                                  <label className="flex items-center gap-1 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={d.canales.includes('whatsapp')}
                                      onChange={() => toggleDestCanal(idx, 'whatsapp')}
                                      className="w-3 h-3"
                                    />
                                    <MessageCircle size={12} className="text-green-500" />
                                  </label>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-2">
                              <button
                                type="button"
                                onClick={() => removeDestinatario(idx)}
                                className="text-gray-300 hover:text-red-500 transition-colors"
                              >
                                <X size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* ── Sección 4: Frecuencia y horario ──────────────────────── */}
              <section>
                <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-1 border-b border-gray-100">
                  4. Frecuencia y horario
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Frecuencia */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Frecuencia</label>
                    <div className="relative">
                      <select
                        value={form.frecuencia}
                        onChange={e => setField('frecuencia', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                      >
                        <option value="diario">Diario</option>
                        <option value="semanal">Semanal</option>
                        <option value="mensual">Mensual</option>
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                  </div>

                  {/* Días semana — multi-select */}
                  {form.frecuencia === 'semanal' && (
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-600 mb-2">Días de la semana</label>
                      <div className="flex flex-wrap gap-1.5">
                        {DIAS_SEMANA.map(d => {
                          const active = form.dias_semana.includes(d.value)
                          return (
                            <button
                              key={d.value}
                              type="button"
                              onClick={() => {
                                const next = active
                                  ? form.dias_semana.filter(v => v !== d.value)
                                  : [...form.dias_semana, d.value]
                                setField('dias_semana', next.length ? next : [d.value])
                              }}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
                              style={{
                                background:  active ? 'rgba(200,135,58,.1)' : '#fff',
                                borderColor: active ? '#c8873a' : '#e5e7eb',
                                color:       active ? '#c8873a' : '#6b7280',
                              }}
                            >
                              {d.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Día mes */}
                  {form.frecuencia === 'mensual' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Día del mes (1–28)</label>
                      <input
                        type="number"
                        min={1}
                        max={28}
                        value={form.dia_mes ?? 1}
                        onChange={e => setField('dia_mes', Number(e.target.value))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>
                  )}

                  {/* Hora */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Hora de envío</label>
                    <input
                      type="time"
                      value={form.hora_envio ?? '08:00'}
                      onChange={e => setField('hora_envio', e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                </div>

                {/* Cron preview */}
                <div className="mt-4 rounded-lg bg-gray-50 border border-gray-100 px-4 py-3 flex flex-col gap-1">
                  <span className="text-xs text-gray-400 uppercase tracking-wide font-medium">Programación calculada</span>
                  <span className="text-sm text-gray-700 font-medium">{cronText}</span>
                  <code className="text-xs text-gray-400 font-mono">{cronExpr}</code>
                </div>
              </section>

              {/* ── Sección 5: Filtros opcionales ────────────────────────── */}
              <section>
                <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-1 border-b border-gray-100">
                  5. Filtros opcionales
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  {/* País */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-2">País</label>
                    <div className="flex flex-wrap gap-2">
                      {PAISES_OPTS.map(p => (
                        <label key={p} className="flex items-center gap-1.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={(form.filtros.pais ?? []).includes(p)}
                            onChange={() => setFiltro('pais', toggleArr(form.filtros.pais ?? [], p))}
                            className="w-3.5 h-3.5 rounded border-gray-300 text-amber-500 focus:ring-amber-400"
                          />
                          <span className="text-sm text-gray-700">{p}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Categoría */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-2">Categoría</label>
                    <div className="flex flex-col gap-1.5">
                      {CATEG_OPTS.map(c => (
                        <label key={c} className="flex items-center gap-1.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={(form.filtros.categoria ?? []).includes(c)}
                            onChange={() => setFiltro('categoria', toggleArr(form.filtros.categoria ?? [], c))}
                            className="w-3.5 h-3.5 rounded border-gray-300 text-amber-500 focus:ring-amber-400"
                          />
                          <span className="text-sm text-gray-700">{c}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Período — no aplica para cobertura (siempre usa fecha más reciente) */}
                  {form.tipo_reporte === 'cobertura_quiebres' ? (
                    <div className="flex items-center gap-2 pt-5">
                      <span className="text-xs text-gray-400 italic">Período: siempre usa el corte más reciente disponible</span>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-2">Período</label>
                      <div className="relative">
                        <select
                          value={form.filtros.periodo ?? ''}
                          onChange={e => setFiltro('periodo', e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                        >
                          <option value="">Sin filtro</option>
                          {PERIODO_OPTS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                  )}
                </div>
              </section>

            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button
                onClick={closeModal}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition-colors disabled:opacity-50"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {modal === 'create' ? 'Crear reporte' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
