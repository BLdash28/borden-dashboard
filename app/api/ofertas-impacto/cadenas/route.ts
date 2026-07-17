import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError, AppError } from '@/lib/api/errors'
import { requireAuth } from '@/lib/api/auth'

export const revalidate = 3600

/**
 * GET /api/ofertas-impacto/cadenas?pais=CR
 *   Devuelve las cadenas disponibles en `v_ventas` para el país indicado.
 *   Usado por el form de nueva oferta para poblar el multi-select.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const pais = (req.nextUrl.searchParams.get('pais') ?? '').trim()
    if (!pais) throw new AppError(400, 'pais required', 'Falta parámetro pais')

    const { rows } = await pool.query(
      `SELECT DISTINCT cadena
       FROM v_ventas
       WHERE pais = $1
         AND cadena IS NOT NULL
         AND cadena <> ''
       ORDER BY cadena`,
      [pais],
    )

    return NextResponse.json({ cadenas: rows.map(r => r.cadena as string) })
  } catch (err) {
    return handleApiError(err)
  }
}
