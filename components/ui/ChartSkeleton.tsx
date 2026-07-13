export default function ChartSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-4">
      <div className="h-6 w-48 rounded bg-gray-200" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-gray-100" />
        ))}
      </div>
      <div className="h-64 rounded-2xl bg-gray-100" />
      <div className="h-56 rounded-2xl bg-gray-100" />
    </div>
  )
}
