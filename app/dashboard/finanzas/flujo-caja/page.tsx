'use client'
import { useState, useEffect, useCallback } from 'react'
import BarChartPro, { type MultiBarDef } from '@/components/dashboard/BarChartPro'
import { CreditCard, TrendingUp, TrendingDown, DollarSign, RefreshCw } from 'lucide-react'

const MESES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const sel = "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"

function fmt$(n: any) {
  const v = Number(n || 0)
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1_000_000) return sign + '$' + (abs / 1_000_000).toFixed(2) + 'M'
  if (abs >= 1_000)     return sign + '$' + (abs / 1_000).toFixed(1) + 'K'
  return sign + '$' + abs.toFixed(2)
}
function toNum(v: any) { return isNaN(Number(v)) ? 0 : Number(v) }

const ACTIVIDAD_META: Record<string, { label: string; color: string; accent: string }> = {
  operativa:       { label: 'Actividades Operativas',      color: '#2a7a58', accent: 'border-l-emerald-500' },
  inversion:       { label: 'Actividades de Inversión',    color: '#3a6fa8', accent: 'border-l-blue-500'   },
  financiamiento:  { label: 'Actividades de Financiamiento', color: '#c8873a', accent: 'border-l-amber-500' },
  saldo_inicial:   { label: 'Saldo Inicial',               color: '#6b7280', accent: 'border-l-gray-400'  },
}

export default function FlujoCajaPage() {
  const [kpis,      setKpis]      = useState<any>(null)
  const [detalle,   setDetalle]   = useState<any[]>([])
  const [tendencia, setTendencia] = useState<any[]>([])
  const [anos,      setAnos]      = useState<number[]>([])
  const [meses,     setMeses]     = useState<number[]>([])
  const [fAno, setFAno] = useState('')
  const [fMes, setFMes] = useState('')
  const [loading, setLoading] = useState(true)
  const [empty,   setEmpty]   = useState(false)

  useEffect(() => {
    fetch('/api/finanzas/flujo-caja?tipo=filtros').then(r => r.json()).then(j => {
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
      fetch(`/api/finanzas/flujo-caja?tipo=kpis&${qs}`).then(r => r.json()),
      fetch(`/api/finanzas/flujo-caja?tipo=detalle&${qs}`).then(r => r.json()),
      fetch(`/api/finanzas/flujo-caja?tipo=tendencia`).then(r => r.json()),
    ]).then(([k, d, t]) => {
      if (d.empty) { setEmpty(true); setLoading(false); return }
      setEmpty(false)
      setKpis(k)
      setDetalle(d.rows || [])
      setTendencia((t.rows || []).map((r: any) => ({
        ...r,
        label: MESES[toNum(r.mes)] + ' ' + String(r.ano).slice(2),
      })))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [fAno, fMes])

  useEffect(() => { fetchData() }, [fetchData])

  const porActividad = detalle.reduce((acc, row) => {
    const key = row.actividad
    if (!acc[key]) acc[key] = []
    acc[key].push(row)
    return acc
  }, {} as Record<string, any[]>)

  const flujoNeto = toNum(kpis?.flujo_neto)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Finanzas</p>
          <h1 className="text-2xl font-bold text-gray-800">Flujo de Caja</h1>
          <p className="text-xs text-gray-400 mt-0.5">Operativo · Inversión · Financiamiento</p>
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
          <CreditCard className="mx-auto mb-3 text-gray-200" size={48} />
          <p className="font-medium text-gray-600">Sin datos de flujo de caja</p>
          <p className="text-sm text-gray-400 mt-1">Ejecuta <code className="text-amber-600">db/finanzas_schema.sql</code> y carga datos.</p>
        </div>
      )}

      {!empty && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { icon: DollarSign,   label: 'Saldo Inicial',    val: fmt$(kpis?.saldo_inicial),       accent: 'border-l-gray-400' },
              { icon: TrendingUp,   label: 'Entradas',         val: fmt$(kpis?.entradas),            accent: 'border-l-emerald-500' },
              { icon: TrendingDown, label: 'Salidas',          val: fmt$(kpis?.salidas),             accent: 'border-l-red-400' },
              { icon: CreditCard,   label: 'Flujo Neto',       val: fmt$(flujoNeto),                 accent: flujoNeto >= 0 ? 'border-l-amber-500' : 'border-l-red-500' },
              { icon: TrendingUp,   label: 'F. Operativo',     val: fmt$(kpis?.flujo_operativo),     accent: 'border-l-emerald-500' },
              { icon: DollarSign,   label: 'F. Financiamiento',val: fmt$(kpis?.flujo_financiamiento),accent: 'border-l-blue-500' },
            ].map(k => (
              <div key={k.label} className={`bg-white rounded-xl border border-gray-100 shadow-sm p-5 border-l-4 ${k.accent}`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest leading-tight">{k.label}</p>
                  <k.icon size={15} className="text-gray-300 shrink-0" />
                </div>
                {loading ? <div className="h-6 w-16 bg-gray-100 rounded animate-pulse" />
                  : <p className={`text-xl font-bold ${toNum(k.val.replace(/[$MK,]/g,'')) < 0 ? 'text-red-600' : 'text-gray-800'}`}>{k.val}</p>}
              </div>
            ))}
          </div>

          {/* Detalle por actividad */}
          {['operativa','inversion','financiamiento'].map(act => {
            const rows  = porActividad[act] || []
            const meta  = ACTIVIDAD_META[act]
            const total = rows.reduce((s: number, r: any) => s + (r.tipo === 'entrada' ? toNum(r.monto) : -toNum(r.monto)), 0)
            if (rows.length === 0) return null
            return (
              <div key={act} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className={`px-5 py-4 border-b border-gray-100 border-l-4 ${meta.accent} flex items-center justify-between`}>
                  <h3 className="font-semibold text-gray-700">{meta.label}</h3>
                  <span className={`font-bold text-sm ${total >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmt$(total)}</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase tracking-widest bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-5 py-3 font-medium">Concepto</th>
                      <th className="text-center px-4 py-3 font-medium">Tipo</th>
                      <th className="text-right px-5 py-3 font-medium">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? Array.from({length:3}).map((_,i) => (
                      <tr key={i} className="border-b border-gray-50">
                        {[1,2,3].map(j => <td key={j} className="px-5 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse"/></td>)}
                      </tr>
                    )) : rows.map((r: any, i: number) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-amber-50 transition-colors">
                        <td className="px-5 py-3 text-gray-700">{r.concepto}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.tipo === 'entrada' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {r.tipo === 'entrada' ? '▲ Entrada' : '▼ Salida'}
                          </span>
                        </td>
                        <td className={`px-5 py-3 text-right font-semibold ${r.tipo === 'entrada' ? 'text-emerald-700' : 'text-red-600'}`}>
                          {r.tipo === 'salida' ? `(${fmt$(r.monto)})` : fmt$(r.monto)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}

          {/* Tendencia */}
          {!loading && tendencia.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="font-semibold text-gray-700 mb-1">Tendencia de flujo</h3>
              <p className="text-xs text-gray-400 mb-4">Entradas, salidas y flujo neto por mes</p>
              <BarChartPro
                data={tendencia}
                nameKey="label"
                height={220}
                formatter={fmt$}
                multiBar={[
                  { key: 'entradas',   color: '#2a7a58', label: 'Entradas' },
                  { key: 'salidas',    color: '#c0402f', label: 'Salidas' },
                  { key: 'flujo_neto', color: '#c8873a', label: 'Flujo Neto' },
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
