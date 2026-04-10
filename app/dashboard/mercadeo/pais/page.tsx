'use client'
import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, Globe2, Package, TrendingUp } from 'lucide-react'
import BarChartPro from '@/components/dashboard/BarChartPro'
import DonutChartPro from '@/components/dashboard/DonutChartPro'
import { useDashboardFilters } from '@/lib/context/DashboardFilters'
import GlobalFilterBar from '@/components/dashboard/GlobalFilterBar'

const COLORS = ['#c8873a','#2a7a58','#3a6fa8','#6b4fa8','#c0402f','#2a8a8a','#a86a2a','#1a6a48']

const fmtU = (n: number) =>
  isNaN(n) || !isFinite(n) ? '0' :
  n >= 1e6 ? (n / 1e6).toFixed(2) + 'M uds' :
  n >= 1e3 ? (n / 1e3).toFixed(1) + 'K uds' :
  n.toFixed(0) + ' uds'

const toNum = (v: any): number => {
  const n = parseFloat(String(v))
  return isNaN(n) ? 0 : n
}

interface DimRow { nombre: string; ventas_unidades: number; num_skus: number }

export default function MercadeoPaisPage() {
  const { fPaises, fCats, fSubcats, fClientes, fAnos, fMeses, buildParams } = useDashboardFilters()

  const [rows,    setRows]    = useState<DimRow[]>([])
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(() => {
    setLoading(true)
    const p = buildParams({ dim: 'pais' })
    fetch('/api/ventas/dimension?' + p.toString())
      .then(r => r.json())
      .then(j => {
        if (j.error) { console.error(j.error); return }
        setRows((j.rows || []).map((row: any) => ({
          nombre:          String(row.nombre || '(sin nombre)'),
          ventas_unidades: toNum(row.ventas_unidades),
          num_skus:        toNum(row.num_skus),
        })).sort((a: DimRow, b: DimRow) => b.ventas_unidades - a.ventas_unidades))
      })
      .finally(() => setLoading(false))
  }, [buildParams])

  useEffect(() => { cargar() }, [cargar, fPaises, fCats, fSubcats, fClientes, fAnos, fMeses])

  const totalUds = rows.reduce((s, r) => s + r.ventas_unidades, 0)
  const top10    = rows.slice(0, 10)

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Mercadeo · Dimensiones</p>
          <h1 className="text-2xl font-bold text-gray-800">Tendencias por País</h1>
          <p className="text-xs text-gray-400 mt-0.5">Volumen de unidades vendidas por mercado</p>
        </div>
        <button onClick={cargar}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* Filtros */}
      <GlobalFilterBar />

      {/* KPIs — solo unidades, sin USD */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Unidades Totales',    value: loading ? '...' : fmtU(totalUds),                                      sub: 'total período',       icon: <TrendingUp size={18}/>, color: 'border-l-amber-500'   },
          { label: 'Mercados Activos',    value: loading ? '...' : String(rows.length),                                  sub: 'países con ventas',   icon: <Globe2 size={18}/>,    color: 'border-l-emerald-500' },
          { label: 'Promedio por Mercado',value: loading ? '...' : fmtU(rows.length > 0 ? totalUds / rows.length : 0),  sub: 'unidades / país',     icon: <Package size={18}/>,   color: 'border-l-blue-500'   },
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

      {/* Gráfico + Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Barras horizontales — volumen por país */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-semibold text-gray-700 mb-1">Volumen por País</h3>
          <p className="text-xs text-gray-400 mb-4">Unidades vendidas</p>
          {loading
            ? <div className="h-64 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
            : top10.length === 0
              ? <div className="h-64 flex items-center justify-center text-gray-300 text-sm">Sin datos</div>
              : <BarChartPro
                  data={top10}
                  dataKey="ventas_unidades"
                  nameKey="nombre"
                  layout="vertical"
                  colors={COLORS}
                  height={Math.max(220, top10.length * 40)}
                  formatter={(v) => toNum(v).toLocaleString() + ' uds'}
                  tooltipUnit="uds"
                  xTickFmt={(v: number) => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(0)+'K' : String(v)}
                  yWidth={36}
                  margin={{ top: 4, right: 60, left: 8, bottom: 0 }}
                />
          }
        </div>

        {/* Pie — participación por unidades */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-semibold text-gray-700 mb-1">Participación de Mercado</h3>
          <p className="text-xs text-gray-400 mb-4">% de unidades por país</p>
          {loading
            ? <div className="h-64 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
            : rows.length === 0
              ? <div className="h-64 flex items-center justify-center text-gray-300 text-sm">Sin datos</div>
              : <div className="flex gap-4 items-center h-[220px]">
                  <div className="flex-shrink-0">
                    <DonutChartPro
                      data={rows.map(r => ({ cat: r.nombre, qty: r.ventas_unidades }))}
                      total={totalUds}
                      colorMap={Object.fromEntries(rows.map((r, i) => [r.nombre, COLORS[i % COLORS.length]]))}
                      fallbackColors={COLORS}
                      height={200}
                    />
                  </div>
                  <div className="flex-1 space-y-2.5 overflow-y-auto">
                    {rows.map((r, i) => {
                      const pct = totalUds > 0 ? (r.ventas_unidades / totalUds * 100) : 0
                      return (
                        <div key={i}>
                          <div className="flex items-center justify-between mb-0.5">
                            <div className="flex items-center gap-1.5">
                              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                style={{ background: COLORS[i % COLORS.length] }} />
                              <span className="text-xs font-semibold text-gray-700">{r.nombre}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-sm font-bold text-gray-800">{pct.toFixed(1)}%</span>
                              <span className="text-[10px] text-gray-400 ml-1">
                                {r.ventas_unidades >= 1e3
                                  ? (r.ventas_unidades / 1e3).toFixed(1) + 'K'
                                  : r.ventas_unidades.toLocaleString()}
                              </span>
                            </div>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full transition-all duration-500"
                              style={{ width: pct + '%', background: COLORS[i % COLORS.length] }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
          }
        </div>
      </div>

      {/* Tabla — sin columna USD */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-semibold text-gray-700 mb-4">Detalle por País</h3>
        {loading
          ? <p className="text-sm text-gray-300">Cargando...</p>
          : rows.length === 0
            ? <p className="text-sm text-gray-400">Sin datos</p>
            : <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase tracking-widest border-b border-gray-100">
                      <th className="text-left py-2 pr-4 w-8">#</th>
                      <th className="text-left py-2 pr-4">País</th>
                      <th className="text-right py-2 pr-4">Unidades Vendidas</th>
                      <th className="text-right py-2 pr-4">SKUs Activos</th>
                      <th className="text-right py-2 pr-6">% Participación</th>
                      <th className="text-left py-2">Tendencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const pct = totalUds > 0 ? (r.ventas_unidades / totalUds * 100) : 0
                      return (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-2.5 pr-4 text-gray-400">{i + 1}</td>
                          <td className="py-2.5 pr-4 font-semibold text-gray-800">{r.nombre}</td>
                          <td className="py-2.5 pr-4 text-right text-gray-700">
                            {r.ventas_unidades.toLocaleString()}
                          </td>
                          <td className="py-2.5 pr-4 text-right text-gray-500">{r.num_skus}</td>
                          <td className="py-2.5 pr-6 text-right font-semibold text-gray-800">{pct.toFixed(1)}%</td>
                          <td className="py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="w-24 bg-gray-100 rounded-full h-2">
                                <div className="h-2 rounded-full transition-all duration-500"
                                  style={{ width: pct + '%', background: COLORS[i % COLORS.length] }} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
        }
      </div>
    </div>
  )
}
