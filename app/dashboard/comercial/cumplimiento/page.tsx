'use client'
import { showError } from '@/lib/toast'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { RefreshCw, TrendingDown, AlertCircle, CheckCircle, Pencil, Plus, X } from 'lucide-react'
import MultiSelect from '@/components/dashboard/MultiSelect'
import { COUNTRY_FLAGS } from '@/utils/helpers'

const MESES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const toNum = (v: unknown): number => {
  const n = parseFloat(String(v))
  return isNaN(n) ? 0 : n
}

const fmtUnd = (v: number): string => {
  const abs = Math.abs(v)
  const s = abs >= 1e6 ? (abs / 1e6).toFixed(2) + 'M'
           : abs >= 1e3 ? (abs / 1e3).toFixed(1) + 'K'
           : abs.toLocaleString()
  return (v < 0 ? '-' : '') + s
}

// Composite key: pais||cliente||categoria
const tKey = (pais: string, cliente: string, categoria: string) =>
  `${pais}||${cliente}||${categoria}`

// Progress bar: unidades_actual vs target_und
function CumpBar({ valor, target }: { valor: number; target: number | null }) {
  if (target === null) {
    return <span className="text-[11px]" style={{ color: 'var(--t3)' }}>Sin target</span>
  }
  const pct   = target > 0 ? (valor / target) * 100 : 0
  const color = pct >= 100 ? '#10b981' : pct >= 80 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)', minWidth: 60 }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
      </div>
      <span className="text-[12px] font-bold tabular-nums w-14 text-right" style={{ color }}>{pct.toFixed(1)}%</span>
    </div>
  )
}

