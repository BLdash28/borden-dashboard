import dynamic from 'next/dynamic'
import ChartSkeleton from '@/components/ui/ChartSkeleton'

// Body de la ejecución Unisuper GT — carga diferida para mantener el chunk
// inicial de esta ruta liviano (mismo patrón que Walmart/Éxito/Selectos).
const UnisuperEjecucion = dynamic(
  () => import('@/components/ejecucion/UnisuperEjecucion'),
  { loading: () => <ChartSkeleton />, ssr: false },
)

export default function GTUnisuperPage() {
  return <UnisuperEjecucion />
}
