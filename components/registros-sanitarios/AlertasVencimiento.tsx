'use client'
import { AlertCircle, AlertTriangle, Clock } from 'lucide-react'
import { COUNTRY_FLAGS } from '@/utils/helpers'

interface Props { registros: any[] }

function diasRestantes(fecha: string): number {
  const today = new Date(); today.setHours(0,0,0,0)
  const venc  = new Date(fecha); venc.setHours(0,0,0,0)
  return Math.ceil((venc.getTime() - today.getTime()) / (1000*60*60*24))
}

export default function AlertasVencimiento({ registros }: Props) {
  const today  = new Date(); today.setHours(0,0,0,0)
  const d30    = new Date(today); d30.setDate(today.getDate() + 30)
  const d90    = new Date(today); d90.setDate(today.getDate() + 90)

  const vencidos  = registros.filter(r => new Date(r.fecha_vencimiento) < today)
    .sort((a,b) => new Date(a.fecha_vencimiento).getTime() - new Date(b.fecha_vencimiento).getTime())

  const naranja   = registros.filter(r => {
    const d = new Date(r.fecha_vencimiento); return d >= today && d <= d30
  }).sort((a,b) => new Date(a.fecha_vencimiento).getTime() - new Date(b.fecha_vencimiento).getTime())

  const amarillo  = registros.filter(r => {
    const d = new Date(r.fecha_vencimiento); return d > d30 && d <= d90
  }).sort((a,b) => new Date(a.fecha_vencimiento).getTime() - new Date(b.fecha_vencimiento).getTime())

  if (vencidos.length === 0 && naranja.length === 0 && amarillo.length === 0) return null

  return (
    <div className="space-y-3">
      {/* Vencidos */}
      {vencidos.length > 0 && (
        <AlertCard
          nivel="vencido"
          icon={<AlertCircle size={14}/>}
          titulo="Registros Vencidos"
          color="#ef4444"
          bg="rgba(239,68,68,.08)"
          border="rgba(239,68,68,.25)"
          registros={vencidos}
          getLabel={(r: any) => `Venció hace ${Math.abs(diasRestantes(r.fecha_vencimiento))} días`}
        />
      )}

      {/* Próximos 30 días */}
      {naranja.length > 0 && (
        <AlertCard
          nivel="naranja"
          icon={<AlertTriangle size={14}/>}
          titulo="Vencen en menos de 30 días"
          color="#f97316"
          bg="rgba(249,115,22,.08)"
          border="rgba(249,115,22,.25)"
          registros={naranja}
          getLabel={(r: any) => `${diasRestantes(r.fecha_vencimiento)} días restantes`}
        />
      )}

      {/* Próximos 90 días */}
      {amarillo.length > 0 && (
        <AlertCard
          nivel="amarillo"
          icon={<Clock size={14}/>}
          titulo="Vencen en menos de 90 días"
          color="#ca8a04"
          bg="rgba(234,179,8,.08)"
          border="rgba(234,179,8,.2)"
          registros={amarillo}
          getLabel={(r: any) => `${diasRestantes(r.fecha_vencimiento)} días restantes`}
        />
      )}
    </div>
  )
}

function AlertCard({ titulo, icon, color, bg, border, registros, getLabel }: any) {
  return (
    <div className="rounded-xl p-4 border" style={{ background: bg, borderColor: border }}>
      <div className="flex items-center gap-2 mb-3" style={{ color }}>
        {icon}
        <span className="text-[11px] font-semibold tracking-wide uppercase">{titulo}</span>
        <span className="ml-auto text-[11px] font-bold">{registros.length} registro{registros.length !== 1 && 's'}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {registros.map((r: any) => (
          <div key={r.id} className="flex items-start justify-between px-3 py-2 rounded-lg"
            style={{ background: 'rgba(0,0,0,.15)' }}>
            <div className="min-w-0">
              <div className="text-[11px] font-medium truncate" style={{ color: 'var(--t1)' }}>
                {COUNTRY_FLAGS[r.pais]} {r.nombre_producto}
              </div>
              <div className="text-[10px] truncate mt-0.5" style={{ color: 'var(--t3)' }}>
                {r.empresa} · {r.numero_registro}
              </div>
            </div>
            <span className="text-[9px] font-semibold ml-2 flex-shrink-0 mt-0.5" style={{ color }}>
              {getLabel(r)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