// Editable UND target cell
function TargetCell({
  rowKey, pais, cliente, categoria, valorActual,
  targets, editingKey, editingVal, savingKey,
  onStartEdit, onSave, onCancel, onClear,
}: {
  rowKey: string; pais: string; cliente: string; categoria: string; valorActual: number
  targets: Record<string, number | null>
  editingKey: string | null; editingVal: string; savingKey: string | null
  onStartEdit: (key: string, current: string) => void
  onSave: (pais: string, cliente: string, categoria: string, val: string) => void
  onCancel: () => void
  onClear: (pais: string, cliente: string, categoria: string) => void
}) {
  const tgt       = targets[rowKey] ?? null
  const isEditing = editingKey === rowKey
  const isSaving  = savingKey  === rowKey
  // Prevents onBlur from firing a second save when Enter already triggered one
  const didSave = useRef(false)

  useEffect(() => { if (isEditing) didSave.current = false }, [isEditing])

  if (isEditing) return (
    <div className="flex items-center gap-1">
      <input
        type="number" min={0} step={1}
        defaultValue={editingVal}
        onKeyDown={e => {
          const val = (e.target as HTMLInputElement).value
          if (e.key === 'Enter')  { didSave.current = true; onSave(pais, cliente, categoria, val) }
          if (e.key === 'Escape') { didSave.current = true; onCancel() }
        }}
        onBlur={e => { if (!didSave.current) onSave(pais, cliente, categoria, e.target.value) }}
        autoFocus
        className="w-24 text-xs border border-indigo-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 tabular-nums"
        placeholder="0"
      />
      <span className="text-[10px] text-gray-400">und</span>
      <button
        onMouseDown={e => e.preventDefault()}
        onClick={() => { didSave.current = true; onCancel() }}
        className="text-gray-300 hover:text-gray-500"
      ><X size={10} /></button>
    </div>
  )

  if (isSaving) return <span className="text-[11px] text-gray-400 animate-pulse">Guardando...</span>

  if (tgt != null) {
    const gap = valorActual - tgt
    return (
      <div className="flex items-center gap-1.5">
        <span className="font-semibold tabular-nums text-indigo-600 text-[12px]">{fmtUnd(tgt)}</span>
        <span className={`text-[10px] font-medium tabular-nums ${gap >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
          {gap >= 0 ? '+' : ''}{fmtUnd(gap)}
        </span>
        <button
          onClick={() => onStartEdit(rowKey, String(tgt))}
          className="text-gray-300 hover:text-indigo-400 transition-colors"
          title="Editar target"
        ><Pencil size={10} /></button>
        <button
          onClick={() => onClear(pais, cliente, categoria)}
          className="text-gray-200 hover:text-red-400 transition-colors"
          title="Quitar target"
        ><X size={9} /></button>
      </div>
    )
  }

  return (
    <button
      onClick={() => onStartEdit(rowKey, '')}
      className="flex items-center gap-1 text-[11px] text-gray-300 hover:text-indigo-500 transition-colors group"
      title="Fijar target en unidades"
    >
      <Plus size={10} />
      <span className="group-hover:underline">Fijar target</span>
    </button>
  )
}

interface DetalleRow {
  pais: string; cliente: string; categoria: string
  unidades_actual: number; valor_actual: number
}

interface PaisRow {
  pais: string
  unidades_actual: number; valor_actual: number
}

type SortKey = 'cumplimiento_pct' | 'unidades_actual' | 'valor_actual'
interface SortState { key: SortKey; dir: 'asc' | 'desc' }

export default function CumplimientoPage() {
  const [mesMap,  setMesMap]  = useState<Record<number, number[]>>({})
  const [anos,    setAnos]    = useState<number[]>([])
  const [fAno,    setFAno]    = useState('')
  const [fMes,    setFMes]    = useState('')

  const [fPaises,   setFPaises]   = useState<string[]>([])
  const [fCats,     setFCats]     = useState<string[]>([])
  const [fSubcats,  setFSubcats]  = useState<string[]>([])
  const [fClientes, setFClientes] = useState<string[]>([])

  const [paisOpts,    setPaisOpts]    = useState<string[]>([])
  const [catOpts,     setCatOpts]     = useState<string[]>([])
  const [subcatOpts,  setSubcatOpts]  = useState<string[]>([])
  const [clienteOpts, setClienteOpts] = useState<string[]>([])

  const [porPais,     setPorPais]     = useState<PaisRow[]>([])
  const [detalle,     setDetalle]     = useState<DetalleRow[]>([])
  const [anoActual,   setAnoActual]   = useState<number | null>(null)
  const [mesActual,   setMesActual]   = useState<number | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [sort,        setSort]        = useState<SortState>({ key: 'cumplimiento_pct', dir: 'desc' })

  // Targets — keyed by tKey(pais, cliente, categoria), values in UND
  const [targets,    setTargets]    = useState<Record<string, number | null>>({})
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editingVal, setEditingVal] = useState('') // initial value shown in input
  const [savingKey,  setSavingKey]  = useState<string | null>(null)
  const [saveError,  setSaveError]  = useState<string | null>(null)

  const initDone = useRef(false)

  // ── Period map ────────────────────────────────────────────────────────────
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

  // ── Dimension options ─────────────────────────────────────────────────────
  useEffect(() => {
    const p = new URLSearchParams({ dim: 'pais' })
    if (fAno) p.set('ano', fAno); if (fMes) p.set('mes', fMes)
    fetch('/api/ventas/dimension?' + p).then(r => r.json()).then(j =>
      setPaisOpts((j.rows || []).map((r: { nombre: string }) => r.nombre).filter(Boolean)))
  }, [fAno, fMes])

  // Cascade: período + países → categorías
  useEffect(() => {
    const p = new URLSearchParams({ dim: 'categoria' })
    if (fAno) p.set('ano', fAno); if (fMes) p.set('mes', fMes)
    if (fPaises.length) p.set('paises', fPaises.join(','))
    fetch('/api/ventas/dimension?' + p).then(r => r.json()).then(j => {
      const opts = (j.rows || []).map((r: { nombre: string }) => r.nombre).filter(Boolean)
      setCatOpts(opts)
      setFCats(prev => prev.filter(v => opts.includes(v)))
    })
  }, [fAno, fMes, fPaises])

  // Cascade: período + países + cats → subcategorías (lazy)
  useEffect(() => {
    if (!fPaises.length && !fCats.length) { setSubcatOpts([]); setFSubcats([]); return }
    const p = new URLSearchParams({ dim: 'subcategoria' })
    if (fAno) p.set('ano', fAno); if (fMes) p.set('mes', fMes)
    if (fPaises.length) p.set('paises',     fPaises.join(','))
    if (fCats.length)   p.set('categorias', fCats.join(','))
    fetch('/api/ventas/dimension?' + p).then(r => r.json()).then(j => {
      const opts = (j.rows || []).map((r: { nombre: string }) => r.nombre).filter(Boolean)
      setSubcatOpts(opts)
      setFSubcats(prev => prev.filter(v => opts.includes(v)))
    })
  }, [fAno, fMes, fPaises, fCats])

  // Cascade: período + países + cats + subcats → clientes (lazy)
  useEffect(() => {
    if (!fPaises.length && !fCats.length) { setClienteOpts([]); setFClientes([]); return }
    const p = new URLSearchParams({ dim: 'cliente' })
    if (fAno) p.set('ano', fAno); if (fMes) p.set('mes', fMes)
    if (fPaises.length)  p.set('paises',       fPaises.join(','))
    if (fCats.length)    p.set('categorias',    fCats.join(','))
    if (fSubcats.length) p.set('subcategorias', fSubcats.join(','))
    fetch('/api/ventas/dimension?' + p).then(r => r.json()).then(j => {
      const opts = (j.rows || []).map((r: { nombre: string }) => r.nombre).filter(Boolean)
      setClienteOpts(opts)
      setFClientes(prev => prev.filter(v => opts.includes(v)))
    })
  }, [fAno, fMes, fPaises, fCats, fSubcats])

  // ── Load targets ──────────────────────────────────────────────────────────
  const loadTargets = useCallback((ano: number, mes: number) => {
    fetch(`/api/ventas/cumplimiento/targets?ano=${ano}&mes=${mes}`)
      .then(r => r.json())
      .then(j => {
        const t: Record<string, number | null> = {}
        ;(j.targets || []).forEach((row: { pais: string; cliente: string; categoria: string; target_und: string }) => {
          t[tKey(row.pais, row.cliente, row.categoria)] = parseFloat(row.target_und)
        })
        setTargets(t)
      })
      .catch(() => {/* table may not exist yet */})
  }, [])

  // ── Fetch cumplimiento ────────────────────────────────────────────────────
  const cargar = useCallback((
    ano: string, mes: string,
    paises: string[], cats: string[], subcats: string[], clientes: string[]
  ) => {
    setLoading(true)
    const p = new URLSearchParams()
    if (ano)             p.set('ano', ano)
    if (mes)             p.set('mes', mes)
    if (paises.length)   p.set('paises', paises.join(','))
    if (cats.length)     p.set('categorias', cats.join(','))
    if (subcats.length)  p.set('subcategorias', subcats.join(','))
    if (clientes.length) p.set('clientes', clientes.join(','))

    fetch('/api/ventas/cumplimiento?' + p)
      .then(r => r.json())
      .then(j => {
        if (j.error) { showError(j.error || 'Error al cargar datos'); return }
        setAnoActual(j.ano_actual)
        setMesActual(j.mes_actual)
        setPorPais((j.por_pais || []).map((r: Record<string, unknown>) => ({
          pais:            String(r.pais || ''),
          unidades_actual: toNum(r.unidades_actual),
          valor_actual:    toNum(r.valor_actual),
        })))
        setDetalle((j.detalle || []).map((r: Record<string, unknown>) => ({
          pais:            String(r.pais || ''),
          cliente:         String(r.cliente || ''),
          categoria:       String(r.categoria || ''),
          unidades_actual: toNum(r.unidades_actual),
          valor_actual:    toNum(r.valor_actual),
        })))
        if (j.ano_actual && j.mes_actual) loadTargets(j.ano_actual, j.mes_actual)
      })
      .finally(() => setLoading(false))
  }, [loadTargets])

  useEffect(() => { cargar('', '', [], [], [], []) }, [cargar])

  const triggerCargar = (
    ano = fAno, mes = fMes,
    paises = fPaises, cats = fCats, subcats = fSubcats, clientes = fClientes
  ) => cargar(ano, mes, paises, cats, subcats, clientes)

  const limpiar = () => {
    setFAno(''); setFMes('')
    setFPaises([]); setFCats([]); setFSubcats([]); setFClientes([])
    cargar('', '', [], [], [], [])
  }

  // ── Aggregated targets per país (sum of detail targets) ──────────────────
  const paisTargets = useMemo(() => {
    const map: Record<string, { targetUnd: number; filasConTarget: number }> = {}
    detalle.forEach(r => {
      if (!map[r.pais]) map[r.pais] = { targetUnd: 0, filasConTarget: 0 }
      const tgt = targets[tKey(r.pais, r.cliente, r.categoria)]
      if (tgt != null) {
        map[r.pais].targetUnd     += tgt
        map[r.pais].filasConTarget += 1
      }
    })
    return map
  }, [detalle, targets])

  // ── KPIs — computed from detalle + targets ────────────────────────────────
  const kpi = useMemo(() => {
    const rows = detalle.map(r => ({
      tgt: targets[tKey(r.pais, r.cliente, r.categoria)] ?? null,
      und: r.unidades_actual,
    }))
    const conTarget = rows.filter(r => r.tgt != null)
    const pcts = conTarget.map(r => r.tgt! > 0 ? (r.und / r.tgt!) * 100 : 0)
    return {
      promedio:       pcts.length > 0 ? pcts.reduce((s, p) => s + p, 0) / pcts.length : 0,
      sobre_100:      pcts.filter(p => p >= 100).length,
      bajo_100:       pcts.filter(p => p < 100).length,
      sin_target:     rows.filter(r => r.tgt == null).length,
      total_registros: rows.length,
    }
  }, [detalle, targets])

  // ── Target editing helpers ────────────────────────────────────────────────
  const startEdit  = (key: string, current: string) => { setEditingKey(key); setEditingVal(current) }
  const cancelEdit = () => { setEditingKey(null); setEditingVal('') }

  const saveTarget = async (pais: string, cliente: string, categoria: string, val: string) => {
    const num = Math.round(parseFloat(val))
    if (isNaN(num) || num < 0) { cancelEdit(); return }
    const key = tKey(pais, cliente, categoria)
    setSaveError(null)
    setSavingKey(key)
    setEditingKey(null)
    try {
      const res = await fetch('/api/ventas/cumplimiento/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pais, cliente, categoria, ano: anoActual, mes: mesActual, target_und: num }),
      })
      if (res.ok) {
        setTargets(prev => ({ ...prev, [key]: num }))
      } else {
        const body = await res.json().catch(() => ({}))
        setSaveError(body.error || `Error ${res.status} al guardar target`)
        // Re-open editing so the value isn't lost
        setEditingVal(String(num))
        setEditingKey(key)
      }
    } catch (e) {
      setSaveError(String(e))
      setEditingVal(String(num))
      setEditingKey(key)
    } finally {
      setSavingKey(null)
    }
  }

  const clearTarget = async (pais: string, cliente: string, categoria: string) => {
    const key = tKey(pais, cliente, categoria)
    setSavingKey(key)
    try {
      const res = await fetch('/api/ventas/cumplimiento/targets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pais, cliente, categoria, ano: anoActual, mes: mesActual }),
      })
      if (res.ok) setTargets(prev => { const t = { ...prev }; delete t[key]; return t })
    } finally {
      setSavingKey(null)
    }
  }

  const targetCellProps = {
    targets, editingKey, editingVal, savingKey,
    onStartEdit: startEdit,
    onSave: saveTarget,
    onCancel: cancelEdit,
    onClear: clearTarget,
  }

  // ── Sort detalle ──────────────────────────────────────────────────────────
  const sortedDetalle = useMemo(() => [...detalle].sort((a, b) => {
    const tgtA = targets[tKey(a.pais, a.cliente, a.categoria)]
    const tgtB = targets[tKey(b.pais, b.cliente, b.categoria)]
    const pctA = tgtA != null && tgtA > 0 ? (a.unidades_actual / tgtA) * 100 : -1
    const pctB = tgtB != null && tgtB > 0 ? (b.unidades_actual / tgtB) * 100 : -1

    const va = sort.key === 'cumplimiento_pct' ? pctA
             : sort.key === 'unidades_actual'  ? a.unidades_actual
             : a.valor_actual
    const vb = sort.key === 'cumplimiento_pct' ? pctB
             : sort.key === 'unidades_actual'  ? b.unidades_actual
             : b.valor_actual
    return sort.dir === 'asc' ? va - vb : vb - va
  }), [detalle, targets, sort])

  const toggleSort = (key: SortKey) =>
    setSort(prev => prev.key === key ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' })

  const arrow = (key: SortKey) => sort.key === key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ' ↕'

  const mesesDisp    = fAno ? (mesMap[Number(fAno)] || []) : []
  const periodoLabel = mesActual && anoActual ? `${MESES[mesActual]} ${anoActual}` : 'Cargando...'

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Dashboard Comercial</p>
          <h1 className="text-2xl font-bold text-gray-800">Cumplimiento</h1>
          {!loading && <p className="text-xs mt-0.5" style={{ color: 'var(--t3)' }}>{periodoLabel}</p>}
        </div>
        <button
          onClick={() => triggerCargar()}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* Error banner */}
      {saveError && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
          <span><strong>Error al guardar target:</strong> {saveError}. Verifica que la tabla <code className="font-mono text-xs bg-red-100 px-1 rounded">cumplimiento_targets</code> existe en Neon (ejecuta <code className="font-mono text-xs bg-red-100 px-1 rounded">db/cumplimiento_targets.sql</code>).</span>
          <button onClick={() => setSaveError(null)} className="text-red-400 hover:text-red-600 flex-shrink-0"><X size={14} /></button>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Filtros</p>
          <button onClick={limpiar} className="text-xs text-gray-400 hover:text-gray-600 underline">Limpiar todo</button>
        </div>
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
              <option value="">Más reciente</option>
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MultiSelect label="País" options={paisOpts.map(p => ({ value: p, label: p }))} value={fPaises}
            onChange={v => { setFPaises(v); triggerCargar(fAno, fMes, v) }} placeholder="Todos los países" />
          <MultiSelect label="Categoría" options={catOpts.map(c => ({ value: c, label: c }))} value={fCats}
            onChange={v => { setFCats(v); triggerCargar(fAno, fMes, fPaises, v) }} placeholder="Todas" />
          <MultiSelect label={fCats.length > 0 ? 'Subcategoría 🔗' : 'Subcategoría'} options={subcatOpts.map(s => ({ value: s, label: s }))} value={fSubcats}
            onChange={v => { setFSubcats(v); triggerCargar(fAno, fMes, fPaises, fCats, v) }} placeholder="Todas" />
          <MultiSelect label={fPaises.length > 0 ? 'Cliente 🔗' : 'Cliente'} options={clienteOpts.map(c => ({ value: c, label: c }))} value={fClientes}
            onChange={v => { setFClientes(v); triggerCargar(fAno, fMes, fPaises, fCats, fSubcats, v) }} placeholder="Todos" />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 border-l-4 border-l-amber-500">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Promedio Cumplimiento</p>
          <p className="text-2xl font-bold" style={{ color: loading ? 'var(--t3)' : kpi.promedio >= 100 ? '#10b981' : '#f59e0b' }}>
            {loading ? '...' : kpi.promedio.toFixed(1) + '%'}
          </p>
          <p className="text-[10px] mt-1" style={{ color: 'var(--t3)' }}>vs target unidades</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 border-l-4 border-l-emerald-500">
          <div className="flex items-center gap-1.5 mb-1"><CheckCircle size={13} className="text-emerald-500" />
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Sobre 100%</p></div>
          <p className="text-2xl font-bold text-emerald-600">{loading ? '...' : kpi.sobre_100}</p>
          <p className="text-[10px] mt-1" style={{ color: 'var(--t3)' }}>registros en meta</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 border-l-4 border-l-red-400">
          <div className="flex items-center gap-1.5 mb-1"><TrendingDown size={13} className="text-red-400" />
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Bajo 100%</p></div>
          <p className="text-2xl font-bold text-red-500">{loading ? '...' : kpi.bajo_100}</p>
          <p className="text-[10px] mt-1" style={{ color: 'var(--t3)' }}>registros bajo meta</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 border-l-4 border-l-gray-300">
          <div className="flex items-center gap-1.5 mb-1"><AlertCircle size={13} className="text-gray-400" />
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Sin Target</p></div>
          <p className="text-2xl font-bold text-gray-500">{loading ? '...' : kpi.sin_target}</p>
          <p className="text-[10px] mt-1" style={{ color: 'var(--t3)' }}>sin target asignado</p>
        </div>
      </div>

      {/* Por País */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-semibold text-gray-700 mb-4">Cumplimiento por País</h3>
        {loading ? (
          <div className="h-32 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
        ) : porPais.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-gray-400 text-sm">Sin datos</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 uppercase tracking-widest border-b border-gray-100">
                  <th className="text-left py-2 pr-4">País</th>
                  <th className="text-right py-2 pr-4">Unidades {anoActual}</th>
                  <th className="text-right py-2 pr-4">Target UND</th>
                  <th className="text-left py-2 pl-2" style={{ minWidth: 180 }}>Cumplimiento</th>
                </tr>
              </thead>
              <tbody>
                {porPais.map((r, i) => {
                  const agg = paisTargets[r.pais]
                  const targetUnd = agg && agg.filasConTarget > 0 ? agg.targetUnd : null
                  const gap = targetUnd != null ? r.unidades_actual - targetUnd : null
                  return (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 pr-4 font-semibold text-amber-600">{COUNTRY_FLAGS[r.pais] ?? ''} {r.pais}</td>
                      <td className="py-2 pr-4 text-right text-gray-700">{r.unidades_actual.toLocaleString()}</td>
                      <td className="py-2 pr-4 text-right">
                        {targetUnd != null ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="font-semibold text-indigo-600">{fmtUnd(targetUnd)}</span>
                            {gap !== null && (
                              <span className={`text-[10px] font-medium tabular-nums ${gap >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                                {gap >= 0 ? '+' : ''}{fmtUnd(gap)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300 text-[11px]">Sin target</span>
                        )}
                      </td>
                      <td className="py-2 pl-2">
                        <CumpBar valor={r.unidades_actual} target={targetUnd} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detalle */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-semibold text-gray-700 mb-4">
          Detalle por País · Cliente · Categoría
          {detalle.length > 0 && (
            <span className="ml-2 text-xs text-gray-400 font-normal">({detalle.length.toLocaleString()} registros)</span>
          )}
        </h3>
        {loading ? (
          <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
        ) : sortedDetalle.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-gray-400 text-sm">Sin datos para los filtros seleccionados</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 uppercase tracking-widest border-b border-gray-100">
                  <th className="text-left py-2 pr-3">País</th>
                  <th className="text-left py-2 pr-3">Cliente</th>
                  <th className="text-left py-2 pr-3">Categoría</th>
                  <th
                    className="text-right py-2 pr-3 cursor-pointer hover:text-gray-600 select-none"
                    onClick={() => toggleSort('unidades_actual')}
                  >
                    Unidades {anoActual}{arrow('unidades_actual')}
                  </th>
                  <th
                    className="text-left py-2 pr-3 pl-2 cursor-pointer hover:text-gray-600 select-none"
                    style={{ minWidth: 180 }}
                    onClick={() => toggleSort('cumplimiento_pct')}
                  >
                    Cumplimiento{arrow('cumplimiento_pct')}
                  </th>
                  <th className="text-left py-2 pl-2" style={{ minWidth: 160 }}>
                    Target UND <span className="font-normal normal-case text-[9px] tracking-normal text-gray-300">(editable)</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedDetalle.map((r, i) => {
                  const key = tKey(r.pais, r.cliente, r.categoria)
                  return (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-1.5 pr-3 font-semibold text-amber-600">{COUNTRY_FLAGS[r.pais] ?? ''} {r.pais}</td>
                      <td className="py-1.5 pr-3 text-gray-700 max-w-[160px] truncate">{r.cliente}</td>
                      <td className="py-1.5 pr-3 text-gray-600">{r.categoria}</td>
                      <td className="py-1.5 pr-3 text-right text-gray-700">{r.unidades_actual.toLocaleString()}</td>
                      <td className="py-1.5 pr-3 pl-2">
                        <CumpBar valor={r.unidades_actual} target={targets[key] ?? null} />
                      </td>
                      <td className="py-1.5 pl-2">
                        <TargetCell rowKey={key} pais={r.pais} cliente={r.cliente} categoria={r.categoria} valorActual={r.unidades_actual} {...targetCellProps} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
