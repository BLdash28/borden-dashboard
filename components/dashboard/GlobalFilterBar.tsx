'use client'
import { RotateCcw, X } from 'lucide-react'
import { useDashboardFilters, MESES_LABEL } from '@/lib/context/DashboardFilters'
import MultiSelect from './MultiSelect'

export default function GlobalFilterBar() {
  const {
    fPaises, fCats, fSubcats, fClientes, fAnos, fMeses,
    anosOpts, catsOpts, subcatsOpts, clientesOpts, paisesOpts, mesOpts,
    loadingCats, loadingSubcats, loadingClientes,
    setPaises, setCats, setSubcats, setClientes, setAnos, setMeses,
    limpiar, hayFiltros,
  } = useDashboardFilters()

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[9px] tracking-[2px] uppercase font-semibold" style={{ color: 'var(--t3)' }}>
          Filtros
        </p>
        {hayFiltros && (
          <button
            onClick={limpiar}
            className="flex items-center gap-1.5 text-[10px] hover:opacity-70 transition-opacity"
            style={{ color: 'var(--t3)' }}
          >
            <RotateCcw size={10} /> Limpiar todo
          </button>
        )}
      </div>

      {/* Fila 1: Período */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
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

      {/* Fila 2: Producto / Cliente (cascade desde fila 1) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
      </div>

      {/* Active filter chips */}
      {hayFiltros && (
        <div
          className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t"
          style={{ borderColor: 'var(--border)' }}
        >
          {fAnos.map(a => (
            <Chip key={'a' + a} label={a} onRemove={() => setAnos(fAnos.filter(x => x !== a))} />
          ))}
          {fMeses.map(m => (
            <Chip
              key={'m' + m}
              label={MESES_LABEL[Number(m)] || m}
              onRemove={() => setMeses(fMeses.filter(x => x !== m))}
            />
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
        </div>
      )}
    </div>
  )
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full"
      style={{ background: '#c8873a20', color: '#c8873a', border: '1px solid #c8873a35' }}
    >
      {label}
      <button onClick={onRemove} className="hover:opacity-70 ml-0.5 flex-shrink-0">
        <X size={9} />
      </button>
    </span>
  )
}
