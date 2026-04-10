'use client'
import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  TrendingUp, TrendingDown, Minus, Zap, AlertTriangle,
  RefreshCw, Rocket, RotateCcw, X, Check,
} from 'lucide-react'
import BarChartPro from '@/components/dashboard/BarChartPro'
import { useDashboardFilters, MESES_LABEL } from '@/lib/context/DashboardFilters'
import GlobalFilterBar from '@/components/dashboard/GlobalFilterBar'

function fmtU(n: number) {
  if (!n || isNaN(n)) return '0'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return n.toFixed(0)
}

type Tendencia = 'creciendo' | 'estable' | 'declinando'
type Accion    = 'impulsar' | 'mantener' | 'revisar' | 'descontinuar'

interface SkuRec {
  sku: string; descripcion: string
  sumReciente: number; sumAnterior: number
  crecimiento: number; tendencia: Tendencia; accion: Accion
  participacion: number; serie: { label: string; uds: number }[]
  justificacion: string
  paises: string[]
}

const ACCION_CFG: Record<Accion, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  impulsar:     { label: 'Impulsar',     color: '#34d399', bg: '#10b98118', border: '#10b98135', icon: <Rocket size={11} />       },
  mantener:     { label: 'Mantener',     color: '#93c5fd', bg: '#3b82f618', border: '#3b82f635', icon: <Check size={11} />         },
  revisar:      { label: 'Revisar',      color: '#fbbf24', bg: '#f59e0b18', border: '#f59e0b35', icon: <AlertTriangle size={11} /> },
  descontinuar: { label: 'Descontinuar', color: '#f87171', bg: '#ef444418', border: '#ef444435', icon: <X size={11} />             },
}

const TEND_CFG: Record<Tendencia, { label: string; color: string; icon: React.ReactNode }> = {
  creciendo:  { label: 'Creciendo',  color: '#34d399', icon: <TrendingUp size={11} />   },
  estable:    { label: 'Estable',    color: '#94a3b8', icon: <Minus size={11} />        },
  declinando: { label: 'Declinando', color: '#f87171', icon: <TrendingDown size={11} /> },
}

function MiniBar({ data, color }: { data: { label: string; uds: number }[]; color: string }) {
  return (
    <BarChartPro
      data={data}
      dataKey="uds"
      nameKey="label"
      colors={color}
      height={72}
      formatter={(v) => fmtU(Number(v)) + ' uds'}
      margin={{ top: 2, right: 2, left: 2, bottom: 2 }}
    />
  )
}

