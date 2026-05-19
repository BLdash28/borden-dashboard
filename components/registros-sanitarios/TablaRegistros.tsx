'use client'
import { Pencil, Trash2, FileText, AlertTriangle, AlertCircle, CheckCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { COUNTRY_FLAGS } from '@/utils/helpers'

interface DimProducto {
  sku: string
  codigo_barras: string
  descripcion: string
  categoria: string | null
  subcategoria: string | null
}

interface Props {
  registros:    any[]
  loading:      boolean
  isAdmin:      boolean
  dimProducto:  DimProducto[]
  onEdit:       (r: any) => void
  onDelete:     (id: string) => void
  onViewPDF:    (r: any) => void
}

function diasHastaVencimiento(fecha: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const venc  = new Date(fecha); venc.setHours(0, 0, 0, 0)
  return Math.ceil((venc.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function getAlertaNivel(dias: number): 'vencido' | 'naranja' | 'amarillo' | 'ok' {
  if (dias < 0)   return 'vencido'
  if (dias <= 30) return 'naranja'
  if (dias <= 90) return 'amarillo'
  return 'ok'
}

const NIVEL_STYLE = {
  vencido:  { color: '#ef4444', bg: 'rgba(239,68,68,.1)',  icon: AlertCircle   },
  naranja:  { color: '#f97316', bg: 'rgba(249,115,22,.1)', icon: AlertTriangle },
  amarillo: { color: '#ca8a04', bg: 'rgba(234,179,8,.1)',  icon: AlertTriangle },
  ok:       { color: '#2a7a58', bg: 'rgba(42,122,88,.1)',  icon: CheckCircle   },
}

function DiasChip({ dias }: { dias: number }) {
  const nivel = getAlertaNivel(dias)
  const s     = NIVEL_STYLE[nivel]
  const Icon  = s.icon
  const label = dias < 0 ? `Vencido ${Math.abs(dias)}d` : `${dias}d`
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: s.bg, color: s.color }}>
      <Icon size={9} />
      {label}
    </span>
  )
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function TablaRegistros({ registros, loading, isAdmin, dimProducto, onEdit, onDelete, onViewPDF }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Build lookup maps: EAN (codigo_barras) and SKU (cod_dfa)
  const dimMapByEan = new Map<string, DimProducto>()
  const dimMapBySku = new Map<string, DimProducto>()
  for (const p of dimProducto) {
    if (p.codigo_barras) dimMapByEan.set(p.codigo_barras, p)
    if (p.sku)           dimMapBySku.set(p.sku, p)
  }

  const getMatch = (r: any): { producto: DimProducto; via: 'ean' | 'dfa' } | null => {
    if (r.ean && dimMapByEan.has(r.ean))         return { producto: dimMapByEan.get(r.ean)!, via: 'ean' }
    if (r.cod_dfa && dimMapBySku.has(r.cod_dfa)) return { producto: dimMapBySku.get(r.cod_dfa)!, via: 'dfa' }
    return null
  }

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: 'var(--border)' }} />
        ))}
      </div>
    )
  }

  if (registros.length === 0) {
    return (
      <div className="text-center py-16" style={{ color: 'var(--t3)' }}>
        <FileText size={36} className="mx-auto mb-3 opacity-25" />
        <div className="text-[14px] font-medium mb-1">No se encontraron registros sanitarios</div>
        <div className="text-[12px] opacity-60">Agrega un registro usando el botón "Nuevo Registro"</div>
      </div>
    )
  }

  const HEADERS = [
    'País', 'Portafolio', 'Clasificación', 'COD DFA', 'EAN',
    'Descripción', 'N° Registro', 'Tramitador', 'Dueño Registro',
    'Importador', 'Vencimiento', 'Días para Vencimiento', 'Acciones',
  ]

  return (
    <>
      {/* ── Mobile cards ──────────────────────────────────────────── */}
      <div className="md:hidden space-y-3">
        {registros.map(r => {
          const dias   = diasHastaVencimiento(r.fecha_vencimiento)
          const result = getMatch(r)
          const match  = result?.producto ?? null
          const isOpen = expanded.has(r.id)

          return (
            <div key={r.id} className="rounded-xl border overflow-hidden"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>

              {/* Header row */}
              <div className="flex items-start gap-2 p-3.5">
                <button onClick={() => toggleExpand(r.id)} className="mt-0.5 flex-shrink-0"
                  style={{ color: 'var(--t3)' }}>
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-medium" style={{ color: 'var(--t3)' }}>
                      {COUNTRY_FLAGS[r.pais]} {r.pais}
                    </span>
                    {r.portafolio && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--border)', color: 'var(--t3)' }}>
                        {r.portafolio}
                      </span>
                    )}
                    <DiasChip dias={dias} />
                  </div>
                  <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--t1)' }}>
                    {r.descripcion}
                  </div>
                  {r.clasificacion && (
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--t3)' }}>{r.clasificacion}</div>
                  )}
                </div>
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div className="px-3.5 pb-3.5 pt-0 space-y-3 border-t" style={{ borderColor: 'var(--border)' }}>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3 text-[11px]">
                    {r.cod_dfa && <div><span style={{ color: 'var(--t3)' }}>COD DFA: </span><span style={{ color: 'var(--t2)' }}>{r.cod_dfa}</span></div>}
                    {r.ean     && <div><span style={{ color: 'var(--t3)' }}>EAN: </span><span className="font-mono" style={{ color: 'var(--t2)' }}>{r.ean}</span></div>}
                    <div><span style={{ color: 'var(--t3)' }}>N° Reg: </span><span className="font-mono" style={{ color: 'var(--t2)' }}>{r.numero_registro}</span></div>
                    {r.tramitador      && <div><span style={{ color: 'var(--t3)' }}>Tramitador: </span><span style={{ color: 'var(--t2)' }}>{r.tramitador}</span></div>}
                    {r.dueno_registro  && <div><span style={{ color: 'var(--t3)' }}>Dueño: </span><span style={{ color: 'var(--t2)' }}>{r.dueno_registro}</span></div>}
                    {r.fecha_estimada_registro && <div><span style={{ color: 'var(--t3)' }}>F. Estimada: </span><span style={{ color: 'var(--t2)' }}>{formatDate(r.fecha_estimada_registro)}</span></div>}
                    <div><span style={{ color: 'var(--t3)' }}>Vencimiento: </span><span style={{ color: 'var(--t2)' }}>{formatDate(r.fecha_vencimiento)}</span></div>
                  </div>

                  {/* Match dim_producto */}
                  {match && (
                    <div className="rounded-lg px-3 py-2 text-[11px] space-y-0.5"
                      style={{ background: 'rgba(42,122,88,.07)', border: '1px solid rgba(42,122,88,.18)' }}>
                      <div className="font-semibold text-[10px] uppercase tracking-wide" style={{ color: '#2a7a58' }}>
                        Match BL Foods · dim_producto
                      </div>
                      <div style={{ color: 'var(--t1)' }}>
                        <span style={{ color: 'var(--t3)' }}>SKU:</span> {match.sku} &nbsp;·&nbsp; {match.descripcion}
                      </div>
                      {(match.categoria || match.subcategoria) && (
                        <div style={{ color: 'var(--t3)' }}>
                          {match.categoria}{match.subcategoria ? ` › ${match.subcategoria}` : ''}
                        </div>
                      )}
                    </div>
                  )}
                  {!match && (r.ean || r.cod_dfa) && (
                    <div className="text-[10px] px-2 py-1.5 rounded-lg"
                      style={{ background: 'rgba(239,68,68,.06)', color: '#ef4444' }}>
                      Sin match en dim_producto
                      {r.ean ? ` (EAN ${r.ean})` : r.cod_dfa ? ` (DFA ${r.cod_dfa})` : ''}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => onViewPDF(r)}
                      className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-[12px] font-medium transition-all"
                      style={{ background: r.archivo_pdf_url ? 'rgba(200,135,58,.1)' : 'var(--border)', color: r.archivo_pdf_url ? 'var(--acc)' : 'var(--t3)' }}>
                      <FileText size={13} /> PDF
                    </button>
                    {isAdmin && (
                      <>
                        <button onClick={() => onEdit(r)}
                          className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-[12px] font-medium transition-all hover:bg-blue-500/10 hover:text-blue-400"
                          style={{ background: 'var(--border)', color: 'var(--t3)' }}>
                          <Pencil size={13} /> Editar
                        </button>
                        <button onClick={() => onDelete(r.id)}
                          className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-[12px] font-medium transition-all hover:bg-red-500/10 hover:text-red-400"
                          style={{ background: 'var(--border)', color: 'var(--t3)' }}>
                          <Trash2 size={13} /> Eliminar
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Desktop table ─────────────────────────────────────────── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-[11px] border-collapse" style={{ minWidth: 1100 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th className="w-6 pb-3 pr-2" />
              {HEADERS.map(h => (
                <th key={h}
                  className={`pb-3 pr-3 text-[9px] tracking-[1.5px] uppercase font-medium whitespace-nowrap
                    ${h === 'Días para Vencimiento' ? 'text-center' : 'text-left'}
                    ${h === 'Vencimiento' ? 'pl-10' : ''}
                    ${h === 'Importador' ? 'pl-6' : ''}`}
                  style={{ color: 'var(--t3)' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {registros.map(r => {
              const dias   = diasHastaVencimiento(r.fecha_vencimiento)
              const result = getMatch(r)
              const match  = result?.producto ?? null
              const isOpen = expanded.has(r.id)

              return (
                <>
                  <tr key={r.id}
                    className="transition-colors hover:bg-white/2 cursor-pointer"
                    style={{ borderBottom: isOpen ? 'none' : '1px solid var(--border)' }}
                    onClick={() => toggleExpand(r.id)}
                  >
                    {/* Expand toggle */}
                    <td className="py-2.5 pr-2">
                      <span style={{ color: 'var(--t3)' }}>
                        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </span>
                    </td>

                    {/* País */}
                    <td className="py-2.5 pr-3 whitespace-nowrap" style={{ color: 'var(--t2)' }}>
                      {COUNTRY_FLAGS[r.pais]} {r.pais}
                    </td>

                    {/* Portafolio */}
                    <td className="py-2.5 pr-3 max-w-[100px] truncate" style={{ color: 'var(--t2)' }}>
                      {r.portafolio || '—'}
                    </td>

                    {/* Clasificación */}
                    <td className="py-2.5 pr-3 max-w-[100px] truncate" style={{ color: 'var(--t2)' }}>
                      {r.clasificacion || '—'}
                    </td>

                    {/* COD DFA */}
                    <td className="py-2.5 pr-3 font-mono text-[10px]" style={{ color: 'var(--t2)' }}>
                      {r.cod_dfa || '—'}
                    </td>

                    {/* EAN */}
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-[10px]" style={{ color: 'var(--t2)' }}>
                          {r.ean || '—'}
                        </span>
                        {(r.ean || r.cod_dfa) && (
                          match
                            ? <CheckCircle size={10} style={{ color: '#2a7a58', flexShrink: 0 }} />
                            : <AlertCircle size={10} style={{ color: '#ef4444', flexShrink: 0 }} />
                        )}
                      </div>
                    </td>

                    {/* Descripción */}
                    <td className="py-2.5 pr-3 max-w-[160px] truncate font-medium" style={{ color: 'var(--t1)' }}>
                      {r.descripcion}
                    </td>

                    {/* N° Registro */}
                    <td className="py-2.5 pr-3 font-mono text-[10px] whitespace-nowrap" style={{ color: 'var(--t2)' }}>
                      {r.numero_registro}
                    </td>

                    {/* Tramitador */}
                    <td className="py-2.5 pr-3 max-w-[100px] truncate" style={{ color: 'var(--t2)' }}>
                      {r.tramitador || '—'}
                    </td>

                    {/* Dueño del Registro */}
                    <td className="py-2.5 pr-3 max-w-[120px] truncate" style={{ color: 'var(--t2)' }}>
                      {r.dueno_registro || '—'}
                    </td>

                    {/* Importador */}
                    <td className="py-2.5 pr-3 pl-6 max-w-[130px] truncate" style={{ color: 'var(--t2)' }}>
                      {r.importador || '—'}
                    </td>

                    {/* Vencimiento */}
<td className="py-2.5 pr-2 pl-10 whitespace-nowrap" style={{ color: 'var(--t2)' }}>
                      {formatDate(r.fecha_vencimiento)}
                    </td>

                    {/* Días */}
                    <td className="py-2.5 pr-3 text-center">
                      <DiasChip dias={dias} />
                    </td>

                    {/* Acciones */}
                    <td className="py-2.5" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button onClick={() => onViewPDF(r)} title="Ver PDF"
                          className="p-1.5 rounded-lg transition-all hover:bg-blue-500/10 hover:text-blue-400"
                          style={{ color: r.archivo_pdf_url ? 'var(--acc)' : 'var(--t3)' }}>
                          <FileText size={12} />
                        </button>
                        {isAdmin && (
                          <>
                            <button onClick={() => onEdit(r)} title="Editar"
                              className="p-1.5 rounded-lg transition-all hover:bg-blue-500/10 hover:text-blue-400"
                              style={{ color: 'var(--t3)' }}>
                              <Pencil size={12} />
                            </button>
                            <button onClick={() => onDelete(r.id)} title="Eliminar"
                              className="p-1.5 rounded-lg transition-all hover:bg-red-500/10 hover:text-red-400"
                              style={{ color: 'var(--t3)' }}>
                              <Trash2 size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Match row — visible cuando está expandido */}
                  {isOpen && (
                    <tr key={`${r.id}-match`} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td />
                      <td colSpan={13} className="pb-3 pt-1 pr-4">
                        {match ? (
                          <div className="inline-flex items-center gap-3 px-3 py-1.5 rounded-lg text-[10px]"
                            style={{ background: 'rgba(42,122,88,.07)', border: '1px solid rgba(42,122,88,.18)' }}>
                            <span className="font-semibold uppercase tracking-wide" style={{ color: '#2a7a58' }}>
                              Match BL Foods
                            </span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                              style={{ background: 'rgba(42,122,88,.15)', color: '#2a7a58' }}>
                              vía {result?.via === 'dfa' ? 'COD DFA' : 'EAN'}
                            </span>
                            <span style={{ color: 'var(--t3)' }}>SKU:</span>
                            <span className="font-mono font-medium" style={{ color: 'var(--t1)' }}>{match.sku}</span>
                            {match.codigo_barras && (
                              <>
                                <span style={{ color: 'var(--border)' }}>·</span>
                                <span style={{ color: 'var(--t3)' }}>EAN:</span>
                                <span className="font-mono font-medium" style={{ color: 'var(--t1)' }}>{match.codigo_barras}</span>
                              </>
                            )}
                            <span style={{ color: 'var(--border)' }}>·</span>
                            <span style={{ color: 'var(--t1)' }}>{match.descripcion}</span>
                            {match.categoria && (
                              <>
                                <span style={{ color: 'var(--border)' }}>·</span>
                                <span style={{ color: 'var(--t3)' }}>
                                  {match.categoria}{match.subcategoria ? ` › ${match.subcategoria}` : ''}
                                </span>
                              </>
                            )}
                          </div>
                        ) : (r.ean || r.cod_dfa) ? (
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px]"
                            style={{ background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.15)' }}>
                            <AlertCircle size={11} style={{ color: '#ef4444' }} />
                            <span style={{ color: '#ef4444' }}>
                              Sin match en dim_producto
                              {r.ean ? ` — EAN ${r.ean}` : r.cod_dfa ? ` — DFA ${r.cod_dfa}` : ''}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[10px]" style={{ color: 'var(--t3)' }}>Sin EAN ni COD DFA — no se puede hacer match con dim_producto</span>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
