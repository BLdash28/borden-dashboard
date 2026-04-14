'use client'
export default function Page() {
  return (
    <div className="p-6 space-y-4">
      <p className="text-xs text-gray-400 uppercase tracking-widest">Ejecución</p>
      <h1 className="text-2xl font-bold text-gray-800">Panel de Ejecución</h1>
      <p className="text-sm text-gray-500">Vista general con acceso a todos los módulos de ejecución</p>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
        <span className="text-2xl">🚧</span>
        <p className="mt-2 font-semibold text-amber-700">En construcción</p>
        <p className="text-sm text-amber-600 mt-1">SOM · Precio · Inventario · Distribución · Crecimiento · Cobertura · Reorden · Long Tail</p>
      </div>
    </div>
  )
}
