'use client'
import { showError } from '@/lib/toast'
'use client'
import { showError } from '@/lib/toast'
import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, ShoppingBag, Package, TrendingUp, ArrowUp, ArrowDown, Minus } from 'lucide-react'
import BarChartPro from '@/components/dashboard/BarChartPro'
import { useDashboardFilters } from '@/lib/context/DashboardFilters'
import GlobalFilterBar from '@/components/dashboard/GlobalFilterBar'

const COLORS = ['#c8873a','#2a7a58','#3a6fa8','#6b4fa8','#c0402f','#2a8a8a','#a86a2a','#1a6a48']

const fmtU = (n: number) =>
  isNaN(n) || !isFinite(n) ? '0' :
  n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' :
  n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' :
  n.toFixed(0)

const toNum = (v: any): number => {
  const n = parseFloat(String(v))
  return isNaN(n) ? 0 : n
}

interface DimRow { nombre: string; ventas_unidades: number; num_skus: number }

export default function MercadeoProductoPage() {
  const { fPaises, fCats, fSubcats, fClientes, fAnos, fMeses, buildParams } = useDashboardFilters()

  const [fSku,    setFSku]    = useState('')
  const [rows,    setRows]    = useState<DimRow[]>([])
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(() => {
    setLoading(true)
    const p = buildParams({ dim: 'producto' })
    if (fSku.trim()) p.set('sku', fSku.trim())

    fetch('/api/ventas/dimension?' + p.toString())
      .then(r => r.json())
      .then(j => {
        if (j.error) { showError(j.error || 'Error al cargar datos'); return }
        setRows((j.rows || []).map((row: any) => ({
          nombre:          String(row.nombre || '(sin nombre)'),
          ventas_unidades: toNum(row.ventas_unidades),
          num_skus:        toNum(row.num_skus),
        })).sort((a: DimRow, b: DimRow) => b.ventas_unidades - a.ventas_unidades))
      })
      .finally(() => setLoading(false))
  }, [buildParams, fSku])

  useEffect(() => { cargar() }, [cargar, fPaises, fCats, fSubcats, fClientes, fAnos, fMeses])

  const totalUds = rows.reduce((s, r) => s + r.ventas_unidades, 0)
  const top15    = rows.slice(0, 15)

  // Cuartiles para clasificar tendencia visual
  const q75 = rows.length > 0
    ? rows[Math.floor(rows.length * 0.25)]?.ventas_unidades ?? 0
    : 0
  const q25 = rows.length > 0
    ? rows[Math.floor(rows.length * 0.75)]?.ventas_unidades ?? 0
    : 0

  const getTendencia = (uds: number) => {
    if (uds >= q75) return 'alta'
    if (uds >= q25) return 'media'
    return 'baja'
  }

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Mercadeo · Dimensiones</p>
          <h1 className="text-2xl font-bold text-gray-800">Tendencias por Producto</h1>
          <p className="text-xs text-gray-400 mt-0.5">Ranking y volumen de unidades por SKU</p>
        </div>
        <button onClick={cargar}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* Filtros globales */}
      <GlobalFilterBar />

      {/* Filtro SKU local */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-3">
          <div className="w-64">
            <label className="text-xs text-gray-500 mb-1 block">SKU / Descripción</label>
            <input
              value={fSku}
              onChange={e => setFSku(e.target.value)}
              placeholder="Buscar SKU..."
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        </div>
      </div>

      {/* KPIs — solo unidades */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Unidades Totales',  value: loading ? '...' : fmtU(totalUds) + ' uds',                                    sub: 'total período',       icon: <TrendingUp size={18}/>,  color: 'border-l-amber-500'   },
          { label: 'Productos Activos', value: loading ? '...' : String(rows.length),                                         sub: 'SKUs con ventas',     icon: <ShoppingBag size={18}/>, color: 'border-l-emerald-500' },
          { label: 'Promedio por SKU',  value: loading ? '...' : fmtU(rows.length > 0 ? totalUds / rows.length : 0) + ' uds', sub: 'unidades / producto', icon: <Package size={18}/>,    color: 'border-l-blue-500'   },
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

      {/* Top 15 — barras horizontales */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-semibold text-gray-700 mb-1">Top 15 Productos por Volumen</h3>
        <p className="text-xs text-gray-400 mb-4">Unidades vendidas</p>
        {loading
          ? <div className="h-64 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
          : top15.length === 0
            ? <div className="h-64 flex items-center justify-center text-gray-300 text-sm">Sin datos</div>
            : <BarChartPro
                data={top15}
                dataKey="ventas_unidades"
                nameKey="nombre"
                layout="vertical"
                colors={COLORS}
                height={Math.max(260, top15.length * 36)}
                formatter={(v) => toNum(v).toLocaleString() + ' uds'}
                tooltipUnit="uds"
                xTickFmt={(v: number) => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(0)+'K' : String(v)}
                yTickFmt={(v: string) => v.length > 28 ? v.substring(0, 28) + '…' : v}
                yWidth={180}
                margin={{ top: 4, right: 64, left: 8, bottom: 0 }}
              />
        }
      </div>

      {/* Tabla completa — sin USD */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-semibold text-gray-700 mb-4">Ranking de Productos</h3>
        {loading
          ? <p className="text-sm text-gray-300">Cargando...</p>
          : rows.length === 0
            ? <p className="text-sm text-gray-400">Sin datos</p>
            : <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 uppercase tracking-widest border-b border-gray-100">
                      <th className="text-left py-2 pr-4 w-8">#</th>
                      <th className="text-left py-2 pr-4">Producto / SKU</th>
                      <th className="text-right py-2 pr-4">Unidades</th>
                      <th className="text-right py-2 pr-4">% Total</th>
                      <th className="text-left py-2 pr-4">Participación</th>
                      <th className="text-center py-2">Nivel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const pct       = totalUds > 0 ? (r.ventas_unidades / totalUds * 100) : 0
                      const tendencia = getTendencia(r.ventas_unidades)
                      return (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-2.5 pr-4 text-gray-400 font-mono text-xs">{i + 1}</td>
                          <td className="py-2.5 pr-4 text-gray-700 max-w-xs">
                            <div className="truncate font-medium">{r.nombre}</div>
                          </td>
                          <td className="py-2.5 pr-4 text-right font-semibold text-gray-800">
                            {r.ventas_unidades.toLocaleString()}
                          </td>
                          <td className="py-2.5 pr-4 text-right text-gray-600">{pct.toFixed(1)}%</td>
                          <td className="py-2.5 pr-4">
                            <div className="w-28 bg-gray-100 rounded-full h-2">
                              <div className="h-2 rounded-full transition-all duration-500"
                                style={{ width: Math.min(pct * 3, 100) + '%', background: COLORS[i % COLORS.length] }} />
                            </div>
                          </td>
                          <td className="py-2.5 text-center">
                            {tendencia === 'alta' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                <ArrowUp size={9}/> Alto
                              </span>
                            )}
                            {tendencia === 'media' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                <Minus size={9}/> Medio
                              </span>
                            )}
                            {tendencia === 'baja' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                                <ArrowDown size={9}/> Bajo
                              </span>
                            )}
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
