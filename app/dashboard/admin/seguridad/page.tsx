'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Shield, ShieldCheck, ShieldOff, Trash2, AlertTriangle, Loader2 } from 'lucide-react'
import EnrollMFA from '@/components/auth/EnrollMFA'

interface Factor {
  id: string
  friendly_name?: string
  factor_type: string
  status: string
  created_at: string
}

export default function SeguridadPage() {
  const supabase = createClient()

  const [factors,    setFactors]    = useState<Factor[]>([])
  const [loading,    setLoading]    = useState(true)
  const [showEnroll, setShowEnroll] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error,      setError]      = useState('')

  const cargarFactors = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: err } = await supabase.auth.mfa.listFactors()
      if (err) throw err
      setFactors(data.totp ?? [])
    } catch (e: any) {
      setError(e.message || 'Error al cargar los factores MFA.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { cargarFactors() }, [cargarFactors])

  const eliminarFactor = async (factorId: string) => {
    if (!confirm('¿Seguro que quieres eliminar este factor? Perderás el acceso al segundo factor de autenticación.')) return
    setDeletingId(factorId)
    setError('')
    try {
      const { error: err } = await supabase.auth.mfa.unenroll({ factorId })
      if (err) throw err
      setFactors(prev => prev.filter(f => f.id !== factorId))
    } catch (e: any) {
      setError(e.message || 'Error al eliminar el factor.')
    } finally {
      setDeletingId(null)
    }
  }

  const verifiedFactors = factors.filter(f => f.status === 'verified')
  const hasMfa = verifiedFactors.length > 0

  return (
    <div className="max-w-2xl space-y-6">

      {/* Header */}
      <div>
        <p className="text-[10px] tracking-[2px] uppercase font-medium mb-1" style={{ color: 'var(--t3)' }}>
          Administración · Mi cuenta
        </p>
        <h1 className="text-xl font-bold" style={{ color: 'var(--t1)' }}>Seguridad</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--t3)' }}>
          Configura la autenticación en dos pasos (2FA) para proteger tu cuenta.
        </p>
      </div>

      {/* Error global */}
      {error && (
        <div className="flex items-start gap-2 text-sm rounded-xl px-4 py-3 border"
          style={{ background: '#ef444415', borderColor: '#ef444440', color: '#f87171' }}>
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {/* Estado MFA */}
      <div className="card p-6 space-y-5">
        <div className="flex items-center gap-3">
          {loading ? (
            <Loader2 size={22} className="animate-spin" style={{ color: 'var(--t3)' }} />
          ) : hasMfa ? (
            <ShieldCheck size={22} style={{ color: '#22c55e' }} />
          ) : (
            <ShieldOff size={22} style={{ color: 'var(--t3)' }} />
          )}
          <div>
            <p className="font-semibold text-sm" style={{ color: 'var(--t1)' }}>
              Autenticación en dos pasos
            </p>
            <p className="text-xs" style={{ color: hasMfa ? '#22c55e' : 'var(--t3)' }}>
              {loading ? 'Cargando…' : hasMfa ? 'Activada' : 'No activada'}
            </p>
          </div>
        </div>

        {/* Factores enrolados */}
        {!loading && hasMfa && (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'var(--t3)' }}>
              Factores activos
            </p>
            {verifiedFactors.map(f => (
              <div key={f.id}
                className="flex items-center justify-between gap-3 rounded-xl px-4 py-3 border"
                style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-2.5">
                  <Shield size={15} style={{ color: 'var(--acc)' }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--t1)' }}>
                      {f.friendly_name || 'App autenticadora'}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--t3)' }}>
                      Activado el {new Date(f.created_at).toLocaleDateString('es-GT', {
                        day: '2-digit', month: 'long', year: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => eliminarFactor(f.id)}
                  disabled={deletingId === f.id}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors hover:opacity-80 disabled:opacity-40"
                  style={{ borderColor: '#ef444440', color: '#f87171', background: '#ef444410' }}
                >
                  {deletingId === f.id
                    ? <Loader2 size={12} className="animate-spin" />
                    : <Trash2 size={12} />}
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Advertencia pérdida de celular */}
        {!loading && hasMfa && (
          <div className="rounded-xl px-4 py-3 text-xs border"
            style={{ background: '#f59e0b10', borderColor: '#f59e0b30', color: 'var(--t3)' }}>
            <strong style={{ color: '#f59e0b' }}>Importante: </strong>
            Si pierdes acceso a tu app autenticadora, un administrador deberá eliminar tu factor
            desde el panel de Supabase. No existen códigos de respaldo para TOTP.
          </div>
        )}

        {/* Botón activar / formulario enroll */}
        {!loading && !hasMfa && !showEnroll && (
          <button
            onClick={() => setShowEnroll(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--acc)' }}
          >
            <Shield size={14} /> Activar autenticación en dos pasos
          </button>
        )}

        {!loading && !hasMfa && showEnroll && (
          <div className="border-t pt-5" style={{ borderColor: 'var(--border)' }}>
            <EnrollMFA onSuccess={() => { setShowEnroll(false); cargarFactors() }} />
          </div>
        )}
      </div>
    </div>
  )
}
