'use client'
import { showError } from '@/lib/toast'
import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, TrendingUp, TrendingDown, Minus, Calendar } from 'lucide-react'
import LineChartPro from '@/components/dashboard/LineChartPro'
import BarChartPro from '@/components/dashboard/BarChartPro'
import { useDashboardFilters } from '@/lib/context/DashboardFilters'
import GlobalFilterBar from '@/components/dashboard/GlobalFilterBar'

const MESES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const fmtU = (n: number) =>
  isNaN(n) || !isFinite(n) ? '0' :
  n >= 1e6 ? (n/1e6).toFixed(2)+'M' :
  n >= 1e3 ? (n/1e3).toFixed(1)+'K' :
  n.toFixed(0)

const toNum = (v: any) => { const n = parseFloat(String(v)); return isNaN(n) ? 0 : n }

type Agrup = 'mes' | 'semana' | 'dia'

export default function MercadeoTendenciasPage() {
  const { fPaises, fCats, fSubcats, fClientes, fAnos, fMeses, buildParams } = useDashboardFilters()

  const [agrup,    setAgrup]    = useState<Agrup>('mes')
  const [comp,     setComp]     = useState(false)

  const [rows,     setRows]     = useState<any[]>([])
  const [rowsComp, setRowsComp] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)

  const cargar = useCallback((agrupVal: Agrup, compVal: boolean) => {
    setLoading(true)
    const p = buildParams({ agrup: agrupVal })
    if (compVal && fAnos.length === 1) p.set('comp', '1')

    fetch('/api/mercadeo/tendencias?' + p.toString())
      .then(r => r.json())
      .then(j => {
        if (j.error) { showError(j.error || 'Error al cargar datos'); return }

        if (agrupVal === 'mes') {
          const raw = (j.rows || []).map((r: any) => ({
            label: (MESES[toNum(r.mes)] || String(r.mes)) + (j.rows.some((x: any) => x.ano !== r.ano) ? ' ' + String(r.ano).slice(2) : ''),
            uds:   toNum(r.ventas_unidades),
            ano:   toNum(r.ano),
            mes:   toNum(r.mes),
          }))
          setRows(raw)
          setRowsComp((j.rowsComp || []).map((r: any) => ({
            label: MESES[toNum(r.mes)] || String(r.mes),
            uds:   toNum(r.ventas_unidades),
          })))
        } else if (agrupVal === 'semana') {
          setRows((j.rows || []).map((r: any) => ({
            label: 'S' + r.semana,
            uds:   toNum(r.ventas_unidades),
          })))
          setRowsComp([])
        } else {
          setRows((j.rows || []).map((r: any) => ({
            label: `D${r.dia}`,
            uds:   toNum(r.ventas_unidades),
          })))
          setRowsComp([])
        }
      })
      .finally(() => setLoading(false))
  }, [buildParams, fAnos])

  useEffect(() => { cargar(agrup, comp) }, [cargar, agrup, comp, fPaises, fCats, fSubcats, fClientes, fAnos, fMeses])

  const onAgrup = (v: Agrup)   => { setAgrup(v); }
  const onComp  = (v: boolean) => { setComp(v);  }

  // KPIs derivados
  const totalUds    = rows.reduce((s, r) => s + r.uds, 0)
  const maxPico     = rows.reduce((max, r) => r.uds > max.uds ? r : max, { label: '—', uds: 0 })
  const minValle    = rows.filter(r => r.uds > 0).reduce((min, r) => r.uds < min.uds ? r : min, { label: '—', uds: Infinity })
  const promMensual = rows.length > 0 ? totalUds / rows.length : 0

  // Media para línea de referencia
  const media = promMensual

  // Combinar series para comparación
  const chartDataComp = comp && rowsComp.length > 0
    ? rows.map((r, i) => ({ ...r, udsAnterior: rowsComp[i]?.uds || 0 }))
    : rows

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Mercadeo · Análisis</p>
          <h1 className="text-2xl font-bold text-gray-800">Tendencias de Ventas</h1>
          <p className="text-xs text-gray-400 mt-0.5">Evolución de unidades vendidas en el tiempo</p>
        </div>
        <button onClick={() => cargar(agrup, comp)}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* Filtros globales */}
      <GlobalFilterBar />

      {/* Controles de página: granularidad + comparación */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Opciones de visualización</p>
        <div className="flex items-center gap-6 flex-wrap">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Granularidad</label>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
              {(['mes','semana','dia'] as Agrup[]).map(a => (
                <button key={a} onClick={() => onAgrup(a)}
                  className={`px-3 text-[11px] py-1.5 rounded-md font-medium transition-all ${
                    agrup === a ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {a === 'mes' ? 'Mes' : a === 'semana' ? 'Sem.' : 'Día'}
                </button>
              ))}
            </div>
          </div>
          {agrup === 'mes' && fAnos.length === 1 && (
            <div className="flex items-end pb-0.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={comp} onChange={e => onComp(e.target.checked)}
                  className="rounded text-amber-500 focus:ring-amber-400" />
                <span className="text-xs text-gray-600">Comparar año anterior</span>
              </label>
            </div>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Unidades',   value: loading ? '...' : fmtU(totalUds),       sub: `${rows.length} períodos`,                                                                     icon: <TrendingUp size={18}/>,  color: 'border-l-amber-500'   },
          { label: 'Promedio/Período', value: loading ? '...' : fmtU(promMensual),     sub: agrup === 'mes' ? 'uds/mes' : agrup === 'semana' ? 'uds/semana' : 'uds/día',                  icon: <Calendar size={18}/>,    color: 'border-l-blue-500'    },
          { label: 'Pico Máximo',      value: loading ? '...' : fmtU(maxPico.uds),     sub: maxPico.label,                                                                                 icon: <TrendingUp size={18}/>,  color: 'border-l-emerald-500' },
          { label: 'Valle Mínimo',     value: loading ? '...' : (minValle.uds === Infinity ? '—' : fmtU(minValle.uds)), sub: minValle.label,                                               icon: <TrendingDown size={18}/>, color: 'border-l-red-400'    },
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

      {/* Gráfico principal — Línea de tendencia */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-semibold text-gray-700 mb-1">
          Evolución de Unidades · {agrup === 'mes' ? 'Mensual' : agrup === 'semana' ? 'Semanal' : 'Diaria'}
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          {comp && rowsComp.length > 0 ? 'Línea naranja = año actual · Línea gris = año anterior' : 'Unidades vendidas en el tiempo'}
        </p>
        {loading
          ? <div className="h-72 flex items-center justify-center text-gray-300 text-sm">Cargando...</div>
          : rows.length === 0
            ? <div className="h-72 flex items-center justify-center text-gray-400 text-sm">Sin datos</div>
            : <LineChartPro
                data={chartDataComp}
                nameKey="label"
                height={300}
                formatter={(v) => fmtU(Number(v)) + ' uds'}
                yTickFmt={fmtU}
                yWidth={52}
                dot={true}
                margin={{ top: 4, right: 20, left: 0, bottom: 0 }}
                refLine={media > 0 ? { y: media, label: 'Prom', color: '#9ca3af' } : undefined}
                lines={comp && rowsComp.length > 0
                  ? [
                      { key: 'uds',         color: '#c8873a', label: 'Año actual'   },
                      { key: 'udsAnterior', color: '#d1d5db', label: 'Año anterior' },
                    ]
                  : [{ key: 'uds', color: '#c8873a', label: 'Unidades' }]}
              />
        }
      </div>

      {/* Gráfico de barras — comparación entre períodos */}
      {!loading && rows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-semibold text-gray-700 mb-1">Volumen por Período</h3>
          <p className="text-xs text-gray-400 mb-4">Barras para identificar picos y caídas rápidamente</p>
          <BarChartPro
            data={rows}
            dataKey="uds"
            nameKey="label"
            colors="#c8873a"
            height={220}
            formatter={(v) => fmtU(Number(v)) + ' uds'}
            yTickFmt={fmtU}
            yWidth={52}
            margin={{ top: 4, right: 20, left: 0, bottom: 0 }}
            refLine={media > 0 ? { y: media, label: 'Prom', color: '#c8873a' } : undefined}
            showLabels={rows.length <= 14}
            labelFmt={fmtU}
          />
        </div>
      )}

      {/* Tabla detalle */}
      {!loading && rows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-semibold text-gray-700 mb-4">Detalle por Período</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase tracking-widest border-b border-gray-100">
                  <th className="text-left py-2 pr-4">Período</th>
                  <th className="text-right py-2 pr-4">Unidades</th>
                  <th className="text-right py-2 pr-4">vs Promedio</th>
                  <th className="text-left py-2">Tendencia</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const vsMedia = media > 0 ? ((r.uds - media) / media) * 100 : 0
                  const prev    = i > 0 ? rows[i - 1].uds : null
                  const varPrev = prev && prev > 0 ? ((r.uds - prev) / prev) * 100 : null
                  return (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 pr-4 text-gray-700 font-medium">{r.label}</td>
                      <td className="py-2 pr-4 text-right font-semibold text-gray-800">{r.uds.toLocaleString()}</td>
                      <td className="py-2 pr-4 text-right">
                        <span className={vsMedia >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                          {vsMedia >= 0 ? '+' : ''}{vsMedia.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-2">
                        {varPrev === null ? <span className="text-xs text-gray-300">—</span>
                          : varPrev > 5  ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700"><TrendingUp size={9}/> +{varPrev.toFixed(1)}%</span>
                          : varPrev < -5 ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600"><TrendingDown size={9}/> {varPrev.toFixed(1)}%</span>
                          : <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500"><Minus size={9}/> {varPrev.toFixed(1)}%</span>
                        }
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
