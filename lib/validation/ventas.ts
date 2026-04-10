import { z } from 'zod'

const yearSchema  = z.coerce.number().int().min(2000).max(2100)
const monthSchema = z.coerce.number().int().min(1).max(12)

// Country codes are 2–3 uppercase letters: GT, HN, CR, SV, NI, PA, DO …
const paisCodeRegex = /^[A-Z]{2,3}$/

export const VentasPaisQuerySchema = z.object({
  ano:           yearSchema.optional(),
  mes:           monthSchema.optional(),
  pais:          z.string().max(200).optional(),
  categoria:     z.string().max(100).optional(),
  cliente:       z.string().max(200).optional(),
  tipo:          z.enum(['skus']).optional(),
  categorias:    z.string().max(500).optional(),
  subcategorias: z.string().max(500).optional(),
  clientes:      z.string().max(500).optional(),
})

export const VentasResumenQuerySchema = z.object({
  tipo:       z.string().max(20).optional(),
  ano:        yearSchema.optional(),
  mes:        monthSchema.optional(),
  todos:      z.string().optional(),
  pais:       z.string().max(100).optional(),
  categoria:  z.string().max(100).optional(),
  cliente:    z.string().max(200).optional(),
  sku:        z.string().max(200).optional(),
  anos:         z.string().max(100).optional(),
  meses:        z.string().max(50).optional(),
  paises:       z.string().max(200).optional(),
  categorias:   z.string().max(500).optional(),
  subcategorias: z.string().max(500).optional(),
  clientes:      z.string().max(500).optional(),
  formatos:      z.string().max(500).optional(),
})

/**
 * Parse a comma-separated country string and validate each code.
 * Invalid codes and the sentinel 'Todos' are silently dropped.
 */
export function parsePaisList(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map(p => p.trim())
    .filter(p => p !== '' && p !== 'Todos' && paisCodeRegex.test(p))
}
