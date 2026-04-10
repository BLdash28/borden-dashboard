'use client'
import React, { useEffect, useState, useCallback, useRef } from 'react'
import { RefreshCw, Plus, CheckCircle, Package, Truck, X, AlertCircle, ClipboardList, ArrowDownToLine, Pencil } from 'lucide-react'

const toNum = (v: any) => { const n = parseFloat(String(v)); return isNaN(n) ? 0 : n }
const fmtN  = (v: any) => toNum(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 4 })
const fmtD  = (s: string) => s ? s.slice(0, 10) : ''

// SKUs de cajas corrugadas
const SKUS_CORRUGADOS: Record<string, string> = {
  'B138-003-001': 'CAJA BORDEN GENERICA 12 LITROS',
  'B138-002-001': 'CAJA BORDEN GENERICA 3 PACK',
  'B138-004-001': 'CAJA BORDEN LECHE ENTERA 12 PACK',
  'B138-006-001': 'CAJA BORDEN DESCREMADA PACK',
  'B138-005-001': 'CAJA BORDEN SEMIDESCREMADA 12 PACK',
  'B138-001-001': 'CAJA BORDEN DESLACTOSADA SEMIDESCREMADA 12 PACK',
}

// Merma estándar: 2.5%
const MERMA_PCT = 0.01

function cantValida(v: number) { return v > 0 }

type Tab = 'inventario' | 'pedidos' | 'salidas'

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}

const inp = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"

