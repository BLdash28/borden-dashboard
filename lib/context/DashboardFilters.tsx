'use client'
import React, {
  createContext, useContext, useState, useEffect, useRef, useMemo, useCallback,
  type Dispatch, type SetStateAction,
} from 'react'
import { useUserId } from '@/lib/hooks/useUserId'
import { readScopedFor, writeScopedFor, removeScopedFor } from '@/lib/storage/userScopedStorage'

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

const MESES_LABEL = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const PAISES_OPTS  = ['CO','CR','GT','HN','NI','SV']
const BASE_CATS    = ['Helados','Leches','Quesos']
const STORAGE_KEY  = 'bl_filters'  // scoped por userId: `bl_filters::u:${userId}`

interface StoredFilters {
  fPaises?:      string[]
  fCats?:        string[]
  fSubcats?:     string[]
  fClientes?:    string[]
  fFormatos?:    string[]
  fAnos?:        string[]
  fMeses?:       string[]
  fCadenas?:     string[]
  fTipoNegocio?: string[]
  fProveedores?: string[]
}

function readStored(userId: string | null): StoredFilters {
  if (!userId) return {}
  const raw = readScopedFor(STORAGE_KEY, userId)
  if (!raw) return {}
  try { return JSON.parse(raw) as StoredFilters } catch { return {} }
}

export interface MesOpt {
  value: string
  label: string
  disabled: boolean
}

interface FiltersCtx {
  // Active filter state
  fPaises:       string[]
  fCats:         string[]
  fSubcats:      string[]
  fClientes:     string[]
  fFormatos:     string[]
  fAnos:         string[]
  fMeses:        string[]
  fCadenas:      string[]
  fTipoNegocio:  string[]
  fProveedores:  string[]

  // Available options (cascaded)
  anosOpts:      number[]
  paisesOpts:    string[]
  catsOpts:      string[]
  subcatsOpts:   string[]
  clientesOpts:  string[]
  formatosOpts:  string[]
  mesOpts:       MesOpt[]
  periodos:      { ano: number; mes: number }[]

  // Loading states
  loadingCats:      boolean
  loadingSubcats:   boolean
  loadingClientes:  boolean
  loadingFormatos:  boolean

  // Current date
  curAno: number
  curMes: number

  // Setters — aceptan valor directo o callback (React SetStateAction)
  setPaises:       Dispatch<SetStateAction<string[]>>
  setCats:         Dispatch<SetStateAction<string[]>>
  setSubcats:      Dispatch<SetStateAction<string[]>>
  setClientes:     Dispatch<SetStateAction<string[]>>
  setFormatos:     Dispatch<SetStateAction<string[]>>
  setAnos:         Dispatch<SetStateAction<string[]>>
  setMeses:        Dispatch<SetStateAction<string[]>>
  setCadenas:      Dispatch<SetStateAction<string[]>>
  setTipoNegocio:  Dispatch<SetStateAction<string[]>>
  setProveedores:  Dispatch<SetStateAction<string[]>>
  limpiar:         () => void

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

  const userId = useUserId()
  const prevUserId = useRef<string | null | undefined>(undefined)

  const [fPaises,       setFPaises]       = useState<string[]>([])
  const [fCats,         setFCats]         = useState<string[]>([])
  const [fSubcats,      setFSubcats]      = useState<string[]>([])
  const [fClientes,     setFClientes]     = useState<string[]>([])
  const [fFormatos,     setFFormatos]     = useState<string[]>([])
  const [fAnos,         setFAnos]         = useState<string[]>([])
  const [fMeses,        setFMeses]        = useState<string[]>([])
  const [fCadenas,      setFCadenas]      = useState<string[]>([])
  const [fTipoNegocio,  setFTipoNegocio]  = useState<string[]>([])
  const [fProveedores,  setFProveedores]  = useState<string[]>([])

