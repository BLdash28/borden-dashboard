'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, LabelList,
} from 'recharts'
import { fmt$, MONTHS } from '@/utils/helpers'

/**
 * Sell-Out vs Sell-In (vs Devoluciones opcional) — replica el formato del
 * chart de Éxito CO para reutilizar en el resto de ejecuciones.
 *
 * Colores fijos: Sell-In azul (#3b82f6), Sell-Out amber (#f59e0b),
 * Devoluciones rojo (#ef4444). Solo Colombia recibe devoluciones.
 *
 * Props:
 *   sellinUrl:  endpoint tipo /api/comercial/sell-in/evolucion
 *   selloutUrl: endpoint tipo /api/comercial/ejecucion/<cliente>/tendencia-mensual
 *   devolucionesUrl: opcional — endpoint que devuelva { monthly: [{ mes, valor_usd }] }.
 *                    Si se omite, se muestra solo Sell-In vs Sell-Out.
 *   ano:        año a comparar (default 2026).
 *   subtitulo:  texto secundario opcional.
 */
export default function SellInVsSellOutChart({
  sellinUrl,
  selloutUrl,
  devolucionesUrl,
  ano = 2026,
  subtitulo,
}: {
  sellinUrl:        string
  selloutUrl:       string
  devolucionesUrl?: string
  ano?:             number
  subtitulo?:       string
}) {
  const [sellinRaw,  setSellinRaw]  = useState<any>(null)
  const [selloutRaw, setSelloutRaw] = useState<any>(null)
  const [devolRaw,   setDevolRaw]   = useState<any>(null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    let cancel = false
    setSellinRaw(null); setSelloutRaw(null); setDevolRaw(null); setErr(false)
    const fetches: Promise<any>[] = [
      fetch(sellinUrl).then(r => r.json()).catch(() => null),
      fetch(selloutUrl).then(r => r.json()).catch(() => null),
    ]
    if (devolucionesUrl) {
      fetches.push(fetch(devolucionesUrl).then(r => r.json()).catch(() => null))
    }
    Promise.all(fetches).then(res => {
      if (cancel) return
      const [si, so, dv] = res
      if (!si || !so) { setErr(true); return }
      setSellinRaw(si); setSelloutRaw(so)
      if (dv) setDevolRaw(dv)
    })
    return () => { cancel = true }
  }, [sellinUrl, selloutUrl, devolucionesUrl])

  const data = useMemo(() => {
    if (!sellinRaw || !selloutRaw) return [] as { mes_nombre: string; sellin: number; sellout: number; devoluciones: number | null; pctDevol: number | null }[]
    const anoKey = String(ano)
    const sellinByMes:  Record<number, number> = {}
    const selloutByMes: Record<number, number> = {}
    const devolByMes:   Record<number, number> = {}
    for (const r of (sellinRaw.mensual ?? [])) {
      sellinByMes[Number(r.mes)] = Number(r[anoKey] ?? 0)
    }
    for (const r of (selloutRaw.total ?? [])) {
      if (Number(r.ano) !== ano) continue
      selloutByMes[Number(r.mes)] = Number(r.valor_usd ?? 0)
    }
    if (devolRaw) {
      for (const r of (devolRaw.monthly ?? devolRaw.mensual ?? [])) {
        devolByMes[Number(r.mes)] = Number(r.valor_usd ?? r.valor ?? 0)
      }
    }
    const maxMes = Math.max(0,
      ...Object.keys(sellinByMes).map(Number),
      ...Object.keys(selloutByMes).map(Number),
      ...Object.keys(devolByMes).map(Number),
    )
    const rows: { mes_nombre: string; sellin: number; sellout: number; devoluciones: number | null; pctDevol: number | null }[] = []
    for (let m = 1; m <= maxMes; m++) {
      const si = sellinByMes[m]  ?? 0
      const so = selloutByMes[m] ?? 0
      const dv = devolucionesUrl ? (devolByMes[m] ?? 0) : null
      if (si === 0 && so === 0 && (!dv || dv === 0)) continue
      const pctDevol = si > 0 && dv !== null ? (dv / si) * 100 : null
      rows.push({ mes_nombre: MONTHS[m], sellin: si, sellout: so, devoluciones: dv, pctDevol })
    }
    return rows
  }, [sellinRaw, selloutRaw, devolRaw, devolucionesUrl, ano])

  // Bar label formatter (mismo criterio que Éxito)
  const fmtBarLbl = (v: any) => {
    const n = Number(v); if (!isFinite(n) || n === 0) return ''
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M'
    if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K'
    return '$' + Math.round(n)
  }
  const yTick = (v: number) => {
    if (Math.abs(v) >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M'
    if (Math.abs(v) >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K'
    return '$' + v
  }

  if (err) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-xs text-gray-400">
        No se pudo cargar la comparativa Sell-In vs Sell-Out.
      </div>
    )
  }

  if (!sellinRaw || !selloutRaw) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="h-4 bg-gray-100 rounded w-1/3 mb-3 animate-pulse" />
        <div className="h-[280px] bg-gray-50 rounded animate-pulse" />
      </div>
    )
  }

  const totSellin = data.reduce((s, m) => s + (m.sellin ?? 0), 0)
  const totDevol  = data.reduce((s, m) => s + (m.devoluciones ?? 0), 0)
  const pctYTD    = devolucionesUrl && totSellin > 0 ? (totDevol / totSellin) * 100 : null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-bold text-gray-800">
            {devolucionesUrl ? 'Sell-Out vs Sell-In vs Devoluciones' : 'Sell-Out vs Sell-In'}
          </h3>
          <p className="text-[11px] text-gray-400">
            Comparativo mensual · {ano} (USD)
            {subtitulo && <><span className="mx-1.5 text-gray-300">·</span>{subtitulo}</>}
            {pctYTD !== null && (
              <>
                <span className="mx-1.5 text-gray-300">·</span>
                <span className="font-semibold text-red-600">Devol. YTD: {pctYTD.toFixed(1)}% del Sell-In</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"/> Sell-In</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"/> Sell-Out</span>
          {devolucionesUrl && (
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500"/> Devoluciones</span>
          )}
        </div>
      </div>
      <div className="h-[280px] mt-3">
        {data.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-10">Sin datos para {ano}.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barCategoryGap="20%">
              <defs>
                <linearGradient id="gradBarSellinCmp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#3b82f6" stopOpacity={1}/>
                  <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.85}/>
                </linearGradient>
                <linearGradient id="gradBarSelloutCmp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#f59e0b" stopOpacity={1}/>
                  <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.85}/>
                </linearGradient>
                <linearGradient id="gradBarDevolCmp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#ef4444" stopOpacity={1}/>
                  <stop offset="100%" stopColor="#f87171" stopOpacity={0.85}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="mes_nombre" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={yTick} tick={{ fontSize: 11, fill: '#94a3b8' }} width={60}
                     axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                formatter={(v: any, name: string, item: any) => {
                  if (name === 'Devoluciones') {
                    const pct = item?.payload?.pctDevol as number | null
                    return [
                      `${fmt$(Number(v))}${pct !== null && pct !== undefined ? ` (${pct.toFixed(1)}% Sell-In)` : ''}`,
                      name,
                    ]
                  }
                  return [fmt$(Number(v)), name]
                }} />
              <Bar dataKey="sellin"  name="Sell-In"  fill="url(#gradBarSellinCmp)"  radius={[8,8,0,0]} maxBarSize={28}>
                <LabelList dataKey="sellin"  position="top" formatter={fmtBarLbl}
                  style={{ fontSize: 9, fill: '#1e40af', fontWeight: 700 }} />
              </Bar>
              <Bar dataKey="sellout" name="Sell-Out" fill="url(#gradBarSelloutCmp)" radius={[8,8,0,0]} maxBarSize={28}>
                <LabelList dataKey="sellout" position="top" formatter={fmtBarLbl}
                  style={{ fontSize: 9, fill: '#92400e', fontWeight: 700 }} />
              </Bar>
              {devolucionesUrl && (
                <Bar dataKey="devoluciones" name="Devoluciones" fill="url(#gradBarDevolCmp)" radius={[8,8,0,0]} maxBarSize={28}>
                  <LabelList
                    position="top"
                    content={(props: any) => {
                      const { x, y, width, value, index } = props
                      if (value === null || value === undefined || value === 0) return null
                      const pct = data[index]?.pctDevol
                      const label = fmtBarLbl(value)
                      const pctTxt = pct !== null && pct !== undefined ? ` (${pct.toFixed(1)}%)` : ''
                      return (
                        <text x={x + width / 2} y={y - 4} textAnchor="middle"
                          style={{ fontSize: 9, fill: '#b91c1c', fontWeight: 700 }}>
                          {label}{pctTxt}
                        </text>
                      )
                    }} />
                </Bar>
              )}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
