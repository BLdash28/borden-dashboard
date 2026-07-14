'use client'
import { showError } from '@/lib/toast'
import { useEffect, useState, useCallback, useRef } from 'react'
import { RefreshCw, Download, ChevronDown, ChevronRight } from 'lucide-react'
import MultiSelect from '@/components/dashboard/MultiSelect'
import { KpiCard } from '@/components/ejecucion/shared'

const STORAGE_KEY = 'bl_sellin_v1'
function readStorage() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as {
      fAnos?: string[]; fMeses?: string[]; fPaises?: string[]; fCats?: string[]
      fClientes?: string[]; fSkus?: string[]; fProveedor?: string[]
    }
  } catch { return null }
}

const MESES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const toNum = (v: unknown): number => {
  const n = parseFloat(String(v))
  return isNaN(n) ? 0 : n
}

const OPT2: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 }
const fmtN = (v: unknown): string => {
  const n = toNum(v)
  return isFinite(n) ? n.toLocaleString('en-US', OPT2) : '0.00'
}
const fmt = (v: unknown): string => '$' + fmtN(v)

interface SellInRow {
  pais:            string
  cliente:         string
  canal:           string
  proveedor:       string
  orden_compra:    string
  ano:             number | null
  mes:             number | null
  sku:             string
  descripcion:     string
  categoria:       string
  subcategoria:    string
  fecha_min:       string | null
  fecha_max:       string | null
  dias_venta:      number
  cajas:           number
  ingresos:        number
  precio_promedio: number
}

const MES_LBL = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const partesFecha = (v: string | null | undefined) => {
  if (!v) return { ano: '—', mes: '—', dia: '—' }
  const parts = String(v).slice(0, 10).split('-')
  if (parts.length !== 3) return { ano: '—', mes: '—', dia: '—' }
  return { ano: parts[0], mes: MES_LBL[parseInt(parts[1])] || parts[1], dia: parts[2] }
}

type SortKey = 'ingresos' | 'cajas' | 'pct'
interface SortState { key: SortKey; dir: 'asc' | 'desc' }

