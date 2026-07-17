'use client'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

/**
 * Hub Mercadeo — mismo patrón que Ejecución: 1 tarjeta por país, cada
 * cliente como link dentro. Rutas: /dashboard/mercadeo/{pais}/{cliente}.
 */
const CLIENTES = [
  {
    pais: 'GT', bandera: '🇬🇹', nombre: 'Guatemala',
    clientes: [
      { label: 'Walmart · Borden',  ruta: '/dashboard/mercadeo/gt/walmart',  activo: false },
      { label: 'Unisuper · Borden', ruta: '/dashboard/mercadeo/gt/unisuper', activo: false },
    ],
  },
  {
    pais: 'HN', bandera: '🇭🇳', nombre: 'Honduras',
    clientes: [
      { label: 'Walmart · Borden', ruta: '/dashboard/mercadeo/hn/walmart', activo: false },
    ],
  },
  {
    pais: 'NI', bandera: '🇳🇮', nombre: 'Nicaragua',
    clientes: [
      { label: 'Walmart · Borden', ruta: '/dashboard/mercadeo/ni/walmart', activo: false },
    ],
  },
  {
    pais: 'SV', bandera: '🇸🇻', nombre: 'El Salvador',
    clientes: [
      { label: 'Selectos · Borden', ruta: '/dashboard/mercadeo/sv/selectos', activo: false },
      { label: 'Walmart · Borden',  ruta: '/dashboard/mercadeo/sv/walmart',  activo: false },
    ],
  },
  {
    pais: 'CR', bandera: '🇨🇷', nombre: 'Costa Rica',
    clientes: [
      { label: 'Walmart · Borden',     ruta: '/dashboard/mercadeo/cr/walmart',     activo: true  },
      { label: 'Costa Dairy · Borden', ruta: '/dashboard/mercadeo/cr/costa-dairy', activo: false },
      { label: 'Sensación · Borden',   ruta: '/dashboard/mercadeo/cr/sensacion',   activo: false },
    ],
  },
  {
    pais: 'CO', bandera: '🇨🇴', nombre: 'Colombia',
    clientes: [
      { label: 'Grupo Éxito · Borden', ruta: '/dashboard/mercadeo/co/grupo-exito', activo: false },
    ],
  },
]

export default function MercadeoHub() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <p className="text-xs text-gray-400 uppercase tracking-widest">Mercadeo</p>
        <h1 className="text-2xl font-bold text-gray-800">Mercadeo</h1>
        <p className="text-sm text-gray-400 mt-0.5">Sell-out, cobertura, DOH e innovaciones por cliente</p>
      </div>

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
              {c.clientes.map(cli => (
                <Link key={cli.ruta} href={cli.ruta}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-emerald-50 transition-colors group">
                  <span className="text-sm font-medium text-gray-700 group-hover:text-emerald-700">{cli.label}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {cli.activo
                      ? <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full border border-emerald-100">● Activo</span>
                      : <span className="text-[10px] bg-gray-50 text-gray-400 px-2 py-0.5 rounded-full border border-gray-200">○ Pendiente</span>
                    }
                    <ChevronRight size={15} className="text-gray-300 group-hover:text-emerald-500 transition-colors" />
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
