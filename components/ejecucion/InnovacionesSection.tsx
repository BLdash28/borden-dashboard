'use client'
import { useEffect, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

// Formatters
const fmt$   = (v: number) => '$' + Math.round(v).toLocaleString('en-US')
const fmtNum = (v: number) => Math.round(v).toLocaleString('en-US')
const MES    = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

export type InnovacionItem = {
  sku: string
  codigo_barras: string | null
  descripcion: string | null
  categoria: string | null
  subcategoria: string | null
  primera_venta: string | null
  ultima_venta: string | null
  dias_desde_lanz: number | null
  sin_ventas: boolean
  total_uds: number
  total_valor: number
  pdvs_unicos: number
  cadenas_unicas: number
  monthly: { ano: number; mes: number; uds: number; valor: number; pdvs: number }[]
  daily:   { fecha: string; uds: number; valor: number; pdvs: number }[]
}

export type InnovacionesData = {
  items: InnovacionItem[]
  total: number
  ventana_dias: number
}

interface Props {
  /**
   * URL del endpoint de innovaciones. Debe devolver { items, total, ventana_dias }.
   */
  apiUrl: string
  /**
   * Título mostrado en el header (ej: "Innovaciones · Walmart Costa Rica").
   */
  titulo: string
  /**
   * Descripción corta bajo el título (opcional).
   */
  subtitulo?: string
  /**
   * Moneda del `total_valor` para el label (USD, COP, GTQ, etc.). Default 'USD'.
   */
  monedaLabel?: string
  /**
   * Símbolo de la moneda para formatear valores. Default '$'.
   */
  formatValor?: (v: number) => string
}

/**
 * Score card de Innovaciones — patrón replicado del módulo Éxito CO.
 * Consume un endpoint que devuelve la lista de SKUs marcados como innovación
 * (por columna o por heurística) con su evolución de ventas.
 */
export function InnovacionesSection({
  apiUrl, titulo, subtitulo,
  monedaLabel = 'USD',
  formatValor = fmt$,
}: Props) {
  const [data, setData]       = useState<InnovacionesData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(apiUrl)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [apiUrl])

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[0, 1].map(i => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse">
            <div className="h-4 bg-gray-100 rounded w-2/3 mb-3" />
            <div className="h-6 bg-gray-100 rounded w-1/2 mb-2" />
            <div className="h-[100px] bg-gray-50 rounded mt-4" />
          </div>
        ))}
      </div>
    )
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 text-center">
        <p className="text-4xl mb-3">🆕</p>
        <p className="text-base font-semibold text-gray-700 mb-1">Sin innovaciones detectadas</p>
        <p className="text-sm text-gray-400 max-w-md mx-auto">
          No hay SKUs con primera venta en la ventana de {data?.ventana_dias ?? 180} días.
          Cuando se carguen ventas de un SKU nuevo, aparecerán acá automáticamente.
        </p>
      </div>
    )
  }

  const { items } = data
  const totalUds   = items.reduce((s, x) => s + x.total_uds, 0)
  const totalValor = items.reduce((s, x) => s + x.total_valor, 0)
  const conVenta   = items.filter(x => !x.sin_ventas).length

  return (
    <div className="space-y-5">
      {/* Header + KPIs */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
              Score Card Innovaciones
            </p>
            <h2 className="text-base font-bold text-gray-800 mt-0.5">🆕 {titulo}</h2>
            {subtitulo && <p className="text-xs text-gray-500 mt-1">{subtitulo}</p>}
            <p className="text-xs text-gray-500 mt-1">
              {conVenta}/{items.length} SKUs con ventas registradas · ventana {data.ventana_dias} días
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <Kpi label="SKUs innovación" value={String(items.length)} sub="Detectados" />
          <Kpi label="Con ventas"      value={`${conVenta}/${items.length}`} sub="Activados" />
          <Kpi label="Unidades acum."  value={fmtNum(totalUds)}   sub="Desde lanzamiento" highlight={totalUds > 0} />
          <Kpi label={`Valor acum. (${monedaLabel})`}
               value={formatValor(totalValor)} sub="Desde lanzamiento" highlight={totalValor > 0} />
        </div>
      </div>

      {/* Cards por SKU */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {items.map(it => {
          const bg = it.sin_ventas ? 'bg-white border-gray-200' : 'bg-emerald-50/40 border-emerald-200'
          return (
            <div key={it.sku || it.codigo_barras || Math.random()}
                 className={`rounded-2xl border shadow-sm p-5 ${bg}`}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                    SKU {it.sku}
                    {it.codigo_barras && <span className="ml-1.5 text-gray-300 normal-case">· EAN {it.codigo_barras}</span>}
                  </p>
                  <h3 className="text-sm font-bold text-gray-800 mt-0.5 leading-snug">
                    {it.descripcion || it.sku}
                  </h3>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {it.categoria && <span>{it.categoria}</span>}
                    {it.subcategoria && <span className="text-gray-400"> · {it.subcategoria}</span>}
                  </p>
                </div>
                {it.sin_ventas ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 whitespace-nowrap">
                    🕓 Sin ventas aún
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 whitespace-nowrap">
                    ✓ Activo
                  </span>
                )}
              </div>

              {/* Métricas de venta */}
              {it.sin_ventas ? (
                <div className="mt-4 py-4 text-center bg-white/60 rounded-lg border border-dashed border-gray-200">
                  <p className="text-xs text-gray-500">
                    Aún no se registran ventas para este SKU.
                  </p>
                  <p className="text-[10px] text-gray-400 mt-1">
                    Este panel se actualiza automáticamente cuando llegan datos.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-2 mt-3">
                    <div className="text-center">
                      <p className="text-[9px] uppercase tracking-widest text-gray-400">Primera venta</p>
                      <p className="text-xs font-semibold text-gray-800">{it.primera_venta ?? '—'}</p>
                      {it.dias_desde_lanz !== null && (
                        <p className="text-[9px] text-gray-400">hace {it.dias_desde_lanz}d</p>
                      )}
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] uppercase tracking-widest text-gray-400">Unidades</p>
                      <p className="text-sm font-bold text-gray-800">{fmtNum(it.total_uds)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] uppercase tracking-widest text-gray-400">Valor {monedaLabel}</p>
                      <p className="text-sm font-bold text-emerald-700">{formatValor(it.total_valor)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] uppercase tracking-widest text-gray-400">PDVs</p>
                      <p className="text-sm font-bold text-gray-800">{it.pdvs_unicos}</p>
                    </div>
                  </div>

                  {/* Evolución mensual (barras livianas) */}
                  {it.monthly.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-[9px] uppercase tracking-widest text-gray-400 mb-1.5">Evolución mensual</p>
                      <div className="flex gap-1 flex-wrap">
                        {it.monthly.map((m, i) => (
                          <div key={i} className="flex-1 min-w-[42px] text-center bg-white/70 rounded p-1.5">
                            <p className="text-[9px] text-gray-400">{MES[m.mes]}-{String(m.ano).slice(2)}</p>
                            <p className="text-[11px] font-bold text-gray-700">{Math.round(m.uds)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Evolución diaria (gradient area) */}
                  {it.daily.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-[9px] uppercase tracking-widest text-gray-400 mb-1.5">
                        Evolución diaria · {it.daily.length} días con venta
                      </p>
                      <ResponsiveContainer width="100%" height={180}>
                        <AreaChart data={it.daily} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                          <defs>
                            <linearGradient id={`gradInnovX-${it.sku}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%"  stopColor="#10b981" stopOpacity={0.35}/>
                              <stop offset="100%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="fecha" tick={{ fontSize: 9, fill: '#64748b' }}
                                 tickFormatter={(v: string) => v.slice(5)}
                                 interval="preserveStartEnd" minTickGap={20}
                                 axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} width={35}
                                 axisLine={false} tickLine={false} />
                          <Tooltip
                            formatter={(v: unknown, name: string) => {
                              if (name === 'uds') return [Math.round(Number(v)) + ' und', 'Unidades']
                              return [String(v), name]
                            }}
                            labelFormatter={(l: string) => `Fecha: ${l}`}
                            contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                          />
                          <Area type="monotone" dataKey="uds" stroke="#059669" strokeWidth={2}
                                fill={`url(#gradInnovX-${it.sku})`} dot={false}
                                activeDot={{ r: 5, strokeWidth: 2, fill: '#fff', stroke: '#059669' }}
                                name="uds" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Kpi({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border shadow-sm p-4 ${highlight ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-100'}`}>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest leading-tight mb-1">{label}</p>
      <p className={`text-xl font-bold ${highlight ? 'text-emerald-700' : 'text-gray-800'}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default InnovacionesSection
