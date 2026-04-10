'use client'
import { useEffect, useState, useCallback, createContext, useContext, useRef } from 'react'
import { X, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { cn } from '@/utils/helpers'

type ToastType = 'error' | 'success' | 'info'

interface Toast {
  id: number
  type: ToastType
  message: string
  duration?: number
}

interface ToastCtx {
  toast: (message: string, type?: ToastType, duration?: number) => void
  error: (message: string) => void
  success: (message: string) => void
}

const Ctx = createContext<ToastCtx | null>(null)

let _counter = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const remove = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useCallback((message: string, type: ToastType = 'info', duration = 4000) => {
    const id = ++_counter
    setToasts(prev => [...prev.slice(-4), { id, type, message, duration }])
  }, [])

  const error   = useCallback((msg: string) => toast(msg, 'error', 6000), [toast])
  const success = useCallback((msg: string) => toast(msg, 'success', 3000), [toast])

  // Listen for global events from lib/toast.ts (usable outside React components)
  useEffect(() => {
    const handler = (e: Event) => {
      const { message, type } = (e as CustomEvent).detail
      const dur = type === 'error' ? 6000 : type === 'success' ? 3000 : 4000
      toast(message, type, dur)
    }
    window.addEventListener('bl-toast', handler)
    return () => window.removeEventListener('bl-toast', handler)
  }, [toast])

  return (
    <Ctx.Provider value={{ toast, error, success }}>
      {children}
      {/* Portal */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: 'min(380px, calc(100vw - 32px))' }}>
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onRemove={remove} />
        ))}
      </div>
    </Ctx.Provider>
  )
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: number) => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Animate in
    const t1 = setTimeout(() => setVisible(true), 10)
    // Auto-dismiss
    const t2 = setTimeout(() => {
      setVisible(false)
      setTimeout(() => onRemove(toast.id), 300)
    }, toast.duration ?? 4000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [toast.id, toast.duration, onRemove])

  const cfg = {
    error:   { icon: AlertTriangle, color: '#ef4444', bg: '#1a0a0a' },
    success: { icon: CheckCircle2,  color: '#10b981', bg: '#0a1a12' },
    info:    { icon: Info,          color: '#3b82f6', bg: '#0a0f1a' },
  }[toast.type]

  const Icon = cfg.icon

  return (
    <div
      className={cn(
        'pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl shadow-2xl border transition-all duration-300',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      )}
      style={{ background: cfg.bg, borderColor: cfg.color + '30' }}
      role="alert"
    >
      <Icon size={16} className="flex-shrink-0 mt-0.5" style={{ color: cfg.color }} />
      <p className="flex-1 text-[13px] leading-snug" style={{ color: 'rgba(255,255,255,0.85)' }}>
        {toast.message}
      </p>
      <button
        onClick={() => { setVisible(false); setTimeout(() => onRemove(toast.id), 300) }}
        className="flex-shrink-0 p-1 rounded hover:opacity-70 transition-opacity"
        style={{ color: 'rgba(255,255,255,0.4)' }}
        aria-label="Cerrar"
      >
        <X size={13} />
      </button>
    </div>
  )
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
