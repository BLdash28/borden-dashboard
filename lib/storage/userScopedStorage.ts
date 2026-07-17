'use client'

/**
 * localStorage per-user en el mismo browser. Cada key vive bajo un namespace
 * derivado del `userId` actual — dos personas que comparten la misma máquina
 * nunca heredan filtros ni estado UI la una de la otra.
 *
 * Reactividad: subscribe a `supabase.auth.onAuthStateChange` una sola vez y
 * mantiene un cache in-module del userId activo. Los helpers síncronos leen
 * ese cache; el hook `useUserId()` (ver `lib/hooks/useUserId.ts`) devuelve
 * un valor React-reactivo.
 *
 * Convención de key: `${baseKey}::u:${userId}`. Sin sesión, los helpers
 * son no-ops (nada se lee ni se escribe) para evitar filtrar estado a un
 * scope "anon" compartido.
 */

import { createClient } from '@/lib/supabase/client'

let currentUserId: string | null = null
let initialized = false
const listeners: Set<(userId: string | null) => void> = new Set()

function ensureInit() {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  const supabase = createClient()

  supabase.auth.getSession().then(({ data: { session } }) => {
    const next = session?.user?.id ?? null
    if (next !== currentUserId) {
      currentUserId = next
      listeners.forEach(cb => cb(currentUserId))
    }
  }).catch(() => { /* ignore — no session */ })

  supabase.auth.onAuthStateChange((_event, session) => {
    const next = session?.user?.id ?? null
    if (next !== currentUserId) {
      currentUserId = next
      listeners.forEach(cb => cb(currentUserId))
    }
  })
}

export function getCurrentUserId(): string | null {
  ensureInit()
  return currentUserId
}

/** Suscribe a cambios de userId. Emite el valor actual al momento del subscribe. */
export function subscribeUserId(cb: (userId: string | null) => void): () => void {
  ensureInit()
  listeners.add(cb)
  cb(currentUserId)
  return () => { listeners.delete(cb) }
}

function scopedKey(baseKey: string, userId: string | null): string | null {
  if (!userId) return null
  return `${baseKey}::u:${userId}`
}

export function readScoped(baseKey: string): string | null {
  if (typeof window === 'undefined') return null
  const k = scopedKey(baseKey, getCurrentUserId())
  if (!k) return null
  try { return localStorage.getItem(k) } catch { return null }
}

export function writeScoped(baseKey: string, value: string): void {
  if (typeof window === 'undefined') return
  const k = scopedKey(baseKey, getCurrentUserId())
  if (!k) return
  try { localStorage.setItem(k, value) } catch {}
}

export function removeScoped(baseKey: string): void {
  if (typeof window === 'undefined') return
  const k = scopedKey(baseKey, getCurrentUserId())
  if (!k) return
  try { localStorage.removeItem(k) } catch {}
}

/**
 * Helpers explícitos por userId — útiles dentro de efectos que reaccionan al
 * cambio de userId, donde el cache in-module podría estar desfasado por un tick.
 */
export function readScopedFor(baseKey: string, userId: string | null): string | null {
  if (typeof window === 'undefined') return null
  const k = scopedKey(baseKey, userId)
  if (!k) return null
  try { return localStorage.getItem(k) } catch { return null }
}

export function writeScopedFor(baseKey: string, userId: string | null, value: string): void {
  if (typeof window === 'undefined') return
  const k = scopedKey(baseKey, userId)
  if (!k) return
  try { localStorage.setItem(k, value) } catch {}
}

export function removeScopedFor(baseKey: string, userId: string | null): void {
  if (typeof window === 'undefined') return
  const k = scopedKey(baseKey, userId)
  if (!k) return
  try { localStorage.removeItem(k) } catch {}
}
