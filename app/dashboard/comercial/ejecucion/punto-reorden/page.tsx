'use client'
export default function Page() {
  return (
    <div className="p-6 space-y-4">
      <p className="text-xs text-gray-400 uppercase tracking-widest">Ejecución</p>
      <h1 className="text-2xl font-bold text-gray-800">Punto de Reorden</h1>
      <p className="text-sm text-gray-500">SKUs cuyo DOH proyectado cae bajo el umbral (default 14 días) considerando lead time</p>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
        <span className="text-2xl">🚧</span>
        <p className="mt-2 font-semibold text-amber-700">En construcción</p>
        <p className="text-sm text-amber-600 mt-1">Alertas por SKU · Umbral configurable · CEDI vs PDV · Lead time</p>
      </div>
    </div>
  )
}
