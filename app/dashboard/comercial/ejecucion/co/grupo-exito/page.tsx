import dynamic from 'next/dynamic'
import ChartSkeleton from '@/components/ui/ChartSkeleton'

const ExitoEjecucion = dynamic(
  () => import('@/components/ejecucion/ExitoEjecucion'),
  { loading: () => <ChartSkeleton /> }
)

export default function COGrupoExitoPage() {
  return <ExitoEjecucion />
}
