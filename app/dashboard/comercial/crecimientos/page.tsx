'use client'
import { showError } from '@/lib/toast'
import { useEffect, useState, useCallback, useRef } from 'react'
import { RefreshCw, Download, TrendingUp, TrendingDown, Minus, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import MultiSelect from '@/components/dashboard/MultiSelect'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts'

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

const fmtPct = (v: unknown): string => {
  const n = toNum(v)
  if (!isFinite(n)) return '—'
  return (n > 0 ? '+' : '') + n.toFixed(1) + '%'
}

interface Producto {
  sku: string
  descripcion: string
  categoria: string
  subcategoria: string
  valor_actual: number
  unidades_actual: number
  valor_anterior: number
  unidades_anterior: number
  crecimiento_pct: number | null
  diferencia_valor: number
  crecimiento_unidades_pct: number | null
}

interface KPI {
  total_actual: number
  total_anterior: number
  unidades_actual: number
  unidades_anterior: number
  skus_actual: number
  crecimiento_pct: number | null
}

interface MesData {
  mes: number
  valor_actual: number
  valor_anterior: number
}

type SortKey = 'valor_actual' | 'valor_anterior' | 'crecimiento_pct' | 'diferencia_valor' | 'unidades_actual'
interface SortState { key: SortKey; dir: 'asc' | 'desc' }

export default function CrecimientosPage() {
  // Period
  const [anos, setAnos]   = useState<number[]>([])
  const [fAno, setFAno]   = useState('')

  // Filters
  const [fPaises,   setFPaises]   = useState<string[]>([])
  const [fCats,     setFCats]     = useState<string[]>([])
  const [fSubcats,  setFSubcats]  = useState<string[]>([])
  const [fClientes, setFClientes] = useState<string[]>([])

  // Options
  const [paisOpts,    setPaisOpts]    = useState<string[]>([])
  const [catOpts,     setCatOpts]     = useState<string[]>([])
  const [subcatOpts,  setSubcatOpts]  = useState<string[]>([])
  const [clienteOpts, setClienteOpts] = useState<string[]>([])

  // Data
  const [productos, setProductos] = useState<Producto[]>([])
  const [kpi, setKpi]             = useState<KPI | null>(null)
  const [mensual, setMensual]     = useState<MesData[]>([])
  const [anoActual, setAnoActual]     = useState(0)
  const [anoAnterior, setAnoAnterior] = useState(0)
  const [mesCorte, setMesCorte]       = useState(0)
  const [loading, setLoading]         = useState(true)
  const [sort, setSort]               = useState<SortState>({ key: 'valor_actual', dir: 'desc' })

  const initDone = useRef(false)

  // ── Load available years ──────────────────────────────────────
  useEffect(() => {
    if (initDone.current) return
    initDone.current = true
    fetch('/api/ventas/resumen?tipo=periodos')
      .then(r => r.json())
      .then(j => {
        const yearsSet = new Set<number>()
        ;(j.periodos || []).forEach((p: { ano: unknown }) => yearsSet.add(Number(p.ano)))
        setAnos([...yearsSet].sort((a, b) => b - a))
      })
  }, [])

  // ── Load filter options ───────────────────────────────────────
  useEffect(() => {
    const p = new URLSearchParams({ dim: 'pais' })
    if (fAno) p.set('ano', fAno)
    fetch('/api/ventas/dimension?' + p).then(r => r.json()).then(j => {
      setPaisOpts((j.rows || []).map((r: { nombre: string }) => r.nombre).filter(Boolean))
    })
  }, [fAno])

  // Cascade: año + países → categorías
  useEffect(() => {
    const p = new URLSearchParams({ dim: 'categoria' })
    if (fAno) p.set('ano', fAno)
    if (fPaises.length) p.set('paises', fPaises.join(','))
    fetch('/api/ventas/dimension?' + p).then(r => r.json()).then(j => {
      const opts = (j.rows || []).map((r: { nombre: string }) => r.nombre).filter(Boolean)
      setCatOpts(opts)
      setFCats(prev => prev.filter(v => opts.includes(v)))
    })
  }, [fAno, fPaises])

  // Cascade: año + países + cats → subcategorías (lazy)
  useEffect(() => {
    if (!fPaises.length && !fCats.length) { setSubcatOpts([]); setFSubcats([]); return }
    const p = new URLSearchParams({ dim: 'subcategoria' })
    if (fAno) p.set('ano', fAno)
    if (fPaises.length) p.set('paises',     fPaises.join(','))
    if (fCats.length)   p.set('categorias', fCats.join(','))
    fetch('/api/ventas/dimension?' + p).then(r => r.json()).then(j => {
      const opts = (j.rows || []).map((r: { nombre: string }) => r.nombre).filter(Boolean)
      setSubcatOpts(opts)
      setFSubcats(prev => prev.filter(v => opts.includes(v)))
    })
  }, [fAno, fPaises, fCats])

  // Cascade: año + países + cats + subcats → clientes (lazy)
  useEffect(() => {
    if (!fPaises.length && !fCats.length) { setClienteOpts([]); setFClientes([]); return }
    const p = new URLSearchParams({ dim: 'cliente' })
    if (fAno) p.set('ano', fAno)
    if (fPaises.length)  p.set('paises',       fPaises.join(','))
    if (fCats.length)    p.set('categorias',    fCats.join(','))
    if (fSubcats.length) p.set('subcategorias', fSubcats.join(','))
    fetch('/api/ventas/dimension?' + p).then(r => r.json()).then(j => {
      const opts = (j.rows || []).map((r: { nombre: string }) => r.nombre).filter(Boolean)
      setClienteOpts(opts)
      setFClientes(prev => prev.filter(v => opts.includes(v)))
    })
  }, [fAno, fPaises, fCats, fSubcats])

  // ── Fetch growth data ─────────────────────────────────────────
  const cargar = useCallback((ano: string, paises: string[], cats: string[], subcats: string[], clientes: string[]) => {
    setLoading(true)
    const p = new URLSearchParams()
    if (ano)              p.set('ano', ano)
    if (paises.length)    p.set('paises', paises.join(','))
    if (cats.length)      p.set('categorias', cats.join(','))
    if (subcats.length)   p.set('subcategorias', subcats.join(','))
    if (clientes.length)  p.set('clientes', clientes.join(','))

    fetch('/api/ventas/crecimientos?' + p)
      .then(r => r.json())
      .then(j => {
        if (j.error) { showError(j.error || 'Error al cargar datos'); return }
        setAnoActual(j.ano_actual)
        setAnoAnterior(j.ano_anterior)
        setMesCorte(j.mes_corte)
        setKpi(j.kpi)
        setMensual((j.mensual || []).map((m: Record<string, unknown>) => ({
          mes: toNum(m.mes),
          valor_actual: toNum(m.valor_actual),
          valor_anterior: toNum(m.valor_anterior),
        })))
        setProductos((j.productos || []).map((r: Record<string, unknown>) => ({
          sku:                     String(r.sku || ''),
          descripcion:             String(r.descripcion || ''),
          categoria:               String(r.categoria || ''),
          subcategoria:            String(r.subcategoria || ''),
          valor_actual:            toNum(r.valor_actual),
          unidades_actual:         toNum(r.unidades_actual),
          valor_anterior:          toNum(r.valor_anterior),
          unidades_anterior:       toNum(r.unidades_anterior),
          crecimiento_pct:         r.crecimiento_pct != null ? toNum(r.crecimiento_pct) : null,
          diferencia_valor:        toNum(r.diferencia_valor),
          crecimiento_unidades_pct: r.crecimiento_unidades_pct != null ? toNum(r.crecimiento_unidades_pct) : null,
        })))
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { cargar('', [], [], [], []) }, [cargar])

  const triggerCargar = (ano = fAno, paises = fPaises, cats = fCats, subcats = fSubcats, clientes = fClientes) => {
    cargar(ano, paises, cats, subcats, clientes)
  }

  const limpiar = () => {
    setFAno(''); setFPaises([]); setFCats([]); setFSubcats([]); setFClientes([])
    cargar('', [], [], [], [])
  }

  // ── Sort ──────────────────────────────────────────────────────
  const sorted = [...productos].sort((a, b) => {
    const av = sort.key === 'crecimiento_pct' ? (a.crecimiento_pct ?? -9999) : (a[sort.key] as number)
    const bv = sort.key === 'crecimiento_pct' ? (b.crecimiento_pct ?? -9999) : (b[sort.key] as number)
    return sort.dir === 'asc' ? av - bv : bv - av
  })

  const toggleSort = (key: SortKey) =>
    setSort(prev => prev.key === key
      ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
      : { key, dir: 'desc' })

  const arrow = (key: SortKey) => sort.key === key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ' ↕'

  // ── Counters ──────────────────────────────────────────────────
  const crecen  = productos.filter(p => p.crecimiento_pct != null && p.crecimiento_pct > 0).length
  const caen    = productos.filter(p => p.crecimiento_pct != null && p.crecimiento_pct < 0).length
  const nuevos  = productos.filter(p => p.valor_anterior === 0 && p.valor_actual > 0).length

  // ── Chart data ────────────────────────────────────────────────
  const chartData = mensual.map(m => ({
    name: MESES[m.mes] || `M${m.mes}`,
    [String(anoActual)]:   m.valor_actual,
    [String(anoAnterior)]: m.valor_anterior,
  }))

  // ── CSV ───────────────────────────────────────────────────────
  const descargarCSV = () => {
    const headers = ['SKU','Producto','Categoría','Subcategoría',
      `USD ${anoActual}`,`Uds ${anoActual}`,`USD ${anoAnterior}`,`Uds ${anoAnterior}`,
      'Crec. USD %','Diferencia USD','Crec. Uds %']
    const escape = (v: string | number) => {
      const s = String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csvRows = [
      headers.join(','),
      ...sorted.map(r => [
        r.sku, r.descripcion, r.categoria, r.subcategoria,
        r.valor_actual.toFixed(2), r.unidades_actual,
        r.valor_anterior.toFixed(2), r.unidades_anterior,
        r.crecimiento_pct != null ? r.crecimiento_pct.toFixed(1) + '%' : 'Nuevo',
        r.diferencia_valor.toFixed(2),
        r.crecimiento_unidades_pct != null ? r.crecimiento_unidades_pct.toFixed(1) + '%' : 'Nuevo',
      ].map(escape).join(',')),
    ]
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `crecimientos_ytd_${anoActual}_vs_${anoAnterior}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Growth color helper ───────────────────────────────────────
  const growthColor = (pct: number | null) => {
    if (pct == null) return 'text-blue-500'
    if (pct > 0) return 'text-emerald-600'
    if (pct < 0) return 'text-red-500'
    return 'text-gray-400'
  }
  const growthBg = (pct: number | null) => {
    if (pct == null) return 'bg-blue-50 text-blue-600'
    if (pct > 5) return 'bg-emerald-50 text-emerald-700'
    if (pct > 0) return 'bg-emerald-50/50 text-emerald-600'
    if (pct < -5) return 'bg-red-50 text-red-700'
    if (pct < 0) return 'bg-red-50/50 text-red-600'
    return 'bg-gray-50 text-gray-500'
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Ventas</p>
          <h1 className="text-2xl font-bold text-gray-800">Crecimientos YTD</h1>
          {anoActual > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              Comparativa {anoActual} vs {anoAnterior} · Corte: {MESES[mesCorte]} {anoActual}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={descargarCSV}
            disabled={productos.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm disabled:opacity-40"
          >
            <Download size={14} /> CSV
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

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Filtros</p>
          <button onClick={limpiar} className="text-xs text-gray-400 hover:text-gray-600 underline">Limpiar todo</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Año de referencia</label>
            <select
              value={fAno}
              onChange={e => { setFAno(e.target.value); triggerCargar(e.target.value) }}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="">Más reciente</option>
              {anos.map(a => <option key={a} value={String(a)}>{a} vs {a - 1}</option>)}
            </select>
          </div>
          <MultiSelect
            label="País"
            options={paisOpts.map(p => ({ value: p, label: p }))}
            value={fPaises}
            onChange={v => { setFPaises(v); triggerCargar(fAno, v) }}
            placeholder="Todos los países"
          />
          <MultiSelect
            label="Categoría"
            options={catOpts.map(c => ({ value: c, label: c }))}
            value={fCats}
            onChange={v => { setFCats(v); triggerCargar(fAno, fPaises, v) }}
            placeholder="Todas"
          />
          <MultiSelect
            label="Subcategoría"
            options={subcatOpts.map(s => ({ value: s, label: s }))}
            value={fSubcats}
            onChange={v => { setFSubcats(v); triggerCargar(fAno, fPaises, fCats, v) }}
            placeholder={fCats.length ? 'Todas' : 'Selecciona categoría'}
          />
          <MultiSelect
            label="Cliente"
            options={clienteOpts.map(c => ({ value: c, label: c }))}
            value={fClientes}
            onChange={v => { setFClientes(v); triggerCargar(fAno, fPaises, fCats, fSubcats, v) }}
            placeholder="Todos"
          />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 border-l-4 border-l-amber-500">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
            Ventas {anoActual}
          </p>
          <p className="text-2xl font-bold text-gray-800">{loading ? '...' : fmt(kpi?.total_actual)}</p>
          <p className="text-xs text-gray-400 mt-1">YTD Ene–{MESES[mesCorte]}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 border-l-4 border-l-gray-300">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
            Ventas {anoAnterior}
          </p>
          <p className="text-2xl font-bold text-gray-800">{loading ? '...' : fmt(kpi?.total_anterior)}</p>
          <p className="text-xs text-gray-400 mt-1">Mismo período</p>
        </div>
        <div className={`bg-white rounded-xl border border-gray-100 shadow-sm p-5 border-l-4 ${
          (kpi?.crecimiento_pct ?? 0) >= 0 ? 'border-l-emerald-500' : 'border-l-red-500'
        }`}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Crecimiento</p>
          <p className={`text-2xl font-bold ${(kpi?.crecimiento_pct ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {loading ? '...' : kpi?.crecimiento_pct != null ? fmtPct(kpi.crecimiento_pct) : '—'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {!loading && kpi ? fmt(kpi.total_actual - kpi.total_anterior) + ' diferencia' : ''}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 border-l-4 border-l-blue-500">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">SKUs activos</p>
          <p className="text-2xl font-bold text-gray-800">{loading ? '...' : kpi?.skus_actual ?? 0}</p>
          <p className="text-xs text-gray-400 mt-1">{productos.length} con datos comparables</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 border-l-4 border-l-purple-400">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Tendencia</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-sm font-semibold text-emerald-600">
              <TrendingUp size={14} /> {loading ? '...' : crecen}
            </span>
            <span className="flex items-center gap-1 text-sm font-semibold text-red-500">
              <TrendingDown size={14} /> {loading ? '...' : caen}
            </span>
            <span className="flex items-center gap-1 text-sm font-semibold text-blue-500">
              <Minus size={14} /> {loading ? '...' : nuevos} nuevos
            </span>
          </div>
        </div>
      </div>

      {/* Chart mensual */}
      {chartData.length > 0 && !loading && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-semibold text-gray-700 mb-4">Comparativa mensual USD</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} barCategoryGap="20%">
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => {
                if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M'
                if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K'
                return '$' + v
              }} />
              <Tooltip
                formatter={(val: number, name: string) => [fmt(val), name]}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey={String(anoAnterior)} fill="#d1d5db" radius={[4, 4, 0, 0]} />
              <Bar dataKey={String(anoActual)} fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabla de productos */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-700">
            Detalle por Producto
            {productos.length > 0 && (
              <span className="ml-2 text-xs text-gray-400 font-normal">
                ({productos.length} productos)
              </span>
            )}
          </h3>
        </div>

        {loading
          ? <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
          : productos.length === 0
            ? <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Sin datos para los filtros seleccionados</div>
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 uppercase tracking-widest border-b border-gray-100">
                      <th className="text-left py-2 pr-3 w-8">#</th>
                      <th className="text-left py-2 pr-3">SKU</th>
                      <th className="text-left py-2 pr-3">Producto</th>
                      <th className="text-left py-2 pr-3">Categoría</th>
                      <th
                        className="text-right py-2 pr-3 cursor-pointer hover:text-gray-600 select-none"
                        onClick={() => toggleSort('valor_actual')}
                      >
                        USD {anoActual}{arrow('valor_actual')}
                      </th>
                      <th
                        className="text-right py-2 pr-3 cursor-pointer hover:text-gray-600 select-none"
                        onClick={() => toggleSort('valor_anterior')}
                      >
                        USD {anoAnterior}{arrow('valor_anterior')}
                      </th>
                      <th
                        className="text-right py-2 pr-3 cursor-pointer hover:text-gray-600 select-none"
                        onClick={() => toggleSort('diferencia_valor')}
                      >
                        Diferencia{arrow('diferencia_valor')}
                      </th>
                      <th
                        className="text-right py-2 pr-3 cursor-pointer hover:text-gray-600 select-none"
                        onClick={() => toggleSort('crecimiento_pct')}
                      >
                        Crec. %{arrow('crecimiento_pct')}
                      </th>
                      <th
                        className="text-right py-2 cursor-pointer hover:text-gray-600 select-none"
                        onClick={() => toggleSort('unidades_actual')}
                      >
                        Uds {anoActual}{arrow('unidades_actual')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((r, i) => (
                      <tr key={r.sku + i} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-1.5 pr-3 text-gray-400">{i + 1}</td>
                        <td className="py-1.5 pr-3 font-mono text-gray-500 text-[11px]">{r.sku}</td>
                        <td className="py-1.5 pr-3 text-gray-700 max-w-[200px] truncate">{r.descripcion}</td>
                        <td className="py-1.5 pr-3 text-gray-500">{r.categoria}</td>
                        <td className="py-1.5 pr-3 text-right font-semibold text-gray-800">{fmt(r.valor_actual)}</td>
                        <td className="py-1.5 pr-3 text-right text-gray-500">{fmt(r.valor_anterior)}</td>
                        <td className={`py-1.5 pr-3 text-right font-medium ${r.diferencia_valor >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {r.diferencia_valor >= 0 ? '+' : ''}{fmt(r.diferencia_valor)}
                        </td>
                        <td className="py-1.5 pr-3 text-right">
                          <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-full ${growthBg(r.crecimiento_pct)}`}>
                            {r.crecimiento_pct != null ? (
                              <>
                                {r.crecimiento_pct > 0 && <ArrowUpRight size={10} />}
                                {r.crecimiento_pct < 0 && <ArrowDownRight size={10} />}
                                {fmtPct(r.crecimiento_pct)}
                              </>
                            ) : 'Nuevo'}
                          </span>
                        </td>
                        <td className="py-1.5 text-right text-gray-600">{r.unidades_actual.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        }
      </div>
    </div>
  )
}
