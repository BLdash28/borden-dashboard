'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ShieldAlert, X } from 'lucide-react'

export default function MfaBanner() {
  const supabase = createClient()
  const [show,      setShow]      = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Solo verificar una vez por sesión de página
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const hasVerified = (data?.totp ?? []).some(f => f.status === 'verified')
      if (!hasVerified) setShow(true)
    }).catch(() => {})
  }, [])

  if (!show || dismissed) return null

  return (
    <div className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm"
      style={{
        background: '#c8873a15',
        borderBottom: '1px solid #c8873a30',
        color: 'var(--t2)',
      }}>
      <div className="flex items-center gap-2">
        <ShieldAlert size={15} style={{ color: 'var(--acc)', flexShrink: 0 }} />
        <span>
          Recomendamos activar la autenticación en dos pasos para proteger tu cuenta.{' '}
          <Link href="/dashboard/admin/seguridad"
            className="font-semibold underline underline-offset-2 hover:opacity-80"
            style={{ color: 'var(--acc)' }}>
            Activar ahora
          </Link>
        </span>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 hover:opacity-60 transition-opacity"
        style={{ color: 'var(--t3)' }}
        aria-label="Cerrar"
      >
        <X size={14} />
      </button>
    </div>
  )
}
