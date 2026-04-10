'use client'
import { showError } from '@/lib/toast'
import { useEffect, useState, useCallback, useRef } from 'react'
import { RefreshCw, Download } from 'lucide-react'
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

interface SellInRow {
  pais:           string
  cliente:        string
  canal:          string
  sku:            string
  descripcion:    string
  categoria:      string
  unidades:       number
  ingresos:       number
  precio_promedio: number
}

type SortKey = 'ingresos' | 'unidades' | 'pct'
interface SortState { key: SortKey; dir: 'asc' | 'desc' }

export default function SellInPage() {
  // Period
  const [mesMap, setMesMap] = useState<Record<number, number[]>>({})
  const [anos,   setAnos]   = useState<number[]>([])
  const [fAnos,  setFAnos]  = useState<string[]>([])
  const [fMeses, setFMeses] = useState<string[]>([])

  // Filters
  const [fPaises,   setFPaises]   = useState<string[]>([])
  const [fCats,     setFCats]     = useState<string[]>([])
  const [fClientes, setFClientes] = useState<string[]>([])
  const [fCanales,  setFCanales]  = useState<string[]>([])
  const [fSkus,     setFSkus]     = useState<string[]>([])

  // Options
  const [paisOpts,    setPaisOpts]    = useState<string[]>([])
  const [catOpts,     setCatOpts]     = useState<string[]>([])
  const [clienteOpts, setClienteOpts] = useState<string[]>([])
  const [canalOpts,   setCanalOpts]   = useState<string[]>([])
  const [skuOpts,     setSkuOpts]     = useState<string[]>([])

  // Data
  const [rows,    setRows]    = useState<SellInRow[]>([])
  const [total,   setTotal]   = useState(0)
  const [kpi,     setKpi]     = useState<{ total_ingresos: number; total_unidades: number; total_clientes: number } | null>(null)
  const [page,    setPage]    = useState(1)
  const [loading, setLoading] = useState(true)
  const [sort,    setSort]    = useState<SortState>({ key: 'ingresos', dir: 'desc' })

  const PAGE_SIZE = 500
  const initDone  = useRef(false)

  // ── Cargar períodos disponibles ─────────────────────────────────────────────
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

  // ── NIVEL 2 — Canal: requiere País ──────────────────────────────────────────
  useEffect(() => {
    if (!fPaises.length) { setCanalOpts([]); setFCanales([]); return }
    const p = buildPeriodParams(new URLSearchParams({ dim: 'canal' }))
    p.set('paises', fPaises.join(','))
    fetch('/api/ventas/sell-in/opts?' + p).then(r => r.json()).then(j => {
      const opts = j.opts ?? []
      setCanalOpts(opts)
      setFCanales(prev => prev.filter(v => opts.includes(v)))
    })
  }, [buildPeriodParams, fPaises])

  // ── NIVEL 3 — Cliente: requiere País, filtra por Canal si está activo ────────
  useEffect(() => {
    if (!fPaises.length) { setClienteOpts([]); setFClientes([]); return }
    const p = buildPeriodParams(new URLSearchParams({ dim: 'cliente' }))
    p.set('paises', fPaises.join(','))
    if (fCanales.length) p.set('canales', fCanales.join(','))
    fetch('/api/ventas/sell-in/opts?' + p).then(r => r.json()).then(j => {
      const opts = j.opts ?? []
      setClienteOpts(opts)
      setFClientes(prev => prev.filter(v => opts.includes(v)))
    })
  }, [buildPeriodParams, fPaises, fCanales])

  // ── NIVEL 1 producto — Categoría: siempre disponible ───────────────────────
  useEffect(() => {
    const p = buildPeriodParams(new URLSearchParams({ dim: 'categoria' }))
    if (fPaises.length) p.set('paises', fPaises.join(','))
    fetch('/api/ventas/sell-in/opts?' + p).then(r => r.json()).then(j => setCatOpts(j.opts ?? []))
  }, [buildPeriodParams, fPaises])

  // ── NIVEL 2 producto — SKU: requiere Categoría ──────────────────────────────
  useEffect(() => {
    if (!fCats.length) { setSkuOpts([]); setFSkus([]); return }
    const p = buildPeriodParams(new URLSearchParams({ dim: 'sku' }))
    p.set('categorias', fCats.join(','))
    if (fPaises.length)   p.set('paises',   fPaises.join(','))
    if (fCanales.length)  p.set('canales',  fCanales.join(','))
    if (fClientes.length) p.set('clientes', fClientes.join(','))
    fetch('/api/ventas/sell-in/opts?' + p).then(r => r.json()).then(j => {
      const opts = j.opts ?? []
      setSkuOpts(opts)
      setFSkus(prev => prev.filter(v => opts.includes(v)))
    })
  }, [buildPeriodParams, fPaises, fCanales, fClientes, fCats])

  // ── Fetch datos ─────────────────────────────────────────────────────────────
  const cargar = useCallback((
    anos: string[], meses: string[],
    paises: string[], cats: string[], clientes: string[], canales: string[], skus: string[],
    pg: number
  ) => {
    setLoading(true)
    const p = new URLSearchParams()
    if (anos.length)     p.set('anos',       anos.join(','))
    if (meses.length)    p.set('meses',      meses.join(','))
    if (paises.length)   p.set('paises',     paises.join(','))
    if (cats.length)     p.set('categorias', cats.join(','))
    if (clientes.length) p.set('clientes',   clientes.join(','))
    if (canales.length)  p.set('canales',    canales.join(','))
    if (skus.length)     p.set('skus',       skus.join(','))
    p.set('page',     String(pg))
    p.set('pageSize', String(PAGE_SIZE))

    fetch('/api/ventas/sell-in?' + p)
      .then(r => r.json())
      .then(j => {
        if (j.error) { showError(j.error || 'Error al cargar datos'); return }
        setRows((j.rows ?? []).map((r: Record<string, unknown>) => ({
          pais:            String(r.pais        ?? ''),
          cliente:         String(r.cliente     ?? ''),
          canal:           String(r.canal       ?? ''),
          sku:             String(r.sku         ?? ''),
          descripcion:     String(r.descripcion ?? ''),
          categoria:       String(r.categoria   ?? ''),
          unidades:        toNum(r.unidades),
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

  useEffect(() => { cargar([], [], [], [], [], [], [], 1) }, [cargar])

  const triggerCargar = (
    anos     = fAnos,    meses    = fMeses,
    paises   = fPaises,  cats     = fCats,
    clientes = fClientes, canales = fCanales,
    skus     = fSkus,    pg       = 1
  ) => { setPage(pg); cargar(anos, meses, paises, cats, clientes, canales, skus, pg) }

  const limpiar = () => {
    setFAnos([]); setFMeses([])
    setFPaises([]); setFCats([]); setFClientes([]); setFCanales([]); setFSkus([])
    setPage(1)
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
      sort.key === 'ingresos'  ? a.ingresos  - b.ingresos  :
      sort.key === 'unidades'  ? a.unidades  - b.unidades  :
                                 a.pct       - b.pct
    return sort.dir === 'asc' ? diff : -diff
  })

  const toggleSort = (key: SortKey) =>
    setSort(prev => prev.key === key
      ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
      : { key, dir: 'desc' })

  const arrow = (key: SortKey) => sort.key === key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ' ↕'

  // ── CSV ─────────────────────────────────────────────────────────────────────
  const descargarCSV = () => {
    const headers = ['País','Cliente','Canal','SKU','Producto','Categoría','Unidades','USD','Precio Prom.','% Total']
    const esc = (v: string | number) => {
      const s = String(v)
      return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = [
      headers.join(','),
      ...sorted.map(r => [
        r.pais, r.cliente, r.canal, r.sku, r.descripcion, r.categoria,
        r.unidades, r.ingresos.toFixed(2), r.precio_promedio.toFixed(4), r.pct.toFixed(2) + '%',
      ].map(esc).join(',')),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `sell_in_${fAnos.length ? fAnos.join('-') : 'todos'}_${fMeses.length ? fMeses.map(m => MESES[parseInt(m)]).join('-') : 'todos'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Meses disponibles = unión de meses para los años seleccionados (o todos si ninguno)
  const mesesDisp = fAnos.length
    ? [...new Set(fAnos.flatMap(a => mesMap[Number(a)] ?? []))].sort((a, b) => a - b)
    : [...new Set(Object.values(mesMap).flat())].sort((a, b) => a - b)
  const totalPages = Math.ceil(total / PAGE_SIZE)

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Dashboard Comercial</p>
          <h1 className="text-2xl font-bold text-gray-800">Ventas Sell In</h1>
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

        {/* Jerarquía geográfica: País → Canal → Cliente */}
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-2">Geografía / Comercial</p>
          <div className="flex items-start gap-1.5 flex-wrap">
            <div className="flex-1 min-w-[160px]">
              <MultiSelect
                label="País"
                options={paisOpts.map(p => ({ value: p, label: p }))}
                value={fPaises}
                onChange={v => {
                  setFPaises(v)
                  if (!v.length) { setFCanales([]); setFClientes([]) }
                  triggerCargar(fAnos, fMeses, v, fCats, [], [], fSkus)
                }}
                placeholder="Todos los países"
              />
            </div>
            <div className="flex items-center self-end pb-2 text-gray-300 text-sm select-none">›</div>
            <div className={`flex-1 min-w-[160px] transition-opacity ${!fPaises.length ? 'opacity-40 pointer-events-none' : ''}`}>
              <MultiSelect
                label={`Canal${!fPaises.length ? ' — selecciona País' : ''}`}
                options={canalOpts.map(c => ({ value: c, label: c }))}
                value={fCanales}
                onChange={v => {
                  setFCanales(v)
                  triggerCargar(fAnos, fMeses, fPaises, fCats, fClientes, v, fSkus)
                }}
                placeholder={fPaises.length ? 'Todos los canales' : '—'}
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
                  triggerCargar(fAnos, fMeses, fPaises, fCats, v, fCanales, fSkus)
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
                  triggerCargar(fAnos, fMeses, fPaises, v, fClientes, fCanales, [])
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
                  triggerCargar(fAnos, fMeses, fPaises, fCats, fClientes, fCanales, v)
                }}
                placeholder={fCats.length ? 'Todos los SKUs' : '—'}
              />
            </div>
            {/* spacer para alinear con la fila de arriba */}
            <div className="flex items-center self-end pb-2 text-transparent text-sm select-none">›</div>
            <div className="flex-1 min-w-[160px]" />
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 border-l-4 border-l-amber-500">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Ingresos Totales</p>
          <p className="text-2xl font-bold text-gray-800">{loading ? '...' : fmt(kpi?.total_ingresos ?? 0)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 border-l-4 border-l-blue-500">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Unidades Totales</p>
          <p className="text-2xl font-bold text-gray-800">{loading ? '...' : (kpi?.total_unidades ?? 0).toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 border-l-4 border-l-green-500">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Clientes Activos</p>
          <p className="text-2xl font-bold text-gray-800">{loading ? '...' : (kpi?.total_clientes ?? 0).toLocaleString()}</p>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-700">
            Detalle Sell In
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
                        <th className="text-left py-2 pr-3">País</th>
                        <th className="text-left py-2 pr-3">Cliente</th>
                        <th className="text-left py-2 pr-3">Canal</th>
                        <th className="text-left py-2 pr-3">SKU</th>
                        <th className="text-left py-2 pr-3">Producto</th>
                        <th className="text-left py-2 pr-3">Categoría</th>
                        <th
                          className="text-right py-2 pr-3 cursor-pointer hover:text-gray-600 select-none"
                          onClick={() => toggleSort('unidades')}
                        >Unidades{arrow('unidades')}</th>
                        <th
                          className="text-right py-2 pr-3 cursor-pointer hover:text-gray-600 select-none"
                          onClick={() => toggleSort('ingresos')}
                        >USD{arrow('ingresos')}</th>
                        <th className="text-right py-2 pr-3">P. Prom.</th>
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
                          <td className="py-1.5 pr-3 text-gray-500">{r.canal}</td>
                          <td className="py-1.5 pr-3 font-mono text-gray-500">{r.sku}</td>
                          <td className="py-1.5 pr-3 text-gray-700 max-w-[160px] truncate">{r.descripcion}</td>
                          <td className="py-1.5 pr-3 text-gray-600">{r.categoria}</td>
                          <td className="py-1.5 pr-3 text-right text-gray-700">{r.unidades.toLocaleString()}</td>
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
                      onClick={() => { const pg = page - 1; setPage(pg); cargar(fAnos, fMeses, fPaises, fCats, fClientes, fCanales, fSkus, pg) }}
                      disabled={page === 1}
                      className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg disabled:opacity-40 hover:bg-gray-200"
                    >← Anterior</button>
                    <span className="text-sm text-gray-500">Página {page} de {totalPages}</span>
                    <button
                      onClick={() => { const pg = page + 1; setPage(pg); cargar(fAnos, fMeses, fPaises, fCats, fClientes, fCanales, fSkus, pg) }}
                      disabled={page === totalPages}
                      className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg disabled:opacity-40 hover:bg-gray-200"
                    >Siguiente →</button>
                  </div>
                )}
              </>
        }
      </div>
    </div>
  )
}
