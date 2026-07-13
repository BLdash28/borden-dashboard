import dynamic from 'next/dynamic'
import ChartSkeleton from '@/components/ui/ChartSkeleton'

const WalmartEjecucion = dynamic(
  () => import('@/components/ejecucion/WalmartEjecucion'),
  { loading: () => <ChartSkeleton /> }
)

export default function HNWalmartPage() {
  return <WalmartEjecucion pais="HN" bandera="🇭🇳" paisNombre="Honduras" />
}
