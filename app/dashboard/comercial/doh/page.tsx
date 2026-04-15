'use client'
import { useEffect, useState, useCallback, useRef, useMemo, Fragment } from 'react'
import {
  Package, Store, Globe2, Tag, RefreshCw, AlertTriangle,
  RotateCcw, X, ArrowUpDown, ArrowUp, ArrowDown,
  TrendingUp, TrendingDown, ChevronDown, ChevronRight,
} from 'lucide-react'
import MultiSelect from '@/components/dashboard/MultiSelect'
import BarChartPro from '@/components/dashboard/BarChartPro'
import DonutChartPro from '@/components/dashboard/DonutChartPro'

const COLORS = ['#c8873a','#2a7a58','#3a6fa8','#6b4fa8','#c0402f','#2a8a8a']

const CAT_COLOR: Record<string, string> = {
  Quesos:  '#c8873a',
  Leches:  '#3b82f6',
  Helados: '#a78bfa',
}

const COUNTRY_FLAGS: Record<string, string> = {
  CO: '🇨🇴', CR: '🇨🇷', GT: '🇬🇹', HN: '🇭🇳', NI: '🇳🇮', SV: '🇸🇻',
}

function fmtN(n: number) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return String(Math.round(n))
}

// ── DOH colores: amarillo=sobrestock, verde=saludable, rojo=riesgo ────────────
function dohColor(doh: number | null): string {
  if (doh === null) return 'var(--t3)'
  if (doh > 60)  return '#f59e0b'   // amarillo — Sobrestock
  if (doh >= 30) return '#10b981'   // verde    — Saludable
  return '#ef4444'                   // rojo     — Riesgo quiebre
}
function dohBg(doh: number | null): string {
  if (doh === null) return 'transparent'
  if (doh > 60)  return '#f59e0b18'
  if (doh >= 30) return '#10b98118'
  return '#ef444418'
}
function dohLabel(doh: number | null): string {
  if (doh === null) return 'Sin datos'
  if (doh > 60)  return 'Sobrestock'
  if (doh >= 30) return 'Saludable'
  return 'Riesgo quiebre'
}

// ── Tooltip DOH ────────────────────────────────────────────────────────────────
function DohTooltip({ doh, ventas90d, avgDaily, qty }: any) {
  return (
    <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none"
      style={{ minWidth: 200 }}>
      <div style={{
        background: 'var(--surface, rgba(15,15,18,0.97))',
        border: `1px solid ${dohColor(doh)}50`,
        borderRadius: 10, padding: '10px 14px',
        boxShadow: `0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px ${dohColor(doh)}20`,
        backdropFilter: 'blur(10px)',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', letterSpacing: '0.08em', marginBottom: 8 }}>
          DÍAS DE INVENTARIO
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: dohColor(doh), marginBottom: 4 }}>
          {doh !== null ? doh + ' días' : 'N/D'}
        </div>
        <div style={{ fontSize: 10, color: dohColor(doh), marginBottom: 10 }}>{dohLabel(doh)}</div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[
            ['Inventario actual', fmtN(qty) + ' uds'],
            ['Ventas 90 días',    ventas90d !== null ? fmtN(ventas90d) + ' uds' : '—'],
            ['Promedio / día',    avgDaily  !== null ? avgDaily.toFixed(1) + ' uds' : '—'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 10, color: 'var(--t3)' }}>{k}</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--t2)' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{
        position: 'absolute', bottom: -5, left: '50%',
        width: 10, height: 10, background: 'var(--surface, #0f0f12)',
        border: `1px solid ${dohColor(doh)}50`, borderTop: 'none', borderLeft: 'none',
        transform: 'translateX(-50%) rotate(45deg)',
      }} />
    </div>
  )
}

// ── Ventas Promedio Diario (Retail Link) ───────────────────────────────────────
interface RetailRow {
  id: number; semana: number; pais: string; item_nbr: string; item: string
  item_type: string; item_status: string
  inventario: number; ordenes: number; transito: number; wharehouse: number
  inv_cedi_cajas: number; inv_cedi_unds: number
  ventas_periodo: number; dias_periodo: number
}
interface RetailComputed extends RetailRow {
  prom_diario: number; doh_tiendas: number|null
  doh_tiendas_t: number|null; doh_cedi: number|null; doh_total: number|null
}
function computeRetail(r: RetailRow, dias: number): RetailComputed {
  const pd = dias > 0 && r.ventas_periodo > 0 ? r.ventas_periodo / dias : 0
  const doh = (n: number) => pd > 0 ? n / pd : null
  return { ...r, prom_diario: pd,
    doh_tiendas: doh(r.inventario), doh_tiendas_t: doh(r.inventario + r.transito),
    doh_cedi: doh(r.inv_cedi_unds),
    doh_total: doh(r.inventario + r.transito + r.wharehouse + r.inv_cedi_unds) }
}
function RDohCell({ v }: { v: number|null }) {
  const c = dohColor(v), bg = dohBg(v)
  return (
    <td className="px-2 py-1.5 text-right text-xs font-bold tabular-nums"
        style={{ color: c, background: bg }} title={dohLabel(v)}>
      {v === null || !isFinite(v) ? '—' : String(Math.round(v))}
    </td>
  )
}