export default function InvCorrugadosPage() {
  const [tab,     setTab]     = useState<Tab>('inventario')
  const [invRows, setInvRows] = useState<any[]>([])
  const [salRows, setSalRows] = useState<any[]>([])
  const [pedRows, setPedRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState('')
  const [isSuperadmin, setIsSuperadmin] = useState(false)

  // Ajuste directo de inventario
  const [showAjuste, setShowAjuste] = useState(false)
  const [ajusteForm, setAjusteForm] = useState({ cod_interno: '', descripcion: '', cantidad_actual: 0, cantidad_nueva: '', motivo: '' })
  const [savingAjuste, setSavingAjuste] = useState(false)

  const [showEntrada, setShowEntrada] = useState(false)
  const [showPedido,  setShowPedido]  = useState(false)
  const [showSalida,  setShowSalida]  = useState(false)
  const [showHistorial, setShowHistorial] = useState(false)
  const [historialSku,  setHistorialSku]  = useState<{cod: string; desc: string} | null>(null)
  const [historialRows, setHistorialRows] = useState<any[]>([])
  const [historialLoading, setHistorialLoading] = useState(false)
  const [saving,      setSaving]      = useState(false)

  const [fEntrada, setFEntrada] = useState({
    fecha: '', cod_interno: '', descripcion: '', u_m: 'UNIDAD',
    cantidad: '', proveedor: '', observacion: ''
  })

  const [fSalida, setFSalida] = useState({
    fecha: '', cod_interno: '', descripcion: '', u_m: 'UNIDAD',
    cantidad: '', observacion: ''
  })

  // Pedido simple: selección múltiple + cantidad por SKU
  const [pedFecha,  setPedFecha]  = useState('')
  const [pedRef,    setPedRef]    = useState('')
  const [pedSkus,   setPedSkus]   = useState<string[]>([])
  const [pedCants,  setPedCants]  = useState<Record<string, number>>({})
  const [pedError,  setPedError]  = useState('')

  const invMap = useRef<Record<string, any>>({})

  const notify = (msg: string, isErr = false) => {
    if (isErr) setError(msg); else setSuccess(msg)
    setTimeout(() => { setError(''); setSuccess('') }, 5000)
  }

  useEffect(() => {
    fetch('/api/me')
      .then(r => r.json())
      .then(d => { if (d.isAdmin) setIsSuperadmin(true) })
      .catch(() => {})
  }, [])

  const openAjuste = (r: any) => {
    setAjusteForm({
      cod_interno:     r.cod_interno,
      descripcion:     r.descripcion,
      cantidad_actual: Math.round(toNum(r.cant_bodega)),
      cantidad_nueva:  String(Math.round(toNum(r.cant_bodega))),
      motivo:          '',
    })
    setShowAjuste(true)
  }

  const submitAjuste = async () => {
    const cantNueva = toNum(ajusteForm.cantidad_nueva)
    if (cantNueva < 0) return notify('La cantidad no puede ser negativa', true)
    setSavingAjuste(true)
    try {
      await post({ accion: 'ajuste_inventario', cod_interno: ajusteForm.cod_interno, cantidad_nueva: cantNueva, motivo: ajusteForm.motivo })
      notify(`Inventario ajustado — ${ajusteForm.cod_interno}: ${ajusteForm.cantidad_actual} → ${cantNueva}`)
      setShowAjuste(false)
      cargar('inventario')
    } catch (e: any) { notify(e.message, true) }
    finally { setSavingAjuste(false) }
  }

  const openHistorial = async (cod: string, desc: string) => {
    setHistorialSku({ cod, desc })
    setHistorialRows([])
    setShowHistorial(true)
    setHistorialLoading(true)
    try {
      const res = await fetch(`/api/operaciones/inv-corrugados?vista=historial&cod=${cod}`)
      const r = await res.json()
      if (r.error) throw new Error(r.error)
      setHistorialRows(r.rows)
    } catch (e: any) { notify(e.message, true) }
    finally { setHistorialLoading(false) }
  }

  const cargar = useCallback(async (t: Tab) => {
    setLoading(true)
    try {
      if (t === 'inventario') {
        const res = await fetch('/api/operaciones/inv-corrugados?vista=inventario')
        if (!res.ok) throw new Error(`API error ${res.status}`)
        const r = await res.json()
        if (r.error) throw new Error(r.error)
        setInvRows(r.rows)
        invMap.current = Object.fromEntries(r.rows.map((x: any) => [x.cod_interno, x]))
      } else if (t === 'salidas') {
        const res = await fetch('/api/operaciones/inv-corrugados?vista=salidas')
        if (!res.ok) throw new Error(`API error ${res.status}`)
        const r = await res.json()
        if (r.error) throw new Error(r.error)
        setSalRows(r.rows)
      } else if (t === 'pedidos') {
        const res = await fetch('/api/operaciones/inv-corrugados?vista=pedidos')
        if (!res.ok) throw new Error(`API error ${res.status}`)
        const r = await res.json()
        if (r.error) throw new Error(r.error)
        setPedRows(r.rows ?? [])
      }
    } catch (e: any) { notify(e.message, true) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { cargar('inventario') }, [cargar])
  useEffect(() => { cargar(tab) }, [tab, cargar])

  const post = async (body: any) => {
    const res = await fetch('/api/operaciones/inv-corrugados', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) { const t = await res.text(); throw new Error(t || `Error ${res.status}`) }
    const r = await res.json()
    if (r.error) throw new Error(r.error)
    return r
  }

  // ── INGRESO DE INVENTARIO ─────────────────────────────────
  const submitEntrada = async () => {
    if (!fEntrada.cod_interno || !fEntrada.cantidad) return notify('Completa los campos requeridos', true)
    const cant = toNum(fEntrada.cantidad)
    if (cant <= 0) return notify('La cantidad debe ser mayor a 0', true)
    setSaving(true)
    try {
      await post({ accion: 'entrada', ...fEntrada, cantidad: cant })
      notify(`Ingreso registrado — ${fmtN(cant)} ${fEntrada.u_m}`)
      setShowEntrada(false)
      setFEntrada({ fecha:'', cod_interno:'', descripcion:'', u_m:'UNIDAD', cantidad:'', proveedor:'', observacion:'' })
      cargar('inventario')
    } catch (e: any) { notify(e.message, true) }
    finally { setSaving(false) }
  }

  // ── SALIDA A PRODUCCIÓN ───────────────────────────────────
  const submitSalida = async () => {
    if (!fSalida.cod_interno || !fSalida.cantidad) return notify('Completa los campos requeridos', true)
    const cant = toNum(fSalida.cantidad)
    if (cant <= 0) return notify('La cantidad debe ser mayor a 0', true)
    setSaving(true)
    try {
      await post({
        accion: 'salida_produccion',
        cod_interno: fSalida.cod_interno,
        descripcion: fSalida.descripcion,
        u_m: fSalida.u_m,
        cantidad: cant,
        fecha: fSalida.fecha || new Date().toISOString().slice(0, 10),
        observacion: fSalida.observacion,
      })
      notify(`Salida a producción registrada — ${fmtN(cant)} ${fSalida.u_m}`)
      setShowSalida(false)
      setFSalida({ fecha:'', cod_interno:'', descripcion:'', u_m:'UNIDAD', cantidad:'', observacion:'' })
      cargar('inventario')
      cargar('salidas')
    } catch (e: any) { notify(e.message, true) }
    finally { setSaving(false) }
  }

  // ── PEDIDO: toggle SKU ────────────────────────────────────
  const toggleSku = (cod: string) => {
    const next = pedSkus.includes(cod) ? pedSkus.filter(s => s !== cod) : [...pedSkus, cod]
    setPedSkus(next)
    if (!next.includes(cod)) {
      const c = { ...pedCants }; delete c[cod]; setPedCants(c)
    }
    setPedError('')
  }

  const updateCant = (cod: string, val: number) => {
    setPedCants(prev => ({ ...prev, [cod]: val }))
    setPedError('')
  }

  const pedTotal = pedSkus.reduce((s, c) => s + (pedCants[c] || 0), 0)
  const pedValido = pedSkus.length > 0 && pedSkus.every(c => (pedCants[c] || 0) > 0)

  const submitPedido = async () => {
    if (!pedValido) { setPedError('Asigna una cantidad mayor a 0 a cada SKU seleccionado'); return }
    setSaving(true)
    try {
      const ref   = pedRef || `PED-COR-${Date.now()}`
      const fecha = pedFecha || new Date().toISOString().slice(0, 10)

      for (const cod of pedSkus) {
        await post({ accion: 'crear_pedido', cod_interno: cod, cantidad_pedida: pedCants[cod], referencia: ref, fecha })
        const r = await post({ accion: 'ultimo_pedido_cod', cod_interno: cod })
        if (r.id) await post({ accion: 'aprobar_pedido', pedido_id: r.id })
      }

      notify(`Pedido procesado — ${fmtN(pedTotal)} uds en ${pedSkus.length} SKU(s)`)
      setShowPedido(false)
      setPedSkus([]); setPedCants({}); setPedFecha(''); setPedRef(''); setPedError('')
      cargar('inventario')
      cargar('pedidos')
    } catch (e: any) { notify(e.message, true) }
    finally { setSaving(false) }
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'inventario', label: 'Inventario', icon: <Package size={14}/>       },
    { key: 'pedidos',    label: 'Pedidos',     icon: <ClipboardList size={14}/> },
    { key: 'salidas',    label: 'Salidas',     icon: <Truck size={14}/>         },
  ]

  const getMerma = (cant_bodega: number) => cant_bodega * MERMA_PCT
  const getDisp  = (cant_bodega: number) => cant_bodega - getMerma(cant_bodega)

  // Rows para mostrar: si hay datos en DB los usa, sino muestra los 6 SKUs base con 0
  const displayRows = invRows.length > 0 ? invRows : Object.entries(SKUS_CORRUGADOS).map(([cod, desc]) => ({
    cod_interno: cod, descripcion: desc, u_m: 'UNIDAD', cant_bodega: 0
  }))

  return (
    <div className="p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Operaciones · Logística</p>
          <h1 className="text-2xl font-bold text-gray-800">Inventario Materiales Corrugados</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowEntrada(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: '#2a7a58' }}>
            <Plus size={14}/> Ingreso de Inventario
          </button>
          <button onClick={() => setShowSalida(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: '#6d5a9e' }}>
            <ArrowDownToLine size={14}/> Salidas a Producción
          </button>
          <button onClick={() => { setPedSkus([]); setPedCants({}); setPedFecha(''); setPedRef(''); setPedError(''); setShowPedido(true) }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: '#c8873a' }}>
            <CheckCircle size={14}/> Entrada de Pedido
          </button>
          <button onClick={() => cargar(tab)}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error   && <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3"><AlertCircle size={16}/>{error}</div>}
      {success && <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-4 py-3"><CheckCircle size={16}/>{success}</div>}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── INVENTARIO ── */}
      {tab === 'inventario' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-700">Stock Actual — Materiales Corrugados</h3>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 italic">↑ Click en una fila para ver historial</span>
              <span className="text-xs text-gray-400">{displayRows.length} productos</span>
            </div>
          </div>
          {loading
            ? <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
            : <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase tracking-widest bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-5 py-3">COD_INTERNO</th>
                      <th className="text-left px-4 py-3">DESCRIPCIÓN</th>
                      <th className="text-center px-4 py-3">U/M</th>
                      <th className="text-right px-4 py-3">CANT_BODEGA</th>
                      <th className="text-right px-4 py-3">MERMA (1%)</th>
                      <th className="text-right px-5 py-3">TOTAL_DISPONIBLE</th>
                      {isSuperadmin && <th className="px-3 py-3"/>}
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.map((r, i) => {
                      const cantBodega = Math.round(toNum(r.cant_bodega))
                      const merma      = getMerma(cantBodega)
                      const disp       = getDisp(cantBodega)
                      return (
                        <tr key={i}
                          className="border-b border-gray-50 hover:bg-amber-50 cursor-pointer transition-colors"
                          title="Click para ver historial de auditoría"
                          onClick={() => openHistorial(r.cod_interno, r.descripcion)}>
                          <td className="px-5 py-3">
                            <span className="font-mono text-xs font-semibold text-amber-700">{r.cod_interno}</span>
                            <span className="ml-2 text-[9px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-medium">CAJA</span>
                          </td>
                          <td className="px-4 py-3 text-gray-700 max-w-[280px] truncate">{r.descripcion}</td>
                          <td className="px-4 py-3 text-center text-gray-500 text-xs">{r.u_m || 'UNIDAD'}</td>
                          <td className="px-4 py-3 text-right font-medium text-gray-800">{cantBodega.toLocaleString('en-US')}</td>
                          <td className="px-4 py-3 text-right text-xs">
                            <span className="text-red-400">-{fmtN(merma)}</span>
                            <span className="text-gray-300 ml-1">(1%)</span>
                          </td>
                          <td className="px-5 py-3 text-right font-bold text-emerald-700">{fmtN(disp)}</td>
                          {isSuperadmin && (
                            <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                              <button
                                onClick={() => openAjuste(r)}
                                title="Ajustar cantidad"
                                className="p-1.5 rounded-lg hover:bg-amber-100 text-amber-600 hover:text-amber-800 transition-colors">
                                <Pencil size={13}/>
                              </button>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
          }
        </div>
      )}

      {/* ── PEDIDOS ── */}
      {tab === 'pedidos' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-700">Pedidos Registrados</h3>
            <span className="text-xs text-gray-400">{pedRows.length} pedidos</span>
          </div>
          {loading
            ? <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
            : pedRows.length === 0
              ? <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Sin pedidos registrados</div>
              : <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-400 uppercase tracking-widest bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-5 py-3">FECHA</th>
                        <th className="text-left px-4 py-3">COD_INTERNO</th>
                        <th className="text-left px-4 py-3">DESCRIPCIÓN</th>
                        <th className="text-center px-4 py-3">U/M</th>
                        <th className="text-right px-4 py-3">CANT_PEDIDA</th>
                        <th className="text-center px-4 py-3">REFERENCIA</th>
                        <th className="text-center px-5 py-3">ESTADO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pedRows.map((r, i) => (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-5 py-3 text-gray-500 text-xs">{fmtD(r.fecha)}</td>
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-amber-700">{r.cod_interno}</td>
                          <td className="px-4 py-3 text-gray-700 max-w-[200px] truncate">{r.descripcion}</td>
                          <td className="px-4 py-3 text-center text-gray-500 text-xs">{r.u_m || 'UNIDAD'}</td>
                          <td className="px-4 py-3 text-right font-bold text-blue-700">{fmtN(r.cantidad_pedida)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded">{r.referencia || '—'}</span>
                          </td>
                          <td className="px-5 py-3 text-center">
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                              r.estado === 'aprobado'  ? 'bg-emerald-100 text-emerald-700' :
                              r.estado === 'pendiente' ? 'bg-amber-100 text-amber-700' :
                              'bg-gray-100 text-gray-500'
                            }`}>{r.estado || 'pendiente'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
          }
        </div>
      )}

      {/* ── SALIDAS ── */}
      {tab === 'salidas' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-700">Salidas de Bodega</h3>
            <span className="text-xs text-gray-400">{salRows.length} movimientos</span>
          </div>
          {loading
            ? <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
            : salRows.length === 0
              ? <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Sin salidas registradas</div>
              : <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-400 uppercase tracking-widest bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-5 py-3">FECHA</th>
                        <th className="text-left px-4 py-3">COD_INTERNO</th>
                        <th className="text-left px-4 py-3">DESCRIPCIÓN</th>
                        <th className="text-center px-4 py-3">U/M</th>
                        <th className="text-right px-4 py-3">CANT_SALIDA</th>
                        <th className="text-center px-4 py-3">TIPO</th>
                        <th className="text-left px-5 py-3">REF / OBSERVACIÓN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salRows.map((r, i) => (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-5 py-3 text-gray-500 text-xs">{fmtD(r.fecha)}</td>
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-amber-700">{r.cod_interno}</td>
                          <td className="px-4 py-3 text-gray-700 max-w-[200px] truncate">{r.descripcion}</td>
                          <td className="px-4 py-3 text-center text-gray-500 text-xs">{r.u_m}</td>
                          <td className="px-4 py-3 text-right font-bold text-red-600">-{fmtN(r.cantidad_salida)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                              r.tipo === 'produccion' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'
                            }`}>{r.tipo === 'produccion' ? 'Producción' : 'Pedido'}</span>
                          </td>
                          <td className="px-5 py-3 text-gray-500 text-xs">
                            {r.referencia_pedido ? `#${r.referencia_pedido}` : ''}{r.ref_orden ? ` · ${r.ref_orden}` : ''}{(!r.referencia_pedido && !r.ref_orden) ? (r.observacion || '—') : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
          }
        </div>
      )}

      {/* ══ MODAL INGRESO DE INVENTARIO ══ */}
      {showEntrada && (
        <Modal title="Ingreso de Inventario" onClose={() => setShowEntrada(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fecha">
                <input type="date" value={fEntrada.fecha}
                  onChange={e => setFEntrada(p => ({...p, fecha: e.target.value}))} className={inp}/>
              </Field>
              <Field label="U/M">
                <select value={fEntrada.u_m}
                  onChange={e => setFEntrada(p => ({...p, u_m: e.target.value}))} className={inp}>
                  {['UNIDAD','PACK','CAJA','KG'].map(u => <option key={u}>{u}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Proveedor">
              <input value={fEntrada.proveedor}
                onChange={e => setFEntrada(p => ({...p, proveedor: e.target.value}))}
                placeholder="Nombre del proveedor" className={inp}/>
            </Field>
            <Field label="COD_INTERNO *">
              <select value={fEntrada.cod_interno}
                onChange={e => {
                  const desc = SKUS_CORRUGADOS[e.target.value] || invMap.current[e.target.value]?.descripcion || ''
                  setFEntrada(p => ({...p, cod_interno: e.target.value, descripcion: desc}))
                }} className={inp}>
                <option value="">— Seleccionar SKU —</option>
                {Object.entries(SKUS_CORRUGADOS).map(([cod, desc]) => (
                  <option key={cod} value={cod}>{cod} · {desc}</option>
                ))}
              </select>
            </Field>
            {fEntrada.cod_interno && (
              <div className="rounded-lg px-3 py-2 text-xs bg-orange-50 border border-orange-200 text-orange-800">
                {fEntrada.descripcion}
              </div>
            )}
            <Field label="Cantidad *">
              <input type="number" min="1" value={fEntrada.cantidad}
                onChange={e => setFEntrada(p => ({...p, cantidad: e.target.value}))}
                placeholder="0" className={inp}/>
            </Field>
            <Field label="Observación / N° OC">
              <input value={fEntrada.observacion}
                onChange={e => setFEntrada(p => ({...p, observacion: e.target.value}))}
                placeholder="OC-2026-001" className={inp}/>
            </Field>
            <div className="flex gap-3 pt-2">
              <button onClick={submitEntrada} disabled={saving}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: '#2a7a58' }}>
                {saving ? 'Guardando...' : 'Registrar Ingreso'}
              </button>
              <button onClick={() => setShowEntrada(false)}
                className="px-4 py-2.5 rounded-lg text-sm text-gray-600 bg-gray-100 hover:bg-gray-200">Cancelar</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══ MODAL SALIDAS A PRODUCCIÓN ══ */}
      {showSalida && (
        <Modal title="Salidas a Producción" onClose={() => setShowSalida(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fecha">
                <input type="date" value={fSalida.fecha}
                  onChange={e => setFSalida(p => ({...p, fecha: e.target.value}))} className={inp}/>
              </Field>
              <Field label="U/M">
                <select value={fSalida.u_m}
                  onChange={e => setFSalida(p => ({...p, u_m: e.target.value}))} className={inp}>
                  {['UNIDAD','PACK','CAJA','KG'].map(u => <option key={u}>{u}</option>)}
                </select>
              </Field>
            </div>
            <Field label="COD_INTERNO *">
              <select value={fSalida.cod_interno}
                onChange={e => {
                  const desc = SKUS_CORRUGADOS[e.target.value] || invMap.current[e.target.value]?.descripcion || ''
                  setFSalida(p => ({...p, cod_interno: e.target.value, descripcion: desc}))
                }} className={inp}>
                <option value="">— Seleccionar SKU —</option>
                {Object.entries(SKUS_CORRUGADOS).map(([cod, desc]) => (
                  <option key={cod} value={cod}>{cod} · {desc}</option>
                ))}
              </select>
            </Field>
            {fSalida.cod_interno && (
              <div className="rounded-lg px-3 py-2 text-xs bg-purple-50 border border-purple-200 text-purple-800">
                <strong>Stock disponible:</strong>{' '}
                {fmtN(getDisp(Math.round(toNum(invMap.current[fSalida.cod_interno]?.cant_bodega))))} UNIDAD
              </div>
            )}
            <Field label="Cantidad a retirar *">
              <input type="number" min="1" value={fSalida.cantidad}
                onChange={e => setFSalida(p => ({...p, cantidad: e.target.value}))}
                placeholder="0" className={inp}/>
              {fSalida.cod_interno && fSalida.cantidad && (() => {
                const disponible = getDisp(Math.round(toNum(invMap.current[fSalida.cod_interno]?.cant_bodega)))
                const cant = toNum(fSalida.cantidad)
                return cant > disponible
                  ? <p className="text-xs text-red-500 mt-1">⚠ Cantidad supera el stock disponible ({fmtN(disponible)})</p>
                  : <p className="text-xs text-emerald-600 mt-1">Stock restante: {fmtN(disponible - cant)} {fSalida.u_m}</p>
              })()}
            </Field>
            <Field label="Observación / Referencia">
              <input value={fSalida.observacion}
                onChange={e => setFSalida(p => ({...p, observacion: e.target.value}))}
                placeholder="Lote producción, OT-2026-001..." className={inp}/>
            </Field>
            <div className="flex gap-3 pt-2">
              <button onClick={submitSalida} disabled={saving || !fSalida.cod_interno || !fSalida.cantidad}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: '#6d5a9e' }}>
                {saving ? 'Procesando...' : 'Aprobar Salida a Producción'}
              </button>
              <button onClick={() => setShowSalida(false)}
                className="px-4 py-2.5 rounded-lg text-sm text-gray-600 bg-gray-100 hover:bg-gray-200">Cancelar</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══ MODAL ENTRADA DE PEDIDO ══ */}
      {showPedido && (
        <Modal title="Entrada de Pedido" onClose={() => setShowPedido(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fecha">
                <input type="date" value={pedFecha}
                  onChange={e => setPedFecha(e.target.value)} className={inp}/>
              </Field>
              <Field label="Referencia / Lote">
                <input value={pedRef} onChange={e => setPedRef(e.target.value)}
                  placeholder="PED-COR-2026-001" className={inp}/>
              </Field>
            </div>

            <Field label={`Seleccionar SKUs de cajas (${pedSkus.length} seleccionados)`}>
              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-80 overflow-y-auto">
                {Object.entries(SKUS_CORRUGADOS).map(([cod, desc]) => {
                  const sel  = pedSkus.includes(cod)
                  const cant = pedCants[cod] || 0
                  const disp = getDisp(Math.round(toNum(invMap.current[cod]?.cant_bodega)))
                  return (
                    <div key={cod}
                      className={`flex items-center gap-3 px-3 py-2.5 border-b border-gray-100 last:border-0 cursor-pointer transition-colors ${sel ? 'bg-amber-50' : 'hover:bg-gray-50'}`}
                      onClick={() => toggleSku(cod)}>
                      <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${sel ? 'border-amber-500 bg-amber-500' : 'border-gray-300'}`}>
                        {sel && <svg viewBox="0 0 10 8" className="w-2.5 h-2.5 fill-white"><path d="M1 4l3 3 5-6"/></svg>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-mono font-semibold text-amber-700">{cod}</div>
                        <div className="text-xs text-gray-600 truncate">{desc}</div>
                        <div className="text-xs text-gray-400">Disp: <span className="text-emerald-600">{fmtN(disp)}</span></div>
                      </div>
                      {sel && (
                        <div onClick={e => e.stopPropagation()} className="flex-shrink-0">
                          <input type="number" value={cant} min={1}
                            onChange={e => updateCant(cod, toNum(e.target.value))}
                            className={`w-24 text-sm text-right border rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-amber-400 ${cant <= 0 ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                            placeholder="0"/>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </Field>

            {pedSkus.length > 0 && (
              <div className={`rounded-lg px-4 py-3 text-sm flex items-center justify-between ${pedValido ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
                <span className="text-gray-600">Total cajas pedidas:</span>
                <span className={`font-bold text-lg ${pedValido ? 'text-emerald-700' : 'text-red-600'}`}>{fmtN(pedTotal)}</span>
              </div>
            )}

            {pedError && (
              <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 rounded-lg px-3 py-2 border border-red-200">
                <AlertCircle size={13}/>{pedError}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={submitPedido} disabled={saving || !pedValido}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-40"
                style={{ background: '#c8873a' }}>
                {saving ? 'Procesando...' : `Crear Pedido (${fmtN(pedTotal)} uds)`}
              </button>
              <button onClick={() => setShowPedido(false)}
                className="px-4 py-2.5 rounded-lg text-sm text-gray-600 bg-gray-100 hover:bg-gray-200">Cancelar</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══ MODAL AJUSTE DIRECTO (superadmin) ══ */}
      {showAjuste && (
        <Modal title="Ajustar Cantidad en Bodega" onClose={() => setShowAjuste(false)}>
          <div className="space-y-4">
            <div className="rounded-lg px-4 py-3 bg-amber-50 border border-amber-200 text-xs text-amber-800">
              <strong>⚠ Ajuste directo:</strong> modifica <code>cant_bodega</code> al valor exacto ingresado y queda registrado en auditoría.
            </div>
            <div className="rounded-lg px-3 py-2 bg-orange-50 border border-orange-100 text-xs">
              <span className="font-mono font-semibold text-amber-700">{ajusteForm.cod_interno}</span>
              <span className="text-gray-500 ml-2">{ajusteForm.descripcion}</span>
            </div>
            <Field label="Cantidad actual (bodega)">
              <div className="rounded-lg px-3 py-2 bg-gray-50 border border-gray-200 text-sm font-bold text-gray-700">
                {ajusteForm.cantidad_actual.toLocaleString('en-US')}
              </div>
            </Field>
            <Field label="Nueva cantidad *">
              <input type="number" min="0" value={ajusteForm.cantidad_nueva}
                onChange={e => setAjusteForm(p => ({ ...p, cantidad_nueva: e.target.value }))}
                className={inp} placeholder="0"/>
              {ajusteForm.cantidad_nueva !== '' && (() => {
                const diff = toNum(ajusteForm.cantidad_nueva) - ajusteForm.cantidad_actual
                if (diff === 0) return null
                return (
                  <p className={`text-xs mt-1 ${diff > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {diff > 0 ? `+${fmtN(diff)}` : fmtN(diff)} unidades vs actual
                  </p>
                )
              })()}
            </Field>
            <Field label="Motivo del ajuste">
              <input value={ajusteForm.motivo}
                onChange={e => setAjusteForm(p => ({ ...p, motivo: e.target.value }))}
                placeholder="Conteo físico, corrección de error, etc." className={inp}/>
            </Field>
            <div className="flex gap-3 pt-2">
              <button onClick={submitAjuste} disabled={savingAjuste || ajusteForm.cantidad_nueva === ''}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: '#c8873a' }}>
                {savingAjuste ? 'Guardando...' : 'Confirmar Ajuste'}
              </button>
              <button onClick={() => setShowAjuste(false)}
                className="px-4 py-2.5 rounded-lg text-sm text-gray-600 bg-gray-100 hover:bg-gray-200">Cancelar</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══ MODAL HISTORIAL AUDITORÍA ══ */}
      {showHistorial && historialSku && (
        <Modal title={`Historial — ${historialSku.cod}`} onClose={() => setShowHistorial(false)}>
          <div className="space-y-3">
            <p className="text-xs text-gray-500 truncate">{historialSku.desc}</p>
            {historialLoading
              ? <div className="h-32 flex items-center justify-center text-gray-300 text-sm">Cargando historial...</div>
              : historialRows.length === 0
                ? <div className="h-32 flex items-center justify-center text-gray-400 text-sm">Sin movimientos registrados</div>
                : <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-white z-10">
                        <tr className="text-gray-400 uppercase tracking-widest bg-gray-50 border-b border-gray-100">
                          <th className="text-left px-3 py-2">FECHA</th>
                          <th className="text-left px-3 py-2">TIPO</th>
                          <th className="text-right px-3 py-2">CANTIDAD</th>
                          <th className="text-left px-3 py-2">DETALLE / REF</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historialRows.map((h, i) => {
                          const esEntrada = h.tipo === 'ENTRADA'
                          return (
                            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                              <td className="px-3 py-2 text-gray-500">{fmtD(h.fecha)}</td>
                              <td className="px-3 py-2">
                                <span className={`font-medium px-1.5 py-0.5 rounded-full text-[10px] ${
                                  esEntrada
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : h.tipo === 'SALIDA PRODUCCIÓN'
                                      ? 'bg-purple-100 text-purple-700'
                                      : 'bg-orange-100 text-orange-700'
                                }`}>{h.tipo}</span>
                              </td>
                              <td className={`px-3 py-2 text-right font-bold ${esEntrada ? 'text-emerald-600' : 'text-red-500'}`}>
                                {esEntrada ? '+' : '-'}{fmtN(h.cantidad)}
                              </td>
                              <td className="px-3 py-2 text-gray-500 max-w-[160px] truncate">
                                {h.detalle || h.ref || '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
            }
          </div>
        </Modal>
      )}
    </div>
  )
}
