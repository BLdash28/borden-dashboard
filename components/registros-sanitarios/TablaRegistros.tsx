'use client'
import { Pencil, Trash2, FileText, AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react'
import { COUNTRY_FLAGS } from '@/utils/helpers'

interface Props {
  registros: any[]
  loading:   boolean
  isAdmin:   boolean
  onEdit:    (r: any) => void
  onDelete:  (id: string) => void
  onViewPDF: (r: any) => void
}

function getAlerta(fecha: string): { nivel: 'vencido' | 'naranja' | 'amarillo' | 'ok'; dias: number } {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const venc  = new Date(fecha); venc.setHours(0, 0, 0, 0)
  const diff  = Math.ceil((venc.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diff < 0)   return { nivel: 'vencido',  dias: diff }
  if (diff <= 30) return { nivel: 'naranja',  dias: diff }
  if (diff <= 90) return { nivel: 'amarillo', dias: diff }
  return { nivel: 'ok', dias: diff }
}

const ALERTA_STYLE = {
  vencido:  { bg: 'rgba(239,68,68,.1)',  color: '#ef4444', icon: AlertCircle  },
  naranja:  { bg: 'rgba(249,115,22,.1)', color: '#f97316', icon: AlertTriangle },
  amarillo: { bg: 'rgba(234,179,8,.1)',  color: '#ca8a04', icon: AlertTriangle },
  ok:       { bg: 'rgba(42,122,88,.1)',  color: '#2a7a58', icon: CheckCircle  },
}

export default function TablaRegistros({ registros, loading, isAdmin, onEdit, onDelete, onViewPDF }: Props) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: 'var(--border)' }} />
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

  return (
    <>
      {/* ── Mobile cards (< md) ──────────────────────────────────── */}
      <div className="md:hidden space-y-3">
        {registros.map(r => {
          const alerta = getAlerta(r.fecha_vencimiento)
          const style  = ALERTA_STYLE[alerta.nivel]
          const Icon   = style.icon
          const label  = alerta.nivel === 'vencido'
            ? `Vencido hace ${Math.abs(alerta.dias)}d`
            : `${alerta.dias}d restantes`

          return (
            <div
              key={r.id}
              className="p-4 rounded-xl border"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              {/* Header: país + producto */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="text-[12px] font-medium mb-0.5" style={{ color: 'var(--t3)' }}>
                    {COUNTRY_FLAGS[r.pais]} {r.pais}
                  </div>
                  <div className="text-[14px] font-semibold" style={{ color: 'var(--t1)' }}>
                    {r.nombre_producto}
                  </div>
                </div>
                {/* Vencimiento badge */}
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium flex-shrink-0"
                  style={{ background: style.bg, color: style.color }}
                >
                  <Icon size={11} />
                  {label}
                </span>
              </div>

              {/* Details */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-3 text-[12px]">
                <div>
                  <span style={{ color: 'var(--t3)' }}>Empresa: </span>
                  <span style={{ color: 'var(--t2)' }}>{r.empresa}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--t3)' }}>Tramitante: </span>
                  <span style={{ color: 'var(--t2)' }}>{r.tramitante}</span>
                </div>
                <div className="col-span-2">
                  <span style={{ color: 'var(--t3)' }}>N° Registro: </span>
                  <span className="font-mono text-[11px]" style={{ color: 'var(--t2)' }}>{r.numero_registro}</span>
                </div>
                <div className="col-span-2">
                  <span style={{ color: 'var(--t3)' }}>Vencimiento: </span>
                  <span style={{ color: style.color }}>
                    {new Date(r.fecha_vencimiento).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>

              {/* Actions — 44px touch targets */}
              <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <button
                  onClick={() => onViewPDF(r)}
                  title="Ver PDF"
                  className="flex-1 flex items-center justify-center gap-2 h-11 rounded-lg text-[13px] font-medium transition-all active:scale-95"
                  style={{
                    background: r.archivo_pdf_url ? '#c8873a18' : 'var(--border)',
                    color: r.archivo_pdf_url ? 'var(--acc)' : 'var(--t3)',
                  }}
                >
                  <FileText size={15} />
                  PDF
                </button>
                {isAdmin && (
                  <>
                    <button
                      onClick={() => onEdit(r)}
                      title="Editar"
                      className="flex-1 flex items-center justify-center gap-2 h-11 rounded-lg text-[13px] font-medium transition-all hover:bg-blue-500/10 hover:text-blue-400 active:scale-95"
                      style={{ background: 'var(--border)', color: 'var(--t3)' }}
                    >
                      <Pencil size={15} />
                      Editar
                    </button>
                    <button
                      onClick={() => onDelete(r.id)}
                      title="Eliminar"
                      className="flex-1 flex items-center justify-center gap-2 h-11 rounded-lg text-[13px] font-medium transition-all hover:bg-red-500/10 hover:text-red-400 active:scale-95"
                      style={{ background: 'var(--border)', color: 'var(--t3)' }}
                    >
                      <Trash2 size={15} />
                      Eliminar
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Desktop table (≥ md) ─────────────────────────────────── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['País', 'Producto', 'Empresa', 'Tramitante', 'N° Registro', 'Vencimiento', 'Acciones'].map(h => (
                <th key={h}
                  className="text-left pb-3 pr-4 text-[9px] tracking-[1.5px] uppercase font-medium"
                  style={{ color: 'var(--t3)' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {registros.map(r => {
              const alerta = getAlerta(r.fecha_vencimiento)
              const style  = ALERTA_STYLE[alerta.nivel]
              const Icon   = style.icon
              const label  = alerta.nivel === 'vencido'
                ? `Vencido hace ${Math.abs(alerta.dias)}d`
                : `${alerta.dias}d restantes`

              return (
                <tr key={r.id}
                  className="transition-colors hover:bg-white/3"
                  style={{ borderBottom: '1px solid var(--border)' }}
                >
                  <td className="py-2.5 pr-4">
                    <span className="font-medium" style={{ color: 'var(--t2)' }}>
                      {COUNTRY_FLAGS[r.pais]} {r.pais}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 font-medium max-w-[160px] truncate" style={{ color: 'var(--t1)' }}>
                    {r.nombre_producto}
                  </td>
                  <td className="py-2.5 pr-4 max-w-[140px] truncate" style={{ color: 'var(--t2)' }}>
                    {r.empresa}
                  </td>
                  <td className="py-2.5 pr-4 max-w-[120px] truncate" style={{ color: 'var(--t2)' }}>
                    {r.tramitante}
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-[10px]" style={{ color: 'var(--t2)' }}>
                    {r.numero_registro}
                  </td>
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium"
                        style={{ background: style.bg, color: style.color }}
                      >
                        <Icon size={10} />
                        {new Date(r.fecha_vencimiento).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                      <span className="text-[9px]" style={{ color: style.color }}>{label}</span>
                    </div>
                  </td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onViewPDF(r)}
                        title="Ver PDF"
                        className="p-2 rounded-lg transition-all hover:bg-blue-500/10 hover:text-blue-500"
                        style={{ color: r.archivo_pdf_url ? 'var(--acc)' : 'var(--t3)' }}
                      >
                        <FileText size={13} />
                      </button>
                      {isAdmin && (
                        <>
                          <button
                            onClick={() => onEdit(r)}
                            title="Editar"
                            className="p-2 rounded-lg transition-all hover:bg-blue-500/10 hover:text-blue-500"
                            style={{ color: 'var(--t3)' }}
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => onDelete(r.id)}
                            title="Eliminar"
                            className="p-2 rounded-lg transition-all hover:bg-red-500/10 hover:text-red-500"
                            style={{ color: 'var(--t3)' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
