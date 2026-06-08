'use client'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

const CLIENTES = [
  {
    pais: 'GT', bandera: '🇬🇹', nombre: 'Guatemala',
    cadenas: [
      { label: 'Walmart · Borden',  ruta: '/dashboard/comercial/ejecucion/gt/walmart',  activo: false },
      { label: 'Unisuper · Borden', ruta: '/dashboard/comercial/ejecucion/gt/unisuper', activo: false },
    ],
  },
  {
    pais: 'HN', bandera: '🇭🇳', nombre: 'Honduras',
    cadenas: [
      { label: 'Walmart · Borden', ruta: '/dashboard/comercial/ejecucion/hn/walmart', activo: false },
    ],
  },
  {
    pais: 'NI', bandera: '🇳🇮', nombre: 'Nicaragua',
    cadenas: [
      { label: 'Walmart · Borden', ruta: '/dashboard/comercial/ejecucion/ni/walmart', activo: false },
    ],
  },
  {
    pais: 'SV', bandera: '🇸🇻', nombre: 'El Salvador',
    cadenas: [
      { label: 'Selectos · Borden', ruta: '/dashboard/comercial/ejecucion/sv/selectos', activo: true  },
      { label: 'Walmart · Borden',  ruta: '/dashboard/comercial/ejecucion/sv/walmart',  activo: false },
    ],
  },
  {
    pais: 'CR', bandera: '🇨🇷', nombre: 'Costa Rica',
    cadenas: [
      { label: 'Walmart · Borden', ruta: '/dashboard/comercial/ejecucion/cr/walmart', activo: false },
    ],
  },
  {
    pais: 'CO', bandera: '🇨🇴', nombre: 'Colombia',
    cadenas: [
      { label: 'Grupo Éxito · Borden', ruta: '/dashboard/comercial/ejecucion/co/grupo-exito', activo: false },
    ],
  },
]

export default function EjecucionHub() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <p className="text-xs text-gray-400 uppercase tracking-widest">Comercial</p>
        <h1 className="text-2xl font-bold text-gray-800">Ejecución Comercial</h1>
        <p className="text-sm text-gray-400 mt-0.5">Sellout por país y cadena</p>
      </div>

      {/* Inventario PDV — acceso directo */}
      <Link href="/dashboard/comercial/ejecucion/inventario-pdv"
        className="flex items-center justify-between bg-white border border-amber-200 rounded-xl px-5 py-4 shadow-sm hover:bg-amber-50 transition-colors group">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📦</span>
          <div>
            <p className="text-sm font-bold text-gray-800 group-hover:text-amber-700">Inventario PDV · Walmart CA</p>
            <p className="text-xs text-gray-400">CR · GT · HN · NI · SV — Surtido-Inv RetailLink</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full border border-emerald-100">● Activo</span>
          <ChevronRight size={15} className="text-gray-300 group-hover:text-amber-500" />
        </div>
      </Link>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {CLIENTES.map(c => (
          <div key={c.pais} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 bg-gray-50/50 border-b border-gray-100 flex items-center gap-3">
              <span className="text-2xl">{c.bandera}</span>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{c.pais}</p>
                <p className="text-base font-bold text-gray-800">{c.nombre}</p>
              </div>
            </div>
            <div className="divide-y divide-gray-50">
              {c.cadenas.map(cadena => (
                <Link key={cadena.ruta} href={cadena.ruta}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-amber-50 transition-colors group">
                  <span className="text-sm font-medium text-gray-700 group-hover:text-amber-700">{cadena.label}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {cadena.activo
                      ? <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full border border-emerald-100">● Activo</span>
                      : <span className="text-[10px] bg-gray-50 text-gray-400 px-2 py-0.5 rounded-full border border-gray-200">○ Pendiente</span>
                    }
                    <ChevronRight size={15} className="text-gray-300 group-hover:text-amber-500 transition-colors" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
