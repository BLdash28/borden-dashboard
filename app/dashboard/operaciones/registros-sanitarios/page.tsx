'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import AlertasVencimiento from '@/components/registros-sanitarios/AlertasVencimiento'
import TablaRegistros from '@/components/registros-sanitarios/TablaRegistros'
import FormRegistroSanitario from '@/components/registros-sanitarios/FormRegistroSanitario'
import { Plus, Search } from 'lucide-react'
import { Btn } from '@/components/ui'
import { COUNTRY_FLAGS } from '@/utils/helpers'

const PAISES = ['','GT','SV','CO','CR','NI']

export default function RegistrosSanitariosPage() {
  const [registros, setRegistros]   = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [editando, setEditando]     = useState<any>(null)
  const [filtroPais, setFiltroPais] = useState('')
  const [busqueda, setBusqueda]     = useState('')
  const [profile, setProfile]       = useState<any>(null)
  const supabase = createClient()

  useEffect(() => {
    loadProfile()
    loadRegistros()
  }, [])

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(data)
  }

  const loadRegistros = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('registros_sanitarios')
      .select('*')
      .order('fecha_vencimiento', { ascending: true })
    if (error) toast.error('Error al cargar registros')
    setRegistros(data || [])
    setLoading(false)
  }, [])

  const handleSave = async (registro: any, archivo?: File) => {
    try {
      let archivo_pdf_url = registro.archivo_pdf_url || null

      // Upload PDF if provided
      if (archivo) {
        const ext     = archivo.name.split('.').pop()
        const nombre  = `${registro.pais}_${registro.numero_registro.replace(/[^a-zA-Z0-9]/g,'_')}.${ext}`
        const path    = `registros/${nombre}`

        const { error: upErr } = await supabase.storage
          .from('registros-sanitarios')
          .upload(path, archivo, { upsert: true })

        if (upErr) throw new Error('Error al subir PDF: ' + upErr.message)

        const { data: urlData } = supabase.storage
          .from('registros-sanitarios')
          .getPublicUrl(path)

        archivo_pdf_url = urlData.publicUrl
      }

      const payload = {
        nombre_producto:   registro.nombre_producto,
        pais:              registro.pais,
        numero_registro:   registro.numero_registro,
        empresa:           registro.empresa,
        tramitante:        registro.tramitante,
        fecha_vencimiento: registro.fecha_vencimiento,
        archivo_pdf_url,
      }

      if (editando) {
        const { error } = await supabase
          .from('registros_sanitarios')
          .update(payload)
          .eq('id', editando.id)
        if (error) throw error
        toast.success('Registro actualizado')
      } else {
        const { error } = await supabase
          .from('registros_sanitarios')
          .insert(payload)
        if (error) throw error
        toast.success('Registro creado exitosamente')
      }

      setShowForm(false)
      setEditando(null)
      loadRegistros()
    } catch (e: any) {
      toast.error(e.message || 'Error al guardar registro')
    }
  }

  const handleEdit = (reg: any) => {
    setEditando(reg)
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('registros_sanitarios').delete().eq('id', id)
    if (error) { toast.error('Error al eliminar'); return }
    toast.success('Registro eliminado')
    loadRegistros()
  }

  const handleOpenPDF = async (reg: any) => {
    if (!reg.archivo_pdf_url) { toast.error('No hay archivo PDF adjunto'); return }
    window.open(reg.archivo_pdf_url, '_blank')
  }

  const handleCloseForm = () => { setShowForm(false); setEditando(null) }

  const isAdmin = profile?.role === 'superadmin' || profile?.role === 'admin'

  const filtered = registros.filter(r => {
    if (filtroPais && r.pais !== filtroPais) return false
    if (busqueda) {
      const b = busqueda.toLowerCase()
      if (!r.nombre_producto?.toLowerCase().includes(b) &&
          !r.empresa?.toLowerCase().includes(b) &&
          !r.numero_registro?.toLowerCase().includes(b) &&
          !r.tramitante?.toLowerCase().includes(b)) return false
    }
    return true
  })

  // Stats para KPIs
  const today     = new Date()
  const dias90    = new Date(today); dias90.setDate(today.getDate() + 90)
  const dias30    = new Date(today); dias30.setDate(today.getDate() + 30)
  const vencidos  = registros.filter(r => new Date(r.fecha_vencimiento) < today)
  const proximos30 = registros.filter(r => { const d = new Date(r.fecha_vencimiento); return d >= today && d <= dias30 })
  const proximos90 = registros.filter(r => { const d = new Date(r.fecha_vencimiento); return d > dias30 && d <= dias90 })
  const vigentes   = registros.filter(r => new Date(r.fecha_vencimiento) > dias90)

  return (
    <div className="space-y-5 animate-fade-up">

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl" style={{ background: '#2a7a58' }} />
          <div className="text-[9px] tracking-[2px] uppercase mb-1" style={{ color: 'var(--t3)' }}>Total Registros</div>
          <div className="font-display font-bold text-[28px]" style={{ color: 'var(--t1)' }}>{registros.length}</div>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--t3)' }}>{vigentes.length} vigentes</div>
        </div>

        <div className="card p-4 relative overflow-hidden border-l-0">
          <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl" style={{ background: '#ef4444' }} />
          <div className="text-[9px] tracking-[2px] uppercase mb-1" style={{ color: 'var(--t3)' }}>Vencidos</div>
          <div className="font-display font-bold text-[28px]" style={{ color: vencidos.length > 0 ? '#ef4444' : 'var(--t1)' }}>
            {vencidos.length}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--t3)' }}>requieren renovación</div>
        </div>

        <div className="card p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl" style={{ background: '#f97316' }} />
          <div className="text-[9px] tracking-[2px] uppercase mb-1" style={{ color: 'var(--t3)' }}>Vencen en 30 días</div>
          <div className="font-display font-bold text-[28px]" style={{ color: proximos30.length > 0 ? '#f97316' : 'var(--t1)' }}>
            {proximos30.length}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--t3)' }}>alerta naranja</div>
        </div>

        <div className="card p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl" style={{ background: '#eab308' }} />
          <div className="text-[9px] tracking-[2px] uppercase mb-1" style={{ color: 'var(--t3)' }}>Vencen en 90 días</div>
          <div className="font-display font-bold text-[28px]" style={{ color: proximos90.length > 0 ? '#ca8a04' : 'var(--t1)' }}>
            {proximos90.length}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--t3)' }}>alerta amarilla</div>
        </div>
      </div>

      {/* Alertas */}
      <AlertasVencimiento registros={registros} />

      {/* Tabla */}
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row gap-3 mb-5 items-start sm:items-center justify-between">
          <div className="flex gap-2.5 flex-1 w-full sm:w-auto">
            {/* Búsqueda */}
            <div className="relative flex-1">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--t3)' }} />
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar producto, empresa, registro..."
                className="w-full pl-8 pr-3 py-2 text-[12px] rounded-lg border outline-none"
                style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--t1)' }} />
            </div>
            {/* Filtro País */}
            <select value={filtroPais} onChange={e => setFiltroPais(e.target.value)}
              className="px-3 py-2 text-[11px] rounded-lg border outline-none"
              style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--t1)' }}>
              {PAISES.map(p => (
                <option key={p} value={p}>{p === '' ? 'Todos los países' : `${COUNTRY_FLAGS[p]} ${p}`}</option>
              ))}
            </select>
          </div>
          {isAdmin && (
            <Btn onClick={() => { setEditando(null); setShowForm(true) }}>
              <Plus size={13} /> Nuevo Registro Sanitario
            </Btn>
          )}
        </div>

        <TablaRegistros
          registros={filtered}
          loading={loading}
          isAdmin={isAdmin}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onViewPDF={handleOpenPDF}
        />
      </div>

      {/* Modal Formulario */}
      {showForm && (
        <FormRegistroSanitario
          initial={editando}
          onSave={handleSave}
          onClose={handleCloseForm}
        />
      )}
    </div>
  )
}
