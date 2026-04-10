'use client'
import { useState, useMemo, useCallback } from 'react'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, PieChart, Pie, ReferenceLine,
} from 'recharts'
import { useEffect } from 'react'
import {
  TrendingUp, TrendingDown, Package, ShoppingCart, DollarSign,
  RotateCcw, Download, AlertTriangle, CheckCircle, Clock,
  Filter, ChevronDown, BarChart2, ArrowUpRight, ArrowDownRight, History,
} from 'lucide-react'
import { fmtCOP, fmtPrice, fmtN, exportCSV, PRODUCTOS, type Filtros, type Row } from './_data'

// ── Paleta de colores ─────────────────────────────────────────────────────────
const C = {
  blue:   '#2563eb', blueL: '#dbeafe',
  green:  '#16a34a', greenL: '#dcfce7',
  amber:  '#d97706', amberL: '#fef3c7',
  red:    '#dc2626', redL:   '#fee2e2',
  slate:  '#64748b', slateL: '#f1f5f9',
  violet: '#7c3aed', violetL: '#ede9fe',
  teal:   '#0d9488', tealL:  '#ccfbf1',
  rose:   '#e11d48', roseL:  '#ffe4e6',
}
const CHART_COLORS = [C.blue, C.green, C.amber, C.violet, C.teal, C.rose, C.red, C.slate]

