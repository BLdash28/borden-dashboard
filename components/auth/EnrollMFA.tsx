'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Shield, QrCode, KeyRound, CheckCircle, AlertTriangle, Loader2, Copy, Check } from 'lucide-react'

type Step = 'idle' | 'enrolling' | 'verifying' | 'success' | 'error'

interface Props {
  onSuccess?: () => void
}

export default function EnrollMFA({ onSuccess }: Props) {
  const supabase = createClient()

  const [step,       setStep]       = useState<Step>('idle')
  const [factorId,   setFactorId]   = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [qrSvg,      setQrSvg]      = useState('')
  const [secret,     setSecret]     = useState('')
  const [code,       setCode]       = useState('')
  const [error,      setError]      = useState('')
  const [copied,     setCopied]     = useState(false)
  const [loading,    setLoading]    = useState(false)

  const comenzar = async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: err } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Autenticador',
      })
      if (err) throw err
      setFactorId(data.id)
      setQrSvg(data.totp.qr_code)
      setSecret(data.totp.secret)
      setStep('enrolling')
    } catch (e: any) {
      setError(e.message || 'Error al iniciar la configuración.')
      setStep('error')
    } finally {
      setLoading(false)
    }
  }

  const verificar = async () => {
    if (code.length !== 6) { setError('El código debe tener 6 dígitos.'); return }
    setLoading(true)
    setError('')
    try {
      // Crear challenge
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId })
      if (chErr) throw chErr
      setChallengeId(ch.id)

      // Verificar
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: ch.id,
        code,
      })
      if (vErr) throw vErr

      setStep('success')
      setTimeout(() => onSuccess?.(), 1200)
    } catch (e: any) {
      const msg = e.message || ''
      if (msg.includes('expired') || msg.includes('invalid')) {
        setError('Código incorrecto o expirado. Intenta con el código actual de tu app.')
      } else {
        setError(msg || 'Error al verificar el código.')
      }
      setStep('enrolling') // volver para reintentar
    } finally {
      setLoading(false)
    }
  }

  const copiarSecreto = () => {
    navigator.clipboard.writeText(secret).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // ── Éxito ────────────────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <div className="w-14 h-14 rounded-full flex items-center justify-center"
          style={{ background: '#22c55e22' }}>
          <CheckCircle size={28} style={{ color: '#22c55e' }} />
        </div>
        <p className="font-semibold text-base" style={{ color: 'var(--t1)' }}>
          Autenticación en dos pasos activada
        </p>
        <p className="text-sm text-center" style={{ color: 'var(--t3)' }}>
          A partir de ahora se solicitará el código cada vez que inicies sesión.
        </p>
      </div>
    )
  }

  // ── Idle ─────────────────────────────────────────────────────────────────────
  if (step === 'idle') {
    return (
      <div className="space-y-4">
        <p className="text-sm" style={{ color: 'var(--t3)' }}>
          Agrega una capa extra de seguridad a tu cuenta. Necesitarás una app autenticadora
          como <strong style={{ color: 'var(--t2)' }}>Microsoft Authenticator</strong>,
          Google Authenticator o Authy.
        </p>
        {error && (
          <div className="flex items-start gap-2 text-sm rounded-lg px-3 py-2.5 border"
            style={{ background: '#ef444415', borderColor: '#ef444440', color: '#f87171' }}>
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}
        <button
          onClick={comenzar}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: 'var(--acc)' }}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
          Comenzar configuración
        </button>
      </div>
    )
  }

  // ── Enrolling — mostrar QR ───────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Instrucciones Microsoft Authenticator */}
      <div className="rounded-xl border p-4 space-y-2 text-sm"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <p className="font-semibold text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--t3)' }}>
          Instrucciones — Microsoft Authenticator
        </p>
        <ol className="space-y-1.5 list-decimal list-inside" style={{ color: 'var(--t2)' }}>
          <li>Abre <strong>Microsoft Authenticator</strong> en tu celular.</li>
          <li>Toca el botón <strong>+</strong> (agregar cuenta).</li>
          <li>
            Elige <strong>Otra cuenta (Google, Facebook, etc.)</strong>
            <br />
            <span className="text-xs ml-4" style={{ color: 'var(--t3)' }}>
              ⚠️ Aunque tu cuenta sea profesional, selecciona esta opción — es la única que permite escanear el código QR.
              "Cuenta profesional o educativa" es exclusiva para cuentas Microsoft 365 / Azure AD.
            </span>
          </li>
          <li>Escanea el código QR o ingresa el código manual si no tienes cámara disponible.</li>
        </ol>
      </div>

      {/* QR */}
      <div className="flex flex-col items-center gap-3">
        <div className="p-3 bg-white rounded-xl border border-gray-200 shadow-sm"
          dangerouslySetInnerHTML={{ __html: qrSvg }}
          style={{ lineHeight: 0 }}
        />
        <p className="text-xs" style={{ color: 'var(--t3)' }}>
          ¿No puedes escanear? Usa el código manual:
        </p>
        <div className="flex items-center gap-2">
          <code className="text-xs font-mono px-3 py-1.5 rounded-lg tracking-widest"
            style={{ background: 'var(--bg)', color: 'var(--t2)', border: '1px solid var(--border)' }}>
            {secret}
          </code>
          <button
            onClick={copiarSecreto}
            title="Copiar"
            className="p-1.5 rounded-lg transition-colors hover:opacity-70"
            style={{ color: 'var(--t3)' }}
          >
            {copied ? <Check size={14} style={{ color: '#22c55e' }} /> : <Copy size={14} />}
          </button>
        </div>
      </div>

      {/* Input código */}
      <div className="space-y-2">
        <label className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'var(--t3)' }}>
          Código de verificación (6 dígitos)
        </label>
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={e => { setCode(e.target.value.replace(/\D/g, '')); setError('') }}
          placeholder="000000"
          autoFocus
          className="w-full text-center text-2xl font-mono tracking-[0.5em] rounded-xl border px-4 py-3 outline-none transition-all"
          style={{
            background: 'var(--surface)',
            borderColor: error ? '#ef4444' : 'var(--border)',
            color: 'var(--t1)',
          }}
          onKeyDown={e => e.key === 'Enter' && code.length === 6 && verificar()}
        />
        {error && (
          <div className="flex items-start gap-2 text-sm rounded-lg px-3 py-2.5 border"
            style={{ background: '#ef444415', borderColor: '#ef444440', color: '#f87171' }}>
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}
        <p className="text-xs" style={{ color: 'var(--t3)' }}>
          El código cambia cada 30 segundos. Ingrésalo antes de que expire.
        </p>
      </div>

      <button
        onClick={verificar}
        disabled={loading || code.length !== 6}
        className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        style={{ background: 'var(--acc)' }}
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
        Verificar y activar
      </button>
    </div>
  )
}
