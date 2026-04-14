'use client'
export default function Page() {
  return (
    <div className="p-6 space-y-4">
      <p className="text-xs text-gray-400 uppercase tracking-widest">Ejecución</p>
      <h1 className="text-2xl font-bold text-gray-800">Distribución 75%</h1>
      <p className="text-sm text-gray-500">Pareto: tiendas que acumulan el 75% de ventas totales</p>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
        <span className="text-2xl">🚧</span>
        <p className="mt-2 font-semibold text-amber-700">En construcción</p>
        <p className="text-sm text-amber-600 mt-1">Nº PDV en el 75% · % del total PDV · Cobertura promedio SKU · Curva de Lorenz</p>
      </div>
    </div>
  )
}
