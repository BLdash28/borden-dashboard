'use client'
import { useEffect, useState, useMemo } from 'react'
import { TrendingUp, TrendingDown, Minus, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────

const MESES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const fmtN = (v: unknown) => {
  const n = Number(v)
  return isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'
}

const PAISES = ['CR','GT','HN','NI','SV']
const PAIS_LABEL: Record<string, string> = { CR:'🇨🇷 Costa Rica', GT:'🇬🇹 Guatemala', HN:'🇭🇳 Honduras', NI:'🇳🇮 Nicaragua', SV:'🇸🇻 El Salvador' }

const SALUD_META: Record<string, { bg: string; tc: string; badge: string }> = {
  'CRÍTICO':       { bg:'bg-red-50',     tc:'text-red-700',     badge:'bg-red-100 text-red-700' },
  'ATENCIÓN':      { bg:'bg-orange-50',  tc:'text-orange-700',  badge:'bg-orange-100 text-orange-700' },
  'SALUDABLE':     { bg:'bg-emerald-50', tc:'text-emerald-700', badge:'bg-emerald-100 text-emerald-700' },
  'COBERTURA ALTA':{ bg:'bg-blue-50',    tc:'text-blue-700',    badge:'bg-blue-100 text-blue-700' },
  'SOBRESTOCK':    { bg:'bg-purple-50',  tc:'text-purple-700',  badge:'bg-purple-100 text-purple-700' },
  'SIN VPD':       { bg:'bg-gray-50',    tc:'text-gray-500',    badge:'bg-gray-100 text-gray-500' },
}

function SaludBadge({ salud }: { salud: string }) {
  const m = SALUD_META[salud] ?? SALUD_META['SIN VPD']
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${m.badge}`}>{salud}</span>
}

function DohChip({ d }: { d: number | null }) {
  if (d === null || d === undefined) return <span className="text-xs text-gray-300">—</span>
  const n = Number(d)
  const [bg, tc] =
    n < 7   ? ['bg-red-100',    'text-red-700']    :
    n < 14  ? ['bg-orange-100', 'text-orange-700'] :
    n < 60  ? ['bg-emerald-100','text-emerald-700']:
    n < 120 ? ['bg-blue-100',   'text-blue-600']   :
              ['bg-purple-100', 'text-purple-700']
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${bg} ${tc}`}>{n.toFixed(0)}d</span>
}

