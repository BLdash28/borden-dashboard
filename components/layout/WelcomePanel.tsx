'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// ── Types ──────────────────────────────────────────────────────────────────

interface Quote {
  tagline: string   // short 1-2 line text for amber card (use \n for line break)
  text: string      // full quote
  highlight: string // word to highlight in amber (must appear in text)
  author: string
}

// ── Quote Data ─────────────────────────────────────────────────────────────

const QUOTES: Record<string, Quote[]> = {
  ventas: [
    {
      tagline: 'Ayuda a suficientes personas\ny el éxito llegará solo.',
      text: 'Puedes tener todo lo que quieras en la vida si ayudas a suficientes personas a conseguir lo que ellas quieren.',
      highlight: 'ayudas',
      author: 'Zig Ziglar',
    },
    {
      tagline: 'Sé la solución,\nno el vendedor.',
      text: 'Acércate a cada cliente con la idea de ayudarlo a resolver un problema o alcanzar una meta, no de venderle un producto.',
      highlight: 'resolver',
      author: 'Brian Tracy',
    },
    {
      tagline: 'El éxito no se sueña.\nSe trabaja.',
      text: 'Nunca soñé con el éxito. Trabajé por él.',
      highlight: 'Trabajé',
      author: 'Estée Lauder',
    },
    {
      tagline: 'Simple y directo:\nlas ventas lo curan todo.',
      text: 'Las ventas lo curan todo.',
      highlight: 'curan',
      author: 'Mark Cuban',
    },
    {
      tagline: 'Muestra el camino.\nCrea la necesidad.',
      text: 'La gente no sabe lo que quiere hasta que se lo muestras.',
      highlight: 'muestras',
      author: 'Steve Jobs',
    },
    {
      tagline: 'Elimina los obstáculos\nuno a uno.',
      text: 'Cada venta tiene cinco obstáculos básicos: no hay necesidad, no hay dinero, no hay prisa, no hay deseo, no hay confianza.',
      highlight: 'confianza',
      author: 'Zig Ziglar',
    },
    {
      tagline: 'Todo empieza con\nuna venta.',
      text: 'Nada ocurre hasta que alguien vende algo.',
      highlight: 'vende',
      author: "Arthur 'Red' Motley",
    },
    {
      tagline: 'Conviértete en quien\natrae el éxito.',
      text: 'El éxito no es algo que persigues; es algo que atraes por la persona en la que te conviertes.',
      highlight: 'atraes',
      author: 'Jim Rohn',
    },
    {
      tagline: 'Haz sentir importante\na cada persona.',
      text: "Imagina que cada persona que conoces lleva colgado un cartel que dice: 'Hazme sentir importante'.",
      highlight: 'importante',
      author: 'Mary Kay Ash',
    },
    {
      tagline: 'No vendas.\nDeja que compren.',
      text: 'A la gente le disgusta que le vendan, pero le encanta comprar.',
      highlight: 'comprar',
      author: 'Jeffrey Gitomer',
    },
  ],

  operaciones: [
    {
      tagline: 'Primero lo correcto.\nLuego hazlo bien.',
      text: 'Eficiencia es hacer las cosas bien; eficacia es hacer las cosas correctas.',
      highlight: 'correctas',
      author: 'Peter Drucker',
    },
    {
      tagline: 'La eficiencia sin\ndirección no sirve.',
      text: 'No hay nada tan inútil como hacer con gran eficiencia algo que no debería hacerse en absoluto.',
      highlight: 'inútil',
      author: 'Peter Drucker',
    },
    {
      tagline: 'Mídelo todo.\nConfía en los datos.',
      text: 'En Dios confiamos; todos los demás deben traer datos.',
      highlight: 'datos',
      author: 'W. Edwards Deming',
    },
    {
      tagline: 'Saber qué hacer es\nel primer paso.',
      text: 'No basta con hacer tu mejor esfuerzo; primero debes saber qué hacer, y luego dar tu mejor esfuerzo.',
      highlight: 'saber',
      author: 'W. Edwards Deming',
    },
    {
      tagline: 'Los costos existen\npara ser reducidos.',
      text: 'Los costos no existen para ser calculados. Los costos existen para ser reducidos.',
      highlight: 'reducidos',
      author: 'Taiichi Ohno',
    },
    {
      tagline: 'La tecnología amplifica\nlo que ya hay.',
      text: 'La automatización aplicada a una operación eficiente magnifica la eficiencia; aplicada a una ineficiente, magnifica la ineficiencia.',
      highlight: 'magnifica',
      author: 'Bill Gates',
    },
    {
      tagline: 'El cliente es\nel único jefe.',
      text: 'Solo hay un jefe: el cliente. Y puede despedir a todos en la empresa simplemente gastando su dinero en otro lugar.',
      highlight: 'jefe',
      author: 'Sam Walton',
    },
    {
      tagline: 'La excelencia vive\nen el cambio constante.',
      text: 'Las empresas excelentes no creen en la excelencia, sino en la mejora y el cambio constantes.',
      highlight: 'cambio',
      author: 'Tom Peters',
    },
    {
      tagline: 'La preparación es\ntu mejor herramienta.',
      text: 'Al no prepararte, te estás preparando para fracasar.',
      highlight: 'prepararte',
      author: 'Benjamin Franklin',
    },
    {
      tagline: 'Trabajar juntos es\nel verdadero éxito.',
      text: 'Reunirse es un comienzo; mantenerse juntos es un progreso; trabajar juntos es el éxito.',
      highlight: 'juntos',
      author: 'Henry Ford',
    },
  ],

  mercadeo: [
    {
      tagline: 'Conócelo tanto que\nel producto se venda solo.',
      text: 'El objetivo del marketing es conocer y comprender tan bien al cliente que el producto se venda solo.',
      highlight: 'comprender',
      author: 'Peter Drucker',
    },
    {
      tagline: 'No fabricas cosas.\nCuentas historias.',
      text: 'El marketing ya no se trata de las cosas que fabricas, sino de las historias que cuentas.',
      highlight: 'historias',
      author: 'Seth Godin',
    },
    {
      tagline: 'Crea valor genuino\npara el cliente.',
      text: 'El marketing no es el arte de encontrar maneras ingeniosas de deshacerte de lo que produces; es el arte de crear valor genuino para el cliente.',
      highlight: 'valor',
      author: 'Philip Kotler',
    },
    {
      tagline: 'Tu marca habla\ncuando no estás.',
      text: 'Tu marca es lo que la gente dice de ti cuando no estás en la sala.',
      highlight: 'marca',
      author: 'Jeff Bezos',
    },
    {
      tagline: 'El consumidor\nes tu socio.',
      text: 'El consumidor no es un tonto; es tu pareja.',
      highlight: 'pareja',
      author: 'David Ogilvy',
    },
    {
      tagline: 'El contenido\nes el rey.',
      text: 'El contenido es el rey.',
      highlight: 'rey',
      author: 'Bill Gates',
    },
    {
      tagline: 'Ayuda primero.\nEl negocio sigue.',
      text: 'Lo que ayuda a las personas, ayuda al negocio.',
      highlight: 'ayuda',
      author: 'Leo Burnett',
    },
    {
      tagline: 'Sin publicidad,\nnadie te ve.',
      text: 'Hacer negocios sin publicidad es como guiñarle el ojo a alguien en la oscuridad: tú sabes lo que haces, pero nadie más lo sabe.',
      highlight: 'oscuridad',
      author: 'Steuart Henderson Britt',
    },
    {
      tagline: 'Lo que permanece es\ncómo los hiciste sentir.',
      text: 'La gente olvidará lo que dijiste y lo que hiciste, pero nunca olvidará cómo la hiciste sentir.',
      highlight: 'sentir',
      author: 'Maya Angelou',
    },
    {
      tagline: 'Ahorrar en publicidad\nes perder tiempo.',
      text: 'Quien deja de hacer publicidad para ahorrar dinero es como quien detiene el reloj para ahorrar tiempo.',
      highlight: 'tiempo',
      author: 'Henry Ford',
    },
  ],

  finanzas: [
    {
      tagline: 'Precio y valor\nno son lo mismo.',
      text: 'El precio es lo que pagas. El valor es lo que recibes.',
      highlight: 'valor',
      author: 'Warren Buffett',
    },
    {
      tagline: 'La riqueza premia\nal paciente.',
      text: 'El mercado de valores es un mecanismo para transferir riqueza del impaciente al paciente.',
      highlight: 'paciente',
      author: 'Warren Buffett',
    },
    {
      tagline: 'Solo invierte en\nlo que entiendes.',
      text: 'Nunca inviertas en un negocio que no puedas entender.',
      highlight: 'entender',
      author: 'Warren Buffett',
    },
    {
      tagline: 'Domina el lenguaje\nde los negocios.',
      text: 'La contabilidad es el lenguaje de los negocios.',
      highlight: 'lenguaje',
      author: 'Warren Buffett',
    },
    {
      tagline: 'El efectivo es\nun hecho, no una opinión.',
      text: 'Las ganancias son una opinión, el efectivo es un hecho.',
      highlight: 'efectivo',
      author: 'Alfred Rappaport',
    },
    {
      tagline: 'Lo que se mide,\nse puede mejorar.',
      text: 'Lo que no se mide, no se puede gestionar.',
      highlight: 'mide',
      author: 'Peter Drucker',
    },
    {
      tagline: 'Dile a tu dinero\na dónde ir.',
      text: 'Un presupuesto es decirle a tu dinero a dónde ir, en lugar de preguntarte a dónde fue.',
      highlight: 'presupuesto',
      author: 'Dave Ramsey',
    },
    {
      tagline: 'El riesgo viene de\nla ignorancia.',
      text: 'El riesgo viene de no saber lo que estás haciendo.',
      highlight: 'riesgo',
      author: 'Warren Buffett',
    },
    {
      tagline: 'La primera regla:\nnunca pierdas.',
      text: 'Regla n.º 1: nunca pierdas dinero. Regla n.º 2: nunca olvides la regla n.º 1.',
      highlight: 'pierdas',
      author: 'Warren Buffett',
    },
    {
      tagline: 'El tiempo es el amigo\ndel negocio bueno.',
      text: 'El tiempo es el amigo de los negocios maravillosos, el enemigo de los mediocres.',
      highlight: 'amigo',
      author: 'Warren Buffett',
    },
  ],
}

