'use client'
import React, {
  createContext, useContext, useState, useEffect, useRef, useMemo, useCallback,
} from 'react'

const MESES_LABEL = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const PAISES_OPTS  = ['CO','CR','GT','HN','NI','SV']
const BASE_CATS    = ['Helados','Leches','Quesos']

export interface MesOpt {
  value: string
  label: string
  disabled: boolean
}

interface FiltersCtx {
  // Active filter state
  fPaises:   string[]
  fCats:     string[]
  fSubcats:  string[]
  fClientes: string[]
  fAnos:     string[]
  fMeses:    string[]

  // Available options (cascaded)
  anosOpts:     number[]
  paisesOpts:   string[]
  catsOpts:     string[]
  subcatsOpts:  string[]
  clientesOpts: string[]
  mesOpts:      MesOpt[]
  periodos:     { ano: number; mes: number }[]

  // Loading states
  loadingCats:     boolean
  loadingSubcats:  boolean
  loadingClientes: boolean

  // Current date
  curAno: number
  curMes: number

  // Setters
  setPaises:   (v: string[]) => void
  setCats:     (v: string[]) => void
  setSubcats:  (v: string[]) => void
  setClientes: (v: string[]) => void
  setAnos:     (v: string[]) => void
  setMeses:    (v: string[]) => void
  limpiar:     () => void

  // Derived
  hayFiltros: boolean

  // Helper: build query params object for API calls
  buildParams: (extra?: Record<string, string>) => URLSearchParams
}

const Ctx = createContext<FiltersCtx | null>(null)