// ── Tooltip personalizado ─────────────────────────────────────────────────────
function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xl px-4 py-3 min-w-[160px]">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4 mb-0.5">
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color || p.fill }} />
            {p.name}
          </span>
          <span className="text-[13px] font-bold text-slate-800">
            {typeof p.value === 'number' ? p.value.toLocaleString('es-CO') : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Badge de variación ────────────────────────────────────────────────────────
function VarBadge({ v, prefix = '' }: { v: number | null; prefix?: string }) {
  if (v === null || isNaN(v)) return <span className="text-xs text-slate-400">—</span>
  const pos = v >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${pos ? 'text-green-600' : 'text-red-500'}`}>
      {pos ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {prefix}{Math.abs(v).toFixed(1)}%
    </span>
  )
}

// ── Semáforo SEU ──────────────────────────────────────────────────────────────
function SEULight({ margen }: { margen: number }) {
  const color = margen >= 15 ? 'green' : margen >= 8 ? 'amber' : 'red'
  const labels: Record<string, string> = { green: 'Saludable', amber: 'Alerta', red: 'Crítico' }
  return (
    <div className="flex items-center gap-2">
      <span className={`w-3 h-3 rounded-full ${color === 'green' ? 'bg-green-500' : color === 'amber' ? 'bg-amber-400' : 'bg-red-500'} shadow-sm`} />
      <span className={`text-xs font-semibold ${color === 'green' ? 'text-green-700' : color === 'amber' ? 'text-amber-700' : 'text-red-700'}`}>
        SEU {labels[color]}
      </span>
    </div>
  )
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, icon, color, variation, seu }: {
  label: string; value: string; sub?: string; icon: React.ReactNode
  color: string; variation?: number | null; seu?: number
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: color + '20' }}>
            <span style={{ color }}>{icon}</span>
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</span>
        </div>
        {variation !== undefined && <VarBadge v={variation ?? null} />}
      </div>
      <div>
        <p className="text-2xl font-black text-slate-800 leading-none">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </div>
      {seu !== undefined && <SEULight margen={seu} />}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
//  MÓDULO 1 — VISTA GENERAL / KPIs
// ══════════════════════════════════════════════════════════════════════════════
function ModKPIs({ data, fil, bm }: { data: Row[]; fil: Filtros; bm: BmData }) {
  const curr = data
  const totalSellIn  = curr.reduce((s, r) => s + r.valor_sell_in_cop, 0)
  const totalSellOut = curr.reduce((s, r) => s + r.valor_sell_out_cop, 0)
  const totalUnd     = curr.reduce((s, r) => s + r.unidades_sell_out, 0)
  const totalInv     = curr.reduce((s, r) => s + r.inventario_unidades, 0)
  const margen       = totalSellOut > 0 ? ((totalSellOut - totalSellIn) / totalSellOut) * 100 : 0
  const tasa         = fil.tasa

  const MESES_CORTOS = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

  // Tendencia mensual (agrupado por año-mes)
  const bySemana = useMemo(() => {
    const m: Record<string, { key: string; label: string; sin: number; sout: number }> = {}
    curr.forEach(r => {
      const mes = r.semana // semana almacena el mes (1-12) en datos reales
      const ano = r.fecha.substring(0, 4)
      const key = `${ano}-${String(mes).padStart(2, '0')}`
      if (!m[key]) m[key] = { key, label: `${MESES_CORTOS[mes] || 'M' + mes} ${ano.slice(2)}`, sin: 0, sout: 0 }
      m[key].sin  += r.valor_sell_in_cop
      m[key].sout += r.valor_sell_out_cop
    })
    return Object.values(m).sort((a, b) => a.key.localeCompare(b.key)).map(r => ({
      semana: r.label,
      'Sell In':  fil.moneda === 'USD' ? Math.round(r.sin / tasa) : Math.round(r.sin / 1000),
      'Sell Out': fil.moneda === 'USD' ? Math.round(r.sout / tasa) : Math.round(r.sout / 1000),
    }))
  }, [curr, fil.moneda, tasa])

  // Por categoría
  const byCat = useMemo(() => {
    const m: Record<string, number> = {}
    curr.forEach(r => { m[r.categoria] = (m[r.categoria] || 0) + r.valor_sell_out_cop })
    return Object.entries(m).map(([cat, v]) => ({
      name: cat,
      value: fil.moneda === 'USD' ? Math.round(v / tasa) : Math.round(v / 1000),
    }))
  }, [curr, fil.moneda, tasa])

  const unit = fil.moneda === 'USD' ? 'USD' : 'COP Miles'

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Sell Out Total" icon={<DollarSign size={16} />} color={C.blue}
          value={fmtCOP(totalSellOut, fil.moneda, fil.tasa)}
          sub={fmtN(totalUnd) + ' unidades'} variation={8.3} seu={margen}
        />
        <KPICard
          label="Sell In Total" icon={<ShoppingCart size={16} />} color={C.violet}
          value={fmtCOP(totalSellIn, fil.moneda, fil.tasa)}
          sub="Compras al proveedor" variation={6.1}
        />
        <KPICard
          label="Margen Bruto" icon={<TrendingUp size={16} />} color={C.green}
          value={margen.toFixed(1) + '%'}
          sub="Sell Out – Sell In" variation={margen > 14 ? 1.2 : -1.5}
        />
        <KPICard
          label="Inventario" icon={<Package size={16} />} color={C.amber}
          value={fmtN(totalInv)}
          sub="unidades disponibles" variation={-3.2}
        />
      </div>

      {/* Gráfico tendencia semanal */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-700 text-sm">Tendencia Mensual — Sell In vs Sell Out</h3>
          <span className="text-xs text-slate-400">{unit}</span>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={bySemana} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
            <defs>
              <linearGradient id="gradSout" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={C.blue} stopOpacity={0.15} />
                <stop offset="95%" stopColor={C.blue} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradSin" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={C.violet} stopOpacity={0.12} />
                <stop offset="95%" stopColor={C.violet} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="semana" tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} width={52} />
            <Tooltip content={<ChartTip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="Sell Out" stroke={C.blue}   fill="url(#gradSout)" strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="Sell In"  stroke={C.violet} fill="url(#gradSin)"  strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Por categoría */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="font-bold text-slate-700 text-sm mb-4">Sell Out por Categoría</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={byCat} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                {byCat.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip content={<ChartTip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Sell Out por cadena */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="font-bold text-slate-700 text-sm mb-4">Sell Out Colombia por Cadena</h3>
          <div className="space-y-2">
            {(() => {
              const grouped: Record<string, number> = {}
              const total = curr.reduce((s, r) => s + r.valor_sell_out_cop, 0)
              curr.forEach(r => {
                const k = bm.cadenaBySub[r.cadena] || r.cadena
                if (k) grouped[k] = (grouped[k] || 0) + r.valor_sell_out_cop
              })
              return Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([cadena, sout]) => {
              const mg = total > 0 ? (sout / total) * 100 : 0
              return (
                <div key={cadena} className="flex items-center gap-3">
                  <span className="text-xs text-slate-600 w-28 truncate">{cadena}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: mg + '%', background: C.blue }} />
                  </div>
                  <span className="text-xs font-bold w-10 text-right text-blue-700">
                    {mg.toFixed(1)}%
                  </span>
                </div>
              )
              })
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
//  MÓDULO 2 — SELL IN
// ══════════════════════════════════════════════════════════════════════════════
function ModSellIn({ data, fil, overrides, onEdit }: {
  data: Row[]; fil: Filtros
  overrides: Record<string, Record<string, number>>
  onEdit: (ctx: EditCtx) => void
}) {
  const [groupBy, setGroupBy] = useState<'cadena' | 'region' | 'subcategoria'>('cadena')
  const tasa = fil.tasa

  const tableData = useMemo(() => {
    const m: Record<string, { key: string; unidades: number; valor: number; devol: number; pc_sum: number; pc_comp_sum: number; n: number }> = {}
    data.forEach(r => {
      const k = groupBy === 'cadena' ? r.cadena : groupBy === 'region' ? r.region : r.subcategoria
      if (!m[k]) m[k] = { key: k, unidades: 0, valor: 0, devol: 0, pc_sum: 0, pc_comp_sum: 0, n: 0 }
      m[k].unidades   += r.unidades_sell_in
      m[k].valor       += r.valor_sell_in_cop
      m[k].devol       += r.devoluciones_unidades
      m[k].pc_sum      += r.precio_compra
      m[k].pc_comp_sum += r.precio_comparable
      m[k].n++
    })
    return Object.values(m).sort((a, b) => b.valor - a.valor).map(r => {
      const ov = overrides[r.key] || {}
      const finalUnidades = ov['unidades_sell_in'] ?? r.unidades
      const finalValor    = ov['valor_sell_in_cop'] ?? r.valor
      return {
        ...r,
        unidades:        finalUnidades,
        valor:           finalValor,
        prom_compra:     Math.round(r.pc_sum / r.n),
        prom_comparable: Math.round(r.pc_comp_sum / r.n),
        cellartirada:    ((r.pc_sum / r.n - r.pc_comp_sum / r.n) / (r.pc_comp_sum / r.n) * 100),
      }
    })
  }, [data, groupBy, overrides])

  const chartData = tableData.slice(0, 8).map(r => ({
    name: r.key.length > 12 ? r.key.slice(0, 12) + '…' : r.key,
    'Sell In': fil.moneda === 'USD' ? Math.round(r.valor / tasa) : Math.round(r.valor / 1000),
  }))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-black text-slate-800 text-base">Análisis Sell In</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Agrupar por:</span>
          {(['cadena', 'region', 'subcategoria'] as const).map(g => (
            <button key={g} onClick={() => setGroupBy(g)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${groupBy === g ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {g === 'region' ? 'Ciudad' : g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
          <button onClick={() => exportCSV(tableData, 'sell_in.csv')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs font-semibold">
            <Download size={12} /> CSV
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 4, right: 16, left: 4, bottom: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} angle={-20} textAnchor="end" height={44} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} width={56} />
            <Tooltip content={<ChartTip />} />
            <Bar dataKey="Sell In" fill={C.violet} radius={[4, 4, 0, 0]}>
              {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {[(groupBy === 'region' ? 'Ciudad' : groupBy.charAt(0).toUpperCase() + groupBy.slice(1)), 'Unidades', 'Valor Sell In', 'P. Compra Prom', 'P. Comparable', 'Cellartirada', 'Devoluciones', '% Dev', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableData.map((r, i) => {
                const devPct = r.unidades > 0 ? (r.devol / r.unidades * 100) : 0
                return (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-2.5 font-semibold text-slate-700">{r.key}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.unidades.toLocaleString('es-CO')}</td>
                    <td className="px-4 py-2.5 font-semibold text-violet-700">{fmtCOP(r.valor, fil.moneda, tasa)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{fmtCOP(r.prom_compra, fil.moneda, tasa)}</td>
                    <td className="px-4 py-2.5 text-slate-500">{fmtCOP(r.prom_comparable, fil.moneda, tasa)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`font-bold ${r.cellartirada < 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {r.cellartirada > 0 ? '+' : ''}{r.cellartirada.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{r.devol.toLocaleString('es-CO')}</td>
                    <td className="px-4 py-2.5">
                      <span className={`font-bold ${devPct > 5 ? 'text-red-500' : devPct > 2 ? 'text-amber-600' : 'text-green-600'}`}>
                        {devPct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => onEdit({
                        modulo: 'sellin',
                        clave: r.key,
                        desc: r.key,
                        fields: [
                          { label: 'Unidades Sell In', field: 'unidades_sell_in', current: r.unidades },
                          { label: 'Valor Sell In (COP)', field: 'valor_sell_in_cop', current: r.valor },
                        ]
                      })} className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-400 hover:text-blue-700 transition-colors" title="Ajustar">✏</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
//  MÓDULO 3 — SELL OUT
// ══════════════════════════════════════════════════════════════════════════════
type BmData = {
  cadenas:            string[]
  subcadenas:         string[]
  departamentos:      string[]
  ciudades:           string[]
  subcadenasByCadena: Record<string, string[]>
  cadenaBySub:        Record<string, string>
  subcadenasByDept:   Record<string, string[]>
  subcadenasByCity:   Record<string, string[]>
  ciudadesByDept:     Record<string, string[]>
  pdvCountByDept:     Record<string, number>
  pdvCountByCity:     Record<string, number>
}
const BM_EMPTY: BmData = {
  cadenas: [], subcadenas: [], departamentos: [], ciudades: [],
  subcadenasByCadena: {}, cadenaBySub: {},
  subcadenasByDept: {}, subcadenasByCity: {}, ciudadesByDept: {},
  pdvCountByDept: {}, pdvCountByCity: {},
}

function ModSellOut({ data, fil, bm, overrides, onEdit }: {
  data: Row[]; fil: Filtros; bm: BmData
  overrides: Record<string, Record<string, number>>
  onEdit: (ctx: EditCtx) => void
}) {
  const [vista, setVista] = useState<'costo' | 'precio'>('precio')
  const tasa = fil.tasa

  const MESES_CORTOS = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

  const bySemana = useMemo(() => {
    const m: Record<string, { key: string; label: string; sin: number; sout: number }> = {}
    data.forEach(r => {
      const mes = r.semana
      const ano = r.fecha.substring(0, 4)
      const key = `${ano}-${String(mes).padStart(2, '0')}`
      if (!m[key]) m[key] = { key, label: `${MESES_CORTOS[mes] || 'M' + mes} ${ano.slice(2)}`, sin: 0, sout: 0 }
      m[key].sin  += r.valor_sell_in_cop
      m[key].sout += r.valor_sell_out_cop
    })
    return Object.values(m).sort((a, b) => a.key.localeCompare(b.key)).map(r => ({
      semana: r.label,
      'Sell In':  fil.moneda === 'USD' ? Math.round(r.sin / tasa) : Math.round(r.sin / 1000),
      'Sell Out': fil.moneda === 'USD' ? Math.round(r.sout / tasa) : Math.round(r.sout / 1000),
      'Cobertura': r.sin > 0 ? Math.round((r.sout / r.sin) * 100) : 0,
    }))
  }, [data, fil.moneda, tasa])

  const byCadena = useMemo(() => {
    const m: Record<string, { cadena: string; sku: string; sout: number; und: number; pv_sum: number; n: number }> = {}
    data.forEach(r => {
      const k = bm.cadenaBySub[r.cadena] || r.cadena || '(Sin cadena)'
      const skuKey = r.sku || r.codigo_barras || k
      if (!m[k]) m[k] = { cadena: k, sku: skuKey, sout: 0, und: 0, pv_sum: 0, n: 0 }
      m[k].sout    += r.valor_sell_out_cop
      m[k].und     += r.unidades_sell_out
      m[k].pv_sum  += r.precio_venta
      m[k].n++
    })
    return Object.values(m).sort((a, b) => b.sout - a.sout).map(r => {
      const ov = overrides[r.cadena] || {}
      return {
        cadena: r.cadena,
        sku:    r.cadena,
        sout:   ov['valor_sell_out_cop'] ?? r.sout,
        und:    ov['unidades_sell_out']  ?? r.und,
        pv:     ov['precio_venta']       ?? (r.n > 0 ? Math.round(r.pv_sum / r.n) : 0),
      }
    })
  }, [data, bm, overrides])

  const totalSin  = data.reduce((s, r) => s + r.valor_sell_in_cop, 0)
  const totalSout = data.reduce((s, r) => s + r.valor_sell_out_cop, 0)
  const cobertura = totalSin > 0 ? (totalSout / totalSin * 100) : 0

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-black text-slate-800 text-base">Análisis Sell Out</h2>
        <div className="flex items-center gap-2">
          {(['precio', 'costo'] as const).map(v => (
            <button key={v} onClick={() => setVista(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${vista === v ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              A {v === 'precio' ? 'Precio Venta' : 'Costo'}
            </button>
          ))}
          <button onClick={() => exportCSV(byCadena, 'sell_out.csv')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs font-semibold">
            <Download size={12} /> CSV
          </button>
        </div>
      </div>

      {/* Cobertura macro */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Cobertura Sell In → Sell Out</p>
          <p className="text-3xl font-black" style={{ color: cobertura > 85 ? C.green : cobertura > 70 ? C.amber : C.red }}>
            {cobertura.toFixed(1)}%
          </p>
          <p className="text-xs text-slate-400 mt-1">Inventario implícito: {(100 - cobertura).toFixed(1)}%</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Total Sell Out</p>
          <p className="text-2xl font-black text-blue-700">{fmtCOP(totalSout, fil.moneda, tasa)}</p>
          <p className="text-xs text-slate-400 mt-1">{data.reduce((s, r) => s + r.unidades_sell_out, 0).toLocaleString('es-CO')} unidades</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Precio Prom. Venta</p>
          <p className="text-2xl font-black text-slate-800">
            {fmtCOP(data.reduce((s, r) => s + r.precio_venta, 0) / Math.max(data.length, 1), fil.moneda, tasa)}
          </p>
          <p className="text-xs text-slate-400 mt-1">por unidad</p>
        </div>
      </div>

      {/* Sell In vs Sell Out comparativo */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <h3 className="font-bold text-slate-700 text-sm mb-4">Sell Out Mensual — Tendencia</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={bySemana} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="semana" tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <YAxis yAxisId="val" tick={{ fontSize: 10, fill: '#94a3b8' }} width={52} />
            <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 10, fill: '#94a3b8' }} width={40} unit="%" />
            <Tooltip content={<ChartTip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="val" dataKey="Sell In"  fill={C.violet} radius={[3, 3, 0, 0]} />
            <Bar yAxisId="val" dataKey="Sell Out" fill={C.blue}   radius={[3, 3, 0, 0]} />
            <Line yAxisId="pct" type="monotone" dataKey="Cobertura" stroke={C.green} strokeWidth={2} dot={false} name="Cobertura %" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Sell Out por región */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-700 text-sm">Sell Out por Cadena</h3>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50">
              {['Cadena', 'Unidades', 'Valor Sell Out', '% del Total'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {byCadena.map((r, i) => (
              <tr key={i} className="border-t border-slate-50 hover:bg-slate-50/60">
                <td className="px-4 py-2.5 font-semibold text-slate-700">{r.cadena}</td>
                <td className="px-4 py-2.5 tabular-nums text-slate-600">{r.und.toLocaleString('es-CO')}</td>
                <td className="px-4 py-2.5 font-semibold tabular-nums text-blue-700">{fmtCOP(r.sout, fil.moneda, tasa)}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-slate-100 rounded-full">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: (r.sout / totalSout * 100) + '%' }} />
                    </div>
                    <span className="text-slate-500 tabular-nums">{(r.sout / totalSout * 100).toFixed(1)}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Distribución por Departamento (Base Maestra) */}
      {bm.departamentos.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-700 text-sm">Distribución por Departamento</h3>
            <span className="text-[10px] text-slate-400 bg-slate-50 px-2 py-1 rounded-md">Base Maestra</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50">
                  {['Departamento', 'PDVs', 'Cadenas presentes', 'Subcadenas', 'Sell Out (cadenas activas)'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bm.departamentos.map((dept, i) => {
                  const cadenas   = [...new Set((bm.subcadenasByDept[dept] || []).map(s => bm.cadenaBySub[s] || s))]
                  const pdvs      = bm.pdvCountByDept[dept] || 0
                  const subcads   = bm.subcadenasByDept[dept] || []
                  const sout      = data
                    .filter(r => cadenas.includes(r.cadena))
                    .reduce((s, r) => s + r.valor_sell_out_cop, 0)
                  return (
                    <tr key={i} className="border-t border-slate-50 hover:bg-slate-50/60">
                      <td className="px-4 py-2.5 font-semibold text-slate-700">{dept}</td>
                      <td className="px-4 py-2.5 font-bold text-blue-700 tabular-nums">{pdvs.toLocaleString('es-CO')}</td>
                      <td className="px-4 py-2.5 text-slate-600">{cadenas.join(', ') || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-500 max-w-[200px] truncate">{subcads.join(', ') || '—'}</td>
                      <td className="px-4 py-2.5 font-semibold text-green-700 tabular-nums">
                        {sout > 0 ? fmtCOP(sout, fil.moneda, tasa) : <span className="text-slate-300">Sin datos</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
//  MÓDULO 4 — INVENTARIO
// ══════════════════════════════════════════════════════════════════════════════
function ModInventario({ data, fil, overrides, onEdit }: {
  data: Row[]; fil: Filtros
  overrides: Record<string, Record<string, number>>
  onEdit: (ctx: EditCtx) => void
}) {
  const tasa = fil.tasa

  const invData = useMemo(() => {
    const m: Record<string, { sku: string; ean: string; desc: string; cat: string; subcat: string; inv: number; pc: number; sout_daily: number }> = {}
    data.forEach(r => {
      const key = r.sku || r.codigo_barras
      if (!key) return
      if (!m[key]) m[key] = { sku: r.sku, ean: r.codigo_barras || r.sku, desc: r.descripcion || r.sku, cat: r.categoria, subcat: r.subcategoria, inv: r.inventario_unidades, pc: r.precio_compra, sout_daily: 0 }
      // inv y pc se fijan en la primera fila — no acumular (es snapshot)
      if (m[key].pc === 0 && r.precio_compra > 0) m[key].pc = r.precio_compra
      m[key].sout_daily += r.unidades_sell_out
    })
    const SEMANAS = 13
    return Object.values(m)
      .filter(r => r.inv > 0)
      .map(r => {
        const inv      = overrides[r.sku]?.['inventario_unidades'] ?? r.inv
        const avgDaily = r.sout_daily / (SEMANAS * 7)
        const doi      = avgDaily > 0 ? Math.round(inv / avgDaily) : null
        const valorCop = Math.round(inv * r.pc)
        return { ...r, inv, doi, avgDaily: +avgDaily.toFixed(1), valorCop }
      })
      .sort((a, b) => a.valorCop - b.valorCop)   // de menor a mayor
  }, [data, overrides])

  const doiChart = invData.filter(r => r.doi !== null).map(r => ({
    name: (r.desc || r.ean).slice(0, 20),
    DOI:  r.doi!,
  }))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-black text-slate-800 text-base">Inventario — Días Disponibles</h2>
        <button onClick={() => exportCSV(invData, 'inventario.csv')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs font-semibold">
          <Download size={12} /> CSV
        </button>
      </div>

      {/* KPI total inventario $ */}
      {(() => {
        const totalCop = invData.reduce((s, r) => s + r.valorCop, 0)
        return totalCop > 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Inventario Total (Valor COP)</p>
              <p className="text-3xl font-black text-blue-700">{fmtCOP(totalCop, fil.moneda, tasa)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-400">{invData.reduce((s, r) => s + r.inv, 0).toLocaleString('es-CO')} unidades</p>
              <p className="text-[10px] text-slate-400">{invData.length} SKUs</p>
            </div>
          </div>
        ) : null
      })()}

      {/* Alertas */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Quiebre de Stock', count: invData.filter(r => r.doi !== null && r.doi < 7).length,  color: C.red,   icon: <AlertTriangle size={14} /> },
          { label: 'Stock Crítico',    count: invData.filter(r => r.doi !== null && r.doi >= 7 && r.doi < 30).length, color: C.amber, icon: <Clock size={14} /> },
          { label: 'Stock OK',         count: invData.filter(r => r.doi !== null && r.doi >= 30).length, color: C.green, icon: <CheckCircle size={14} /> },
        ].map(a => (
          <div key={a.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: a.color + '15', color: a.color }}>
              {a.icon}
            </div>
            <div>
              <p className="text-2xl font-black" style={{ color: a.color }}>{a.count}</p>
              <p className="text-xs text-slate-400">{a.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* DOI Chart */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <h3 className="font-bold text-slate-700 text-sm mb-4">Días de Inventario Disponible (DOI) por SKU</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={doiChart} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: '#64748b' }} width={130} />
            <Tooltip content={<ChartTip />} />
            <ReferenceLine x={30} stroke={C.amber} strokeDasharray="4 4" label={{ value: '30d', fontSize: 9, fill: C.amber }} />
            <Bar dataKey="DOI" radius={[0, 4, 4, 0]}>
              {doiChart.map((d, i) => <Cell key={i} fill={d.DOI < 7 ? C.red : d.DOI < 30 ? C.amber : C.green} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['Cód. Barras', 'Descripción', 'Categoría', 'Subcategoría', 'Inventario (Q)', 'Inventario ($)', 'Venta Diaria Prom', 'DOI', 'Estado', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invData.map((r, i) => {
                const estado = r.doi === null ? 'Sin datos' : r.doi < 7 ? 'Quiebre' : r.doi < 30 ? 'Crítico' : r.doi > 90 ? 'Sobrestock' : 'OK'
                const eColor = estado === 'OK' ? C.green : estado === 'Crítico' ? C.amber : estado === 'Quiebre' ? C.red : estado === 'Sobrestock' ? C.violet : C.slate
                return (
                  <tr key={i} className="border-t border-slate-50 hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 font-mono text-[10px] text-slate-400">{r.ean}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-700 max-w-[160px] truncate">{r.desc}</td>
                    <td className="px-4 py-2.5 text-slate-500">{r.cat}</td>
                    <td className="px-4 py-2.5 text-slate-500">{r.subcat}</td>
                    <td className="px-4 py-2.5 font-bold text-slate-700 tabular-nums">{r.inv.toLocaleString('es-CO')}</td>
                    <td className="px-4 py-2.5 font-semibold text-blue-700 tabular-nums">{fmtPrice(r.valorCop, fil.moneda, tasa)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.avgDaily.toFixed(1)} u/día</td>
                    <td className="px-4 py-2.5 font-black text-lg" style={{ color: eColor }}>{r.doi ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: eColor + '18', color: eColor }}>
                        {estado}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <button onClick={() => onEdit({ modulo: 'inventario', clave: r.sku, desc: r.desc,
                        fields: [{ label: 'Inventario (Q)', field: 'inventario_unidades', current: r.inv }] })}
                        className="p-1.5 rounded-lg hover:bg-emerald-100 text-emerald-400 hover:text-emerald-700 transition-colors" title="Ajustar">✏</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
//  MÓDULO 5 — DEVOLUCIONES
// ══════════════════════════════════════════════════════════════════════════════
function ModDevoluciones({ data, fil, overrides, onEdit }: {
  data: Row[]; fil: Filtros
  overrides: Record<string, Record<string, number>>
  onEdit: (ctx: EditCtx) => void
}) {
  const UMBRAL = 5

  const byKey = useMemo(() => {
    const m: Record<string, { key: string; cadena: string; region: string; devol: number; sin: number }> = {}
    data.forEach(r => {
      const k = `${r.cadena}|${r.region}`
      if (!m[k]) m[k] = { key: k, cadena: r.cadena, region: r.region, devol: 0, sin: 0 }
      m[k].devol += r.devoluciones_unidades
      m[k].sin   += r.unidades_sell_in
    })
    return Object.values(m).map(r => {
      const devol = overrides[r.key]?.['devoluciones_unidades'] ?? r.devol
      return { ...r, devol, pct: r.sin > 0 ? (devol / r.sin * 100) : 0 }
    }).sort((a, b) => b.pct - a.pct)
  }, [data, overrides])

  const tendencia = useMemo(() => {
    const m: Record<number, { sem: number; devol: number; sin: number }> = {}
    data.forEach(r => {
      if (!m[r.semana]) m[r.semana] = { sem: r.semana, devol: 0, sin: 0 }
      m[r.semana].devol += r.devoluciones_unidades
      m[r.semana].sin   += r.unidades_sell_in
    })
    return Object.values(m).sort((a, b) => a.sem - b.sem).map(r => ({
      semana:    'S' + r.sem,
      'Devol.':  r.devol,
      '% Devol': r.sin > 0 ? +(r.devol / r.sin * 100).toFixed(2) : 0,
    }))
  }, [data])

  const anomalias = byKey.filter(r => r.pct > UMBRAL)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-black text-slate-800 text-base">Devoluciones</h2>
        <div className="flex items-center gap-2">
          {anomalias.length > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-red-700 bg-red-50 border border-red-100">
              <AlertTriangle size={12} /> {anomalias.length} anomalías &gt;{UMBRAL}%
            </span>
          )}
          <button onClick={() => exportCSV(byKey, 'devoluciones.csv')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs font-semibold">
            <Download size={12} /> CSV
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <h3 className="font-bold text-slate-700 text-sm mb-4">Tendencia de Devoluciones</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={tendencia} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="semana" tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <YAxis yAxisId="und" tick={{ fontSize: 10, fill: '#94a3b8' }} width={40} />
            <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 10, fill: '#94a3b8' }} width={40} unit="%" />
            <Tooltip content={<ChartTip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine yAxisId="pct" y={UMBRAL} stroke={C.red} strokeDasharray="4 4" label={{ value: `Umbral ${UMBRAL}%`, fontSize: 9, fill: C.red }} />
            <Bar yAxisId="und"  dataKey="Devol."  fill={C.redL} stroke={C.red} strokeWidth={1} radius={[3,3,0,0]} />
            <Line yAxisId="pct" type="monotone" dataKey="% Devol" stroke={C.red} strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['Cadena', 'Ciudad', 'Devol. Unidades', 'Sell In Unidades', '% Devolución', 'Flag', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byKey.map((r, i) => (
                <tr key={i} className={`border-t border-slate-50 hover:bg-slate-50/60 ${r.pct > UMBRAL ? 'bg-red-50/30' : ''}`}>
                  <td className="px-4 py-2.5 font-semibold text-slate-700">{r.cadena}</td>
                  <td className="px-4 py-2.5 text-slate-500">{r.region}</td>
                  <td className="px-4 py-2.5 text-slate-600">{r.devol.toLocaleString('es-CO')}</td>
                  <td className="px-4 py-2.5 text-slate-600">{r.sin.toLocaleString('es-CO')}</td>
                  <td className="px-4 py-2.5">
                    <span className="font-bold text-sm" style={{ color: r.pct > UMBRAL ? C.red : r.pct > 2 ? C.amber : C.green }}>
                      {r.pct.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {r.pct > UMBRAL && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
                        <AlertTriangle size={9} /> Anomalía
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <button onClick={() => onEdit({ modulo: 'devol', clave: r.key, desc: `${r.cadena} · ${r.region}`,
                      fields: [{ label: 'Devoluciones (Q)', field: 'devoluciones_unidades', current: r.devol }] })}
                      className="p-1.5 rounded-lg hover:bg-red-100 text-red-400 hover:text-red-700 transition-colors" title="Ajustar">✏</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
//  MÓDULO 6 — PRECIOS Y COMPARABLES
// ══════════════════════════════════════════════════════════════════════════════
// ── Modal de edición de precios ───────────────────────────────────────────────
interface PrecioRow {
  sku: string; desc: string; cat: string; subcat: string
  pc: number; pcomp: number; pv: number
  spread: number; margen: number | null
}

function EditPrecioModal({
  row, moneda, tasa, onClose, onSaved,
}: {
  row: PrecioRow
  moneda: 'COP' | 'USD'
  tasa: number
  onClose: () => void
  onSaved: (sku: string, updates: Partial<PrecioRow>) => void
}) {
  const [pc,    setPc]    = useState(String(row.pc))
  const [pcomp, setPcomp] = useState(String(row.pcomp))
  const [pv,    setPv]    = useState(String(row.pv))
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')

  const save = async () => {
    setSaving(true); setErr('')
    const updates: Record<string, number> = {}
    if (pc.trim())    updates.precio_compra     = Math.round(Number(pc))
    if (pcomp.trim()) updates.precio_comparable  = Math.round(Number(pcomp))
    if (pv.trim())    updates.precio_venta      = Math.round(Number(pv))

    try {
      const res = await fetch('/api/precios/colombia', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cod_interno: row.sku, ...updates }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error || 'Error guardando')
      onSaved(row.sku, {
        pc:    updates.precio_compra     ?? row.pc,
        pcomp: updates.precio_comparable  ?? row.pcomp,
        pv:    updates.precio_venta      ?? row.pv,
      })
      onClose()
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  const field = (label: string, val: string, set: (v: string) => void, hint?: string) => (
    <div>
      <label className="text-xs font-semibold text-slate-500 mb-1 block">{label}</label>
      <input
        type="number" value={val} onChange={e => set(e.target.value)}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-400"
        placeholder="0"
      />
      {hint && <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="font-black text-slate-800 text-base">Editar Precios</h3>
            <p className="text-xs text-slate-400 mt-0.5 max-w-[240px] truncate">{row.desc}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg leading-none">✕</button>
        </div>

        <div className="space-y-4">
          {field('P. Compra (COP)', pc, setPc, 'Precio al que compras el producto')}
          {field('P. Comparable (COP)', pcomp, setPcomp, 'Benchmark / competencia / período anterior')}
          {field('P. Venta (COP)', pv, setPv, 'Precio de venta regular al consumidor final')}
        </div>

        {err && <p className="text-xs text-red-500 mt-3">{err}</p>}

        <div className="flex gap-3 mt-5">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 font-semibold">
            Cancelar
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-bold hover:bg-violet-700 disabled:opacity-50 transition-colors">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ModPrecios({ data, fil }: { data: Row[]; fil: Filtros }) {
  const tasa   = fil.tasa
  const moneda = fil.moneda
  const [editRow,    setEditRow]    = useState<PrecioRow | null>(null)
  const [overrides,  setOverrides]  = useState<Record<string, Partial<PrecioRow>>>({})

  const precios = useMemo(() => {
    const m: Record<string, {
      sku: string; desc: string; cat: string; subcat: string
      pc_sum: number; pv_sum: number; pcomp_sum: number; n: number
    }> = {}
    data.forEach(r => {
      const key = r.sku || r.codigo_barras
      if (!key) return
      if (!m[key]) m[key] = {
        sku: key, desc: r.descripcion || r.sku, cat: r.categoria, subcat: r.subcategoria,
        pc_sum: 0, pv_sum: 0, pcomp_sum: 0, n: 0,
      }
      m[key].pc_sum    += r.precio_compra
      m[key].pv_sum    += r.precio_venta
      m[key].pcomp_sum += r.precio_comparable
      m[key].n++
    })
    return Object.values(m)
      .filter(r => r.pc_sum > 0)
      .map(r => {
        const base  = overrides[r.sku] || {}
        const pc    = base.pc    ?? Math.round(r.pc_sum    / r.n)
        const pcomp = base.pcomp ?? Math.round(r.pcomp_sum / r.n)
        const pv    = base.pv    ?? Math.round(r.pv_sum    / r.n)
        // Spread = P.Compra − P.Comparable
        const spread = pc - pcomp
        // Margen neto sobre precio de venta
        const margen = pv > 0 ? +((pv - pc) / pv * 100).toFixed(1) : null
        return { sku: r.sku, desc: r.desc, cat: r.cat, subcat: r.subcat,
          pc, pcomp, pv, spread, margen } as PrecioRow
      })
  }, [data, overrides])

  const chartData = useMemo(() => precios.map(r => ({
    name:         (r.desc || r.sku).slice(0, 16),
    'Compra':     moneda === 'USD' ? +(r.pc    / tasa).toFixed(2) : r.pc,
    'Comparable': moneda === 'USD' ? +(r.pcomp / tasa).toFixed(2) : r.pcomp,
    'Venta':      moneda === 'USD' ? +(r.pv    / tasa).toFixed(2) : r.pv,
  })), [precios, moneda, tasa])

  const handleSaved = (sku: string, updates: Partial<PrecioRow>) =>
    setOverrides(prev => ({ ...prev, [sku]: { ...(prev[sku] || {}), ...updates } }))

  const headers = [
    'Descripción',
    `P. Compra (${moneda})`,
    `P. Comparable (${moneda})`,
    'Spread',
    `P. Venta (${moneda})`,
    'Margen',
    '',
  ]

  return (
    <div className="space-y-5">
      {editRow && (
        <EditPrecioModal
          row={editRow} moneda={moneda} tasa={tasa}
          onClose={() => setEditRow(null)}
          onSaved={handleSaved}
        />
      )}

      <div className="flex items-center justify-between">
        <h2 className="font-black text-slate-800 text-base">Precios y Comparables</h2>
        <button onClick={() => exportCSV(precios, 'precios.csv')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs font-semibold">
          <Download size={12} /> CSV
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-700 text-sm">Base de Precios: Compra vs Comparable vs Venta</h3>
          <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">{moneda}</span>
        </div>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData} margin={{ top: 4, right: 16, left: 4, bottom: 48 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} angle={-30} textAnchor="end" height={56} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} width={62} />
            <Tooltip content={<ChartTip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Compra"     fill={C.violet} radius={[3,3,0,0]} />
            <Bar dataKey="Comparable" fill={C.slate}  radius={[3,3,0,0]} />
            <Bar dataKey="Venta"      fill={C.blue}   radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <p className="text-xs text-slate-400">Haz click en <span className="font-semibold text-violet-600">✏</span> para editar los precios de un SKU</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {headers.map(h => (
                  <th key={h} className="text-left px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {precios.map((r, i) => (
                <tr key={i} className="border-t border-slate-50 hover:bg-violet-50/30 transition-colors">
                  <td className="px-3 py-2.5 font-semibold text-slate-700 max-w-[160px] truncate">{r.desc}</td>
                  <td className="px-3 py-2.5 text-violet-700 font-bold tabular-nums">{fmtPrice(r.pc, moneda, tasa)}</td>
                  <td className="px-3 py-2.5 text-slate-500 tabular-nums">{fmtPrice(r.pcomp, moneda, tasa)}</td>
                  <td className="px-3 py-2.5 font-bold tabular-nums" style={{ color: r.spread > 0 ? C.amber : r.spread < 0 ? C.green : '#94a3b8' }}>
                    {r.spread !== 0 ? (r.spread > 0 ? '+' : '') + fmtPrice(r.spread, moneda, tasa) : '—'}
                  </td>
                  <td className="px-3 py-2.5 font-bold text-blue-800 tabular-nums">{fmtPrice(r.pv, moneda, tasa)}</td>
                  <td className="px-3 py-2.5 font-bold" style={{ color: r.margen !== null && r.margen >= 15 ? C.green : r.margen !== null && r.margen >= 8 ? C.amber : C.red }}>
                    {r.margen !== null ? r.margen + '%' : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <button onClick={() => setEditRow(r)}
                      className="p-1.5 rounded-lg hover:bg-violet-100 text-violet-400 hover:text-violet-700 transition-colors"
                      title="Editar precios">
                      ✏
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
//  TIPOS — AJUSTES
// ══════════════════════════════════════════════════════════════════════════════
interface Ajuste {
  id: number
  modulo: string
  clave: string
  descripcion: string
  campo: string
  valor_anterior: number | null
  valor_nuevo: number
  usuario: string | null
  created_at: string
}

interface EditCtx {
  modulo: string
  clave: string
  desc: string
  fields: { label: string; field: string; current: number }[]
}

// ══════════════════════════════════════════════════════════════════════════════
//  MODAL COMPARTIDO — AJUSTAR VALORES
// ══════════════════════════════════════════════════════════════════════════════
function EditAjusteModal({ ctx, onClose, onSaved }: {
  ctx: EditCtx
  onClose: () => void
  onSaved: (ajustes: Ajuste[]) => void
}) {
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(ctx.fields.map(f => [f.field, String(f.current)]))
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    setSaving(true); setErr('')
    try {
      const changed = ctx.fields.filter(f => {
        const v = Number(vals[f.field])
        return !isNaN(v) && v !== f.current
      })
      if (changed.length === 0) { onClose(); return }
      await Promise.all(changed.map(f =>
        fetch('/api/ajustes/colombia', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            modulo: ctx.modulo,
            clave: ctx.clave,
            descripcion: ctx.desc,
            campo: f.field,
            valor_anterior: f.current,
            valor_nuevo: Number(vals[f.field]),
          }),
        }).then(r => r.json()).then(j => { if (j.error) throw new Error(j.error) })
      ))
      const fresh = await fetch('/api/ajustes/colombia').then(r => r.json())
      onSaved(fresh)
    } catch (e: any) {
      setErr(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="font-black text-slate-800 text-base">Ajustar Valores</h3>
            <p className="text-xs text-slate-400 mt-0.5 max-w-[240px] truncate">{ctx.desc}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg leading-none">✕</button>
        </div>
        <div className="space-y-4">
          {ctx.fields.map(f => (
            <div key={f.field}>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">{f.label}</label>
              <input
                type="number"
                value={vals[f.field]}
                onChange={e => setVals(prev => ({ ...prev, [f.field]: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="0"
              />
            </div>
          ))}
        </div>
        {err && <p className="text-xs text-red-500 mt-3">{err}</p>}
        <div className="flex gap-3 mt-5">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 font-semibold">
            Cancelar
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
//  MÓDULO 7 — HISTORIAL DE AJUSTES
// ══════════════════════════════════════════════════════════════════════════════
function ModHistorial({ ajustes }: { ajustes: Ajuste[] }) {
  const CAMPO_LABEL: Record<string, string> = {
    unidades_sell_in:     'Unidades Sell In',
    valor_sell_in_cop:    'Valor Sell In',
    unidades_sell_out:    'Unidades Sell Out',
    valor_sell_out_cop:   'Valor Sell Out',
    precio_venta:         'P. Venta',
    inventario_unidades:  'Inventario (Q)',
    devoluciones_unidades:'Devoluciones',
  }
  const MODULO_LABEL: Record<string, string> = {
    sellin:     'Sell In',
    sellout:    'Sell Out',
    inventario: 'Inventario',
    devol:      'Devoluciones',
  }

  const fmt = (iso: string) => {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
    return `${pad(d.getDate())} ${MESES[d.getMonth()]} ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  return (
    <div className="space-y-5">
      <h2 className="font-black text-slate-800 text-base">Historial de Ajustes</h2>
      {ajustes.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-slate-400 bg-white rounded-2xl border border-slate-100 shadow-sm">
          <History size={32} className="mb-3 opacity-30" />
          <p className="font-semibold text-sm">Sin ajustes registrados</p>
          <p className="text-xs mt-1">Los cambios manuales en cada módulo aparecerán aquí.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['Fecha', 'Módulo', 'Descripción', 'Campo', 'Valor Anterior', 'Valor Nuevo', 'Usuario'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ajustes.map((a, i) => (
                  <tr key={a.id ?? i} className="border-t border-slate-50 hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap font-mono text-[10px]">{fmt(a.created_at)}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700">
                        {MODULO_LABEL[a.modulo] || a.modulo}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700 font-semibold max-w-[160px] truncate">{a.descripcion}</td>
                    <td className="px-4 py-2.5 text-slate-500">{CAMPO_LABEL[a.campo] || a.campo}</td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-400">
                      {a.valor_anterior !== null ? a.valor_anterior.toLocaleString('es-CO') : '—'}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums font-bold text-blue-700">
                      {a.valor_nuevo.toLocaleString('es-CO')}
                    </td>
                    <td className="px-4 py-2.5 text-slate-400">{a.usuario || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
//  FILTROS GLOBALES
// ══════════════════════════════════════════════════════════════════════════════
function FilterDropdown({ label, options, selected, onChange }: {
  label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v])
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50/50 transition-all whitespace-nowrap">
        <Filter size={10} className="text-slate-400" />
        {label}
        {selected.length > 0 && <span className="bg-blue-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px]">{selected.length}</span>}
        <ChevronDown size={10} className="text-slate-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-20 min-w-[180px] max-h-60 overflow-y-auto py-1.5">
            {options.map(o => (
              <label key={o} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)} className="accent-blue-600 rounded" />
                <span className="text-xs text-slate-700">{o}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
//  PÁGINA PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════
const MODULOS = [
  { id: 'kpis',       label: 'Vista General',     icon: <BarChart2 size={14} /> },
  { id: 'sellin',     label: 'Sell In',            icon: <ShoppingCart size={14} /> },
  { id: 'sellout',    label: 'Sell Out',           icon: <TrendingUp size={14} /> },
  { id: 'inventario', label: 'Inventario',         icon: <Package size={14} /> },
  { id: 'devol',      label: 'Devoluciones',       icon: <RotateCcw size={14} /> },
  { id: 'precios',    label: 'Precios',            icon: <DollarSign size={14} /> },
  { id: 'historial',  label: 'Historial',          icon: <Clock size={14} /> },
]

export default function VistaColombia() {
  const [modulo, setModulo] = useState('kpis')
  const [allData, setAllData]     = useState<Row[]>([])
  const [loading, setLoading]     = useState(true)
  const [bm, setBm]               = useState<BmData>(BM_EMPTY)
  const [ajustes, setAjustes]     = useState<Ajuste[]>([])
  const [editCtx, setEditCtx]     = useState<EditCtx | null>(null)
  const [opsCadenas, setOpsCadenas]   = useState<string[]>([])
  const [opsFormatos, setOpsFormatos] = useState<string[]>([])
  const [opsSubcats, setOpsSubcats]   = useState<string[]>([])
  const [fil, setFil] = useState<Filtros>({
    fechaDesde:   '',
    fechaHasta:   '',
    formato:      [],
    subcategoria: [],
    cadena:       [],
    subcadena:    [],
    region:       [],
    departamento: [],
    ciudad:       [],
    moneda:       'COP',
    tasa:         4320,
  })

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/ventas/colombia').then(r => r.json()),
      fetch('/api/inventario/colombia').then(r => r.json()),
      fetch('/api/precios/colombia').then(r => r.json()).catch(() => ({ byEan: {}, bySku: {} })),
      fetch('/api/base-maestra/colombia').then(r => r.json()).catch(() => ({})),
      fetch('/api/ajustes/colombia').then(r => r.json()).catch(() => ([])),
    ])
      .then(([ventasD, invD, preciosD, bmD, ajustesD]) => {
        const eanQty:     Record<string, number> = invD.eanQtyMap  || {}
        const skuQty:     Record<string, number> = invD.skuQtyMap  || {}
        const skuEanMap:  Record<string, string> = invD.skuEanMap  || {}
        const skuDescMap: Record<string, string> = invD.skuDescMap || {}
        const descMap:    Record<string, string> = invD.descMap    || {}
        const precByEan:  Record<string, { pc: number; pcomp: number; pv: number }> = preciosD.byEan || {}
        const precBySku:  Record<string, { pc: number; pcomp: number; pv: number }> = preciosD.bySku || {}

        // misma lógica de normalización que el API de inventario
        const normEan = (raw: string): string => {
          const s = (raw || '').replace(/\D/g, '')
          if (s.length < 2) return raw.trim()
          return s.length >= 13 ? s.slice(0, 13) : s.padStart(13, '0')
        }

        const apiRows: Row[] = (ventasD.rows || []).map((row: any) => {
          const skuKey   = (row.sku || '').trim().toUpperCase()
          // ignorar "0" o cadenas vacías como código de barras
          const rawBar   = (row.codigo_barras || '').trim()
          const barcode  = /^0+$/.test(rawBar) ? '' : rawBar
          const eanNorm  = normEan(barcode)
          const skuAsEan = normEan(row.sku || '')
          // 1. cod_interno exacto  2. EAN de codigo_barras normalizado  3. SKU interpretado como EAN
          const invUnits = skuQty[skuKey] ?? eanQty[eanNorm] ?? eanQty[skuAsEan] ?? 0
          // EAN para mostrar: inventario (fuente de verdad) > barcode de ventas > sku como ean > sku
          const eanDisplay = skuEanMap[skuKey] || (barcode || null) || (skuAsEan.length >= 8 ? skuAsEan : null) || row.sku || ''
          // descripción: catálogo maestro (cod_interno) > catálogo (EAN) > sellout
          const desc     = skuDescMap[skuKey] || descMap[eanNorm] || descMap[skuAsEan] || row.descripcion || row.sku || ''
          // precios: tabla precios_colombia (cod_interno > EAN) > precio_promedio de ventas
          const precios  = precBySku[skuKey] || precByEan[eanNorm] || precByEan[skuAsEan] || null
          return {
            fecha:                 `${row.ano}-${String(row.mes).padStart(2, '0')}-01`,
            semana:                row.mes,
            cadena:                row.cadena || '',
            subcadena:             '',
            formato:               row.formato || '',
            region:                '',
            departamento:          '',
            ciudad:                '',
            sku:                   row.sku || '',
            codigo_barras:         eanDisplay,
            descripcion:           desc,
            categoria:             row.categoria || '',
            subcategoria:          row.subcategoria || '',
            unidades_sell_in:      0,
            valor_sell_in_cop:     0,
            unidades_sell_out:     Number(row.ventas_unidades) || 0,
            valor_sell_out_cop:    Number(row.ventas_valor) || 0,
            precio_compra:         precios?.pc    || 0,
            precio_comparable:     precios?.pcomp || 0,
            precio_venta:          precios?.pv    || Number(row.precio_promedio) || 0,
            inventario_unidades:   invUnits,
            devoluciones_unidades: 0,
            tasa_usd_cop:          4320,
          }
        })
        setAllData(apiRows)
        setOpsCadenas(ventasD.cadenas || [])
        setOpsFormatos(ventasD.formatos || [])
        setOpsSubcats([...new Set(apiRows.map(r => r.subcategoria).filter(Boolean))].sort() as string[])
        setBm({
          cadenas:            bmD.cadenas            || [],
          subcadenas:         bmD.subcadenas         || [],
          departamentos:      bmD.departamentos      || [],
          ciudades:           bmD.ciudades           || [],
          subcadenasByCadena: bmD.subcadenasByCadena || {},
          cadenaBySub:        bmD.cadenaBySub        || {},
          subcadenasByDept:   bmD.subcadenasByDept   || {},
          subcadenasByCity:   bmD.subcadenasByCity   || {},
          ciudadesByDept:     bmD.ciudadesByDept     || {},
          pdvCountByDept:     bmD.pdvCountByDept     || {},
          pdvCountByCity:     bmD.pdvCountByCity     || {},
        })
        setAjustes(Array.isArray(ajustesD) ? ajustesD : [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const setF = useCallback(<K extends keyof Filtros>(key: K, val: Filtros[K]) => {
    setFil(prev => ({ ...prev, [key]: val }))
  }, [])

  const filteredData = useMemo(() => {
    const mesRow = (fecha: string) => fecha.substring(0, 7) // "YYYY-MM"

    // v_ventas.cadena = base_maestra.subcadena, so use subcadena sets for cross-reference
    // Subcadenas (= v_ventas cadena values) present in selected departamentos
    const subcadsDept = fil.departamento.length
      ? new Set(fil.departamento.flatMap(d => bm.subcadenasByDept[d] || []))
      : null

    // Subcadenas present in selected ciudades
    const subcadsCiud = fil.ciudad.length
      ? new Set(fil.ciudad.flatMap(c => bm.subcadenasByCity[c] || []))
      : null

    return allData.filter(r => {
      if (fil.formato.length      && !fil.formato.includes(r.formato.trim()))                              return false
      if (fil.subcategoria.length && !fil.subcategoria.includes(r.subcategoria.trim()))                   return false
      // fil.cadena holds parent cadena values; v_ventas.cadena = base_maestra.subcadena → look up parent
      if (fil.cadena.length       && !fil.cadena.includes(bm.cadenaBySub[r.cadena] || r.cadena))         return false
      // fil.subcadena holds subcadena values = v_ventas.cadena directly
      if (fil.subcadena.length    && !fil.subcadena.includes(r.cadena.trim()))                            return false
      if (fil.fechaDesde          && mesRow(r.fecha) < fil.fechaDesde)                  return false
      if (fil.fechaHasta          && mesRow(r.fecha) > fil.fechaHasta)                  return false
      if (subcadsDept             && !subcadsDept.has(r.cadena))                        return false
      if (subcadsCiud             && !subcadsCiud.has(r.cadena))                        return false
      return true
    })
  }, [allData, fil, bm])

  const overrideMap = useMemo(() => {
    const m: Record<string, Record<string, Record<string, number>>> = {}
    for (const a of ajustes) {
      if (!m[a.modulo]) m[a.modulo] = {}
      if (!m[a.modulo][a.clave]) m[a.modulo][a.clave] = {}
      if (m[a.modulo][a.clave][a.campo] === undefined) {
        m[a.modulo][a.clave][a.campo] = Number(a.valor_nuevo)
      }
    }
    return m
  }, [ajustes])

  const getOv = useCallback((modulo: string, clave: string, campo: string, fallback: number): number => {
    return overrideMap[modulo]?.[clave]?.[campo] ?? fallback
  }, [overrideMap])

  const activeFiltersCount = [fil.formato, fil.subcategoria, fil.cadena, fil.subcadena, fil.departamento, fil.ciudad]
    .reduce((s, a) => s + a.length, 0)

  const mod = MODULOS.find(m => m.id === modulo)!

  return (
    <div className="min-h-screen bg-slate-50/60">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
        <div className="px-6 py-3">
          {/* Title row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-yellow-400 flex items-center justify-center shadow-sm">
                <span className="text-base">🇨🇴</span>
              </div>
              <div>
                <h1 className="font-black text-slate-900 text-sm leading-none">Colombia</h1>
                <p className="text-[10px] text-slate-400 mt-0.5">Dashboard Comercial · BL Foods</p>
              </div>
            </div>

            {/* Moneda toggle */}
            <div className="flex items-center gap-2">
              {activeFiltersCount > 0 && (
                <button onClick={() => setFil(prev => ({ ...prev, formato: [], subcategoria: [], cadena: [], subcadena: [], departamento: [], ciudad: [] }))}
                  className="text-[10px] text-slate-400 hover:text-red-500 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-50 transition-all">
                  <RotateCcw size={10} /> Limpiar {activeFiltersCount} filtro{activeFiltersCount > 1 ? 's' : ''}
                </button>
              )}
              <div className="flex rounded-lg overflow-hidden border border-slate-200">
                {(['COP', 'USD'] as const).map(m => (
                  <button key={m} onClick={() => setF('moneda', m)}
                    className={`px-3 py-1.5 text-xs font-bold transition-all ${fil.moneda === m ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                    {m}
                  </button>
                ))}
              </div>
              {fil.moneda === 'USD' && (
                <div className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-2.5 py-1.5">
                  <span className="text-[10px] text-slate-400">Tasa</span>
                  <input type="number" value={fil.tasa} onChange={e => setF('tasa', Number(e.target.value))}
                    className="w-16 text-xs font-bold text-slate-700 outline-none bg-transparent" />
                  <span className="text-[10px] text-slate-400">COP</span>
                </div>
              )}
            </div>
          </div>

          {/* Filtros row */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Fechas */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 h-8">
              <span className="text-[10px] text-slate-400 font-semibold">Desde</span>
              <input type="month" value={fil.fechaDesde} onChange={e => setF('fechaDesde', e.target.value)}
                className="text-xs text-slate-700 outline-none bg-transparent font-semibold" />
              <span className="text-slate-300">→</span>
              <input type="month" value={fil.fechaHasta} onChange={e => setF('fechaHasta', e.target.value)}
                className="text-xs text-slate-700 outline-none bg-transparent font-semibold" />
            </div>
            {/* Cadena → Subcadena (jerárquico) */}
            <FilterDropdown
              label="Cadena"
              options={bm.cadenas.length ? bm.cadenas : opsCadenas}
              selected={fil.cadena}
              onChange={v => setF('cadena', v)}
            />
            {bm.subcadenas.length > 0 && (
              <FilterDropdown
                label="Subcadena"
                options={
                  fil.cadena.length
                    ? fil.cadena.flatMap(c => bm.subcadenasByCadena[c] || []).filter((v, i, a) => a.indexOf(v) === i).sort()
                    : bm.subcadenas
                }
                selected={fil.subcadena}
                onChange={v => setF('subcadena', v)}
              />
            )}
            {/* Departamento → Ciudad (jerárquico) */}
            {bm.departamentos.length > 0 && (
              <FilterDropdown
                label="Departamento"
                options={bm.departamentos}
                selected={fil.departamento}
                onChange={v => {
                  setF('departamento', v)
                  // reset ciudad si ya no pertenece al nuevo departamento
                  if (fil.ciudad.length) {
                    const validCiudades = new Set(v.flatMap(d => bm.ciudadesByDept[d] || []))
                    const kept = fil.ciudad.filter(c => validCiudades.has(c))
                    if (kept.length !== fil.ciudad.length) setF('ciudad', kept)
                  }
                }}
              />
            )}
            {bm.ciudades.length > 0 && (
              <FilterDropdown
                label="Ciudad"
                options={
                  fil.departamento.length
                    ? fil.departamento.flatMap(d => bm.ciudadesByDept[d] || []).filter((v, i, a) => a.indexOf(v) === i).sort()
                    : bm.ciudades
                }
                selected={fil.ciudad}
                onChange={v => setF('ciudad', v)}
              />
            )}
            <FilterDropdown label="Formato"      options={opsFormatos} selected={fil.formato}      onChange={v => setF('formato', v)} />
            <FilterDropdown label="Subcategoría" options={opsSubcats}  selected={fil.subcategoria} onChange={v => setF('subcategoria', v)} />
            <span className="ml-auto text-[10px] text-slate-400 font-semibold">
              {loading ? 'Cargando…' : filteredData.length.toLocaleString('es-CO') + ' registros'}
            </span>
          </div>
        </div>

        {/* Navegación por módulos */}
        <div className="flex border-t border-slate-100 overflow-x-auto">
          {MODULOS.map(m => (
            <button key={m.id} onClick={() => setModulo(m.id)}
              className={`flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold whitespace-nowrap transition-all border-b-2 ${
                modulo === m.id
                  ? 'border-blue-600 text-blue-700 bg-blue-50/60'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}>
              {m.icon} {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Contenido ───────────────────────────────────────────────── */}
      <div className="p-6 max-w-[1400px] mx-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-3" />
            <p className="text-sm font-semibold">Cargando datos de Colombia…</p>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <Filter size={32} className="mb-3 opacity-30" />
            <p className="font-semibold">Sin datos con los filtros actuales</p>
            <button onClick={() => setFil(prev => ({ ...prev, formato: [], subcategoria: [], cadena: [], subcadena: [], departamento: [], ciudad: [] }))}
              className="mt-3 text-xs text-blue-500 hover:underline">Limpiar filtros</button>
          </div>
        ) : (
          <>
            {modulo === 'kpis'       && <ModKPIs        data={filteredData} fil={fil} bm={bm} />}
            {modulo === 'sellin'     && <ModSellIn      data={filteredData} fil={fil} overrides={overrideMap['sellin'] || {}} onEdit={setEditCtx} />}
            {modulo === 'sellout'    && <ModSellOut     data={filteredData} fil={fil} bm={bm} overrides={overrideMap['sellout'] || {}} onEdit={setEditCtx} />}
            {modulo === 'inventario' && <ModInventario  data={filteredData} fil={fil} overrides={overrideMap['inventario'] || {}} onEdit={setEditCtx} />}
            {modulo === 'devol'      && <ModDevoluciones data={filteredData} fil={fil} overrides={overrideMap['devol'] || {}} onEdit={setEditCtx} />}
            {modulo === 'precios'    && <ModPrecios     data={filteredData} fil={fil} />}
            {modulo === 'historial'  && <ModHistorial   ajustes={ajustes} />}
            {editCtx && (
              <EditAjusteModal
                ctx={editCtx}
                onClose={() => setEditCtx(null)}
                onSaved={(fresh) => { setAjustes(fresh); setEditCtx(null) }}
              />
            )}
          </>
        )}

      </div>
    </div>
  )
}
