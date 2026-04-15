'use client'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, X, Check } from 'lucide-react'

interface Props {
  label: string
  options: { value: string; label?: string }[]
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  className?: string
}

export default function FiltroMulti({
  label, options, value, onChange,
  placeholder = 'Todos',
  className = 'flex-1 min-w-[130px]',
}: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v])

  const display =
    value.length === 0 ? placeholder
    : value.length <= 2 ? value.join(', ')
    : `${value.length} seleccionados`

  return (
    <div className={`relative ${className}`} ref={ref}>
      {label && <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">{label}</p>}
      <button
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center justify-between border rounded-lg px-3 py-1.5 text-sm bg-white transition-colors focus:outline-none ${open ? 'border-amber-400 ring-2 ring-amber-400/20' : 'border-gray-200 hover:border-gray-300'} ${value.length > 0 ? 'text-gray-700' : 'text-gray-400'}`}>
        <span className="truncate text-left">{display}</span>
        <ChevronDown size={12} className={`flex-shrink-0 ml-1 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
          style={{ minWidth: '100%', maxHeight: '260px', overflowY: 'auto' }}>
          {/* Todos */}
          <div onClick={() => onChange([])}
            className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-amber-50 border-b border-gray-100">
            <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${value.length === 0 ? 'bg-amber-500 border-amber-500' : 'border-gray-300'}`}>
              {value.length === 0 && <Check size={9} strokeWidth={3} color="white" />}
            </div>
            <span className={value.length === 0 ? 'text-amber-600 font-medium' : 'text-gray-500'}>{placeholder}</span>
          </div>
          {options.map(o => {
            const sel = value.includes(o.value)
            return (
              <div key={o.value} onClick={() => toggle(o.value)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-amber-50">
                <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${sel ? 'bg-amber-500 border-amber-500' : 'border-gray-300'}`}>
                  {sel && <Check size={9} strokeWidth={3} color="white" />}
                </div>
                <span className={sel ? 'text-gray-800 font-medium' : 'text-gray-600'}>{o.label ?? o.value}</span>
              </div>
            )
          })}
          {value.length > 0 && (
            <div onClick={() => onChange([])}
              className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-400 cursor-pointer hover:bg-gray-50 border-t border-gray-100">
              <X size={10} /> Limpiar selección
            </div>
          )}
        </div>
      )}
    </div>
  )
}
