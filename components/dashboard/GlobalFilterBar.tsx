'use client'
import { useState } from 'react'
import { RotateCcw, X, SlidersHorizontal, ChevronDown } from 'lucide-react'
import { useDashboardFilters, MESES_LABEL } from '@/lib/context/DashboardFilters'
import MultiSelect from './MultiSelect'

export default function GlobalFilterBar() {
  const {
    fPaises, fCats, fSubcats, fClientes, fFormatos, fAnos, fMeses,
    anosOpts, catsOpts, subcatsOpts, clientesOpts, formatosOpts, paisesOpts, mesOpts,
    loadingCats, loadingSubcats, loadingClientes, loadingFormatos,
    setPaises, setCats, setSubcats, setClientes, setFormatos, setAnos, setMeses,
    limpiar, hayFiltros,
  } = useDashboardFilters()

  const [open, setOpen] = useState(false)

  const activeCount =
    fAnos.length + fMeses.length + fPaises.length + fCats.length +
    fSubcats.length + fClientes.length + fFormatos.length

  return (
    <div className="card p-3 md:p-4">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2">
        {/* Mobile toggle button */}
        <button
          onClick={() => setOpen(v => !v)}
          className="lg:hidden flex items-center gap-2 text-[12px] font-medium py-2 px-3 rounded-lg transition-all active:scale-95"
          style={{
            background: hayFiltros ? '#c8873a18' : 'var(--surface-2, rgba(255,255,255,0.04))',
            color: hayFiltros ? '#c8873a' : 'var(--t2)',
            border: `1px solid ${hayFiltros ? '#c8873a35' : 'var(--border)'}`,
          }}
          aria-expanded={open}
        >
          <SlidersHorizontal size={14} />
          Filtros
          {activeCount > 0 && (
            <span
              className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold"
              style={{ background: '#c8873a', color: '#fff' }}
            >
              {activeCount}
            </span>
          )}
          <ChevronDown
            size={13}
            className="ml-auto transition-transform duration-200"
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          />
        </button>

        {/* Desktop label */}
        <p className="hidden lg:block text-[9px] tracking-[2px] uppercase font-semibold" style={{ color: 'var(--t3)' }}>
          Filtros
        </p>

        {hayFiltros && (
          <button
            onClick={limpiar}
            className="flex items-center gap-1.5 text-[11px] hover:opacity-70 transition-opacity py-1.5 px-2 rounded-lg active:scale-95"
            style={{ color: 'var(--t3)' }}
          >
            <RotateCcw size={11} />
            <span className="hidden sm:inline">Limpiar todo</span>
            <span className="sm:hidden">Limpiar</span>
          </button>
        )}
      </div>

      {/* ── Filter inputs — always visible on desktop, collapsible on mobile ── */}
      <div className={`${open ? 'block' : 'hidden'} lg:block mt-3`}>
        {/* Fila 1: Período + País + Categoría */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3 mb-2 md:mb-3">
          <MultiSelect
            label="Año"
            options={anosOpts.map(a => ({ value: String(a), label: String(a) }))}
            value={fAnos}
            onChange={setAnos}
            placeholder="Todos los años"
          />
          <MultiSelect
            label="Mes"
            options={mesOpts}
            value={fMeses}
            onChange={setMeses}
            placeholder="Todos los meses"
          />
          <MultiSelect
            label="País"
            options={paisesOpts.map(p => ({ value: p, label: p }))}
            value={fPaises}
            onChange={setPaises}
            placeholder="Todos los países"
            selectAllLabel="Todos los países"
          />
          <MultiSelect
            label={loadingCats ? 'Categoría…' : 'Categoría'}
            options={catsOpts.map(c => ({ value: c, label: c }))}
            value={fCats}
            onChange={setCats}
            placeholder="Todas las categorías"
            selectAllLabel="Todas las categorías"
          />
        </div>

        {/* Fila 2: Subcategoría + Cliente + Formato */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
          <MultiSelect
            label={loadingSubcats ? 'Subcategoría…' : 'Subcategoría'}
            options={subcatsOpts.map(s => ({ value: s, label: s }))}
            value={fSubcats}
            onChange={setSubcats}
            placeholder={fCats.length ? 'Todas las subcategorías' : 'Selecciona categoría'}
            selectAllLabel="Todas las subcategorías"
          />
          <MultiSelect
            label={loadingClientes ? 'Cliente…' : 'Cliente'}
            options={clientesOpts.map(c => ({ value: c, label: c }))}
            value={fClientes}
            onChange={setClientes}
            placeholder="Todos los clientes"
            selectAllLabel="Todos los clientes"
          />
          <MultiSelect
            label={loadingFormatos ? 'Formato…' : 'Formato'}
            options={formatosOpts.map(f => ({ value: f, label: f }))}
            value={fFormatos}
            onChange={setFormatos}
            placeholder={(fPaises.length || fClientes.length) ? 'Todos los formatos' : 'Selecciona país/cliente'}
            selectAllLabel="Todos los formatos"
          />
        </div>
      </div>

      {/* ── Active chips — always visible ──────────────────────────── */}
      {hayFiltros && (
        <div
          className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t"
          style={{ borderColor: 'var(--border)' }}
        >
          {fAnos.map(a => (
            <Chip key={'a' + a} label={a} onRemove={() => setAnos(fAnos.filter(x => x !== a))} />
          ))}
          {fMeses.map(m => (
            <Chip key={'m' + m} label={MESES_LABEL[Number(m)] || m} onRemove={() => setMeses(fMeses.filter(x => x !== m))} />
          ))}
          {fPaises.map(p => (
            <Chip key={'p' + p} label={p} onRemove={() => setPaises(fPaises.filter(x => x !== p))} />
          ))}
          {fCats.map(c => (
            <Chip key={'c' + c} label={c} onRemove={() => setCats(fCats.filter(x => x !== c))} />
          ))}
          {fSubcats.map(s => (
            <Chip key={'s' + s} label={s} onRemove={() => setSubcats(fSubcats.filter(x => x !== s))} />
          ))}
          {fClientes.map(c => (
            <Chip key={'cl' + c} label={c} onRemove={() => setClientes(fClientes.filter(x => x !== c))} />
          ))}
          {fFormatos.map(f => (
            <Chip key={'f' + f} label={f} onRemove={() => setFormatos(fFormatos.filter(x => x !== f))} />
          ))}
        </div>
      )}
    </div>
  )
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full"
      style={{ background: '#c8873a20', color: '#c8873a', border: '1px solid #c8873a35' }}
    >
      {label}
      <button
        onClick={onRemove}
        className="hover:opacity-70 ml-0.5 flex-shrink-0 p-0.5"
        aria-label={`Quitar filtro ${label}`}
      >
        <X size={10} />
      </button>
    </span>
  )
}
