'use client'
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { RefreshCw, Upload, Search, X, AlertTriangle } from 'lucide-react'

// ── Tipos ──────────────────────────────────────────────────────────────────────
interface RetailRow {
  id:            number
  semana:        number
  pais:          string
  item_nbr:      string
  item:          string
  item_type:     string
  item_status:   string
  inventario:    number
  ordenes:       number
  transito:      number
  wharehouse:    number
  inv_cedi_cajas: number
  inv_cedi_unds:  number
  ventas_periodo: number
  dias_periodo:   number
}

interface Computed extends RetailRow {
  prom_diario:         number
  doh_tiendas:         number | null
  doh_tiendas_transito: number | null
  doh_cedi:            number | null
  doh_total:           number | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmt1(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function fmtD(n: number | null): string {
  if (n === null || !isFinite(n)) return '—'
  return String(Math.round(n))
}

function dohColor(d: number | null): string {
  if (d === null || !isFinite(d)) return '#9ca3af'
  if (d > 60)  return '#f59e0b'
  if (d >= 21) return '#10b981'
  return '#ef4444'
}
function dohBg(d: number | null): string {
  if (d === null || !isFinite(d)) return 'transparent'
  if (d > 60)  return '#fef3c720'
  if (d >= 21) return '#d1fae520'
  return '#fee2e220'
}
function dohLabel(d: number | null): string {
  if (d === null || !isFinite(d)) return 'Sin ventas'
  if (d > 60)  return 'Sobrestock'
  if (d >= 21) return 'Saludable'
  return 'Riesgo quiebre'
}

function compute(r: RetailRow, dias: number): Computed {
  const prom_diario = dias > 0 && r.ventas_periodo > 0
    ? r.ventas_periodo / dias
    : 0
  const doh = (inv: number) =>
    prom_diario > 0 ? inv / prom_diario : null

  return {
    ...r,
    prom_diario,
    doh_tiendas:          doh(r.inventario),
    doh_tiendas_transito: doh(r.inventario + r.transito),
    doh_cedi:             doh(r.inv_cedi_unds),
    doh_total:            doh(r.inventario + r.transito + r.wharehouse + r.inv_cedi_unds),
  }
}

// ── Celda DOH con color ────────────────────────────────────────────────────────
function DohCell({ v }: { v: number | null }) {
  const color = dohColor(v)
  const bg    = dohBg(v)
  return (
    <td className="px-2 py-2 text-right text-xs font-semibold tabular-nums"
      style={{ color, background: bg, borderRadius: 4 }}
      title={dohLabel(v)}
    >
      {fmtD(v)}
    </td>
  )
}

// ── Leyenda DOH ────────────────────────────────────────────────────────────────
function DohLegend() {
  return (
    <div className="flex items-center gap-4 text-[11px]">
      {[
        { color: '#ef4444', bg: '#fee2e220', label: 'Riesgo < 21d' },
        { color: '#10b981', bg: '#d1fae520', label: 'Saludable 21–60d' },
        { color: '#f59e0b', bg: '#fef3c720', label: 'Sobrestock > 60d' },
      ].map(({ color, bg, label }) => (
        <span key={label} className="flex items-center gap-1.5 px-2 py-1 rounded-full"
          style={{ background: bg, color }}>
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  )
}

// ── Modal de importación CSV ───────────────────────────────────────────────────
function UploadModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [pais,       setPais]       = useState('CR')
  const [semana,     setSemana]     = useState('')
  const [dias,       setDias]       = useState('91')
  const [file,       setFile]       = useState<File | null>(null)
  const [uploading,  setUploading]  = useState(false)
  const [error,      setError]      = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const submit = async () => {
    if (!file) return setError('Selecciona un archivo CSV')
    setUploading(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file',        file)
      fd.append('pais',        pais)
      fd.append('dias_periodo', dias)
      if (semana) fd.append('semana', semana)

      const res  = await fetch('/api/inventario/doh-retail/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      onSuccess()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al subir')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">Importar CSV Retail Link</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 space-y-1">
          <p className="font-semibold text-gray-600">Cabecera esperada del CSV:</p>
          <code className="text-[10px] text-gray-500 leading-relaxed">
            Item Nbr, Item, Item Type, Item Status, Inventario, Ordenes, Transito, Wharehouse,
            Inv CEDI Cajas, Inv CEDI Unds, Ventas
          </code>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">País</label>
            <select value={pais} onChange={e => setPais(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100">
              {['CR','GT','HN','SV','NI','EC','CO'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Días período</label>
            <input type="number" value={dias} onChange={e => setDias(e.target.value)}
              min={7} max={365}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Semana (YYYYWW) — dejar vacío para semana actual</label>
          <input type="text" value={semana} onChange={e => setSemana(e.target.value)}
            placeholder="ej. 202610"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100" />
        </div>

        <div>
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
            onChange={e => setFile(e.target.files?.[0] ?? null)} />
          <button onClick={() => fileRef.current?.click()}
            className="w-full border-2 border-dashed border-gray-200 rounded-xl py-4 text-sm text-gray-500 hover:border-blue-300 hover:text-blue-500 transition-colors">
            {file ? (
              <span className="text-blue-600 font-medium">{file.name}</span>
            ) : (
              <span>Haz clic para seleccionar el CSV</span>
            )}
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 rounded-lg p-3">
            <AlertTriangle size={14} />
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose}
            className="flex-1 border border-gray-200 rounded-xl py-2 text-sm text-gray-600 hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={submit} disabled={uploading || !file}
            className="flex-1 bg-blue-600 text-white rounded-xl py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {uploading ? 'Subiendo…' : 'Importar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────
export default function DohRetailPage() {
  const [semanas,       setSemanas]       = useState<number[]>([])
  const [paises,        setPaises]        = useState<string[]>([])
  const [rows,          setRows]          = useState<RetailRow[]>([])
  const [semanaActual,  setSemanaActual]  = useState<number | null>(null)

  const [fSemana, setFSemana] = useState('')
  const [fPais,   setFPais]   = useState('')
  const [fSearch, setFSearch] = useState('')

  const [diasSlider, setDiasSlider] = useState(91)
  const [maxDias,    setMaxDias]    = useState(91)

  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [showUpload,  setShowUpload]  = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const p = new URLSearchParams()
      if (fSemana) p.set('semana', fSemana)
      if (fPais)   p.set('pais',   fPais)
      if (fSearch) p.set('q',      fSearch)

      const res  = await fetch(`/api/inventario/doh-retail?${p}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      setSemanas(data.semanas ?? [])
      setPaises(data.paises  ?? [])
      setRows(data.rows       ?? [])
      setSemanaActual(data.semana_actual ?? null)

      // Ajustar slider al max del período
      const mx = Math.max(...(data.rows ?? []).map((r: RetailRow) => r.dias_periodo), 91)
      setMaxDias(mx)
      setDiasSlider(mx)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [fSemana, fPais, fSearch])

  useEffect(() => { fetchData() }, [fetchData])

  // Computed rows con DOH calculado según slider
  const computed = useMemo<Computed[]>(
    () => rows.map(r => compute(r, diasSlider)),
    [rows, diasSlider]
  )

  // Totales
  const totals = useMemo(() => {
    if (!computed.length) return null
    const sum = (f: keyof RetailRow) =>
      computed.reduce((s, r) => s + (Number(r[f]) || 0), 0)
    const totalVentas = sum('ventas_periodo')
    const promDiario  = diasSlider > 0 && totalVentas > 0 ? totalVentas / diasSlider : 0
    const doh = (inv: number) => promDiario > 0 ? inv / promDiario : null
    const totalInv     = sum('inventario')
    const totalOrd     = sum('ordenes')
    const totalTrans   = sum('transito')
    const totalWh      = sum('wharehouse')
    const totalCajAs   = sum('inv_cedi_cajas')
    const totalUnds    = sum('inv_cedi_unds')
    return {
      inventario: totalInv, ordenes: totalOrd, transito: totalTrans, wharehouse: totalWh,
      inv_cedi_cajas: totalCajAs, inv_cedi_unds: totalUnds,
      prom_diario: promDiario,
      doh_tiendas:          doh(totalInv),
      doh_tiendas_transito: doh(totalInv + totalTrans),
      doh_cedi:             doh(totalUnds),
      doh_total:            doh(totalInv + totalTrans + totalWh + totalUnds),
    }
  }, [computed, diasSlider])

  // Semanas en formato legible
  const semanaLabel = (s: number) => {
    const yr = Math.floor(s / 100)
    const wk = s % 100
    return `${yr} S${String(wk).padStart(2, '0')}`
  }

  const numSemanas = maxDias > 0 ? Math.round(maxDias / 7) : 13

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventario DOH Retail</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {semanaActual
              ? `Semana actual: ${semanaActual} · ${numSemanas} semanas`
              : 'Sin datos — importa un CSV de Retail Link'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
          <button onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            <Upload size={13} />
            Importar CSV
          </button>
        </div>
      </div>

      {/* Slider */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-gray-700">
              Deslice # días para Ventas Promedio Diario
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {diasSlider} días ({Math.round(diasSlider / 7)} semanas)
            </p>
          </div>
          <span className="text-2xl font-bold text-blue-600 tabular-nums">{diasSlider}</span>
        </div>
        <input
          type="range"
          min={7}
          max={maxDias}
          step={7}
          value={diasSlider}
          onChange={e => setDiasSlider(Number(e.target.value))}
          className="w-full h-2 rounded-full appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, #3b82f6 ${((diasSlider - 7) / (maxDias - 7)) * 100}%, #e5e7eb ${((diasSlider - 7) / (maxDias - 7)) * 100}%)`,
          }}
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>7d (1 sem)</span>
          <span>{maxDias}d ({numSemanas} sem)</span>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-3 items-end">
        {/* Semana */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">Semana</label>
          <select value={fSemana} onChange={e => setFSemana(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm min-w-[130px] focus:outline-none focus:ring-2 focus:ring-blue-100">
            <option value="">Más reciente</option>
            {semanas.map(s => <option key={s} value={s}>{semanaLabel(s)}</option>)}
          </select>
        </div>

        {/* País */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">País</label>
          <select value={fPais} onChange={e => setFPais(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm min-w-[100px] focus:outline-none focus:ring-2 focus:ring-blue-100">
            <option value="">Todos</option>
            {paises.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* Búsqueda */}
        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <label className="text-xs font-medium text-gray-500">Buscar producto</label>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={fSearch}
              onChange={e => setFSearch(e.target.value)}
              placeholder="Nombre o Item Nbr…"
              className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        {/* Leyenda */}
        <div className="ml-auto"><DohLegend /></div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm flex items-center gap-2">
          <AlertTriangle size={15} />{error}
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-sm text-gray-400">Cargando…</div>
        ) : computed.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <p className="text-sm text-gray-400">Sin datos</p>
            <button onClick={() => setShowUpload(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              <Upload size={13} /> Importar CSV
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {/* Producto */}
                  <th className="px-3 py-3 text-left text-gray-500 font-semibold sticky left-0 bg-gray-50 min-w-[80px]">Item Nbr</th>
                  <th className="px-3 py-3 text-left text-gray-500 font-semibold min-w-[200px]">Item</th>
                  <th className="px-3 py-3 text-center text-gray-500 font-semibold">Tipo</th>
                  <th className="px-3 py-3 text-center text-gray-500 font-semibold">Est.</th>
                  {/* Tiendas */}
                  <th className="px-2 py-3 text-right text-gray-500 font-semibold border-l border-gray-100">Inv.</th>
                  <th className="px-2 py-3 text-right text-gray-500 font-semibold">Órdenes</th>
                  <th className="px-2 py-3 text-right text-gray-500 font-semibold">Tránsito</th>
                  <th className="px-2 py-3 text-right text-gray-500 font-semibold">Wharehouse</th>
                  <th className="px-2 py-3 text-right text-blue-500 font-semibold">DOH Tiendas</th>
                  <th className="px-2 py-3 text-right text-blue-500 font-semibold">DOH + Trán.</th>
                  {/* Prom */}
                  <th className="px-2 py-3 text-right text-gray-700 font-semibold border-l border-gray-100">Prom. Diario</th>
                  {/* CEDI */}
                  <th className="px-2 py-3 text-right text-gray-500 font-semibold border-l border-gray-100">CEDI Cajas</th>
                  <th className="px-2 py-3 text-right text-gray-500 font-semibold">CEDI Unds.</th>
                  <th className="px-2 py-3 text-right text-purple-500 font-semibold">DOH CEDI</th>
                  {/* Total */}
                  <th className="px-2 py-3 text-right text-green-600 font-semibold border-l border-gray-100">DOH Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {/* Fila totales */}
                {totals && (
                  <tr className="bg-gray-50 font-bold border-b-2 border-gray-200">
                    <td className="px-3 py-2 text-gray-600 sticky left-0 bg-gray-50">Totales</td>
                    <td className="px-3 py-2 text-gray-500">{computed.length} productos</td>
                    <td /><td />
                    <td className="px-2 py-2 text-right">{fmt1(totals.inventario)}</td>
                    <td className="px-2 py-2 text-right">{fmt1(totals.ordenes)}</td>
                    <td className="px-2 py-2 text-right">{fmt1(totals.transito)}</td>
                    <td className="px-2 py-2 text-right">{fmt1(totals.wharehouse)}</td>
                    <DohCell v={totals.doh_tiendas} />
                    <DohCell v={totals.doh_tiendas_transito} />
                    <td className="px-2 py-2 text-right text-gray-700">{fmtD(totals.prom_diario)}</td>
                    <td className="px-2 py-2 text-right">{fmt1(totals.inv_cedi_cajas)}</td>
                    <td className="px-2 py-2 text-right">{fmt1(totals.inv_cedi_unds)}</td>
                    <DohCell v={totals.doh_cedi} />
                    <DohCell v={totals.doh_total} />
                  </tr>
                )}

                {/* Filas productos */}
                {computed.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-3 py-2 text-gray-600 font-mono sticky left-0 bg-white">
                      {r.item_nbr}
                    </td>
                    <td className="px-3 py-2 text-gray-800 max-w-[240px] truncate" title={r.item}>
                      {r.item}
                    </td>
                    <td className="px-2 py-2 text-center text-gray-400">{r.item_type}</td>
                    <td className="px-2 py-2 text-center">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        r.item_status === 'A' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'
                      }`}>{r.item_status}</span>
                    </td>
                    <td className="px-2 py-2 text-right text-gray-700 tabular-nums">{fmt1(r.inventario)}</td>
                    <td className="px-2 py-2 text-right text-gray-500 tabular-nums">{fmt1(r.ordenes)}</td>
                    <td className="px-2 py-2 text-right text-gray-500 tabular-nums">{fmt1(r.transito)}</td>
                    <td className="px-2 py-2 text-right text-gray-500 tabular-nums">{fmt1(r.wharehouse)}</td>
                    <DohCell v={r.doh_tiendas} />
                    <DohCell v={r.doh_tiendas_transito} />
                    <td className="px-2 py-2 text-right text-gray-700 tabular-nums font-medium">
                      {r.prom_diario > 0 ? fmtD(r.prom_diario) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-2 py-2 text-right text-gray-500 tabular-nums">{fmt1(r.inv_cedi_cajas)}</td>
                    <td className="px-2 py-2 text-right text-gray-500 tabular-nums">{fmt1(r.inv_cedi_unds)}</td>
                    <DohCell v={r.doh_cedi} />
                    <DohCell v={r.doh_total} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal upload */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onSuccess={fetchData}
        />
      )}
    </div>
  )
}
