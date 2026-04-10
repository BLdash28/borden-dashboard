'use client'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { RefreshCw, ChevronRight, X, Download } from 'lucide-react'
import LineChartPro, { type LineDef } from '@/components/dashboard/LineChartPro'
import MultiSelect from '@/components/dashboard/MultiSelect'
import React from 'react'

const MESES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const PAIS_COLORS: Record<string, string> = {
  CO: '#c8873a', CR: '#2a7a58', GT: '#3a6fa8',
  HN: '#6b4fa8', NI: '#c0402f', SV: '#2a8a8a',
}
const PAIS_LIST = ['CO', 'CR', 'GT', 'HN', 'NI', 'SV']

const fmt  = (n: number) =>
  isNaN(n) ? '$0' :
  n >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'M' :
  n >= 1e3 ? '$' + (n / 1e3).toFixed(1) + 'K' :
  '$' + n.toFixed(0)
const fmtP = (n: number) => isNaN(n) || !n ? '—' : '$' + n.toFixed(2)
const toNum = (v: any): number => { const n = parseFloat(String(v)); return isNaN(n) ? 0 : n }

type SortCol = 'total_valor' | 'total_unidades' | 'precio' | 'pct'

interface DiaRow {
  pais: string; dia: number; mes?: number; ano?: number
  ventas_valor: number; ventas_unidades: number
}
interface PaisKpi { pais: string; total_valor: number; total_unidades: number }
interface SkuRow  { descripcion: string; codigo_barras: string; sku: string; ventas_valor: number; ventas_unidades: number }

