'use client'
export default function Page() {
  return (
    <div className="p-6 space-y-4">
      <p className="text-xs text-gray-400 uppercase tracking-widest">Ejecución</p>
      <h1 className="text-2xl font-bold text-gray-800">Cobertura — Puntos Marca</h1>
      <p className="text-sm text-gray-500">% de PDV donde cada SKU está presente (venta ≥1 unidad en el período)</p>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
        <span className="text-2xl">🚧</span>
        <p className="mt-2 font-semibold text-amber-700">En construcción</p>
        <p className="text-sm text-amber-600 mt-1">Distribución numérica · Puntos Marca ponderados · Por categoría y cadena</p>
      </div>
    </div>
  )
}
