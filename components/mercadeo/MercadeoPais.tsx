'use client'

/**
 * Módulo Mercadeo · Cliente — renderiza el mismo componente de Ejecución que
 * el cliente ya tiene (WalmartEjecucion, ExitoEjecucion, etc.) para reusar sus
 * pestañas y layout completos. La diferenciación visual la da el sidebar (que
 * carga la sección Mercadeo con sus items) y la URL (/dashboard/mercadeo/...).
 *
 * Los clientes que no tienen componente reusable (Selectos, Unisuper con
 * lógica inline en su page.tsx) muestran un link temporal a la vista de
 * Ejecución hasta que se extraiga su componente.
 */

import dynamic from 'next/dynamic'
import Link from 'next/link'
import ChartSkeleton from '@/components/ui/ChartSkeleton'
import { ExternalLink } from 'lucide-react'
import { MercadeoModeContext } from './MercadeoModeContext'

const WalmartEjecucion    = dynamic(() => import('@/components/ejecucion/WalmartEjecucion'),    { loading: () => <ChartSkeleton /> })
const ExitoEjecucion      = dynamic(() => import('@/components/ejecucion/ExitoEjecucion'),      { loading: () => <ChartSkeleton /> })
const CostaDairyEjecucion = dynamic(() => import('@/components/ejecucion/CostaDairyEjecucion'), { loading: () => <ChartSkeleton /> })
const SensacionEjecucion  = dynamic(() => import('@/components/ejecucion/SensacionEjecucion'),  { loading: () => <ChartSkeleton /> })

const PAIS_META: Record<string, { flag: string; nombre: string }> = {
  gt: { flag: '🇬🇹', nombre: 'Guatemala'   },
  hn: { flag: '🇭🇳', nombre: 'Honduras'    },
  ni: { flag: '🇳🇮', nombre: 'Nicaragua'   },
  sv: { flag: '🇸🇻', nombre: 'El Salvador' },
  cr: { flag: '🇨🇷', nombre: 'Costa Rica'  },
  co: { flag: '🇨🇴', nombre: 'Colombia'    },
}

export function MercadeoPais({ pais, cliente }: { pais: string; cliente: string }) {
  const paisCode  = pais.toLowerCase()
  const cliCode   = cliente.toLowerCase()
  const paisUpper = pais.toUpperCase()
  const paisMeta  = PAIS_META[paisCode] ?? { flag: '🌎', nombre: paisUpper }

  // El wrapper aplica el data-attribute + contexto para que los componentes de
  // Ejecución oculten métricas monetarias mientras estén embebidos en Mercadeo.
  const wrap = (child: React.ReactNode) => (
    <MercadeoModeContext.Provider value={true}>
      <div data-mercadeo-mode="1">{child}</div>
    </MercadeoModeContext.Provider>
  )

  // Walmart cubre CR/GT/HN/NI/SV
  if (cliCode === 'walmart') {
    return wrap(<WalmartEjecucion pais={paisUpper} bandera={paisMeta.flag} paisNombre={paisMeta.nombre} />)
  }
  if (cliCode === 'grupo-exito') return wrap(<ExitoEjecucion />)
  if (cliCode === 'costa-dairy') return wrap(<CostaDairyEjecucion />)
  if (cliCode === 'sensacion')   return wrap(<SensacionEjecucion />)

  // Selectos y Unisuper viven inline en sus page.tsx de Ejecución — todavía
  // no hay componente reusable. Link temporal a la vista de Ejecución.
  const rutaEj = `/dashboard/comercial/ejecucion/${paisCode}/${cliCode}`
  return (
    <div className="p-6">
      <div className="bg-white rounded-xl border border-emerald-100 shadow-sm p-8 text-center">
        <p className="text-sm font-semibold text-emerald-700">
          Módulo {cliCode.charAt(0).toUpperCase() + cliCode.slice(1)} · {paisMeta.nombre}
        </p>
        <p className="text-xs text-gray-400 mt-2 mb-4">
          Este cliente todavía no expuso un componente reusable. Podés abrir la vista
          de Ejecución mientras se extrae.
        </p>
        <Link href={rutaEj}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs hover:bg-emerald-700">
          <ExternalLink size={12}/> Abrir en Ejecución
        </Link>
      </div>
    </div>
  )
}
