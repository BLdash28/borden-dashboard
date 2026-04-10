'use client'
import { useState, useEffect, useCallback } from 'react'
import DonutChartPro from '@/components/dashboard/DonutChartPro'
import { Scale, TrendingUp, TrendingDown, BarChart2, RefreshCw } from 'lucide-react'

const MESES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const sel = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"

function fmt$(n: any) {
  const v = Number(n || 0)
  if (Math.abs(v) >= 1_000_000) return '$' + (v / 1_000_000).toFixed(2) + 'M'
  if (Math.abs(v) >= 1_000)     return '$' + (v / 1_000).toFixed(1) + 'K'
  return '$' + v.toFixed(2)
}
function toNum(v: any) { return isNaN(Number(v)) ? 0 : Number(v) }

const TIPO_META: Record<string, { label: string; group: string; color: string; accent: string }> = {
  activo_corriente:    { label: 'Activo Corriente',     group: 'Activos',    color: '#2a7a58', accent: 'border-l-emerald-500' },
  activo_no_corriente: { label: 'Activo No Corriente',  group: 'Activos',    color: '#3a9a78', accent: 'border-l-emerald-400' },
  pasivo_corriente:    { label: 'Pasivo Corriente',     group: 'Pasivos',    color: '#c0402f', accent: 'border-l-red-500' },
  pasivo_no_corriente: { label: 'Pasivo No Corriente',  group: 'Pasivos',    color: '#e06050', accent: 'border-l-red-400' },
  patrimonio:          { label: 'Patrimonio',           group: 'Patrimonio', color: '#3a6fa8', accent: 'border-l-blue-500' },
}
const TIPO_ORDER = ['activo_corriente','activo_no_corriente','pasivo_corriente','pasivo_no_corriente','patrimonio']

