/**
 * Filtros globales del módulo Walmart CA — helpers de parsing y SQL.
 *
 * Dimensiones (columnas en fact_ventas_walmart):
 *   cadena, subcategoria, formato, punto_venta, sku, categoria
 *
 * Convención URL: valores CSV en query params (ej: ?cadenas=WALMART,PALI).
 * Compat: soporta `cadena=WALMART` (singular) para llamadas legacy.
 */
import type { NextRequest } from 'next/server'

export type WalmartFiltros = {
  cadenas:        string[]
  categorias:     string[]   // multi (nuevo)
  subcategorias:  string[]
  formatos:       string[]
  puntos:         string[]   // punto_venta
  skus:           string[]
  categoria:      string     // single legacy (div TOTAL/QUESO/LECHE/HELADOS)
}

const splitCsv = (v: string | null): string[] =>
  !v ? [] : v.split(',').map(s => s.trim()).filter(Boolean)

export function parseWalmartFilters(req: Request | NextRequest): WalmartFiltros {
  const url = new URL(req.url)
  const q = url.searchParams

  return {
    cadenas:       splitCsv(q.get('cadenas')       ?? q.get('cadena')),
    categorias:    splitCsv(q.get('categorias')),
    subcategorias: splitCsv(q.get('subcategorias') ?? q.get('subcategoria')),
    formatos:      splitCsv(q.get('formatos')      ?? q.get('formato')),
    puntos:        splitCsv(q.get('puntos')        ?? q.get('punto_venta')),
    skus:          splitCsv(q.get('skus')          ?? q.get('sku')),
    categoria:     (q.get('categoria') ?? '').trim(),
  }
}

/** Columnas que existen en cada tabla. Usar `omit: [...]` para saltar filtros por columnas ausentes. */
type ColKey = 'categoria' | 'cadena' | 'subcategoria' | 'formato' | 'punto_venta' | 'sku'

export function buildWalmartWhere(
  f: WalmartFiltros,
  opts: {
    alias?: string
    startAt?: number
    includeCategoria?: boolean
    /** Columnas a omitir aunque el filtro venga con valor (ej: tabla no tiene subcategoría). */
    omit?: ColKey[]
  } = {},
) {
  const a = opts.alias ? `${opts.alias}.` : ''
  let n = opts.startAt ?? 1
  const parts: string[] = []
  const params: unknown[] = []
  const omit = new Set<ColKey>(opts.omit ?? [])
  const use = (c: ColKey) => !omit.has(c)

  if (use('categoria') && opts.includeCategoria !== false && f.categoria) {
    parts.push(`${a}categoria = $${n++}`)
    params.push(f.categoria)
  }
  if (use('categoria') && f.categorias.length) {
    parts.push(`${a}categoria = ANY($${n++})`)
    params.push(f.categorias)
  }
  if (use('cadena') && f.cadenas.length) {
    parts.push(`${a}cadena = ANY($${n++})`)
    params.push(f.cadenas)
  }
  if (use('subcategoria') && f.subcategorias.length) {
    parts.push(`${a}subcategoria = ANY($${n++})`)
    params.push(f.subcategorias)
  }
  if (use('formato') && f.formatos.length) {
    parts.push(`${a}formato = ANY($${n++})`)
    params.push(f.formatos)
  }
  if (use('punto_venta') && f.puntos.length) {
    parts.push(`${a}punto_venta = ANY($${n++})`)
    params.push(f.puntos)
  }
  if (use('sku') && f.skus.length) {
    parts.push(`${a}sku = ANY($${n++})`)
    params.push(f.skus)
  }

  return {
    where:  parts.length ? parts.join(' AND ') : 'TRUE',
    params,
    next:   n,
  }
}
