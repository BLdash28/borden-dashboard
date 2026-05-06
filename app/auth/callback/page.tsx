'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AuthCallbackPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'error'>('loading')
  const [msg,    setMsg]    = useState('')

  useEffect(() => {
    const run = async () => {
      const supabase   = createClient()
      const token_hash = searchParams.get('token_hash')
      const type       = searchParams.get('type') as any

      if (!token_hash || !type) {
        setMsg('Enlace inválido o expirado.'); setStatus('error'); return
      }

      const { error } = await supabase.auth.verifyOtp({ token_hash, type })
      if (error) { setMsg(error.message); setStatus('error'); return }

      // recovery and invite both go to reset-password to set a new password
      if (type === 'recovery' || type === 'invite') {
        router.replace('/auth/reset-password')
      } else {
        router.replace('/dashboard')
      }
    }
    run()
  }, [])

  if (status === 'error') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-sm w-full text-center shadow-sm">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
          <span className="text-red-500 text-xl">✕</span>
        </div>
        <h2 className="text-lg font-bold text-gray-800 mb-2">Enlace inválido</h2>
        <p className="text-sm text-gray-500 mb-6">{msg}</p>
        <a href="/auth/login" className="text-sm text-amber-600 hover:underline">Volver al inicio de sesión</a>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">Verificando enlace...</p>
      </div>
    </div>
  )
}