// ── Config ─────────────────────────────────────────────────────────────────

const DEPT_LABELS: Record<string, string> = {
  ventas:      'Panel de Ventas',
  operaciones: 'Panel de Operaciones',
  mercadeo:    'Panel de Mercadeo',
  finanzas:    'Panel de Finanzas',
}

const DEPT_SUBTITLES: Record<string, string> = {
  ventas:      'Aquí tienes todo lo que necesitas para cerrar un gran mes.',
  operaciones: 'Todo bajo control para operar con excelencia hoy.',
  mercadeo:    'Ideas y datos para conectar mejor con el consumidor.',
  finanzas:    'Los números que impulsan las decisiones del negocio.',
}

// ── Helpers ────────────────────────────────────────────────────────────────

function saludo() {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

function fechaCorta() {
  return new Date().toLocaleDateString('es-CR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function QuoteText({ text, highlight }: { text: string; highlight: string }) {
  const escaped = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === highlight.toLowerCase() ? (
          <em key={i} style={{ color: '#c8873a', fontStyle: 'italic', fontWeight: 700 }}>{p}</em>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  )
}

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  dept:        'ventas' | 'operaciones' | 'mercadeo' | 'finanzas'
  nombre:      string
  destination: string
}

// ── Component ──────────────────────────────────────────────────────────────

export default function WelcomePanel({ dept, nombre, destination }: Props) {
  const router  = useRouter()
  const quotes  = QUOTES[dept] ?? QUOTES.ventas
  const [idx,     setIdx]     = useState(0)
  const [visible, setVisible] = useState(true)
  const [ready,   setReady]   = useState(false)

  useEffect(() => { setReady(true) }, [])

  const goTo = useCallback((i: number) => {
    setVisible(false)
    setTimeout(() => { setIdx(i); setVisible(true) }, 380)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      goTo((idx + 1) % quotes.length)
    }, 15000)
    return () => clearInterval(interval)
  }, [idx, quotes.length, goTo])

  const q = quotes[idx]

  return (
    <div
      className="flex flex-col -m-4 md:-m-6"
      style={{
        minHeight: 'calc(100vh - 60px)',
        background: 'linear-gradient(160deg, #f7f5f2 0%, #edeae4 100%)',
      }}
    >
      <div className="flex-1 flex flex-col justify-center px-8 md:px-14 py-12 w-full max-w-4xl">

        {/* ── Header ── */}
        <div className="flex items-start justify-between mb-10 gap-4">
          <div>
            {ready && (
              <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#c8873a' }}>
                {saludo()}
              </p>
            )}
            <h1 className="text-[36px] md:text-[44px] font-black leading-tight" style={{ color: '#0a1628' }}>
              ¡Bienvenido de vuelta, {nombre}! 👋
            </h1>
            <p className="mt-2 text-[15px]" style={{ color: '#64748b' }}>
              {DEPT_SUBTITLES[dept]}
            </p>
          </div>
          {ready && (
            <p
              className="hidden md:block text-right text-[12px] shrink-0 capitalize leading-snug mt-1"
              style={{ color: '#94a3b8' }}
            >
              {fechaCorta()}
            </p>
          )}
        </div>

        {/* ── Animated card ── */}
        <div
          style={{
            opacity:    visible ? 1 : 0,
            transform:  visible ? 'translateY(0px)' : 'translateY(10px)',
            transition: 'opacity 0.38s ease, transform 0.38s ease',
          }}
        >
          {/* Amber header */}
          <div
            className="rounded-t-2xl px-7 py-5 flex items-center justify-between gap-6"
            style={{
              background: 'linear-gradient(135deg, #a86220 0%, #c8873a 55%, #e8a95a 100%)',
            }}
          >
            <div className="flex items-center gap-2 shrink-0">
              <span className="w-2 h-2 rounded-full bg-white opacity-80" />
              <span className="text-[10px] font-bold uppercase tracking-[2.5px] text-white opacity-90">
                Mensaje del día
              </span>
            </div>
            <p
              className="text-right text-white text-[13px] font-medium leading-snug opacity-90"
              style={{ whiteSpace: 'pre-line' }}
            >
              {q.tagline}
            </p>
          </div>

          {/* Quote body */}
          <div
            className="rounded-b-2xl px-8 py-9"
            style={{
              background: 'white',
              boxShadow:  '0 8px 40px rgba(10,22,40,0.07)',
            }}
          >
            <p
              className="text-[24px] md:text-[28px] font-semibold leading-relaxed mb-5"
              style={{ color: '#0a1628' }}
            >
              &ldquo;<QuoteText text={q.text} highlight={q.highlight} />&rdquo;
            </p>
            <p className="text-sm font-medium" style={{ color: '#94a3b8' }}>
              — {q.author}
            </p>
          </div>
        </div>

        {/* ── Dots + CTA ── */}
        <div className="mt-6 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {quotes.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                aria-label={`Frase ${i + 1}`}
                className="rounded-full transition-all duration-300"
                style={{
                  width:      i === idx ? 20 : 6,
                  height:     6,
                  background: i === idx ? '#c8873a' : '#cbd5e1',
                }}
              />
            ))}
          </div>

          <button
            onClick={() => router.push(destination)}
            className="px-7 py-3.5 rounded-xl font-bold text-white text-[14px] transition-all duration-200 hover:opacity-90 hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: 'linear-gradient(135deg, #c8873a 0%, #e8a95a 100%)',
              boxShadow:  '0 4px 18px rgba(200,135,58,0.32)',
            }}
          >
            Ir al Dashboard →
          </button>
        </div>

      </div>
    </div>
  )
}
