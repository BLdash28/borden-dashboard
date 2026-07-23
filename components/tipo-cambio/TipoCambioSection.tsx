'use client'
import { useEffect, useMemo, useState } from 'react'
import { TrendingUp, TrendingDown, Minus, Download } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

interface HistData {
  from: string
  to: string
  count: number
  stats: {
    min: number | null
    max: number | null
    avg: number | null
    last: { fecha: string; tasa: number; fuente: string | null } | null
    prev: { fecha: string; tasa: number; fuente: string | null } | null
    delta: number | null
    delta_pct: number | null
  }
  serie: { fecha: string; tasa: number; fuente: string | null }[]
}

interface Props {
  moneda: string          // 'GTQ' | 'COP' | 'CRC' | ...
  paisNombre?: string     // 'Guatemala' | 'Colombia' | ...
  simbolo?: string        // 'Q ' | '$ ' | '₡ '
  dias?: number           // 90 por default
}

export default function TipoCambioSection({ moneda, paisNombre, simbolo = '', dias = 90 }: Props) {
  const [data, setData] = useState<HistData | null>(null)
  const [loading, setLoading] = useState(true)
  const [rango, setRango] = useState<'30' | '90' | '180' | '365'>('90')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/tipo-cambio/historico?to=${moneda}&dias=${rango}`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [moneda, rango])

  const chartData = useMemo(() => {
    if (!data) return []
    return data.serie.map(p => {
      const [y, m, d] = p.fecha.split('-')
      return { ...p, dia_str: `${d}/${m}` }
    })
  }, [data])

  const download = () => {
    if (!data) return
    const lines = [
      'fecha,tasa,fuente',
      ...data.serie.map(r => `${r.fecha},${r.tasa},${r.fuente ?? ''}`),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tipo_cambio_USD_${moneda}_${data.serie[0]?.fecha ?? ''}_${data.serie[data.serie.length - 1]?.fecha ?? ''}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading && !data) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
        <p className="text-3xl mb-2">💱</p>
        <p className="text-sm font-semibold text-gray-600">Cargando tasa de cambio…</p>
      </div>
    )
  }

  if (!data || data.count === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
        <p className="text-3xl mb-2">💱</p>
        <p className="text-sm font-semibold text-gray-600">Sin data de tipo de cambio</p>
        <p className="text-xs text-gray-400 mt-1">
          El bot BanGuat corre diariamente a las 06:00 GT. Si es lunes o feriado y aún no hay tasa, revisá el workflow.
        </p>
      </div>
    )
  }

  const s = data.stats
  const tendencia = s.delta === null ? 'flat' : s.delta > 0 ? 'up' : s.delta < 0 ? 'down' : 'flat'
  const trendColor = tendencia === 'up' ? 'text-emerald-600' : tendencia === 'down' ? 'text-red-600' : 'text-gray-400'
  const TrendIcon = tendencia === 'up' ? TrendingUp : tendencia === 'down' ? TrendingDown : Minus

  return (
    <div className="space-y-5">
      {/* Header + KPIs */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
              Tasa de Cambio · USD → {moneda}
            </p>
            <h2 className="text-base font-bold text-gray-800 mt-0.5">
              {paisNombre ? `${paisNombre} · ` : ''}Fuente oficial
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Último: <strong>{s.last?.fecha ?? '—'}</strong> · {s.last?.fuente ?? '—'}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {(['30','90','180','365'] as const).map(r => (
              <button key={r}
                onClick={() => setRango(r)}
                className={`px-3 py-1 rounded-lg border font-semibold transition-colors ${
                  rango === r ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                }`}>{r}d</button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-4">
            <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-widest mb-1">Tasa vigente</p>
            <p className="text-2xl font-bold text-amber-800 tabular-nums">{simbolo}{s.last?.tasa.toFixed(4) ?? '—'}</p>
            <div className={`inline-flex items-center gap-1 text-[11px] mt-0.5 ${trendColor}`}>
              <TrendIcon size={12} />
              {s.delta !== null && (
                <>{s.delta > 0 ? '+' : ''}{s.delta.toFixed(4)} ({(s.delta_pct ?? 0).toFixed(2)}%)</>
              )}
              <span className="text-gray-400 ml-1">vs día anterior</span>
            </div>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Promedio {rango}d</p>
            <p className="text-2xl font-bold text-gray-700 tabular-nums">{simbolo}{s.avg?.toFixed(4) ?? '—'}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Media de la ventana</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Mínimo {rango}d</p>
            <p className="text-2xl font-bold text-emerald-700 tabular-nums">{simbolo}{s.min?.toFixed(4) ?? '—'}</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Máximo {rango}d</p>
            <p className="text-2xl font-bold text-red-700 tabular-nums">{simbolo}{s.max?.toFixed(4) ?? '—'}</p>
          </div>
        </div>
      </div>

      {/* Chart de línea */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-gray-800">Evolución tasa USD → {moneda}</h3>
            <p className="text-[11px] text-gray-400">Últimos {rango} días · {data.count} puntos</p>
          </div>
        </div>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 30 }}>
              <defs>
                <linearGradient id="gradTasa" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35}/>
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="dia_str" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false}
                angle={-30} textAnchor="end" interval={Math.floor(chartData.length / 12)} height={40} />
              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                tickFormatter={(v) => v.toFixed(4)} />
              <Tooltip
                cursor={{ stroke: '#f59e0b', strokeWidth: 1 }}
                contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                formatter={(v: number) => [`${simbolo}${v.toFixed(4)}`, `USD → ${moneda}`]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fecha ?? ''}
              />
              <Area type="monotone" dataKey="tasa" stroke="#f59e0b" strokeWidth={2}
                fill="url(#gradTasa)" dot={false} activeDot={{ r: 4, fill: '#f59e0b' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabla histórico + descargar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-800">Historial de tasas</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Últimas 30 tasas · fuente {s.last?.fuente ?? 'BanGuat'}</p>
          </div>
          <button type="button" onClick={download}
            className="flex items-center gap-1.5 text-xs text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-lg">
            <Download size={12} /> Descargar CSV
          </button>
        </div>
        <div className="overflow-x-auto max-h-[400px]">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider sticky top-0">
              <tr>
                <th className="px-4 py-2 text-left">Fecha</th>
                <th className="px-4 py-2 text-right">Tasa (USD → {moneda})</th>
                <th className="px-4 py-2 text-right">Δ día anterior</th>
                <th className="px-4 py-2 text-left">Fuente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[...data.serie].reverse().slice(0, 30).map((r, i, arr) => {
                const prevRow = arr[i + 1]
                const dlt = prevRow ? r.tasa - prevRow.tasa : null
                return (
                  <tr key={r.fecha} className="hover:bg-gray-50/60">
                    <td className="px-4 py-2 text-gray-700 tabular-nums">{r.fecha}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold text-gray-800">
                      {simbolo}{r.tasa.toFixed(4)}
                    </td>
                    <td className={`px-4 py-2 text-right tabular-nums ${
                      dlt === null ? 'text-gray-300' : dlt > 0 ? 'text-emerald-600' : dlt < 0 ? 'text-red-600' : 'text-gray-400'
                    }`}>
                      {dlt === null ? '—' : (dlt > 0 ? '+' : '') + dlt.toFixed(4)}
                    </td>
                    <td className="px-4 py-2 text-gray-500">{r.fuente ?? '—'}</td>
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
