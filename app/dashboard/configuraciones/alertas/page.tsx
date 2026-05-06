'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bell, Plus, Pencil, Trash2, X, Play, CheckCircle2, AlertCircle, Clock, UserPlus, ChevronDown } from 'lucide-react'
import { Btn } from '@/components/ui'
import { toast } from 'sonner'

// ── Types ───────────────────────────────────────────────────────────────────

type TipoAlerta = 'umbral_metrica' | 'variacion_anormal' | 'bot_sin_sincronizar' | 'registro_sanitario'

interface Destinatario { nombre: string; email: string }
interface Alerta {
  id:               string
  nombre:           string
  tipo:             TipoAlerta
  activo:           boolean
  condicion:        Record<string, any>
  destinatarios:    Destinatario[]
  ultima_ejecucion: string | null
  ultimo_status:    'ok' | 'disparada' | 'error' | null
  ultimo_mensaje:   string | null
  created_at:       string
}

const TIPO_LABEL: Record<TipoAlerta, string> = {
  umbral_metrica:      'Umbral de Métrica',
  variacion_anormal:   'Variación Anormal',
  bot_sin_sincronizar: 'Bot sin Sincronizar',
  registro_sanitario:  'Registro Sanitario',
}
const TIPO_COLOR: Record<TipoAlerta, { bg: string; color: string }> = {
  umbral_metrica:      { bg: 'rgba(200,135,58,.12)',  color: '#c8873a' },
  variacion_anormal:   { bg: 'rgba(58,111,168,.12)',  color: '#3a6fa8' },
  bot_sin_sincronizar: { bg: 'rgba(156,39,176,.12)',  color: '#9c27b0' },
  registro_sanitario:  { bg: 'rgba(192,64,47,.12)',   color: '#c0402f' },
}
const STATUS_META = {
  ok:       { icon: CheckCircle2, color: '#2a7a58', label: 'OK'       },
  disparada:{ icon: AlertCircle,  color: '#c8873a', label: 'Disparada'},
  error:    { icon: AlertCircle,  color: '#c0402f', label: 'Error'    },
}

// ── Empty form helpers ───────────────────────────────────────────────────────

const emptyCondicion = (tipo: TipoAlerta): Record<string, any> => {
  if (tipo === 'umbral_metrica')      return { metrica: 'ventas', operador: '<', valor: 0, filtros: {} }
  if (tipo === 'variacion_anormal')   return { metrica: 'ventas', variacion_porcentaje: 10, direccion: 'caida', periodo_comparacion: 'vs_mes_anterior' }
  if (tipo === 'bot_sin_sincronizar') return { bot_id: '', horas_sin_sincronizar: 24 }
  return { dias_antes_vencimiento: 90 }
}

