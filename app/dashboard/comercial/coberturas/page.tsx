'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { RotateCcw, RefreshCw } from 'lucide-react'
import BarChartPro from '@/components/dashboard/BarChartPro'
import MultiSelect from '@/components/dashboard/MultiSelect'
import { KpiCard, SectionHeader } from '@/components/ui'
import { fmtNum, COUNTRY_FLAGS } from '@/utils/helpers'

interface SkuRow {
  pais:     string
  barcode:  string
  desc:     string
  cat:      string
  subcat:   string
  qty:      number
  n_pdvs:   number
  noStock?: boolean
}

interface Kpi {
  totalQty:    number
  totalPdvs:   number
  totalSkus:   number
  totalPaises: number
}

export default function CoberturasPage() {
  // ── Filtros ──────────────────────────────────────────────────────────────
  const [fPaises,   setFPaises]   = useState<string[]>([])
  const [fCats,     setFCats]     = useState<string[]>([])
  const [fSubcats,  setFSubcats]  = useState<string[]>([])

  // ── Opciones (retornadas por la API, ya en cascada por país/cat) ──────────
  const [paisOpts,   setPaisOpts]   = useState<string[]>([])
  const [catOpts,    setCatOpts]    = useState<string[]>([])
  const [subcatOpts, setSubcatOpts] = useState<string[]>([])

  // ── Datos ─────────────────────────────────────────────────────────────────
  const [skus,       setSkus]       = useState<SkuRow[]>([])
  const [kpi,        setKpi]        = useState<Kpi | null>(null)
  const [pdvsByPais, setPdvsByPais] = useState<Record<string, number>>({})
  const [loading,    setLoading]    = useState(true)

  // ── Fetch (reutiliza el endpoint DOH) ─────────────────────────────────────
  const fetchData = useCallback((paises: string[], cats: string[]) => {
    setLoading(true)
    const p = new URLSearchParams()
    if (paises.length) p.set('paises',     paises.join(','))
    if (cats.length)   p.set('categorias', cats.join(','))

    fetch('/api/inventario/doh?' + p)
      .then(r => r.json())
      .then(j => {
        if (j.error) { console.error(j.error); return }
        setKpi(j.kpi)
        if (j.pdvsByPais) setPdvsByPais(j.pdvsByPais)
        setSkus((j.skus || []).map((s: any) => ({
          pais:    s.pais    || '',
          barcode: s.barcode || s.sku || '',
          desc:    s.desc    || '',
          cat:     s.cat     || '',
          subcat:  s.subcat  || '',
          qty:     s.qty     || 0,
          n_pdvs:  s.n_pdvs  || 0,
          noStock: s.noStock || false,
        })))

        // Actualizar opciones de filtro desde la respuesta API
        if (j.paisOpts)   setPaisOpts(j.paisOpts)
        if (j.catOpts)    setCatOpts(j.catOpts)
        if (j.subcatOpts) setSubcatOpts(j.subcatOpts)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchData([], []) }, [fetchData])

  // ── Cascade handlers ──────────────────────────────────────────────────────
  const onPaises = (v: string[]) => {
    setFPaises(v); setFCats([]); setFSubcats([])
    fetchData(v, [])
  }
  const onCats = (v: string[]) => {
    setFCats(v); setFSubcats([])
    fetchData(fPaises, v)
  }
  const onSubcats = (v: string[]) => { setFSubcats(v) }  // client-side only

  const limpiar = () => {
    setFPaises([]); setFCats([]); setFSubcats([])
    fetchData([], [])
  }
  const hayFiltros = fPaises.length > 0 || fCats.length > 0 || fSubcats.length > 0

  // ── Filtro de subcategoría en cliente (dataset es pequeño) ────────────────
  const filtered = useMemo(() => {
    if (!fSubcats.length) return skus
    return skus.filter(r => fSubcats.includes(r.subcat))
  }, [skus, fSubcats])

  // ── Opciones de subcategoría dependen de los datos ya filtrados por país+cat
  const subcatOptsFiltered = useMemo(
    () => [...new Set(skus.map(r => r.subcat).filter(Boolean))].sort(),
    [skus]
  )

  // ── Métricas de cobertura ─────────────────────────────────────────────────
  const totalPdvs = kpi?.totalPdvs || 0

  const withCob = useMemo(() =>
    filtered
      .filter(r => !r.noStock)
      .map(r => {
        // Usar PDVs del país del producto; si no hay filtro activo, usar el total global
        const paisPdvs = (r.pais && pdvsByPais[r.pais]) ? pdvsByPais[r.pais] : totalPdvs
        return {
          ...r,
          cobertura:     r.n_pdvs > 0 ? Math.round(r.qty / r.n_pdvs) : 0,
          pct_presencia: paisPdvs > 0 ? Math.round((r.n_pdvs / paisPdvs) * 100) : 0,
          pdvs_pais:     paisPdvs,
        }
      })
      .sort((a, b) => b.qty - a.qty),
  [filtered, totalPdvs, pdvsByPais])

  const avgCob       = withCob.length > 0 ? withCob.reduce((s, r) => s + r.cobertura,     0) / withCob.length : 0
  const avgPresencia = withCob.length > 0 ? withCob.reduce((s, r) => s + r.pct_presencia, 0) / withCob.length : 0

  return (
    <div className="space-y-5 animate-fade-up">

      {/* ── Filtros jerárquicos ──────────────────────────────────────────────── */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[9px] tracking-[2px] uppercase font-semibold" style={{ color: 'var(--t3)' }}>Filtros</p>
          <div className="flex items-center gap-3">
            {hayFiltros && (
              <button onClick={limpiar} className="flex items-center gap-1.5 text-[10px] hover:opacity-70 transition-opacity" style={{ color: 'var(--t3)' }}>
                <RotateCcw size={10} /> Limpiar todo
              </button>
            )}
            <button onClick={() => fetchData(fPaises, fCats)} className="flex items-center gap-1.5 text-[10px] hover:opacity-70 transition-opacity" style={{ color: 'var(--t3)' }}>
              <RefreshCw size={10} className={loading ? 'animate-spin' : ''} /> Actualizar
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <MultiSelect
            label="País"
            options={paisOpts.map(p => ({ value: p, label: p }))}
            value={fPaises}
            onChange={onPaises}
            placeholder="Todos los países"
            selectAllLabel="Todos los países"
          />
          <MultiSelect
            label="Categoría"
            options={catOpts.map(c => ({ value: c, label: c }))}
            value={fCats}
            onChange={onCats}
            placeholder={fPaises.length ? 'Todas las categorías' : 'Selecciona país'}
            selectAllLabel="Todas las categorías"
          />
          <MultiSelect
            label="Subcategoría"
            options={(subcatOpts.length ? subcatOpts : subcatOptsFiltered).map(s => ({ value: s, label: s }))}
            value={fSubcats}
            onChange={onSubcats}
            placeholder={fCats.length ? 'Todas las subcategorías' : 'Selecciona categoría'}
            selectAllLabel="Todas las subcategorías"
          />
        </div>
      </div>

      {/* ── KPIs asimétricos — refleja las columnas del Detalle Coberturas ── */}
      <div className="grid grid-cols-4 gap-3">
        {/* Card grande: Cobertura/PDV promedio (métrica principal de la tabla) */}
        <div className="col-span-2 card p-5 flex flex-col justify-between" style={{ borderLeft: '3px solid #c8873a' }}>
          <p className="text-[9px] tracking-[2px] uppercase font-semibold mb-1" style={{ color: 'var(--t3)' }}>Cobertura / PDV Promedio</p>
          <p className="text-4xl font-black" style={{ color: '#c8873a' }}>
            {loading ? '…' : fmtNum(Math.round(avgCob)) + ' uds'}
          </p>
          <p className="text-[10px] mt-2" style={{ color: 'var(--t3)' }}>
            Inventario Total ÷ PDVs Activos · {loading ? '…' : withCob.length} SKUs
          </p>
          {/* Mini barras top-3 */}
          {!loading && withCob.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {withCob.slice(0, 3).map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[9px] w-28 truncate" style={{ color: 'var(--t2)' }}>{r.desc}</span>
                  <div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--border)' }}>
                    <div className="h-full rounded-full" style={{ width: Math.min((r.cobertura / (withCob[0]?.cobertura || 1)) * 100, 100) + '%', background: '#c8873a' }} />
                  </div>
                  <span className="text-[9px] font-bold w-12 text-right" style={{ color: '#c8873a' }}>{fmtNum(r.cobertura)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Presencia % — columna del detalle */}
        <div className="card p-5 flex flex-col justify-between" style={{ borderLeft: '3px solid #2a7a58' }}>
          <p className="text-[9px] tracking-[2px] uppercase font-semibold mb-1" style={{ color: 'var(--t3)' }}>Presencia Promedio</p>
          <p className="text-3xl font-black" style={{ color: '#2a7a58' }}>
            {loading ? '…' : avgPresencia.toFixed(0) + '%'}
          </p>
          <p className="text-[10px] mt-1" style={{ color: 'var(--t3)' }}>PDVs Activos / Total</p>
          <div className="mt-2 h-1.5 rounded-full" style={{ background: 'var(--border)' }}>
            <div className="h-full rounded-full transition-all" style={{ width: avgPresencia + '%', background: '#2a7a58' }} />
          </div>
        </div>

        {/* PDVs y SKUs — columnas del detalle */}
        <div className="card p-5 flex flex-col gap-3 justify-between">
          <div>
            <p className="text-[9px] tracking-[2px] uppercase font-semibold mb-0.5" style={{ color: 'var(--t3)' }}>PDVs Total</p>
            <p className="text-2xl font-black" style={{ color: '#3a6fa8' }}>{loading ? '…' : fmtNum(totalPdvs)}</p>
            <p className="text-[10px]" style={{ color: 'var(--t3)' }}>puntos de venta únicos</p>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
            <p className="text-[9px] tracking-[2px] uppercase font-semibold mb-0.5" style={{ color: 'var(--t3)' }}>Productos</p>
            <p className="text-2xl font-black" style={{ color: '#6b4fa8' }}>{loading ? '…' : withCob.length}</p>
            <p className="text-[10px]" style={{ color: 'var(--t3)' }}>SKUs con inventario</p>
          </div>
        </div>
      </div>

      {/* ── Gráfico ─────────────────────────────────────────────────────────── */}
      <div className="card p-5">
        <SectionHeader title="Cobertura por Producto" sub="Unidades de inventario por punto de venta activo" />
        {loading ? (
          <div className="h-60 flex items-center justify-center text-[11px]" style={{ color: 'var(--t3)' }}>Cargando…</div>
        ) : (
          <BarChartPro
            data={withCob.slice(0, 20).map(r => ({ name: r.desc.substring(0, 18), cob: r.cobertura }))}
            dataKey="cob"
            nameKey="name"
            colors="#c8873a"
            height={240}
            xAngle={-25}
            showLabels
            labelFmt={(v: number) => fmtNum(v)}
            formatter={(v: number) => fmtNum(v) + ' uds'}
            tooltipUnit="Cobertura/PDV"
            margin={{ top: 8, right: 16, left: 0, bottom: 40 }}
          />
        )}
      </div>

      {/* ── Tabla ───────────────────────────────────────────────────────────── */}
      <div className="card p-5">
        <SectionHeader title="Detalle Coberturas" sub="Fórmula: Inventario Total ÷ PDVs Activos" />
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {[
                  { label: 'País',           align: 'left'  },
                  { label: 'Cód. Barras',    align: 'left'  },
                  { label: 'Descripción',    align: 'left'  },
                  { label: 'Categoría',      align: 'left'  },
                  { label: 'Subcategoría',   align: 'left'  },
                  { label: 'Inventario',     align: 'right' },
                  { label: 'PDVs Activos',   align: 'right' },
                  { label: 'PDVs Total',     align: 'right' },
                  { label: 'Presencia %',    align: 'right' },
                  { label: 'Cobertura/PDV',  align: 'right' },
                ].map(({ label, align }) => (
                  <th key={label} className={`text-${align} pb-2 pr-4 text-[9px] tracking-[1px] uppercase whitespace-nowrap`} style={{ color: 'var(--t3)' }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="py-8 text-center text-[11px]" style={{ color: 'var(--t3)' }}>Cargando…</td></tr>
              ) : withCob.length === 0 ? (
                <tr><td colSpan={10} className="py-8 text-center text-[11px]" style={{ color: 'var(--t3)' }}>Sin datos con los filtros actuales</td></tr>
              ) : withCob.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="py-2 pr-4" style={{ color: 'var(--t2)' }}>
                    {r.pais ? <>{COUNTRY_FLAGS[r.pais] ?? ''} {r.pais}</> : '—'}
                  </td>
                  <td className="py-2 pr-4 font-mono text-[10px]" style={{ color: 'var(--t2)' }}>{r.barcode || '—'}</td>
                  <td className="py-2 pr-4 font-medium" style={{ color: 'var(--t1)' }}>{r.desc}</td>
                  <td className="py-2 pr-4" style={{ color: 'var(--t2)' }}>{r.cat}</td>
                  <td className="py-2 pr-4" style={{ color: 'var(--t2)' }}>{r.subcat || '—'}</td>
                  <td className="py-2 pr-4 text-right tabular-nums" style={{ color: 'var(--t2)' }}>{fmtNum(r.qty)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums" style={{ color: 'var(--t2)' }}>{r.n_pdvs}</td>
                  <td className="py-2 pr-4 text-right tabular-nums" style={{ color: 'var(--t2)' }}>{r.pdvs_pais}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    <span style={{ color: r.pct_presencia >= 80 ? '#2a7a58' : '#c8873a' }}>{r.pct_presencia}%</span>
                  </td>
                  <td className="py-2 text-right tabular-nums font-bold" style={{ color: '#c8873a' }}>{fmtNum(r.cobertura)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
