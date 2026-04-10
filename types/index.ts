export type Role = 'superadmin' | 'admin' | 'usuario'
export type Departamento = 'comercial' | 'mercadeo' | 'operaciones' | 'finanzas'
export type Pais = 'GT' | 'SV' | 'CO' | 'CR' | 'NI'

export interface UserProfile {
  id: string
  email: string
  full_name: string
  role: Role
  paises: Pais[]
  is_active: boolean
  created_at: string
}

export interface FactSalesSellout {
  id: number
  pais: string
  cliente: string
  cadena: string
  formato: string
  categoria: string
  subcategoria: string
  punto_venta: string
  codigo_interno: string
  codigo_barras: string
  sku: string
  descripcion: string
  ano: number
  mes: number
  dia: number
  ventas_unidades: number
  ventas_valor: number
}

export interface KPIs {
  ventas_total: number
  ventas_unidades: number
  precio_promedio: number
  proyeccion_mes: number
  cumplimiento: number
  tiendas_activas: number
  skus_activos: number
}

export interface FiltrosGlobales {
  pais?: string
  cliente?: string
  categoria?: string
  subcategoria?: string
  sku?: string
  ano?: number
  mes?: number
}

export interface VentasPorPais {
  pais: string
  ventas_valor: number
  ventas_unidades: number
}

export interface VentasPorCategoria {
  categoria: string
  ventas_valor: number
  ventas_unidades: number
}

export interface VentasDiarias {
  fecha: string
  ventas_valor: number
  ventas_unidades: number
}

export interface TopProducto {
  sku: string
  descripcion: string
  categoria: string
  ventas_valor: number
  ventas_unidades: number
  precio_promedio: number
}

export interface TopTienda {
  punto_venta: string
  pais: string
  ventas_valor: number
  ventas_unidades: number
}
