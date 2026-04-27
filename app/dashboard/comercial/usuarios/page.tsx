'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { UserPlus, Search, Shield, Pencil, Trash2, X, Eye, EyeOff, LayoutDashboard, Link2 } from 'lucide-react'
import { Btn } from '@/components/ui'
import { toast } from 'sonner'

const ROLE_COLORS: Record<string, any> = {
  superadmin: { bg: 'rgba(200,135,58,.12)', color: '#c8873a' },
  admin:      { bg: 'rgba(58,111,168,.12)', color: '#3a6fa8' },
  usuario:    { bg: 'rgba(42,122,88,.12)',  color: '#2a7a58' },
}

const DEPTS = [
  { id: 'comercial',   label: 'Comercial',   icon: '📈' },
  { id: 'mercadeo',    label: 'Mercadeo',    icon: '🎯' },
  { id: 'operaciones', label: 'Operaciones', icon: '⚙️' },
  { id: 'finanzas',    label: 'Finanzas',    icon: '💰' },
]

const PAISES = ['GT','SV','CO','CR','NI']

const EMPTY_FORM = {
  full_name: '', email: '', password: '', role: 'usuario',
  paises: [] as string[], dashboards: [] as string[],
}

type ModalMode = 'create' | 'edit' | 'delete' | 'dashboards' | null

