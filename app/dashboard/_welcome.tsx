'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

interface Props {
  nombre:      string
  destination: string
}

function saludo() {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

function fechaHoy() {
  return new Date().toLocaleDateString('es-CR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

export default function WelcomePage({ nombre, destination }: Props) {
  const router  = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => { setReady(true) }, [])

  const greeting = ready ? saludo()  : ''
  const fecha    = ready ? fechaHoy() : ''

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: 'linear-gradient(160deg, #f7f5f2 0%, #edeae4 100%)' }}
    >
      {/* Glow decoration */}
      <div
        className="fixed top-0 right-0 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(200,135,58,0.07) 0%, transparent 70%)' }}
      />
      <div
        className="fixed bottom-0 left-0 w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(10,22,40,0.05) 0%, transparent 70%)' }}
      />

      {/* Card */}
      <div
        className="relative w-full max-w-md bg-white rounded-3xl px-10 py-12 text-center"
        style={{ boxShadow: '0 8px 48px rgba(10,22,40,0.10), 0 1px 3px rgba(10,22,40,0.06)' }}
      >
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center overflow-hidden"
            style={{ background: '#0a1628' }}
          >
            <Image
              src="/borden-logo.png"
              alt="Borden"
              width={44}
              height={44}
              className="object-contain"
            />
          </div>
        </div>

        {/* Date */}
        {fecha && (
          <p
            className="text-[10px] uppercase tracking-[3px] mb-4 capitalize"
            style={{ color: '#94a3b8' }}
          >
            {fecha}
          </p>
        )}

        {/* Greeting */}
        {greeting && (
          <p className="text-base font-medium mb-1" style={{ color: '#c8873a' }}>
            {greeting}
          </p>
        )}

        <h1 className="text-[38px] font-black leading-tight mb-4" style={{ color: '#0a1628' }}>
          {nombre} 👋
        </h1>

        {/* Tagline */}
        <p className="text-[15px] leading-relaxed mb-10" style={{ color: '#64748b' }}>
          Tu panel de ventas está listo.
          <br />
          Aquí tienes todo para cerrar un gran mes.
        </p>

        {/* CTA */}
        <button
          onClick={() => router.push(destination)}
          className="w-full py-4 rounded-2xl font-bold text-white text-[15px] transition-all duration-200 hover:opacity-90 hover:scale-[1.02] active:scale-[0.98]"
          style={{
            background: 'linear-gradient(135deg, #c8873a 0%, #e8a95a 100%)',
            boxShadow: '0 4px 20px rgba(200,135,58,0.35)',
          }}
        >
          Ir al Dashboard →
        </button>

        {/* Divider line */}
        <div
          className="absolute bottom-0 inset-x-0 h-[3px] rounded-b-3xl"
          style={{ background: 'linear-gradient(90deg, #c8873a, #e8a95a, #c8873a)' }}
        />
      </div>

      {/* Footer */}
      <p className="mt-8 text-[11px]" style={{ color: '#94a3b8' }}>
        Borden Latinoamérica · Dashboard Comercial
      </p>
    </div>
  )
}