export default function RecomendacionesPage() {
  // Global filters from context
  const { fPaises, fCats, fAnos, fMeses, buildParams, hayFiltros, limpiar } = useDashboardFilters()

  // Local UI-only filter (not persisted globally)
  const [fAccion, setFAccion] = useState<'todos' | Accion>('todos')

  const [skus,       setSkus]       = useState<SkuRec[]>([])
  const [recientes,  setRecientes]  = useState<{ ano: number; mes: number }[]>([])
  const [anteriores, setAnteriores] = useState<{ ano: number; mes: number }[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')

  const debounceT = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cargar = useCallback((p: URLSearchParams) => {
    setLoading(true); setError('')
    fetch('/api/mercadeo/recomendaciones?' + p.toString())
      .then(r => r.json())
      .then(j => {
        if (j.error) { setError(j.error); return }
        setSkus(j.skus || [])
        setRecientes(j.recientes || [])
        setAnteriores(j.anteriores || [])
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // Reload when global filters change
  useEffect(() => {
    if (debounceT.current) clearTimeout(debounceT.current)
    debounceT.current = setTimeout(() => cargar(buildParams()), 400)
  }, [fPaises, fCats, fAnos, fMeses, cargar, buildParams]) // eslint-disable-line

  const filtrados = skus.filter(s => fAccion === 'todos' || s.accion === fAccion)

  const counts: Record<Accion, number> = {
    impulsar:     skus.filter(s => s.accion === 'impulsar').length,
    mantener:     skus.filter(s => s.accion === 'mantener').length,
    revisar:      skus.filter(s => s.accion === 'revisar').length,
    descontinuar: skus.filter(s => s.accion === 'descontinuar').length,
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] tracking-[2px] uppercase font-medium mb-1" style={{ color: 'var(--t3)' }}>
            Mercadeo · Inteligencia Comercial
          </p>
          <h1 className="text-xl font-bold" style={{ color: 'var(--t1)' }}>Recomendaciones por SKU</h1>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--t3)' }}>
            Basado en los 3 meses cerrados más recientes · mes en curso excluido
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {hayFiltros && (
            <button
              onClick={limpiar}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] border transition-all hover:opacity-80"
              style={{ background: 'transparent', borderColor: 'var(--border)', color: 'var(--t3)' }}
            >
              <RotateCcw size={12} /> Limpiar
            </button>
          )}
          <button
            onClick={() => cargar(buildParams())}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] border transition-all hover:opacity-80"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--t3)' }}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          className="flex items-center gap-2 text-[13px] rounded-lg px-4 py-3 border"
          style={{ background: '#ef444415', borderColor: '#ef444440', color: '#f87171' }}
        >
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* Global filters */}
      <GlobalFilterBar />

      {/* Período analizado */}
      {!loading && recientes.length > 0 && (
        <div className="card p-4">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
            <div>
              <p className="text-[9px] tracking-[2px] uppercase font-semibold mb-1" style={{ color: 'var(--t3)' }}>
                Período analizado (reciente)
              </p>
              <div className="flex gap-1.5">
                {recientes.map((p, i) => (
                  <span key={i} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg"
                    style={{ background: '#c8873a20', color: '#c8873a' }}>
                    {MESES_LABEL[p.mes]} {p.ano}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[9px] tracking-[2px] uppercase font-semibold mb-1" style={{ color: 'var(--t3)' }}>
                Período de comparación (anterior)
              </p>
              <div className="flex gap-1.5">
                {anteriores.map((p, i) => (
                  <span key={i} className="text-[11px] font-medium px-2.5 py-1 rounded-lg"
                    style={{ background: 'var(--bg)', color: 'var(--t3)', border: '1px solid var(--border)' }}>
                    {MESES_LABEL[p.mes]} {p.ano}
                  </span>
                ))}
              </div>
            </div>
            <div className="ml-auto text-right hidden sm:block">
              <p className="text-[9px] tracking-[2px] uppercase font-semibold mb-0.5" style={{ color: 'var(--t3)' }}>SKUs analizados</p>
              <p className="text-xl font-bold" style={{ color: 'var(--t1)' }}>{skus.length}</p>
            </div>
          </div>
        </div>
      )}

      {/* KPIs por acción */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(['impulsar', 'mantener', 'revisar', 'descontinuar'] as Accion[]).map(a => {
          const cfg = ACCION_CFG[a]
          return (
            <button
              key={a}
              onClick={() => setFAccion(fAccion === a ? 'todos' : a)}
              className="card p-4 text-left relative overflow-hidden transition-all hover:opacity-90 active:scale-[.98]"
              style={{ outline: fAccion === a ? `1.5px solid ${cfg.color}` : 'none' }}
            >
              <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: cfg.color }} />
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] tracking-[2px] uppercase font-semibold" style={{ color: 'var(--t3)' }}>
                  {cfg.label}
                </p>
                <span style={{ color: cfg.color }}>{cfg.icon}</span>
              </div>
              <p className="font-display text-[26px] font-bold leading-none" style={{ color: cfg.color }}>
                {loading ? '—' : counts[a]}
              </p>
              <p className="text-[10px] mt-1" style={{ color: 'var(--t3)' }}>
                {loading ? '' : `${skus.length > 0 ? ((counts[a] / skus.length) * 100).toFixed(0) : 0}% del total`}
              </p>
            </button>
          )
        })}
      </div>

      {/* Filtro activo label */}
      {fAccion !== 'todos' && (
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] px-3 py-1 rounded-full font-medium flex items-center gap-1.5"
            style={{ background: ACCION_CFG[fAccion].bg, color: ACCION_CFG[fAccion].color, border: `1px solid ${ACCION_CFG[fAccion].border}` }}
          >
            {ACCION_CFG[fAccion].icon} {ACCION_CFG[fAccion].label}: {filtrados.length} SKU{filtrados.length !== 1 ? 's' : ''}
          </span>
          <button onClick={() => setFAccion('todos')} className="text-[10px] hover:opacity-70" style={{ color: 'var(--t3)' }}>
            Ver todos
          </button>
        </div>
      )}

      {/* Lista SKUs */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="flex gap-4">
                <div className="flex-1 space-y-2">
                  <div className="h-3 rounded w-1/4" style={{ background: 'var(--border)' }} />
                  <div className="h-4 rounded w-1/2" style={{ background: 'var(--border)' }} />
                  <div className="h-3 rounded w-3/4" style={{ background: 'var(--border)' }} />
                </div>
                <div className="w-24 h-12 rounded" style={{ background: 'var(--border)' }} />
              </div>
            </div>
          ))}
        </div>
      ) : filtrados.length === 0 ? (
        <div className="card p-12 text-center">
          <Zap className="mx-auto mb-3 opacity-20" size={40} style={{ color: 'var(--t3)' }} />
          <p className="font-medium" style={{ color: 'var(--t2)' }}>Sin datos para los filtros seleccionados</p>
          <p className="text-[12px] mt-1" style={{ color: 'var(--t3)' }}>Ajusta los filtros o limpia la selección</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtrados.map((s, i) => {
            const acfg = ACCION_CFG[s.accion]
            const tcfg = TEND_CFG[s.tendencia]
            return (
              <div key={i} className="card overflow-hidden">
                <div className="h-0.5" style={{ background: acfg.color }} />
                <div className="p-4">
                  <div className="flex items-start gap-4 flex-wrap sm:flex-nowrap">
                    {/* Columna principal */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: acfg.bg, color: acfg.color, border: `1px solid ${acfg.border}` }}
                        >
                          {acfg.icon} {acfg.label}
                        </span>
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
                          style={{ background: 'var(--bg)', color: tcfg.color, border: '1px solid var(--border)' }}
                        >
                          {tcfg.icon} {tcfg.label}
                        </span>
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full"
                          style={{ background: 'var(--bg)', color: 'var(--t3)', border: '1px solid var(--border)' }}
                        >
                          #{i + 1}
                        </span>
                      </div>
                      {s.sku && (
                        <p className="text-[10px] font-mono mb-0.5" style={{ color: 'var(--acc)' }}>{s.sku}</p>
                      )}
                      <h4 className="font-semibold text-[13px] leading-snug mb-1" style={{ color: 'var(--t1)' }}>
                        {s.descripcion}
                      </h4>
                      {s.paises?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1.5">
                          {s.paises.map(p => (
                            <span key={p} className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                              style={{ background: 'var(--bg)', color: 'var(--t3)', border: '1px solid var(--border)' }}>
                              {p}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-[11px] leading-relaxed" style={{ color: 'var(--t3)' }}>
                        {s.justificacion}
                      </p>
                    </div>

                    {/* Métricas */}
                    <div className="flex items-center gap-6 flex-shrink-0 flex-wrap sm:flex-nowrap">
                      <div className="text-center min-w-[56px]">
                        <p className="text-[11px] tracking-widest uppercase mb-1 font-semibold" style={{ color: 'var(--t3)' }}>Últ. 3m</p>
                        <p className="text-[22px] font-bold leading-none" style={{ color: 'var(--t1)' }}>{fmtU(s.sumReciente)}</p>
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--t3)' }}>uds</p>
                      </div>
                      <div className="text-center min-w-[56px]">
                        <p className="text-[11px] tracking-widest uppercase mb-1 font-semibold" style={{ color: 'var(--t3)' }}>3m ant.</p>
                        <p className="text-[22px] font-medium leading-none" style={{ color: 'var(--t2)' }}>{fmtU(s.sumAnterior)}</p>
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--t3)' }}>uds</p>
                      </div>
                      <div className="text-center min-w-[56px]">
                        <p className="text-[11px] tracking-widest uppercase mb-1 font-semibold" style={{ color: 'var(--t3)' }}>Δ</p>
                        <p className="text-[22px] font-bold leading-none"
                          style={{ color: s.crecimiento > 0 ? '#34d399' : s.crecimiento < 0 ? '#f87171' : 'var(--t3)' }}>
                          {s.crecimiento > 0 ? '+' : ''}{s.crecimiento.toFixed(1)}%
                        </p>
                      </div>
                      <div className="text-center min-w-[48px]">
                        <p className="text-[11px] tracking-widest uppercase mb-1 font-semibold" style={{ color: 'var(--t3)' }}>Part.</p>
                        <p className="text-[22px] font-bold leading-none" style={{ color: 'var(--acc)' }}>{s.participacion.toFixed(1)}%</p>
                      </div>
                      <div className="w-52 flex-shrink-0">
                        <p className="text-[11px] tracking-widest uppercase mb-1.5 text-center font-semibold" style={{ color: 'var(--t3)' }}>
                          {recientes.length === 3
                            ? `${MESES_LABEL[recientes[2].mes]}›${MESES_LABEL[recientes[0].mes]}`
                            : '3 meses'}
                        </p>
                        <MiniBar data={s.serie} color={acfg.color} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Metodología */}
      <div
        className="rounded-xl px-4 py-3 text-[11px] border"
        style={{ background: '#c8873a10', borderColor: '#c8873a30', color: 'var(--t3)' }}
      >
        <div className="flex items-start gap-2.5">
          <Zap size={13} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--acc)' }} />
          <div>
            <strong style={{ color: 'var(--t2)' }}>Metodología: </strong>
            Compara unidades de los <strong style={{ color: 'var(--t2)' }}>3 meses cerrados más recientes</strong> vs los
            3 meses inmediatamente anteriores. &nbsp;
            <span style={{ color: '#34d399' }}>Impulsar</span> ≥ +10% ·
            <span style={{ color: '#93c5fd' }}> Mantener</span> −10% a +10% ·
            <span style={{ color: '#fbbf24' }}> Revisar</span> −25% a −10% ·
            <span style={{ color: '#f87171' }}> Descontinuar</span> &lt; −25% ·
            Participación calculada sobre total del período reciente.
          </div>
        </div>
      </div>

    </div>
  )
}
