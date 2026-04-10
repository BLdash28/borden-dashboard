import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'
import { requireAuth } from '@/lib/api/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()

    const q = (req.nextUrl.searchParams.get('q') || '').trim()
    if (!q) return NextResponse.json({ productos: [] })

    // Buscar en dim_producto por código_barras (EAN) o SKU o descripción
    const { rows } = await pool.query(
      `SELECT
         sku            AS codigo_interno,
         codigo_barras  AS ean,
         descripcion,
         NULL           AS precio_regular
       FROM dim_producto
       WHERE is_active = TRUE
         AND (
           LOWER(COALESCE(codigo_barras,'')) LIKE LOWER($1)
           OR LOWER(sku)                     LIKE LOWER($1)
           OR LOWER(descripcion)             LIKE LOWER($1)
         )
       ORDER BY
         CASE WHEN LOWER(COALESCE(codigo_barras,'')) = LOWER($2) THEN 0 ELSE 1 END,
         descripcion
       LIMIT 20`,
      ['%' + q + '%', q]
    )

    return NextResponse.json({ productos: rows })
  } catch (err) {
    return handleApiError(err)
  }
}
