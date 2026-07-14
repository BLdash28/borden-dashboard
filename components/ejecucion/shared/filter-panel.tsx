/**
 * Panel de filtros estándar para módulos Ejecución.
 * Renderiza el grid de multi-selects. La barra superior (chips, moneda,
 * reset, toggle open/close) la maneja EjecucionLayout.
 *
 * Filtros base uniformes: Categoría, Cadena, Subcategoría, SKU
 * Extras por módulo:
 *   - Colombia (Éxito) → Departamento, Ciudad
 *   - Walmart          → Formato, Punto de venta
 */
'use client'
import MultiSelect from '@/components/dashboard/MultiSelect'

export type FilterOption = { value: string; label?: string; [key: string]: unknown }

export type FilterDef = {
  key:            string
  label:          string
  placeholder?:   string
  value:          string[]
  onChange:       (v: string[]) => void
  options:        FilterOption[]
  /** Ancho relativo en el grid (default 1). SKU normalmente 2. */
  span?:          1 | 2 | 3
  selectAllLabel?: string
}

export function FilterPanel({
  filters, accent = 'amber',
}: {
  filters: FilterDef[]
  accent?: 'amber' | 'blue' | 'emerald' | 'violet'
}) {
  return (
    <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {filters.map(f => {
        const span = f.span ?? 1
        const spanCls = span === 2 ? 'col-span-2 lg:col-span-2' : span === 3 ? 'col-span-2 lg:col-span-3' : ''
        return (
          <div key={f.key} className={spanCls}>
            <MultiSelect
              label={f.label}
              placeholder={f.placeholder ?? 'Todos'}
              selectAllLabel={f.selectAllLabel ?? `Todos los ${f.label.toLowerCase()}`}
              value={f.value}
              onChange={f.onChange}
              options={f.options.map(o => ({ value: o.value, label: o.label ?? o.value }))}
            />
          </div>
        )
      })}
    </div>
  )
}
