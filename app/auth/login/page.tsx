'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Credenciales incorrectas. Verifica tu email y contraseña.')
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
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
          <div className="font-display font-black text-2xl tracking-tight"
            style={{ color: 'var(--t1)' }}>
            BL Food
          </div>
          <div className="text-[11px] tracking-[3px] uppercase mt-1"
            style={{ color: 'var(--t3)' }}>
            Business Intelligence
          </div>
        </div>

        {/* Card */}
        <div className="card p-7">
          <div className="font-display font-bold text-lg mb-1" style={{ color: 'var(--t1)' }}>
            Iniciar sesión
          </div>
          <div className="text-[11px] mb-6" style={{ color: 'var(--t3)' }}>
            Accede con tus credenciales corporativas
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-[10px] uppercase tracking-[1.5px] font-medium block mb-1.5"
                style={{ color: 'var(--t3)' }}>
                Correo electrónico
              </label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                required placeholder="usuario@blfoods.com"
                className="w-full px-3.5 py-2.5 rounded-lg text-sm border outline-none transition-all"
                style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--t1)' }}
                onFocus={e => (e.target.style.borderColor = 'var(--acc)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')}
              />
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-[1.5px] font-medium block mb-1.5"
                style={{ color: 'var(--t3)' }}>
                Contraseña
              </label>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)} required placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm border outline-none transition-all pr-10"
                  style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--t1)' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--acc)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--t3)' }}>
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-[11px] text-red-500 bg-red-50 px-3 py-2 rounded-lg">
                ⚠ {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-lg font-medium text-sm text-white transition-all active:scale-[.98] disabled:opacity-60"
              style={{ background: 'var(--acc)' }}>
              {loading ? 'Ingresando...' : 'Ingresar →'}
            </button>
          </form>
        </div>

        <div className="text-center mt-4 text-[10px]" style={{ color: 'var(--t3)' }}>
          BL Foods Corporation · Plataforma Interna
        </div>
      </div>
    </div>
  )
}
