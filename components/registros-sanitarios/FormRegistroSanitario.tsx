'use client'
import { useState, useRef } from 'react'
import { X, Upload, FileText, Loader2 } from 'lucide-react'
import { Btn } from '@/components/ui'
import { COUNTRY_FLAGS } from '@/utils/helpers'

const PAISES = ['GT','SV','CO','CR','NI']

interface Props {
  initial?: any
  onSave:   (data: any, archivo?: File) => Promise<void>
  onClose:  () => void
}

const EMPTY = {
  nombre_producto: '', pais: 'CR', numero_registro: '',
  empresa: '', tramitante: '', fecha_vencimiento: '',
}

export default function FormRegistroSanitario({ initial, onSave, onClose }: Props) {
  const [form, setForm]       = useState(initial ? {
    nombre_producto: initial.nombre_producto || '',
    pais:            initial.pais || 'CR',
    numero_registro: initial.numero_registro || '',
    empresa:         initial.empresa || '',
    tramitante:      initial.tramitante || '',
    fecha_vencimiento: initial.fecha_vencimiento || '',
  } : { ...EMPTY })

  const [archivo, setArchivo]   = useState<File | null>(null)
  const [saving, setSaving]     = useState(false)
  const [errors, setErrors]     = useState<Record<string, string>>({})
  const fileRef                 = useRef<HTMLInputElement>(null)

  const set = (k: string, v: any) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => ({ ...e, [k]: '' }))
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.nombre_producto.trim()) e.nombre_producto = 'Requerido'
    if (!form.pais)                   e.pais = 'Requerido'
    if (!form.numero_registro.trim()) e.numero_registro = 'Requerido'
    if (!form.empresa.trim())         e.empresa = 'Requerido'
    if (!form.tramitante.trim())      e.tramitante = 'Requerido'
    if (!form.fecha_vencimiento)      e.fecha_vencimiento = 'Requerido'
    if (!initial && !archivo)         e.archivo = 'El PDF es requerido para nuevos registros'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setSaving(true)
    await onSave(form, archivo || undefined)
    setSaving(false)
  }

  const inputStyle = { background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--t1)' }
  const Field = ({ label, error, children }: any) => (
    <div>
      <label className="text-[9px] uppercase tracking-[1.5px] block mb-1" style={{ color: 'var(--t3)' }}>
        {label}
      </label>
      {children}
      {error && <div className="text-[10px] mt-0.5 text-red-500">{error}</div>}
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-xl animate-fade-up">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="font-display font-bold text-base" style={{ color: 'var(--t1)' }}>
            {initial ? 'Editar Registro Sanitario' : 'Nuevo Registro Sanitario'}
          </div>
          <button onClick={onClose} style={{ color: 'var(--t3)' }} className="hover:opacity-70 ml-4">
            <X size={16} />
          </button>
        </div>

        {/* Body — compacto */}
        <div className="px-5 py-4 space-y-3">

          {/* Nombre */}
          <Field label="Nombre del Producto *" error={errors.nombre_producto}>
            <input type="text" value={form.nombre_producto} onChange={e => set('nombre_producto', e.target.value)}
              placeholder="Ej: Queso Mozzarella 226GR"
              className="w-full px-3 py-1.5 text-[13px] rounded-lg border outline-none"
              style={{ ...inputStyle, borderColor: errors.nombre_producto ? '#ef4444' : 'var(--border)' }} />
          </Field>

          {/* País + N° Registro */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="País *" error={errors.pais}>
              <select value={form.pais} onChange={e => set('pais', e.target.value)}
                className="w-full px-3 py-1.5 text-[13px] rounded-lg border outline-none"
                style={{ ...inputStyle, borderColor: errors.pais ? '#ef4444' : 'var(--border)' }}>
                {PAISES.map(p => (
                  <option key={p} value={p}>{COUNTRY_FLAGS[p]} {p}</option>
                ))}
              </select>
            </Field>
            <Field label="N° Registro Sanitario *" error={errors.numero_registro}>
              <input type="text" value={form.numero_registro} onChange={e => set('numero_registro', e.target.value)}
                placeholder="RS-CR-2024-0001"
                className="w-full px-3 py-1.5 text-[13px] rounded-lg border outline-none"
                style={{ ...inputStyle, borderColor: errors.numero_registro ? '#ef4444' : 'var(--border)' }} />
            </Field>
          </div>

          {/* Empresa + Tramitante */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Empresa *" error={errors.empresa}>
              <input type="text" value={form.empresa} onChange={e => set('empresa', e.target.value)}
                placeholder="BL Foods CR S.A."
                className="w-full px-3 py-1.5 text-[13px] rounded-lg border outline-none"
                style={{ ...inputStyle, borderColor: errors.empresa ? '#ef4444' : 'var(--border)' }} />
            </Field>
            <Field label="Empresa Tramitante *" error={errors.tramitante}>
              <input type="text" value={form.tramitante} onChange={e => set('tramitante', e.target.value)}
                placeholder="Tramitec CR"
                className="w-full px-3 py-1.5 text-[13px] rounded-lg border outline-none"
                style={{ ...inputStyle, borderColor: errors.tramitante ? '#ef4444' : 'var(--border)' }} />
            </Field>
          </div>

          {/* Fecha + PDF en row */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha de Vencimiento *" error={errors.fecha_vencimiento}>
              <input type="date" value={form.fecha_vencimiento} onChange={e => set('fecha_vencimiento', e.target.value)}
                className="w-full px-3 py-1.5 text-[13px] rounded-lg border outline-none"
                style={{ ...inputStyle, borderColor: errors.fecha_vencimiento ? '#ef4444' : 'var(--border)' }} />
            </Field>
            <Field label={initial ? 'Reemplazar PDF' : 'Archivo PDF *'} error={errors.archivo}>
              <div
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed rounded-lg px-3 py-1.5 text-center cursor-pointer transition-all hover:border-brand-500 flex items-center justify-center gap-2"
                style={{
                  borderColor: errors.archivo ? '#ef4444' : archivo ? 'var(--acc)' : 'var(--border)',
                  background: archivo ? 'rgba(200,135,58,.05)' : 'var(--bg)',
                  minHeight: 36,
                }}>
                {archivo ? (
                  <span className="text-[11px] font-medium truncate max-w-full" style={{ color: 'var(--acc)' }}>
                    <FileText size={12} className="inline mr-1" />{archivo.name}
                  </span>
                ) : initial?.archivo_pdf_url ? (
                  <span className="text-[11px]" style={{ color: 'var(--t3)' }}>
                    <FileText size={12} className="inline mr-1" />PDF guardado · reemplazar
                  </span>
                ) : (
                  <span className="text-[11px]" style={{ color: 'var(--t3)' }}>
                    <Upload size={12} className="inline mr-1" />Adjuntar PDF
                  </span>
                )}
              </div>
              <input ref={fileRef} type="file" accept=".pdf" className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  if (f.size > 10 * 1024 * 1024) { setErrors(er => ({ ...er, archivo: 'Máximo 10MB' })); return }
                  setArchivo(f)
                  setErrors(er => ({ ...er, archivo: '' }))
                }} />
            </Field>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2.5 px-5 pb-4">
          <Btn onClick={handleSubmit} disabled={saving} className="flex-1 justify-center">
            {saving ? <><Loader2 size={13} className="animate-spin" /> Guardando...</> : (initial ? 'Guardar Cambios' : 'Crear Registro')}
          </Btn>
          <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Btn>
        </div>
      </div>
    </div>
  )
}
