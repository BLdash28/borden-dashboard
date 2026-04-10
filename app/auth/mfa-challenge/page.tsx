'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Shield, AlertTriangle, Loader2, LogOut } from 'lucide-react'

export default function MfaChallengePage() {
  const supabase = createClient()
  const router   = useRouter()

  const [code,    setCode]    = useState('')
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const verificar = async () => {
    if (code.length !== 6) { setError('El código debe tener 6 dígitos.'); return }
    setLoading(true)
    setError('')
    try {
      // Obtener el primer factor TOTP verificado
      const { data: factors, error: fErr } = await supabase.auth.mfa.listFactors()
      if (fErr) throw fErr

      const factor = factors.totp?.find(f => f.status === 'verified')
      if (!factor) throw new Error('No se encontró un factor de autenticación activo.')

      // Challenge
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: factor.id })
      if (chErr) throw chErr

      // Verify
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId:    factor.id,
        challengeId: ch.id,
        code,
      })
      if (vErr) throw vErr

      router.push('/dashboard')
      router.refresh()
    } catch (e: any) {
      const msg = e.message || ''
      if (msg.includes('expired') || msg.includes('invalid') || msg.includes('MFA')) {
        setError('Código incorrecto o expirado. Abre tu app autenticadora e intenta con el código actual.')
      } else {
        setError(msg || 'Error al verificar el código. Intenta de nuevo.')
      }
    } finally {
      setLoading(false)
    }
  }

  const cerrarSesion = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm space-y-6">

        {/* Logo / Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
            style={{ background: 'var(--acc)' }}>
            <Shield size={24} className="text-white" />
          </div>
          <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--t1)' }}>
            Verificación en dos pasos
          </h1>
          <p className="text-sm" style={{ color: 'var(--t3)' }}>
            Ingresa el código de 6 dígitos de tu app autenticadora.
          </p>
        </div>

        {/* Card */}
        <div className="card p-6 space-y-5">

          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={e => { setCode(e.target.value.replace(/\D/g, '')); setError('') }}
            placeholder="000000"
            autoFocus
            className="w-full text-center text-3xl font-mono tracking-[0.6em] rounded-xl border px-4 py-4 outline-none transition-all"
            style={{
              background: 'var(--surface)',
              borderColor: error ? '#ef4444' : 'var(--border)',
              color: 'var(--t1)',
            }}
            onKeyDown={e => e.key === 'Enter' && code.length === 6 && verificar()}
          />

          {error && (
            <div className="flex items-start gap-2 text-sm rounded-xl px-3 py-2.5 border"
              style={{ background: '#ef444415', borderColor: '#ef444440', color: '#f87171' }}>
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={verificar}
            disabled={loading || code.length !== 6}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: 'var(--acc)' }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
            Verificar
          </button>

          <div className="text-center">
            <button
              onClick={cerrarSesion}
              className="inline-flex items-center gap-1.5 text-xs hover:opacity-70 transition-opacity"
              style={{ color: 'var(--t3)' }}
            >
              <LogOut size={12} /> Cerrar sesión
            </button>
          </div>
        </div>

        <p className="text-center text-xs" style={{ color: 'var(--t3)' }}>
          El código cambia cada 30 segundos.
        </p>
      </div>
    </div>
  )
}
