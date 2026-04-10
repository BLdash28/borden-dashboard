'use client'
import { useState, useEffect, useCallback } from 'react'
import BarChartPro, { type MultiBarDef } from '@/components/dashboard/BarChartPro'
import { DollarSign, TrendingUp, TrendingDown, BarChart2, RefreshCw } from 'lucide-react'

const MESES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const sel = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"

function fmt$(n: any) {
  const v = Number(n || 0)
  if (Math.abs(v) >= 1_000_000) return '$' + (v / 1_000_000).toFixed(2) + 'M'
  if (Math.abs(v) >= 1_000)     return '$' + (v / 1_000).toFixed(1) + 'K'
  return '$' + v.toFixed(2)
}
function toNum(v: any) { return isNaN(Number(v)) ? 0 : Number(v) }
function pct(v: any) { return toNum(v).toFixed(1) + '%' }

// Mapeo de tipo → orden y etiqueta en el P&L
const TIPO_META: Record<string, { label: string; orden: number; signo: 1 | -1; bold?: boolean; indent?: boolean }> = {
  ingreso:            { label: 'Ingresos',             orden: 1,  signo:  1, bold: true },
  costo_venta:        { label: 'Costo de Ventas',       orden: 2,  signo: -1, indent: true },
  gasto_venta:        { label: 'Gastos de Ventas',      orden: 4,  signo: -1, indent: true },
  gasto_admin:        { label: 'Gastos Administrativos',orden: 5,  signo: -1, indent: true },
  gasto_general:      { label: 'Gastos Generales',      orden: 6,  signo: -1, indent: true },
  deprec:             { label: 'Depreciación / Amort.', orden: 8,  signo: -1, indent: true },
  ingreso_financiero: { label: 'Ingresos Financieros',  orden: 10, signo:  1, indent: true },
  gasto_financiero:   { label: 'Gastos Financieros',    orden: 11, signo: -1, indent: true },
  impuesto:           { label: 'Impuestos',             orden: 12, signo: -1, indent: true },
}