export function DashboardFiltersProvider({ children }: { children: React.ReactNode }) {
  const now    = new Date()
  const curAno = now.getFullYear()
  const curMes = now.getMonth() + 1

  const [fPaises,   setFPaises]   = useState<string[]>([])
  const [fCats,     setFCats]     = useState<string[]>([])
  const [fSubcats,  setFSubcats]  = useState<string[]>([])
  const [fClientes, setFClientes] = useState<string[]>([])
  const [fAnos,     setFAnos]     = useState<string[]>([])
  const [fMeses,    setFMeses]    = useState<string[]>([])

  const [anosOpts,     setAnosOpts]     = useState<number[]>([])
  const [catsOpts,     setCatsOpts]     = useState<string[]>(BASE_CATS)
  const [subcatsOpts,  setSubcatsOpts]  = useState<string[]>([])
  const [clientesOpts, setClientesOpts] = useState<string[]>([])
  const [periodos,     setPeriodos]     = useState<{ ano: number; mes: number }[]>([])

  const [loadingCats,     setLoadingCats]     = useState(false)
  const [loadingSubcats,  setLoadingSubcats]  = useState(false)
  const [loadingClientes, setLoadingClientes] = useState(false)

  const initDone = useRef(false)

  // ── Init: cargar periodos ──────────────────────────────────────────────────
  useEffect(() => {
    if (initDone.current) return
    initDone.current = true

    fetch('/api/ventas/resumen?tipo=periodos')
      .then(r => r.json())
      .then(pJ => {
        const pers: { ano: number; mes: number }[] = (pJ.periodos || [])
          .map((p: any) => ({ ano: Number(p.ano), mes: Number(p.mes) }))
        setPeriodos(pers)
        const anos = [...new Set(pers.map(p => p.ano))].sort((a, b) => b - a)
        setAnosOpts(anos)
      })
      .catch(console.error)
  }, []) // eslint-disable-line

  // ── Cascade: países → categorías ──────────────────────────────────────────
  // Siempre se carga (es el primer nivel, reemplaza la carga estática BASE_CATS)
  const fetchCats = useCallback((paises: string[]) => {
    setLoadingCats(true)
    const q = new URLSearchParams({ dim: 'categoria' })
    if (paises.length) q.set('paises', paises.join(','))
    fetch(`/api/ventas/dimension?${q}`)
      .then(r => r.json())
      .then(d => {
        const fromDb = (d.rows || []).map((r: any) => r.nombre).filter(Boolean)
        const cats = Array.from(new Set([...BASE_CATS, ...fromDb])).sort() as string[]
        setCatsOpts(cats)
        setFCats(prev => prev.filter(c => cats.includes(c)))
      })
      .catch(console.error)
      .finally(() => setLoadingCats(false))
  }, [])

  useEffect(() => { fetchCats(fPaises) }, [fPaises, fetchCats])

  // ── Cascade: países + categorías → subcategorías (lazy: solo si hay selección) ──
  const fetchSubcats = useCallback((paises: string[], cats: string[]) => {
    // Sin selección padre no hay valor en mostrar todos; limpia y sale
    if (!paises.length && !cats.length) { setSubcatsOpts([]); setFSubcats([]); return }
    setLoadingSubcats(true)
    const q = new URLSearchParams({ dim: 'subcategoria' })
    if (paises.length) q.set('paises',     paises.join(','))
    if (cats.length)   q.set('categorias', cats.join(','))
    fetch(`/api/ventas/dimension?${q}`)
      .then(r => r.json())
      .then(d => {
        const opts = (d.rows || []).map((r: any) => r.nombre).filter(Boolean).sort()
        setSubcatsOpts(opts)
        setFSubcats(prev => prev.filter(s => opts.includes(s)))
      })
      .catch(console.error)
      .finally(() => setLoadingSubcats(false))
  }, [])

  useEffect(() => { fetchSubcats(fPaises, fCats) }, [fPaises, fCats, fetchSubcats])

  // ── Cascade: países + cats + subcats → clientes (lazy: solo si hay selección) ──
  const fetchClientes = useCallback((paises: string[], cats: string[], subcats: string[]) => {
    // Sin selección padre no hay valor en mostrar todos; limpia y sale
    if (!paises.length && !cats.length && !subcats.length) { setClientesOpts([]); setFClientes([]); return }
    setLoadingClientes(true)
    const q = new URLSearchParams({ dim: 'cliente' })
    if (paises.length)  q.set('paises',       paises.join(','))
    if (cats.length)    q.set('categorias',    cats.join(','))
    if (subcats.length) q.set('subcategorias', subcats.join(','))
    fetch(`/api/ventas/dimension?${q}`)
      .then(r => r.json())
      .then(d => {
        const opts = (d.rows || []).map((r: any) => r.nombre).filter(Boolean).sort()
        setClientesOpts(opts)
        setFClientes(prev => prev.filter(c => opts.includes(c)))
      })
      .catch(console.error)
      .finally(() => setLoadingClientes(false))
  }, [])

  useEffect(() => { fetchClientes(fPaises, fCats, fSubcats) }, [fPaises, fCats, fSubcats, fetchClientes])

  // ── Cascade: años → meses disponibles ────────────────────────────────────
  const mesOpts = useMemo((): MesOpt[] => {
    const activePers = fAnos.length > 0
      ? periodos.filter(p => fAnos.includes(String(p.ano)))
      : periodos
    const mesesWithData = new Set(activePers.map(p => p.mes))

    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1
      const hasData = mesesWithData.size === 0 || mesesWithData.has(m)
      return { value: String(m), label: MESES_LABEL[m], disabled: !hasData }
    })
  }, [fAnos, periodos])

  const limpiar = () => {
    setFPaises([])
    setFCats([])
    setFSubcats([])
    setFClientes([])
    setFAnos([])
    setFMeses([])
  }

  const hayFiltros =
    fPaises.length > 0 || fCats.length > 0 || fSubcats.length > 0 ||
    fClientes.length > 0 || fAnos.length > 0 || fMeses.length > 0

  const buildParams = useCallback((extra: Record<string, string> = {}): URLSearchParams => {
    const p = new URLSearchParams(extra)
    if (fPaises.length)   p.set('paises',        fPaises.join(','))
    if (fCats.length)     p.set('categorias',     fCats.join(','))
    if (fSubcats.length)  p.set('subcategorias',  fSubcats.join(','))
    if (fClientes.length) p.set('clientes',       fClientes.join(','))
    if (fAnos.length)     p.set('anos',           fAnos.join(','))
    if (fMeses.length)    p.set('meses',          fMeses.join(','))
    return p
  }, [fPaises, fCats, fSubcats, fClientes, fAnos, fMeses])

  return (
    <Ctx.Provider value={{
      fPaises, fCats, fSubcats, fClientes, fAnos, fMeses,
      anosOpts, paisesOpts: PAISES_OPTS,
      catsOpts, subcatsOpts, clientesOpts,
      mesOpts, periodos,
      loadingCats, loadingSubcats, loadingClientes,
      curAno, curMes,
      setPaises: setFPaises,
      setCats:   setFCats,
      setSubcats: setFSubcats,
      setClientes: setFClientes,
      setAnos:   setFAnos,
      setMeses:  setFMeses,
      limpiar,
      hayFiltros,
      buildParams,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function useDashboardFilters(): FiltersCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useDashboardFilters must be used inside DashboardFiltersProvider')
  return ctx
}

export { MESES_LABEL, PAISES_OPTS }
