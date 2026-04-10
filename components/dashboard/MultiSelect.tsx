'use client'
import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface Props {
  label: string
  options: SelectOption[]
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  disabledOpts?: string[]
  /** When provided, adds a "Todos/Todas" row that clears the selection */
  selectAllLabel?: string
}

export default function MultiSelect({
  label, options, value, onChange,
  placeholder = 'Todos',
  disabledOpts = [],
  selectAllLabel,
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

  const isDisabled = (v: string) => disabledOpts.includes(v)

  const toggle = (v: string) => {
    if (isDisabled(v)) return
    onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v])
  }

  const selectAll = () => {
    if (value.length > 0) {
      onChange([])
    } else {
      onChange(options.filter(o => !o.disabled && !isDisabled(o.value)).map(o => o.value))
    }
  }

  const displayLabel =
    value.length === 0 ? placeholder
    : value.length <= 2 ? value.join(', ')
    : `${value.length} seleccionados`

  const allSelected = value.length === options.filter(o => !o.disabled && !isDisabled(o.value)).length

  return (
    <div className="relative" ref={ref}>
      <div className="text-[10px] uppercase tracking-widest font-medium mb-1.5" style={{ color: 'var(--t3)' }}>
        {label}
      </div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-[12px] border transition-all"
        style={{
          background: 'var(--bg)',
          borderColor: open ? 'var(--acc)' : 'var(--border)',
          color: value.length > 0 ? 'var(--t1)' : 'var(--t3)',
        }}
      >
        <span className="truncate">{displayLabel}</span>
        <ChevronDown
          size={12}
          className={`flex-shrink-0 ml-1 transition-transform ${open ? 'rotate-180' : ''}`}
          style={{ color: 'var(--t3)' }}
        />
      </button>

      {open && (
        <div
          className="absolute z-50 top-full left-0 mt-1 w-full rounded-xl border shadow-2xl overflow-hidden"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', minWidth: 160, maxHeight: 280, overflowY: 'auto' }}
        >
          {/* Todos / select-all row */}
          {selectAllLabel && (
            <div
              onClick={selectAll}
              className="flex items-center gap-2.5 px-3 py-2 text-[12px] cursor-pointer hover:bg-white/5 border-b"
              style={{ borderColor: 'var(--border)' }}
            >
              <div
                className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border"
                style={{
                  background: value.length === 0 || allSelected ? 'var(--acc)' : 'transparent',
                  borderColor: value.length === 0 || allSelected ? 'var(--acc)' : 'var(--border)',
                }}
              >
                {(value.length === 0 || allSelected) && <Check size={9} color="#fff" />}
              </div>
              <span style={{ color: 'var(--t2)' }}>{selectAllLabel}</span>
            </div>
          )}

          {options.map(opt => {
            const disabled = opt.disabled || isDisabled(opt.value)
            const selected = value.includes(opt.value)
            return (
              <div
                key={opt.value}
                onClick={() => !disabled && toggle(opt.value)}
                className={`flex items-center gap-2.5 px-3 py-2 text-[12px] transition-colors ${disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-white/5'}`}
                style={{ opacity: disabled ? 0.35 : 1 }}
              >
                <div
                  className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border"
                  style={{
                    background: selected ? 'var(--acc)' : 'transparent',
                    borderColor: selected ? 'var(--acc)' : 'var(--border)',
                  }}
                >
                  {selected && <Check size={9} color="#fff" />}
                </div>
                <span style={{ color: disabled ? 'var(--t3)' : 'var(--t2)' }}>{opt.label}</span>
                {disabled && (
                  <span className="text-[10px] ml-auto" style={{ color: 'var(--t3)' }}>actual</span>
                )}
              </div>
            )
          })}

          {value.length > 0 && (
            <div
              onClick={() => onChange([])}
              className="flex items-center gap-2 px-3 py-2 text-[11px] cursor-pointer hover:bg-white/5 border-t"
              style={{ borderColor: 'var(--border)', color: 'var(--t3)' }}
            >
              <X size={10} /> Limpiar selección
            </div>
          )}
        </div>
      )}
    </div>
  )
}