export default function UsuariosPage() {
  const [users, setUsers]       = useState<any[]>([])
  const [search, setSearch]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [modal, setModal]       = useState<ModalMode>(null)
  const [selected, setSelected] = useState<any>(null)
  const [form, setForm]         = useState({ ...EMPTY_FORM })
  const [showPass, setShowPass] = useState(false)
  const supabase = createClient()

  useEffect(() => { loadUsers() }, [])

  const loadUsers = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles').select('*').order('created_at', { ascending: false })
    if (error) toast.error('Error cargando usuarios')
    setUsers(data || [])
    setLoading(false)
  }

  const openCreate = () => { setForm({ ...EMPTY_FORM }); setSelected(null); setModal('create') }

  const openEdit = (u: any) => {
    setForm({ full_name: u.full_name||'', email: u.email||'', password: '',
      role: u.role||'usuario', paises: u.paises||[], dashboards: u.dashboards||[] })
    setSelected(u); setModal('edit')
  }

  const openDelete     = (u: any) => { setSelected(u); setModal('delete') }
  const openDashboards = (u: any) => {
    setForm({ ...EMPTY_FORM, dashboards: u.dashboards||[], paises: u.paises||[] })
    setSelected(u); setModal('dashboards')
  }

  const closeModal = () => { setModal(null); setSelected(null); setForm({ ...EMPTY_FORM }); setShowPass(false) }

  const toggleArr = (arr: string[], val: string) =>
    arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]

  // ── Create ──────────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!form.full_name || !form.email || !form.password) {
      toast.error('Completa nombre, email y contraseña'); return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/usuarios/crear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, password: form.password,
          full_name: form.full_name, role: form.role,
          paises: form.paises, dashboards: form.dashboards }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al crear usuario')
      toast.success(`Usuario ${form.full_name} creado`)
      closeModal(); loadUsers()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  // ── Edit ────────────────────────────────────────────────────────────────────
  const handleEdit = async () => {
    if (!form.full_name) { toast.error('El nombre es requerido'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/usuarios/editar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id:    selected.id,
          full_name:  form.full_name,
          role:       form.role,
          paises:     form.paises,
          dashboards: form.dashboards,
          password:   form.password || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al actualizar usuario')
      toast.success('Usuario actualizado'); closeModal(); loadUsers()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/usuarios/eliminar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: selected.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al eliminar usuario')
      toast.success('Usuario eliminado'); closeModal(); loadUsers()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  // ── Recovery link ───────────────────────────────────────────────────────────
  const handleRecoveryLink = async (u: any) => {
    try {
      const res  = await fetch('/api/usuarios/recovery-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: u.email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al generar enlace')
      await navigator.clipboard.writeText(data.link)
      toast.success(`Enlace copiado al portapapeles — compártelo con ${u.full_name}`)
    } catch (e: any) { toast.error(e.message) }
  }

  // ── Toggle ──────────────────────────────────────────────────────────────────
  const handleToggle = async (u: any) => {
    const { error } = await supabase.from('profiles')
      .update({ is_active: !u.is_active }).eq('id', u.id)
    if (error) { toast.error('Error al actualizar estado'); return }
    toast.success(u.is_active ? 'Usuario desactivado' : 'Usuario activado')
    loadUsers()
  }

  // ── Save dashboards ─────────────────────────────────────────────────────────
  const handleSaveDashboards = async () => {
    setSaving(true)
    const { error } = await supabase.from('profiles')
      .update({ dashboards: form.dashboards, paises: form.paises }).eq('id', selected.id)
    if (error) { toast.error('Error al guardar accesos'); setSaving(false); return }
    toast.success('Accesos actualizados'); closeModal(); loadUsers()
    setSaving(false)
  }

  const filtered = users.filter(u =>
    (u.full_name||'').toLowerCase().includes(search.toLowerCase()) ||
    (u.email||'').toLowerCase().includes(search.toLowerCase())
  )

  const inputStyle = { background:'var(--bg)', borderColor:'var(--border)', color:'var(--t1)' }

  const CheckBtn = ({ active, onClick, children }: any) => (
    <button type="button" onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 rounded-lg border text-[11px] transition-all"
      style={{
        borderColor: active ? 'var(--acc)' : 'var(--border)',
        background:  active ? 'rgba(200,135,58,.08)' : 'transparent',
        color:       active ? 'var(--acc)' : 'var(--t2)',
      }}>
      {children}
    </button>
  )

  return (
    <div className="space-y-5 animate-fade-up">

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { l:'Total',     v:users.length,                                   c:'#2a7a58' },
          { l:'Activos',   v:users.filter(u=>u.is_active).length,            c:'#c8873a' },
          { l:'Inactivos', v:users.filter(u=>!u.is_active).length,           c:'#c0402f' },
          { l:'Admins',    v:users.filter(u=>u.role!=='usuario').length,     c:'#3a6fa8' },
        ].map(k => (
          <div key={k.l} className="card p-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl" style={{background:k.c}} />
            <div className="text-[9px] tracking-[2px] uppercase mb-1" style={{color:'var(--t3)'}}>{k.l}</div>
            <div className="font-display font-bold text-[28px]" style={{color:'var(--t1)'}}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Table Card */}
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{color:'var(--t3)'}} />
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Buscar por nombre o email..."
              className="w-full pl-8 pr-3 py-2 text-[12px] rounded-lg border outline-none"
              style={inputStyle} />
          </div>
          <Btn onClick={openCreate}><UserPlus size={13} /> Nuevo Usuario</Btn>
        </div>

        {loading ? (
          <div className="text-center py-10 text-sm" style={{color:'var(--t3)'}}>Cargando usuarios...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-sm" style={{color:'var(--t3)'}}>No hay usuarios</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr style={{borderBottom:'1px solid var(--border)'}}>
                  {['Usuario','Email','Rol','Dashboards','Países','Estado','Acciones'].map(h=>(
                    <th key={h} className="text-left pb-3 text-[9px] tracking-[1.5px] uppercase font-medium pr-4"
                      style={{color:'var(--t3)'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(u=>(
                  <tr key={u.id} style={{borderBottom:'1px solid var(--border)'}}>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                          style={{background:'var(--acc)'}}>
                          {(u.full_name?.[0]||u.email?.[0]||'U').toUpperCase()}
                        </div>
                        <span className="font-medium" style={{color:'var(--t1)'}}>{u.full_name||'—'}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4" style={{color:'var(--t2)'}}>{u.email||'—'}</td>
                    <td className="py-3 pr-4">
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1"
                        style={{background:ROLE_COLORS[u.role]?.bg,color:ROLE_COLORS[u.role]?.color}}>
                        {u.role==='superadmin'&&<Shield size={9}/>}{u.role||'usuario'}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap gap-1">
                        {(u.dashboards||[]).length===0
                          ? <span style={{color:'var(--t3)'}}>Todos</span>
                          : (u.dashboards||[]).map((d:string)=>(
                            <span key={d} className="text-[9px] px-1.5 py-0.5 rounded font-medium capitalize"
                              style={{background:'rgba(200,135,58,.1)',color:'#c8873a'}}>{d}</span>
                          ))}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap gap-1">
                        {(u.paises||[]).length===0
                          ? <span style={{color:'var(--t3)'}}>Todos</span>
                          : (u.paises||[]).map((p:string)=>(
                            <span key={p} className="text-[9px] px-1.5 py-0.5 rounded"
                              style={{background:'var(--border)',color:'var(--t2)'}}>{p}</span>
                          ))}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <button onClick={()=>handleToggle(u)}
                        className={`text-[10px] px-2.5 py-1 rounded-full font-medium transition-all hover:opacity-75 ${
                          u.is_active?'bg-green-100 text-green-700':'bg-red-100 text-red-600'}`}>
                        {u.is_active?'● Activo':'● Inactivo'}
                      </button>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-1.5">
                        <button onClick={()=>openDashboards(u)} title="Gestionar accesos"
                          className="p-1.5 rounded-lg transition-all hover:bg-brand-500/10"
                          style={{color:'var(--t3)'}}>
                          <LayoutDashboard size={13} />
                        </button>
                        <button onClick={()=>openEdit(u)} title="Editar"
                          className="p-1.5 rounded-lg transition-all hover:bg-blue-500/10 hover:text-blue-500"
                          style={{color:'var(--t3)'}}>
                          <Pencil size={13} />
                        </button>
                        <button onClick={()=>handleRecoveryLink(u)} title="Copiar enlace de reseteo"
                          className="p-1.5 rounded-lg transition-all hover:bg-amber-500/10 hover:text-amber-500"
                          style={{color:'var(--t3)'}}>
                          <Link2 size={13} />
                        </button>
                        <button onClick={()=>openDelete(u)} title="Eliminar"
                          className="p-1.5 rounded-lg transition-all hover:bg-red-500/10 hover:text-red-500"
                          style={{color:'var(--t3)'}}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal Crear/Editar ── */}
      {(modal==='create'||modal==='edit') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="card w-full max-w-lg animate-fade-up">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{borderColor:'var(--border)'}}>
              <div className="font-display font-bold text-base" style={{color:'var(--t1)'}}>
                {modal==='create'?'Nuevo Usuario':'Editar Usuario'}
              </div>
              <button onClick={closeModal} style={{color:'var(--t3)'}} className="hover:opacity-70 ml-4"><X size={16}/></button>
            </div>

            {/* Body — 2 columnas para compactar */}
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] uppercase tracking-[1.5px] block mb-1" style={{color:'var(--t3)'}}>Nombre Completo *</label>
                  <input type="text" value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})}
                    placeholder="María García"
                    className="w-full px-3 py-1.5 text-sm rounded-lg border outline-none" style={inputStyle} />
                </div>
                <div>
                  <label className="text-[9px] uppercase tracking-[1.5px] block mb-1" style={{color:'var(--t3)'}}>Correo Electrónico *</label>
                  <input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}
                    placeholder="usuario@blfoods.com" disabled={modal==='edit'}
                    className="w-full px-3 py-1.5 text-sm rounded-lg border outline-none disabled:opacity-50" style={inputStyle} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] uppercase tracking-[1.5px] block mb-1" style={{color:'var(--t3)'}}>
                    {modal==='create'?'Contraseña *':'Nueva Contraseña'}
                  </label>
                  <div className="relative">
                    <input type={showPass?'text':'password'} value={form.password}
                      onChange={e=>setForm({...form,password:e.target.value})}
                      placeholder={modal==='create'?'Mínimo 6 caracteres':'vacío = sin cambio'}
                      className="w-full px-3 py-1.5 pr-8 text-sm rounded-lg border outline-none" style={inputStyle} />
                    <button type="button" onClick={()=>setShowPass(!showPass)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{color:'var(--t3)'}}>
                      {showPass?<EyeOff size={12}/>:<Eye size={12}/>}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-[9px] uppercase tracking-[1.5px] block mb-1" style={{color:'var(--t3)'}}>Rol</label>
                  <select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}
                    className="w-full px-3 py-1.5 text-sm rounded-lg border outline-none" style={inputStyle}>
                    <option value="usuario">Usuario</option>
                    <option value="admin">Admin</option>
                    <option value="superadmin">SuperAdmin</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[9px] uppercase tracking-[1.5px] block mb-1.5" style={{color:'var(--t3)'}}>Dashboards Permitidos</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {DEPTS.map(d=>(
                    <CheckBtn key={d.id} active={form.dashboards.includes(d.id)}
                      onClick={()=>setForm({...form,dashboards:toggleArr(form.dashboards,d.id)})}>
                      <span>{d.icon}</span>{d.label}
                    </CheckBtn>
                  ))}
                </div>
                <div className="text-[9px] mt-1" style={{color:'var(--t3)'}}>Sin selección = todos</div>
              </div>

              <div>
                <label className="text-[9px] uppercase tracking-[1.5px] block mb-1.5" style={{color:'var(--t3)'}}>Países Permitidos</label>
                <div className="flex flex-wrap gap-1.5">
                  {PAISES.map(p=>(
                    <CheckBtn key={p} active={form.paises.includes(p)}
                      onClick={()=>setForm({...form,paises:toggleArr(form.paises,p)})}>
                      {p}
                    </CheckBtn>
                  ))}
                </div>
                <div className="text-[9px] mt-1" style={{color:'var(--t3)'}}>Sin selección = todos los países</div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-2 px-5 pb-4">
              <Btn onClick={modal==='create'?handleCreate:handleEdit} disabled={saving} className="flex-1 justify-center">
                {saving?'Guardando...':(modal==='create'?'Crear Usuario':'Guardar Cambios')}
              </Btn>
              <Btn variant="ghost" onClick={closeModal}>Cancelar</Btn>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Dashboards ── */}
      {modal==='dashboards' && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="card w-full max-w-md p-6 animate-fade-up">
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="font-display font-bold text-lg" style={{color:'var(--t1)'}}>Gestionar Accesos</div>
                <div className="text-[11px] mt-0.5" style={{color:'var(--t3)'}}>{selected.full_name}</div>
              </div>
              <button onClick={closeModal} style={{color:'var(--t3)'}}><X size={16}/></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[9px] uppercase tracking-[1.5px] block mb-2" style={{color:'var(--t3)'}}>Dashboards</label>
                <div className="grid grid-cols-2 gap-2">
                  {DEPTS.map(d=>(
                    <CheckBtn key={d.id} active={form.dashboards.includes(d.id)}
                      onClick={()=>setForm({...form,dashboards:toggleArr(form.dashboards,d.id)})}>
                      <span>{d.icon}</span>{d.label}
                    </CheckBtn>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[9px] uppercase tracking-[1.5px] block mb-2" style={{color:'var(--t3)'}}>Países</label>
                <div className="flex flex-wrap gap-2">
                  {PAISES.map(p=>(
                    <CheckBtn key={p} active={form.paises.includes(p)}
                      onClick={()=>setForm({...form,paises:toggleArr(form.paises,p)})}>
                      {p}
                    </CheckBtn>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <Btn onClick={handleSaveDashboards} disabled={saving} className="flex-1 justify-center">
                {saving?'Guardando...':'Guardar Accesos'}
              </Btn>
              <Btn variant="ghost" onClick={closeModal}>Cancelar</Btn>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Eliminar ── */}
      {modal==='delete' && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="card w-full max-w-sm p-6 animate-fade-up text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={20} className="text-red-500"/>
            </div>
            <div className="font-display font-bold text-lg mb-1" style={{color:'var(--t1)'}}>Eliminar Usuario</div>
            <div className="text-[12px] mb-6" style={{color:'var(--t3)'}}>
              ¿Eliminar a <strong style={{color:'var(--t1)'}}>{selected.full_name}</strong>?
              Esta acción no se puede deshacer.
            </div>
            <div className="flex gap-2">
              <Btn variant="danger" onClick={handleDelete} disabled={saving} className="flex-1 justify-center">
                {saving?'Eliminando...':'Sí, eliminar'}
              </Btn>
              <Btn variant="ghost" onClick={closeModal} className="flex-1 justify-center">Cancelar</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