const EMPTY_FORM = {
  nombre:        '',
  tipo:          'umbral_metrica' as TipoAlerta,
  activo:        true,
  condicion:     emptyCondicion('umbral_metrica'),
  destinatarios: [] as Destinatario[],
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function AlertasPage() {
  const supabase   = createClient()
  const [alertas, setAlertas]   = useState<Alerta[]>([])
  const [bots,    setBots]      = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [saving,  setSaving]    = useState(false)
  const [testing, setTesting]   = useState<string | null>(null)
  const [modal,   setModal]     = useState<'create'|'edit'|'delete'|null>(null)
  const [sel,     setSel]       = useState<Alerta | null>(null)
  const [form,    setForm]      = useState({ ...EMPTY_FORM })
  const [newDest, setNewDest]   = useState({ nombre: '', email: '' })

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [{ data: a }, { data: b }] = await Promise.all([
      supabase.from('config_alertas').select('*').order('created_at', { ascending: false }),
      supabase.from('config_bots').select('id, nombre').order('nombre'),
    ])
    setAlertas(a ?? [])
    setBots(b ?? [])
    setLoading(false)
  }

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, condicion: emptyCondicion('umbral_metrica') })
    setSel(null); setModal('create')
  }
  const openEdit = (a: Alerta) => {
    setForm({ nombre: a.nombre, tipo: a.tipo, activo: a.activo, condicion: { ...a.condicion }, destinatarios: [...(a.destinatarios ?? [])] })
    setSel(a); setModal('edit')
  }
  const openDelete = (a: Alerta) => { setSel(a); setModal('delete') }
  const closeModal = () => { setModal(null); setSel(null); setNewDest({ nombre:'', email:'' }) }

  const setField = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))
  const setCond  = (k: string, v: any) => setForm(f => ({ ...f, condicion: { ...f.condicion, [k]: v } }))
  const setFiltro= (k: string, v: any) => setForm(f => ({
    ...f, condicion: { ...f.condicion, filtros: { ...(f.condicion.filtros ?? {}), [k]: v || undefined } }
  }))

  const handleTipoChange = (tipo: TipoAlerta) => {
    setForm(f => ({ ...f, tipo, condicion: emptyCondicion(tipo) }))
  }

  const addDest = () => {
    if (!newDest.email) return
    setForm(f => ({ ...f, destinatarios: [...f.destinatarios, { ...newDest }] }))
    setNewDest({ nombre: '', email: '' })
  }
  const removeDest = (i: number) => setForm(f => ({ ...f, destinatarios: f.destinatarios.filter((_,j) => j !== i) }))

  const handleSave = async () => {
    if (!form.nombre) { toast.error('El nombre es requerido'); return }
    if (form.destinatarios.length === 0) { toast.error('Agrega al menos un destinatario'); return }
    setSaving(true)
    try {
      const payload = {
        nombre:       form.nombre,
        tipo:         form.tipo,
        activo:       form.activo,
        condicion:    form.condicion,
        destinatarios: form.destinatarios,
        updated_at:   new Date().toISOString(),
      }
      const { error } = modal === 'create'
        ? await supabase.from('config_alertas').insert({ ...payload, created_at: new Date().toISOString() })
        : await supabase.from('config_alertas').update(payload).eq('id', sel!.id)
      if (error) throw new Error(error.message)
      toast.success(modal === 'create' ? 'Alerta creada' : 'Alerta actualizada')
      closeModal(); load()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  const handleDelete = async () => {
    setSaving(true)
    const { error } = await supabase.from('config_alertas').delete().eq('id', sel!.id)
    if (error) { toast.error(error.message); setSaving(false); return }
    toast.success('Alerta eliminada'); closeModal(); load()
    setSaving(false)
  }

  const handleToggle = async (a: Alerta) => {
    const { error } = await supabase.from('config_alertas').update({ activo: !a.activo }).eq('id', a.id)
    if (error) { toast.error(error.message); return }
    load()
  }

  const handleTest = async (a: Alerta) => {
    setTesting(a.id)
    try {
      const res  = await fetch('/api/alertas/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: a.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Alerta de prueba enviada')
    } catch (e: any) { toast.error(e.message) }
    setTesting(null)
  }

  const iStyle = { background:'var(--bg)', borderColor:'var(--border)', color:'var(--t1)' }

  return (
    <div className="space-y-5 animate-fade-up">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-xl" style={{color:'var(--t1)'}}>Alertas</h1>
          <p className="text-[12px] mt-0.5" style={{color:'var(--t3)'}}>
            Configura notificaciones automáticas por email
          </p>
        </div>
        <Btn onClick={openCreate}><Plus size={13}/> Nueva Alerta</Btn>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { l:'Total',     v: alertas.length,                                              c:'#2a7a58' },
          { l:'Activas',   v: alertas.filter(a => a.activo).length,                        c:'#c8873a' },
          { l:'Disparadas',v: alertas.filter(a => a.ultimo_status === 'disparada').length, c:'#3a6fa8' },
          { l:'Con Error', v: alertas.filter(a => a.ultimo_status === 'error').length,     c:'#c0402f' },
        ].map(k => (
          <div key={k.l} className="card p-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl" style={{background:k.c}} />
            <div className="text-[9px] tracking-[2px] uppercase mb-1" style={{color:'var(--t3)'}}>{k.l}</div>
            <div className="font-display font-bold text-[28px]" style={{color:'var(--t1)'}}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card p-5">
        {loading ? (
          <div className="text-center py-10 text-sm" style={{color:'var(--t3)'}}>Cargando alertas...</div>
        ) : alertas.length === 0 ? (
          <div className="text-center py-12">
            <Bell size={32} className="mx-auto mb-3 opacity-20" style={{color:'var(--t1)'}} />
            <div className="text-sm font-medium mb-1" style={{color:'var(--t2)'}}>Sin alertas configuradas</div>
            <div className="text-[11px]" style={{color:'var(--t3)'}}>Crea una nueva alerta para recibir notificaciones automáticas</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr style={{borderBottom:'1px solid var(--border)'}}>
                  {['Nombre','Tipo','Estado','Última Ejecución','Mensaje','Destinatarios','Acciones'].map(h => (
                    <th key={h} className="text-left pb-3 text-[9px] tracking-[1.5px] uppercase font-medium pr-4"
                      style={{color:'var(--t3)'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {alertas.map(a => {
                  const tc   = TIPO_COLOR[a.tipo]
                  const sm   = a.ultimo_status ? STATUS_META[a.ultimo_status] : null
                  return (
                    <tr key={a.id} style={{borderBottom:'1px solid var(--border)'}}>
                      <td className="py-3 pr-4">
                        <div className="font-medium" style={{color:'var(--t1)'}}>{a.nombre}</div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                          style={{background:tc.bg, color:tc.color}}>
                          {TIPO_LABEL[a.tipo]}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <button onClick={() => handleToggle(a)}
                          className={`text-[10px] px-2.5 py-1 rounded-full font-medium transition-all hover:opacity-75 ${
                            a.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {a.activo ? '● Activa' : '● Inactiva'}
                        </button>
                      </td>
                      <td className="py-3 pr-4">
                        {a.ultima_ejecucion ? (
                          <div className="flex items-center gap-1.5">
                            {sm && <sm.icon size={12} style={{color:sm.color, flexShrink:0}} />}
                            <span style={{color:'var(--t2)'}}>
                              {new Date(a.ultima_ejecucion).toLocaleString('es-GT', { dateStyle:'short', timeStyle:'short' })}
                            </span>
                          </div>
                        ) : (
                          <span style={{color:'var(--t3)'}}>—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 max-w-[200px]">
                        <div className="truncate" style={{color:'var(--t3)'}} title={a.ultimo_mensaje ?? ''}>
                          {a.ultimo_mensaje || '—'}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap gap-1">
                          {(a.destinatarios ?? []).slice(0, 2).map((d, i) => (
                            <span key={i} className="text-[9px] px-1.5 py-0.5 rounded"
                              style={{background:'var(--border)', color:'var(--t2)'}}>
                              {d.nombre || d.email}
                            </span>
                          ))}
                          {(a.destinatarios ?? []).length > 2 && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded" style={{background:'var(--border)', color:'var(--t3)'}}>
                              +{a.destinatarios.length - 2}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleTest(a)} disabled={testing === a.id}
                            title="Probar alerta (envía email de prueba)"
                            className="p-1.5 rounded-lg transition-all hover:bg-amber-500/10 hover:text-amber-500 disabled:opacity-40"
                            style={{color:'var(--t3)'}}>
                            {testing === a.id
                              ? <div className="w-3 h-3 border border-amber-500 border-t-transparent rounded-full animate-spin"/>
                              : <Play size={13}/>}
                          </button>
                          <button onClick={() => openEdit(a)} title="Editar"
                            className="p-1.5 rounded-lg transition-all hover:bg-blue-500/10 hover:text-blue-500"
                            style={{color:'var(--t3)'}}>
                            <Pencil size={13}/>
                          </button>
                          <button onClick={() => openDelete(a)} title="Eliminar"
                            className="p-1.5 rounded-lg transition-all hover:bg-red-500/10 hover:text-red-500"
                            style={{color:'var(--t3)'}}>
                            <Trash2 size={13}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal Crear/Editar ── */}
      {(modal === 'create' || modal === 'edit') && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-12 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="card w-full max-w-xl animate-fade-up mb-8">

            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{borderColor:'var(--border)'}}>
              <div className="font-display font-bold text-base" style={{color:'var(--t1)'}}>
                {modal === 'create' ? 'Nueva Alerta' : 'Editar Alerta'}
              </div>
              <button onClick={closeModal} style={{color:'var(--t3)'}} className="hover:opacity-70"><X size={16}/></button>
            </div>

            <div className="px-5 py-4 space-y-4">

              {/* Nombre + Activo */}
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="text-[9px] uppercase tracking-[1.5px] block mb-1" style={{color:'var(--t3)'}}>Nombre *</label>
                  <input value={form.nombre} onChange={e => setField('nombre', e.target.value)}
                    placeholder="Ej: Ventas por debajo de presupuesto"
                    className="w-full px-3 py-1.5 text-sm rounded-lg border outline-none" style={iStyle} />
                </div>
                <label className="flex items-center gap-2 pb-1.5 cursor-pointer select-none">
                  <div onClick={() => setField('activo', !form.activo)}
                    className={`w-8 h-4 rounded-full transition-colors relative ${form.activo ? 'bg-amber-500' : 'bg-gray-300'}`}>
                    <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${form.activo ? 'left-4' : 'left-0.5'}`}/>
                  </div>
                  <span className="text-[11px]" style={{color:'var(--t2)'}}>Activa</span>
                </label>
              </div>

              {/* Tipo */}
              <div>
                <label className="text-[9px] uppercase tracking-[1.5px] block mb-1" style={{color:'var(--t3)'}}>Tipo</label>
                <select value={form.tipo} onChange={e => handleTipoChange(e.target.value as TipoAlerta)}
                  className="w-full px-3 py-1.5 text-sm rounded-lg border outline-none" style={iStyle}>
                  {(Object.entries(TIPO_LABEL) as [TipoAlerta, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              {/* Condición — dinámica según tipo */}
              <CondicionForm tipo={form.tipo} condicion={form.condicion} setCond={setCond} setFiltro={setFiltro} bots={bots} iStyle={iStyle} />

              {/* Destinatarios */}
              <div>
                <label className="text-[9px] uppercase tracking-[1.5px] block mb-2" style={{color:'var(--t3)'}}>
                  Destinatarios *
                </label>
                {form.destinatarios.length > 0 && (
                  <div className="space-y-1.5 mb-2">
                    {form.destinatarios.map((d, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                        style={{background:'var(--border)', color:'var(--t1)'}}>
                        <div className="flex-1 min-w-0">
                          <span className="text-[12px] font-medium">{d.nombre}</span>
                          <span className="text-[11px] ml-2" style={{color:'var(--t3)'}}>{d.email}</span>
                        </div>
                        <button onClick={() => removeDest(i)} style={{color:'var(--t3)'}} className="hover:text-red-500 flex-shrink-0">
                          <X size={12}/>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input value={newDest.nombre} onChange={e => setNewDest(d => ({...d, nombre: e.target.value}))}
                    placeholder="Nombre" className="flex-1 px-3 py-1.5 text-sm rounded-lg border outline-none" style={iStyle} />
                  <input value={newDest.email} onChange={e => setNewDest(d => ({...d, email: e.target.value}))}
                    onKeyDown={e => e.key === 'Enter' && addDest()}
                    type="email" placeholder="email@empresa.com"
                    className="flex-1 px-3 py-1.5 text-sm rounded-lg border outline-none" style={iStyle} />
                  <button onClick={addDest}
                    className="px-3 py-1.5 rounded-lg border text-[12px] transition-all hover:opacity-80"
                    style={{background:'rgba(200,135,58,.1)', borderColor:'#c8873a', color:'#c8873a'}}>
                    <UserPlus size={13}/>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-2 px-5 pb-4">
              <Btn onClick={handleSave} disabled={saving} className="flex-1 justify-center">
                {saving ? 'Guardando...' : (modal === 'create' ? 'Crear Alerta' : 'Guardar Cambios')}
              </Btn>
              <Btn variant="ghost" onClick={closeModal}>Cancelar</Btn>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Eliminar ── */}
      {modal === 'delete' && sel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="card w-full max-w-sm p-6 animate-fade-up text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={20} className="text-red-500"/>
            </div>
            <div className="font-display font-bold text-lg mb-1" style={{color:'var(--t1)'}}>Eliminar Alerta</div>
            <div className="text-[12px] mb-6" style={{color:'var(--t3)'}}>
              ¿Eliminar la alerta <strong style={{color:'var(--t1)'}}>{sel.nombre}</strong>?
              Esta acción no se puede deshacer.
            </div>
            <div className="flex gap-2">
              <Btn variant="danger" onClick={handleDelete} disabled={saving} className="flex-1 justify-center">
                {saving ? 'Eliminando...' : 'Sí, eliminar'}
              </Btn>
              <Btn variant="ghost" onClick={closeModal} className="flex-1 justify-center">Cancelar</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Condición dinámica ────────────────────────────────────────────────────────

function CondicionForm({ tipo, condicion, setCond, setFiltro, bots, iStyle }: {
  tipo:      TipoAlerta
  condicion: Record<string, any>
  setCond:   (k: string, v: any) => void
  setFiltro: (k: string, v: any) => void
  bots:      any[]
  iStyle:    any
}) {
  const Label = ({ children }: any) => (
    <label className="text-[9px] uppercase tracking-[1.5px] block mb-1" style={{color:'var(--t3)'}}>{children}</label>
  )

  if (tipo === 'umbral_metrica') return (
    <div className="space-y-3 p-3 rounded-lg" style={{background:'var(--bg-alt, rgba(0,0,0,.03))', border:'1px solid var(--border)'}}>
      <div className="text-[9px] uppercase tracking-[1.5px] font-semibold mb-2" style={{color:'var(--t3)'}}>Condición</div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label>Métrica</Label>
          <select value={condicion.metrica ?? 'ventas'} onChange={e => setCond('metrica', e.target.value)}
            className="w-full px-2 py-1.5 text-sm rounded-lg border outline-none" style={iStyle}>
            <option value="ventas">Venta Neta</option>
            <option value="proyectado">Proyectado</option>
          </select>
        </div>
        <div>
          <Label>Operador</Label>
          <select value={condicion.operador ?? '<'} onChange={e => setCond('operador', e.target.value)}
            className="w-full px-2 py-1.5 text-sm rounded-lg border outline-none" style={iStyle}>
            <option value="<">{'<'} menor que</option>
            <option value=">">{'>'} mayor que</option>
            <option value="<=">{'<='} ≤</option>
            <option value=">=">{'>='} ≥</option>
          </select>
        </div>
        <div>
          <Label>Valor (USD)</Label>
          <input type="number" value={condicion.valor ?? 0} onChange={e => setCond('valor', parseFloat(e.target.value) || 0)}
            className="w-full px-2 py-1.5 text-sm rounded-lg border outline-none" style={iStyle} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label>País (opcional)</Label>
          <input value={condicion.filtros?.pais ?? ''} onChange={e => setFiltro('pais', e.target.value)}
            placeholder="Ej: GT" className="w-full px-2 py-1.5 text-sm rounded-lg border outline-none" style={iStyle} />
        </div>
        <div>
          <Label>Cliente (opcional)</Label>
          <input value={condicion.filtros?.cliente ?? ''} onChange={e => setFiltro('cliente', e.target.value)}
            placeholder="Ej: Walmart" className="w-full px-2 py-1.5 text-sm rounded-lg border outline-none" style={iStyle} />
        </div>
        <div>
          <Label>Categoría (opcional)</Label>
          <input value={condicion.filtros?.categoria ?? ''} onChange={e => setFiltro('categoria', e.target.value)}
            placeholder="Ej: Leches" className="w-full px-2 py-1.5 text-sm rounded-lg border outline-none" style={iStyle} />
        </div>
      </div>
    </div>
  )

  if (tipo === 'variacion_anormal') return (
    <div className="space-y-3 p-3 rounded-lg" style={{background:'var(--bg-alt, rgba(0,0,0,.03))', border:'1px solid var(--border)'}}>
      <div className="text-[9px] uppercase tracking-[1.5px] font-semibold mb-2" style={{color:'var(--t3)'}}>Condición</div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label>Variación %</Label>
          <input type="number" min={1} max={100} value={condicion.variacion_porcentaje ?? 10}
            onChange={e => setCond('variacion_porcentaje', parseFloat(e.target.value) || 10)}
            className="w-full px-2 py-1.5 text-sm rounded-lg border outline-none" style={iStyle} />
        </div>
        <div>
          <Label>Dirección</Label>
          <select value={condicion.direccion ?? 'caida'} onChange={e => setCond('direccion', e.target.value)}
            className="w-full px-2 py-1.5 text-sm rounded-lg border outline-none" style={iStyle}>
            <option value="caida">Caída</option>
            <option value="subida">Subida</option>
            <option value="ambas">Ambas</option>
          </select>
        </div>
        <div>
          <Label>Comparar vs</Label>
          <select value={condicion.periodo_comparacion ?? 'vs_mes_anterior'} onChange={e => setCond('periodo_comparacion', e.target.value)}
            className="w-full px-2 py-1.5 text-sm rounded-lg border outline-none" style={iStyle}>
            <option value="vs_mes_anterior">Mes anterior</option>
            <option value="vs_anio_anterior">Año anterior</option>
          </select>
        </div>
      </div>
    </div>
  )

  if (tipo === 'bot_sin_sincronizar') return (
    <div className="space-y-3 p-3 rounded-lg" style={{background:'var(--bg-alt, rgba(0,0,0,.03))', border:'1px solid var(--border)'}}>
      <div className="text-[9px] uppercase tracking-[1.5px] font-semibold mb-2" style={{color:'var(--t3)'}}>Condición</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Bot</Label>
          <select value={condicion.bot_id ?? ''} onChange={e => setCond('bot_id', parseInt(e.target.value) || '')}
            className="w-full px-2 py-1.5 text-sm rounded-lg border outline-none" style={iStyle}>
            <option value="">Seleccionar bot...</option>
            {bots.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
          </select>
        </div>
        <div>
          <Label>Horas sin sincronizar</Label>
          <input type="number" min={1} value={condicion.horas_sin_sincronizar ?? 24}
            onChange={e => setCond('horas_sin_sincronizar', parseInt(e.target.value) || 24)}
            className="w-full px-2 py-1.5 text-sm rounded-lg border outline-none" style={iStyle} />
        </div>
      </div>
    </div>
  )

  // registro_sanitario
  return (
    <div className="space-y-3 p-3 rounded-lg" style={{background:'var(--bg-alt, rgba(0,0,0,.03))', border:'1px solid var(--border)'}}>
      <div className="text-[9px] uppercase tracking-[1.5px] font-semibold mb-2" style={{color:'var(--t3)'}}>Condición</div>
      <div className="max-w-[200px]">
        <Label>Días antes del vencimiento</Label>
        <input type="number" min={1} value={condicion.dias_antes_vencimiento ?? 90}
          onChange={e => setCond('dias_antes_vencimiento', parseInt(e.target.value) || 90)}
          className="w-full px-2 py-1.5 text-sm rounded-lg border outline-none" style={iStyle} />
      </div>
    </div>
  )
}
