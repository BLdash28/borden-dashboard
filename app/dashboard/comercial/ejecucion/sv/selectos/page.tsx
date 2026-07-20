import dynamic from 'next/dynamic'
import ChartSkeleton from '@/components/ui/ChartSkeleton'

// El body de Selectos SV (4020 líneas — recharts, ejecución completa) se
// carga lazy en un chunk separado. La shell del route pesa <1KB y evita
// que el chunk inicial de esta ruta bloquee LCP.
const SelectosView = dynamic(
  () => import('./SelectosView'),
  { loading: () => <ChartSkeleton />, ssr: false },
)

export default function SelectosPage() {
  return <SelectosView />
}