export default function BalancePage() {
  const [kpis,    setKpis]    = useState<any>(null)
  const [detalle, setDetalle] = useState<any[]>([])
  const [anos,    setAnos]    = useState<number[]>([])
  const [meses,   setMeses]   = useState<number[]>([])
  const [fAno, setFAno] = useState('')
  const [fMes, setFMes] = useState('')
  const [loading, setLoading] = useState(true)
  const [empty,   setEmpty]   = useState(false)

  useEffect(() => {
    fetch('/api/finanzas/balance?tipo=filtros').then(r => r.json()).then(j => {
      const ps = j.periodos || []
      setAnos(Array.from(new Set<number>(ps.map((p: any) => toNum(p.ano)))).sort((a, b) => b - a))
      setMeses(Array.from(new Set<number>(ps.map((p: any) => toNum(p.mes)))).sort((a, b) => a - b))
    }).catch(() => {})
  }, [])

  const fetchData = useCallback(() => {
    setLoading(true)
    const q = new URLSearchParams()
    if (fAno) q.set('ano', fAno)
    if (fMes) q.set('mes', fMes)
    const qs = q.toString()
    Promise.all([
      fetch(`/api/finanzas/balance?tipo=kpis&${qs}`).then(r => r.json()),
      fetch(`/api/finanzas/balance?tipo=detalle&${qs}`).then(r => r.json()),
    ]).then(([k, d]) => {
      if (d.empty) { setEmpty(true); setLoading(false); return }
      setEmpty(false)
      setKpis(k)
      setDetalle(d.rows || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [fAno, fMes])

  useEffect(() => { fetchData() }, [fetchData])

  const porTipo = detalle.reduce((acc, row) => {
    if (!acc[row.tipo]) acc[row.tipo] = []
    acc[row.tipo].push(row)
    return acc
  }, {} as Record<string, any[]>)

  const totalesPorTipo = TIPO_ORDER.reduce((acc, t) => {
    acc[t] = (porTipo[t] || []).reduce((s: number, r: any) => s + toNum(r.valor), 0)
    return acc
  }, {} as Record<string, number>)

  const totalActivos   = toNum(kpis?.total_activos)
  const totalPasivos   = toNum(kpis?.total_pasivos)
  const patrimonio     = toNum(kpis?.patrimonio)

  const pieData = [
    { name: 'Activo Corriente',    value: totalesPorTipo['activo_corriente'],    fill: '#2a7a58' },
    { name: 'Activo No Corriente', value: totalesPorTipo['activo_no_corriente'], fill: '#3a9a78' },
    { name: 'Pasivo Corriente',    value: totalesPorTipo['pasivo_corriente'],    fill: '#c0402f' },
    { name: 'Pasivo No Corriente', value: totalesPorTipo['pasivo_no_corriente'], fill: '#e06050' },
    { name: 'Patrimonio',          value: totalesPorTipo['patrimonio'],          fill: '#3a6fa8' },
  ].filter(d => d.value > 0)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Finanzas</p>
          <h1 className="text-2xl font-bold text-gray-800">Balance General</h1>
          <p className="text-xs text-gray-400 mt-0.5">Activos · Pasivos · Patrimonio · Ratios</p>
        </div>
        <button onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="grid grid-cols-2 gap-3 max-w-sm">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Año</label>
            <select value={fAno} onChange={e => setFAno(e.target.value)} className={sel}>
              <option value=''>Todos</option>
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Mes</label>
            <select value={fMes} onChange={e => setFMes(e.target.value)} className={sel}>
              <option value=''>Todos</option>
              {meses.map(m => <option key={m} value={m}>{MESES[m]}</option>)}
            </select>
          </div>
        </div>
      </div>

      {empty && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-16 text-center">
          <Scale className="mx-auto mb-3 text-gray-200" size={48} />
          <p className="font-medium text-gray-600">Sin datos de balance</p>
          <p className="text-sm text-gray-400 mt-1">Ejecuta <code className="text-amber-600">db/finanzas_schema.sql</code> y carga datos.</p>
        </div>
      )}

      {!empty && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { icon: TrendingUp,   label: 'Total Activos',     val: fmt$(totalActivos),          accent: 'border-l-emerald-500' },
              { icon: TrendingDown, label: 'Total Pasivos',     val: fmt$(totalPasivos),          accent: 'border-l-red-400' },
              { icon: Scale,        label: 'Patrimonio',        val: fmt$(patrimonio),            accent: 'border-l-blue-500' },
              { icon: BarChart2,    label: 'Deuda / Equity',    val: kpis?.ratio_deuda_equity ? kpis.ratio_deuda_equity + 'x' : '—', accent: 'border-l-purple-400' },
              { icon: TrendingUp,   label: 'Liquidez Corriente',val: kpis?.ratio_liquidez ? kpis.ratio_liquidez + 'x' : '—',        accent: 'border-l-teal-500' },
              { icon: Scale,        label: 'Solvencia',         val: kpis?.solvencia_pct ? kpis.solvencia_pct + '%' : '—',          accent: 'border-l-amber-500' },
            ].map(k => (
              <div key={k.label} className={`bg-white rounded-xl border border-gray-100 shadow-sm p-5 border-l-4 ${k.accent}`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest leading-tight">{k.label}</p>
                  <k.icon size={15} className="text-gray-300 shrink-0" />
                </div>
                {loading ? <div className="h-6 w-16 bg-gray-100 rounded animate-pulse" />
                  : <p className="text-xl font-bold text-gray-800">{k.val}</p>}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Composición */}
            {!loading && pieData.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <h3 className="font-semibold text-gray-700 mb-4">Composición del Balance</h3>
                <DonutChartPro
                  data={pieData.map(d => ({ cat: d.name, qty: d.value }))}
                  total={pieData.reduce((s, d) => s + d.value, 0)}
                  colorMap={Object.fromEntries(pieData.map(d => [d.name, d.fill]))}
                  fallbackColors={pieData.map(d => d.fill)}
                  height={240}
                />
              </div>
            )}

            {/* Ecuación contable */}
            {!loading && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col justify-center gap-4">
                <h3 className="font-semibold text-gray-700">Ecuación Contable</h3>
                <div className="space-y-3">
                  {[
                    { label: 'Activo Corriente',    val: totalesPorTipo['activo_corriente'],    color: 'text-emerald-700', bar: 'bg-emerald-500' },
                    { label: 'Activo No Corriente', val: totalesPorTipo['activo_no_corriente'], color: 'text-emerald-600', bar: 'bg-emerald-400' },
                    { label: 'Pasivo Corriente',    val: totalesPorTipo['pasivo_corriente'],    color: 'text-red-600',     bar: 'bg-red-500' },
                    { label: 'Pasivo No Corriente', val: totalesPorTipo['pasivo_no_corriente'], color: 'text-red-500',     bar: 'bg-red-400' },
                    { label: 'Patrimonio',          val: totalesPorTipo['patrimonio'],          color: 'text-blue-700',    bar: 'bg-blue-500' },
                  ].map(item => (
                    <div key={item.label}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">{item.label}</span>
                        <span className={`font-semibold ${item.color}`}>{fmt$(item.val)}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${item.bar}`}
                          style={{ width: totalActivos > 0 ? `${Math.min(item.val / totalActivos * 100, 100)}%` : '0%' }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 pt-3 border-t border-gray-100 flex justify-between text-sm font-semibold">
                  <span className="text-gray-600">Activos = Pasivos + Patrimonio</span>
                  <span className={`${Math.abs(totalActivos - totalPasivos - patrimonio) < 1 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {Math.abs(totalActivos - totalPasivos - patrimonio) < 1 ? '✓ Cuadra' : '⚠ No cuadra'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Detalle por sección */}
          {TIPO_ORDER.filter(t => (porTipo[t] || []).length > 0).map(tipo => {
            const meta = TIPO_META[tipo]
            const rows = porTipo[tipo] || []
            const total = totalesPorTipo[tipo]
            return (
              <div key={tipo} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className={`px-5 py-4 border-b border-gray-100 border-l-4 ${meta.accent} flex items-center justify-between`}>
                  <h3 className="font-semibold text-gray-700">{meta.label}</h3>
                  <span className="font-bold text-sm text-gray-700">{fmt$(total)}</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase tracking-widest bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-5 py-3 font-medium">Concepto</th>
                      <th className="text-left px-5 py-3 font-medium">Categoría</th>
                      <th className="text-right px-5 py-3 font-medium">Valor</th>
                      <th className="text-right px-5 py-3 font-medium">% Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? Array.from({length:3}).map((_,i) => (
                      <tr key={i} className="border-b border-gray-50">
                        {[1,2,3,4].map(j => <td key={j} className="px-5 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse"/></td>)}
                      </tr>
                    )) : rows.map((r: any, i: number) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-amber-50 transition-colors">
                        <td className="px-5 py-3 text-gray-700">{r.concepto}</td>
                        <td className="px-5 py-3 text-gray-500 text-xs">{r.categoria || '—'}</td>
                        <td className="px-5 py-3 text-right font-semibold text-gray-800">{fmt$(r.valor)}</td>
                        <td className="px-5 py-3 text-right text-gray-400 text-xs">
                          {totalActivos > 0 ? (toNum(r.valor)/totalActivos*100).toFixed(1)+'%' : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
