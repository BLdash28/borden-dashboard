/**
 * Global toast helper — works outside React components.
 * ToastProvider in DashboardProvider listens for these events.
 *
 * Usage:
 *   import { showError, showSuccess } from '@/lib/toast'
 *   if (j.error) { showError('Error al cargar datos'); return }
 */

export function showError(message: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('bl-toast', { detail: { message, type: 'error' } }))
}

export function showSuccess(message: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('bl-toast', { detail: { message, type: 'success' } }))
}

export function showInfo(message: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('bl-toast', { detail: { message, type: 'info' } }))
}
