import { notFound } from 'next/navigation'
import { MercadeoPais } from '@/components/mercadeo/MercadeoPais'

// Rutas válidas por país (mismo mapa que Ejecución)
const RUTAS_VALIDAS: Record<string, string[]> = {
  gt: ['walmart', 'unisuper'],
  hn: ['walmart'],
  ni: ['walmart'],
  sv: ['walmart', 'selectos'],
  cr: ['walmart', 'costa-dairy', 'sensacion'],
  co: ['grupo-exito'],
}

export default function MercadeoPaisClientePage({
  params,
}: { params: { pais: string; cliente: string } }) {
  const pais    = params.pais.toLowerCase()
  const cliente = params.cliente.toLowerCase()

  const clientesValidos = RUTAS_VALIDAS[pais]
  if (!clientesValidos || !clientesValidos.includes(cliente)) notFound()

  return <MercadeoPais pais={pais} cliente={cliente} />
}