function VentasPromedioDiario() {
  const [rows,    setRows]    = useState<RetailRow[]>([])
  const [semanas, setSemanas] = useState<number[]>([])
  const [paises,  setPaises]  = useState<string[]>([])
  const [fSem,    setFSem]    = useState('')
  const [fPais,   setFPais]   = useState('')
  const [slider,  setSlider]  = useState(91)
  const [maxDias, setMaxDias] = useState(91)
  const [semAct,  setSemAct]  = useState<number|null>(null)
  const [loading, setLoading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [upPais, setUpPais]   = useState('CR')
  const [upDias, setUpDias]   = useState('91')
  const [upSem,  setUpSem]    = useState('')
  const [upFile, setUpFile]   = useState<File|null>(null)
  const [upErr,  setUpErr]    = useState('')
  const [upBusy, setUpBusy]   = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      if (fSem)  p.set('semana', fSem)
      if (fPais) p.set('pais', fPais)
      const d = await fetch('/api/inventario/doh-retail?' + p).then(r => r.json())
      setRows(d.rows ?? []); setSemanas(d.semanas ?? []); setPaises(d.paises ?? [])
      setSemAct(d.semana_actual ?? null)
      const mx = Math.max(...(d.rows ?? []).map((r: RetailRow) => r.dias_periodo), 91)
      setMaxDias(mx); setSlider(mx)
    } finally { setLoading(false) }
  }, [fSem, fPais])

  useEffect(() => { load() }, [load])

  const computed = useMemo<RetailComputed[]>(() => rows.map(r => computeRetail(r, slider)), [rows, slider])

  const totals = useMemo(() => {
    if (!computed.length) return null
    const s = (f: keyof RetailRow) => computed.reduce((a, r) => a + (Number(r[f])||0), 0)
    const tv = s('ventas_periodo'), pd = slider > 0 && tv > 0 ? tv/slider : 0
    const doh = (n: number) => pd > 0 ? n/pd : null
    const inv = s('inventario'), tr = s('transito'), wh = s('wharehouse'), cu = s('inv_cedi_unds')
    return { inventario: inv, ordenes: s('ordenes'), transito: tr, wharehouse: wh,
      inv_cedi_cajas: s('inv_cedi_cajas'), inv_cedi_unds: cu, prom_diario: pd,
      doh_tiendas: doh(inv), doh_tiendas_t: doh(inv+tr),
      doh_cedi: doh(cu), doh_total: doh(inv+tr+wh+cu) }
  }, [computed, slider])

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
    } catch(e: any) { setUpErr(e.message) } finally { setUpBusy(false) }
  }

  const fmt0 = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 })
  const fmtD = (v: number|null) => v===null||!isFinite(v) ? '—' : String(Math.round(v))
  const semLabel = (s: number) => `${Math.floor(s/100)} S${String(s%100).padStart(2,'0')}`
  const numSem   = Math.round(maxDias/7)

  return (
    <div className="card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-semibold text-[13px]" style={{ color: 'var(--t1)' }}>
            Ventas Promedio Diario
          </h3>
          <p className="text-[11px]" style={{ color: 'var(--t3)' }}>
            {semAct ? `Semana ${semAct} · ${numSem} semanas · Retail Link` : 'Sin datos — importa un CSV'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] border transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--t3)', background: 'var(--bg)' }}>
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
          <button onClick={() => setShowUpload(v => !v)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
            style={{ background: 'var(--acc)', color: '#fff' }}>
            Importar CSV
          </button>
        </div>
      </div>

      {/* Upload inline */}
      {showUpload && (
        <div className="rounded-xl p-4 space-y-3 text-[12px]"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="font-semibold" style={{ color: 'var(--t2)' }}>Importar CSV Retail Link</p>
          <p className="text-[10px]" style={{ color: 'var(--t3)' }}>
            Cabecera: Item Nbr, Item, Item Type, Item Status, Inventario, Ordenes, Transito, Wharehouse, Inv CEDI Cajas, Inv CEDI Unds, Ventas
          </p>
          <div className="flex flex-wrap gap-2">
            <select value={upPais} onChange={e => setUpPais(e.target.value)}
              className="border rounded-lg px-2 py-1.5 text-[11px]"
              style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--t1)' }}>
              {['CR','GT','HN','SV','NI','EC','CO'].map(p => <option key={p} value={p}>{p}</option>)}
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
            <button onClick={doUpload} disabled={upBusy || !upFile}
              className="flex-1 rounded-lg py-1.5 text-[11px] font-medium disabled:opacity-50"
              style={{ background: 'var(--acc)', color: '#fff' }}>
              {upBusy ? 'Subiendo…' : 'Importar'}
            </button>
          </div>
        </div>
      )}

      {/* Filtros + slider */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--t3)' }}>Semana</span>
          <select value={fSem} onChange={e => setFSem(e.target.value)}
            className="border rounded-lg px-2.5 py-1.5 text-[11px] min-w-[120px]"
            style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--t1)' }}>
            <option value="">Más reciente</option>
            {semanas.map(s => <option key={s} value={s}>{semLabel(s)}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--t3)' }}>País</span>
          <select value={fPais} onChange={e => setFPais(e.target.value)}
            className="border rounded-lg px-2.5 py-1.5 text-[11px] min-w-[90px]"
            style={{ borderColor: 'var(--border)', background: 'var(--bg)', color: 'var(--t1)' }}>
            <option value="">Todos</option>
            {paises.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--t3)' }}>
              Días para Promedio Diario →
            </span>
            <span className="text-[13px] font-bold tabular-nums" style={{ color: 'var(--acc)' }}>{slider}d</span>
          </div>
          <input type="range" min={7} max={maxDias} step={7} value={slider}
            onChange={e => setSlider(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{ accentColor: 'var(--acc)' }} />
          <div className="flex justify-between text-[10px] mt-0.5" style={{ color: 'var(--t3)' }}>
            <span>7d</span><span>{maxDias}d ({numSem}sem)</span>
          </div>
        </div>
      </div>

      {/* Tabla */}
      {loading ? (
        <p className="text-[12px] text-center py-6" style={{ color: 'var(--t3)' }}>Cargando…</p>
      ) : computed.length === 0 ? (
        <p className="text-[12px] text-center py-6" style={{ color: 'var(--t3)' }}>
          Sin datos · usa "Importar CSV" para cargar un export de Retail Link
        </p>
      ) : (
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-[11px] whitespace-nowrap border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Item Nbr','Item','T','E','Inv.','Órd.','Trán.','Whouse',
                  'DOH Tiendas','DOH+Trán.','Prom/día','CEDI Caj.','CEDI Unds.','DOH CEDI','DOH Total'
                ].map((h,i) => (
                  <th key={h} className={`px-2 py-2 text-[10px] font-semibold ${
                    i >= 4 ? 'text-right' : 'text-left'} ${i === 4 ? 'border-l' : ''}`}
                    style={{ color: 'var(--t3)', borderColor: 'var(--border)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Totales */}
              {totals && (
                <tr className="font-bold" style={{ borderBottom: '2px solid var(--border)', background: 'var(--surface)' }}>
                  <td className="px-2 py-1.5 text-[11px]" style={{ color: 'var(--t2)' }}>Totales</td>
                  <td className="px-2 py-1.5 text-[11px]" style={{ color: 'var(--t3)' }}>{computed.length} SKUs</td>
                  <td /><td />
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: 'var(--t1)' }}>{fmt0(totals.inventario)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: 'var(--t2)' }}>{fmt0(totals.ordenes)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: 'var(--t2)' }}>{fmt0(totals.transito)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: 'var(--t2)' }}>{fmt0(totals.wharehouse)}</td>
                  <RDohCell v={totals.doh_tiendas} />
                  <RDohCell v={totals.doh_tiendas_t} />
                  <td className="px-2 py-1.5 text-right tabular-nums font-bold" style={{ color: 'var(--t1)' }}>{fmtD(totals.prom_diario)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: 'var(--t2)' }}>{fmt0(totals.inv_cedi_cajas)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: 'var(--t2)' }}>{fmt0(totals.inv_cedi_unds)}</td>
                  <RDohCell v={totals.doh_cedi} />
                  <RDohCell v={totals.doh_total} />
                </tr>
              )}
              {computed.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}
                  className="hover:bg-white/5 transition-colors">
                  <td className="px-2 py-1.5 font-mono" style={{ color: 'var(--t3)' }}>{r.item_nbr}</td>
                  <td className="px-2 py-1.5 max-w-[200px] truncate" style={{ color: 'var(--t1)' }} title={r.item}>{r.item}</td>
                  <td className="px-2 py-1.5 text-center" style={{ color: 'var(--t3)' }}>{r.item_type}</td>
                  <td className="px-2 py-1.5 text-center">
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                      background: r.item_status==='A' ? '#10b98120' : 'var(--surface)',
                      color: r.item_status==='A' ? '#10b981' : 'var(--t3)' }}>
                      {r.item_status}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: 'var(--t1)' }}>{fmt0(r.inventario)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: 'var(--t3)' }}>{fmt0(r.ordenes)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: 'var(--t3)' }}>{fmt0(r.transito)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: 'var(--t3)' }}>{fmt0(r.wharehouse)}</td>
                  <RDohCell v={r.doh_tiendas} />
                  <RDohCell v={r.doh_tiendas_t} />
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold" style={{ color: 'var(--t2)' }}>
                    {r.prom_diario > 0 ? fmtD(r.prom_diario) : <span style={{ color: 'var(--t3)' }}>—</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: 'var(--t3)' }}>{fmt0(r.inv_cedi_cajas)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: 'var(--t3)' }}>{fmt0(r.inv_cedi_unds)}</td>
                  <RDohCell v={r.doh_cedi} />
                  <RDohCell v={r.doh_total} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function DOHPage() {
  const [fPaises,    setFPaisesRaw]  = useState<string[]>([])
  const [fCats,      setFCatsRaw]    = useState<string[]>([])
  const [fSubcats,   setFSubcats]    = useState<string[]>([])
  const [fCadena,    setFCadena]     = useState('')
  const [skuSearch,  setSkuSearch]   = useState('')

  const [paisOpts,   setPaisOpts]   = useState<string[]>([])
  const [catOpts,    setCatOpts]    = useState<string[]>([])
  const [subcatOpts, setSubcatOpts] = useState<string[]>([])
  const [cadenaOpts, setCadenaOpts] = useState<string[]>([])

  const [kpi,      setKpi]      = useState<any>(null)
  const [skus,     setSkus]     = useState<any[]>([])
  const [byPais,   setByPais]   = useState<any[]>([])
  const [byCat,    setByCat]    = useState<any[]>([])
  const [byCadena, setByCadena] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [sortDoh,     setSortDoh]     = useState<'asc' | 'desc' | null>(null)
  const [hoveredRow,  setHoveredRow]  = useState<number | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [kpiModal, setKpiModal] = useState<{ title: string; color: string; items: any[] } | null>(null)

  // Filtros desde charts (client-side)
  const [chartPais, setChartPais] = useState<string | null>(null)
  const [chartCat,  setChartCat]  = useState<string | null>(null)

  const debounceT = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cargar = useCallback((paises: string[], cats: string[], sku: string) => {
    setLoading(true); setError('')
    const p = new URLSearchParams()
    if (paises.length) p.set('paises', paises.join(','))
    if (cats.length)   p.set('categorias', cats.join(','))
    if (sku.trim())    p.set('sku', sku.trim())
    fetch('/api/inventario/doh?' + p.toString())
      .then(r => r.json())
      .then(j => {
        if (j.error) { setError(j.error); return }
        setKpi(j.kpi)
        setSkus(j.skus || [])
        setByPais(j.byPais || [])
        setByCat(j.byCat || [])
        setByCadena(j.byCadena || [])
        if (j.paisOpts?.length)   setPaisOpts(j.paisOpts)
        if (j.catOpts?.length)    setCatOpts(j.catOpts)
        if (j.subcatOpts?.length) setSubcatOpts(j.subcatOpts)
        if (j.cadenaOpts?.length) setCadenaOpts(j.cadenaOpts)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (debounceT.current) clearTimeout(debounceT.current)
    debounceT.current = setTimeout(() => cargar(fPaises, fCats, skuSearch), 300)
  }, [fPaises, fCats, skuSearch, cargar])

  // ── Filtros jerárquicos: opciones derivadas del data cargado ─────────────
  const availableCatOpts = useMemo(() => {
    if (fPaises.length === 0) return catOpts
    const cats = new Set(
      skus.filter(s => s.pais && fPaises.includes(s.pais)).map(s => s.cat).filter(Boolean)
    )
    return catOpts.filter(c => cats.has(c))
  }, [skus, fPaises, catOpts])

  const availableSubcatOpts = useMemo(() => {
    let filtered = skus
    if (fPaises.length > 0) filtered = filtered.filter(s => s.pais && fPaises.includes(s.pais))
    if (fCats.length > 0)   filtered = filtered.filter(s => fCats.includes(s.cat))
    const subcats = new Set(filtered.map(s => s.subcat).filter(Boolean))
    return subcatOpts.filter(sc => subcats.has(sc))
  }, [skus, fPaises, fCats, subcatOpts])

  // Auto-limpiar filtros hijo cuando cambia el padre
  const setFPaises = (vals: string[]) => {
    setFPaisesRaw(vals)
    // Limpiar cats no disponibles en los nuevos países
    if (vals.length > 0) {
      const avail = new Set(skus.filter(s => vals.includes(s.pais)).map(s => s.cat))
      const newCats = fCats.filter(c => avail.has(c))
      if (newCats.length !== fCats.length) {
        setFCatsRaw(newCats)
        setFSubcats([])
      }
    }
  }
  const setFCats = (vals: string[]) => {
    setFCatsRaw(vals)
    // Limpiar subcats no disponibles en las nuevas cats
    if (vals.length > 0) {
      const avail = new Set(skus.filter(s => vals.includes(s.cat)).map(s => s.subcat))
      const newSubs = fSubcats.filter(sc => avail.has(sc))
      if (newSubs.length !== fSubcats.length) setFSubcats(newSubs)
    }
  }

  const limpiar = () => {
    setFPaisesRaw([]); setFCatsRaw([]); setFSubcats([]); setFCadena(''); setSkuSearch('')
    setChartPais(null); setChartCat(null)
  }
  const hayFiltros = fPaises.length > 0 || fCats.length > 0 || fSubcats.length > 0 ||
    skuSearch.trim().length > 0 || fCadena !== ''

  const totalCat = byCat.reduce((s, c) => s + c.qty, 0)

  // ── DOH stats ──────────────────────────────────────────────────────────────
  const dohStats = useMemo(() => {
    const withDoh = skus.filter(s => s.doh !== null)
    return {
      sobrestock: withDoh.filter(s => s.doh > 60).length,
      saludable:  withDoh.filter(s => s.doh >= 30 && s.doh <= 60).length,
      riesgo:     withDoh.filter(s => s.doh < 30).length,
      sinDatos:   skus.filter(s => s.doh === null).length,
      avgDoh:     withDoh.length > 0
        ? Math.round(withDoh.reduce((a, s) => a + s.doh, 0) / withDoh.length * 10) / 10
        : null,
    }
  }, [skus])

  // ── Filtered + sorted SKU list ─────────────────────────────────────────────
  const displaySkus = useMemo(() => {
    let list = skus
    if (fCadena)          list = list.filter(s => s.cadenas_list?.includes(fCadena))
    if (chartPais)        list = list.filter(s => s.pais === chartPais)
    if (chartCat)         list = list.filter(s => s.cat  === chartCat)
    if (fSubcats.length > 0) list = list.filter(s => fSubcats.includes(s.subcat))
    if (sortDoh === 'asc')
      list = [...list].sort((a, b) => (a.doh ?? Infinity) - (b.doh ?? Infinity))
    else if (sortDoh === 'desc')
      list = [...list].sort((a, b) => (b.doh ?? -Infinity) - (a.doh ?? -Infinity))
    return list
  }, [skus, fCadena, chartPais, chartCat, fSubcats, sortDoh])

  const toggleSort = () => {
    setSortDoh(prev => prev === null ? 'desc' : prev === 'desc' ? 'asc' : null)
  }

  const toggleExpand = (key: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] tracking-[2px] uppercase font-medium mb-1" style={{ color: 'var(--t3)' }}>
            Ventas · Operaciones
          </p>
          <h1 className="text-xl font-bold" style={{ color: 'var(--t1)' }}>DOH — Days on Hand</h1>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--t3)' }}>
            Días de inventario disponible · Fórmula: Stock ÷ Promedio ventas diarias (90 días)
          </p>
        </div>
        <button
          onClick={() => cargar(fPaises, fCats, skuSearch)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] border transition-all hover:opacity-80"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--t3)' }}
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-[13px] rounded-lg px-4 py-3 border"
          style={{ background: '#ef444415', borderColor: '#ef444440', color: '#f87171' }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* Filtros jerárquicos */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[9px] tracking-[2px] uppercase font-semibold" style={{ color: 'var(--t3)' }}>
            Filtros
            <span className="ml-2 normal-case font-normal" style={{ color: 'var(--t3)', opacity: 0.6 }}>
              jerárquicos: País → Categoría → Subcategoría
            </span>
          </p>
          {hayFiltros && (
            <button onClick={limpiar}
              className="flex items-center gap-1.5 text-[10px] hover:opacity-70 transition-opacity"
              style={{ color: 'var(--t3)' }}>
              <RotateCcw size={10} /> Limpiar todo
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {/* 1. País */}
          <MultiSelect
            label="País"
            options={paisOpts.map(p => ({ value: p, label: `${COUNTRY_FLAGS[p] || ''} ${p}` }))}
            value={fPaises} onChange={setFPaises}
            placeholder="Todos los países" selectAllLabel="Todos los países"
          />
          {/* 2. Categoría — filtrada por países seleccionados */}
          <MultiSelect
            label={fPaises.length > 0 ? `Categoría (${availableCatOpts.length})` : 'Categoría'}
            options={availableCatOpts.map(c => ({ value: c, label: c }))}
            value={fCats} onChange={setFCats}
            placeholder="Todas las categorías" selectAllLabel="Todas las categorías"
          />
          {/* 3. Subcategoría — filtrada por categorías seleccionadas */}
          <MultiSelect
            label={fCats.length > 0 ? `Subcategoría (${availableSubcatOpts.length})` : 'Subcategoría'}
            options={availableSubcatOpts.map(sc => ({ value: sc, label: sc }))}
            value={fSubcats} onChange={setFSubcats}
            placeholder="Todas las subcategorías" selectAllLabel="Todas"
          />
          {/* 4. Retailer / Cadena */}
          <div>
            <div className="text-[10px] uppercase tracking-widest font-medium mb-1.5" style={{ color: 'var(--t3)' }}>
              Retailer / Cadena
            </div>
            <select
              value={fCadena}
              onChange={e => setFCadena(e.target.value)}
              className="w-full text-[12px] px-3 py-2 rounded-lg border outline-none transition-all"
              style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--t1)' }}
              onFocus={e => (e.target.style.borderColor = 'var(--acc)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            >
              <option value="">Todos los retailers</option>
              {cadenaOpts.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {/* 5. SKU / Descripción */}
          <div>
            <div className="text-[10px] uppercase tracking-widest font-medium mb-1.5" style={{ color: 'var(--t3)' }}>
              SKU / Descripción
            </div>
            <input
              value={skuSearch}
              onChange={e => setSkuSearch(e.target.value)}
              placeholder="Buscar producto..."
              className="w-full text-[12px] px-3 py-2 rounded-lg border outline-none transition-all"
              style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--t1)' }}
              onFocus={e => (e.target.style.borderColor = 'var(--acc)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>
        </div>
        {hayFiltros && (
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
            {fPaises.map(p => (
              <Chip key={p} label={`${COUNTRY_FLAGS[p] || ''} ${p}`} onRemove={() => setFPaises(fPaises.filter(x => x !== p))} />
            ))}
            {fCats.map(c => (
              <Chip key={c} label={c} onRemove={() => setFCats(fCats.filter(x => x !== c))} />
            ))}
            {fSubcats.map(sc => (
              <Chip key={sc} label={sc} onRemove={() => setFSubcats(fSubcats.filter(x => x !== sc))} />
            ))}
            {fCadena && <Chip label={fCadena} onRemove={() => setFCadena('')} />}
            {skuSearch.trim() && <Chip label={`"${skuSearch}"`} onRemove={() => setSkuSearch('')} />}
          </div>
        )}
      </div>

      {/* KPIs inventario */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Unidades en Stock',  value: loading ? '...' : fmtN(kpi?.totalQty   || 0), sub: 'total inventario',   icon: <Package size={14} />, color: '#c8873a' },
          { label: 'Puntos de Venta',    value: loading ? '...' : fmtN(kpi?.totalPdvs  || 0), sub: 'tiendas con stock',  icon: <Store size={14} />,   color: '#34d399' },
          { label: 'SKUs activos',       value: loading ? '...' : fmtN(kpi?.totalSkus  || 0), sub: 'referencias únicas', icon: <Tag size={14} />,     color: '#93c5fd' },
          { label: 'Países',             value: loading ? '...' : fmtN(kpi?.totalPaises|| 0), sub: 'con inventario',     icon: <Globe2 size={14} />,  color: '#a78bfa' },
        ].map((k, i) => (
          <div key={i} className="card p-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 bottom-0 w-0.5" style={{ background: k.color }} />
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] tracking-[2px] uppercase font-semibold" style={{ color: 'var(--t3)' }}>{k.label}</p>
              <span style={{ color: k.color }}>{k.icon}</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: 'var(--t1)' }}>{k.value}</p>
            <p className="text-[10px] mt-1" style={{ color: 'var(--t3)' }}>{k.sub}</p>
          </div>
        ))}
      </div>

      {/* DOH KPIs — colores corregidos */}
      {!loading && skus.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* DOH Promedio */}
          <div className="card p-4 relative overflow-hidden">
            <div className="absolute top-0 left-0 bottom-0 w-0.5" style={{ background: '#c8873a' }} />
            <p className="text-[9px] tracking-[2px] uppercase font-semibold mb-2" style={{ color: 'var(--t3)' }}>DOH Promedio</p>
            <p className="text-2xl font-bold" style={{ color: dohStats.avgDoh !== null ? dohColor(dohStats.avgDoh) : 'var(--t3)' }}>
              {dohStats.avgDoh !== null ? dohStats.avgDoh + 'd' : '—'}
            </p>
            <p className="text-[10px] mt-1" style={{ color: 'var(--t3)' }}>
              {dohStats.avgDoh !== null ? dohLabel(dohStats.avgDoh) : 'sin datos de venta'}
            </p>
          </div>
          {/* Sobrestock — amarillo */}
          <div className="card p-4 relative overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => setKpiModal({
              title: 'Sobrestock — DOH > 60 días',
              color: '#f59e0b',
              items: skus.filter(s => s.doh !== null && s.doh > 60).sort((a,b) => b.doh - a.doh),
            })}>
            <div className="absolute top-0 left-0 bottom-0 w-0.5" style={{ background: '#f59e0b' }} />
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] tracking-[2px] uppercase font-semibold" style={{ color: 'var(--t3)' }}>Sobrestock</p>
              <TrendingUp size={14} style={{ color: '#f59e0b' }} />
            </div>
            <p className="text-2xl font-bold" style={{ color: '#f59e0b' }}>{dohStats.sobrestock}</p>
            <p className="text-[10px] mt-1" style={{ color: 'var(--t3)' }}>SKUs con DOH &gt; 60 días · ver detalle →</p>
          </div>
          {/* Saludable — verde */}
          <div className="card p-4 relative overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => setKpiModal({
              title: 'Saludable — DOH 30–60 días',
              color: '#10b981',
              items: skus.filter(s => s.doh !== null && s.doh >= 30 && s.doh <= 60).sort((a,b) => a.doh - b.doh),
            })}>
            <div className="absolute top-0 left-0 bottom-0 w-0.5" style={{ background: '#10b981' }} />
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] tracking-[2px] uppercase font-semibold" style={{ color: 'var(--t3)' }}>Saludable</p>
              <span style={{ color: '#10b981', fontSize: 14 }}>●</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: '#10b981' }}>{dohStats.saludable}</p>
            <p className="text-[10px] mt-1" style={{ color: 'var(--t3)' }}>SKUs con DOH 30–60 días · ver detalle →</p>
          </div>
          {/* Riesgo — rojo */}
          <div className="card p-4 relative overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => setKpiModal({
              title: 'Riesgo Quiebre — DOH < 30 días',
              color: '#ef4444',
              items: skus.filter(s => s.doh !== null && s.doh < 30).sort((a,b) => a.doh - b.doh),
            })}>
            <div className="absolute top-0 left-0 bottom-0 w-0.5" style={{ background: '#ef4444' }} />
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] tracking-[2px] uppercase font-semibold" style={{ color: 'var(--t3)' }}>Riesgo Quiebre</p>
              <TrendingDown size={14} style={{ color: '#ef4444' }} />
            </div>
            <p className="text-2xl font-bold" style={{ color: '#ef4444' }}>{dohStats.riesgo}</p>
            <p className="text-[10px] mt-1" style={{ color: 'var(--t3)' }}>SKUs con DOH &lt; 30 días · ver detalle →</p>
          </div>
        </div>
      )}

      {/* Modal KPI detalle */}
      {kpiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setKpiModal(null)}>
          <div className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl overflow-hidden"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}>
            {/* Header modal */}
            <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
              style={{ borderColor: 'var(--border)' }}>
              <div>
                <div className="w-2 h-2 rounded-full inline-block mr-2" style={{ background: kpiModal.color }} />
                <span className="font-semibold text-[13px]" style={{ color: 'var(--t1)' }}>{kpiModal.title}</span>
              </div>
              <button onClick={() => setKpiModal(null)} style={{ color: 'var(--t3)' }}>
                <X size={16} />
              </button>
            </div>
            {/* Lista */}
            <div className="overflow-y-auto flex-1">
              {kpiModal.items.length === 0 ? (
                <p className="text-center py-10 text-[12px]" style={{ color: 'var(--t3)' }}>Sin SKUs en esta categoría</p>
              ) : (
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
                      <th className="px-4 py-2 text-left text-[10px] uppercase tracking-wide font-semibold" style={{ color: 'var(--t3)' }}>SKU / Descripción</th>
                      <th className="px-4 py-2 text-right text-[10px] uppercase tracking-wide font-semibold" style={{ color: 'var(--t3)' }}>País</th>
                      <th className="px-4 py-2 text-right text-[10px] uppercase tracking-wide font-semibold" style={{ color: 'var(--t3)' }}>Stock</th>
                      <th className="px-4 py-2 text-right text-[10px] uppercase tracking-wide font-semibold" style={{ color: 'var(--t3)' }}>DOH</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpiModal.items.map((s, i) => (
                      <tr key={i} className="border-b transition-colors hover:bg-white/[0.03]"
                        style={{ borderColor: 'var(--border)' }}>
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-[12px]" style={{ color: 'var(--t1)' }}>{s.desc}</div>
                          <div className="text-[10px]" style={{ color: 'var(--t3)' }}>{s.sku}</div>
                        </td>
                        <td className="px-4 py-2.5 text-right text-[11px]" style={{ color: 'var(--t3)' }}>
                          {COUNTRY_FLAGS[s.pais] ?? ''} {s.pais}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--t2)' }}>
                          {fmtN(s.qty)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold tabular-nums"
                          style={{ color: kpiModal.color }}>
                          {s.doh}d
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {/* Footer */}
            <div className="px-5 py-3 border-t text-[11px] flex-shrink-0"
              style={{ borderColor: 'var(--border)', color: 'var(--t3)' }}>
              {kpiModal.items.length} SKU{kpiModal.items.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-0.5">
            <h3 className="font-semibold text-[13px]" style={{ color: 'var(--t1)' }}>Inventario por País</h3>
            {chartPais && (
              <button onClick={() => setChartPais(null)}
                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full transition-opacity hover:opacity-70"
                style={{ background: '#c8873a20', color: '#c8873a', border: '1px solid #c8873a40' }}>
                {chartPais} <X size={8} />
              </button>
            )}
          </div>
          <p className="text-[11px] mb-4" style={{ color: 'var(--t3)' }}>
            Unidades en stock · <span style={{ color: 'var(--acc)' }}>click para filtrar tabla</span>
          </p>
          {loading
            ? <div className="h-[220px] animate-pulse rounded-lg" style={{ background: 'var(--border)' }} />
            : byPais.length === 0 ? <EmptyChart />
            : <BarChartPro data={byPais} dataKey="qty" nameKey="pais" layout="vertical"
                height={220} formatter={fmtN} tooltipUnit="uds" showLabels yWidth={32}
                onSelect={setChartPais} />
          }
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-0.5">
            <h3 className="font-semibold text-[13px]" style={{ color: 'var(--t1)' }}>Mix por Categoría</h3>
            {chartCat && (
              <button onClick={() => setChartCat(null)}
                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full transition-opacity hover:opacity-70"
                style={{ background: '#c8873a20', color: '#c8873a', border: '1px solid #c8873a40' }}>
                {chartCat} <X size={8} />
              </button>
            )}
          </div>
          <p className="text-[11px] mb-4" style={{ color: 'var(--t3)' }}>
            % unidades · <span style={{ color: 'var(--acc)' }}>click para filtrar tabla</span>
          </p>
          {loading
            ? <div className="h-[240px] animate-pulse rounded-lg" style={{ background: 'var(--border)' }} />
            : byCat.length === 0 ? <EmptyChart />
            : <DonutChartPro data={byCat} total={totalCat} colorMap={CAT_COLOR} fallbackColors={COLORS} height={240}
                onSelect={setChartCat} />
          }
        </div>
      </div>

      {!loading && byCadena.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-[13px] mb-0.5" style={{ color: 'var(--t1)' }}>Top 10 Retailers</h3>
          <p className="text-[11px] mb-4" style={{ color: 'var(--t3)' }}>Unidades en inventario por cadena</p>
          <BarChartPro data={byCadena} dataKey="qty" nameKey="cadena" colors="#c8873a"
            height={200} formatter={fmtN} tooltipUnit="uds" xAngle={-30} yWidth={50} />
        </div>
      )}

      {/* ── Ventas Promedio Diario (Retail Link) ───────────────────────────────── */}
      <VentasPromedioDiario />

      {/* ── DOH Table ──────────────────────────────────────────────────────────── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h3 className="font-semibold text-[13px]" style={{ color: 'var(--t1)' }}>
              DOH por SKU
            </h3>
            <p className="text-[11px]" style={{ color: 'var(--t3)' }}>
              {loading ? '...' : `${displaySkus.filter(s => !s.noStock).length} con stock`}
              {!loading && displaySkus.some(s => s.noStock) && (
                <span style={{ color: 'var(--t3)', opacity: 0.6 }}>
                  {' + '}{displaySkus.filter(s => s.noStock).length} sin stock (catálogo)
                </span>
              )}
              {chartPais && <span style={{ color: 'var(--acc)' }}> · País: {chartPais}</span>}
              {chartCat  && <span style={{ color: 'var(--acc)' }}> · Cat: {chartCat}</span>}
              {' · '}Stock ÷ Prom ventas diarias 90d
            </p>
          </div>
          {/* Leyenda — colores corregidos */}
          <div className="flex items-center gap-3 flex-wrap">
            {[
              { color: '#f59e0b', label: 'Sobrestock >60d' },
              { color: '#10b981', label: 'Saludable 30-60d' },
              { color: '#ef4444', label: 'Riesgo <30d' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                <span className="text-[10px]" style={{ color: 'var(--t3)' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {loading
          ? <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-8 rounded animate-pulse" style={{ background: 'var(--border)' }} />
            ))}</div>
          : displaySkus.length === 0
            ? <p className="text-[12px] text-center py-8" style={{ color: 'var(--t3)' }}>
                Sin datos para los filtros seleccionados
              </p>
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]" style={{ minWidth: 720 }}>
                  <thead>
                    <tr className="border-b text-[9px] uppercase tracking-widest"
                      style={{ borderColor: 'var(--border)', color: 'var(--t3)' }}>
                      <th className="text-left pb-2 pr-2 w-6"></th>
                      <th className="text-left pb-2 pr-3 w-7">#</th>
                      <th className="text-left pb-2 pr-3">País</th>
                      <th className="text-left pb-2 pr-3">Cód. Barras</th>
                      <th className="text-left pb-2 pr-3">Producto</th>
                      <th className="text-left pb-2 pr-3">Subcategoría</th>
                      <th className="text-left pb-2 pr-3">Retailer</th>
                      <th className="text-right pb-2 pr-3">Inventario</th>
                      <th className="text-right pb-2 pr-3">Ventas 90d</th>
                      <th className="text-right pb-2 pr-3">Prom / día</th>
                      {/* Sortable DOH column */}
                      <th className="text-right pb-2 cursor-pointer select-none" onClick={toggleSort}>
                        <div className="flex items-center justify-end gap-1 hover:opacity-70 transition-opacity">
                          DOH
                          {sortDoh === null   && <ArrowUpDown size={9} />}
                          {sortDoh === 'desc' && <ArrowDown   size={9} />}
                          {sortDoh === 'asc'  && <ArrowUp     size={9} />}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {displaySkus.map((s: any, i: number) => {
                      const rowKey = `${s.sku}|${s.pais}`
                      const isExpanded = expandedRows.has(rowKey)
                      const hasCadenas = s.cadenas_detail && s.cadenas_detail.length > 1
                      const isNoStock  = s.noStock === true

                      return (
                        <Fragment key={rowKey}>
                          <tr
                            onMouseEnter={() => setHoveredRow(i)}
                            onMouseLeave={() => setHoveredRow(null)}
                            className="border-b transition-colors"
                            style={{
                              borderColor: 'var(--border)',
                              background: hoveredRow === i ? 'var(--surface)' : 'transparent',
                              opacity: isNoStock ? 0.5 : 1,
                            }}>
                            {/* Expand toggle */}
                            <td className="py-2 pr-2">
                              {hasCadenas && (
                                <button
                                  onClick={() => toggleExpand(rowKey)}
                                  className="flex items-center justify-center w-4 h-4 rounded transition-opacity hover:opacity-70"
                                  style={{ color: 'var(--t3)' }}>
                                  {isExpanded
                                    ? <ChevronDown size={10} />
                                    : <ChevronRight size={10} />
                                  }
                                </button>
                              )}
                            </td>
                            <td className="py-2 pr-3" style={{ color: 'var(--t3)' }}>{i + 1}</td>
                            <td className="py-2 pr-3" style={{ color: 'var(--t2)' }}>
                              {s.pais
                                ? <span className="whitespace-nowrap">{COUNTRY_FLAGS[s.pais] || ''} {s.pais}</span>
                                : <span style={{ color: 'var(--t3)', fontStyle: 'italic' }}>—</span>
                              }
                            </td>
                            {/* Código de barras — click drill-down */}
                            <td className="py-2 pr-3">
                              <button
                                onClick={() => setSkuSearch(s.barcode || s.sku)}
                                className="font-mono text-[10px] hover:underline transition-colors"
                                style={{ color: 'var(--acc)' }}
                                title="Click para filtrar por este producto">
                                {s.barcode || s.sku || '—'}
                              </button>
                            </td>
                            <td className="py-2 pr-3 max-w-[180px] truncate font-medium"
                              style={{ color: isNoStock ? 'var(--t3)' : 'var(--t1)' }} title={s.desc}>
                              {s.desc}
                            </td>
                            <td className="py-2 pr-3">
                              <span className="text-[9px]" style={{ color: 'var(--t3)' }}>{s.subcat || '—'}</span>
                            </td>
                            <td className="py-2 pr-3">
                              {s.cadena_principal
                                ? <span className="text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap"
                                    style={{ background: 'var(--border)', color: 'var(--t2)' }}>
                                    {s.cadena_principal}
                                    {hasCadenas && (
                                      <span style={{ color: 'var(--t3)', marginLeft: 4 }}>+{s.cadenas_detail.length - 1}</span>
                                    )}
                                  </span>
                                : <span style={{ color: 'var(--t3)' }}>—</span>
                              }
                            </td>
                            <td className="py-2 pr-3 text-right font-bold" style={{ color: isNoStock ? 'var(--t3)' : 'var(--t1)' }}>
                              {isNoStock ? <span style={{ color: 'var(--t3)', fontStyle: 'italic' }}>sin stock</span> : fmtN(s.qty)}
                            </td>
                            <td className="py-2 pr-3 text-right" style={{ color: 'var(--t2)' }}>
                              {s.ventas90d !== null ? fmtN(s.ventas90d) : <span style={{ color: 'var(--t3)' }}>—</span>}
                            </td>
                            <td className="py-2 pr-3 text-right" style={{ color: 'var(--t2)' }}>
                              {s.avg_daily !== null ? s.avg_daily.toFixed(1) : <span style={{ color: 'var(--t3)' }}>—</span>}
                            </td>
                            {/* DOH badge */}
                            <td className="py-2 text-right">
                              <span
                                className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold"
                                style={{
                                  background: dohBg(s.doh),
                                  color: dohColor(s.doh),
                                  border: `1px solid ${dohColor(s.doh)}30`,
                                  minWidth: 52,
                                  textAlign: 'center',
                                }}
                                title={dohLabel(s.doh)}>
                                {s.doh !== null ? s.doh + 'd' : '—'}
                              </span>
                            </td>
                          </tr>

                          {/* Expanded: desglose por cadena */}
                          {isExpanded && hasCadenas && s.cadenas_detail.map((cd: any, ci: number) => (
                            <tr key={`${rowKey}-cadena-${ci}`}
                              className="border-b"
                              style={{
                                borderColor: 'var(--border)',
                                background: `${dohBg(s.doh)}`,
                              }}>
                              <td colSpan={2} />
                              <td className="py-1.5 pr-3">
                                <span style={{ color: 'var(--t3)', fontSize: 9 }}>└</span>
                              </td>
                              <td colSpan={3} className="py-1.5 pr-3">
                                <span className="text-[10px] px-2 py-0.5 rounded-full"
                                  style={{ background: 'var(--border)', color: 'var(--t2)' }}>
                                  {cd.cadena}
                                </span>
                              </td>
                              <td />
                              <td className="py-1.5 pr-3 text-right text-[10px]" style={{ color: 'var(--t2)' }}>
                                {fmtN(cd.qty)}
                                <span className="ml-1" style={{ color: 'var(--t3)', fontSize: 9 }}>
                                  ({s.qty > 0 ? Math.round(cd.qty / s.qty * 100) : 0}%)
                                </span>
                              </td>
                              <td colSpan={3} />
                            </tr>
                          ))}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
        }
      </div>

    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────
function EmptyChart() {
  return (
    <div className="h-[220px] flex items-center justify-center text-[12px]" style={{ color: 'var(--t3)' }}>
      Sin datos para los filtros seleccionados
    </div>
  )
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full"
      style={{ background: '#c8873a20', color: '#c8873a', border: '1px solid #c8873a35' }}>
      {label}
      <button onClick={onRemove} className="hover:opacity-70 ml-0.5 flex-shrink-0">
        <X size={9} />
      </button>
    </span>
  )
}
