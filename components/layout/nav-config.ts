import {
  BarChart2, TrendingUp, ShoppingCart, ArrowUpRight, Target,
  Package, Globe2, Tag, Store, ShoppingBag,
  FileText, FileCheck,
  Box, Megaphone, Share2, DollarSign, CreditCard, Scale, PieChart, MapPin,
} from 'lucide-react'

export type NavItem = {
  href?: string
  icon: any
  label: string
  children?: { href: string; label: string }[]
}
export type MenuSection = { section: string; items: NavItem[] }

export const MENUS: Record<string, MenuSection[]> = {
  comercial: [
    {
      section: 'Sell In',
      items: [
        { href: '/sell-in/resumen',        icon: BarChart2,    label: 'Resumen Ejecutivo'  },
        { href: '/proyeccion',             icon: TrendingUp,   label: 'Proyección'         },
        { href: '/sell-in/variaciones',    icon: ArrowUpRight, label: 'YTD y Variaciones'  },
        { href: '/sell-in',                icon: ShoppingCart, label: 'Detalle por SKU'    },
        { href: '/sell-in/licenciamiento', icon: Tag,          label: 'Licenciamiento'     },
      ],
    },
    {
      section: 'Sell Out',
      items: [
        { href: '/resumen',            icon: BarChart2,    label: 'Resumen Ejecutivo' },
        { href: '/sellout/tendencias', icon: TrendingUp,   label: 'Tendencias'        },
        { href: '/sellout',            icon: ShoppingCart, label: 'Detalle por SKU'   },
        { href: '/sellout/ytd',        icon: ArrowUpRight, label: 'YTD y Variaciones' },
      ],
    },
    {
      section: 'Ejecución',
      items: [
        { icon: Globe2, label: 'GT', children: [
          { href: '/dashboard/comercial/ejecucion/gt/walmart',  label: 'Walmart'  },
          { href: '/dashboard/comercial/ejecucion/gt/unisuper', label: 'Unisuper' },
        ]},
        { icon: Globe2, label: 'HN', children: [
          { href: '/dashboard/comercial/ejecucion/hn/walmart', label: 'Walmart' },
        ]},
        { icon: Globe2, label: 'NI', children: [
          { href: '/dashboard/comercial/ejecucion/ni/walmart', label: 'Walmart' },
        ]},
        { icon: Globe2, label: 'SV', children: [
          { href: '/dashboard/comercial/ejecucion/sv/walmart',  label: 'Walmart'  },
          { href: '/dashboard/comercial/ejecucion/sv/selectos', label: 'Selectos' },
        ]},
        { icon: Globe2, label: 'CR', children: [
          { href: '/dashboard/comercial/ejecucion/cr/walmart', label: 'Walmart' },
        ]},
        { icon: Globe2, label: 'CO', children: [
          { href: '/dashboard/comercial/ejecucion/co/grupo-exito', label: 'Grupo Éxito' },
        ]},
      ],
    },
  ],
  mercadeo: [
    {
      section: 'Análisis',
      items: [
        { href: '/tendencias',      icon: TrendingUp, label: 'Tendencias de Ventas' },
        { href: '/recomendaciones', icon: Target,     label: 'Recomendaciones SKU'  },
      ],
    },
    {
      section: 'Dimensiones',
      items: [
        { href: '/pais',       icon: Globe2,      label: 'Por País'           },
        { href: '/producto',   icon: ShoppingBag, label: 'Por Producto'       },
        { href: '/tienda',     icon: Store,       label: 'Por Tienda'         },
        { href: '/geografica', icon: MapPin,      label: 'Ranking Geográfico' },
      ],
    },
    {
      section: 'Módulos',
      items: [
        { href: '/campanas',    icon: Megaphone,  label: 'Campañas'             },
        { href: '/share-voice', icon: Share2,     label: 'Share of Voice'       },
        { href: '/digital',     icon: TrendingUp, label: 'Rendimiento Digital'  },
      ],
    },
  ],
  operaciones: [
    {
      section: 'Registros Sanitarios',
      items: [{ href: '/registros-sanitarios', icon: FileCheck, label: 'Registros Sanitarios' }],
    },
    {
      section: 'Logística',
      items: [
        { href: '/logistica/inventario-pt', icon: Package, label: 'Inventario PT Borden' },
      ],
    },
    {
      section: 'Ventas',
      items: [
        { href: '/ventas/sell-in', icon: ShoppingCart, label: 'Ventas Sell In'    },
        { href: '/ventas/precios', icon: Tag,          label: 'Control de Precio' },
        { href: '/ventas/costos',  icon: DollarSign,   label: 'Costos y Márgenes' },
        { href: '/ventas/barrel',  icon: Package,      label: 'Leche'             },
        { href: '/ventas/block',   icon: Box,          label: 'Block'             },
      ],
    },
  ],
  finanzas: [
    {
      section: 'Vistas',
      items: [
        { href: '/resumen', icon: BarChart2, label: 'Resumen Ejecutivo' },
      ],
    },
    {
      section: 'Módulos',
      items: [
        { href: '/estado-resultados', icon: DollarSign, label: 'Estado de Resultados' },
        { href: '/flujo-caja',        icon: CreditCard, label: 'Flujo de Caja'        },
        { href: '/balance',           icon: Scale,      label: 'Balance General'      },
        { href: '/presupuesto',       icon: PieChart,   label: 'Presupuesto vs Real'  },
      ],
    },
  ],
}

export const DEPTS = ['comercial', 'mercadeo', 'operaciones', 'finanzas'] as const
export type Dept = typeof DEPTS[number]

export const DEPT_LABELS: Record<string, string> = {
  comercial:   'Ventas',
  mercadeo:    'Mercadeo',
  operaciones: 'Operaciones',
  finanzas:    'Finanzas',
}

export const DEPT_HOME: Record<string, string> = {
  comercial:   '/resumen',
  mercadeo:    '/tendencias',
  operaciones: '/registros-sanitarios',
  finanzas:    '/resumen',
}
