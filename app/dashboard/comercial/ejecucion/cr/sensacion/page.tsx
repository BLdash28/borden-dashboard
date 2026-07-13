import dynamic from 'next/dynamic'
import ChartSkeleton from '@/components/ui/ChartSkeleton'

const SensacionEjecucion = dynamic(
  () => import('@/components/ejecucion/SensacionEjecucion'),
  { loading: () => <ChartSkeleton /> }
)

export default function CRSensacionPage() {
  return <SensacionEjecucion />
}
