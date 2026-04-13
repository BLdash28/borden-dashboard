'use client'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import {
  RefreshCw, AlertTriangle, TrendingUp, Package, ArrowUp, ArrowDown,
  ArrowUpDown, Search, Download, X, Info,
} from 'lucide-react'
import * as XLSX from 'xlsx'

// ── Helpers ───────────────────────────────────────────────────────────────────
const COUNTRY_FLAGS: Record<string, string> = {
  CO: '🇨🇴', CR: '🇨🇷', GT: '🇬🇹', HN: '🇭🇳', NI: '🇳🇮', SV: '🇸🇻',
}

function fmtN(n: number) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return String(Math.round(n))
}

function fmtDoh(v: number | null): string {
  if (v === null) return '—'
  return String(v)
}

// ── Semáforo DOH ──────────────────────────────────────────────────────────────
function dohColor(v: number | null): string {
  if (v === null) return 'var(--t3)'
  if (v <= 7)  return '#ef4444'  // 🔴 riesgo quiebre
  if (v <= 21) return '#f59e0b'  // 🟡 precaución
  if (v <= 60) return '#10b981'  // 🟢 saludable
  return '#3b82f6'               // 🔵 sobrestock
}
function dohBg(v: number | null): string {
  if (v === null) return 'transparent'
  if (v <= 7)  return '#ef444415'
  if (v <= 21) return '#f59e0b15'
  if (v <= 60) return '#10b98115'
  return '#3b82f615'
}
function dohLabel(v: number | null): string {
  if (v === null) return 'Sin ventas 90 días'
  if (v <= 7)  return 'Riesgo quiebre'
  if (v <= 21) return 'Precaución'
  if (v <= 60) return 'Saludable'
  return 'Sobrestock'
}

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface DohRow {
  pais: string; cadena: string
  item_nbr: string; item: string; item_type: string; item_status: string
  inventario: number; ordenes: number; transito: number; wharehouse: number
  inv_cedi_cajas: number; inv_cedi_unds: number
  prom_diario: number
  doh_tiendas: number | null
  doh_tiendas_t: number | null
  doh_cedi: number | null
  doh_cedi_t: number | null
  semana: number | null
}

interface Kpi {
  riesgo: number; sobrestock: number; vpd_total: number; doh_prom: number | null
}

// ── Celda DOH con semáforo ─────────────────────────────────────────────────────
function DohCell({ v, tooltip }: { v: number | null; tooltip?: string }) {
  const [show, setShow] = useState(false)
  return (
    <td
      className="px-2 py-1.5 text-right text-[12px] font-bold tabular-nums cursor-default relative"
      style={{ color: dohColor(v), background: dohBg(v) }}
      title={tooltip ?? dohLabel(v)}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {fmtDoh(v)}
      {show && v === null && (
        <div className="absolute z-50 bottom-full right-0 mb-1 px-2 py-1 rounded text-[10px] whitespace-nowrap"
          style={{ background: '#1a1a1a', border: '1px solid var(--border)', color: 'var(--t3)' }}>
          Sin ventas en los últimos 90 días
        </div>
      )}
    </td>
  )
}

