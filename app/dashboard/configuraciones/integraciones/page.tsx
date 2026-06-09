/*
  SQL — run once in Supabase to create the config_bots table:

  CREATE TABLE config_bots (
    id               BIGSERIAL PRIMARY KEY,
    nombre           VARCHAR NOT NULL,
    tipo             VARCHAR NOT NULL CHECK (tipo IN ('api_rest', 'retaillik', 'retaillik_sellout', 'retaillik_sellout_4w')),
    descripcion      TEXT,
    endpoint_url     VARCHAR,
    api_key          VARCHAR,
    job_id           VARCHAR,   -- Job ID del reporte en RetailLink (solo tipo retaillik)
    headers          JSONB DEFAULT '{}',
    metodo           VARCHAR DEFAULT 'GET',
    body_template    JSONB DEFAULT '{}',
    tabla_destino    VARCHAR,
    mapeo_columnas   JSONB DEFAULT '{}',
    cron_expresion   VARCHAR,
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
  Plus, Pencil, Trash2, Play, Eye, EyeOff, X, ChevronDown,
  AlertTriangle, RefreshCw, CheckCircle2, XCircle, Loader2,
  Bot, MessageCircle, Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BotTipo = '' | 'api_rest' | 'retaillik' | 'retaillik_sellout' | 'retaillik_sellout_4w'
            | 'unisuper_inventario' | 'unisuper_venta_diaria' | 'unisuper_venta_mensual'
            | 'onedrive_excel' | 'selectos_inventario' | 'sellin_excel'
type BotMetodo = 'GET' | 'POST'

interface Bot {
  id: number
  nombre: string
  tipo: BotTipo
  descripcion?: string
  endpoint_url?: string
  api_key?: string
  job_id?: string
  headers?: Record<string, unknown>
  metodo?: BotMetodo
  body_template?: Record<string, unknown>
  tabla_destino?: string
  mapeo_columnas?: Record<string, unknown>
  cron_expresion?: string
  activo: boolean
  ultima_ejecucion?: string
  ultimo_status?: string
  ultimo_mensaje?: string
  created_at?: string
  updated_at?: string
}

type ModalMode = 'create' | 'edit' | null

const EMPTY_FORM: Omit<Bot, 'id' | 'created_at' | 'updated_at'> = {
  nombre: '',
  tipo: '',
  descripcion: '',
  endpoint_url: '',
  api_key: '',
  job_id: '',
  headers: {},
  metodo: 'GET',
  body_template: {},
  tabla_destino: '',
  mapeo_columnas: {},
  cron_expresion: '',
  activo: true,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cronToHuman(expr: string): string {
  if (!expr.trim()) return ''
  const parts = expr.trim().split(/\s+/)
  if (parts.length < 5) return 'Expresión inválida'
  const [min, hour, dom, , dow] = parts
  const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

  const time = hour !== '*' && min !== '*'
    ? `a las ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`
    : ''

  if (min === '*' && hour === '*') return 'Cada minuto'

  if (dow !== '*' && dom === '*') {
    const nombres = dow.split(',').map(d => DAYS[parseInt(d.trim())] ?? d.trim())
    const lista = nombres.length > 1
      ? nombres.slice(0, -1).join(', ') + ' y ' + nombres.at(-1)
      : nombres[0]
    return `Todos los ${lista} ${time}`.trim()
  }

  if (dom !== '*' && dow === '*') return `El día ${dom} de cada mes ${time}`.trim()
  return `Todos los días ${time}`.trim()
}

type Sched = { frecuencia: 'diario' | 'semanal' | 'mensual'; dias: number[]; diaMes: number; hora: string }

function parseCronToSched(expr: string): Sched {
  const def: Sched = { frecuencia: 'semanal', dias: [1], diaMes: 1, hora: '06:00' }
  if (!expr?.trim()) return def
  const [min, hour, dom, , dow] = expr.trim().split(/\s+/)
  const hora = (hour !== '*' && min !== '*')
    ? `${hour.padStart(2,'0')}:${min.padStart(2,'0')}` : '06:00'
  if (dow && dow !== '*')
    return { frecuencia: 'semanal', dias: dow.split(',').map(Number), diaMes: 1, hora }
  if (dom && dom !== '*')
    return { frecuencia: 'mensual', dias: [1], diaMes: parseInt(dom) || 1, hora }
  return { frecuencia: 'diario', dias: [1], diaMes: 1, hora }
}

function buildCronFromSched(s: Sched): string {
  const [h = '6', m = '0'] = s.hora.split(':')
  if (s.frecuencia === 'diario')   return `${m} ${h} * * *`
  if (s.frecuencia === 'semanal')  return `${m} ${h} * * ${[...s.dias].sort().join(',')}`
  return `${m} ${h} ${s.diaMes} * *`
}

function getNextExecution(cronExpr?: string): string {
  if (!cronExpr) return '—'
  const human = cronToHuman(cronExpr)
  return human && human !== 'Expresión inválida' ? human : '—'
}

function formatDate(ts?: string): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('es-GT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function jsonStringify(val: Record<string, unknown> | undefined): string {
  if (!val || Object.keys(val).length === 0) return ''
  try { return JSON.stringify(val, null, 2) } catch { return '' }
}

function parseJson(str: string): Record<string, unknown> {
  if (!str.trim()) return {}
  try { return JSON.parse(str) } catch { return {} }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function IntegracionesPage() {
  const supabase = createClient()

  // auth
  const [profile, setProfile]     = useState<any>(null)
  const [authLoading, setAuthLoading] = useState(true)

  // bots list
  const [bots, setBots]           = useState<Bot[]>([])
  const [botsLoading, setBotsLoading] = useState(false)

  // modal
  const [modal, setModal]         = useState<ModalMode>(null)
  const [editBot, setEditBot]     = useState<Bot | null>(null)
  const [form, setForm]           = useState({ ...EMPTY_FORM })
  const [saving, setSaving]       = useState(false)

  // form UI state
  const [showApiKey, setShowApiKey]   = useState(false)
  const [headersStr, setHeadersStr]   = useState('')
  const [bodyStr, setBodyStr]         = useState('')
  const [mapeoStr, setMapeoStr]       = useState('')
  const [sched, setSched]             = useState<Sched>({ frecuencia: 'semanal', dias: [1], diaMes: 1, hora: '06:00' })

  // delete confirm
  const [deleteId, setDeleteId]   = useState<number | null>(null)
  const [deleting, setDeleting]   = useState(false)

  // run bot
  const [runningId, setRunningId] = useState<number | null>(null)

  // -------------------------------------------------------------------------
  // Auth check
  // -------------------------------------------------------------------------

  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setAuthLoading(false); return }
      const { data } = await supabase
        .from('profiles').select('*').eq('id', user.id).single()
      setProfile(data)
      setAuthLoading(false)
    }
    checkAuth()
  }, [])

  // -------------------------------------------------------------------------
  // Load bots
  // -------------------------------------------------------------------------

  const loadBots = useCallback(async () => {
    setBotsLoading(true)
    try {
      const res = await fetch('/api/bots')
      if (!res.ok) throw new Error('Error cargando bots')
      const data = await res.json()
      setBots(data.bots ?? [])
    } catch (e: any) {
      toast.error(e.message ?? 'Error desconocido')
    } finally {
      setBotsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (profile?.role === 'superadmin') loadBots()
  }, [profile, loadBots])

  // Polling automático mientras haya bots en estado 'running'
  useEffect(() => {
    const hasRunning = bots.some(b => b.ultimo_status === 'running')
    if (!hasRunning) return
    const interval = setInterval(() => loadBots(), 30000)
    return () => clearInterval(interval)
  }, [bots, loadBots])

  // -------------------------------------------------------------------------
  // Toggle activo
  // -------------------------------------------------------------------------

  const toggleActivo = async (bot: Bot) => {
    const newVal = !bot.activo
    setBots(prev => prev.map(b => b.id === bot.id ? { ...b, activo: newVal } : b))
    const res = await fetch(`/api/bots/${bot.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: newVal }),
    })
    if (!res.ok) {
      setBots(prev => prev.map(b => b.id === bot.id ? { ...b, activo: bot.activo } : b))
      toast.error('Error actualizando estado')
    } else {
      toast.success(`Bot ${newVal ? 'activado' : 'desactivado'}`)
    }
  }

  // -------------------------------------------------------------------------
  // Run bot
  // -------------------------------------------------------------------------

  const runBot = async (id: number) => {
    setRunningId(id)
    // Actualización optimista: mostrar "En proceso" inmediatamente
    setBots(prev => prev.map(b => b.id === id
      ? { ...b, ultimo_status: 'running', ultimo_mensaje: 'Iniciando...', ultima_ejecucion: new Date().toISOString() }
      : b
    ))
    try {
      const res = await fetch(`/api/bots/run/${id}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.mensaje ?? 'Error ejecutando bot')
      toast.success('Workflow disparado — monitoreando estado...')
      await loadBots()
    } catch (e: any) {
      toast.error(e.message ?? 'Error ejecutando bot')
      await loadBots()
    } finally {
      setRunningId(null)
    }
  }

  // -------------------------------------------------------------------------
  // Delete bot
  // -------------------------------------------------------------------------

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/bots/${deleteId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error eliminando bot')
      toast.success('Bot eliminado')
      setBots(prev => prev.filter(b => b.id !== deleteId))
      setDeleteId(null)
    } catch (e: any) {
      toast.error(e.message ?? 'Error eliminando bot')
    } finally {
      setDeleting(false)
    }
  }

  // -------------------------------------------------------------------------
  // Open modal
  // -------------------------------------------------------------------------

  const openCreate = () => {
    setEditBot(null)
    setForm({ ...EMPTY_FORM })
    setHeadersStr('')
    setBodyStr('')
    setMapeoStr('')
    setShowApiKey(false)
    setSched({ frecuencia: 'semanal', dias: [1], diaMes: 1, hora: '06:00' })
    setModal('create')
  }

  const openEdit = (bot: Bot) => {
    setEditBot(bot)
    setForm({
      nombre: bot.nombre,
      tipo: bot.tipo,
      descripcion: bot.descripcion ?? '',
      endpoint_url: bot.endpoint_url ?? '',
      api_key: bot.api_key ?? '',
      job_id: bot.job_id ?? '',
      headers: bot.headers ?? {},
      metodo: (bot.metodo as BotMetodo) ?? 'GET',
      body_template: bot.body_template ?? {},
      tabla_destino: bot.tabla_destino ?? '',
      mapeo_columnas: bot.mapeo_columnas ?? {},
      cron_expresion: bot.cron_expresion ?? '',
      activo: bot.activo,
    })
    setHeadersStr(jsonStringify(bot.headers))
    setBodyStr(jsonStringify(bot.body_template))
    setMapeoStr(jsonStringify(bot.mapeo_columnas))
    setShowApiKey(false)
    setSched(parseCronToSched(bot.cron_expresion ?? ''))
    setModal('edit')
  }

  // -------------------------------------------------------------------------
  // Save (create or edit)
  // -------------------------------------------------------------------------

  const handleSave = async () => {
    if (!form.nombre.trim()) { toast.error('El nombre es requerido'); return }
    if (!form.tipo) { toast.error('Selecciona un tipo de bot'); return }
    setSaving(true)
    try {
      const payload: any = {
        ...form,
        headers: parseJson(headersStr),
        body_template: parseJson(bodyStr),
        mapeo_columnas: parseJson(mapeoStr),
      }
      // Don't send the masked placeholder
      if (editBot && form.api_key === '••••••••') {
        delete payload.api_key
      }

      let res: Response
      if (modal === 'create') {
        res = await fetch('/api/bots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch(`/api/bots/${editBot!.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
      if (!res.ok) throw new Error('Error guardando bot')
      toast.success(modal === 'create' ? 'Bot creado' : 'Bot actualizado')
      setModal(null)
      await loadBots()
    } catch (e: any) {
      toast.error(e.message ?? 'Error guardando bot')
    } finally {
      setSaving(false)
    }
  }

  // -------------------------------------------------------------------------
  // Form field helper
  // -------------------------------------------------------------------------

  const setField = (key: keyof typeof form, value: any) =>
    setForm(prev => ({ ...prev, [key]: value }))

  // -------------------------------------------------------------------------
  // Render guards
  // -------------------------------------------------------------------------

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        Cargando…
      </div>
    )
  }

  if (!profile || profile.role !== 'superadmin') {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertTriangle className="text-amber-400 w-10 h-10" />
        <p className="text-gray-700 font-semibold text-lg">Sin acceso</p>
        <p className="text-gray-400 text-sm">
          Esta sección es exclusiva para superadministradores.
        </p>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const isRetaillik = form.tipo === 'retaillik' || form.tipo === 'retaillik_sellout' || form.tipo === 'retaillik_sellout_4w'
  const isApiRest   = form.tipo === 'api_rest'
  const isPost      = form.metodo === 'POST'

  const updateSched = (next: Sched) => {
    setSched(next)
    setField('cron_expresion', buildCronFromSched(next))
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Configuraciones</p>
          <h1 className="text-2xl font-bold text-gray-800">Integraciones / Bots</h1>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nuevo Bot
        </button>
      </div>

      {/* Elsie card */}
      <div className="bg-white rounded-xl border border-amber-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-4 px-5 py-4">
          <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center flex-shrink-0">
            <Bot className="w-5 h-5 text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold text-gray-800">Elsie</p>
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border bg-amber-50 text-amber-600 border-amber-200">
                <Sparkles className="w-2.5 h-2.5" /> Asistente IA
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-600 border-emerald-200">
                <CheckCircle2 className="w-2.5 h-2.5" /> Activa
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Consulta ventas, inventario y sell-in en lenguaje natural. Genera reportes PDF. Disponible en todas las páginas del dashboard.
            </p>
          </div>
          <button
            onClick={() => {
              const btn = document.querySelector<HTMLButtonElement>('[aria-label="Abrir Elsie"]')
              btn?.click()
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors flex-shrink-0"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Abrir chat
          </button>
        </div>
        <div className="border-t border-amber-50 px-5 py-2.5 bg-amber-50/30 flex flex-wrap gap-4 text-xs text-gray-500">
          <span>Modelo: <span className="text-gray-700 font-medium">Claude Sonnet 4.6</span></span>
          <span>Proveedor: <span className="text-gray-700 font-medium">Anthropic</span></span>
          <span>Herramientas: <span className="text-gray-700 font-medium">Ventas · Inventario · Sell-In · PDF</span></span>
          <span>Idioma: <span className="text-gray-700 font-medium">Español</span></span>
        </div>
      </div>

      {/* Table card */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {botsLoading ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> Cargando bots…
          </div>
        ) : bots.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm gap-2">
            <p>No hay bots configurados.</p>
            <button onClick={openCreate} className="text-amber-500 hover:underline text-xs">
              Crear el primero
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-xs uppercase tracking-wide">
                  <th className="text-left px-5 py-3 font-medium">Nombre</th>
                  <th className="text-left px-5 py-3 font-medium">Tipo</th>
                  <th className="text-left px-5 py-3 font-medium">Estado</th>
                  <th className="text-left px-5 py-3 font-medium">Último Status</th>
                  <th className="text-left px-5 py-3 font-medium">Última Ejecución</th>
                  <th className="text-left px-5 py-3 font-medium">Próxima Ejecución</th>
                  <th className="text-left px-5 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bots.map(bot => (
                  <tr key={bot.id} className="hover:bg-gray-50/60 transition-colors">
                    {/* Nombre */}
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-800">{bot.nombre}</p>
                      {bot.descripcion && (
                        <p className="text-xs text-gray-400 truncate max-w-[200px]">
                          {bot.descripcion}
                        </p>
                      )}
                    </td>

                    {/* Tipo badge */}
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        bot.tipo === 'api_rest'               ? 'bg-blue-50 text-blue-700'
                        : bot.tipo === 'retaillik_sellout'    ? 'bg-green-50 text-green-700'
                        : bot.tipo === 'retaillik_sellout_4w' ? 'bg-teal-50 text-teal-700'
                        : bot.tipo === 'unisuper_inventario'  ? 'bg-orange-50 text-orange-700'
                        : bot.tipo === 'unisuper_venta_diaria'  ? 'bg-amber-50 text-amber-700'
                        : bot.tipo === 'unisuper_venta_mensual' ? 'bg-yellow-50 text-yellow-700'
                        : bot.tipo === 'onedrive_excel'       ? 'bg-sky-50 text-sky-700'
                        : bot.tipo === 'selectos_inventario' ? 'bg-red-50 text-red-700'
                        : bot.tipo === 'sellin_excel'        ? 'bg-green-50 text-green-700'
                        : 'bg-purple-50 text-purple-700'
                      }`}>
                        {bot.tipo === 'api_rest'                ? 'API REST'
                        : bot.tipo === 'retaillik_sellout'      ? 'RL Sellout CW'
                        : bot.tipo === 'retaillik_sellout_4w'   ? 'RL Sellout 4W'
                        : bot.tipo === 'unisuper_inventario'    ? 'UNI Inventario'
                        : bot.tipo === 'unisuper_venta_diaria'  ? 'UNI Venta Día'
                        : bot.tipo === 'unisuper_venta_mensual' ? 'UNI Venta Mes'
                        : bot.tipo === 'onedrive_excel'         ? 'OneDrive Excel'
                        : bot.tipo === 'selectos_inventario'   ? 'Selectos Inv.'
                        : bot.tipo === 'sellin_excel'           ? 'Sell In Excel'
                        : 'RL Inventario'}
                      </span>
                    </td>

                    {/* Estado toggle */}
                    <td className="px-5 py-3">
                      <button
                        onClick={() => toggleActivo(bot)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                          bot.activo ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                        title={bot.activo ? 'Activo — clic para desactivar' : 'Inactivo — clic para activar'}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                          bot.activo ? 'translate-x-4' : 'translate-x-1'
                        }`} />
                      </button>
                    </td>

                    {/* Último Status */}
                    <td className="px-5 py-3">
                      {bot.ultimo_status ? (() => {
                        const s = bot.ultimo_status
                        const isOk      = s === 'ok' || s === 'success'
                        const isRunning = s === 'running'
                        return (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            isOk      ? 'bg-green-100 text-green-700' :
                            isRunning ? 'bg-blue-100 text-blue-700'   :
                                        'bg-red-100 text-red-700'
                          }`}>
                            {isOk      ? <CheckCircle2 className="w-3 h-3" /> :
                             isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> :
                                         <XCircle className="w-3 h-3" />}
                            {isOk ? 'Éxito' : isRunning ? 'En proceso' : 'Error'}
                          </span>
                        )
                      })() : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                      {bot.ultimo_mensaje && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[160px]" title={bot.ultimo_mensaje}>
                          {bot.ultimo_mensaje}
                        </p>
                      )}
                    </td>

                    {/* Última Ejecución */}
                    <td className="px-5 py-3 text-gray-600 whitespace-nowrap">
                      {formatDate(bot.ultima_ejecucion)}
                    </td>

                    {/* Próxima Ejecución */}
                    <td className="px-5 py-3 text-gray-600 whitespace-nowrap">
                      {bot.cron_expresion
                        ? <span className="text-xs">{getNextExecution(bot.cron_expresion)}</span>
                        : <span className="text-gray-400 text-xs">—</span>}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        {/* Run */}
                        <button
                          onClick={() => runBot(bot.id)}
                          disabled={runningId === bot.id}
                          title="Ejecutar ahora"
                          className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 disabled:opacity-50 transition-colors"
                        >
                          {runningId === bot.id
                            ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            : <Play className="w-3.5 h-3.5" />}
                        </button>

                        {/* Edit */}
                        <button
                          onClick={() => openEdit(bot)}
                          title="Editar"
                          className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete */}
                        {deleteId === bot.id ? (
                          <div className="flex items-center gap-1 text-xs">
                            <span className="text-red-500 font-medium">¿Eliminar?</span>
                            <button
                              onClick={handleDelete}
                              disabled={deleting}
                              className="px-1.5 py-0.5 bg-red-500 text-white rounded text-xs hover:bg-red-600 disabled:opacity-50"
                            >
                              {deleting ? '…' : 'Sí'}
                            </button>
                            <button
                              onClick={() => setDeleteId(null)}
                              className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteId(bot.id)}
                            title="Eliminar"
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Modal create / edit                                                 */}
      {/* ------------------------------------------------------------------ */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-2xl w-full max-h-[90vh] overflow-y-auto rounded-2xl p-6 shadow-xl">
            {/* Modal header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-800">
                {modal === 'create' ? 'Nuevo Bot' : `Editar: ${editBot?.nombre}`}
              </h2>
              <button
                onClick={() => setModal(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Nombre */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Nombre <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={e => setField('nombre', e.target.value)}
                  placeholder="Mi Bot de Ventas"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              {/* Tipo */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Tipo</label>
                <div className="relative">
                  <select
                    value={form.tipo}
                    onChange={e => setField('tipo', e.target.value as BotTipo)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 appearance-none pr-8"
                  >
                    <option value="" disabled>— Selecciona un tipo —</option>
                    <option value="api_rest">API REST Personalizada</option>
                    <option value="retaillik">RetailLink — Inventario</option>
                    <option value="retaillik_sellout">RetailLink — Sellout Current Week</option>
                    <option value="retaillik_sellout_4w">RetailLink — Sellout Last 4 Weeks</option>
                    <option value="unisuper_inventario">Unisuper — Inventario</option>
                    <option value="unisuper_venta_diaria">Unisuper — Venta Diaria</option>
                    <option value="unisuper_venta_mensual">Unisuper — Venta Mensual</option>
                    <option value="onedrive_excel">OneDrive — Colombia Sellout</option>
                    <option value="selectos_inventario">Selectos — Inventario</option>
                    <option value="sellin_excel">OneDrive — Sell In BLFoods</option>
                  </select>
                  <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Campos adicionales — solo si se eligió un tipo */}
              {form.tipo && (<>

              {/* RetailLink info box */}
              {isRetaillik && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-700 space-y-1">
                  <p className="font-semibold mb-1">Variables requeridas en GitHub Secrets:</p>
                  <p><code className="font-mono font-semibold">RETAILLINK_USER</code> — correo de la cuenta RetailLink</p>
                  <p><code className="font-mono font-semibold">RETAILLINK_PASSWORD</code> — contraseña de la cuenta</p>
                  <p><code className="font-mono font-semibold">RETAILLINK_BOT_TOKEN</code> — token JWT del bot</p>
                  <p><code className="font-mono font-semibold">BROWSERBASE_API_KEY</code> / <code className="font-mono font-semibold">BROWSERBASE_PROJECT_ID</code> — browser cloud</p>
                </div>
              )}

              {/* Job ID — solo RetailLink */}
              {isRetaillik && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Job ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.job_id ?? ''}
                    onChange={e => setField('job_id', e.target.value)}
                    placeholder="49753313"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <p className="text-xs text-gray-400 mt-0.5">
                    ID del reporte guardado en RetailLink (Decision Support → requestid).
                  </p>
                </div>
              )}

              {/* Descripcion */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Descripción</label>
                <textarea
                  value={form.descripcion}
                  onChange={e => setField('descripcion', e.target.value)}
                  rows={2}
                  placeholder="Descripción opcional del bot"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                />
              </div>

              {/* ---- api_rest only fields ---- */}
              {isApiRest && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Endpoint URL</label>
                <input
                  type="text"
                  value={form.endpoint_url}
                  onChange={e => setField('endpoint_url', e.target.value)}
                  placeholder="https://api.ejemplo.com/datos"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              )}

              {isApiRest && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">API Key</label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={form.api_key}
                    onChange={e => setField('api_key', e.target.value)}
                    placeholder={editBot ? '••••••••' : 'sk-...'}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(v => !v)}
                    className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {editBot && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Deja en blanco para mantener la clave existente.
                  </p>
                )}
              </div>
              )}

              {isApiRest && (
                <>
                  {/* Metodo */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Método</label>
                    <div className="relative">
                      <select
                        value={form.metodo}
                        onChange={e => setField('metodo', e.target.value as BotMetodo)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 appearance-none pr-8"
                      >
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                      </select>
                      <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                  </div>

                  {/* Headers */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Headers <span className="text-gray-400 font-normal">(JSON)</span>
                    </label>
                    <textarea
                      value={headersStr}
                      onChange={e => setHeadersStr(e.target.value)}
                      rows={3}
                      placeholder={'{"Authorization": "Bearer ..."}'}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                    />
                  </div>

                  {/* Body Template (only POST) */}
                  {isPost && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Body Template <span className="text-gray-400 font-normal">(JSON)</span>
                      </label>
                      <textarea
                        value={bodyStr}
                        onChange={e => setBodyStr(e.target.value)}
                        rows={3}
                        placeholder={'{"query": "..."}'}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                      />
                    </div>
                  )}

                  {/* Tabla destino */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Tabla Destino</label>
                    <input
                      type="text"
                      value={form.tabla_destino}
                      onChange={e => setField('tabla_destino', e.target.value)}
                      placeholder="ej. fact_ventas"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>

                  {/* Mapeo columnas */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Mapeo de Columnas <span className="text-gray-400 font-normal">(JSON)</span>
                    </label>
                    <textarea
                      value={mapeoStr}
                      onChange={e => setMapeoStr(e.target.value)}
                      rows={3}
                      placeholder={'{"api_field": "db_column"}'}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                    />
                  </div>
                </>
              )}

              {/* Schedule picker */}
              <div className="space-y-3">
                <label className="block text-xs font-medium text-gray-700">Horario</label>

                {/* Frecuencia tabs */}
                <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                  {(['diario','semanal','mensual'] as const).map(f => (
                    <button key={f} type="button"
                      onClick={() => updateSched({ ...sched, frecuencia: f })}
                      className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        sched.frecuencia === f
                          ? 'bg-white text-amber-600 shadow-sm'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Días de semana */}
                {sched.frecuencia === 'semanal' && (
                  <div className="flex gap-1">
                    {['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map((d, i) => (
                      <button key={i} type="button"
                        onClick={() => {
                          const dias = sched.dias.includes(i)
                            ? sched.dias.filter(x => x !== i)
                            : [...sched.dias, i]
                          if (!dias.length) return
                          updateSched({ ...sched, dias })
                        }}
                        className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          sched.dias.includes(i)
                            ? 'bg-amber-500 text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                )}

                {/* Día del mes */}
                {sched.frecuencia === 'mensual' && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Día del mes</span>
                    <input type="number" min={1} max={28}
                      value={sched.diaMes}
                      onChange={e => updateSched({ ...sched, diaMes: parseInt(e.target.value) || 1 })}
                      className="w-20 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                )}

                {/* Hora */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Hora (UTC)</span>
                  <input type="time"
                    value={sched.hora}
                    onChange={e => updateSched({ ...sched, hora: e.target.value })}
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>

                {/* Preview */}
                {form.cron_expresion && (
                  <p className="text-xs text-amber-600">{cronToHuman(form.cron_expresion)}</p>
                )}
              </div>

              </>)}

              {/* Activo toggle */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setField('activo', !form.activo)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                    form.activo ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                    form.activo ? 'translate-x-4' : 'translate-x-1'
                  }`} />
                </button>
                <span className="text-sm text-gray-700">{form.activo ? 'Activo' : 'Inactivo'}</span>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
              <button
                onClick={() => setModal(null)}
                className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-60 transition-colors"
              >
                {saving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                {modal === 'create' ? 'Crear Bot' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