export default function EstadoResultadosPage() {
  const [kpis,      setKpis]      = useState<any>(null)
  const [detalle,   setDetalle]   = useState<any[]>([])
  const [tendencia, setTendencia] = useState<any[]>([])
  const [anos,      setAnos]      = useState<number[]>([])
  const [meses,     setMeses]     = useState<number[]>([])
  const [fAno,  setFAno]  = useState('')
  const [fMes,  setFMes]  = useState('')
  const [loading,  setLoading]  = useState(true)
  const [empty,    setEmpty]    = useState(false)

  useEffect(() => {
    fetch('/api/finanzas/pyl?tipo=filtros').then(r => r.json()).then(j => {
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
      fetch(`/api/finanzas/pyl?tipo=kpis&${qs}`).then(r => r.json()),
      fetch(`/api/finanzas/pyl?tipo=detalle&${qs}`).then(r => r.json()),
      fetch(`/api/finanzas/pyl?tipo=tendencia`).then(r => r.json()),
    ]).then(([k, d, t]) => {
      if (d.empty) { setEmpty(true); setLoading(false); return }
      setEmpty(false)
      setKpis(k)
      setDetalle(d.rows || [])
      setTendencia((t.rows || []).map((r: any) => ({
        ...r,
        label: MESES[toNum(r.mes)] + ' ' + String(r.ano).slice(2),
        margen_bruto: toNum(r.ingresos) - toNum(r.costo_ventas),
        ebitda: toNum(r.ingresos) - toNum(r.costo_ventas) - toNum(r.gastos_op),
      })))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [fAno, fMes])

  useEffect(() => { fetchData() }, [fetchData])

  // Agrupar detalle por tipo para la tabla P&L
  const porTipo = detalle.reduce((acc, row) => {
    if (!acc[row.tipo]) acc[row.tipo] = []
    acc[row.tipo].push(row)
    return acc
  }, {} as Record<string, any[]>)

  const totalesPorTipo = Object.entries(porTipo).reduce((acc, [tipo, rows]) => {
    acc[tipo] = (rows as any[]).reduce((s, r) => s + toNum(r.valor), 0)
    return acc
  }, {} as Record<string, number>)

  const ingresos      = toNum(kpis?.ingresos)
  const costoVentas   = toNum(kpis?.costo_ventas)
  const margenBruto   = toNum(kpis?.margen_bruto)
  const gastosOp      = toNum(kpis?.gastos_op)
  const ebitda        = toNum(kpis?.ebitda)
  const resultadoNeto = toNum(kpis?.resultado_neto)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Finanzas</p>
          <h1 className="text-2xl font-bold text-gray-800">Estado de Resultados</h1>
          <p className="text-xs text-gray-400 mt-0.5">P&amp;L · Margen bruto, EBITDA y resultado neto</p>
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
          <DollarSign className="mx-auto mb-3 text-gray-200" size={48} />
          <p className="font-medium text-gray-600">Sin datos de P&amp;L</p>
          <p className="text-sm text-gray-400 mt-1">Ejecuta <code className="text-amber-600">db/finanzas_schema.sql</code> y carga datos.</p>
        </div>
      )}

      {!empty && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { icon: TrendingUp,   label: 'Ingresos',       val: fmt$(ingresos),      accent: 'border-l-emerald-500' },
              { icon: TrendingDown, label: 'Costo Ventas',   val: fmt$(costoVentas),   accent: 'border-l-red-400' },
              { icon: BarChart2,    label: 'Margen Bruto',   val: fmt$(margenBruto),   accent: 'border-l-blue-500', sub: pct(kpis?.margen_bruto_pct) },
              { icon: DollarSign,   label: 'Gastos Op.',     val: fmt$(gastosOp),      accent: 'border-l-orange-400' },
              { icon: TrendingUp,   label: 'EBITDA',         val: fmt$(ebitda),        accent: 'border-l-amber-500', sub: pct(kpis?.ebitda_pct) },
              { icon: DollarSign,   label: 'Resultado Neto', val: fmt$(resultadoNeto), accent: resultadoNeto >= 0 ? 'border-l-emerald-500' : 'border-l-red-500', sub: pct(kpis?.resultado_neto_pct) },
            ].map(k => (
              <div key={k.label} className={`bg-white rounded-xl border border-gray-100 shadow-sm p-5 border-l-4 ${k.accent}`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest leading-tight">{k.label}</p>
                  <k.icon size={15} className="text-gray-300 shrink-0" />
                </div>
                {loading ? <div className="h-6 w-16 bg-gray-100 rounded animate-pulse" />
                  : <p className={`text-xl font-bold ${k.val.startsWith('$-') ? 'text-red-600' : 'text-gray-800'}`}>{k.val}</p>}
                {k.sub && !loading && <p className="text-xs text-gray-400 mt-0.5">{k.sub} sobre ingresos</p>}
              </div>
            ))}
          </div>

          {/* Tabla P&L */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-700">Detalle P&amp;L</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase tracking-widest bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-5 py-3 font-medium">Concepto</th>
                    <th className="text-right px-5 py-3 font-medium">Monto</th>
                    <th className="text-right px-5 py-3 font-medium">% Ingresos</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? Array.from({length: 8}).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      {[1,2,3].map(j => <td key={j} className="px-5 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>)}
                    </tr>
                  )) : (
                    <>
                      {/* Ingresos */}
                      <tr className="border-b border-gray-100 bg-emerald-50/40">
                        <td className="px-5 py-3 font-bold text-gray-800">Ingresos Totales</td>
                        <td className="px-5 py-3 text-right font-bold text-emerald-700">{fmt$(ingresos)}</td>
                        <td className="px-5 py-3 text-right text-gray-500">100%</td>
                      </tr>
                      {(porTipo['ingreso'] || []).map((r: any, i: number) => (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-5 py-2 pl-10 text-gray-600 text-xs">{r.concepto}</td>
                          <td className="px-5 py-2 text-right text-gray-700">{fmt$(r.valor)}</td>
                          <td className="px-5 py-2 text-right text-gray-400 text-xs">{ingresos > 0 ? (toNum(r.valor)/ingresos*100).toFixed(1)+'%' : '—'}</td>
                        </tr>
                      ))}

                      {/* Costo Ventas */}
                      <tr className="border-b border-gray-100 bg-red-50/30">
                        <td className="px-5 py-3 font-semibold text-gray-700">(-) Costo de Ventas</td>
                        <td className="px-5 py-3 text-right font-semibold text-red-600">({fmt$(costoVentas)})</td>
                        <td className="px-5 py-3 text-right text-gray-400 text-xs">{ingresos > 0 ? (costoVentas/ingresos*100).toFixed(1)+'%' : '—'}</td>
                      </tr>

                      {/* Margen Bruto */}
                      <tr className="border-b border-gray-200 bg-blue-50/40">
                        <td className="px-5 py-3 font-bold text-gray-800">= Margen Bruto</td>
                        <td className={`px-5 py-3 text-right font-bold ${margenBruto >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{fmt$(margenBruto)}</td>
                        <td className="px-5 py-3 text-right text-blue-600 font-semibold text-xs">{pct(kpis?.margen_bruto_pct)}</td>
                      </tr>

                      {/* Gastos Op */}
                      <tr className="border-b border-gray-100 bg-orange-50/30">
                        <td className="px-5 py-3 font-semibold text-gray-700">(-) Gastos Operativos</td>
                        <td className="px-5 py-3 text-right font-semibold text-orange-600">({fmt$(gastosOp)})</td>
                        <td className="px-5 py-3 text-right text-gray-400 text-xs">{ingresos > 0 ? (gastosOp/ingresos*100).toFixed(1)+'%' : '—'}</td>
                      </tr>
                      {(['gasto_venta','gasto_admin','gasto_general'] as const).flatMap(t =>
                        (porTipo[t] || []).map((r: any, i: number) => (
                          <tr key={t+i} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-5 py-2 pl-10 text-gray-600 text-xs">{r.concepto}</td>
                            <td className="px-5 py-2 text-right text-gray-600">({fmt$(r.valor)})</td>
                            <td className="px-5 py-2 text-right text-gray-400 text-xs">{ingresos > 0 ? (toNum(r.valor)/ingresos*100).toFixed(1)+'%' : '—'}</td>
                          </tr>
                        ))
                      )}

                      {/* EBITDA */}
                      <tr className="border-b border-gray-200 bg-amber-50/60">
                        <td className="px-5 py-3 font-bold text-gray-800">= EBITDA</td>
                        <td className={`px-5 py-3 text-right font-bold ${ebitda >= 0 ? 'text-amber-700' : 'text-red-600'}`}>{fmt$(ebitda)}</td>
                        <td className="px-5 py-3 text-right text-amber-600 font-semibold text-xs">{pct(kpis?.ebitda_pct)}</td>
                      </tr>

                      {/* Otros */}
                      {['deprec','ingreso_financiero','gasto_financiero','impuesto'].flatMap(t =>
                        (porTipo[t] || []).map((r: any, i: number) => {
                          const meta = TIPO_META[t]
                          return (
                            <tr key={t+i} className="border-b border-gray-50 hover:bg-gray-50">
                              <td className="px-5 py-2 pl-10 text-gray-600 text-xs">{r.concepto}</td>
                              <td className={`px-5 py-2 text-right text-xs ${meta.signo === -1 ? 'text-gray-600' : 'text-emerald-600'}`}>
                                {meta.signo === -1 ? `(${fmt$(r.valor)})` : fmt$(r.valor)}
                              </td>
                              <td className="px-5 py-2 text-right text-gray-400 text-xs">{ingresos > 0 ? (toNum(r.valor)/ingresos*100).toFixed(1)+'%' : '—'}</td>
                            </tr>
                          )
                        })
                      )}

                      {/* Resultado Neto */}
                      <tr className={`${resultadoNeto >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                        <td className="px-5 py-4 font-bold text-gray-800 text-base">= Resultado Neto</td>
                        <td className={`px-5 py-4 text-right font-bold text-base ${resultadoNeto >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmt$(resultadoNeto)}</td>
                        <td className={`px-5 py-4 text-right font-semibold text-sm ${resultadoNeto >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{pct(kpis?.resultado_neto_pct)}</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tendencia */}
          {!loading && tendencia.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="font-semibold text-gray-700 mb-1">Tendencia mensual</h3>
              <p className="text-xs text-gray-400 mb-4">Ingresos, Margen Bruto y EBITDA por período</p>
              <BarChartPro
                data={tendencia}
                nameKey="label"
                height={220}
                formatter={fmt$}
                multiBar={[
                  { key: 'ingresos',     color: '#2a7a58', label: 'Ingresos' },
                  { key: 'margen_bruto', color: '#3a6fa8', label: 'Margen Bruto' },
                  { key: 'ebitda',       color: '#c8873a', label: 'EBITDA' },
                ] as MultiBarDef[]}
                refLine={{ y: 0, label: '', color: '#e5e7eb' }}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
