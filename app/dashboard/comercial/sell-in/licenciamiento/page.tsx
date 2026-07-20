'use client'
import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import ChartSkeleton from '@/components/ui/ChartSkeleton'
import { useUserId } from '@/lib/hooks/useUserId'
import { readScopedFor, writeScopedFor } from '@/lib/storage/userScopedStorage'

// Embebemos los mismos componentes que renderizan las páginas de ejecución
// para que licenciamiento muestre EXACTAMENTE los mismos datos:
//   Sensación   ← /dashboard/comercial/ejecucion/cr/sensacion
//   Grupo Éxito ← /dashboard/comercial/ejecucion/co/grupo-exito#sellin
// Cualquier cambio futuro en esas páginas se refleja aquí automáticamente.
const SensacionEjecucion = dynamic(
  () => import('@/components/ejecucion/SensacionEjecucion'),
  { loading: () => <ChartSkeleton />, ssr: false },
)
const ExitoEjecucion = dynamic(
  () => import('@/components/ejecucion/ExitoEjecucion'),
  { loading: () => <ChartSkeleton />, ssr: false },
)

const STORAGE_KEY = 'bl_licenciamiento_v1'

export default function SellInLicenciamiento() {
  const userId = useUserId()
  const [tipo, setTipo] = useState<'helados' | 'colombia'>('colombia')

  // Rehidrata el tipo seleccionado al resolverse el userId.
  const hydrated = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (hydrated.current === userId) return
    hydrated.current = userId
    if (!userId) return
    const raw = readScopedFor(STORAGE_KEY, userId)
    if (!raw) return
    try {
      const s = JSON.parse(raw)
      if (s?.tipo === 'helados' || s?.tipo === 'colombia') setTipo(s.tipo)
    } catch { /* ignore */ }
  }, [userId])

  useEffect(() => {
    if (!userId) return
    writeScopedFor(STORAGE_KEY, userId, JSON.stringify({ tipo }))
  }, [userId, tipo])

  return (
    <div className="space-y-4">
      {/* Toggle Sensación / Grupo Éxito */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden w-fit">
          {(['helados', 'colombia'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTipo(t)}
              className={`px-5 py-2 text-sm font-medium transition-colors ${
                tipo === t
                  ? 'bg-amber-500 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t === 'helados' ? 'Sensación' : 'Grupo Éxito'}
            </button>
          ))}
        </div>
      </div>

      {/* Vista embebida — key fuerza remount al cambiar de tipo para limpiar
          estado interno del componente anterior */}
      {tipo === 'helados' ? (
        <SensacionEjecucion key="sensacion" initialTab="sellin" />
      ) : (
        <ExitoEjecucion key="exito" initialSection="sellin" hideSectionNav />
      )}
    </div>
  )
}
