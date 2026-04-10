'use client'
import { usePathname } from 'next/navigation'


const TITLES: Record<string, string> = {
  'resumen':              'Resumen Ejecutivo',
  'ventas-pais':          'Ventas Diarias por País',
  'sellout':              'Ventas Sellout',
  'crecimientos':         'Crecimientos YTD',
  'cumplimiento':         'Cumplimiento',
  'doh':                  'Inventarios DOH',
  'coberturas':           'Coberturas',
  'pais':                 'Análisis por País',
  'categoria':            'Análisis por Categoría',
  'tienda':               'Análisis por Tienda',
  'producto':             'Análisis por Producto (SKU)',
  'reportes':             'Reportes',
  'usuarios':             'Gestión de Usuarios',
  'registros-sanitarios': 'Registros Sanitarios',
  'barrel-block':         'Leche & Crema',
  'barrel':               'Leche',
  'block':                'Block',
  'helados':              'Helados',
  'sell-in':              'Ventas Sell In',
  'precios':              'Control de Precio',
  'costos':               'Costos y Márgenes',
}

export default function Topbar({ profile }: { profile?: any }) {
  const pathname = usePathname()

  const getTitle = () => {
    const segments = pathname.split('/')
    for (let i = segments.length - 1; i >= 0; i--) {
      if (TITLES[segments[i]]) return TITLES[segments[i]]
    }
    return 'Dashboard'
  }

  return (
    <header className="sticky top-0 z-30 px-6 py-3 flex items-center justify-between border-b"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <div className="font-display font-bold text-[15px]" style={{ color: 'var(--t1)' }}>
        {getTitle()}
      </div>
      <img src="/borden-logo.png" alt="Borden" className="h-9 w-auto object-contain" />
    </header>
  )
}
