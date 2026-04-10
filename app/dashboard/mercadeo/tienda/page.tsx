'use client'
import { showError } from '@/lib/toast'
import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, Store, Package, Globe2, AlertTriangle } from 'lucide-react'
import BarChartPro from '@/components/dashboard/BarChartPro'
import { useDashboardFilters } from '@/lib/context/DashboardFilters'
import GlobalFilterBar from '@/components/dashboard/GlobalFilterBar'

const COLORS = ['#c8873a','#2a7a58','#3a6fa8','#6b4fa8','#c0402f','#2a8a8a','#a86a2a','#1a6a48']

const fmtU = (n: number) =>
  isNaN(n) || !isFinite(n) ? '0' :
  n >= 1e6 ? (n/1e6).toFixed(2)+'M' :
  n >= 1e3 ? (n/1e3).toFixed(1)+'K' :
  n.toFixed(0)

const toNum = (v: any) => { const n = parseFloat(String(v)); return isNaN(n) ? 0 : n }

interface TiendaRow {
  nombre:          string   // punto_venta
  ventas_unidades: number
  num_skus:        number
}

export default function MercadeoTiendaPage() {
  const { fPaises, fCats, fSubcats, fClientes, fAnos, fMeses, buildParams } = useDashboardFilters()

  const [fBusq,   setFBusq]   = useState('')
  const [rows,    setRows]    = useState<TiendaRow[]>([])
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(() => {
    setLoading(true)
    const p = buildParams({ dim: 'tienda' })

    fetch('/api/ventas/dimension?' + p.toString())
      .then(r => r.json())
      .then(j => {
        if (j.error) { showError(j.error || 'Error al cargar datos'); return }
        setRows((j.rows || []).map((r: any) => ({
          nombre:          String(r.nombre || '(sin nombre)'),
          ventas_unidades: toNum(r.ventas_unidades),
          num_skus:        toNum(r.num_skus),
        })).sort((a: TiendaRow, b: TiendaRow) => b.ventas_unidades - a.ventas_unidades))
      })
      .finally(() => setLoading(false))
  }, [buildParams])

  useEffect(() => { cargar() }, [cargar, fPaises, fCats, fSubcats, fClientes, fAnos, fMeses])

  // Filtro búsqueda local (solo afecta la tabla, no la API)
  const filtradas = rows.filter(r =>
    !fBusq.trim() || r.nombre.toLowerCase().includes(fBusq.toLowerCase())
  )

  // KPIs
  const totalUds = rows.reduce((s, r) => s + r.ventas_unidades, 0)
  const top10    = rows.slice(0, 10)

  // Cuartil bajo (último 25% por unidades) → alerta de baja rotación
  const q25val       = rows.length > 0 ? rows[Math.floor(rows.length * 0.75)]?.ventas_unidades ?? 0 : 0
  const alertasBajas = rows.filter(r => r.ventas_unidades > 0 && r.ventas_unidades <= q25val).length

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Mercadeo · Dimensiones</p>
          <h1 className="text-2xl font-bold text-gray-800">Por Tienda / Punto de Venta</h1>
          <p className="text-xs text-gray-400 mt-0.5">Volumen de unidades por canal de distribución</p>
        </div>
        <button onClick={cargar}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* Filtros globales */}
      <GlobalFilterBar />

      {/* Búsqueda local de tienda */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-3">
          <div className="w-72">
            <label className="text-xs text-gray-500 mb-1 block">Buscar tienda</label>
            <input
              value={fBusq}
              onChange={e => setFBusq(e.target.value)}
              placeholder="Nombre punto de venta..."
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Unidades Totales',  value: loading ? '...' : fmtU(totalUds) + ' uds',                                        sub: 'total período',             icon: <Package size={18}/>,      color: 'border-l-amber-500'   },
          { label: 'Tiendas Activas',   value: loading ? '...' : String(rows.length),                                             sub: 'puntos de venta con venta', icon: <Store size={18}/>,         color: 'border-l-blue-500'    },
          { label: 'Promedio / Tienda', value: loading ? '...' : fmtU(rows.length > 0 ? totalUds / rows.length : 0) + ' uds',    sub: 'unidades promedio',         icon: <Globe2 size={18}/>,        color: 'border-l-emerald-500' },
          { label: 'Baja Rotación',     value: loading ? '...' : String(alertasBajas),                                            sub: 'tiendas bajo Q1',           icon: <AlertTriangle size={18}/>, color: 'border-l-red-400'     },
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

      {/* Top 10 chart */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-semibold text-gray-700 mb-1">Top 10 Tiendas por Volumen</h3>
        <p className="text-xs text-gray-400 mb-4">Unidades vendidas</p>
        {loading
          ? <div className="h-64 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
          : top10.length === 0
            ? <div className="h-64 flex items-center justify-center text-gray-400 text-sm">Sin datos</div>
            : <BarChartPro
                data={top10}
                dataKey="ventas_unidades"
                nameKey="nombre"
                layout="vertical"
                colors={COLORS}
                height={Math.max(240, top10.length * 36)}
                formatter={(v) => toNum(v).toLocaleString() + ' uds'}
                tooltipUnit="uds"
                yTickFmt={(v: string) => v.length > 28 ? v.substring(0, 28) + '…' : v}
                xTickFmt={fmtU}
                yWidth={180}
                margin={{ top: 4, right: 64, left: 8, bottom: 0 }}
              />
        }
      </div>

      {/* Tabla completa */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-700">Ranking Completo</h3>
          <span className="text-xs text-gray-400">{filtradas.length} tiendas</span>
        </div>
        {loading
          ? <p className="text-sm text-gray-300">Cargando...</p>
          : filtradas.length === 0
            ? <p className="text-sm text-gray-400">Sin datos</p>
            : <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase tracking-widest border-b border-gray-100">
                      <th className="text-left py-2 pr-4 w-8">#</th>
                      <th className="text-left py-2 pr-4">Tienda / Punto de Venta</th>
                      <th className="text-right py-2 pr-4">Unidades</th>
                      <th className="text-right py-2 pr-4">SKUs</th>
                      <th className="text-right py-2 pr-4">% Total</th>
                      <th className="text-left py-2">Participación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtradas.map((r, i) => {
                      const pct    = totalUds > 0 ? (r.ventas_unidades / totalUds * 100) : 0
                      const isBaja = r.ventas_unidades > 0 && r.ventas_unidades <= q25val
                      return (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-2.5 pr-4 text-gray-400 font-mono text-xs">{i + 1}</td>
                          <td className="py-2.5 pr-4 text-gray-700 max-w-xs">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium">{r.nombre}</span>
                              {isBaja && (
                                <span title="Baja rotación">
                                  <AlertTriangle size={12} className="text-amber-400 flex-shrink-0" />
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 pr-4 text-right font-semibold text-gray-800">
                            {r.ventas_unidades.toLocaleString()}
                          </td>
                          <td className="py-2.5 pr-4 text-right text-gray-500">{r.num_skus}</td>
                          <td className="py-2.5 pr-4 text-right text-gray-600">{pct.toFixed(1)}%</td>
                          <td className="py-2.5">
                            <div className="w-28 bg-gray-100 rounded-full h-2">
                              <div className="h-2 rounded-full transition-all duration-500"
                                style={{ width: Math.min(pct * 3, 100) + '%', background: COLORS[i % COLORS.length] }} />
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
