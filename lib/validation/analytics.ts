import { z } from 'zod'

// Shared schema for all /api/analytics/* routes.
// Global multi-select filters (from DashboardFilters context) + cross-filter params.
export const AnalyticsQuerySchema = z.object({
  // Global filters — comma-separated
  anos:        z.string().max(40).optional(),   // "2025,2026"
  meses:       z.string().max(40).optional(),   // "1,2,12"
  paises:      z.string().max(80).optional(),   // "CO,GT,SV"
  categorias:  z.string().max(200).optional(),  // "QUESOS,HELADOS"

  // Cross-filter — single value set by donut click
  categoria:   z.string().max(100).optional(),
  pais:        z.string().max(10).optional(),
  subcategoria:z.string().max(100).optional(),
  cliente:     z.string().max(200).optional(),
})

export type AnalyticsQuery = z.infer<typeof AnalyticsQuerySchema>

// Build a safe WHERE clause + values array from parsed query params.
// Returns { where: string, vals: unknown[], nextIdx: number }
export function buildAnalyticsWhere(q: AnalyticsQuery, restrictedPaises?: string[]) {
  const conds: string[] = ['dia > 0']
  const vals:  unknown[] = []
  let   idx = 1

  const push = (cond: string, val: unknown) => {
    vals.push(val)
    conds.push(cond.replace('?', `$${idx++}`))
  }

  // Year(s)
  const anosArr = q.anos
    ? q.anos.split(',').map(Number).filter(n => n > 2000 && n < 2100)
    : []
  if (anosArr.length === 1) push('ano = ?', anosArr[0])
  else if (anosArr.length > 1) {
    vals.push(anosArr)
    conds.push(`ano = ANY($${idx++})`)
  }

  // Month(s)
  const mesesArr = q.meses
    ? q.meses.split(',').map(Number).filter(n => n >= 1 && n <= 12)
    : []
  if (mesesArr.length === 1) push('mes = ?', mesesArr[0])
  else if (mesesArr.length > 1) {
    vals.push(mesesArr)
    conds.push(`mes = ANY($${idx++})`)
  }

  // Country — intersect with user restrictions if applicable
  let paisesArr = q.paises
    ? q.paises.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
    : []
  if (restrictedPaises && restrictedPaises.length > 0) {
    paisesArr = paisesArr.length > 0
      ? paisesArr.filter(p => restrictedPaises.includes(p))
      : restrictedPaises
  }
  if (paisesArr.length === 1) push('pais = ?', paisesArr[0])
  else if (paisesArr.length > 1) {
    vals.push(paisesArr)
    conds.push(`pais = ANY($${idx++})`)
  }

  // Categories
  const catsArr = q.categorias
    ? q.categorias.split(',').map(s => s.trim()).filter(Boolean)
    : []
  if (catsArr.length === 1) push('UPPER(categoria) = UPPER(?)', catsArr[0])
  else if (catsArr.length > 1) {
    vals.push(catsArr.map(c => c.toUpperCase()))
    conds.push(`UPPER(categoria) = ANY($${idx++})`)
  }

  // Cross-filters (single value from donut click)
  if (q.categoria)    push('UPPER(categoria) = UPPER(?)',    q.categoria)
  if (q.pais)         push('pais = ?',                       q.pais.toUpperCase())
  if (q.subcategoria) push('UPPER(subcategoria) = UPPER(?)', q.subcategoria)
  if (q.cliente)      push('LOWER(cliente) LIKE LOWER(?)',   `%${q.cliente}%`)

  return {
    where:   conds.join(' AND '),
    vals,
    nextIdx: idx,
  }
}
