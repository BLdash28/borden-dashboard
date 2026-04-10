import { create } from 'zustand'

export type CrossFilterType = 'categoria' | 'pais' | 'subcategoria' | 'cliente'

export interface ActiveSegment {
  type: CrossFilterType
  value: string
}

interface AnalyticsFilterStore {
  // Cross-filter selections produced by donut clicks
  selectedCategoria:    string | null
  selectedPais:         string | null
  selectedSubcategoria: string | null
  selectedCliente:      string | null

  // Metric toggle
  metric: 'usd' | 'units'

  // Actions
  setCategoria:    (v: string | null) => void
  setPais:         (v: string | null) => void
  setSubcategoria: (v: string | null) => void
  setCliente:      (v: string | null) => void
  setMetric:       (v: 'usd' | 'units') => void
  clearAll:        () => void

  // Derived: active segment chips for the filter bar
  activeSegments: ActiveSegment[]
  clearSegment:   (type: CrossFilterType) => void
}

export const useAnalyticsStore = create<AnalyticsFilterStore>((set, get) => ({
  selectedCategoria:    null,
  selectedPais:         null,
  selectedSubcategoria: null,
  selectedCliente:      null,
  metric:               'usd',

  setCategoria:    (v) => set({ selectedCategoria:    v }),
  setPais:         (v) => set({ selectedPais:         v }),
  setSubcategoria: (v) => set({ selectedSubcategoria: v }),
  setCliente:      (v) => set({ selectedCliente:      v }),
  setMetric:       (v) => set({ metric: v }),

  clearAll: () => set({
    selectedCategoria:    null,
    selectedPais:         null,
    selectedSubcategoria: null,
    selectedCliente:      null,
  }),

  get activeSegments() {
    const s = get()
    const out: ActiveSegment[] = []
    if (s.selectedCategoria)    out.push({ type: 'categoria',    value: s.selectedCategoria    })
    if (s.selectedPais)         out.push({ type: 'pais',         value: s.selectedPais         })
    if (s.selectedSubcategoria) out.push({ type: 'subcategoria', value: s.selectedSubcategoria })
    if (s.selectedCliente)      out.push({ type: 'cliente',      value: s.selectedCliente      })
    return out
  },

  clearSegment: (type) => {
    if (type === 'categoria')    set({ selectedCategoria:    null })
    if (type === 'pais')         set({ selectedPais:         null })
    if (type === 'subcategoria') set({ selectedSubcategoria: null })
    if (type === 'cliente')      set({ selectedCliente:      null })
  },
}))
