'use client'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import BarChartPro from '@/components/dashboard/BarChartPro'
import { Package, DollarSign, TrendingUp, ShoppingCart, Plus, X, Check, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react'

const MESES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const COLORS = ['#c8873a','#2a7a58']

const inp = `w-full text-[13px] rounded-lg px-3 py-2 focus:outline-none focus:ring-1`
const sel = `w-full text-[13px] rounded-lg px-3 py-2 focus:outline-none focus:ring-1`

function fmt4(n: any) { return Number(n || 0).toFixed(4) }
function fmt2(n: any) { return Number(n || 0).toFixed(2) }
function fmt$(n: any) {
  const v = Number(n || 0)
  if (Math.abs(v) >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M'
  if (Math.abs(v) >= 1_000)     return '$' + (v / 1_000).toFixed(1) + 'K'
  return '$' + v.toFixed(2)
}
function toNum(v: any) { return isNaN(Number(v)) ? 0 : Number(v) }

function emptyForm(categoria: string) {
  return {
    pais: 'US', sku: '', descripcion: '', proveedor: 'Dairy Farmers of America',
    costo_compra: '', fecha_compra: '', volumen_comprado: '1',
    lote: '', referencia: '', notas: '', tipo: categoria,
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-widest font-medium mb-1.5 block"
        style={{ color: 'var(--t3)' }}>{label}</label>
      {children}
    </div>
  )
}

function gananciaBadge(pct: any) {
  const v = toNum(pct)
  if (v < 10) return { background: '#ef444420', color: '#f87171' }
  if (v < 20) return { background: '#f59e0b20', color: '#fbbf24' }
  return { background: '#10b98120', color: '#34d399' }
}

export default function BarrelBlockView({ categoria }: { categoria: 'barrel' | 'block' | 'helados' }) {
  const title = categoria === 'barrel' ? 'Leche' : categoria === 'helados' ? 'Helados' : 'Block'

  const [compras,   setCompras]   = useState<any[]>([])
  const [kpis,      setKpis]      = useState<any>(null)
  const [tendencia, setTendencia] = useState<any[]>([])
  const [skus,      setSkus]      = useState<{ sku: string; descripcion: string }[]>([])
  const [anos,      setAnos]      = useState<number[]>([])

  const [fSku, setFSku] = useState('Todos')
  const [fAno, setFAno] = useState('')
  const [fMes, setFMes] = useState('')

  const [loading,  setLoading]  = useState(true)
  const [empty,    setEmpty]    = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form,     setForm]     = useState(emptyForm(categoria))
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')

  const debounceT = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    fetch(`/api/operaciones/ventas/barrel-block?tipo=filtros&categoria=${categoria}`)
      .then(r => r.json())
      .then(j => {
        setSkus(j.skus || [])
        const pds: { ano: number }[] = j.periodos || []
        setAnos([...new Set(pds.map((p: any) => toNum(p.ano)))].sort((a, b) => b - a) as number[])
      })
      .catch(() => {})
  }, [categoria])

  const fetchData = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams({ categoria })
    if (fSku !== 'Todos') p.set('sku', fSku)
    if (fAno) p.set('ano', fAno)
    if (fMes) p.set('mes', fMes)
    const q = p.toString()

    Promise.all([
      fetch(`/api/operaciones/ventas/barrel-block?tipo=kpis&${q}`).then(r => r.json()),
      fetch(`/api/operaciones/ventas/barrel-block?tipo=compras&${q}`).then(r => r.json()),
      fetch(`/api/operaciones/ventas/barrel-block?tipo=tendencia&${q}`).then(r => r.json()),
    ]).then(([kJ, cJ, tJ]) => {
      if (cJ.empty) { setEmpty(true); setLoading(false); return }
      setEmpty(false)
      setKpis(kJ)
      setCompras(cJ.rows || [])
      setTendencia((tJ.rows || []).map((r: any) => ({
        ...r,
        label: MESES[toNum(r.mes)] + ' ' + String(r.ano).slice(2),
      })))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [fSku, fAno, fMes, categoria])

  useEffect(() => {
    clearTimeout(debounceT.current)
    debounceT.current = setTimeout(fetchData, 300)
  }, [fetchData])

  const handleSave = async () => {
    if (!form.sku || !form.costo_compra || !form.fecha_compra) {
      setError('SKU, costo y fecha son obligatorios'); return
    }
    setSaving(true); setError(''); setSuccess('')
    try {
      const res = await fetch('/api/operaciones/ventas/barrel-block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          costo_compra:     Number(form.costo_compra),
          volumen_comprado: Number(form.volumen_comprado) || 1,
        }),
      })
      const j = await res.json()
      if (j.ok) {
        setShowForm(false)
        setForm(emptyForm(categoria))
        setSuccess('Compra registrada correctamente')
        fetchData()
      } else {
        setError(j.error || 'Error al guardar')
      }
    } catch { setError('Error de red') }
    finally { setSaving(false) }
  }

  const inputStyle = {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    color: 'var(--t1)',
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] tracking-[2px] uppercase font-medium mb-1" style={{ color: 'var(--t3)' }}>
            Operaciones · Ventas
          </p>
          <h1 className="text-xl font-bold" style={{ color: 'var(--t1)' }}>{title}</h1>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--t3)' }}>
            Dairy Farmers of America · 🇺🇸 Estados Unidos
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={fetchData}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-all hover:opacity-80"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--t3)' }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => { setShowForm(true); setError(''); setSuccess('') }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium text-white transition-all hover:opacity-90"
            style={{ background: 'var(--acc)' }}>
            <Plus size={13} /> <span className="hidden sm:inline">Nueva compra</span><span className="sm:hidden">Nueva</span>
          </button>
        </div>
      </div>

      {/* Alertas */}
      {error   && (
        <div className="flex items-center gap-2 text-[13px] rounded-lg px-4 py-3 border"
          style={{ background: '#ef444415', borderColor: '#ef444440', color: '#f87171' }}>
          <AlertCircle size={14}/>{error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 text-[13px] rounded-lg px-4 py-3 border"
          style={{ background: '#10b98115', borderColor: '#10b98140', color: '#34d399' }}>
          <CheckCircle size={14}/>{success}
        </div>
      )}

      {/* Modal nueva compra */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 z-10"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <h2 className="font-semibold text-[14px]" style={{ color: 'var(--t1)' }}>
                Registrar compra — {title}
              </h2>
              <button onClick={() => setShowForm(false)} style={{ color: 'var(--t3)' }}
                className="hover:opacity-70 transition-opacity"><X size={16}/></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Field label="País">
                  <div className={`${inp} opacity-60`} style={{ ...inputStyle, cursor: 'default' }}>🇺🇸 US</div>
                </Field>
                <Field label="Tipo">
                  <div className={`${inp} opacity-60 capitalize font-medium`} style={{ ...inputStyle, cursor: 'default' }}>{title}</div>
                </Field>
                <Field label="Proveedor">
                  <div className={`${inp} opacity-60 truncate`} style={{ ...inputStyle, cursor: 'default' }} title="Dairy Farmers of America">DFA</div>
                </Field>
              </div>
              <Field label="SKU *">
                <input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                  className={inp} style={inputStyle} placeholder="Ej: QUESO-001" />
              </Field>
              <Field label="Descripción">
                <input value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  className={inp} style={inputStyle} placeholder="Nombre del producto" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Costo unitario *">
                  <input type="number" step="0.0001" value={form.costo_compra}
                    onChange={e => setForm(f => ({ ...f, costo_compra: e.target.value }))}
                    className={inp} style={inputStyle} placeholder="0.0000" />
                </Field>
                <Field label="Volumen">
                  <input type="number" step="1" value={form.volumen_comprado}
                    onChange={e => setForm(f => ({ ...f, volumen_comprado: e.target.value }))}
                    className={inp} style={inputStyle} placeholder="1" />
                </Field>
              </div>
              <Field label="Fecha de compra *">
                <input type="date" value={form.fecha_compra}
                  onChange={e => setForm(f => ({ ...f, fecha_compra: e.target.value }))}
                  className={inp} style={inputStyle} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Lote">
                  <input value={form.lote} onChange={e => setForm(f => ({ ...f, lote: e.target.value }))}
                    className={inp} style={inputStyle} placeholder="Opcional" />
                </Field>
                <Field label="Referencia">
                  <input value={form.referencia} onChange={e => setForm(f => ({ ...f, referencia: e.target.value }))}
                    className={inp} style={inputStyle} placeholder="Opcional" />
                </Field>
              </div>
              <Field label="Notas">
                <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  rows={2} className={inp + ' resize-none'} style={inputStyle} placeholder="Observaciones opcionales" />
              </Field>
              {error && (
                <div className="flex items-center gap-2 text-[12px] rounded-lg px-3 py-2 border"
                  style={{ background: '#ef444415', borderColor: '#ef444440', color: '#f87171' }}>
                  <AlertCircle size={12}/> {error}
                </div>
              )}
            </div>
            <div className="flex gap-2 px-6 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => setShowForm(false)}
                className="flex-1 text-[13px] rounded-lg py-2 transition-colors border"
                style={{ background: 'transparent', borderColor: 'var(--border)', color: 'var(--t2)' }}>
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 text-[13px] font-medium rounded-lg py-2 text-white disabled:opacity-50 flex items-center justify-center gap-2 transition-opacity"
                style={{ background: 'var(--acc)' }}>
                {saving ? 'Guardando…' : <><Check size={13}/> Guardar compra</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="card p-4">
        <p className="text-[9px] tracking-[2px] uppercase font-semibold mb-3" style={{ color: 'var(--t3)' }}>Filtros</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'SKU', content: (
              <select value={fSku} onChange={e => setFSku(e.target.value)} className={sel} style={inputStyle}>
                <option value="Todos">Todos</option>
                {skus.map(s => <option key={s.sku} value={s.sku}>{s.descripcion || s.sku}</option>)}
              </select>
            )},
            { label: 'Año', content: (
              <select value={fAno} onChange={e => setFAno(e.target.value)} className={sel} style={inputStyle}>
                <option value=''>Todos</option>
                {anos.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            )},
            { label: 'Mes', content: (
              <select value={fMes} onChange={e => setFMes(e.target.value)} className={sel} style={inputStyle}>
                <option value=''>Todos</option>
                {MESES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            )},
          ].map(f => (
            <div key={f.label}>
              <label className="text-[10px] uppercase tracking-widest mb-1.5 block" style={{ color: 'var(--t3)' }}>{f.label}</label>
              {f.content}
            </div>
          ))}
        </div>
      </div>

      {/* Empty */}
      {empty && (
        <div className="card p-12 text-center">
          <Package className="mx-auto mb-3 opacity-20" size={44} style={{ color: 'var(--t3)' }} />
          <p className="font-medium text-[14px]" style={{ color: 'var(--t2)' }}>
            No hay compras de tipo {title} registradas
          </p>
          <p className="text-[12px] mt-1" style={{ color: 'var(--t3)' }}>
            Agrega la primera con el botón &ldquo;Nueva compra&rdquo;.
          </p>
        </div>
      )}

      {!empty && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            {[
              { icon: ShoppingCart, label: 'Compras',     val: toNum(kpis?.total_compras),             color: '#c8873a' },
              { icon: Package,      label: 'SKUs',        val: toNum(kpis?.n_skus),                    color: '#2a7a58' },
              { icon: DollarSign,   label: 'Inversión',   val: fmt$(kpis?.inversion_total),            color: '#3b82f6' },
              { icon: TrendingUp,   label: 'Volumen',     val: toNum(kpis?.volumen_total).toFixed(0),  color: '#8b5cf6' },
              { icon: DollarSign,   label: 'Costo prom.', val: fmt4(kpis?.costo_unitario_promedio),   color: '#06b6d4' },
              { icon: Package,      label: 'Proveedores', val: toNum(kpis?.n_proveedores),             color: '#f43f5e' },
            ].map(k => (
              <div key={k.label} className="card p-4 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl" style={{ background: k.color }} />
                <div className="text-[9px] tracking-[2px] uppercase font-medium mb-2" style={{ color: 'var(--t3)' }}>{k.label}</div>
                {loading
                  ? <div className="h-6 w-16 rounded animate-pulse" style={{ background: 'var(--border)' }} />
                  : <div className="font-display text-[22px] font-bold leading-none" style={{ color: 'var(--t1)' }}>{k.val}</div>}
              </div>
            ))}
          </div>

          {/* Tendencia */}
          {!loading && tendencia.length > 0 && (
            <div className="card p-5">
              <div className="font-semibold text-[13px] mb-0.5" style={{ color: 'var(--t1)' }}>
                Inversión mensual — {title}
              </div>
              <p className="text-[11px] mb-4" style={{ color: 'var(--t3)' }}>
                Evolución del gasto en Dairy Farmers of America por período
              </p>
              <BarChartPro
                data={tendencia}
                nameKey="label"
                height={180}
                formatter={fmt$}
                multiBar={[
                  { key: 'inversion', color: COLORS[0], label: 'Inversión $' },
                  { key: 'volumen',   color: COLORS[1], label: 'Volumen'     },
                ]}
              />
            </div>
          )}

          {/* Tabla */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <div className="font-semibold text-[13px]" style={{ color: 'var(--t1)' }}>Historial de compras — {title}</div>
              <span className="text-[11px]" style={{ color: 'var(--t3)' }}>{compras.length} registros</span>
            </div>
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-[12px]" style={{ minWidth: 820 }}>
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                    {['Fecha','SKU','Descripción','Proveedor','Costo Unit.','Volumen','Costo Lote','P. Venta','Margen','Ganancia %','Lote'].map(h => (
                      <th key={h} className="text-left px-4 py-3 font-semibold whitespace-nowrap text-[10px] tracking-widest uppercase"
                        style={{ color: 'var(--t3)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="border-b" style={{ borderColor: 'var(--border)' }}>
                          {Array.from({ length: 11 }).map((_, j) => (
                            <td key={j} className="px-4 py-3">
                              <div className="h-3.5 rounded animate-pulse" style={{ background: 'var(--border)', width: '60%' }} />
                            </td>
                          ))}
                        </tr>
                      ))
                    : compras.map(c => (
                        <tr key={c.id} className="border-b transition-colors hover:bg-white/5"
                          style={{ borderColor: 'var(--border)' }}>
                          <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--t3)' }}>{c.fecha_compra?.slice(0, 10)}</td>
                          <td className="px-4 py-3 font-mono font-semibold" style={{ color: 'var(--acc)' }}>{c.sku}</td>
                          <td className="px-4 py-3" style={{ color: 'var(--t2)' }}>{c.descripcion || '—'}</td>
                          <td className="px-4 py-3 text-[11px]" style={{ color: 'var(--t3)' }}>{c.proveedor}</td>
                          <td className="px-4 py-3 font-semibold" style={{ color: 'var(--t1)' }}>{fmt4(c.costo_compra)}</td>
                          <td className="px-4 py-3" style={{ color: 'var(--t2)' }}>{toNum(c.volumen_comprado).toFixed(0)}</td>
                          <td className="px-4 py-3" style={{ color: 'var(--t2)' }}>{fmt$(c.costo_total_lote)}</td>
                          <td className="px-4 py-3" style={{ color: 'var(--t2)' }}>
                            {c.precio_venta_ref != null ? fmt4(c.precio_venta_ref) : <span style={{ color: 'var(--t3)' }}>—</span>}
                          </td>
                          <td className="px-4 py-3" style={{ color: 'var(--t2)' }}>
                            {c.margen != null ? fmt4(c.margen) : <span style={{ color: 'var(--t3)' }}>—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {c.ganancia_pct != null
                              ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                                  style={gananciaBadge(c.ganancia_pct)}>
                                  {fmt2(c.ganancia_pct)}%
                                </span>
                              : <span style={{ color: 'var(--t3)' }}>—</span>}
                          </td>
                          <td className="px-4 py-3 text-[11px]" style={{ color: 'var(--t3)' }}>{c.lote || '—'}</td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Nota */}
          <div className="rounded-xl px-4 py-3 text-[12px] border"
            style={{ background: '#3b82f610', borderColor: '#3b82f630', color: '#93c5fd' }}>
            <strong style={{ color: '#bfdbfe' }}>Vinculación automática:</strong> cada compra registrada aquí actualiza
            el costo de referencia en <strong>Costos y Márgenes</strong>.
            El sistema usa el costo más reciente de {title} como fuente primaria para calcular la Ganancia %.
          </div>
        </>
      )}
    </div>
  )
}