// ── Cabecera ordenable ─────────────────────────────────────────────────────────
type SortDir = 'asc' | 'desc' | null
function SortHeader({ label, field, sort, onSort, tooltip, sticky }: {
  label: string; field: string
  sort: { field: string; dir: SortDir }
  onSort: (f: string) => void
  tooltip?: string
  sticky?: boolean
}) {
  const active = sort.field === field
  return (
    <th
      className={`px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide whitespace-nowrap cursor-pointer select-none ${sticky ? 'sticky z-10' : ''}`}
      style={{ color: active ? 'var(--acc)' : 'rgba(255,255,255,0.4)', background: '#111009' }}
      onClick={() => onSort(field)}
      title={tooltip}
    >
      <span className="flex items-center justify-end gap-1">
        {tooltip && <Info size={9} style={{ color: 'rgba(255,255,255,0.25)' }} />}
        {label}
        {active && sort.dir === 'asc'  ? <ArrowUp size={10} />  :
         active && sort.dir === 'desc' ? <ArrowDown size={10} /> :
         <ArrowUpDown size={10} style={{ opacity: 0.3 }} />}
      </span>
    </th>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function DohPage() {
  const [rows,      setRows]      = useState<DohRow[]>([])
  const [kpi,       setKpi]       = useState<Kpi | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')

  // Filtros
  const [paisOpts,   setPaisOpts]   = useState<string[]>([])
  const [cadenaOpts, setCadenaOpts] = useState<string[]>([])
  const [catOpts,    setCatOpts]    = useState<string[]>([])
  const [fPais,      setFPais]      = useState<string[]>([])
  const [fCadena,    setFCadena]    = useState('')
  const [fCat,       setFCat]       = useState<string[]>([])
  const [fQ,         setFQ]         = useState('')
  const [soloRiesgo, setSoloRiesgo] = useState(false)
  const [soloStock,  setSoloStock]  = useState(false)

  // Tabla
  const [sort, setSort] = useState<{ field: string; dir: SortDir }>({ field: 'inventario', dir: 'desc' })

  // Upload Retail Link
  const [showUpload, setShowUpload] = useState(false)
  const [upPais,  setUpPais]  = useState('CR')
  const [upDias,  setUpDias]  = useState('91')
  const [upSem,   setUpSem]   = useState('')
  const [upFile,  setUpFile]  = useState<File | null>(null)
  const [upErr,   setUpErr]   = useState('')
  const [upBusy,  setUpBusy]  = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const p = new URLSearchParams()
      if (fPais.length)   p.set('paises', fPais.join(','))
      if (fCadena)        p.set('cadena', fCadena)
      if (fCat.length)    p.set('categorias', fCat.join(','))
      if (fQ)             p.set('q', fQ)
      const d = await fetch('/api/inventario/doh?' + p).then(r => r.json())
      if (d.error) throw new Error(d.error)
      setRows(d.rows ?? [])
      setKpi(d.kpi ?? null)
      setPaisOpts(d.paisOpts ?? [])
      setCadenaOpts(d.cadenaOpts ?? [])
      setCatOpts(d.catOpts ?? [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [fPais, fCadena, fCat, fQ])

  useEffect(() => { load() }, [load])

  // Filtros locales + sort
  const sorted = useMemo(() => {
    let data = rows.filter(r => {
      if (soloRiesgo && !(r.doh_tiendas !== null && r.doh_tiendas <= 7)) return false
      if (soloStock  && !(r.doh_tiendas !== null && r.doh_tiendas >  60)) return false
      return true
    })
    if (!sort.field || !sort.dir) return data
    return [...data].sort((a, b) => {
      const va = (a as any)[sort.field] ?? -Infinity
      const vb = (b as any)[sort.field] ?? -Infinity
      return sort.dir === 'asc' ? va - vb : vb - va
    })
  }, [rows, sort, soloRiesgo, soloStock])

  // Totales
  const totals = useMemo(() => {
    if (!sorted.length) return null
    const sum = (f: keyof DohRow) => sorted.reduce((s, r) => s + (Number(r[f]) || 0), 0)
    const vpd = sum('prom_diario')
    const inv = sum('inventario'), tr = sum('transito'), cu = sum('inv_cedi_unds')
    const doh_t = vpd > 0 ? Math.ceil(inv / vpd)       : null
    const doh_tt = vpd > 0 ? Math.ceil((inv+tr) / vpd) : null
    const doh_c = vpd > 0 ? Math.ceil(cu / vpd)        : null
    const doh_ct = vpd > 0 ? Math.ceil((cu+tr) / vpd)  : null
    return {
      inventario: inv, ordenes: sum('ordenes'), transito: tr,
      wharehouse: sum('wharehouse'), inv_cedi_cajas: sum('inv_cedi_cajas'),
      inv_cedi_unds: cu, prom_diario: vpd,
      doh_tiendas: doh_t, doh_tiendas_t: doh_tt, doh_cedi: doh_c, doh_cedi_t: doh_ct,
    }
  }, [sorted])

  const handleSort = (field: string) => {
    setSort(prev =>
      prev.field === field
        ? { field, dir: prev.dir === 'desc' ? 'asc' : prev.dir === 'asc' ? null : 'desc' }
        : { field, dir: 'desc' }
    )
  }

  const doUpload = async () => {
    if (!upFile) return setUpErr('Selecciona un CSV')
    setUpBusy(true); setUpErr('')
    try {
      const fd = new FormData()
      fd.append('file', upFile); fd.append('pais', upPais); fd.append('dias_periodo', upDias)
      if (upSem) fd.append('semana', upSem)
      const d = await fetch('/api/inventario/doh-retail/upload', { method: 'POST', body: fd }).then(r => r.json())
      if (d.error) throw new Error(d.error)
      setShowUpload(false); setUpFile(null); load()
    } catch (e: any) { setUpErr(e.message) } finally { setUpBusy(false) }
  }

  const exportExcel = () => {
    const data = sorted.map(r => ({
      'País':               r.pais,
      'Cadena':             r.cadena,
      'Item Nbr':           r.item_nbr,
      'Descripción':        r.item,
      'Tipo':               r.item_type,
      'Estado':             r.item_status,
      'Inventario':         r.inventario,
      'Órdenes':            r.ordenes,
      'Tránsito':           r.transito,
      'Warehouse':          r.wharehouse,
      'CEDI Cajas':         r.inv_cedi_cajas,
      'CEDI Unds':          r.inv_cedi_unds,
      'VPD 90d':            r.prom_diario,
      'DOH Tiendas':        r.doh_tiendas ?? '',
      'DOH Tiendas+Tráns.': r.doh_tiendas_t ?? '',
      'DOH CEDI':           r.doh_cedi ?? '',
      'DOH CEDI+Tráns.':    r.doh_cedi_t ?? '',
    }))
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(data)
    XLSX.utils.book_append_sheet(wb, ws, 'DOH')
    XLSX.writeFile(wb, `DOH_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  const s = { field: sort.field, dir: sort.dir }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1600px] mx-auto">

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: 'SKUs en Riesgo', value: kpi?.riesgo ?? '—',
            sub: 'DOH ≤ 7 días', icon: AlertTriangle, color: '#ef4444', bg: '#ef444415',
          },
          {
            label: 'SKUs Sobrestock', value: kpi?.sobrestock ?? '—',
            sub: 'DOH > 60 días', icon: Package, color: '#3b82f6', bg: '#3b82f615',
          },
          {
            label: 'VPD Total', value: kpi?.vpd_total !== undefined ? fmtN(kpi.vpd_total) : '—',
            sub: 'Unidades / día (90d)', icon: TrendingUp, color: '#10b981', bg: '#10b98115',
          },
          {
            label: 'DOH Promedio', value: kpi?.doh_prom !== null ? (kpi?.doh_prom ?? '—') + ' días' : '—',
            sub: 'Promedio portafolio', icon: Package, color: '#c8873a', bg: '#c8873a15',
          },
        ].map(c => (
          <div key={c.label} className="rounded-xl p-4 flex items-center gap-3"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: c.bg }}>
              <c.icon size={18} style={{ color: c.color }} />
            </div>
            <div>
              <div className="text-[22px] font-bold leading-none" style={{ color: c.color }}>{c.value}</div>
              <div className="text-[11px] font-medium mt-0.5" style={{ color: 'var(--t1)' }}>{c.label}</div>
              <div className="text-[10px]" style={{ color: 'var(--t3)' }}>{c.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="rounded-xl p-4 flex flex-wrap gap-3 items-center"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

        {/* Búsqueda */}
        <div className="relative flex-1 min-w-[160px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--t3)' }} />
          <input
            value={fQ} onChange={e => setFQ(e.target.value)}
            placeholder="Buscar SKU / descripción…"
            className="w-full pl-7 pr-3 py-1.5 rounded-lg text-[12px] border"
            style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--t1)' }}
          />
        </div>

        {/* País */}
        <select value={fPais[0] || ''} onChange={e => setFPais(e.target.value ? [e.target.value] : [])}
          className="border rounded-lg px-2 py-1.5 text-[12px]"
          style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--t1)' }}>
          <option value="">Todos los países</option>
          {paisOpts.map(p => <option key={p} value={p}>{COUNTRY_FLAGS[p] ?? ''} {p}</option>)}
        </select>

        {/* Cadena */}
        <select value={fCadena} onChange={e => setFCadena(e.target.value)}
          className="border rounded-lg px-2 py-1.5 text-[12px]"
          style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--t1)' }}>
          <option value="">Todas las cadenas</option>
          {cadenaOpts.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Categoría */}
        <select value={fCat[0] || ''} onChange={e => setFCat(e.target.value ? [e.target.value] : [])}
          className="border rounded-lg px-2 py-1.5 text-[12px]"
          style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--t1)' }}>
          <option value="">Todas las categorías</option>
          {catOpts.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Toggles */}
        <label className="flex items-center gap-1.5 text-[11px] cursor-pointer select-none"
          style={{ color: soloRiesgo ? '#ef4444' : 'var(--t3)' }}>
          <input type="checkbox" checked={soloRiesgo} onChange={e => setSoloRiesgo(e.target.checked)} className="accent-red-500" />
          Solo riesgo
        </label>
        <label className="flex items-center gap-1.5 text-[11px] cursor-pointer select-none"
          style={{ color: soloStock ? '#3b82f6' : 'var(--t3)' }}>
          <input type="checkbox" checked={soloStock} onChange={e => setSoloStock(e.target.checked)} className="accent-blue-500" />
          Solo sobrestock
        </label>

        <div className="ml-auto flex gap-2">
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] border"
            style={{ borderColor: 'var(--border)', color: 'var(--t3)', background: 'var(--bg)' }}>
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
          <button onClick={exportExcel}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] border"
            style={{ borderColor: 'var(--border)', color: 'var(--t3)', background: 'var(--bg)' }}>
            <Download size={11} /> Excel
          </button>
          <button onClick={() => setShowUpload(v => !v)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium"
            style={{ background: 'var(--acc)', color: '#fff' }}>
            Importar CSV
          </button>
        </div>
      </div>

      {/* Upload Retail Link */}
      {showUpload && (
        <div className="rounded-xl p-4 space-y-3 text-[12px]"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between">
            <p className="font-semibold" style={{ color: 'var(--t2)' }}>Importar CSV Retail Link</p>
            <button onClick={() => setShowUpload(false)}><X size={14} style={{ color: 'var(--t3)' }} /></button>
          </div>
          <p className="text-[10px]" style={{ color: 'var(--t3)' }}>
            Cabecera esperada: Item Nbr, Item, Item Type, Item Status, Inventario, Ordenes, Transito, Wharehouse, Inv CEDI Cajas, Inv CEDI Unds, Ventas
          </p>
          <div className="flex flex-wrap gap-2">
            <select value={upPais} onChange={e => setUpPais(e.target.value)}
              className="border rounded-lg px-2 py-1.5 text-[11px]"
              style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--t1)' }}>
              {['CR','GT','HN','SV','NI','CO'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <input type="number" value={upDias} onChange={e => setUpDias(e.target.value)}
              placeholder="Días (91)" min={7} max={365}
              className="border rounded-lg px-2 py-1.5 text-[11px] w-24"
              style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--t1)' }} />
            <input type="text" value={upSem} onChange={e => setUpSem(e.target.value)}
              placeholder="Semana YYYYWW (opcional)"
              className="border rounded-lg px-2 py-1.5 text-[11px] w-44"
              style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--t1)' }} />
          </div>
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
            onChange={e => setUpFile(e.target.files?.[0] ?? null)} />
          <button onClick={() => fileRef.current?.click()}
            className="w-full rounded-lg py-2 text-[11px] border-2 border-dashed transition-colors"
            style={{ borderColor: 'var(--border)', color: upFile ? 'var(--acc)' : 'var(--t3)' }}>
            {upFile ? upFile.name : 'Seleccionar CSV…'}
          </button>
          {upErr && <p className="text-[11px] text-red-500">{upErr}</p>}
          <div className="flex gap-2">
            <button onClick={() => setShowUpload(false)}
              className="flex-1 rounded-lg py-1.5 text-[11px] border"
              style={{ borderColor: 'var(--border)', color: 'var(--t3)' }}>Cancelar</button>
            <button onClick={doUpload} disabled={upBusy}
              className="flex-1 rounded-lg py-1.5 text-[11px] font-medium"
              style={{ background: 'var(--acc)', color: '#fff', opacity: upBusy ? 0.6 : 1 }}>
              {upBusy ? 'Importando…' : 'Importar'}
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl p-3 text-[12px] text-red-400 flex items-center gap-2"
          style={{ background: '#ef444415', border: '1px solid #ef444430' }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* Semáforo legend */}
      <div className="flex items-center gap-4 text-[10px]" style={{ color: 'var(--t3)' }}>
        {[
          { color: '#ef4444', label: '≤ 7 días — Riesgo quiebre' },
          { color: '#f59e0b', label: '8–21 días — Precaución' },
          { color: '#10b981', label: '22–60 días — Saludable' },
          { color: '#3b82f6', label: '> 60 días — Sobrestock' },
        ].map(s => (
          <span key={s.label} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        <span className="ml-auto">{sorted.length} SKUs · VPD calculado sobre 90 días</span>
      </div>

      {/* Tabla */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]" style={{ minWidth: 1200 }}>
            <thead>
              <tr style={{ background: '#111009', borderBottom: '1px solid var(--border)' }}>
                {/* Columnas sticky */}
                <th className="sticky left-0 z-10 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide whitespace-nowrap"
                  style={{ color: 'rgba(255,255,255,0.4)', background: '#111009', minWidth: 90 }}>
                  País
                </th>
                <th className="sticky left-[90px] z-10 px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide whitespace-nowrap"
                  style={{ color: 'rgba(255,255,255,0.4)', background: '#111009', minWidth: 100 }}>
                  Item Nbr
                </th>
                <th className="sticky left-[190px] z-10 px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide"
                  style={{ color: 'rgba(255,255,255,0.4)', background: '#111009', minWidth: 180 }}>
                  Descripción
                </th>
                <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide whitespace-nowrap"
                  style={{ color: 'rgba(255,255,255,0.4)' }}>Tipo</th>
                <th className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide whitespace-nowrap"
                  style={{ color: 'rgba(255,255,255,0.4)' }}>Est.</th>
                <SortHeader label="Inventario"  field="inventario"     sort={s} onSort={handleSort} />
                <SortHeader label="Órdenes"     field="ordenes"        sort={s} onSort={handleSort} />
                <SortHeader label="Tránsito"    field="transito"       sort={s} onSort={handleSort} />
                <SortHeader label="Warehouse"   field="wharehouse"     sort={s} onSort={handleSort} />
                <SortHeader label="DOH Tiendas" field="doh_tiendas"    sort={s} onSort={handleSort}
                  tooltip="CEILING(Inventario / VPD). VPD = ventas últimos 90 días ÷ 90." />
                <SortHeader label="DOH T+Trán." field="doh_tiendas_t"  sort={s} onSort={handleSort}
                  tooltip="CEILING((Inventario + Tránsito) / VPD)" />
                <SortHeader label="VPD 90d"     field="prom_diario"    sort={s} onSort={handleSort}
                  tooltip="Ventas Promedio Diario = suma unidades 90 días ÷ 90" />
                <SortHeader label="CEDI Cajas"  field="inv_cedi_cajas" sort={s} onSort={handleSort} />
                <SortHeader label="CEDI Unds"   field="inv_cedi_unds"  sort={s} onSort={handleSort} />
                <SortHeader label="DOH CEDI"    field="doh_cedi"       sort={s} onSort={handleSort}
                  tooltip="CEILING(CEDI Unds / VPD)" />
                <SortHeader label="DOH CEDI+T"  field="doh_cedi_t"    sort={s} onSort={handleSort}
                  tooltip="CEILING((CEDI Unds + Tránsito) / VPD)" />
                <th className="px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide whitespace-nowrap"
                  style={{ color: 'rgba(255,255,255,0.4)' }}
                  title="Dato proporcionado por el proveedor, pendiente de validar metodología.">
                  DOH Total ⓘ
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Fila totales */}
              {totals && (
                <tr style={{ background: 'rgba(200,135,58,0.08)', borderBottom: '2px solid rgba(200,135,58,0.25)' }}>
                  <td className="sticky left-0 px-3 py-2 text-[11px] font-bold whitespace-nowrap"
                    style={{ background: 'rgba(200,135,58,0.08)', color: 'var(--acc)' }} colSpan={3}>
                    TOTALES ({sorted.length} SKUs)
                  </td>
                  <td /><td />
                  {[totals.inventario, totals.ordenes, totals.transito, totals.wharehouse].map((v, i) => (
                    <td key={i} className="px-2 py-2 text-right text-[11px] font-bold tabular-nums"
                      style={{ color: 'var(--t1)' }}>{fmtN(v)}</td>
                  ))}
                  <DohCell v={totals.doh_tiendas} />
                  <DohCell v={totals.doh_tiendas_t} />
                  <td className="px-2 py-2 text-right text-[11px] font-bold tabular-nums"
                    style={{ color: 'var(--t2)' }}>{totals.prom_diario.toFixed(1)}</td>
                  {[totals.inv_cedi_cajas, totals.inv_cedi_unds].map((v, i) => (
                    <td key={i} className="px-2 py-2 text-right text-[11px] font-bold tabular-nums"
                      style={{ color: 'var(--t1)' }}>{fmtN(v)}</td>
                  ))}
                  <DohCell v={totals.doh_cedi} />
                  <DohCell v={totals.doh_cedi_t} />
                  <td className="px-2 py-2 text-right text-[11px]" style={{ color: 'var(--t3)' }}>—</td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td colSpan={17} className="py-12 text-center text-[12px]" style={{ color: 'var(--t3)' }}>
                    <RefreshCw size={16} className="animate-spin inline mr-2" />Cargando…
                  </td>
                </tr>
              )}

              {!loading && sorted.length === 0 && (
                <tr>
                  <td colSpan={17} className="py-12 text-center text-[12px]" style={{ color: 'var(--t3)' }}>
                    Sin datos — importa un CSV de Retail Link o carga inventario de Colombia
                  </td>
                </tr>
              )}

              {!loading && sorted.map((r, i) => (
                <tr key={`${r.pais}-${r.item_nbr}-${i}`}
                  className="transition-colors hover:bg-white/[0.03]"
                  style={{ borderBottom: '1px solid var(--border)' }}>
                  {/* Sticky cols */}
                  <td className="sticky left-0 px-3 py-1.5 text-[12px] whitespace-nowrap"
                    style={{ background: '#0d0d0b', color: 'var(--t2)' }}>
                    <span className="mr-1">{COUNTRY_FLAGS[r.pais] ?? ''}</span>{r.pais}
                  </td>
                  <td className="sticky left-[90px] px-2 py-1.5 text-[11px] font-mono whitespace-nowrap"
                    style={{ background: '#0d0d0b', color: 'var(--t3)' }}>
                    {r.item_nbr}
                  </td>
                  <td className="sticky left-[190px] px-2 py-1.5 text-[12px]"
                    style={{ background: '#0d0d0b', color: 'var(--t1)', maxWidth: 240 }}>
                    <span className="block truncate" title={r.item}>{r.item || '—'}</span>
                  </td>

                  <td className="px-2 py-1.5 text-[11px] whitespace-nowrap" style={{ color: 'var(--t3)' }}>
                    {r.item_type || '—'}
                  </td>
                  <td className="px-2 py-1.5 text-[11px] text-center">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                      style={{ background: r.item_status === 'A' ? '#10b98118' : '#ef444418',
                               color:      r.item_status === 'A' ? '#10b981'   : '#ef4444' }}>
                      {r.item_status || 'A'}
                    </span>
                  </td>

                  {/* Numéricos */}
                  {([r.inventario, r.ordenes, r.transito, r.wharehouse] as number[]).map((v, ci) => (
                    <td key={ci} className="px-2 py-1.5 text-right text-[12px] tabular-nums"
                      style={{ color: 'var(--t2)' }}>{v > 0 ? fmtN(v) : '—'}</td>
                  ))}

                  {/* DOH Tiendas */}
                  <DohCell v={r.doh_tiendas} />
                  <DohCell v={r.doh_tiendas_t} />

                  {/* VPD */}
                  <td className="px-2 py-1.5 text-right text-[12px] tabular-nums" style={{ color: 'var(--t3)' }}>
                    {r.prom_diario > 0 ? r.prom_diario.toFixed(1) : '—'}
                  </td>

                  {/* CEDI */}
                  {([r.inv_cedi_cajas, r.inv_cedi_unds] as number[]).map((v, ci) => (
                    <td key={ci} className="px-2 py-1.5 text-right text-[12px] tabular-nums"
                      style={{ color: 'var(--t2)' }}>{v > 0 ? fmtN(v) : '—'}</td>
                  ))}

                  {/* DOH CEDI */}
                  <DohCell v={r.doh_cedi} />
                  <DohCell v={r.doh_cedi_t} />

                  {/* DOH Total — pendiente */}
                  <td className="px-2 py-1.5 text-right text-[11px]" style={{ color: 'var(--t3)' }}
                    title="Dato proporcionado por el proveedor, pendiente de validar metodología.">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
