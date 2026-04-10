'use client'
import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { COUNTRY_FLAGS, MONTHS } from '@/utils/helpers'

interface FiltrosProps {
  filtros: any
  onChange: (key: string, value: any) => void
  onSearch?: (filtros: any) => void
}

const PAISES     = ['GT','SV','CO','CR','NI']
const CATEGORIAS = ['Quesos','Leche & Crema']
const AÑOS       = [2024, 2025, 2026]

export default function FiltrosGlobales({ filtros, onChange, onSearch }: FiltrosProps) {
  const isFirst = useRef(true)

  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return }
    onSearch?.(filtros)
  }, [filtros])

  const set = (key: string, val: any) => onChange(key, val === '' ? undefined : val)

  const hasAny = Object.values(filtros).some(v => v !== undefined && v !== '')

  const clearAll = () => {
    ['pais','categoria','ano','mes','cliente','sku','busqueda'].forEach(k => onChange(k, undefined))
  }

  const s = { background:'var(--card)', borderColor:'var(--border)', color:'var(--t1)' }
  const labelCls = "text-[9px] uppercase tracking-[1px] block mb-1"

  return (
    <div className="card p-4 mb-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[9px] tracking-[2px] uppercase font-medium" style={{color:'var(--t3)'}}>
          Filtros
        </span>
        {hasAny && (
          <button onClick={clearAll}
            className="flex items-center gap-1 text-[10px] hover:opacity-70 transition-opacity"
            style={{color:'var(--acc)'}}>
            <X size={10}/> Limpiar
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {/* País */}
        <div>
          <label className={labelCls} style={{color:'var(--t3)'}}>País</label>
          <select value={filtros.pais||''} onChange={e=>set('pais',e.target.value)}
            className="w-full px-2.5 py-1.5 text-[11px] rounded-lg border outline-none" style={s}>
            <option value="">Todos</option>
            {PAISES.map(p=><option key={p} value={p}>{COUNTRY_FLAGS[p]} {p}</option>)}
          </select>
        </div>

        {/* Categoría */}
        <div>
          <label className={labelCls} style={{color:'var(--t3)'}}>Categoría</label>
          <select value={filtros.categoria||''} onChange={e=>set('categoria',e.target.value)}
            className="w-full px-2.5 py-1.5 text-[11px] rounded-lg border outline-none" style={s}>
            <option value="">Todas</option>
            {CATEGORIAS.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Año */}
        <div>
          <label className={labelCls} style={{color:'var(--t3)'}}>Año</label>
          <select value={filtros.ano||''} onChange={e=>set('ano',e.target.value?Number(e.target.value):undefined)}
            className="w-full px-2.5 py-1.5 text-[11px] rounded-lg border outline-none" style={s}>
            <option value="">Todos</option>
            {AÑOS.map(a=><option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        {/* Mes */}
        <div>
          <label className={labelCls} style={{color:'var(--t3)'}}>Mes</label>
          <select value={filtros.mes||''} onChange={e=>set('mes',e.target.value?Number(e.target.value):undefined)}
            className="w-full px-2.5 py-1.5 text-[11px] rounded-lg border outline-none" style={s}>
            <option value="">Todos</option>
            {MONTHS.slice(1).map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
          </select>
        </div>

        {/* Cliente */}
        <div>
          <label className={labelCls} style={{color:'var(--t3)'}}>Cliente</label>
          <input value={filtros.cliente||''} onChange={e=>set('cliente',e.target.value)}
            placeholder="Todos"
            className="w-full px-2.5 py-1.5 text-[11px] rounded-lg border outline-none" style={s}/>
        </div>

        {/* SKU */}
        <div>
          <label className={labelCls} style={{color:'var(--t3)'}}>SKU / Descripción</label>
          <input value={filtros.sku||''} onChange={e=>set('sku',e.target.value)}
            placeholder="Buscar..."
            className="w-full px-2.5 py-1.5 text-[11px] rounded-lg border outline-none" style={s}/>
        </div>
      </div>

      {/* Tags filtros activos */}
      {hasAny && (
        <div className="flex flex-wrap gap-1.5 mt-3 pt-2.5 border-t" style={{borderColor:'var(--border)'}}>
          <span className="text-[9px] uppercase tracking-wide self-center mr-1" style={{color:'var(--t3)'}}>Activos:</span>
          {filtros.pais      && <Pill label={`País: ${filtros.pais}`}       onX={()=>set('pais',undefined)}/>}
          {filtros.categoria && <Pill label={`Cat: ${filtros.categoria}`}   onX={()=>set('categoria',undefined)}/>}
          {filtros.ano       && <Pill label={`Año: ${filtros.ano}`}         onX={()=>set('ano',undefined)}/>}
          {filtros.mes       && <Pill label={`Mes: ${MONTHS[filtros.mes]}`} onX={()=>set('mes',undefined)}/>}
          {filtros.cliente   && <Pill label={`Cliente: ${filtros.cliente}`} onX={()=>set('cliente',undefined)}/>}
          {filtros.sku       && <Pill label={`SKU: ${filtros.sku}`}         onX={()=>set('sku',undefined)}/>}
        </div>
      )}
    </div>
  )
}

function Pill({ label, onX }: { label: string; onX: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
      style={{background:'rgba(200,135,58,.12)',color:'#c8873a'}}>
      {label}
      <button onClick={onX} className="hover:opacity-60"><X size={9}/></button>
    </span>
  )
}
