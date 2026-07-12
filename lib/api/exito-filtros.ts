/**
 * Filtros globales del módulo Grupo Éxito CO — helpers de parsing y SQL.
 *
 * Convención URL: valores CSV en query params (ej: ?cadenas=EXITO,CARULLA).
 * Compat: soporta `cadena=EXITO` (singular) para no romper llamadas legacy.
 *
 * Uso típico en un endpoint que consulta `fact_ventas_exito`:
 *
 *   const f = parseExitoFilters(req)
 *   const { where, params, next } = buildExitoWhere(f, { alias: 'v', startAt: 1 })
 *   await pool.query(`SELECT ... FROM fact_ventas_exito v WHERE v.pais='CO' AND ${where}`, params)
 */
import type { NextRequest } from 'next/server'

export type ExitoFiltros = {
  cadenas:        string[]
  subcategorias:  string[]
  departamentos:  string[]
  ciudades:       string[]
  skus:           string[]
  /** Categoría legacy (Quesos / '' = todas) — no multi */
  categoria:      string
}

const splitCsv = (v: string | null): string[] =>
  !v ? [] : v.split(',').map(s => s.trim()).filter(Boolean)

export function parseExitoFilters(req: Request | NextRequest): ExitoFiltros {
  const url = new URL(req.url)
  const q = url.searchParams

  // Multi: preferir plural; caer al singular como compat
  const cadenas = splitCsv(q.get('cadenas') ?? q.get('cadena'))
  const subcat  = splitCsv(q.get('subcategorias') ?? q.get('subcategoria'))
  const deptos  = splitCsv(q.get('departamentos') ?? q.get('departamento'))
  const ciudad  = splitCsv(q.get('ciudades')      ?? q.get('ciudad'))
  const skus    = splitCsv(q.get('skus')          ?? q.get('sku'))

  return {
    cadenas, subcategorias: subcat, departamentos: deptos, ciudades: ciudad, skus,
    categoria: (q.get('categoria') ?? '').trim(),
  }
}

/**
 * Construye una cláusula SQL con placeholders $N para un WHERE de fact_ventas_exito.
 *
 * @param alias   Alias/prefijo de la tabla en la query (ej: 'v' o '' para no-prefijo).
 * @param startAt Índice $N inicial (para concatenar con otros params existentes).
 * @returns { where, params, next } — `where` es el fragmento a inyectar (o 'TRUE' si no hay filtros),
 *   `params` es el array a concatenar, y `next` es el próximo $N libre.
 */
export function buildExitoWhere(
  f: ExitoFiltros,
  opts: { alias?: string; startAt?: number; includeCategoria?: boolean } = {},
) {
  const a = opts.alias ? `${opts.alias}.` : ''
  let n = opts.startAt ?? 1
  const parts: string[] = []
  const params: unknown[] = []

  if (opts.includeCategoria !== false && f.categoria) {
    parts.push(`${a}categoria = $${n++}`)
    params.push(f.categoria)
  }
  if (f.cadenas.length) {
    parts.push(`${a}cadena = ANY($${n++})`)
    params.push(f.cadenas)
  }
  if (f.subcategorias.length) {
    parts.push(`${a}subcategoria = ANY($${n++})`)
    params.push(f.subcategorias)
  }
  if (f.departamentos.length) {
    parts.push(`${a}departamento = ANY($${n++})`)
    params.push(f.departamentos)
  }
  if (f.ciudades.length) {
    parts.push(`${a}ciudad = ANY($${n++})`)
    params.push(f.ciudades)
  }
  if (f.skus.length) {
    parts.push(`${a}sku = ANY($${n++})`)
    params.push(f.skus)
  }

  return {
    where:  parts.length ? parts.join(' AND ') : 'TRUE',
    params,
    next:   n,
  }
}

/**
 * ¿Alguno de los filtros tiene selección? Útil para decidir "modo filtrado".
 */
export function anyExitoFilterActive(f: ExitoFiltros): boolean {
  return (
    f.cadenas.length > 0 ||
    f.subcategorias.length > 0 ||
    f.departamentos.length > 0 ||
    f.ciudades.length > 0 ||
    f.skus.length > 0 ||
    Boolean(f.categoria)
  )
}
