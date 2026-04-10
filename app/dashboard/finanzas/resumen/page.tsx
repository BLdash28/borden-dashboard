'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  DollarSign, TrendingUp, TrendingDown, PieChart,
  BarChart2, FileText, CreditCard, Scale, ArrowUpRight
} from 'lucide-react'
import BarChartPro, { type MultiBarDef } from '@/components/dashboard/BarChartPro'

const MESES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function fmt$(n: any) {
  const v = Number(n || 0)
  if (Math.abs(v) >= 1_000_000) return '$' + (v / 1_000_000).toFixed(2) + 'M'
  if (Math.abs(v) >= 1_000)     return '$' + (v / 1_000).toFixed(1) + 'K'
  return '$' + v.toFixed(2)
}
function toNum(v: any) { return isNaN(Number(v)) ? 0 : Number(v) }

const MODULOS = [
  { href: '/dashboard/finanzas/estado-resultados', titulo: 'Estado de Resultados', desc: 'P&L mensual · Margen bruto, EBITDA y resultado neto',       icon: FileText,  color: '#2a7a58',  bg: 'bg-emerald-50', border: 'border-emerald-100' },
  { href: '/dashboard/finanzas/flujo-caja',        titulo: 'Flujo de Caja',        desc: 'Operativo · Inversión · Financiamiento · Saldo disponible',  icon: CreditCard,color: '#3a6fa8',  bg: 'bg-blue-50',    border: 'border-blue-100'    },
  { href: '/dashboard/finanzas/balance',           titulo: 'Balance General',      desc: 'Activos, pasivos y patrimonio · Ratios de liquidez',          icon: Scale,     color: '#6b4fa8',  bg: 'bg-purple-50',  border: 'border-purple-100'  },
  { href: '/dashboard/finanzas/presupuesto',       titulo: 'Presupuesto vs Real',  desc: 'Desviaciones · Cumplimiento % · Semáforo por categoría',      icon: PieChart,  color: '#2a8a8a',  bg: 'bg-teal-50',    border: 'border-teal-100'    },
]

export default function FinanzasResumen() {
  const router = useRouter()
  const [kpiPyl,   setKpiPyl]   = useState<any>(null)
  const [kpiFlujo, setKpiFlujo] = useState<any>(null)
  const [tendencia,setTendencia]= useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [empty,    setEmpty]    = useState(false)

  useEffect(() => {
    const ano = new Date().getFullYear()
    Promise.all([
      fetch(`/api/finanzas/pyl?tipo=kpis&ano=${ano}`).then(r => r.json()),
      fetch(`/api/finanzas/flujo-caja?tipo=kpis&ano=${ano}`).then(r => r.json()),
      fetch(`/api/finanzas/pyl?tipo=tendencia`).then(r => r.json()),
    ]).then(([p, f, t]) => {
      if (t.empty || (!p.ingresos && !f.entradas)) { setEmpty(true); setLoading(false); return }
      setEmpty(false)
      setKpiPyl(p)
      setKpiFlujo(f)
      setTendencia((t.rows || []).map((r: any) => ({
        ...r,
        label: MESES[toNum(r.mes)] + ' ' + String(r.ano).slice(2),
        ebitda: toNum(r.ingresos) - toNum(r.costo_ventas) - toNum(r.gastos_op),
        margen_bruto: toNum(r.ingresos) - toNum(r.costo_ventas),
      })))
      setLoading(false)
    }).catch(() => { setEmpty(true); setLoading(false) })
  }, [])

  const ingresos      = toNum(kpiPyl?.ingresos)
  const ebitda        = toNum(kpiPyl?.ebitda)
  const resultadoNeto = toNum(kpiPyl?.resultado_neto)
  const flujoNeto     = toNum(kpiFlujo?.flujo_neto)

  const KPI_CARDS = [
    { label: 'Ingresos YTD',     value: loading ? '—' : fmt$(ingresos),      sub: 'Año en curso',         icon: TrendingUp,   color: 'border-l-emerald-500' },
    { label: 'EBITDA',           value: loading ? '—' : fmt$(ebitda),         sub: kpiPyl?.ebitda_pct ? kpiPyl.ebitda_pct + '% margen' : '—', icon: DollarSign,   color: 'border-l-amber-500'   },
    { label: 'Resultado Neto',   value: loading ? '—' : fmt$(resultadoNeto),  sub: kpiPyl?.resultado_neto_pct ? kpiPyl.resultado_neto_pct + '% margen' : '—', icon: resultadoNeto >= 0 ? TrendingUp : TrendingDown, color: resultadoNeto >= 0 ? 'border-l-emerald-500' : 'border-l-red-400' },
    { label: 'Flujo Neto',       value: loading ? '—' : fmt$(flujoNeto),      sub: 'Año en curso',         icon: CreditCard,   color: flujoNeto >= 0 ? 'border-l-blue-500' : 'border-l-red-400' },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Dashboard Finanzas</p>
          <h1 className="text-2xl font-bold text-gray-800">Resumen Ejecutivo</h1>
        </div>
        {empty && (
          <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold rounded-full">
            Sin datos · Carga datos para activar métricas
          </span>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {KPI_CARDS.map((k, i) => (
          <div key={i} className={`bg-white rounded-xl border border-gray-100 shadow-sm p-5 border-l-4 ${k.color}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{k.label}</p>
              <k.icon size={15} className="text-gray-300" />
            </div>
            {loading
              ? <div className="h-7 w-20 bg-gray-100 rounded animate-pulse mb-1" />
              : <p className={`text-2xl font-bold ${empty ? 'text-gray-300' : 'text-gray-800'}`}>{k.value}</p>}
            <p className="text-xs text-gray-400 mt-1">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Tendencia */}
      {!loading && !empty && tendencia.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-semibold text-gray-700 mb-1">Evolución Financiera</h3>
          <p className="text-xs text-gray-400 mb-4">Ingresos, Margen Bruto y EBITDA mensual</p>
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
          />
        </div>
      )}

      {/* Módulos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {MODULOS.map((m, i) => (
          <button key={i} onClick={() => router.push(m.href)}
            className={`text-left rounded-xl border p-5 ${m.bg} ${m.border} hover:shadow-md transition-all group`}>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: m.color + '22', color: m.color }}>
                <m.icon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-800 text-sm">{m.titulo}</h3>
                  <ArrowUpRight size={13} className="text-gray-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </div>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{m.desc}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Info banner cuando no hay datos */}
      {empty && (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-3">
            <DollarSign size={22} className="text-gray-300"/>
          </div>
          <p className="text-sm font-medium text-gray-600">Sin datos financieros aún</p>
          <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
            Ejecuta <code className="text-amber-600 bg-amber-50 px-1 rounded">db/finanzas_schema.sql</code> en Neon
            y comienza a cargar registros en cada módulo.
          </p>
        </div>
      )}
    </div>
  )
}
