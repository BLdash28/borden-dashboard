'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, RefreshCw } from 'lucide-react'
import InnovacionesSection from '@/components/ejecucion/InnovacionesSection'

const SLUG         = 'gt-unisuper'
const PAIS_NOMBRE  = 'Guatemala'
const BANDERA      = '🇬🇹'
const CADENA_LABEL = 'Unisuper · Borden'

type Tab = 'dashboard' | 'innovaciones'

export default function DashboardClientePage() {
  const [key, setKey] = useState(0)
  const [tab, setTab] = useState<Tab>('dashboard')
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
          {tab === 'dashboard' && (
            <>
              <button onClick={() => setKey(k => k + 1)}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                title="Recargar dashboard">
                <RefreshCw size={12}/> Recargar
              </button>
              <a href={src} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                <ExternalLink size={12}/> Abrir en nueva pestaña
              </a>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-5 border-b border-gray-100 bg-white flex-shrink-0">
        {([
          { k: 'dashboard' as Tab,    label: '📊 Dashboard'    },
          { k: 'innovaciones' as Tab, label: '🆕 Innovaciones' },
        ]).map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors
              ${tab === t.k
                ? 'text-amber-700 border-amber-500'
                : 'text-gray-500 border-transparent hover:text-gray-800'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {tab === 'dashboard' ? (
        <iframe key={key} src={src} className="flex-1 w-full border-0"
          title={`Dashboard ${CADENA_LABEL}`} loading="lazy" style={{ minHeight: 0 }} />
      ) : (
        <div className="flex-1 overflow-y-auto px-6 py-6 bg-gray-50">
          <InnovacionesSection
            apiUrl="/api/comercial/ejecucion/gt/unisuper/innovaciones"
            titulo="Unisuper · Guatemala"
            subtitulo={`${BANDERA} Detección automática: SKUs con primera venta en los últimos 180 días.`}
            monedaLabel="USD"
          />
        </div>
      )}
    </div>
  )
}