// ── KPI Card ──────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, leftColor }: { label: string; value: string; sub: string; leftColor: string }) {
  return (
    <div className="bg-white rounded-xl border border-l-4 border-gray-100 shadow-sm p-4" style={{ borderLeftColor: leftColor }}>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest leading-tight mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-800">{value}</p>
      <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {Array(5).fill(0).map((_,i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 h-20">
            <div className="h-2.5 bg-gray-100 rounded w-2/3 mb-3" />
            <div className="h-6 bg-gray-100 rounded w-1/2" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm h-64" />
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────

export default function InventarioPDVPage() {
  const [pais,       setPais]       = useState('CR')
  const [categoria,  setCategoria]  = useState('')
  const [cadena,     setCadena]     = useState('')
  const [salud,      setSalud]      = useState('')
  const [prod,       setProd]       = useState('')
  const [sortCol,    setSortCol]    = useState<'doh'|'inv_mano'|'descripcion'|'punto_venta'>('doh')
  const [sortAsc,    setSortAsc]    = useState(true)
  const [expandSku,  setExpandSku]  = useState<string | null>(null)
  const [view,       setView]       = useState<'sku'|'tienda'>('sku')

  const [loading,    setLoading]    = useState(false)
  const [data,       setData]       = useState<any>(null)
  const [rows,       setRows]       = useState<any[]>([])
  const [cats,       setCats]       = useState<string[]>([])
  const [cadenas,    setCadenas]    = useState<string[]>([])
  const [fechaSnap,  setFechaSnap]  = useState<string | null>(null)

  // Fetch SKU-level inventario summary (kpis + pdv + cedi)
  useEffect(() => {
    setLoading(true)
    const q = new URLSearchParams({ pais })
    if (categoria) q.set('categoria', categoria)
    fetch(`/api/comercial/ejecucion/walmart/inventario?${q}`)
      .then(r => r.json())
      .then(d => {
        setData(d)
        const allCats = [...new Set((d.pdv ?? []).map((r: any) => r.categoria).filter(Boolean))].sort() as string[]
        setCats(allCats)
        const allCadenas = [...new Set((d.por_cadena_pdv ?? []).map((r: any) => r.cadena).filter(Boolean))].sort() as string[]
        setCadenas(allCadenas)
        if (d.kpis?.fecha_tiendas) setFechaSnap(d.kpis.fecha_tiendas)
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [pais, categoria]) // eslint-disable-line

  // Fetch tienda×sku rows
  useEffect(() => {
    const q = new URLSearchParams({ pais })
    if (categoria) q.set('categoria', categoria)
    if (cadena)    q.set('cadena',    cadena)
    if (salud)     q.set('salud',     salud)
    if (prod)      q.set('prod',      prod)
    fetch(`/api/comercial/ejecucion/walmart/inventario/sku-tienda?${q}`)
      .then(r => r.json())
      .then(d => setRows(d.rows ?? []))
      .catch(() => setRows([]))
  }, [pais, categoria, cadena, salud, prod]) // eslint-disable-line

  // ── Grouped view by SKU ────────────────────────────────────────────────
  const skuGroups = useMemo(() => {
    const map = new Map<string, { sku: string; descripcion: string; categoria: string; tiendas: any[] }>()
    for (const r of rows) {
      const key = r.sku ?? r.codigo_barras ?? r.descripcion
      if (!map.has(key)) map.set(key, { sku: r.sku, descripcion: r.descripcion, categoria: r.categoria, tiendas: [] })
      map.get(key)!.tiendas.push(r)
    }
    return Array.from(map.values()).map(g => {
      const dohVals = g.tiendas.map(t => t.doh).filter(d => d !== null).map(Number)
      const invTotal = g.tiendas.reduce((s, t) => s + Number(t.inv_mano || 0), 0)
      const minDoh = dohVals.length > 0 ? Math.min(...dohVals) : null
      const sinStock = g.tiendas.filter(t => Number(t.inv_mano || 0) === 0).length
      return { ...g, inv_total: invTotal, doh_min: minDoh, sin_stock: sinStock, n_tiendas: g.tiendas.length }
    }).sort((a, b) => {
      if (sortCol === 'doh')        return sortAsc ? (a.doh_min ?? 999) - (b.doh_min ?? 999) : (b.doh_min ?? 999) - (a.doh_min ?? 999)
      if (sortCol === 'inv_mano')   return sortAsc ? a.inv_total - b.inv_total : b.inv_total - a.inv_total
      if (sortCol === 'descripcion') return sortAsc ? a.descripcion.localeCompare(b.descripcion) : b.descripcion.localeCompare(a.descripcion)
      return 0
    })
  }, [rows, sortCol, sortAsc])

  // ── Sort for tienda view ───────────────────────────────────────────────
  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (sortCol === 'doh')         return sortAsc ? (Number(a.doh ?? 999)) - (Number(b.doh ?? 999)) : (Number(b.doh ?? 999)) - (Number(a.doh ?? 999))
      if (sortCol === 'inv_mano')    return sortAsc ? Number(a.inv_mano) - Number(b.inv_mano) : Number(b.inv_mano) - Number(a.inv_mano)
      if (sortCol === 'descripcion') return sortAsc ? String(a.descripcion).localeCompare(String(b.descripcion)) : String(b.descripcion).localeCompare(String(a.descripcion))
      if (sortCol === 'punto_venta') return sortAsc ? String(a.punto_venta).localeCompare(String(b.punto_venta)) : String(b.punto_venta).localeCompare(String(a.punto_venta))
      return 0
    })
  }, [rows, sortCol, sortAsc])

  const kpis = data?.kpis ?? null

  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortAsc(p => !p)
    else { setSortCol(col); setSortAsc(true) }
  }
  const SortIcon = ({ col }: { col: typeof sortCol }) =>
    sortCol === col ? (sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <span className="w-3" />

  // ── Cobertura por cadena (from rows) ──────────────────────────────────
  const coberturaByCadena = useMemo(() => {
    const cadenaData: Record<string, { traited: number; conStock: number; sinStock: number; tiendas: Set<string> }> = {}
    for (const r of rows) {
      const c = r.cadena || 'N/D'
      if (!cadenaData[c]) cadenaData[c] = { traited: 0, conStock: 0, sinStock: 0, tiendas: new Set() }
      cadenaData[c].tiendas.add(r.punto_venta)
      if (r.traited) cadenaData[c].traited++
      if (Number(r.inv_mano || 0) > 0) cadenaData[c].conStock++
      else cadenaData[c].sinStock++
    }
    return Object.entries(cadenaData).map(([c, d]) => ({
      cadena: c,
      n_tiendas: d.tiendas.size,
      traited: d.traited,
      con_stock: d.conStock,
      sin_stock: d.sinStock,
      pct_stock: d.conStock + d.sinStock > 0 ? Math.round(d.conStock / (d.conStock + d.sinStock) * 100) : 0,
    })).sort((a, b) => b.n_tiendas - a.n_tiendas)
  }, [rows])

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">📦 Inventario PDV · Walmart</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {fechaSnap ? `Snapshot ${fechaSnap}` : 'Cargando...'} · Surtido-Inv RetailLink
          </p>
        </div>
        <button onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50">
          <RefreshCw size={13} /> Actualizar
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {PAISES.map(p => (
          <button key={p} onClick={() => { setPais(p); setCadena(''); setCategoria('') }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              pais === p ? 'bg-[#1b3b5f] text-white border-[#1b3b5f]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}>
            {PAIS_LABEL[p]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {/* Categoría */}
        <select value={categoria} onChange={e => setCategoria(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
          <option value="">Todas las categorías</option>
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {/* Cadena */}
        <select value={cadena} onChange={e => setCadena(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
          <option value="">Todas las cadenas</option>
          {cadenas.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {/* Salud */}
        <select value={salud} onChange={e => setSalud(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
          <option value="">Todos los estados</option>
          {Object.keys(SALUD_META).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {/* Producto */}
        <input value={prod} onChange={e => setProd(e.target.value)} placeholder="Buscar producto..."
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 w-48" />
        {/* Vista */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden ml-auto">
          {(['sku','tienda'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 text-xs font-semibold transition-all ${
                view === v ? 'bg-[#1b3b5f] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}>
              {v === 'sku' ? 'Por SKU' : 'Por Tienda'}
            </button>
          ))}
        </div>
      </div>

      {loading ? <Skeleton /> : !data?.disponible ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
          <p className="text-4xl mb-3">📭</p>
          <p className="text-base font-semibold text-gray-700">Sin datos de inventario PDV para {pais}</p>
          <p className="text-sm text-gray-400 mt-1">Importa el archivo Surtido-Inv de RetailLink.</p>
          <code className="block mt-3 text-xs bg-gray-50 border rounded px-4 py-2 text-gray-600">
            node scripts/import-surtido-inv.mjs &lt;archivo.xls&gt;
          </code>
        </div>
      ) : (
        <div className="space-y-5">

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <KpiCard label="SKUs PDV" value={kpis?.pdv_skus?.toLocaleString() ?? '—'} sub={`${kpis?.pdv_tiendas_dist ?? '—'} tiendas · ${fechaSnap ?? '—'}`} leftColor="#3b82f6" />
            <KpiCard label="Unidades en Tienda" value={fmtN(kpis?.pdv_inv)} sub="Inventario mano PDV" leftColor="#c8873a" />
            <KpiCard label="Críticos (DOH ≤ 7d)" value={kpis?.pdv_criticos_stores?.toLocaleString() ?? '—'} sub="Combos SKU × Tienda" leftColor={kpis?.pdv_criticos_stores > 0 ? '#ef4444' : '#e5e7eb'} />
            <KpiCard label="SKUs CEDI" value={kpis?.cedi_skus?.toLocaleString() ?? '—'} sub={`${fmtN(kpis?.cedi_cajas)} cajas · ${kpis?.fecha_cedi ?? '—'}`} leftColor="#16a34a" />
            <KpiCard label="Sin Stock CEDI" value={kpis?.cedi_sin_stock?.toLocaleString() ?? '—'} sub="SKUs CEDI con inv = 0" leftColor={kpis?.cedi_sin_stock > 0 ? '#ef4444' : '#e5e7eb'} />
          </div>

          {/* Cobertura por cadena */}
          {coberturaByCadena.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">📍 Cobertura por Cadena</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 pr-4 font-semibold text-gray-500">Cadena</th>
                      <th className="text-right py-2 px-3 font-semibold text-gray-500">Tiendas</th>
                      <th className="text-right py-2 px-3 font-semibold text-gray-500">Con Stock</th>
                      <th className="text-right py-2 px-3 font-semibold text-gray-500">Sin Stock</th>
                      <th className="text-right py-2 px-3 font-semibold text-gray-500">% Con Stock</th>
                      <th className="py-2 px-3 font-semibold text-gray-500">Barra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coberturaByCadena.map(c => (
                      <tr key={c.cadena} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 pr-4 font-semibold text-gray-700">{c.cadena}</td>
                        <td className="text-right px-3 text-gray-600">{c.n_tiendas}</td>
                        <td className="text-right px-3 text-emerald-700 font-semibold">{c.con_stock}</td>
                        <td className="text-right px-3 text-red-600 font-semibold">{c.sin_stock}</td>
                        <td className="text-right px-3 font-bold" style={{ color: c.pct_stock >= 80 ? '#16a34a' : c.pct_stock >= 50 ? '#d97706' : '#ef4444' }}>
                          {c.pct_stock}%
                        </td>
                        <td className="px-3 py-2">
                          <div className="bg-gray-100 rounded-full h-2 w-32">
                            <div className="h-2 rounded-full transition-all"
                              style={{ width: `${c.pct_stock}%`, background: c.pct_stock >= 80 ? '#16a34a' : c.pct_stock >= 50 ? '#d97706' : '#ef4444' }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">
                {view === 'sku' ? `${skuGroups.length} SKUs` : `${sortedRows.length} combinaciones SKU × Tienda`}
              </h3>
              <p className="text-xs text-gray-400">{rows.length} registros totales</p>
            </div>
            <div className="overflow-x-auto">
              {view === 'sku' ? (

                // ── Vista por SKU ──────────────────────────────────────────────
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left py-3 px-4 font-semibold text-gray-500">
                        <button onClick={() => toggleSort('descripcion')} className="flex items-center gap-1 hover:text-gray-800">
                          Producto <SortIcon col="descripcion" />
                        </button>
                      </th>
                      <th className="text-right py-3 px-3 font-semibold text-gray-500">Tiendas</th>
                      <th className="text-right py-3 px-3 font-semibold text-gray-500">Sin Stock</th>
                      <th className="text-right py-3 px-3 font-semibold text-gray-500">
                        <button onClick={() => toggleSort('inv_mano')} className="flex items-center gap-1 hover:text-gray-800 ml-auto">
                          Inv. Total <SortIcon col="inv_mano" />
                        </button>
                      </th>
                      <th className="text-right py-3 px-3 font-semibold text-gray-500">
                        <button onClick={() => toggleSort('doh')} className="flex items-center gap-1 hover:text-gray-800 ml-auto">
                          DOH mín <SortIcon col="doh" />
                        </button>
                      </th>
                      <th className="py-3 px-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {skuGroups.map(g => (
                      <>
                        <tr key={g.sku} onClick={() => setExpandSku(p => p === g.sku ? null : g.sku)}
                          className="border-b border-gray-50 hover:bg-amber-50 cursor-pointer transition-colors">
                          <td className="py-3 px-4">
                            <p className="font-semibold text-gray-800 truncate max-w-[280px]">{g.descripcion}</p>
                            <p className="text-gray-400 mt-0.5">{g.categoria} · SKU {g.sku}</p>
                          </td>
                          <td className="text-right px-3 text-gray-700 font-semibold">{g.n_tiendas}</td>
                          <td className="text-right px-3">
                            {g.sin_stock > 0
                              ? <span className="font-bold text-red-600">{g.sin_stock}</span>
                              : <span className="text-emerald-600">—</span>}
                          </td>
                          <td className="text-right px-3 font-bold text-gray-800">{fmtN(g.inv_total)}</td>
                          <td className="text-right px-3"><DohChip d={g.doh_min} /></td>
                          <td className="px-4 text-gray-400">
                            {expandSku === g.sku ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </td>
                        </tr>
                        {expandSku === g.sku && g.tiendas.map((t, ti) => (
                          <tr key={ti} className="bg-gray-50 border-b border-gray-100">
                            <td className="py-2 pl-8 pr-4">
                              <p className="text-gray-700 font-medium">{t.punto_venta}</p>
                              <p className="text-gray-400">{t.cadena}</p>
                            </td>
                            <td colSpan={2} className="px-3 text-right text-gray-500">{t.punto_venta}</td>
                            <td className="text-right px-3 font-semibold text-gray-700">{fmtN(t.inv_mano)}</td>
                            <td className="text-right px-3"><DohChip d={t.doh} /></td>
                            <td className="px-4"><SaludBadge salud={t.salud} /></td>
                          </tr>
                        ))}
                      </>
                    ))}
                  </tbody>
                </table>

              ) : (

                // ── Vista por Tienda×SKU ──────────────────────────────────────
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left py-3 px-4 font-semibold text-gray-500">
                        <button onClick={() => toggleSort('punto_venta')} className="flex items-center gap-1 hover:text-gray-800">
                          Tienda <SortIcon col="punto_venta" />
                        </button>
                      </th>
                      <th className="text-left py-3 px-3 font-semibold text-gray-500">
                        <button onClick={() => toggleSort('descripcion')} className="flex items-center gap-1 hover:text-gray-800">
                          Producto <SortIcon col="descripcion" />
                        </button>
                      </th>
                      <th className="text-right py-3 px-3 font-semibold text-gray-500">
                        <button onClick={() => toggleSort('inv_mano')} className="flex items-center gap-1 hover:text-gray-800 ml-auto">
                          Inv Mano <SortIcon col="inv_mano" />
                        </button>
                      </th>
                      <th className="text-right py-3 px-3 font-semibold text-gray-500">
                        <button onClick={() => toggleSort('doh')} className="flex items-center gap-1 hover:text-gray-800 ml-auto">
                          DOH <SortIcon col="doh" />
                        </button>
                      </th>
                      <th className="py-3 px-4 font-semibold text-gray-500">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((r, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 px-4">
                          <p className="font-semibold text-gray-700 truncate max-w-[180px]">{r.punto_venta}</p>
                          <p className="text-gray-400">{r.cadena}</p>
                        </td>
                        <td className="py-2 px-3">
                          <p className="text-gray-700 truncate max-w-[200px]">{r.descripcion}</p>
                          <p className="text-gray-400">{r.categoria}</p>
                        </td>
                        <td className="text-right px-3 font-bold text-gray-800">{fmtN(r.inv_mano)}</td>
                        <td className="text-right px-3"><DohChip d={r.doh} /></td>
                        <td className="px-4"><SaludBadge salud={r.salud} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>

              )}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
