'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { RefreshCw, Download, Upload, X, AlertTriangle, CheckCircle } from 'lucide-react'
import MultiSelect from '@/components/dashboard/MultiSelect'

const MESES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const toNum = (v: unknown): number => {
  const n = parseFloat(String(v))
  return isNaN(n) ? 0 : n
}

const fmt = (v: unknown): string => {
  const n = toNum(v)
  if (!isFinite(n)) return '$0'
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K'
  return '$' + n.toFixed(2)
}

interface SelloutRow {
  ano: number
  mes: number
  dia: number
  pais: string
  cliente: string
  punto_venta: string
  codigo_barras: string
  sku: string
  descripcion: string
  subcategoria: string
  ventas_unidades: number
  ventas_valor: number
}

type SortKey = 'ventas_valor' | 'ventas_unidades' | 'pct'
interface SortState { key: SortKey; dir: 'asc' | 'desc' }

export default function SelloutPage() {
  // Period state
  const [mesMap, setMesMap] = useState<Record<number, number[]>>({})
  const [anos, setAnos]     = useState<number[]>([])
  const [fAno, setFAno]     = useState('')
  const [fMes, setFMes]     = useState('')

  // Hierarchical filter state
  const [fPaises,    setFPaises]    = useState<string[]>([])
  const [fCats,      setFCats]      = useState<string[]>([])
  const [fSubcats,   setFSubcats]   = useState<string[]>([])
  const [fClientes,  setFClientes]  = useState<string[]>([])
  const [fSkus,      setFSkus]      = useState<string[]>([])
  const [fBarcodes,  setFBarcodes]  = useState<string[]>([])

  // Options
  const [paisOpts,    setPaisOpts]    = useState<string[]>([])
  const [catOpts,     setCatOpts]     = useState<string[]>([])
  const [subcatOpts,  setSubcatOpts]  = useState<string[]>([])
  const [clienteOpts, setClienteOpts] = useState<string[]>([])
  const [skuOpts,     setSkuOpts]     = useState<string[]>([])
  const [barcodeOpts, setBarcodeOpts] = useState<{ value: string; label: string }[]>([])

  // Data
  const [rows,    setRows]    = useState<SelloutRow[]>([])
  const [total,   setTotal]   = useState(0)
  const [kpi,     setKpi]     = useState<{ total_valor: number; total_unidades: number } | null>(null)
  const [page,    setPage]    = useState(1)
  const [loading, setLoading] = useState(true)
  const [sort,    setSort]    = useState<SortState>({ key: 'ventas_valor', dir: 'desc' })

  // Upload state
  const [showUpload, setShowUpload] = useState(false)
  const [upFile,     setUpFile]     = useState<File | null>(null)
  const [upArchivo,  setUpArchivo]  = useState('')
  const [upBusy,     setUpBusy]     = useState(false)
  const [upResult,   setUpResult]   = useState<{ ok: boolean; msg: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const PAGE_SIZE = 500
  const initDone  = useRef(false)

  // ── Load period map ──────────────────────────────────────────────────────
  useEffect(() => {
    if (initDone.current) return
    initDone.current = true
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
  }, [])

  // ── Load pais options (no cascade) ───────────────────────────────────────
  useEffect(() => {
    const p = new URLSearchParams({ dim: 'pais' })
    if (fAno) p.set('ano', fAno)
    if (fMes) p.set('mes', fMes)
    fetch('/api/ventas/dimension?' + p).then(r => r.json()).then(j => {
      setPaisOpts((j.rows || []).map((r: { nombre: string }) => r.nombre).filter(Boolean))
    })
  }, [fAno, fMes])

  // ── Load category options (no cascade — always full list) ─────────────────
  useEffect(() => {
    const p = new URLSearchParams({ dim: 'categoria' })
    if (fAno) p.set('ano', fAno)
    if (fMes) p.set('mes', fMes)
    fetch('/api/ventas/dimension?' + p).then(r => r.json()).then(j => {
      const opts = (j.rows || []).map((r: { nombre: string }) => r.nombre).filter(Boolean)
      setCatOpts(opts)
    })
  }, [fAno, fMes])

  // ── Cascade: fCats → subcatOpts (lazy) ───────────────────────────────────
  useEffect(() => {
    if (!fCats.length && !fPaises.length) { setSubcatOpts([]); setFSubcats([]); return }
    const p = new URLSearchParams({ dim: 'subcategoria' })
    if (fAno) p.set('ano', fAno)
    if (fMes) p.set('mes', fMes)
    if (fCats.length)   p.set('categorias', fCats.join(','))
    if (fPaises.length) p.set('paises',     fPaises.join(','))
    fetch('/api/ventas/dimension?' + p).then(r => r.json()).then(j => {
      const opts = (j.rows || []).map((r: { nombre: string }) => r.nombre).filter(Boolean)
      setSubcatOpts(opts)
      setFSubcats(prev => prev.filter(v => opts.includes(v)))
    })
  }, [fAno, fMes, fCats, fPaises])

  // ── Cascade: fPaises → clienteOpts (lazy) ────────────────────────────────
  useEffect(() => {
    if (!fPaises.length && !fCats.length) { setClienteOpts([]); setFClientes([]); return }
    const p = new URLSearchParams({ dim: 'cliente' })
    if (fAno) p.set('ano', fAno)
    if (fMes) p.set('mes', fMes)
    if (fPaises.length) p.set('paises', fPaises.join(','))
    if (fCats.length)   p.set('categorias', fCats.join(','))
    fetch('/api/ventas/dimension?' + p).then(r => r.json()).then(j => {
      const opts = (j.rows || []).map((r: { nombre: string }) => r.nombre).filter(Boolean)
      setClienteOpts(opts)
      setFClientes(prev => prev.filter(v => opts.includes(v)))
    })
  }, [fAno, fMes, fPaises, fCats])

  // ── Cascade: fCats + fSubcats + fClientes → skuOpts (lazy) ───────────────
  useEffect(() => {
    if (!fPaises.length && !fCats.length && !fClientes.length) { setSkuOpts([]); setFSkus([]); return }
    const p = new URLSearchParams({ dim: 'sku' })
    if (fAno) p.set('ano', fAno)
    if (fMes) p.set('mes', fMes)
    if (fPaises.length)   p.set('paises',       fPaises.join(','))
    if (fCats.length)     p.set('categorias',    fCats.join(','))
    if (fSubcats.length)  p.set('subcategorias', fSubcats.join(','))
    if (fClientes.length) p.set('clientes',      fClientes.join(','))
    fetch('/api/ventas/dimension?' + p).then(r => r.json()).then(j => {
      const opts = (j.rows || []).map((r: { nombre: string }) => r.nombre).filter(Boolean)
      setSkuOpts(opts)
      setFSkus(prev => prev.filter(v => opts.includes(v)))
    })
  }, [fAno, fMes, fPaises, fCats, fSubcats, fClientes])

  // ── Cascade: fSkus → barcodeOpts (lazy) ──────────────────────────────────
  useEffect(() => {
    if (!fSkus.length) { setBarcodeOpts([]); setFBarcodes([]); return }
    const p = new URLSearchParams({ dim: 'codigo_barras' })
    if (fAno) p.set('ano', fAno)
    if (fMes) p.set('mes', fMes)
    if (fPaises.length)   p.set('paises',       fPaises.join(','))
    if (fCats.length)     p.set('categorias',    fCats.join(','))
    if (fSubcats.length)  p.set('subcategorias', fSubcats.join(','))
    if (fClientes.length) p.set('clientes',      fClientes.join(','))
    if (fSkus.length)     p.set('skus',          fSkus.join(','))
    fetch('/api/ventas/dimension?' + p).then(r => r.json()).then(j => {
      const opts: { value: string; label: string }[] = (j.rows || []).map((r: { nombre: string }) => ({
        value: r.nombre.split(' — ')[0] ?? r.nombre,
        label: r.nombre,
      }))
      setBarcodeOpts(opts)
      setFBarcodes(prev => prev.filter(v => opts.some(o => o.value === v)))
    })
  }, [fAno, fMes, fPaises, fCats, fSubcats, fClientes, fSkus])

  // ── Fetch data ────────────────────────────────────────────────────────────
  const cargar = useCallback((
    ano: string, mes: string,
    paises: string[], cats: string[], subcats: string[],
    clientes: string[], skus: string[], barcodes: string[],
    pg: number
  ) => {
    setLoading(true)
    const p = new URLSearchParams()
    if (ano)              p.set('ano', ano)
    if (mes)              p.set('mes', mes)
    if (paises.length)    p.set('paises', paises.join(','))
    if (cats.length)      p.set('categorias', cats.join(','))
    if (subcats.length)   p.set('subcategorias', subcats.join(','))
    if (clientes.length)  p.set('clientes', clientes.join(','))
    if (skus.length)      p.set('skus', skus.join(','))
    if (barcodes.length)  p.set('barcodes', barcodes.join(','))
    p.set('page', String(pg))
    p.set('pageSize', String(PAGE_SIZE))

    fetch('/api/ventas/sellout?' + p)
      .then(r => r.json())
      .then(j => {
        if (j.error) { console.error(j.error); return }
        setRows((j.rows || []).map((r: Record<string, unknown>) => ({
          ano:             toNum(r.ano),
          mes:             toNum(r.mes),
          dia:             toNum(r.dia),
          pais:            String(r.pais || ''),
          cliente:         String(r.cliente || ''),
          punto_venta:     String(r.punto_venta || ''),
          codigo_barras:   String(r.codigo_barras || ''),
          sku:             String(r.sku || ''),
          descripcion:     String(r.descripcion || ''),
          subcategoria:    String(r.subcategoria || ''),
          ventas_unidades: toNum(r.ventas_unidades),
          ventas_valor:    toNum(r.ventas_valor),
        })))
        setTotal(toNum(j.total))
        if (j.kpi) setKpi({ total_valor: toNum(j.kpi.total_valor), total_unidades: toNum(j.kpi.total_unidades) })
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    cargar('', '', [], [], [], [], [], [], 1)
  }, [cargar])

  const triggerCargar = (
    ano = fAno, mes = fMes,
    paises = fPaises, cats = fCats, subcats = fSubcats,
    clientes = fClientes, skus = fSkus, barcodes = fBarcodes,
    pg = 1
  ) => {
    setPage(pg)
    cargar(ano, mes, paises, cats, subcats, clientes, skus, barcodes, pg)
  }

  const limpiar = () => {
    setFAno(''); setFMes('')
    setFPaises([]); setFCats([]); setFSubcats([])
    setFClientes([]); setFSkus([]); setFBarcodes([])
    setPage(1)
    cargar('', '', [], [], [], [], [], [], 1)
  }

  // ── Sort logic ────────────────────────────────────────────────────────────
  const grandTotal = kpi?.total_valor ?? rows.reduce((s, r) => s + r.ventas_valor, 0)

  const rowsWithPct = rows.map(r => ({
    ...r,
    pct: grandTotal > 0 ? (r.ventas_valor / grandTotal) * 100 : 0,
  }))

  const sorted = [...rowsWithPct].sort((a, b) => {
    const diff = sort.key === 'ventas_valor'
      ? a.ventas_valor - b.ventas_valor
      : sort.key === 'ventas_unidades'
        ? a.ventas_unidades - b.ventas_unidades
        : a.pct - b.pct
    return sort.dir === 'asc' ? diff : -diff
  })

  const toggleSort = (key: SortKey) =>
    setSort(prev => prev.key === key
      ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
      : { key, dir: 'desc' })

  const arrow = (key: SortKey) => sort.key === key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ' ↕'

  // ── Upload ────────────────────────────────────────────────────────────────
  const doUpload = async () => {
    if (!upFile) return
    setUpBusy(true)
    setUpResult(null)
    try {
      const fd = new FormData()
      fd.append('file', upFile)
      if (upArchivo.trim()) fd.append('archivo', upArchivo.trim())
      const res = await fetch('/api/ventas/sellout/upload', { method: 'POST', body: fd })
      const j   = await res.json()
      if (!res.ok || j.error) {
        setUpResult({ ok: false, msg: j.error || 'Error al cargar' })
      } else {
        setUpResult({ ok: true, msg: `${j.insertados.toLocaleString()} filas cargadas correctamente${j.omitidos ? ` · ${j.omitidos} omitidas` : ''}` })
        setUpFile(null)
        if (fileRef.current) fileRef.current.value = ''
        triggerCargar()
      }
    } catch (e: any) {
      setUpResult({ ok: false, msg: e.message })
    } finally {
      setUpBusy(false)
    }
  }

  // ── CSV download ──────────────────────────────────────────────────────────
  const descargarCSV = () => {
    const headers = ['Año','Mes','Día','País','Cliente','Punto Venta','Código de Barras','SKU','Producto','Subcategoría','Unidades','USD','% Total']
    const escape = (v: string | number) => {
      const s = String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csvRows = [
      headers.join(','),
      ...sorted.map(r => [
        r.ano, MESES[r.mes] || r.mes, r.dia, r.pais, r.cliente, r.punto_venta,
        r.codigo_barras, r.sku, r.descripcion, r.subcategoria,
        r.ventas_unidades, r.ventas_valor.toFixed(2), r.pct.toFixed(2) + '%',
      ].map(escape).join(',')),
    ]
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `sellout_${fAno || 'todos'}_${fMes ? MESES[parseInt(fMes)] : 'todos'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const mesesDisp  = fAno ? (mesMap[Number(fAno)] || []) : []
  const totalPages = Math.ceil(total / PAGE_SIZE)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Dashboard Comercial</p>
          <h1 className="text-2xl font-bold text-gray-800">Ventas Sellout</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={descargarCSV}
            disabled={rows.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm disabled:opacity-40"
          >
            <Download size={14} /> CSV
          </button>
          <button
            onClick={() => { setShowUpload(v => !v); setUpResult(null) }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white shadow-sm"
            style={{ background: '#c8873a' }}
          >
            <Upload size={14} /> Importar CSV
          </button>
          <button
            onClick={() => triggerCargar()}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Upload panel */}
      {showUpload && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-700 text-sm">Importar datos de Sellout</p>
              <p className="text-xs text-gray-400 mt-0.5">
                CSV con columnas: pais, cliente, cadena, formato, categoria, subcategoria, punto_venta, codigo_barras, sku, descripcion, ano, mes, dia, ventas_unidades, ventas_valor
              </p>
            </div>
            <button onClick={() => setShowUpload(false)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
              <X size={14} />
            </button>
          </div>

          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <p className="text-xs text-gray-500 mb-1 font-medium">Nombre / origen (opcional)</p>
              <input
                value={upArchivo}
                onChange={e => setUpArchivo(e.target.value)}
                placeholder="ej. sellout-cr-ene2026"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 w-52"
              />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1 font-medium">Archivo CSV</p>
              <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
                onChange={e => { setUpFile(e.target.files?.[0] ?? null); setUpResult(null) }} />
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 border border-dashed border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <Upload size={13} />
                {upFile ? upFile.name : 'Seleccionar archivo'}
              </button>
            </div>
            <button
              onClick={doUpload}
              disabled={!upFile || upBusy}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors"
              style={{ background: '#c8873a' }}
            >
              {upBusy
                ? <><RefreshCw size={13} className="animate-spin" /> Cargando…</>
                : <><Upload size={13} /> Cargar</>}
            </button>
          </div>

          {upResult && (
            <div className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${upResult.ok ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-600'}`}>
              {upResult.ok ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
              {upResult.msg}
            </div>
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Filtros</p>
          <button onClick={limpiar} className="text-xs text-gray-400 hover:text-gray-600 underline">Limpiar todo</button>
        </div>

        {/* Row 1: Period */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              Año {anos.length === 0 && <span className="text-amber-400 ml-1 animate-pulse">●</span>}
            </label>
            <select
              value={fAno}
              onChange={e => { setFAno(e.target.value); setFMes(''); triggerCargar(e.target.value, '') }}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="">Todos</option>
              {anos.map(a => <option key={a} value={String(a)}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Mes</label>
            <select
              value={fMes}
              onChange={e => { setFMes(e.target.value); triggerCargar(fAno, e.target.value) }}
              disabled={!fAno}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-40"
            >
              <option value="">Todos los meses</option>
              {mesesDisp.map(m => <option key={m} value={String(m)}>{MESES[m]}</option>)}
            </select>
          </div>
        </div>

        {/* Row 2: Hierarchical filters */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <MultiSelect
            label="País"
            options={paisOpts.map(p => ({ value: p, label: p }))}
            value={fPaises}
            onChange={v => { setFPaises(v); triggerCargar(fAno, fMes, v) }}
            placeholder="Todos los países"
          />
          <MultiSelect
            label="Categoría"
            options={catOpts.map(c => ({ value: c, label: c }))}
            value={fCats}
            onChange={v => { setFCats(v); triggerCargar(fAno, fMes, fPaises, v) }}
            placeholder="Todas"
          />
          <MultiSelect
            label="Subcategoría"
            options={subcatOpts.map(s => ({ value: s, label: s }))}
            value={fSubcats}
            onChange={v => { setFSubcats(v); triggerCargar(fAno, fMes, fPaises, fCats, v) }}
            placeholder="Todas"
          />
          <MultiSelect
            label="Cliente"
            options={clienteOpts.map(c => ({ value: c, label: c }))}
            value={fClientes}
            onChange={v => { setFClientes(v); triggerCargar(fAno, fMes, fPaises, fCats, fSubcats, v) }}
            placeholder="Todos"
          />
          <MultiSelect
            label="SKU"
            options={skuOpts.map(s => ({ value: s, label: s }))}
            value={fSkus}
            onChange={v => { setFSkus(v); triggerCargar(fAno, fMes, fPaises, fCats, fSubcats, fClientes, v) }}
            placeholder="Todos"
          />
          <MultiSelect
            label="Código de Barras"
            options={barcodeOpts}
            value={fBarcodes}
            onChange={v => { setFBarcodes(v); triggerCargar(fAno, fMes, fPaises, fCats, fSubcats, fClientes, fSkus, v) }}
            placeholder="Todos"
          />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 border-l-4 border-l-amber-500">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Ventas Totales USD</p>
          <p className="text-2xl font-bold text-gray-800">{loading ? '...' : fmt(kpi?.total_valor ?? 0)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 border-l-4 border-l-blue-500">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Unidades Totales</p>
          <p className="text-2xl font-bold text-gray-800">{loading ? '...' : (kpi?.total_unidades ?? 0).toLocaleString()}</p>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-700">
            Detalle Sellout
            {total > 0 && (
              <span className="ml-2 text-xs text-gray-400 font-normal">
                ({((page - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(page * PAGE_SIZE, total).toLocaleString()} de {total.toLocaleString()})
              </span>
            )}
          </h3>
        </div>

        {loading
          ? <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
          : rows.length === 0
            ? <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Sin datos para los filtros seleccionados</div>
            : <>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 uppercase tracking-widest border-b border-gray-100">
                        <th className="text-left py-2 pr-3">Año</th>
                        <th className="text-left py-2 pr-3">Mes</th>
                        <th className="text-left py-2 pr-3">Día</th>
                        <th className="text-left py-2 pr-3">País</th>
                        <th className="text-left py-2 pr-3">Cliente</th>
                        <th className="text-left py-2 pr-3">Punto Venta</th>
                        <th className="text-left py-2 pr-3">Cód. Barras</th>
                        <th className="text-left py-2 pr-3">SKU</th>
                        <th className="text-left py-2 pr-3">Producto</th>
                        <th className="text-left py-2 pr-3">Subcategoría</th>
                        <th
                          className="text-right py-2 pr-3 cursor-pointer hover:text-gray-600 select-none"
                          onClick={() => toggleSort('ventas_unidades')}
                        >
                          Unidades{arrow('ventas_unidades')}
                        </th>
                        <th
                          className="text-right py-2 pr-3 cursor-pointer hover:text-gray-600 select-none"
                          onClick={() => toggleSort('ventas_valor')}
                        >
                          USD{arrow('ventas_valor')}
                        </th>
                        <th
                          className="text-right py-2 cursor-pointer hover:text-gray-600 select-none"
                          onClick={() => toggleSort('pct')}
                        >
                          % Total{arrow('pct')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((r, i) => (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-1.5 pr-3 text-gray-600">{r.ano}</td>
                          <td className="py-1.5 pr-3 text-gray-600">{MESES[r.mes] || r.mes}</td>
                          <td className="py-1.5 pr-3 text-gray-500">{r.dia}</td>
                          <td className="py-1.5 pr-3 font-semibold text-amber-600">{r.pais}</td>
                          <td className="py-1.5 pr-3 text-gray-600 max-w-[120px] truncate">{r.cliente}</td>
                          <td className="py-1.5 pr-3 text-gray-500 max-w-[120px] truncate text-[11px]">{r.punto_venta}</td>
                          <td className="py-1.5 pr-3 font-mono text-gray-500 text-[11px]">{r.codigo_barras}</td>
                          <td className="py-1.5 pr-3 font-mono text-gray-500">{r.sku}</td>
                          <td className="py-1.5 pr-3 text-gray-700 max-w-[160px] truncate">{r.descripcion}</td>
                          <td className="py-1.5 pr-3 text-gray-600">{r.subcategoria}</td>
                          <td className="py-1.5 pr-3 text-right text-gray-700">{r.ventas_unidades.toLocaleString()}</td>
                          <td className="py-1.5 pr-3 text-right font-semibold text-gray-800">{fmt(r.ventas_valor)}</td>
                          <td className="py-1.5 text-right text-gray-500">{r.pct.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                    <button
                      onClick={() => { const pg = page - 1; setPage(pg); cargar(fAno, fMes, fPaises, fCats, fSubcats, fClientes, fSkus, fBarcodes, pg) }}
                      disabled={page === 1}
                      className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg disabled:opacity-40 hover:bg-gray-200"
                    >
                      ← Anterior
                    </button>
                    <span className="text-sm text-gray-500">Página {page} de {totalPages}</span>
                    <button
                      onClick={() => { const pg = page + 1; setPage(pg); cargar(fAno, fMes, fPaises, fCats, fSubcats, fClientes, fSkus, fBarcodes, pg) }}
                      disabled={page === totalPages}
                      className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg disabled:opacity-40 hover:bg-gray-200"
                    >
                      Siguiente →
                    </button>
                  </div>
                )}
              </>
        }
      </div>
    </div>
  )
}
