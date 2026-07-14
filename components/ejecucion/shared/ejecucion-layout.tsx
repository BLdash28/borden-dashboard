/**
 * Layout estándar de módulos Ejecución.
 * Envuelve header + panel de filtros expandible + tabs + contenido.
 *
 * Uso:
 *   <EjecucionLayout
 *     title="Grupo Éxito · Borden"
 *     eyebrow="Ejecución Grupo Éxito"
 *     subtitle="Colombia · Sell-Out semanal"
 *     flag="🇨🇴"
 *     loading={anyLoading}
 *     filters={[cadena, subcat, ...]}
 *     moneda={moneda} setMoneda={setMoneda} monedas={['cop','usd']}
 *     storageKey="exito-co"
 *     sections={SECTIONS} section={section} onSection={goSection}
 *     accent="amber"
 *   >
 *     {contenido del tab activo}
 *   </EjecucionLayout>
 */
'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { RefreshCw, SlidersHorizontal, X } from 'lucide-react'
import { SectionNav, type SectionDef } from './section-nav'
import { FilterPanel, type FilterDef } from './filter-panel'

const ACCENT_CFG = {
  amber:   { bg: 'bg-amber-500',   chipBg: 'bg-amber-50 border-amber-200 text-amber-800',   chipLbl: 'text-amber-500',   chipHover: 'hover:bg-amber-100' },
  blue:    { bg: 'bg-blue-500',    chipBg: 'bg-blue-50 border-blue-200 text-blue-800',      chipLbl: 'text-blue-500',    chipHover: 'hover:bg-blue-100' },
  emerald: { bg: 'bg-emerald-500', chipBg: 'bg-emerald-50 border-emerald-200 text-emerald-800', chipLbl: 'text-emerald-500', chipHover: 'hover:bg-emerald-100' },
  violet:  { bg: 'bg-violet-500',  chipBg: 'bg-violet-50 border-violet-200 text-violet-800', chipLbl: 'text-violet-500',  chipHover: 'hover:bg-violet-100' },
}

export function EjecucionLayout({
  title, subtitle, eyebrow, flag, loading = false,
  filters, moneda, setMoneda, monedas, storageKey,
  sections, section, onSection,
  onReset,
  accent = 'amber',
  children,
}: {
  title:     string
  subtitle?: string
  eyebrow?:  string
  flag?:     string
  loading?:  boolean
  filters:   FilterDef[]
  moneda?:   string
  setMoneda?: (m: string) => void
  monedas?:  readonly string[]
  storageKey?: string
  sections:  readonly SectionDef[]
  section:   string
  onSection: (k: string) => void
  onReset?:  () => void
  accent?:   'amber' | 'blue' | 'emerald' | 'violet'
  children:  ReactNode
}) {
  const [showFiltros, setShowFiltros] = useState(false)
  const acc = ACCENT_CFG[accent]

  // Persistencia del toggle Filtros abierto/cerrado
  useEffect(() => {
    if (!storageKey) return
    const saved = localStorage.getItem(`${storageKey}-showFiltros`)
    if (saved === '1') setShowFiltros(true)
  }, [storageKey])
  useEffect(() => {
    if (!storageKey) return
    localStorage.setItem(`${storageKey}-showFiltros`, showFiltros ? '1' : '0')
  }, [storageKey, showFiltros])

  const hasAny = filters.some(f => f.value.length > 0) || (moneda && monedas && moneda !== monedas[0])
  const resetAll = () => {
    if (onReset) return onReset()
    filters.forEach(f => f.onChange([]))
    if (setMoneda && monedas) setMoneda(monedas[0])
    if (storageKey) localStorage.removeItem(`${storageKey}-moneda`)
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="px-6 pt-6 pb-0 flex items-start justify-between flex-wrap gap-3">
        <div>
          {eyebrow && <p className="text-xs text-gray-400 uppercase tracking-widest">{eyebrow}</p>}
          <h1 className="text-2xl font-bold text-gray-800">{flag && <span className="mr-1">{flag}</span>}{title}</h1>
          {subtitle && <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {/* Filtros globales */}
      <div className="px-6 pt-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          {/* Barra top: toggle Filtros + chips resumen + moneda + reset */}
          <div className="flex items-center flex-wrap gap-3 justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowFiltros(v => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-lg">
                <SlidersHorizontal size={12}/> Filtros {showFiltros ? '▲' : '▼'}
              </button>
              {filters.filter(f => f.value.length > 0).map(f => (
                <span key={f.key} className={`inline-flex items-center gap-1 text-[11px] font-medium border rounded-full px-2.5 py-1 ${acc.chipBg}`}>
                  <span className={acc.chipLbl}>{f.label}:</span>
                  <span>{f.value.length <= 2 ? f.value.join(', ') : `${f.value.length} sel.`}</span>
                  <button onClick={() => f.onChange([])} className={`ml-0.5 rounded-full p-0.5 ${acc.chipHover}`} aria-label={`Limpiar ${f.label}`}>
                    <X size={10}/>
                  </button>
                </span>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {monedas && setMoneda && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-widest text-gray-400">Moneda</span>
                  <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                    {monedas.map(m => (
                      <button key={m}
                        onClick={() => setMoneda(m)}
                        className={`px-4 py-1.5 text-xs font-semibold transition-colors ${moneda === m ? `${acc.bg} text-white` : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                        {m.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {hasAny && (
                <button
                  onClick={resetAll}
                  className="self-end px-3 py-1.5 text-xs rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 font-medium transition-colors">
                  ↺ Reset
                </button>
              )}
            </div>
          </div>

          {/* Panel expandible */}
          {showFiltros && (
            <FilterPanel filters={filters} accent={accent} />
          )}
        </div>
      </div>

      {/* Tabs */}
      <SectionNav sections={sections} section={section} onChange={onSection} accent={accent} />

      {/* Contenido */}
      <div className="px-6 py-4 flex-1 space-y-4">
        {children}
      </div>
    </div>
  )
}