  const [anosOpts,      setAnosOpts]      = useState<number[]>([])
  const [catsOpts,      setCatsOpts]      = useState<string[]>(BASE_CATS)
  const [subcatsOpts,   setSubcatsOpts]   = useState<string[]>([])
  const [clientesOpts,  setClientesOpts]  = useState<string[]>([])
  const [formatosOpts,  setFormatosOpts]  = useState<string[]>([])
  const [periodos,      setPeriodos]      = useState<{ ano: number; mes: number }[]>([])

  const [loadingCats,      setLoadingCats]      = useState(false)
  const [loadingSubcats,   setLoadingSubcats]   = useState(false)
  const [loadingClientes,  setLoadingClientes]  = useState(false)
  const [loadingFormatos,  setLoadingFormatos]  = useState(false)

  const initDone = useRef(false)
  // Bloquea la persistencia mientras se rehidrata para no pisar el namespace
  // recién leído con los defaults transitorios del render post-userId-change.
  const hydrating = useRef(false)

  // ── Rehidratar cuando cambia el userId (login, logout, USER_UPDATED) ────
  // Se dispara también en el mount inicial una vez que el userId se resuelve.
  useEffect(() => {
    if (prevUserId.current === userId) return
    prevUserId.current = userId
    hydrating.current = true

    if (!userId) {
      // Logout — resetear estado in-memory a defaults. El storage del user
      // anterior queda intacto en localStorage para cuando vuelva a entrar.
      setFPaises([])
      setFCats([])
      setFSubcats([])
      setFClientes([])
      setFFormatos([])
      setFAnos([])
      setFMeses([])
      setFCadenas([])
      setFTipoNegocio([])
      setFProveedores([])
    } else {
      const saved = readStored(userId)
      setFPaises(saved.fPaises           ?? [])
      setFCats(saved.fCats               ?? [])
      setFSubcats(saved.fSubcats         ?? [])
      setFClientes(saved.fClientes       ?? [])
      setFFormatos(saved.fFormatos       ?? [])
      setFAnos(saved.fAnos               ?? [])
      setFMeses(saved.fMeses             ?? [])
      setFCadenas(saved.fCadenas         ?? [])
      setFTipoNegocio(saved.fTipoNegocio ?? [])
      setFProveedores(saved.fProveedores ?? [])
    }

    // Liberá el lock en el siguiente tick — para entonces los setters ya
    // aplicaron y el effect de persistencia puede escribir sin pisar nada.
    const t = setTimeout(() => { hydrating.current = false }, 0)
    return () => clearTimeout(t)
  }, [userId])

  // ── Persistencia scoped por usuario ────────────────────────────────────
  useEffect(() => {
    if (hydrating.current) return
    if (!userId) return
    const payload: StoredFilters = {
      fPaises, fCats, fSubcats, fClientes, fFormatos, fAnos, fMeses,
      fCadenas, fTipoNegocio, fProveedores,
    }
    writeScopedFor(STORAGE_KEY, userId, JSON.stringify(payload))
  }, [
    userId,
    fPaises, fCats, fSubcats, fClientes, fFormatos, fAnos, fMeses,
    fCadenas, fTipoNegocio, fProveedores,
  ])

