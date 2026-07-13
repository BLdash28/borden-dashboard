import dynamic from 'next/dynamic'
import ChartSkeleton from '@/components/ui/ChartSkeleton'

const CostaDairyEjecucion = dynamic(
  () => import('@/components/ejecucion/CostaDairyEjecucion'),
  { loading: () => <ChartSkeleton /> }
)

export default function CRCostaDairyPage() {
  return <CostaDairyEjecucion />
}
