'use client'
export default function Page() {
  return (
    <div className="p-6 space-y-4">
      <p className="text-xs text-gray-400 uppercase tracking-widest">Ejecución</p>
      <h1 className="text-2xl font-bold text-gray-800">Crecimiento SKU</h1>
      <p className="text-sm text-gray-500">Ranking top 20 SKUs que más crecen y top 20 que más caen (YoY y MoM)</p>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
        <span className="text-2xl">🚧</span>
        <p className="mt-2 font-semibold text-amber-700">En construcción</p>
        <p className="text-sm text-amber-600 mt-1">Top 20 crecimiento YoY · Top 20 caída YoY · Filtro por categoría y cadena</p>
      </div>
    </div>
  )
}
