import { useMemo } from 'react'
import { useDashboardFilters } from '@/lib/context/DashboardFilters'
import { useAnalyticsStore } from '@/lib/store/filterStore'

/**
 * Merges global filters (from DashboardFiltersProvider) with
 * cross-filter selections (from Zustand) into a single URLSearchParams.
 * Used as the queryKey + fetch params for all analytics React Query hooks.
 */
export function useAnalyticsFilters(): URLSearchParams {
  const { fPaises, fCats, fSubcats, fClientes, fAnos, fMeses } = useDashboardFilters()
  const {
    selectedCategoria,
    selectedPais,
    selectedSubcategoria,
    selectedCliente,
  } = useAnalyticsStore()

  return useMemo(() => {
    const p = new URLSearchParams()

    if (fPaises.length)   p.set('paises',       fPaises.join(','))
    if (fCats.length)     p.set('categorias',    fCats.join(','))
    if (fSubcats.length)  p.set('subcategorias', fSubcats.join(','))
    if (fClientes.length) p.set('clientes',      fClientes.join(','))
    if (fAnos.length)     p.set('anos',          fAnos.join(','))
    if (fMeses.length)    p.set('meses',         fMeses.join(','))

    // Cross-filter params — set by donut clicks
    if (selectedCategoria)    p.set('categoria',    selectedCategoria)
    if (selectedPais)         p.set('pais',         selectedPais)
    if (selectedSubcategoria) p.set('subcategoria', selectedSubcategoria)
    if (selectedCliente)      p.set('cliente',      selectedCliente)

    return p
  }, [fPaises, fCats, fSubcats, fClientes, fAnos, fMeses,
      selectedCategoria, selectedPais, selectedSubcategoria, selectedCliente])
}
