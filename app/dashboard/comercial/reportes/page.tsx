'use client'
import { useState } from 'react'
import { FileText, Download, Loader2 } from 'lucide-react'
import { Btn } from '@/components/ui'
import FiltrosGlobales from '@/components/dashboard/FiltrosGlobales'

const REPORTES = [
  {id:'sellout',    titulo:'Reporte Sellout Completo',   desc:'Todas las ventas del período filtrado con precio promedio y proyección', icon:'🛒', excel:true,  pdf:false},
  {id:'cumplimiento',titulo:'Reporte de Cumplimiento',  desc:'Cumplimiento vs mismo mes año anterior por país y cliente',             icon:'🎯', excel:false, pdf:false},
  {id:'doh',        titulo:'Reporte DOH',               desc:'Días de inventario por producto y país',                                icon:'📦', excel:false, pdf:false},
  {id:'coberturas', titulo:'Reporte de Coberturas',     desc:'Cobertura de inventario por punto de venta',                           icon:'🏪', excel:false, pdf:false},
  {id:'resumen',    titulo:'Resumen Ejecutivo',         desc:'KPIs principales del período seleccionado agrupados por país',         icon:'📈', excel:true,  pdf:false},
]

export default function ReportesPage() {
  const [filtros, setFiltros] = useState<any>({})
  const [loading, setLoading] = useState<string | null>(null)
  const [msg, setMsg]         = useState<{text:string; ok:boolean} | null>(null)

  const set = (k: string, v: any) => setFiltros((f: any) => ({ ...f, [k]: v }))

  const showMsg = (text: string, ok: boolean) => {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 3500)
  }

  const descargarExcel = async (tipo: string) => {
    setLoading(tipo + '_excel')
    try {
      const p = new URLSearchParams({ tipo })
      if (filtros.ano)       p.set('ano',       String(filtros.ano))
      if (filtros.mes)       p.set('mes',       String(filtros.mes))
      if (filtros.pais)      p.set('pais',      filtros.pais)
      if (filtros.categoria) p.set('categoria', filtros.categoria)
      if (filtros.cliente)   p.set('cliente',   filtros.cliente)
      if (filtros.sku)       p.set('sku',       filtros.sku)

      const res = await fetch(`/api/reportes/export?${p}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error desconocido' }))
        showMsg(err.error || 'Error generando reporte', false)
        return
      }

      const blob = await res.blob()
      const cd   = res.headers.get('Content-Disposition') || ''
      const match = cd.match(/filename="?([^"]+)"?/)
      const filename = match ? match[1] : `reporte_${tipo}.xlsx`

      const url = URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showMsg('Descarga iniciada ✓', true)
    } catch (e: any) {
      showMsg('Error de conexión', false)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Toast */}
      {msg && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl text-[12px] font-medium shadow-lg transition-all
          ${msg.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {msg.text}
        </div>
      )}

      <FiltrosGlobales filtros={filtros} onChange={set} onSearch={f => setFiltros(f)} />

      <div className="card p-5">
        <div className="text-[9px] tracking-[2px] uppercase font-medium mb-4" style={{ color: 'var(--t3)' }}>
          Exportar Reportes
        </div>
        <div className="space-y-3">
          {REPORTES.map(r => {
            const loadingExcel = loading === r.id + '_excel'
            return (
              <div key={r.id}
                className="flex items-center justify-between p-4 rounded-xl border transition-all hover:border-brand-500/30"
                style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{r.icon}</span>
                  <div>
                    <div className="font-medium text-[13px]" style={{ color: 'var(--t1)' }}>{r.titulo}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--t3)' }}>{r.desc}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  {r.excel ? (
                    <Btn variant="ghost" onClick={() => descargarExcel(r.id)} disabled={!!loading}>
                      {loadingExcel
                        ? <><Loader2 size={12} className="animate-spin"/> Generando...</>
                        : <><FileText size={12}/> Excel</>}
                    </Btn>
                  ) : (
                    <Btn variant="ghost" disabled
                      title="Datos no disponibles aún"
                      className="opacity-40 cursor-not-allowed">
                      <FileText size={12}/> Excel
                    </Btn>
                  )}
                  <Btn variant="ghost" disabled
                    title="PDF próximamente"
                    className="opacity-40 cursor-not-allowed">
                    <Download size={12}/> PDF
                  </Btn>
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-[10px] mt-4 pt-3 border-t" style={{ color: 'var(--t3)', borderColor: 'var(--border)' }}>
          * Cumplimiento, DOH y Coberturas estarán disponibles cuando se conecten los datos reales.
        </p>
      </div>
    </div>
  )
}