export default function SellInPage() {
  // Period
  const [mesMap, setMesMap] = useState<Record<number, number[]>>({})
  const [anos,   setAnos]   = useState<number[]>([])
  // Inicializamos vacíos para que server y client rendericen igual;
  // localStorage se hidrata en useEffect abajo (evita hydration mismatch).
  const [fAnos,  setFAnos]  = useState<string[]>([])
  const [fMeses, setFMeses] = useState<string[]>([])

  // Filters
  const [fPaises,    setFPaises]    = useState<string[]>([])
  const [fCats,      setFCats]      = useState<string[]>([])
  const [fClientes,  setFClientes]  = useState<string[]>([])
  const [fSkus,      setFSkus]      = useState<string[]>([])
  const [fProveedor, setFProveedor] = useState<string[]>([])

  // Options
  const [paisOpts,      setPaisOpts]      = useState<string[]>([])
  const [catOpts,       setCatOpts]       = useState<string[]>([])
  const [clienteOpts,   setClienteOpts]   = useState<string[]>([])
  const [skuOpts,       setSkuOpts]       = useState<string[]>([])
  const [proveedorOpts, setProveedorOpts] = useState<string[]>([])

  // Data
  const [rows,    setRows]    = useState<SellInRow[]>([])
  const [total,   setTotal]   = useState(0)
  const [kpi,     setKpi]     = useState<{ total_ingresos: number; total_unidades: number; total_clientes: number } | null>(null)
  const [page,    setPage]    = useState(1)
  const [loading,         setLoading]         = useState(true)
  const [sort,            setSort]            = useState<SortState>({ key: 'ingresos', dir: 'desc' })
  const [detalleExpanded, setDetalleExpanded] = useState(true)
  const [filtrosOpen,     setFiltrosOpen]     = useState(false)

  const PAGE_SIZE = 500
  const initDone  = useRef(false)

  // ── Cargar períodos disponibles + estado inicial ────────────────────────────
  useEffect(() => {
    if (initDone.current) return
    initDone.current = true

    // Hidratar filtros desde localStorage al montar (evita hydration mismatch
    // porque no leemos localStorage en el initializer de useState).
    const saved = readStorage()
    const sAnos    = saved?.fAnos      ?? []
    const sMeses   = saved?.fMeses     ?? []
    const sPaises  = saved?.fPaises    ?? []
    const sCats    = saved?.fCats      ?? []
    const sClient  = saved?.fClientes  ?? []
    const sSkus    = saved?.fSkus      ?? []
    const sProv    = saved?.fProveedor ?? []
    if (sAnos.length)   setFAnos(sAnos)
    if (sMeses.length)  setFMeses(sMeses)
    if (sPaises.length) setFPaises(sPaises)
    if (sCats.length)   setFCats(sCats)
    if (sClient.length) setFClientes(sClient)
    if (sSkus.length)   setFSkus(sSkus)
    if (sProv.length)   setFProveedor(sProv)

    cargar(sAnos, sMeses, sPaises, sCats, sClient, sSkus, sProv, 1)
    fetch('/api/ventas/resumen?tipo=periodos')
      .then(r => r.json())
      .then(j => {
        const mm: Record<number, number[]> = {}
        ;(j.periodos || []).forEach((p: { ano: unknown; mes: unknown }) => {
          const a = Number(p.ano)
          if (!mm[a]) mm[a] = []
          mm[a].push(Number(p.mes))
        })
        Object.keys(mm).forEach(a => mm[Number(a)].sort((x, y) => x - y))
        setMesMap(mm)
        setAnos(Object.keys(mm).map(Number).sort((a, b) => b - a))
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── helpers para fetch de opciones ─────────────────────────────────────────
  const buildPeriodParams = useCallback((p = new URLSearchParams()) => {
    if (fAnos.length)  p.set('anos',  fAnos.join(','))
    if (fMeses.length) p.set('meses', fMeses.join(','))
    return p
  }, [fAnos, fMeses])

  // ── NIVEL 1 — País: siempre disponible ─────────────────────────────────────
  useEffect(() => {
    const p = buildPeriodParams(new URLSearchParams({ dim: 'pais' }))
    fetch('/api/ventas/sell-in/opts?' + p).then(r => r.json()).then(j => setPaisOpts(j.opts ?? []))
  }, [buildPeriodParams])

  // ── NIVEL 2 — Cliente: requiere País ─────────────────────────────────────────
  useEffect(() => {
    if (!fPaises.length) { setClienteOpts([]); setFClientes([]); return }
    const p = buildPeriodParams(new URLSearchParams({ dim: 'cliente' }))
    p.set('paises', fPaises.join(','))
    fetch('/api/ventas/sell-in/opts?' + p).then(r => r.json()).then(j => {
      const opts = j.opts ?? []
      setClienteOpts(opts)
      setFClientes(prev => prev.filter(v => opts.includes(v)))
    })
  }, [buildPeriodParams, fPaises])

  // ── NIVEL 1 producto — Categoría: siempre disponible ───────────────────────
  useEffect(() => {
    const p = buildPeriodParams(new URLSearchParams({ dim: 'categoria' }))
    if (fPaises.length) p.set('paises', fPaises.join(','))
    fetch('/api/ventas/sell-in/opts?' + p).then(r => r.json()).then(j => setCatOpts(j.opts ?? []))
  }, [buildPeriodParams, fPaises])

  // ── Proveedor: siempre disponible (respeta período + país) ─────────────────
  useEffect(() => {
    const p = buildPeriodParams(new URLSearchParams({ dim: 'proveedor' }))
    if (fPaises.length) p.set('paises', fPaises.join(','))
    fetch('/api/ventas/sell-in/opts?' + p).then(r => r.json()).then(j => setProveedorOpts(j.opts ?? []))
  }, [buildPeriodParams, fPaises])

  // ── NIVEL 2 producto — SKU: requiere Categoría ──────────────────────────────
  useEffect(() => {
    if (!fCats.length) { setSkuOpts([]); setFSkus([]); return }
    const p = buildPeriodParams(new URLSearchParams({ dim: 'sku' }))
    p.set('categorias', fCats.join(','))
    if (fPaises.length)   p.set('paises',   fPaises.join(','))
    if (fClientes.length) p.set('clientes', fClientes.join(','))
    fetch('/api/ventas/sell-in/opts?' + p).then(r => r.json()).then(j => {
      const opts = j.opts ?? []
      setSkuOpts(opts)
      setFSkus(prev => prev.filter(v => opts.includes(v)))
    })
  }, [buildPeriodParams, fPaises, fClientes, fCats])

  // ── Fetch datos ─────────────────────────────────────────────────────────────
  const cargar = useCallback((
    anos: string[], meses: string[],
    paises: string[], cats: string[], clientes: string[], skus: string[],
    proveedores: string[], pg: number
  ) => {
    setLoading(true)
    const p = new URLSearchParams()
    if (anos.length)        p.set('anos',        anos.join(','))
    if (meses.length)       p.set('meses',       meses.join(','))
    if (paises.length)      p.set('paises',      paises.join(','))
    if (cats.length)        p.set('categorias',  cats.join(','))
    if (clientes.length)    p.set('clientes',    clientes.join(','))
    if (skus.length)        p.set('skus',        skus.join(','))
    if (proveedores.length) p.set('proveedores', proveedores.join(','))
    p.set('page',         String(pg))
    p.set('pageSize',     String(PAGE_SIZE))
    p.set('granularidad', 'mes')   // fila por (SKU × cliente × mes × OC)

    fetch('/api/ventas/sell-in?' + p)
      .then(r => r.json())
      .then(j => {
        if (j.error) { showError(j.error || 'Error al cargar datos'); return }
        setRows((j.rows ?? []).map((r: Record<string, unknown>) => ({
          pais:            String(r.pais         ?? ''),
          cliente:         String(r.cliente      ?? ''),
          canal:           String(r.canal        ?? ''),
          proveedor:       String(r.proveedor    ?? ''),
          orden_compra:    String(r.orden_compra ?? ''),
          ano:             r.ano != null ? Number(r.ano) : null,
          mes:             r.mes != null ? Number(r.mes) : null,
          sku:             String(r.sku          ?? ''),
          descripcion:     String(r.descripcion  ?? ''),
          categoria:       String(r.categoria    ?? ''),
          subcategoria:    String(r.subcategoria ?? ''),
          fecha_min:       r.fecha_min ? String(r.fecha_min).slice(0, 10) : null,
          fecha_max:       r.fecha_max ? String(r.fecha_max).slice(0, 10) : null,
          dias_venta:      toNum(r.dias_venta),
          cajas:           toNum(r.cajas),
          ingresos:        toNum(r.ingresos),
          precio_promedio: toNum(r.precio_promedio),
        })))
        setTotal(toNum(j.total))
        if (j.kpi) setKpi({
          total_ingresos: toNum(j.kpi.total_ingresos),
          total_unidades: toNum(j.kpi.total_unidades),
          total_clientes: toNum(j.kpi.total_clientes),
        })
      })
      .finally(() => setLoading(false))
  }, [])

  const saveStorage = (
    anos = fAnos, meses = fMeses, paises = fPaises, cats = fCats,
    clientes = fClientes, skus = fSkus, proveedores = fProveedor
  ) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        fAnos: anos, fMeses: meses, fPaises: paises, fCats: cats,
        fClientes: clientes, fSkus: skus, fProveedor: proveedores,
      }))
    } catch {}
  }

  const triggerCargar = (
    anos     = fAnos,    meses    = fMeses,
    paises   = fPaises,  cats     = fCats,
    clientes = fClientes,
    skus     = fSkus,    proveedores = fProveedor,
    pg       = 1
  ) => {
    setPage(pg)
    saveStorage(anos, meses, paises, cats, clientes, skus, proveedores)
    cargar(anos, meses, paises, cats, clientes, skus, proveedores, pg)
  }

  const limpiar = () => {
    setFAnos([]); setFMeses([])
    setFPaises([]); setFCats([]); setFClientes([]); setFSkus([]); setFProveedor([])
    setPage(1)
    localStorage.removeItem(STORAGE_KEY)
    cargar([], [], [], [], [], [], [], 1)
  }

  // ── Sort ────────────────────────────────────────────────────────────────────
  const grandTotal = kpi?.total_ingresos ?? rows.reduce((s, r) => s + r.ingresos, 0)

  const rowsWithPct = rows.map(r => ({
    ...r,
    pct: grandTotal > 0 ? (r.ingresos / grandTotal) * 100 : 0,
  }))

  const sorted = [...rowsWithPct].sort((a, b) => {
    const diff =
      sort.key === 'ingresos' ? a.ingresos - b.ingresos :
      sort.key === 'cajas'    ? a.cajas    - b.cajas    :
                                a.pct      - b.pct
    return sort.dir === 'asc' ? diff : -diff
  })

  const toggleSort = (key: SortKey) =>
    setSort(prev => prev.key === key
      ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
      : { key, dir: 'desc' })

  const arrow = (key: SortKey) => sort.key === key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ' ↕'

  // ── CSV (descarga TODAS las filas del filtro, no solo la página visible) ──
  const [downloading, setDownloading] = useState(false)
  const descargarCSV = async () => {
    if (downloading) return
    setDownloading(true)
    try {
      const p = new URLSearchParams()
      if (fAnos.length)     p.set('anos',       fAnos.join(','))
      if (fMeses.length)    p.set('meses',      fMeses.join(','))
      if (fPaises.length)   p.set('paises',     fPaises.join(','))
      if (fCats.length)     p.set('categorias', fCats.join(','))
      if (fClientes.length) p.set('clientes',   fClientes.join(','))
      if (fSkus.length)      p.set('skus',        fSkus.join(','))
      if (fProveedor.length) p.set('proveedores', fProveedor.join(','))
      p.set('all', 'true')
      p.set('granularidad', 'mes')   // fila por (SKU × cliente × mes × OC)

      const r = await fetch('/api/ventas/sell-in?' + p)
      const j = await r.json()
      if (j.error) { showError(j.error || 'Error al descargar'); return }

      const allRows = (j.rows || []).map((x: Record<string, unknown>) => ({
        pais:            String(x.pais         ?? ''),
        cliente:         String(x.cliente      ?? ''),
        canal:           String(x.canal        ?? ''),
        proveedor:       String(x.proveedor    ?? ''),
        orden_compra:    String(x.orden_compra ?? ''),
        sku:             String(x.sku          ?? ''),
        descripcion:     String(x.descripcion  ?? ''),
        categoria:       String(x.categoria    ?? ''),
        subcategoria:    String(x.subcategoria ?? ''),
        ano:             x.ano != null ? Number(x.ano) : null,
        mes:             x.mes != null ? Number(x.mes) : null,
        fecha_max:       x.fecha_max ? String(x.fecha_max).slice(0, 10) : null,
        cajas:           toNum(x.cajas),
        ingresos:        toNum(x.ingresos),
        precio_promedio: toNum(x.precio_promedio),
      }))
      const gTotal = toNum(j.kpi?.total_ingresos) || allRows.reduce((s: number, x: { ingresos: number }) => s + x.ingresos, 0)

      const headers = ['País','Cliente','Proveedor','Orden de Compra','SKU','Producto','Categoría','Subcategoría','Año','Mes','Cajas','Valor','Precio Caja','% Total']
      const esc = (v: string | number) => {
        const s = String(v)
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"` : s
      }
      const csvRows = [
        headers.join(','),
        ...allRows.map((x: {
          pais: string; cliente: string; canal: string; proveedor: string; orden_compra: string;
          sku: string; descripcion: string; categoria: string; subcategoria: string;
          ano: number | null; mes: number | null; fecha_max: string | null;
          cajas: number; ingresos: number; precio_promedio: number;
        }) => {
          const p2 = partesFecha(x.fecha_max)
          const anoOut = x.ano ?? p2.ano
          const mesOut = x.mes != null ? MESES[x.mes] ?? String(x.mes) : p2.mes
          const pct = gTotal > 0 ? (x.ingresos / gTotal) * 100 : 0
          return [
            x.pais, x.cliente, x.proveedor, x.orden_compra, x.sku, x.descripcion, x.categoria, x.subcategoria,
            anoOut, mesOut,
            x.cajas.toFixed(0), x.ingresos.toFixed(2), x.precio_promedio.toFixed(4), pct.toFixed(2) + '%',
          ].map(esc).join(',')
        }),
      ]
      const blob = new Blob(['﻿' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `sell_in_${fAnos.length ? fAnos.join('-') : 'todos'}_${fMeses.length ? fMeses.map(m => MESES[parseInt(m)]).join('-') : 'todos'}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Error al descargar CSV')
    } finally {
      setDownloading(false)
    }
  }

  // Meses disponibles = unión de meses para los años seleccionados (o todos si ninguno)
  const mesesDisp = fAnos.length
    ? [...new Set(fAnos.flatMap(a => mesMap[Number(a)] ?? []))].sort((a, b) => a - b)
    : [...new Set(Object.values(mesMap).flat())].sort((a, b) => a - b)
  const totalPages = Math.ceil(total / PAGE_SIZE)

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Ventas</p>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800">Ventas Sell In</h1>
        </div>
        <button
          onClick={() => triggerCargar()}
          className="flex items-center gap-2 px-3 md:px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <button
            className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-widest md:cursor-default"
            onClick={() => setFiltrosOpen(v => !v)}
          >
            <ChevronDown size={13} className={`md:hidden transition-transform ${filtrosOpen ? 'rotate-180' : ''}`} />
            Filtros
          </button>
          <button onClick={limpiar} className="text-xs text-gray-400 hover:text-gray-600 underline">Limpiar todo</button>
        </div>
        <div className={`md:block ${filtrosOpen ? 'block' : 'hidden'}`}>

        {/* Período */}
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-2">Período</p>
          <div className="flex items-start gap-1.5 flex-wrap">
            <div className="flex-1 min-w-[160px]">
              <MultiSelect
                label={`Año${anos.length === 0 ? ' ●' : ''}`}
                options={anos.map(a => ({ value: String(a), label: String(a) }))}
                value={fAnos}
                onChange={v => {
                  setFAnos(v)
                  // Si se deseleccionan todos los años, limpiar meses que ya no apliquen
                  if (!v.length) setFMeses([])
                  triggerCargar(v, fMeses)
                }}
                placeholder="Todos los años"
              />
            </div>
            <div className="flex items-center self-end pb-2 text-gray-300 text-sm select-none">›</div>
            <div className="flex-1 min-w-[160px]">
              <MultiSelect
                label="Mes"
                options={mesesDisp.map(m => ({ value: String(m), label: MESES[m] }))}
                value={fMeses}
                onChange={v => { setFMeses(v); triggerCargar(fAnos, v) }}
                placeholder="Todos los meses"
              />
            </div>
          </div>
        </div>

        {/* Jerarquía geográfica: País → Cliente */}
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-2">Geografía / Ventas</p>
          <div className="flex items-start gap-1.5 flex-wrap">
            <div className="flex-1 min-w-[160px]">
              <MultiSelect
                label="País"
                options={paisOpts.map(p => ({ value: p, label: p }))}
                value={fPaises}
                onChange={v => {
                  setFPaises(v)
                  if (!v.length) setFClientes([])
                  triggerCargar(fAnos, fMeses, v, fCats, [], fSkus)
                }}
                placeholder="Todos los países"
              />
            </div>
            <div className="flex items-center self-end pb-2 text-gray-300 text-sm select-none">›</div>
            <div className={`flex-1 min-w-[160px] transition-opacity ${!fPaises.length ? 'opacity-40 pointer-events-none' : ''}`}>
              <MultiSelect
                label={`Cliente${!fPaises.length ? ' — selecciona País' : ''}`}
                options={clienteOpts.map(c => ({ value: c, label: c }))}
                value={fClientes}
                onChange={v => {
                  setFClientes(v)
                  triggerCargar(fAnos, fMeses, fPaises, fCats, v, fSkus)
                }}
                placeholder={fPaises.length ? 'Todos los clientes' : '—'}
              />
            </div>
          </div>
        </div>

        {/* Jerarquía producto: Categoría → SKU */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-2">Producto</p>
          <div className="flex items-start gap-1.5 flex-wrap">
            <div className="flex-1 min-w-[160px]">
              <MultiSelect
                label="Categoría"
                options={catOpts.map(c => ({ value: c, label: c }))}
                value={fCats}
                onChange={v => {
                  setFCats(v)
                  if (!v.length) setFSkus([])
                  triggerCargar(fAnos, fMeses, fPaises, v, fClientes, [])
                }}
                placeholder="Todas las categorías"
              />
            </div>
            <div className="flex items-center self-end pb-2 text-gray-300 text-sm select-none">›</div>
            <div className={`flex-1 min-w-[160px] transition-opacity ${!fCats.length ? 'opacity-40 pointer-events-none' : ''}`}>
              <MultiSelect
                label={`SKU${!fCats.length ? ' — selecciona Categoría' : ''}`}
                options={skuOpts.map(s => ({ value: s, label: s }))}
                value={fSkus}
                onChange={v => {
                  setFSkus(v)
                  triggerCargar(fAnos, fMeses, fPaises, fCats, fClientes, v, fProveedor)
                }}
                placeholder={fCats.length ? 'Todos los SKUs' : '—'}
              />
            </div>
            {/* spacer para alinear con la fila de arriba */}
            <div className="flex items-center self-end pb-2 text-transparent text-sm select-none">›</div>
            <div className="flex-1 min-w-[160px]" />
          </div>
        </div>

        {/* Proveedor */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-2">Proveedor</p>
          <div className="flex items-start gap-1.5 flex-wrap">
            <div className="flex-1 min-w-[160px] max-w-sm">
              <MultiSelect
                label="Proveedor"
                options={proveedorOpts.map(p => ({ value: p, label: p }))}
                value={fProveedor}
                onChange={v => {
                  setFProveedor(v)
                  triggerCargar(fAnos, fMeses, fPaises, fCats, fClientes, fSkus, v)
                }}
                placeholder="Todos los proveedores"
              />
            </div>
          </div>
        </div>
        </div>{/* end collapsible filtros */}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <KpiCard label="Ingresos Totales" borderLeftColor="#f59e0b"
          value={loading ? '...' : fmt(kpi?.total_ingresos ?? 0)} />
        <KpiCard label="Cajas Totales" borderLeftColor="#3b82f6"
          value={loading ? '...' : fmtN(kpi?.total_unidades ?? 0)} />
        <KpiCard label="Clientes Activos" borderLeftColor="#10b981"
          value={loading ? '...' : (kpi?.total_clientes ?? 0).toLocaleString()} />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 md:p-5">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setDetalleExpanded(v => !v)}
            className="flex items-center gap-2 text-left hover:opacity-70 transition-opacity"
          >
            {detalleExpanded ? <ChevronDown size={15} className="text-gray-400 flex-shrink-0" /> : <ChevronRight size={15} className="text-gray-400 flex-shrink-0" />}
            <h3 className="font-semibold text-gray-700">
              Detalle Sell In
              {total > 0 && (
                <span className="ml-2 text-xs text-gray-400 font-normal">
                  ({((page - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(page * PAGE_SIZE, total).toLocaleString()} de {total.toLocaleString()})
                </span>
              )}
            </h3>
          </button>
          <button
            onClick={descargarCSV}
            disabled={rows.length === 0 || downloading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 shadow-sm disabled:opacity-40"
          >
            <Download size={13} /> {downloading ? 'Descargando…' : 'CSV'}
          </button>
        </div>

        {detalleExpanded && (loading
          ? <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
          : rows.length === 0
            ? <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Sin datos para los filtros seleccionados</div>
            : <>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 uppercase tracking-widest border-b border-gray-100">
                        <th className="text-left py-2 pr-3">País</th>
                        <th className="text-left py-2 pr-3">Cliente</th>
                        <th className="text-left py-2 pr-3 whitespace-nowrap">Proveedor</th>
                        <th className="text-left py-2 pr-6 w-1 whitespace-nowrap">OC</th>
                        <th className="text-left py-2 pr-3">SKU</th>
                        <th className="text-left py-2 pr-3">Producto</th>
                        <th className="text-left py-2 pr-3 w-1 whitespace-nowrap">Categoría</th>
                        <th className="text-left py-2 pr-3 whitespace-nowrap max-w-[110px]">Subcategoría</th>
                        <th className="text-left py-2 pr-3 w-1 whitespace-nowrap">Año</th>
                        <th className="text-left py-2 pr-3 w-1 whitespace-nowrap">Mes</th>
                        <th
                          className="text-right py-2 pr-3 cursor-pointer hover:text-gray-600 select-none"
                          onClick={() => toggleSort('cajas')}
                        >Cajas{arrow('cajas')}</th>
                        <th
                          className="text-right py-2 pr-3 cursor-pointer hover:text-gray-600 select-none"
                          onClick={() => toggleSort('ingresos')}
                        >Valor{arrow('ingresos')}</th>
                        <th className="text-right py-2 pr-3">Precio Caja</th>
                        <th
                          className="text-right py-2 cursor-pointer hover:text-gray-600 select-none"
                          onClick={() => toggleSort('pct')}
                        >% Total{arrow('pct')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((r, i) => (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-1.5 pr-3 font-semibold text-amber-600">{r.pais}</td>
                          <td className="py-1.5 pr-3 text-gray-700 max-w-[140px] truncate">{r.cliente}</td>
                          <td className="py-1.5 pr-3 whitespace-nowrap"><span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${r.proveedor === 'DFA' ? 'bg-amber-100 text-amber-700' : r.proveedor === 'Centrolac' ? 'bg-blue-100 text-blue-700' : r.proveedor === 'Centurión' ? 'bg-violet-100 text-violet-700' : r.proveedor === 'Sensación' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{r.proveedor || '—'}</span></td>
                          <td className="py-1.5 pr-6 w-1 whitespace-nowrap text-gray-500 font-mono text-[11px]">{r.orden_compra || r.canal}</td>
                          <td className="py-1.5 pr-3 font-mono text-gray-500">{r.sku}</td>
                          <td className="py-1.5 pr-3 text-gray-700 max-w-[260px] truncate" title={r.descripcion}>{r.descripcion}</td>
                          <td className="py-1.5 pr-3 w-1 whitespace-nowrap text-gray-600">{r.categoria}</td>
                          <td className="py-1.5 pr-3 max-w-[110px] truncate text-gray-500" title={r.subcategoria}>{r.subcategoria}</td>
                          <td className="py-1.5 pr-3 w-1 whitespace-nowrap text-gray-700 font-mono text-[11px]">{r.ano ?? partesFecha(r.fecha_max).ano}</td>
                          <td className="py-1.5 pr-3 w-1 whitespace-nowrap text-gray-800 font-mono text-[11px]">{r.mes != null ? (MES_LBL[r.mes] ?? String(r.mes)) : partesFecha(r.fecha_max).mes}</td>
                          <td className="py-1.5 pr-3 text-right text-gray-700">{fmtN(r.cajas)}</td>
                          <td className="py-1.5 pr-3 text-right font-semibold text-gray-800">{fmt(r.ingresos)}</td>
                          <td className="py-1.5 pr-3 text-right text-gray-500">{fmt(r.precio_promedio)}</td>
                          <td className="py-1.5 text-right text-gray-500">{r.pct.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                    <button
                      onClick={() => { const pg = page - 1; setPage(pg); cargar(fAnos, fMeses, fPaises, fCats, fClientes, fSkus, fProveedor, pg) }}
                      disabled={page === 1}
                      className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg disabled:opacity-40 hover:bg-gray-200"
                    >← Anterior</button>
                    <span className="text-sm text-gray-500">Página {page} de {totalPages}</span>
                    <button
                      onClick={() => { const pg = page + 1; setPage(pg); cargar(fAnos, fMeses, fPaises, fCats, fClientes, fSkus, fProveedor, pg) }}
                      disabled={page === totalPages}
                      className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg disabled:opacity-40 hover:bg-gray-200"
                    >Siguiente →</button>
                  </div>
                )}
              </>
        )}
      </div>
    </div>
  )
}
