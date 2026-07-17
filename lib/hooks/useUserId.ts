'use client'

/**
 * Hook React reactivo al userId de Supabase Auth.
 *
 * Devuelve el `user.id` del usuario logueado, o `null` si no hay sesión.
 * Reacciona a `SIGNED_IN`, `SIGNED_OUT` y `USER_UPDATED` sin necesidad de
 * recargar la página. Usado por el DashboardFiltersProvider para hidratar
 * del namespace correcto cuando cambia la sesión en la misma pestaña.
 */

import { useEffect, useState } from 'react'
import { subscribeUserId, getCurrentUserId } from '@/lib/storage/userScopedStorage'

export function useUserId(): string | null {
  const [userId, setUserId] = useState<string | null>(() => getCurrentUserId())

  useEffect(() => {
    return subscribeUserId(setUserId)
  }, [])

  return userId
}
