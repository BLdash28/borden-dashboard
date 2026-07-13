import dynamic from 'next/dynamic'
import ChartSkeleton from '@/components/ui/ChartSkeleton'

const WalmartEjecucion = dynamic(
  () => import('@/components/ejecucion/WalmartEjecucion'),
  { loading: () => <ChartSkeleton /> }
)

export default function NIWalmartPage() {
  return <WalmartEjecucion pais="NI" bandera="🇳🇮" paisNombre="Nicaragua" />
}
