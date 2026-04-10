'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  RefreshCw, Globe2, Store, ChevronRight, ChevronLeft,
  TrendingUp, Package, BarChart2, AlertTriangle, X,
} from 'lucide-react'
import BarChartPro from '@/components/dashboard/BarChartPro'
import { useDashboardFilters } from '@/lib/context/DashboardFilters'

const MESES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const COLORS = ['#c8873a','#2a7a58','#3a6fa8','#6b4fa8','#c0402f','#2a8a8a','#a86a2a','#1a6a48']

const fmtU = (n: number) =>
  isNaN(n) || !isFinite(n) ? '0' : n.toLocaleString('en-US')

const toNum = (v: any) => { const n = parseFloat(String(v)); return isNaN(n) ? 0 : n }

const sel = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-40 disabled:cursor-not-allowed'

type Nivel = 'pais' | 'cadena' | 'tienda'

interface GeoRow {
  nombre:          string
  ventas_unidades: number
  n_productos:     number
  n_sub:           number
}

interface Breadcrumb { nivel: Nivel; label: string; value: string }

const NIVEL_LABELS: Record<Nivel, string> = {
  pais:   'País',
  cadena: 'Cadena',
  tienda: 'Punto de Venta',
}
const NIVEL_ICONS: Record<Nivel, JSX.Element> = {
  pais:   <Globe2 size={14}/>,
  cadena: <BarChart2 size={14}/>,
  tienda: <Store size={14}/>,
}
const NIVEL_NEXT: Record<Nivel, Nivel | null> = {
  pais:   'cadena',
  cadena: 'tienda',
  tienda: null,
}

