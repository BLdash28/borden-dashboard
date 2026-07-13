import dynamic from 'next/dynamic'
import ChartSkeleton from '@/components/ui/ChartSkeleton'

const WalmartEjecucion = dynamic(
  () => import('@/components/ejecucion/WalmartEjecucion'),
  { loading: () => <ChartSkeleton /> }
)

export default function GTWalmartPage() {
  return <WalmartEjecucion pais="GT" bandera="🇬🇹" paisNombre="Guatemala" />
}