export default function VentasPaisPage() {
  const [mesMap, setMesMap] = useState<Record<number, number[]>>({})
  const [anos,   setAnos]   = useState<number[]>([])

  // Filtros
  const [fPaises,   setFPaises]   = useState<string[]>([])
  const [fCats,     setFCats]     = useState<string[]>([])
  const [fSubcats,  setFSubcats]  = useState<string[]>([])
  const [fClientes, setFClientes] = useState<string[]>([])
  const [fAno,      setFAno]      = useState('')
  const [fMes,      setFMes]      = useState('')

  // Opciones cascading
  const [catOpts,     setCatOpts]     = useState<string[]>([])
  const [subcatOpts,  setSubcatOpts]  = useState<string[]>([])
  const [clienteOpts, setClienteOpts] = useState<string[]>([])

  // Datos
  const [rows,    setRows]    = useState<DiaRow[]>([])
  const [kpis,    setKpis]    = useState<PaisKpi[]>([])
  const [modo,    setModo]    = useState<'mes'|'ano'|'todos'>('todos')
  const [loading, setLoading] = useState(true)

  // Vista del gráfico
  const [chartVista, setChartVista] = useState<'mensual' | 'diaria'>('mensual')

  // Ordenamiento tabla
  const [sortCol, setSortCol] = useState<SortCol>('total_valor')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // SKU drill-down
  const [expandedPais, setExpandedPais] = useState<string | null>(null)
  const [skuCache,     setSkuCache]     = useState<Record<string, SkuRow[]>>({})
  const [skuLoading,   setSkuLoading]   = useState(false)

  const initDone  = useRef(false)
  const debounceT = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Períodos disponibles ──────────────────────────────
  useEffect(() => {
    if (initDone.current) return
    initDone.current = true
    fetch('/api/ventas/resumen?tipo=periodos')
      .then(r => r.json())
      .then(j => {
        const mm: Record<number, number[]> = {}
        ;(j.periodos || []).forEach((p: any) => {
          const a = Number(p.ano)
          if (!mm[a]) mm[a] = []
          mm[a].push(Number(p.mes))
        })
        Object.keys(mm).forEach(a => mm[Number(a)].sort((x, y) => x - y))
        setMesMap(mm)
        setAnos(Object.keys(mm).map(Number).sort((a, b) => b - a))
      })
  }, [])

  // ── Opciones categoría (cascade de fPaises) ──────────
  useEffect(() => {
    const p = new URLSearchParams({ dim: 'categoria' })
    if (fPaises.length) p.set('paises', fPaises.join(','))
    fetch('/api/ventas/dimension?' + p.toString())
      .then(r => r.json())
      .then(j => {
        const opts = (j.rows || []).map((r: any) => r.nombre).filter(Boolean)
        setCatOpts(opts)
        setFCats(prev => prev.filter(c => opts.includes(c)))
      })
      .catch(console.error)
  }, [fPaises]) // eslint-disable-line

  // ── Opciones subcategoría (cascade de fPaises + fCats, lazy) ────────────
  useEffect(() => {
    if (!fPaises.length && !fCats.length) { setSubcatOpts([]); setFSubcats([]); return }
    const p = new URLSearchParams({ dim: 'subcategoria' })
    if (fPaises.length) p.set('paises',     fPaises.join(','))
    if (fCats.length)   p.set('categorias', fCats.join(','))
    fetch('/api/ventas/dimension?' + p.toString())
      .then(r => r.json())
      .then(j => {
        const opts = (j.rows || []).map((r: any) => r.nombre).filter(Boolean)
        setSubcatOpts(opts)
        setFSubcats(prev => prev.filter(s => opts.includes(s)))
      })
      .catch(console.error)
  }, [fPaises, fCats]) // eslint-disable-line

  // ── Opciones cliente (cascade de fPaises + fCats + fSubcats, lazy) ───────
  useEffect(() => {
    if (!fPaises.length && !fCats.length) { setClienteOpts([]); setFClientes([]); return }
    const p = new URLSearchParams({ dim: 'cliente' })
    if (fPaises.length)  p.set('paises',       fPaises.join(','))
    if (fCats.length)    p.set('categorias',    fCats.join(','))
    if (fSubcats.length) p.set('subcategorias', fSubcats.join(','))
    fetch('/api/ventas/dimension?' + p.toString())
      .then(r => r.json())
      .then(j => {
        const opts = (j.rows || []).map((r: any) => r.nombre).filter(Boolean)
        setClienteOpts(opts)
        setFClientes(prev => prev.filter(c => opts.includes(c)))
      })
      .catch(console.error)
  }, [fPaises, fCats, fSubcats]) // eslint-disable-line

  // ── Carga principal ───────────────────────────────────
  const cargar = useCallback((
    ano: string, mes: string,
    paises: string[], cats: string[], subcats: string[], clientes: string[]
  ) => {
    setLoading(true)
    const p = new URLSearchParams()
    if (ano)           p.set('ano',           ano)
    if (mes)           p.set('mes',           mes)
    if (paises.length) p.set('pais',          paises.join(','))
    if (cats.length)   p.set('categorias',    cats.join(','))
    if (subcats.length) p.set('subcategorias', subcats.join(','))
    if (clientes.length) p.set('clientes',    clientes.join(','))

    fetch('/api/ventas/pais?' + p.toString())
      .then(r => r.json())
      .then(j => {
        if (j.error) { console.error(j.error); return }
        const parsed: DiaRow[] = (j.rows || []).map((row: any) => ({
          pais:            String(row.pais || ''),
          dia:             toNum(row.dia),
          mes:             row.mes  != null ? toNum(row.mes)  : undefined,
          ano:             row.ano  != null ? toNum(row.ano)  : undefined,
          ventas_valor:    toNum(row.ventas_valor),
          ventas_unidades: toNum(row.ventas_unidades),
        }))
        setRows(parsed)
        const kpiMap: Record<string, PaisKpi> = {}
        parsed.forEach(row => {
          if (!kpiMap[row.pais]) kpiMap[row.pais] = { pais: row.pais, total_valor: 0, total_unidades: 0 }
          kpiMap[row.pais].total_valor    += row.ventas_valor
          kpiMap[row.pais].total_unidades += row.ventas_unidades
        })
        setKpis(Object.values(kpiMap).sort((a, b) => b.total_valor - a.total_valor))
        setModo(j.modo === 'ano' ? 'ano' : j.modo === 'mes' ? 'mes' : 'todos')
        setExpandedPais(null)
        setSkuCache({})
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { cargar('', '', [], [], [], []) }, [cargar])

  const trigger = (
    ano: string, mes: string,
    paises: string[], cats: string[], subcats: string[], clientes: string[]
  ) => {
    if (debounceT.current) clearTimeout(debounceT.current)
    debounceT.current = setTimeout(() => cargar(ano, mes, paises, cats, subcats, clientes), 300)
  }

  const togglePais = (p: string) => {
    const next = fPaises.includes(p) ? fPaises.filter(x => x !== p) : [...fPaises, p]
    setFPaises(next)
    trigger(fAno, fMes, next, fCats, fSubcats, fClientes)
  }

  const onCats = (v: string[]) => {
    setFCats(v)
    trigger(fAno, fMes, fPaises, v, fSubcats, fClientes)
  }
  const onSubcats = (v: string[]) => {
    setFSubcats(v)
    trigger(fAno, fMes, fPaises, fCats, v, fClientes)
  }
  const onClientes = (v: string[]) => {
    setFClientes(v)
    trigger(fAno, fMes, fPaises, fCats, fSubcats, v)
  }
  const onAno = (v: string) => {
    setFAno(v); setFMes('')
    trigger(v, '', fPaises, fCats, fSubcats, fClientes)
  }
  const onMes = (v: string) => {
    setFMes(v)
    trigger(fAno, v, fPaises, fCats, fSubcats, fClientes)
  }

  const limpiar = () => {
    setFPaises([]); setFCats([]); setFSubcats([]); setFClientes([])
    setFAno(''); setFMes('')
    setExpandedPais(null); setSkuCache({})
    cargar('', '', [], [], [], [])
  }

  const fetchSkus = async (pais: string) => {
    if (expandedPais === pais) { setExpandedPais(null); return }
    setExpandedPais(pais)
    if (skuCache[pais]) return
    setSkuLoading(true)
    const p = new URLSearchParams({ tipo: 'skus', pais })
    if (fAno)             p.set('ano', fAno)
    if (fMes)             p.set('mes', fMes)
    if (fCats.length)     p.set('categorias', fCats.join(','))
    if (fSubcats.length)  p.set('subcategorias', fSubcats.join(','))
    if (fClientes.length) p.set('clientes', fClientes.join(','))
    const j = await fetch('/api/ventas/pais?' + p.toString()).then(r => r.json())
    setSkuCache(prev => ({
      ...prev,
      [pais]: (j.rows || []).map((r: any) => ({
        descripcion:     String(r.descripcion || ''),
        codigo_barras:   String(r.codigo_barras || ''),
        sku:             String(r.sku || ''),
        ventas_valor:    toNum(r.ventas_valor),
        ventas_unidades: toNum(r.ventas_unidades),
      }))
    }))
    setSkuLoading(false)
  }

  // ── CSV download ──────────────────────────────────────
  const descargarCSV = () => {
    const total = kpis.reduce((s, k) => s + k.total_valor, 0)
    const headers = ['País', 'USD Total', 'Unidades', 'Precio Promedio', '% Total']
    const filas = kpisSorted.map(k => {
      const precio = k.total_unidades > 0 ? (k.total_valor / k.total_unidades).toFixed(4) : '0'
      const pct    = total > 0 ? ((k.total_valor / total) * 100).toFixed(2) + '%' : '0%'
      return [k.pais, k.total_valor.toFixed(2), k.total_unidades, precio, pct]
    })
    const csv  = [headers, ...filas].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    const period = fAno ? (fMes ? `${fAno}-${String(fMes).padStart(2, '0')}` : fAno) : 'todos'
    a.download = `ventas-por-pais-${period}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Períodos con venta por país ───────────────────────
  const periodosPorPais = useMemo(() => {
    const map: Record<string, number> = {}
    if (!rows.length) return map
    const sets: Record<string, Set<string>> = {}
    rows.forEach(r => {
      if (!sets[r.pais]) sets[r.pais] = new Set()
      const key = modo === 'mes' ? String(r.dia)
        : modo === 'ano' ? String(r.mes)
        : `${r.ano}-${r.mes}`
      sets[r.pais].add(key)
    })
    Object.entries(sets).forEach(([p, s]) => { map[p] = s.size })
    return map
  }, [rows, modo])

  const periodoLabel = modo === 'mes' ? 'días' : 'meses'

  // ── Chart data ────────────────────────────────────────
  const mesesDisp     = fAno ? (mesMap[Number(fAno)] || []) : []
  const titulo        = !fAno && !fMes ? 'Toda la historia'
    : fAno && !fMes ? 'Año ' + fAno + ' completo'
    : fAno && fMes  ? MESES[parseInt(fMes)] + ' ' + fAno
    : 'Período'
  const paisesEnDatos = Array.from(new Set(rows.map(r => r.pais))).sort()
  const paisLabel     = fPaises.length === 0 ? 'Todos'
    : fPaises.length <= 3 ? fPaises.join(', ')
    : `${fPaises.length} países`

  const chartData = useMemo(() => {
    if (chartVista === 'mensual') {
      type R = { ano?: number; mes?: number; pais: string; ventas_valor: number }
      const periodos = Array.from(
        new Map((rows as R[]).map(r => [r.ano + '-' + r.mes, { ano: r.ano!, mes: r.mes! }])).values()
      ).sort((a, b) => a.ano !== b.ano ? a.ano - b.ano : a.mes - b.mes)
      return periodos.map(({ ano, mes }) => {
        const label = MESES[mes] + ' ' + String(ano).slice(2)
        const punto: Record<string, any> = { dia: label }
        ;(rows as R[]).filter(r => r.ano === ano && r.mes === mes)
          .forEach(r => { punto[r.pais] = (punto[r.pais] || 0) + r.ventas_valor })
        return punto
      })
    }
    // Vista diaria
    if (modo === 'mes') {
      const diasUnicos = Array.from(new Set(rows.map(r => r.dia))).sort((a, b) => a - b)
      return diasUnicos.map(dia => {
        const punto: Record<string, any> = { dia }
        rows.filter(r => r.dia === dia).forEach(r => { punto[r.pais] = r.ventas_valor })
        return punto
      })
    }
    type R = { mes?: number; dia: number; pais: string; ventas_valor: number }
    const dateKeys = Array.from(new Set((rows as R[]).map(r => `${r.mes!}-${r.dia}`))).sort((a, b) => {
      const [am, ad] = a.split('-').map(Number)
      const [bm, bd] = b.split('-').map(Number)
      return am !== bm ? am - bm : ad - bd
    })
    return dateKeys.map(key => {
      const [mesNum, diaNum] = key.split('-').map(Number)
      const punto: Record<string, any> = { dia: `${diaNum} ${MESES[mesNum]}` }
      ;(rows as R[]).filter(r => r.mes === mesNum && r.dia === diaNum)
        .forEach(r => { if (!punto[r.pais]) punto[r.pais] = 0; punto[r.pais] += r.ventas_valor })
      return punto
    })
  }, [rows, chartVista, modo])

  const isDiaria   = chartVista === 'diaria'
  const xInterval  = !isDiaria ? 0 : Math.max(Math.ceil(chartData.length / 12) - 1, 0)
  const totalValor = kpis.reduce((s, k) => s + k.total_valor, 0)

  // ── Ordenamiento tabla ────────────────────────────────
  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortCol(col); setSortDir('desc') }
  }
  const sortIcon = (col: SortCol) =>
    sortCol !== col ? ' ↕' : sortDir === 'desc' ? ' ↓' : ' ↑'

  const kpisSorted = useMemo(() => {
    return [...kpis].sort((a, b) => {
      const val = (k: PaisKpi) =>
        sortCol === 'total_valor'    ? k.total_valor :
        sortCol === 'total_unidades' ? k.total_unidades :
        sortCol === 'precio'         ? (k.total_unidades > 0 ? k.total_valor / k.total_unidades : 0) :
        totalValor > 0               ? (k.total_valor / totalValor) * 100 : 0
      return sortDir === 'desc' ? val(b) - val(a) : val(a) - val(b)
    })
  }, [kpis, sortCol, sortDir, totalValor])

  // ─────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--t3)' }}>Dashboard Comercial</p>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--t1)' }}>Ventas Diarias por País</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={limpiar}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--t2)' }}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
          <button onClick={descargarCSV} disabled={kpis.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all disabled:opacity-40"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--t2)' }}>
            <Download size={14} />
            Descargar CSV
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[9px] tracking-[2px] uppercase font-semibold" style={{ color: 'var(--t3)' }}>Filtros</p>
          <button onClick={limpiar} className="text-[10px] hover:opacity-70 transition-opacity" style={{ color: 'var(--t3)' }}>
            Limpiar todo
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">

          {/* País */}
          <MultiSelect
            label="País"
            options={PAIS_LIST.map(p => ({ value: p, label: p }))}
            value={fPaises}
            onChange={v => { setFPaises(v); trigger(fAno, fMes, v, fCats, fSubcats, fClientes) }}
            placeholder="Todos los países"
            selectAllLabel="Todos los países"
          />

          {/* Cliente (cascade de País) */}
          <MultiSelect
            label={fPaises.length > 0 ? 'Cliente · filtrado por país 🔗' : 'Cliente'}
            options={clienteOpts.map(c => ({ value: c, label: c }))}
            value={fClientes}
            onChange={onClientes}
            placeholder="Todos los clientes"
            selectAllLabel="Todos los clientes"
          />

          {/* Categoría */}
          <MultiSelect
            label="Categoría"
            options={catOpts.map(c => ({ value: c, label: c }))}
            value={fCats}
            onChange={onCats}
            placeholder="Todas las categorías"
            selectAllLabel="Todas las categorías"
          />

          {/* Subcategoría (cascade de Categoría) */}
          <MultiSelect
            label={fCats.length > 0 ? 'Subcategoría · filtrado por cat. 🔗' : 'Subcategoría'}
            options={subcatOpts.map(s => ({ value: s, label: s }))}
            value={fSubcats}
            onChange={onSubcats}
            placeholder="Todas"
            selectAllLabel="Todas las subcategorías"
          />

          {/* Año */}
          <div>
            <div className="text-[10px] uppercase tracking-widest font-medium mb-1.5" style={{ color: 'var(--t3)' }}>Año</div>
            <select value={fAno} onChange={e => onAno(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-[12px] border transition-all"
              style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: fAno ? 'var(--t1)' : 'var(--t3)' }}>
              <option value="">Todos</option>
              {anos.map(a => <option key={a} value={String(a)}>{a}</option>)}
            </select>
          </div>

          {/* Mes */}
          <div>
            <div className="text-[10px] uppercase tracking-widest font-medium mb-1.5" style={{ color: 'var(--t3)' }}>Mes</div>
            <select value={fMes} onChange={e => onMes(e.target.value)} disabled={!fAno}
              className="w-full px-3 py-2 rounded-lg text-[12px] border transition-all disabled:opacity-40"
              style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: fMes ? 'var(--t1)' : 'var(--t3)' }}>
              <option value="">Todos</option>
              {mesesDisp.map(m => <option key={m} value={String(m)}>{MESES[m]}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Cards de País */}
      <div>
        <p className="text-[10px] uppercase tracking-widest mb-3" style={{ color: 'var(--t3)' }}>
          Selecciona un país para filtrar · {titulo}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {loading
            ? PAIS_LIST.map(p => (
                <div key={p} className="card p-4 animate-pulse">
                  <div className="h-3 w-8 rounded mb-3" style={{ background: 'var(--border)' }} />
                  <div className="h-6 w-20 rounded mb-2" style={{ background: 'var(--border)' }} />
                  <div className="h-3 w-16 rounded" style={{ background: 'var(--border)' }} />
                </div>
              ))
            : (() => {
                const kpiMap      = Object.fromEntries(kpis.map(k => [k.pais, k]))
                const haySeleccion = fPaises.length > 0
                return PAIS_LIST.map(p => {
                  const k        = kpiMap[p]
                  const isActive = fPaises.includes(p)
                  const isDimmed = haySeleccion && !isActive
                  const color    = PAIS_COLORS[p]
                  const precio   = k && k.total_unidades > 0 ? k.total_valor / k.total_unidades : 0
                  const periodos = periodosPorPais[p] ?? 0
                  const pct      = k && totalValor > 0 ? (k.total_valor / totalValor) * 100 : 0
                  return (
                    <button key={p} onClick={() => togglePais(p)}
                      className="group relative text-left rounded-xl border p-4 transition-all duration-200 focus:outline-none"
                      style={{
                        background:  isActive ? color + '15' : 'var(--surface)',
                        borderColor: isActive ? color : 'var(--border)',
                        borderWidth: isActive ? 2 : 1,
                        opacity:     isDimmed ? 0.4 : 1,
                        transform:   isActive ? 'scale(1.02)' : 'scale(1)',
                        boxShadow:   isActive ? `0 4px 20px ${color}30` : undefined,
                      }}>
                      {isActive && (
                        <span className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
                          style={{ background: color }}>✓</span>
                      )}
                      <div className="flex items-center gap-1.5 mb-3">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                        <span className="text-xs font-bold uppercase tracking-wider" style={{ color }}>{p}</span>
                      </div>
                      {k ? (
                        <>
                          <p className="text-[22px] font-bold leading-tight mb-0.5" style={{ color: 'var(--t1)' }}>
                            {fmt(k.total_valor)}
                          </p>
                          <p className="text-[11px] mb-3" style={{ color: 'var(--t3)' }}>
                            {k.total_unidades.toLocaleString()} uds
                          </p>
                          <div className="mb-3">
                            <div className="flex justify-between text-[10px] mb-0.5" style={{ color: 'var(--t3)' }}>
                              <span>% total</span>
                              <span className="font-semibold" style={{ color }}>{pct.toFixed(1)}%</span>
                            </div>
                            <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                              <div className="h-full rounded-full transition-all duration-700"
                                style={{ width: pct + '%', background: color }} />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                            <div>
                              <p className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--t3)' }}>Precio prom.</p>
                              <p className="text-[13px] font-semibold" style={{ color: 'var(--t2)' }}>{fmtP(precio)}</p>
                            </div>
                            <div>
                              <p className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--t3)' }}>{periodoLabel}</p>
                              <p className="text-[13px] font-semibold" style={{ color: 'var(--t2)' }}>{periodos}</p>
                            </div>
                          </div>
                        </>
                      ) : (
                        <p className="text-[13px] py-3" style={{ color: 'var(--t3)' }}>Sin datos</p>
                      )}
                    </button>
                  )
                })
              })()
          }
        </div>

        {/* Tags países activos */}
        {fPaises.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {fPaises.map(p => (
              <span key={p} className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ background: PAIS_COLORS[p] + '20', color: PAIS_COLORS[p] }}>
                {p}
                <button onClick={() => togglePais(p)} className="hover:opacity-60"><X size={10} /></button>
              </span>
            ))}
            <button onClick={() => { setFPaises([]); trigger(fAno, fMes, [], fCats, fSubcats, fClientes) }}
              className="text-[11px] px-2 py-1 underline" style={{ color: 'var(--t3)' }}>
              Ver todos
            </button>
          </div>
        )}
      </div>

      {/* Gráfico */}
      <div className="card p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-semibold text-[14px]" style={{ color: 'var(--t1)' }}>Ventas por País</h3>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--t3)' }}>USD · {titulo}</p>
          </div>
          <div className="flex gap-1 rounded-lg p-0.5" style={{ background: 'var(--bg)' }}>
            <button onClick={() => setChartVista('mensual')}
              className="px-3 py-1.5 text-[11px] font-semibold rounded-md transition-all"
              style={chartVista === 'mensual'
                ? { background: 'var(--surface)', color: 'var(--acc)', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }
                : { color: 'var(--t3)' }}>
              Mensual
            </button>
            <button onClick={() => setChartVista('diaria')}
              className="px-3 py-1.5 text-[11px] font-semibold rounded-md transition-all"
              style={chartVista === 'diaria'
                ? { background: 'var(--surface)', color: 'var(--acc)', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }
                : { color: 'var(--t3)' }}>
              Diaria
            </button>
          </div>
        </div>
        {loading
          ? <div className="h-72 flex items-center justify-center text-[13px]" style={{ color: 'var(--t3)' }}>Cargando...</div>
          : chartData.length === 0
            ? <div className="h-72 flex items-center justify-center text-[13px]" style={{ color: 'var(--t3)' }}>Sin datos</div>
            : <LineChartPro
                data={chartData}
                nameKey="dia"
                lines={paisesEnDatos.map(p => ({ key: p, color: PAIS_COLORS[p] || '#999', label: p }) as LineDef)}
                height={320}
                formatter={fmt}
                xTickFmt={(v: any) => (!isDiaria || modo !== 'mes') ? String(v) : 'D' + v}
                xInterval={xInterval}
                xAngle={isDiaria ? -40 : 0}
                dot={!isDiaria || chartData.length <= 31}
                margin={{ top: 4, right: 16, left: 4, bottom: isDiaria ? 56 : 4 }}
              />
        }
      </div>

      {/* Tabla resumen por país */}
      <div className="card p-5">
        <h3 className="font-semibold text-[14px] mb-1" style={{ color: 'var(--t1)' }}>Resumen por País</h3>
        <p className="text-[11px] mb-4" style={{ color: 'var(--t3)' }}>{titulo} · haz clic en una fila para ver los top SKUs</p>
        {loading
          ? <p className="text-[12px]" style={{ color: 'var(--t3)' }}>Cargando...</p>
          : kpis.length === 0
            ? <p className="text-[12px]" style={{ color: 'var(--t3)' }}>Sin datos</p>
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest border-b" style={{ borderColor: 'var(--border)', color: 'var(--t3)' }}>
                      <th className="w-8 py-2" />
                      <th className="text-left py-2 pr-4">País</th>
                      <th className="text-right py-2 pr-4 cursor-pointer select-none whitespace-nowrap"
                        style={{ color: sortCol === 'total_valor' ? 'var(--acc)' : 'var(--t3)' }}
                        onClick={() => toggleSort('total_valor')}>
                        Ventas USD{sortIcon('total_valor')}
                      </th>
                      <th className="text-right py-2 pr-4 cursor-pointer select-none whitespace-nowrap"
                        style={{ color: sortCol === 'total_unidades' ? 'var(--acc)' : 'var(--t3)' }}
                        onClick={() => toggleSort('total_unidades')}>
                        Unidades{sortIcon('total_unidades')}
                      </th>
                      <th className="text-right py-2 pr-4 cursor-pointer select-none whitespace-nowrap"
                        style={{ color: sortCol === 'precio' ? 'var(--acc)' : 'var(--t3)' }}
                        onClick={() => toggleSort('precio')}>
                        Precio Prom.{sortIcon('precio')}
                      </th>
                      <th className="text-right py-2 cursor-pointer select-none whitespace-nowrap"
                        style={{ color: sortCol === 'pct' ? 'var(--acc)' : 'var(--t3)' }}
                        onClick={() => toggleSort('pct')}>
                        % Total{sortIcon('pct')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpisSorted.map(k => {
                      const isExp  = expandedPais === k.pais
                      const skus   = skuCache[k.pais] ?? []
                      const pct    = totalValor > 0 ? (k.total_valor / totalValor) * 100 : 0
                      const precio = k.total_unidades > 0 ? k.total_valor / k.total_unidades : 0
                      return (
                        <React.Fragment key={k.pais}>
                          <tr className="border-b cursor-pointer transition-colors hover:bg-white/5"
                            style={{ borderColor: 'var(--border)' }}
                            onClick={() => fetchSkus(k.pais)}>
                            <td className="py-2.5 pl-2">
                              {isExp
                                ? <ChevronRight size={14} className="rotate-90" style={{ color: 'var(--acc)' }} />
                                : <ChevronRight size={14} style={{ color: 'var(--t3)' }} />}
                            </td>
                            <td className="py-2.5 pr-4">
                              <span className="font-bold text-[11px] px-2 py-0.5 rounded"
                                style={{ background: (PAIS_COLORS[k.pais] || '#999') + '20', color: PAIS_COLORS[k.pais] || '#999' }}>
                                {k.pais}
                              </span>
                            </td>
                            <td className="py-2.5 pr-4 text-right font-semibold"
                              style={{ color: sortCol === 'total_valor' ? 'var(--t1)' : 'var(--t2)' }}>
                              {fmt(k.total_valor)}
                            </td>
                            <td className="py-2.5 pr-4 text-right"
                              style={{ color: sortCol === 'total_unidades' ? 'var(--t1)' : 'var(--t2)' }}>
                              {k.total_unidades.toLocaleString()}
                            </td>
                            <td className="py-2.5 pr-4 text-right"
                              style={{ color: sortCol === 'precio' ? 'var(--t1)' : 'var(--t2)' }}>
                              {fmtP(precio)}
                            </td>
                            <td className="py-2.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 rounded-full h-1.5 overflow-hidden" style={{ background: 'var(--border)' }}>
                                  <div className="h-1.5 rounded-full transition-all"
                                    style={{ width: pct + '%', background: PAIS_COLORS[k.pais] || '#999' }} />
                                </div>
                                <span className="w-10 text-right" style={{ color: sortCol === 'pct' ? 'var(--t1)' : 'var(--t2)' }}>
                                  {pct.toFixed(1)}%
                                </span>
                              </div>
                            </td>
                          </tr>

                          {isExp && (
                            <tr>
                              <td colSpan={6} className="p-0">
                                <div className="px-10 py-3 border-b" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
                                  {skuLoading && !skus.length
                                    ? <p className="text-[11px] py-2 animate-pulse" style={{ color: 'var(--t3)' }}>Cargando SKUs...</p>
                                    : skus.length === 0
                                    ? <p className="text-[11px] py-2" style={{ color: 'var(--t3)' }}>Sin datos de SKU</p>
                                    : (
                                      <table className="w-full text-[11px]">
                                        <thead>
                                          <tr className="text-[10px] uppercase tracking-widest border-b" style={{ borderColor: 'var(--border)', color: 'var(--t3)' }}>
                                            <th className="text-left py-1.5 pr-3">#</th>
                                            <th className="text-left py-1.5 pr-3">Código</th>
                                            <th className="text-left py-1.5 pr-4">Descripción</th>
                                            <th className="text-right py-1.5 pr-4">Ventas USD</th>
                                            <th className="text-right py-1.5 pr-4">Unidades</th>
                                            <th className="text-right py-1.5">% del país</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {skus.map((s, i) => (
                                            <tr key={i} className="border-b hover:bg-white/5" style={{ borderColor: 'var(--border)' }}>
                                              <td className="py-1.5 pr-3" style={{ color: 'var(--t3)' }}>{i + 1}</td>
                                              <td className="py-1.5 pr-3 font-mono" style={{ color: 'var(--t3)' }}>{s.codigo_barras || s.sku || '—'}</td>
                                              <td className="py-1.5 pr-4 max-w-xs" style={{ color: 'var(--t2)' }}>
                                                <span className="block truncate">{s.descripcion || '—'}</span>
                                              </td>
                                              <td className="py-1.5 pr-4 text-right font-semibold" style={{ color: 'var(--t1)' }}>{fmt(s.ventas_valor)}</td>
                                              <td className="py-1.5 pr-4 text-right" style={{ color: 'var(--t2)' }}>{s.ventas_unidades.toLocaleString()}</td>
                                              <td className="py-1.5 text-right" style={{ color: 'var(--t2)' }}>
                                                {k.total_valor > 0 ? ((s.ventas_valor / k.total_valor) * 100).toFixed(1) + '%' : '0%'}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    )
                                  }
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
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
