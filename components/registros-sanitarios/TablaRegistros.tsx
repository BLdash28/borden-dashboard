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

function getAlerta(fecha: string): { nivel: 'vencido'|'naranja'|'amarillo'|'ok'; dias: number } {
  const today = new Date(); today.setHours(0,0,0,0)
  const venc  = new Date(fecha); venc.setHours(0,0,0,0)
  const diff  = Math.ceil((venc.getTime() - today.getTime()) / (1000*60*60*24))
  if (diff < 0)   return { nivel: 'vencido',  dias: diff }
  if (diff <= 30) return { nivel: 'naranja',  dias: diff }
  if (diff <= 90) return { nivel: 'amarillo', dias: diff }
  return { nivel: 'ok', dias: diff }
}

const ALERTA_STYLE = {
  vencido:  { bg: 'rgba(239,68,68,.1)',  color: '#ef4444', icon: AlertCircle },
  naranja:  { bg: 'rgba(249,115,22,.1)', color: '#f97316', icon: AlertTriangle },
  amarillo: { bg: 'rgba(234,179,8,.1)',  color: '#ca8a04', icon: AlertTriangle },
  ok:       { bg: 'rgba(42,122,88,.1)',  color: '#2a7a58', icon: CheckCircle  },
}

export default function TablaRegistros({ registros, loading, isAdmin, onEdit, onDelete, onViewPDF }: Props) {
  if (loading) {
    return (
      <div className="text-center py-12 text-sm" style={{ color: 'var(--t3)' }}>
        Cargando registros...
      </div>
    )
  }
  if (registros.length === 0) {
    return (
      <div className="text-center py-12" style={{ color: 'var(--t3)' }}>
        <FileText size={32} className="mx-auto mb-3 opacity-30" />
        <div className="text-sm">No se encontraron registros sanitarios</div>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['País','Producto','Empresa','Tramitante','N° Registro','Vencimiento','Acciones'].map(h => (
              <th key={h} className="text-left pb-3 pr-4 text-[9px] tracking-[1.5px] uppercase font-medium"
                style={{ color: 'var(--t3)' }}>{h}</th>
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
              <tr key={r.id} className="transition-colors hover:bg-white/3"
                style={{ borderBottom: '1px solid var(--border)' }}>

                {/* País */}
                <td className="py-2.5 pr-4">
                  <span className="font-medium" style={{ color: 'var(--t2)' }}>
                    {COUNTRY_FLAGS[r.pais]} {r.pais}
                  </span>
                </td>

                {/* Producto */}
                <td className="py-2.5 pr-4 font-medium max-w-[160px] truncate" style={{ color: 'var(--t1)' }}>
                  {r.nombre_producto}
                </td>

                {/* Empresa */}
                <td className="py-2.5 pr-4 max-w-[140px] truncate" style={{ color: 'var(--t2)' }}>
                  {r.empresa}
                </td>

                {/* Tramitante */}
                <td className="py-2.5 pr-4 max-w-[120px] truncate" style={{ color: 'var(--t2)' }}>
                  {r.tramitante}
                </td>

                {/* Número */}
                <td className="py-2.5 pr-4 font-mono text-[10px]" style={{ color: 'var(--t2)' }}>
                  {r.numero_registro}
                </td>

                {/* Vencimiento */}
                <td className="py-2.5 pr-4">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium"
                      style={{ background: style.bg, color: style.color }}>
                      <Icon size={10} />
                      {new Date(r.fecha_vencimiento).toLocaleDateString('es-GT', {
                        day:'2-digit', month:'short', year:'numeric'
                      })}
                    </span>
                    <span className="text-[9px]" style={{ color: style.color }}>{label}</span>
                  </div>
                </td>

                {/* Acciones */}
                <td className="py-2.5">
                  <div className="flex items-center gap-1">
                    <button onClick={() => onViewPDF(r)} title="Ver PDF"
                      className="p-1.5 rounded-lg transition-all hover:bg-blue-500/10 hover:text-blue-500"
                      style={{ color: r.archivo_pdf_url ? 'var(--acc)' : 'var(--t3)' }}>
                      <FileText size={13} />
                    </button>
                    {isAdmin && (
                      <>
                        <button onClick={() => onEdit(r)} title="Editar"
                          className="p-1.5 rounded-lg transition-all hover:bg-blue-500/10 hover:text-blue-500"
                          style={{ color: 'var(--t3)' }}>
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => onDelete(r.id)} title="Eliminar"
                          className="p-1.5 rounded-lg transition-all hover:bg-red-500/10 hover:text-red-500"
                          style={{ color: 'var(--t3)' }}>
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
  )
}
