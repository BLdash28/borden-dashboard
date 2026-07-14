'use client'
/**
 * Chart de tendencia (Mensual / Diaria) reusable — mismo look que Sensación CR:
 *   - Unidades → Bar verde (eje derecho)
 *   - Venta → Area azul con gradient (eje izquierdo)
 *   - Precio / Und → Area verde oscuro (eje oculto)
 * Soporta multi-selección de métricas y, en Mensual, series por SKU.
 */
import type { ReactNode } from 'react'
import {
  BarChart, Bar, Line, ComposedChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

// ─── Tipos públicos ─────────────────────────────────────────────────────────

export type TendMetrica = 'valor' | 'unidades' | 'precio'
type MetricaKind = 'bar' | 'area'

export type TendPoint = {
  ano: number
  mes: number
  mes_str: string
  valor_usd: number
  valor_cop: number
  unidades: number
  precio_usd: number
  precio_cop: number
}
export type TendLabel = { ano: number; mes: number; mes_str: string }
export type TendData = {
  desde: string | null
  hasta: string | null
  labels: TendLabel[]
  total: TendPoint[]
  por_sku: { sku: string; descripcion: string; points: TendPoint[] }[]
}
export type TendDailyRow = {
  dia_str: string
  valor_usd: number
  valor_cop: number
  unidades: number
}
export type TendDailyPoint = TendDailyRow & { fecha?: string }
export type TendDailyBySku = {
  sku: string
  descripcion: string | null
  points: TendDailyPoint[]
}

// ─── Constantes visuales ────────────────────────────────────────────────────

export const METRICA_META: Record<TendMetrica, { label: string; color: string; gradId: string; axis: 'left' | 'right' | 'hidden'; kind: MetricaKind }> = {
  valor:    { label: 'Venta',        color: '#3b82f6', gradId: 'gradMetricaValor',  axis: 'left',   kind: 'area' },
  unidades: { label: 'Unidades',     color: '#10b981', gradId: 'gradMetricaUds',    axis: 'right',  kind: 'bar'  },
  precio:   { label: 'Precio / Und', color: '#059669', gradId: 'gradMetricaPrecio', axis: 'hidden', kind: 'area' },
}

export const SKU_LINE_COLORS = ['#f59e0b', '#2563eb', '#10b981', '#dc2626', '#8b5cf6', '#0891b2', '#ea580c', '#65a30d']

// ─── Helpers de formato ─────────────────────────────────────────────────────

function fmtValor(n: number, isCop: boolean) {
  if (!isFinite(n)) return '$0'
  if (isCop) return n >= 1e9 ? '$' + (n/1e9).toFixed(1) + 'B' : n >= 1e6 ? '$' + (n/1e6).toFixed(1) + 'M' : n >= 1e3 ? '$' + (n/1e3).toFixed(0) + 'K' : '$' + n.toFixed(0)
  return n >= 1e6 ? '$' + (n/1e6).toFixed(2) + 'M' : n >= 1e3 ? '$' + (n/1e3).toFixed(1) + 'K' : '$' + n.toFixed(0)
}
function fmtUds(n: number) {
  if (!isFinite(n)) return '0'
  return n >= 1000 ? (n/1000).toFixed(0) + 'K' : String(Math.round(n))
}
function fmtPrecio(n: number, isCop: boolean) {
  if (!isFinite(n)) return '$0'
  return isCop
    ? '$ ' + Math.round(n).toLocaleString('es-CO')
    : '$' + n.toFixed(2)
}
function tipMetric(v: unknown, key: TendMetrica, isCop: boolean) {
  const n = Number(v)
  if (key === 'unidades') return Number.isFinite(n) ? n.toLocaleString('en-US') + ' uds' : '—'
  if (key === 'precio')   return fmtPrecio(n, isCop)
  return isCop
    ? '$ ' + Math.round(n).toLocaleString('es-CO')
    : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const axisKey = (m: TendMetrica): string =>
  METRICA_META[m].axis === 'right' ? 'right' : (METRICA_META[m].axis === 'hidden' ? 'hidden' : 'left')

// ─── Toggle multi-métrica ───────────────────────────────────────────────────

export function useTendMetricas(initial: TendMetrica[] = ['valor']) {
  // Devuelve el estado + un toggler que garantiza que nunca queda vacío.
  // Nota: no importa useState acá para dejar el hook como side-effect free-utility;
  // el consumidor debe hacer su propio useState y pasarle el toggler.
  return (prev: TendMetrica[], m: TendMetrica): TendMetrica[] => {
    const has = prev.includes(m)
    if (has && prev.length === 1) return prev
    return has ? prev.filter(x => x !== m) : [...prev, m]
  }
}

export function MetricaTogglePill({
  metricas, onToggle, activeClass = 'bg-blue-600 text-white',
}: {
  metricas: TendMetrica[]
  onToggle: (m: TendMetrica) => void
  activeClass?: string
}) {
  return (
    <div className="flex rounded-lg border border-gray-200 overflow-hidden text-[11px]">
      {(['valor','unidades','precio'] as const).map(m => {
        const active = metricas.includes(m)
        return (
          <button key={m} onClick={() => onToggle(m)}
            title="Click para agregar / quitar (multi-selección)"
            className={`px-3 py-1 font-semibold transition-colors ${active ? activeClass : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
            {METRICA_META[m].label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Componente Mensual ─────────────────────────────────────────────────────

export function TendenciaMensualChart({
  tendencia, metricas, moneda, skuFilter, height = 320, header,
}: {
  tendencia: TendData | null
  metricas: TendMetrica[]
  moneda: 'usd' | 'cop'
  skuFilter: string[]
  height?: number
  header?: ReactNode
}) {
  if (!tendencia) {
    return <div style={{ height }} className="mt-3 flex items-center justify-center text-xs text-gray-400">Cargando tendencia mensual…</div>
  }
  if (!tendencia.labels?.length) {
    return <div style={{ height }} className="mt-3 flex items-center justify-center text-xs text-gray-400">Sin datos disponibles.</div>
  }

  const isCop = moneda === 'cop'
  const pickMetric = (p: TendPoint, m: TendMetrica) => {
    if (m === 'unidades') return p.unidades
    if (m === 'precio')   return isCop ? p.precio_cop : p.precio_usd
    return isCop ? p.valor_cop : p.valor_usd
  }

  const usePerSku = skuFilter.length > 0 && (tendencia.por_sku?.length ?? 0) > 0
  const metricaSingle: TendMetrica = usePerSku ? (metricas[0] ?? 'valor') : 'valor'

  const chartData = tendencia.labels.map((l, i) => {
    const row: Record<string, unknown> = { mes_str: l.mes_str, ano: l.ano, mes: l.mes }
    if (usePerSku) {
      tendencia.por_sku.forEach(s => {
        row[`sku_${s.sku}`] = pickMetric(s.points[i], metricaSingle)
      })
    } else {
      metricas.forEach(m => {
        row[`m_${m}`] = pickMetric(tendencia.total[i], m)
      })
    }
    return row
  })

  return (
    <>
      {header ?? (
        <p className="text-[10px] text-gray-400 mt-2 mb-1">
          Rango: {tendencia.desde} → {tendencia.hasta}
          {usePerSku
            ? ` · ${METRICA_META[metricaSingle].label} · ${tendencia.por_sku.length} SKU${tendencia.por_sku.length > 1 ? 's' : ''}`
            : ` · ${metricas.map(m => METRICA_META[m].label).join(' + ')}`}
        </p>
      )}
      <div style={{ height }} className="mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 16, left: 8, bottom: 4 }} barCategoryGap="18%" barGap={3}>
            <defs>
              {usePerSku
                ? tendencia.por_sku.map((s, i) => {
                    const c = SKU_LINE_COLORS[i % SKU_LINE_COLORS.length]
                    return (
                      <linearGradient key={s.sku} id={`gradSku_${s.sku}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={c} stopOpacity={1}/>
                        <stop offset="100%" stopColor={c} stopOpacity={0.75}/>
                      </linearGradient>
                    )
                  })
                : metricas.map(m => {
                    const meta = METRICA_META[m]
                    if (meta.kind === 'area') {
                      return (
                        <linearGradient key={m} id={meta.gradId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor={meta.color} stopOpacity={0.35}/>
                          <stop offset="60%"  stopColor={meta.color} stopOpacity={0.08}/>
                          <stop offset="100%" stopColor={meta.color} stopOpacity={0}/>
                        </linearGradient>
                      )
                    }
                    return (
                      <linearGradient key={m} id={meta.gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={meta.color} stopOpacity={1}/>
                        <stop offset="100%" stopColor={meta.color} stopOpacity={0.75}/>
                      </linearGradient>
                    )
                  })}
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="mes_str" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="left"
              tickFormatter={(v) => metricaSingle === 'unidades' && usePerSku ? fmtUds(Number(v)) : metricaSingle === 'precio' && usePerSku ? fmtPrecio(Number(v), isCop) : fmtValor(Number(v), isCop)}
              tick={{ fontSize: 11, fill: '#94a3b8' }} width={70} axisLine={false} tickLine={false} />
            <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => fmtUds(Number(v))} tick={{ fontSize: 10, fill: '#2563eb' }} width={55} axisLine={false} tickLine={false} />
            <YAxis yAxisId="hidden" hide />
            <Tooltip
              cursor={{ fill: 'rgba(148,163,184,0.08)' }}
              contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
              formatter={(v: unknown, name: string, entry: { dataKey?: string | number }) => {
                const dk = String(entry?.dataKey ?? '')
                if (dk.startsWith('m_')) {
                  const m = dk.slice(2) as TendMetrica
                  return [tipMetric(v, m, isCop), name]
                }
                return [tipMetric(v, metricaSingle, isCop), name]
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {usePerSku
              ? tendencia.por_sku.map((s, i) => {
                  const name = s.descripcion ? `${s.sku} · ${s.descripcion}` : s.sku
                  const c = SKU_LINE_COLORS[i % SKU_LINE_COLORS.length]
                  const kind = METRICA_META[metricaSingle].kind
                  if (kind === 'bar') {
                    return (
                      <Bar key={s.sku} yAxisId="left" dataKey={`sku_${s.sku}`} name={name}
                        fill={`url(#gradSku_${s.sku})`} radius={[6,6,0,0]} maxBarSize={22} />
                    )
                  }
                  return (
                    <Line key={s.sku} yAxisId="left" type="monotone" dataKey={`sku_${s.sku}`} name={name}
                      stroke={c} strokeWidth={2.5}
                      dot={{ r: 3, strokeWidth: 2, fill: '#fff', stroke: c }}
                      activeDot={{ r: 5, strokeWidth: 2, fill: '#fff', stroke: c }} connectNulls />
                  )
                })
              : metricas.map(m => {
                  const meta = METRICA_META[m]
                  const name = meta.label + (m === 'valor' ? ` (${moneda.toUpperCase()})` : m === 'precio' ? ` (${moneda.toUpperCase()})` : '')
                  if (meta.kind === 'bar') {
                    return (
                      <Bar key={m} yAxisId={axisKey(m)} dataKey={`m_${m}`} name={name}
                        fill={`url(#${meta.gradId})`} radius={[6,6,0,0]} maxBarSize={28} />
                    )
                  }
                  return (
                    <Area key={m} yAxisId={axisKey(m)} type="monotone" dataKey={`m_${m}`} name={name}
                      stroke={meta.color} strokeWidth={2.5} fill={`url(#${meta.gradId})`} dot={false}
                      activeDot={{ r: 5, strokeWidth: 2, fill: '#fff', stroke: meta.color }} connectNulls />
                  )
                })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}

// ─── Componente Diaria ──────────────────────────────────────────────────────

export function TendenciaDiariaChart({
  rows, metricas, moneda, loading, height = 320, header, porSku = [],
}: {
  rows: TendDailyRow[]
  metricas: TendMetrica[]
  moneda: 'usd' | 'cop'
  loading: boolean
  height?: number
  header?: ReactNode
  porSku?: TendDailyBySku[]
}) {
  if (loading) return <div style={{ height }} className="mt-3 flex items-center justify-center text-xs text-gray-400">Cargando data diaria…</div>
  if (!rows.length) return <div style={{ height }} className="mt-3 flex items-center justify-center text-xs text-gray-400">Sin datos diarios.</div>

  const isCop = moneda === 'cop'
  const usePerSku = porSku.length > 0
  const metricaSingle: TendMetrica = usePerSku ? (metricas[0] ?? 'valor') : 'valor'
  const pickMetricSku = (p: TendDailyPoint) => {
    if (metricaSingle === 'unidades') return p.unidades
    const v = isCop ? p.valor_cop : p.valor_usd
    if (metricaSingle === 'precio') return p.unidades > 0 ? v / p.unidades : 0
    return v
  }

  // Data: si per-sku, pivot por dia_str con columnas sku_<X>. Si no, aggregate normal.
  const data = usePerSku
    ? (() => {
        // Set unión de todos los dia_str de todas las SKUs, ordenados por fecha
        const set = new Map<string, string>()   // dia_str → fecha (para sort)
        porSku.forEach(s => s.points.forEach(p => set.set(p.dia_str, p.fecha ?? p.dia_str)))
        const dias = [...set.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([k]) => k)
        return dias.map(d => {
          const row: Record<string, unknown> = { dia_str: d }
          porSku.forEach(s => {
            const pt = s.points.find(p => p.dia_str === d)
            row[`sku_${s.sku}`] = pt ? pickMetricSku(pt) : 0
          })
          return row
        })
      })()
    : rows.map(r => {
        const valor  = isCop ? r.valor_cop : r.valor_usd
        const precio = r.unidades > 0 ? valor / r.unidades : 0
        return { dia_str: r.dia_str, m_valor: valor, m_unidades: r.unidades, m_precio: precio }
      })

  return (
    <>
      {header ?? (
        <p className="text-[10px] text-gray-400 mt-2 mb-1">
          Ventas diarias · {usePerSku
            ? `${METRICA_META[metricaSingle].label} · ${porSku.length} SKU${porSku.length > 1 ? 's' : ''}`
            : metricas.map(m => METRICA_META[m].label).join(' + ')}
        </p>
      )}
      <div style={{ height }} className="mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 16, left: 8, bottom: 4 }} barCategoryGap="20%" barGap={2}>
            <defs>
              {usePerSku
                ? porSku.map((s, i) => {
                    const c = SKU_LINE_COLORS[i % SKU_LINE_COLORS.length]
                    return (
                      <linearGradient key={s.sku} id={`gradSkuDia_${s.sku}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={c} stopOpacity={1}/>
                        <stop offset="100%" stopColor={c} stopOpacity={0.75}/>
                      </linearGradient>
                    )
                  })
                : metricas.map(m => {
                    const meta = METRICA_META[m]
                    if (meta.kind === 'area') {
                      return (
                        <linearGradient key={m} id={`${meta.gradId}Dia`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor={meta.color} stopOpacity={0.35}/>
                          <stop offset="60%"  stopColor={meta.color} stopOpacity={0.08}/>
                          <stop offset="100%" stopColor={meta.color} stopOpacity={0}/>
                        </linearGradient>
                      )
                    }
                    return (
                      <linearGradient key={m} id={`${meta.gradId}Dia`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={meta.color} stopOpacity={1}/>
                        <stop offset="100%" stopColor={meta.color} stopOpacity={0.75}/>
                      </linearGradient>
                    )
                  })}
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="dia_str" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false}
              interval={Math.max(0, Math.floor(data.length / 20) - 1)} />
            <YAxis yAxisId="left"
              tickFormatter={(v) => usePerSku && metricaSingle === 'unidades' ? fmtUds(Number(v)) : usePerSku && metricaSingle === 'precio' ? fmtPrecio(Number(v), isCop) : fmtValor(Number(v), isCop)}
              tick={{ fontSize: 11, fill: '#94a3b8' }} width={70} axisLine={false} tickLine={false} />
            <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => fmtUds(Number(v))} tick={{ fontSize: 10, fill: '#2563eb' }} width={55} axisLine={false} tickLine={false} />
            <YAxis yAxisId="hidden" hide />
            <Tooltip
              cursor={{ fill: 'rgba(148,163,184,0.08)' }}
              contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
              formatter={(v: unknown, name: string, entry: { dataKey?: string | number }) => {
                const dk = String(entry?.dataKey ?? '')
                if (dk.startsWith('m_')) {
                  const m = dk.slice(2) as TendMetrica
                  return [tipMetric(v, m, isCop), name]
                }
                return [tipMetric(v, metricaSingle, isCop), name]
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {usePerSku
              ? porSku.map((s, i) => {
                  const name = s.descripcion ? `${s.sku} · ${s.descripcion}` : s.sku
                  const c = SKU_LINE_COLORS[i % SKU_LINE_COLORS.length]
                  const kind = METRICA_META[metricaSingle].kind
                  if (kind === 'bar') {
                    return (
                      <Bar key={s.sku} yAxisId="left" dataKey={`sku_${s.sku}`} name={name}
                        fill={`url(#gradSkuDia_${s.sku})`} radius={[4,4,0,0]} maxBarSize={12} />
                    )
                  }
                  return (
                    <Line key={s.sku} yAxisId="left" type="monotone" dataKey={`sku_${s.sku}`} name={name}
                      stroke={c} strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 5, strokeWidth: 2, fill: '#fff', stroke: c }} connectNulls />
                  )
                })
              : metricas.map(m => {
                  const meta = METRICA_META[m]
                  const name = meta.label + (m === 'valor' ? ` (${moneda.toUpperCase()})` : m === 'precio' ? ` (${moneda.toUpperCase()})` : '')
                  if (meta.kind === 'bar') {
                    return (
                      <Bar key={m} yAxisId={axisKey(m)} dataKey={`m_${m}`} name={name}
                        fill={`url(#${meta.gradId}Dia)`} radius={[6,6,0,0]} maxBarSize={20} />
                    )
                  }
                  return (
                    <Area key={m} yAxisId={axisKey(m)} type="monotone" dataKey={`m_${m}`} name={name}
                      stroke={meta.color} strokeWidth={2.5} fill={`url(#${meta.gradId}Dia)`} dot={false}
                      activeDot={{ r: 5, strokeWidth: 2, fill: '#fff', stroke: meta.color }} connectNulls />
                  )
                })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}