  // ── Debounced filter values (300 ms) to avoid waterfall on rapid changes ──
  const dPaises   = useDebounce(fPaises,   300)
  const dCats     = useDebounce(fCats,     300)
  const dSubcats  = useDebounce(fSubcats,  300)
  const dClientes = useDebounce(fClientes, 300)

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
  }, [])

  // ── Cascade: países → categorías ──────────────────────────────────────────
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

  useEffect(() => { fetchCats(dPaises) }, [dPaises, fetchCats])

  // ── Cascade: países + categorías → subcategorías (lazy) ───────────────────
  const fetchSubcats = useCallback((paises: string[], cats: string[]) => {
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

  useEffect(() => { fetchSubcats(dPaises, dCats) }, [dPaises, dCats, fetchSubcats])

  // ── Cascade: países + cats + subcats → clientes (lazy) ────────────────────
  const fetchClientes = useCallback((paises: string[], cats: string[], subcats: string[]) => {
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

  useEffect(() => { fetchClientes(dPaises, dCats, dSubcats) }, [dPaises, dCats, dSubcats, fetchClientes])

  // ── Cascade: países + clientes → formatos ─────────────────────────────────
  const fetchFormatos = useCallback((paises: string[], clientes: string[]) => {
    if (!paises.length && !clientes.length) { setFormatosOpts([]); setFFormatos([]); return }
    setLoadingFormatos(true)
    const q = new URLSearchParams({ dim: 'formato' })
    if (paises.length)   q.set('paises',   paises.join(','))
    if (clientes.length) q.set('clientes', clientes.join(','))
    fetch(`/api/ventas/dimension?${q}`)
      .then(r => r.json())
      .then(d => {
        const opts = (d.rows || []).map((r: any) => r.nombre).filter(Boolean).sort()
        setFormatosOpts(opts)
        setFFormatos(prev => prev.filter(f => opts.includes(f)))
      })
      .catch(console.error)
      .finally(() => setLoadingFormatos(false))
  }, [])

  useEffect(() => { fetchFormatos(dPaises, dClientes) }, [dPaises, dClientes, fetchFormatos])

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
    setFFormatos([])
    setFAnos([])
    setFMeses([])
    setFCadenas([])
    setFTipoNegocio([])
    setFProveedores([])
    removeScopedFor(STORAGE_KEY, userId)
  }

  const hayFiltros =
    fPaises.length > 0 || fCats.length > 0 || fSubcats.length > 0 ||
    fClientes.length > 0 || fFormatos.length > 0 || fAnos.length > 0 ||
    fMeses.length > 0 || fCadenas.length > 0 || fTipoNegocio.length > 0 ||
    fProveedores.length > 0

  const buildParams = useCallback((extra: Record<string, string> = {}): URLSearchParams => {
    const p = new URLSearchParams(extra)
    if (fPaises.length)       p.set('paises',        fPaises.join(','))
    if (fCats.length)         p.set('categorias',     fCats.join(','))
    if (fSubcats.length)      p.set('subcategorias',  fSubcats.join(','))
    if (fClientes.length)     p.set('clientes',       fClientes.join(','))
    if (fFormatos.length)     p.set('formatos',       fFormatos.join(','))
    if (fAnos.length)         p.set('anos',           fAnos.join(','))
    if (fMeses.length)        p.set('meses',          fMeses.join(','))
    if (fCadenas.length)      p.set('cadenas',        fCadenas.join(','))
    if (fTipoNegocio.length)  p.set('tipo_negocio',   fTipoNegocio.join(','))
    if (fProveedores.length)  p.set('proveedores',    fProveedores.join(','))
    return p
  }, [fPaises, fCats, fSubcats, fClientes, fFormatos, fAnos, fMeses,
      fCadenas, fTipoNegocio, fProveedores])

  return (
    <Ctx.Provider value={{
      fPaises, fCats, fSubcats, fClientes, fFormatos, fAnos, fMeses,
      fCadenas, fTipoNegocio, fProveedores,
      anosOpts, paisesOpts: PAISES_OPTS,
      catsOpts, subcatsOpts, clientesOpts, formatosOpts,
      mesOpts, periodos,
      loadingCats, loadingSubcats, loadingClientes, loadingFormatos,
      curAno, curMes,
      setPaises:      setFPaises,
      setCats:        setFCats,
      setSubcats:     setFSubcats,
      setClientes:    setFClientes,
      setFormatos:    setFFormatos,
      setAnos:        setFAnos,
      setMeses:       setFMeses,
      setCadenas:     setFCadenas,
      setTipoNegocio: setFTipoNegocio,
      setProveedores: setFProveedores,
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
