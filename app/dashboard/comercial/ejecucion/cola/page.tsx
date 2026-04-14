'use client'
export default function Page() {
  return (
    <div className="p-6 space-y-4">
      <p className="text-xs text-gray-400 uppercase tracking-widest">Ejecución</p>
      <h1 className="text-2xl font-bold text-gray-800">Long Tail 50%</h1>
      <p className="text-sm text-gray-500">El 50% de SKUs con menor rotación: ventas 90d, % del total, DOH, recomendación automática</p>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
        <span className="text-2xl">🚧</span>
        <p className="mt-2 font-semibold text-amber-700">En construcción</p>
        <p className="text-sm text-amber-600 mt-1">Descontinuar · Promocionar · Mantener — basado en rotación y DOH</p>
      </div>
    </div>
  )
}
