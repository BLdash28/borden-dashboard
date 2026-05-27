'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, RefreshCw } from 'lucide-react'

const SLUG         = 'gt-unisuper'
const PAIS_NOMBRE  = 'Guatemala'
const BANDERA      = '🇬🇹'
const CADENA_LABEL = 'Unisuper · Borden'

export default function DashboardClientePage() {
  const [key, setKey] = useState(0)
  const src = `/dashboards/${SLUG}/index.html`

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-gray-100 shadow-sm flex-shrink-0">
        <Link href="/dashboard/comercial/ejecucion"
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-amber-600 transition-colors">
          <ArrowLeft size={13}/> Ejecución
        </Link>
        <span className="text-gray-200">|</span>
        <span className="text-xl">{BANDERA}</span>
        <h1 className="font-semibold text-gray-800 text-sm flex-1">
          {CADENA_LABEL}
          <span className="text-gray-400 font-normal ml-1">· {PAIS_NOMBRE}</span>
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setKey(k => k + 1)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            title="Recargar dashboard">
            <RefreshCw size={12}/> Recargar
          </button>
          <a href={src} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <ExternalLink size={12}/> Abrir en nueva pestaña
          </a>
        </div>
      </div>
      <iframe key={key} src={src} className="flex-1 w-full border-0"
        title={`Dashboard ${CADENA_LABEL}`} loading="lazy" style={{ minHeight: 0 }} />
    </div>
  )
}
