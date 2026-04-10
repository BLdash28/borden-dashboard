'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, CheckCircle } from 'lucide-react'

export default function ResetPasswordPage() {
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [showPass,  setShowPass]  = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [done,      setDone]      = useState(false)
  const router  = useRouter()
  const supabase = createClient()

  // Supabase pone el access_token en el hash (#) de la URL al redirigir
  // El cliente SSR lo procesa automáticamente al inicializar
  useEffect(() => {
    // Verifica que haya una sesión de recovery activa
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        // No hay sesión válida — enlace expirado o ya usado
        router.replace('/auth/login')
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setLoading(true)
    setError('')
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Error al actualizar la contraseña.')
      setLoading(false)
    } else {
      setDone(true)
      setTimeout(() => router.replace('/dashboard'), 2500)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm animate-fade-up">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: 'var(--acc)' }}>
            <span className="font-display font-black text-white text-xl">BL</span>
          </div>
          <div className="font-display font-black text-2xl tracking-tight" style={{ color: 'var(--t1)' }}>
            BL Food
          </div>
          <div className="text-[11px] tracking-[3px] uppercase mt-1" style={{ color: 'var(--t3)' }}>
            Business Intelligence
          </div>
        </div>

        {/* Card */}
        <div className="card p-7">
          {done ? (
            <div className="text-center py-4">
              <CheckCircle className="mx-auto mb-3" size={40} style={{ color: 'var(--acc)' }} />
              <div className="font-display font-bold text-lg mb-1" style={{ color: 'var(--t1)' }}>
                ¡Contraseña actualizada!
              </div>
              <p className="text-[12px]" style={{ color: 'var(--t3)' }}>
                Redirigiendo al dashboard…
              </p>
            </div>
          ) : (
            <>
              <div className="font-display font-bold text-lg mb-1" style={{ color: 'var(--t1)' }}>
                Nueva contraseña
              </div>
              <div className="text-[11px] mb-6" style={{ color: 'var(--t3)' }}>
                Elige una contraseña segura para tu cuenta.
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Contraseña */}
                <div>
                  <label className="text-[10px] uppercase tracking-widest font-medium mb-1.5 block"
                    style={{ color: 'var(--t3)' }}>
                    Nueva contraseña
                  </label>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      required
                      className="w-full text-sm px-3 py-2.5 pr-10 rounded-lg border focus:outline-none focus:ring-2 transition-all"
                      style={{
                        background: 'var(--bg)',
                        borderColor: 'var(--border)',
                        color: 'var(--t1)',
                      }}
                    />
                    <button type="button" onClick={() => setShowPass(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-70 transition-opacity">
                      {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {/* Confirmar */}
                <div>
                  <label className="text-[10px] uppercase tracking-widest font-medium mb-1.5 block"
                    style={{ color: 'var(--t3)' }}>
                    Confirmar contraseña
                  </label>
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repite la contraseña"
                    required
                    className="w-full text-sm px-3 py-2.5 rounded-lg border focus:outline-none focus:ring-2 transition-all"
                    style={{
                      background: 'var(--bg)',
                      borderColor: confirm && confirm !== password ? '#ef4444' : 'var(--border)',
                      color: 'var(--t1)',
                    }}
                  />
                  {confirm && confirm !== password && (
                    <p className="text-[11px] text-red-500 mt-1">Las contraseñas no coinciden</p>
                  )}
                </div>

                {error && (
                  <p className="text-[12px] text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
                )}

                <button type="submit" disabled={loading}
                  className="w-full py-2.5 rounded-lg font-semibold text-sm text-white transition-all disabled:opacity-50"
                  style={{ background: 'var(--acc)' }}>
                  {loading ? 'Guardando…' : 'Guardar contraseña →'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-[11px] mt-6" style={{ color: 'var(--t3)' }}>
          BL Foods Corporation · Plataforma Interna
        </p>
      </div>
    </div>
  )
}
