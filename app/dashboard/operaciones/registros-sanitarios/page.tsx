'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import AlertasVencimiento from '@/components/registros-sanitarios/AlertasVencimiento'
import TablaRegistros from '@/components/registros-sanitarios/TablaRegistros'
import FormRegistroSanitario from '@/components/registros-sanitarios/FormRegistroSanitario'
import { Plus, Search } from 'lucide-react'
import { Btn } from '@/components/ui'
import MultiSelect from '@/components/dashboard/MultiSelect'
import { COUNTRY_FLAGS } from '@/utils/helpers'

const PAISES = ['GT','SV','CO','CR','NI','HN']

function addDays(base: Date, d: number) {
  const r = new Date(base); r.setDate(r.getDate() + d); return r
}

export default function RegistrosSanitariosPage() {
  const [registros, setRegistros]         = useState<any[]>([])
  const [dimProducto, setDimProducto]     = useState<any[]>([])
  const [loading, setLoading]             = useState(true)
  const [showForm, setShowForm]           = useState(false)
  const [editando, setEditando]           = useState<any>(null)
  const [filtroPaises, setFiltroPaises]             = useState<string[]>([])
  const [filtroPortafolios, setFiltroPortafolios]   = useState<string[]>([])
  const [filtroClasificaciones, setFiltroClasificaciones] = useState<string[]>([])
  const [busqueda, setBusqueda]           = useState('')
  const [profile, setProfile]             = useState<any>(null)
  const supabase = createClient()

  useEffect(() => {
    loadProfile()
    loadRegistros()
    loadDimProducto()
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

  const loadDimProducto = async () => {
    const { data } = await supabase
      .from('dim_producto')
      .select('sku, codigo_barras, descripcion, categoria, subcategoria')
      .eq('is_active', true)
    setDimProducto(data || [])
  }

  const handleSave = async (registro: any, archivo?: File) => {
    try {
      let archivo_pdf_url = registro.archivo_pdf_url || null

      if (archivo) {
        const ext    = archivo.name.split('.').pop()
        const nombre = `${registro.pais}_${registro.numero_registro.replace(/[^a-zA-Z0-9]/g,'_')}.${ext}`
        const path   = `registros/${nombre}`

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
        pais:            registro.pais,
        portafolio:      registro.portafolio      || null,
        clasificacion:   registro.clasificacion   || null,
        cod_dfa:         registro.cod_dfa         || null,
        ean:             registro.ean             || null,
        descripcion:     registro.descripcion,
        numero_registro: registro.numero_registro,
        tramitador:      registro.tramitador      || null,
        dueno_registro:  registro.dueno_registro  || null,
        importador:      registro.importador      || null,
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

  const handleEdit    = (reg: any) => { setEditando(reg); setShowForm(true) }
  const handleDelete  = async (id: string) => {
    const { error } = await supabase.from('registros_sanitarios').delete().eq('id', id)
    if (error) { toast.error('Error al eliminar'); return }
    toast.success('Registro eliminado')
    loadRegistros()
  }
  const handleOpenPDF = (reg: any) => {
    if (!reg.archivo_pdf_url) { toast.error('No hay archivo PDF adjunto'); return }
    window.open(reg.archivo_pdf_url, '_blank')
  }
  const handleCloseForm = () => { setShowForm(false); setEditando(null) }

  const isAdmin = profile?.role === 'superadmin' || profile?.role === 'admin'

  // ── Filtros ────────────────────────────────────────────────────────────
  const portafolios     = [...new Set(registros.map(r => r.portafolio).filter(Boolean))].sort() as string[]
  const clasificaciones = [...new Set(registros.map(r => r.clasificacion).filter(Boolean))].sort() as string[]

  const filtered = registros.filter(r => {
    if (filtroPaises.length       && !filtroPaises.includes(r.pais))             return false
    if (filtroPortafolios.length  && !filtroPortafolios.includes(r.portafolio))  return false
    if (filtroClasificaciones.length && !filtroClasificaciones.includes(r.clasificacion)) return false
    if (busqueda) {
      const b = busqueda.toLowerCase()
      if (!r.descripcion?.toLowerCase().includes(b) &&
          !r.dueno_registro?.toLowerCase().includes(b) &&
          !r.numero_registro?.toLowerCase().includes(b) &&
          !r.tramitador?.toLowerCase().includes(b) &&
          !r.ean?.toLowerCase().includes(b) &&
          !r.cod_dfa?.toLowerCase().includes(b) &&
          !r.portafolio?.toLowerCase().includes(b)) return false
    }
    return true
  })

  // ── KPI buckets ───────────────────────────────────────────────────────
  const today  = new Date(); today.setHours(0, 0, 0, 0)
  const d90    = addDays(today, 90)
  const d180   = addDays(today, 180)
  const d270   = addDays(today, 270)
  const d365   = addDays(today, 365)

  const kpi = {
    vencidos:  registros.filter(r => new Date(r.fecha_vencimiento) < today).length,
    d90:       registros.filter(r => { const d = new Date(r.fecha_vencimiento); return d >= today && d <= d90  }).length,
    d180:      registros.filter(r => { const d = new Date(r.fecha_vencimiento); return d > d90  && d <= d180 }).length,
    d270:      registros.filter(r => { const d = new Date(r.fecha_vencimiento); return d > d180 && d <= d270 }).length,
    d365:      registros.filter(r => { const d = new Date(r.fecha_vencimiento); return d > d270 && d <= d365 }).length,
    vigentes:  registros.filter(r => new Date(r.fecha_vencimiento) > d365).length,
  }

  const KPI_CARDS = [
    { label: 'Vencidos',     value: kpi.vencidos, sub: 'requieren renovación', color: '#ef4444', alert: kpi.vencidos > 0 },
    { label: '≤ 90 días',    value: kpi.d90,      sub: 'próximos 3 meses',    color: '#f97316', alert: kpi.d90 > 0 },
    { label: '3 – 6 meses',  value: kpi.d180,     sub: 'próximos 6 meses',    color: '#fb923c', alert: kpi.d180 > 0 },
    { label: '6 – 9 meses',  value: kpi.d270,     sub: 'próximos 9 meses',    color: '#f59e0b', alert: kpi.d270 > 0 },
    { label: '9 – 12 meses', value: kpi.d365,     sub: 'próximo año',         color: '#eab308', alert: kpi.d365 > 0 },
    { label: 'Vigentes',     value: kpi.vigentes, sub: 'más de 1 año',        color: '#2a7a58', alert: false },
  ]

  return (
    <div className="space-y-5 animate-fade-up">

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {KPI_CARDS.map(k => (
          <div key={k.label} className="card p-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl" style={{ background: k.color }} />
            <div className="text-[9px] tracking-[2px] uppercase mb-1 truncate" style={{ color: 'var(--t3)' }}>{k.label}</div>
            <div className="font-display font-bold text-[28px]"
              style={{ color: k.alert ? k.color : 'var(--t1)' }}>
              {k.value}
            </div>
            <div className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--t3)' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Alertas */}
      <AlertasVencimiento registros={registros} />

      {/* Tabla */}
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row gap-3 mb-5 items-start sm:items-center justify-between">
          <div className="flex flex-wrap gap-2 items-center flex-1 w-full sm:w-auto">

            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--t3)' }} />
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar..."
                className="pl-9 pr-3 py-2.5 text-[13px] rounded-lg border outline-none w-[200px]"
                style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--t1)' }} />
            </div>

            <div className="w-[160px]">
              <MultiSelect value={filtroPaises} onChange={setFiltroPaises} label=""
                options={PAISES.map(p => ({ value: p, label: `${COUNTRY_FLAGS[p]} ${p}` }))}
                placeholder="País" selectAllLabel="Todos los países" />
            </div>

            <div className="w-[180px]">
              <MultiSelect value={filtroPortafolios} onChange={setFiltroPortafolios} label=""
                options={portafolios.map(p => ({ value: p, label: p }))}
                placeholder="Portafolio" selectAllLabel="Todos" />
            </div>

            <div className="w-[190px]">
              <MultiSelect value={filtroClasificaciones} onChange={setFiltroClasificaciones} label=""
                options={clasificaciones.map(c => ({ value: c, label: c }))}
                placeholder="Clasificación" selectAllLabel="Todas" />
            </div>

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
          dimProducto={dimProducto}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onViewPDF={handleOpenPDF}
        />
      </div>

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