export default function MercadeoGeograficaPage() {
  const { catsOpts, anosOpts, periodos } = useDashboardFilters()

  // ── Drill-down state ─────────────────────────────────────
  const [nivel,       setNivel]       = useState<Nivel>('pais')
  const [paisSel,     setPaisSel]     = useState<string | null>(null)
  const [cadenaSel,   setCadenaSel]   = useState<string | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([])

  // ── Filtros ──────────────────────────────────────────────
  const [fCat,  setFCat]  = useState('Todas')
  const [fAno,  setFAno]  = useState('')
  const [fMes,  setFMes]  = useState('')
  const [fBusq, setFBusq] = useState('')

  // ── Opciones jerárquicas ─────────────────────────────────
  const [opcionesPais,   setOpcionesPais]   = useState<string[]>([])
  const [opcionesCadena, setOpcionesCadena] = useState<string[]>([])
  const [opcionesTienda, setOpcionesTienda] = useState<string[]>([])
  const [loadingOpts,    setLoadingOpts]    = useState(false)

  // Selecciones de los selectores (independientes del drill-down click)
  const [selPais,   setSelPais]   = useState('')
  const [selCadena, setSelCadena] = useState('')
  const [selTienda, setSelTienda] = useState('')

  // ── Meses disponibles según año ──────────────────────────
  const mesMap = useMemo(() => {
    const mm: Record<number, number[]> = {}
    periodos.forEach(p => {
      if (!mm[p.ano]) mm[p.ano] = []
      mm[p.ano].push(p.mes)
    })
    Object.keys(mm).forEach(a => mm[Number(a)].sort((x, y) => x - y))
    return mm
  }, [periodos])

  // ── Datos ────────────────────────────────────────────────
  const [rows,     setRows]     = useState<GeoRow[]>([])
  const [subLabel, setSubLabel] = useState('cadenas')
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  // ── Fetch opciones jerárquicas ───────────────────────────
  const fetchOpciones = useCallback(async (
    nivelOpc: Nivel,
    paisOpc?: string,
    cadenaOpc?: string,
    ano?: string,
    mes?: string,
  ) => {
    setLoadingOpts(true)
    const p = new URLSearchParams({ nivel: nivelOpc })
    if (paisOpc)   p.set('pais',   paisOpc)
    if (cadenaOpc) p.set('cadena', cadenaOpc)
    if (ano)       p.set('ano',    ano)
    if (mes)       p.set('mes',    mes)
    const r = await fetch('/api/mercadeo/geo/opciones?' + p)
    const j = await r.json()
    setLoadingOpts(false)
    return (j.opciones || []) as string[]
  }, [])

  // Cargar opciones de país al inicio
  useEffect(() => {
    fetchOpciones('pais', undefined, undefined, fAno, fMes)
      .then(setOpcionesPais)
  }, [fAno, fMes])

  // ── Fetch datos ──────────────────────────────────────────
  const cargar = useCallback((
    nivelVal: Nivel,
    paisVal: string | null,
    cadenaVal: string | null,
    cat: string,
    ano: string,
    mes: string,
  ) => {
    setLoading(true)
    setError('')
    const p = new URLSearchParams()
    p.set('nivel', nivelVal)
    if (paisVal)          p.set('pais',      paisVal)
    if (cadenaVal)        p.set('cadena',    cadenaVal)
    if (cat !== 'Todas')  p.set('categoria', cat)
    if (ano)              p.set('ano', ano)
    if (mes)              p.set('mes', mes)

    fetch('/api/mercadeo/geo?' + p.toString())
      .then(r => r.json())
      .then(j => {
        if (j.error) { setError(j.error); return }
        setRows((j.rows || []).map((r: any) => ({
          nombre:          String(r.nombre || '(sin nombre)'),
          ventas_unidades: toNum(r.ventas_unidades),
          n_productos:     toNum(r.n_productos),
          n_sub:           toNum(r.n_sub),
        })))
        setSubLabel(j.subLabel || 'items')
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    cargar('pais', null, null, 'Todas', '', '')
  }, [cargar])

  // ── Handlers selectores jerárquicos ─────────────────────

  const onSelPais = async (val: string) => {
    setSelPais(val)
    setSelCadena('')
    setSelTienda('')
    setOpcionesCadena([])
    setOpcionesTienda([])

    if (!val) {
      // Resetear a nivel país
      resetDrill()
      return
    }

    // Navegar a nivel cadena con ese país
    const newBreadcrumbs: Breadcrumb[] = [{ nivel: 'pais', label: 'País', value: val }]
    setBreadcrumbs(newBreadcrumbs)
    setPaisSel(val)
    setCadenaSel(null)
    setNivel('cadena')
    setFBusq('')
    cargar('cadena', val, null, fCat, fAno, fMes)

    // Cargar opciones de cadena
    const cadenas = await fetchOpciones('cadena', val, undefined, fAno, fMes)
    setOpcionesCadena(cadenas)
  }

  const onSelCadena = async (val: string) => {
    setSelCadena(val)
    setSelTienda('')
    setOpcionesTienda([])

    if (!val) {
      // Volver a nivel cadena (con el país ya seleccionado)
      const newBreadcrumbs: Breadcrumb[] = [{ nivel: 'pais', label: 'País', value: selPais }]
      setBreadcrumbs(newBreadcrumbs)
      setCadenaSel(null)
      setNivel('cadena')
      setFBusq('')
      cargar('cadena', selPais, null, fCat, fAno, fMes)
      return
    }

    // Navegar a nivel tienda
    const newBreadcrumbs: Breadcrumb[] = [
      { nivel: 'pais',   label: 'País',   value: selPais },
      { nivel: 'cadena', label: 'Cadena', value: val },
    ]
    setBreadcrumbs(newBreadcrumbs)
    setCadenaSel(val)
    setNivel('tienda')
    setFBusq('')
    cargar('tienda', selPais, val, fCat, fAno, fMes)

    // Cargar opciones de tienda
    const tiendas = await fetchOpciones('tienda', selPais, val, fAno, fMes)
    setOpcionesTienda(tiendas)
  }

  const onSelTienda = (val: string) => {
    setSelTienda(val)
    setFBusq(val)  // filtrar la tabla con ese punto de venta
  }

  const resetDrill = () => {
    setNivel('pais')
    setPaisSel(null)
    setCadenaSel(null)
    setBreadcrumbs([])
    setSelPais('')
    setSelCadena('')
    setSelTienda('')
    setOpcionesCadena([])
    setOpcionesTienda([])
    setFBusq('')
    cargar('pais', null, null, fCat, fAno, fMes)
  }

  // ── Drill-down por click en tabla ────────────────────────
  const drillDown = (row: GeoRow) => {
    const next = NIVEL_NEXT[nivel]
    if (!next) return

    const newBreadcrumb: Breadcrumb = { nivel, label: NIVEL_LABELS[nivel], value: row.nombre }
    const newBreadcrumbs = [...breadcrumbs, newBreadcrumb]
    setBreadcrumbs(newBreadcrumbs)

    let newPais   = paisSel
    let newCadena = cadenaSel

    if (nivel === 'pais') {
      newPais = row.nombre
      setSelPais(row.nombre)
      // Cargar cadenas para los selectores
      fetchOpciones('cadena', row.nombre, undefined, fAno, fMes).then(setOpcionesCadena)
    }
    if (nivel === 'cadena') {
      newCadena = row.nombre
      setSelCadena(row.nombre)
      // Cargar tiendas para los selectores
      fetchOpciones('tienda', newPais!, row.nombre, fAno, fMes).then(setOpcionesTienda)
    }

    setPaisSel(newPais)
    setCadenaSel(newCadena)
    setNivel(next)
    setFBusq('')
    cargar(next, newPais, newCadena, fCat, fAno, fMes)
  }

  const drillUp = (targetIdx: number) => {
    const newCrumbs = breadcrumbs.slice(0, targetIdx)
    setBreadcrumbs(newCrumbs)

    const targetNivel = (newCrumbs.length === 0 ? 'pais'
      : newCrumbs.length === 1 ? 'cadena'
      : 'tienda') as Nivel

    const newPais   = newCrumbs.find(b => b.nivel === 'pais')?.value   ?? null
    const newCadena = newCrumbs.find(b => b.nivel === 'cadena')?.value ?? null

    setPaisSel(newPais)
    setCadenaSel(newCadena)
    setNivel(targetNivel)
    setFBusq('')

    // Sincronizar selectores
    setSelPais(newPais || '')
    setSelCadena(newCadena || '')
    setSelTienda('')
    if (!newPais) setOpcionesCadena([])
    if (!newCadena) setOpcionesTienda([])

    cargar(targetNivel, newPais, newCadena, fCat, fAno, fMes)
  }

  // ── Filtros de tiempo y categoría ────────────────────────
  const onCat = (v: string) => { setFCat(v); cargar(nivel, paisSel, cadenaSel, v, fAno, fMes) }
  const onAno = (v: string) => {
    setFAno(v); setFMes('')
    cargar(nivel, paisSel, cadenaSel, fCat, v, '')
    // Refrescar opciones jerárquicas con nuevo año
    fetchOpciones('pais', undefined, undefined, v, '').then(setOpcionesPais)
    if (selPais) fetchOpciones('cadena', selPais, undefined, v, '').then(setOpcionesCadena)
  }
  const onMes = (v: string) => { setFMes(v); cargar(nivel, paisSel, cadenaSel, fCat, fAno, v) }

  // ── Datos computados ─────────────────────────────────────
  const filtrados = rows.filter(r =>
    !fBusq.trim() || r.nombre.toLowerCase().includes(fBusq.toLowerCase())
  )
  const totalUds  = rows.reduce((s, r) => s + r.ventas_unidades, 0)
  const top8      = filtrados.slice(0, 8)
  const mesesDisp = fAno ? (mesMap[Number(fAno)] || []) : []
  const hasDrillDown = NIVEL_NEXT[nivel] !== null

  const titulo = !fAno && !fMes ? 'Todos los períodos'
    : fAno && !fMes ? 'Año ' + fAno
    : MESES[parseInt(fMes)] + ' ' + fAno

  const q25val = rows.length > 0
    ? rows[Math.floor(rows.length * 0.75)]?.ventas_unidades ?? 0 : 0

  return (
    <div className="p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Mercadeo · Ranking</p>
          <h1 className="text-2xl font-bold text-gray-800">Ranking Geográfico</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Drill-down: País → Cadena → Punto de Venta · {titulo}
          </p>
        </div>
        <button onClick={() => cargar(nivel, paisSel, cadenaSel, fCat, fAno, fMes)}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-3">
          <AlertTriangle size={14}/> {error}
        </div>
      )}

      {/* ── Filtros ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">

        {/* Fila 1: Categoría, Año, Mes */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Categoría</label>
            <select value={fCat} onChange={e => onCat(e.target.value)} className={sel}>
              <option value="Todas">Todas</option>
              {catsOpts.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Año</label>
            <select value={fAno} onChange={e => onAno(e.target.value)} className={sel}>
              <option value="">Todos</option>
              {anosOpts.map(a => <option key={a} value={String(a)}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Mes</label>
            <select value={fMes} onChange={e => onMes(e.target.value)} disabled={!fAno} className={sel}>
              <option value="">Todos</option>
              {mesesDisp.map(m => <option key={m} value={String(m)}>{MESES[m]}</option>)}
            </select>
          </div>
        </div>

        {/* Fila 2: Filtros jerárquicos en cascada */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-2">Filtros jerárquicos</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

            {/* País */}
            <div>
              <label className="text-xs text-gray-500 mb-1 flex items-center gap-1.5">
                <Globe2 size={11}/> País
              </label>
              <div className="relative">
                <select value={selPais} onChange={e => onSelPais(e.target.value)} className={sel}>
                  <option value="">Todos los países</option>
                  {opcionesPais.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                {selPais && (
                  <button onClick={() => onSelPais('')}
                    className="absolute right-8 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X size={12}/>
                  </button>
                )}
              </div>
            </div>

            {/* Cadena */}
            <div>
              <label className={`text-xs mb-1 flex items-center gap-1.5 ${selPais ? 'text-gray-500' : 'text-gray-300'}`}>
                <BarChart2 size={11}/> Cadena
                {!selPais && <span className="text-[10px]">(selecciona un país)</span>}
              </label>
              <div className="relative">
                <select value={selCadena} onChange={e => onSelCadena(e.target.value)}
                  disabled={!selPais || loadingOpts} className={sel}>
                  <option value="">Todas las cadenas</option>
                  {opcionesCadena.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {selCadena && (
                  <button onClick={() => onSelCadena('')}
                    className="absolute right-8 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X size={12}/>
                  </button>
                )}
              </div>
            </div>

            {/* Punto de Venta */}
            <div>
              <label className={`text-xs mb-1 flex items-center gap-1.5 ${selCadena ? 'text-gray-500' : 'text-gray-300'}`}>
                <Store size={11}/> Punto de Venta
                {!selCadena && <span className="text-[10px]">(selecciona una cadena)</span>}
              </label>
              <div className="relative">
                <select value={selTienda} onChange={e => onSelTienda(e.target.value)}
                  disabled={!selCadena || loadingOpts} className={sel}>
                  <option value="">Todos los puntos</option>
                  {opcionesTienda.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                {selTienda && (
                  <button onClick={() => onSelTienda('')}
                    className="absolute right-8 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X size={12}/>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Búsqueda libre */}
        <div className="flex items-center gap-3">
          <input value={fBusq} onChange={e => setFBusq(e.target.value)}
            placeholder={`Buscar ${NIVEL_LABELS[nivel].toLowerCase()}…`}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 w-64" />
          {(selPais || selCadena || selTienda) && (
            <button onClick={resetDrill}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-2 bg-white">
              <X size={12}/> Limpiar selección
            </button>
          )}
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 flex-wrap">
        <button onClick={() => drillUp(0)}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all font-medium ${
            breadcrumbs.length === 0
              ? 'bg-amber-500 text-white'
              : 'bg-white border border-gray-200 text-gray-500 hover:text-amber-600 hover:border-amber-300'
          }`}>
          <Globe2 size={12}/> Todos los Países
        </button>

        {breadcrumbs.map((crumb, idx) => (
          <div key={idx} className="flex items-center gap-1">
            <ChevronRight size={14} className="text-gray-300" />
            <button onClick={() => drillUp(idx + 1)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all font-medium ${
                idx === breadcrumbs.length - 1 && NIVEL_NEXT[nivel] === null
                  ? 'bg-amber-500 text-white'
                  : 'bg-white border border-gray-200 text-gray-500 hover:text-amber-600 hover:border-amber-300'
              }`}>
              {NIVEL_ICONS[crumb.nivel]}
              {crumb.value}
            </button>
          </div>
        ))}

        {breadcrumbs.length > 0 && (
          <>
            <ChevronRight size={14} className="text-gray-300" />
            <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-amber-500 text-white font-medium">
              {NIVEL_ICONS[nivel]} {NIVEL_LABELS[nivel]}
            </span>
          </>
        )}

        <span className="ml-auto text-xs text-gray-400 flex items-center gap-1">
          Nivel: <span className="font-semibold text-gray-600">{NIVEL_LABELS[nivel]}</span>
          {hasDrillDown && <span className="text-amber-500">· click para profundizar →</span>}
        </span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: `${NIVEL_LABELS[nivel]}s`,
            value: loading ? '...' : String(rows.length),
            sub: 'con ventas en período',
            icon: NIVEL_ICONS[nivel],
            color: 'border-l-amber-500',
          },
          {
            label: 'Unidades Totales',
            value: loading ? '...' : fmtU(totalUds) + ' uds',
            sub: titulo,
            icon: <TrendingUp size={18}/>,
            color: 'border-l-blue-500',
          },
          {
            label: 'Promedio',
            value: loading ? '...' : fmtU(rows.length > 0 ? Math.round(totalUds / rows.length) : 0) + ' uds',
            sub: `por ${NIVEL_LABELS[nivel].toLowerCase()}`,
            icon: <BarChart2 size={18}/>,
            color: 'border-l-emerald-500',
          },
          {
            label: breadcrumbs.length === 0 ? 'N° Cadenas' : breadcrumbs.length === 1 ? 'N° Tiendas' : 'N° SKUs',
            value: loading ? '...' : String(rows.reduce((s, r) => s + r.n_sub, 0)),
            sub: subLabel + ' activos',
            icon: <Package size={18}/>,
            color: 'border-l-purple-500',
          },
        ].map((k, i) => (
          <div key={i} className={`bg-white rounded-xl border border-gray-100 shadow-sm p-5 border-l-4 ${k.color}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{k.label}</p>
              <span className="text-gray-300">{k.icon}</span>
            </div>
            <p className="text-2xl font-bold text-gray-800">{k.value}</p>
            <p className="text-xs text-gray-400 mt-1">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Gráfico + Tabla */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">

        <div className="xl:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-semibold text-gray-700 mb-1">Top 8 · {NIVEL_LABELS[nivel]}</h3>
          <p className="text-xs text-gray-400 mb-4">Unidades · {titulo}</p>
          {loading
            ? <div className="h-64 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
            : top8.length === 0
              ? <div className="h-64 flex items-center justify-center text-gray-400 text-sm">Sin datos</div>
              : <BarChartPro
                  data={top8}
                  dataKey="ventas_unidades"
                  nameKey="nombre"
                  layout="vertical"
                  colors={COLORS}
                  height={Math.max(220, top8.length * 40)}
                  formatter={(v) => toNum(v).toLocaleString('en-US') + ' uds'}
                  tooltipUnit="uds"
                  yTickFmt={(v: string) => v.length > 16 ? v.slice(0, 16) + '…' : v}
                  xTickFmt={(v: number) => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(0)+'K' : String(v)}
                  yWidth={110}
                  margin={{ top: 4, right: 56, left: 8, bottom: 0 }}
                />
          }
          {hasDrillDown && !loading && top8.length > 0 && (
            <p className="text-[10px] text-amber-500 mt-3 text-center">
              Click en una barra para ver {NIVEL_LABELS[NIVEL_NEXT[nivel]!].toLowerCase()}s
            </p>
          )}
        </div>

        <div className="xl:col-span-3 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-700">
              Ranking de {NIVEL_LABELS[nivel]}s
              {breadcrumbs.length > 0 && (
                <span className="text-gray-400 font-normal ml-1">
                  · {breadcrumbs[breadcrumbs.length - 1].value}
                </span>
              )}
            </h3>
            <span className="text-xs text-gray-400">{filtrados.length} {NIVEL_LABELS[nivel].toLowerCase()}s</span>
          </div>

          {loading ? (
            <div className="h-48 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
          ) : filtrados.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Sin datos</div>
          ) : (
            <div className="overflow-auto max-h-[520px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 z-10">
                  <tr className="text-xs text-gray-400 uppercase tracking-widest border-b border-gray-100">
                    <th className="text-left px-5 py-3 w-8">#</th>
                    <th className="text-left px-4 py-3">{NIVEL_LABELS[nivel]}</th>
                    <th className="text-right px-4 py-3">Unidades</th>
                    <th className="text-right px-4 py-3">% Total</th>
                    <th className="text-right px-4 py-3">{subLabel.charAt(0).toUpperCase() + subLabel.slice(1)}</th>
                    <th className="text-left px-5 py-3">Participación</th>
                    {hasDrillDown && <th className="px-4 py-3"></th>}
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((r, i) => {
                    const pct    = totalUds > 0 ? (r.ventas_unidades / totalUds * 100) : 0
                    const isBaja = r.ventas_unidades > 0 && r.ventas_unidades <= q25val
                    return (
                      <tr key={i}
                        onClick={hasDrillDown ? () => drillDown(r) : undefined}
                        className={`border-b border-gray-50 transition-colors ${
                          hasDrillDown ? 'cursor-pointer hover:bg-amber-50/60' : 'hover:bg-gray-50'
                        }`}>
                        <td className="px-5 py-3 text-gray-400 font-mono text-xs">{i + 1}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-700 font-medium truncate max-w-[180px]">{r.nombre}</span>
                            {isBaja && <AlertTriangle size={11} className="text-amber-400 flex-shrink-0" />}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-800">
                          {r.ventas_unidades.toLocaleString('en-US')}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">{pct.toFixed(1)}%</td>
                        <td className="px-4 py-3 text-right text-gray-500">{r.n_sub}</td>
                        <td className="px-5 py-3">
                          <div className="w-24 bg-gray-100 rounded-full h-2">
                            <div className="h-2 rounded-full transition-all duration-500"
                              style={{ width: Math.min(pct * 3, 100) + '%', background: COLORS[i % COLORS.length] }} />
                          </div>
                        </td>
                        {hasDrillDown && (
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-1 text-[10px] text-amber-500 font-medium whitespace-nowrap">
                              Ver {NIVEL_LABELS[NIVEL_NEXT[nivel]!].toLowerCase()}s
                              <ChevronRight size={10}/>
                            </span>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {breadcrumbs.length > 0 && (
        <button onClick={() => drillUp(breadcrumbs.length - 1)}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <ChevronLeft size={15}/> Volver a {NIVEL_LABELS[breadcrumbs[breadcrumbs.length - 1].nivel]}s
        </button>
      )}
    </div>
  )
}
