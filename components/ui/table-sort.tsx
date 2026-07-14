'use client'
import { useMemo, useState } from 'react'

export type SortDir = 'asc' | 'desc'

/**
 * Hook para tablas ordenables. Devuelve estado + rows ordenados + helpers UI.
 *
 * Uso:
 *   const { sortCol, sortDir, toggleSort, sorted, SortArrow } = useTableSort(
 *     rows,
 *     'venta',        // columna por defecto
 *     'desc',         // dirección por defecto
 *     {
 *       venta:   (a, b) => a.venta - b.venta,
 *       cliente: (a, b) => a.cliente.localeCompare(b.cliente),
 *     }
 *   )
 *
 *   <th onClick={() => toggleSort('venta')}>Venta <SortArrow col="venta"/></th>
 *   {sorted.map(...)}
 */
export function useTableSort<T, K extends string>(
  rows: T[],
  defaultCol: K,
  defaultDir: SortDir,
  comparators: Record<K, (a: T, b: T) => number>,
) {
  const [sortCol, setSortCol] = useState<K>(defaultCol)
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir)

  const toggleSort = (col: K) => {
    if (col === sortCol) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      // Al cambiar de columna, arrancar desc para números / asc para strings.
      // Heurística simple: si el default de esa col es asc, respetarlo.
      setSortDir('desc')
    }
  }

  const sorted = useMemo(() => {
    const cmp = comparators[sortCol]
    if (!cmp) return rows
    const dir = sortDir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => cmp(a, b) * dir)
  }, [rows, sortCol, sortDir, comparators])

  const SortArrow = ({ col }: { col: K }) => {
    if (sortCol !== col) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="text-amber-600 ml-1">{sortDir === 'desc' ? '↓' : '↑'}</span>
  }

  return { sortCol, sortDir, setSortCol, setSortDir, toggleSort, sorted, SortArrow }
}

/**
 * Header th sortable. Provee el look consistente (uppercase, hover, cursor)
 * y la flecha visual. Wrap el label + arrow.
 *
 * Uso:
 *   <SortableTh onClick={() => toggleSort('venta')} arrow={<SortArrow col="venta"/>}
 *     align="right">Sell-In USD</SortableTh>
 */
export function SortableTh({
  onClick, arrow, align = 'left', className = '', children,
}: {
  onClick: () => void
  arrow: React.ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
  children: React.ReactNode
}) {
  const alignCls = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return (
    <th
      onClick={onClick}
      className={`${alignCls} py-2 px-3 font-semibold cursor-pointer select-none hover:text-gray-700 ${className}`}
    >
      {children}{arrow}
    </th>
  )
}
