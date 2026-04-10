import { useQuery } from '@tanstack/react-query'

// ── Response types ────────────────────────────────────────────────────────────

export interface KpiData {
  dias_con_ventas: number
  total_valor:     number
  total_unidades:  number
  avg_ticket:      number
  n_paises:        number
  n_skus:          number
  n_clientes:      number
  vs_prior: {
    total_valor_pct:    number | null
    total_unidades_pct: number | null
  } | null
}

export interface DonutRow    { label: string; value: number }
export interface DonutsData  {
  categoria:    DonutRow[]
  pais:         DonutRow[]
  subcategoria: DonutRow[]
  cliente:      DonutRow[]
}

export interface ProductRow {
  sku:         string
  descripcion: string
  categoria:   string
  valor:       number
  unidades:    number
  pct_total:   number
  sparkline:   number[]
}
export interface ProductsData { products: ProductRow[] }

export interface MonthlyRow {
  label:      string
  ano:        number
  mes:        number
  valor:      number
  unidades:   number
  valor_prev: number | null
  target:     number | null
  attainment: number | null
  color:      string | null
}
export interface MonthlyData { monthly: MonthlyRow[] }

// ── Fetcher helpers ──────────────────────────────────────────────────────────

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText}${text ? ': ' + text : ''}`)
  }
  return res.json() as Promise<T>
}

// ── React Query hooks ────────────────────────────────────────────────────────

export function useKpis(params: URLSearchParams) {
  return useQuery<KpiData>({
    queryKey:  ['analytics', 'kpis', params.toString()],
    queryFn:   () => fetchJSON(`/api/analytics/kpis?${params}`),
    staleTime: 60_000,
  })
}

export function useDonutData(params: URLSearchParams) {
  return useQuery<DonutsData>({
    queryKey:  ['analytics', 'donuts', params.toString()],
    queryFn:   () => fetchJSON(`/api/analytics/donuts?${params}`),
    staleTime: 60_000,
  })
}

export function useProducts(params: URLSearchParams) {
  return useQuery<ProductsData>({
    queryKey:  ['analytics', 'products', params.toString()],
    queryFn:   () => fetchJSON(`/api/analytics/products?${params}`),
    staleTime: 60_000,
  })
}

export function useMonthly(params: URLSearchParams) {
  return useQuery<MonthlyData>({
    queryKey:  ['analytics', 'monthly', params.toString()],
    queryFn:   () => fetchJSON(`/api/analytics/monthly?${params}`),
    staleTime: 60_000,
  })
}
