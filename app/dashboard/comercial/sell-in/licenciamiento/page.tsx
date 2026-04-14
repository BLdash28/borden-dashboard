'use client'
import { useState } from 'react'

export default function SellInLicenciamiento() {
  const [tipo, setTipo] = useState<'helados'|'colombia'>('helados')
  return (
    <div className="p-6 space-y-4">
      <p className="text-xs text-gray-400 uppercase tracking-widest">Sell In</p>
      <h1 className="text-2xl font-bold text-gray-800">Licenciamiento</h1>
      <div className="flex rounded-lg border border-gray-200 overflow-hidden w-fit">
        {(['helados','colombia'] as const).map(t => (
          <button key={t} onClick={() => setTipo(t)}
            className={`px-5 py-2 text-sm font-medium transition-colors ${tipo===t?'bg-amber-500 text-white':'bg-white text-gray-600 hover:bg-gray-50'}`}>
            {t === 'helados' ? '🍦 Helados' : '🇨🇴 Colombia'}
          </button>
        ))}
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
        <span className="text-2xl">🚧</span>
        <p className="mt-2 font-semibold text-amber-700">En construcción</p>
        <p className="text-sm text-amber-600 mt-1">
          {tipo === 'helados' ? 'Filtro: tipo_negocio = LICENCIAMIENTO_HELADOS' : 'Filtro: tipo_negocio = LICENCIAMIENTO_COLOMBIA'}
        </p>
      </div>
    </div>
  )
}
