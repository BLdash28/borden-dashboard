'use client'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Upload, FileText, Loader2, CheckCircle2, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const PAISES = ['GT', 'SV', 'CO', 'CR', 'NI', 'HN']

interface DimProducto {
  sku: string
  codigo_barras: string
  descripcion: string
  categoria: string | null
  subcategoria: string | null
}

interface Props {
  initial?: any
  onSave:   (data: any, archivo?: File) => Promise<void>
  onClose:  () => void
}

const EMPTY = {
  pais:            'CR',
  portafolio:      '',
  clasificacion:   '',
  cod_dfa:         '',
  ean:             '',
  descripcion:     '',
  numero_registro: '',
  tramitador:      '',
  dueno_registro:  '',
  importador:      '',
  fecha_vencimiento: '',
}

export default function FormRegistroSanitario({ initial, onSave, onClose }: Props) {
  const [form, setForm] = useState(initial ? {
    pais:                    initial.pais                    || 'CR',
    portafolio:              initial.portafolio              || '',
    clasificacion:           initial.clasificacion           || '',
    cod_dfa:                 initial.cod_dfa                 || '',
    ean:                     initial.ean                     || '',
    descripcion:             initial.descripcion             || '',
    numero_registro:         initial.numero_registro         || '',
    tramitador:      initial.tramitador      || '',
    dueno_registro:  initial.dueno_registro  || '',
    importador:      initial.importador      || '',
    fecha_vencimiento: initial.fecha_vencimiento || '',
  } : { ...EMPTY })

  const [archivo, setArchivo]             = useState<File | null>(null)
  const [saving, setSaving]               = useState(false)
  const [errors, setErrors]               = useState<Record<string, string>>({})
  const [eanMatch, setEanMatch]           = useState<DimProducto | null>(null)
  const [eanLoading, setEanLoading]       = useState(false)
  const [matchVia, setMatchVia]           = useState<'ean' | 'dfa' | null>(null)
  const [tramitadores, setTramitadores]   = useState<string[]>([])
  const [duenos, setDuenos]               = useState<string[]>([])
  const [importadores, setImportadores]   = useState<string[]>([])
  const fileRef                           = useRef<HTMLInputElement>(null)
  const supabase                          = createClient()

  useEffect(() => {
    if (initial?.ean || initial?.cod_dfa) buscarMatch(initial?.ean || '', initial?.cod_dfa || '')
    loadDropdownOptions()
  }, [])

  const loadDropdownOptions = async () => {
    const { data } = await supabase
      .from('registros_sanitarios')
      .select('tramitador, dueno_registro, importador')
    if (!data) return
    const tSet = new Set<string>()
    const dSet = new Set<string>()
    const iSet = new Set<string>()
    data.forEach(r => {
      if (r.tramitador)     tSet.add(r.tramitador)
      if (r.dueno_registro) dSet.add(r.dueno_registro)
      if (r.importador)     iSet.add(r.importador)
    })
    ;['MIRSA', 'IDEAS', 'SPI', 'UNISUPER', 'CENTROLAC'].forEach(v => tSet.add(v))
    ;['UNISUPER', 'BL FOODS'].forEach(v => dSet.add(v))
    ;['WALMART', 'UNISUPER', 'CALLEJAS', 'COSTA DAIRY'].forEach(v => iSet.add(v))
    setTramitadores([...tSet].sort())
    setDuenos([...dSet].sort())
    setImportadores([...iSet].sort())
  }

  const set = (k: string, v: any) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => ({ ...e, [k]: '' }))
  }

  const buscarMatch = async (ean: string, codDfa: string) => {
    const eanVal = ean.trim()
    const dfaVal = codDfa.trim()
    if (!eanVal && !dfaVal) { setEanMatch(null); setMatchVia(null); return }
    setEanLoading(true)
    // Try EAN first
    if (eanVal) {
      const { data } = await supabase
        .from('dim_producto')
        .select('sku, codigo_barras, descripcion, categoria, subcategoria')
        .eq('codigo_barras', eanVal)
        .eq('is_active', true)
        .maybeSingle()
      if (data) { setEanMatch(data); setMatchVia('ean'); setEanLoading(false); return }
    }
    // Fallback: COD DFA → SKU
    if (dfaVal) {
      const { data } = await supabase
        .from('dim_producto')
        .select('sku, codigo_barras, descripcion, categoria, subcategoria')
        .eq('sku', dfaVal)
        .eq('is_active', true)
        .maybeSingle()
      if (data) { setEanMatch(data); setMatchVia('dfa'); setEanLoading(false); return }
    }
    setEanMatch(null); setMatchVia(null); setEanLoading(false)
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.pais)                   e.pais            = 'Selecciona un país'
    if (!form.descripcion.trim())     e.descripcion     = 'Requerido'
    if (!form.numero_registro.trim()) e.numero_registro = 'Requerido'
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

  const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all bg-white'
  const errCls   = 'border-red-300 focus:border-red-400 focus:ring-red-400/20'

  const Label = ({ children }: any) => (
    <label className="block text-xs font-medium text-gray-600 mb-1">{children}</label>
  )
  const Err = ({ msg }: { msg?: string }) =>
    msg ? <p className="text-xs text-red-500 mt-1">{msg}</p> : null

  const modal = (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-10 pb-6 px-4 bg-black/40 overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white rounded-xl shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">
            {initial ? 'Editar Registro Sanitario' : 'Nuevo Registro Sanitario'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors ml-4">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="px-6 py-5 space-y-7 max-h-[calc(100vh-12rem)] overflow-y-auto">

          {/* ── 1. País ─────────────────────────────────────────────── */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-1 border-b border-gray-100">
              1. País
            </h3>
            <div className="flex flex-wrap gap-2">
              {PAISES.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => set('pais', p)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
                    form.pais === p
                      ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-amber-300'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <Err msg={errors.pais} />
          </section>

          {/* ── 2. Identificación del producto ──────────────────────── */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-1 border-b border-gray-100">
              2. Identificación del Producto
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              <div>
                <Label>Portafolio</Label>
                <input type="text" value={form.portafolio}
                  onChange={e => set('portafolio', e.target.value)}
                  placeholder="Ej: Lácteos Premium"
                  className={inputCls} />
              </div>

              <div>
                <Label>Clasificación</Label>
                <input type="text" value={form.clasificacion}
                  onChange={e => set('clasificacion', e.target.value)}
                  placeholder="Ej: Leche Entera"
                  className={inputCls} />
              </div>

              <div>
                <Label>COD DFA</Label>
                <input type="text" value={form.cod_dfa}
                  onChange={e => { set('cod_dfa', e.target.value); buscarMatch(form.ean, e.target.value) }}
                  placeholder="Ej: 130623"
                  className={inputCls} />
              </div>

              <div>
                <Label>EAN — Código de Barras</Label>
                <div className="relative">
                  <input
                    type="text"
                    value={form.ean}
                    onChange={e => { set('ean', e.target.value); buscarMatch(e.target.value, form.cod_dfa) }}
                    placeholder="Ej: 7501234567890"
                    className={`${inputCls} pr-9`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    {eanLoading
                      ? <Loader2 size={14} className="animate-spin text-gray-400" />
                      : eanMatch
                      ? <CheckCircle2 size={14} className="text-green-500" />
                      : form.ean
                      ? <Search size={14} className="text-gray-300" />
                      : null}
                  </span>
                </div>
                {eanMatch && (
                  <div className="mt-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-xs space-y-0.5">
                    <div className="font-semibold text-green-700">
                      Match en dim_producto · vía {matchVia === 'dfa' ? 'COD DFA' : 'EAN'}
                    </div>
                    <div className="text-gray-700">
                      <span className="text-gray-400">SKU:</span> {eanMatch.sku} · {eanMatch.descripcion}
                    </div>
                    {(eanMatch.categoria || eanMatch.subcategoria) && (
                      <div className="text-gray-400">
                        {eanMatch.categoria}{eanMatch.subcategoria ? ` › ${eanMatch.subcategoria}` : ''}
                      </div>
                    )}
                  </div>
                )}
                {!eanLoading && !eanMatch && (form.ean || form.cod_dfa) && (
                  <p className="text-xs text-gray-400 mt-1">Sin match en dim_producto</p>
                )}
              </div>

              <div className="sm:col-span-2">
                <Label>Descripción del proveedor *</Label>
                <input type="text" value={form.descripcion}
                  onChange={e => set('descripcion', e.target.value)}
                  placeholder="Descripción tal como aparece en el registro legal"
                  className={`${inputCls} ${errors.descripcion ? errCls : ''}`} />
                <Err msg={errors.descripcion} />
              </div>

            </div>
          </section>

          {/* ── 3. Registro Legal ───────────────────────────────────── */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-1 border-b border-gray-100">
              3. Registro Legal
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              <div>
                <Label>N° Registro Sanitario *</Label>
                <input type="text" value={form.numero_registro}
                  onChange={e => set('numero_registro', e.target.value)}
                  placeholder="RS-CR-2024-0001"
                  className={`${inputCls} ${errors.numero_registro ? errCls : ''}`} />
                <Err msg={errors.numero_registro} />
              </div>

              <div>
                <Label>Tramitador</Label>
                <select value={form.tramitador} onChange={e => set('tramitador', e.target.value)}
                  className={inputCls}>
                  <option value="">— Selecciona —</option>
                  {tramitadores.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <Label>Dueño del Registro</Label>
                <select value={form.dueno_registro} onChange={e => set('dueno_registro', e.target.value)}
                  className={inputCls}>
                  <option value="">— Selecciona —</option>
                  {duenos.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div>
                <Label>Importador (Cliente)</Label>
                <select value={form.importador} onChange={e => set('importador', e.target.value)}
                  className={inputCls}>
                  <option value="">— Selecciona —</option>
                  {importadores.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>

            </div>
          </section>

          {/* ── 4. Fechas y Documento ───────────────────────────────── */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-4 pb-1 border-b border-gray-100">
              4. Fechas y Documento
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              <div>
                <Label>Vencimiento Registro *</Label>
                <input type="date" value={form.fecha_vencimiento}
                  onChange={e => set('fecha_vencimiento', e.target.value)}
                  className={`${inputCls} ${errors.fecha_vencimiento ? errCls : ''}`} />
                <Err msg={errors.fecha_vencimiento} />
              </div>

              <div>
                <Label>{initial ? 'Reemplazar PDF' : 'Archivo PDF'}</Label>
                <div
                  onClick={() => fileRef.current?.click()}
                  className={`w-full border-2 border-dashed rounded-lg px-3 py-2 text-center cursor-pointer transition-all hover:border-amber-300 flex items-center justify-center gap-2 ${
                    errors.archivo ? 'border-red-300' : archivo ? 'border-amber-400 bg-amber-50' : 'border-gray-200'
                  }`}
                  style={{ minHeight: 42 }}
                >
                  {archivo ? (
                    <span className="text-xs font-medium text-amber-600 truncate max-w-full">
                      <FileText size={13} className="inline mr-1" />{archivo.name}
                    </span>
                  ) : initial?.archivo_pdf_url ? (
                    <span className="text-xs text-gray-400">
                      <FileText size={13} className="inline mr-1" />PDF guardado · reemplazar
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">
                      <Upload size={13} className="inline mr-1" />Adjuntar PDF
                    </span>
                  )}
                </div>
                <Err msg={errors.archivo} />
                <input ref={fileRef} type="file" accept=".pdf" className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    if (f.size > 10 * 1024 * 1024) { setErrors(er => ({ ...er, archivo: 'Máximo 10MB' })); return }
                    setArchivo(f)
                    setErrors(er => ({ ...er, archivo: '' }))
                  }} />
              </div>

            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-all disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-6 py-2 text-sm font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-600 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {initial ? 'Guardar Cambios' : 'Crear Registro'}
          </button>
        </div>

      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
