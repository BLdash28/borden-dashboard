import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'
import { requireAuth } from '@/lib/api/auth'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()

    const { searchParams } = new URL(req.url)
    const categoria    = searchParams.get('categoria')   || ''
    const subcategoria = searchParams.get('subcategoria') || ''
    const buscar       = searchParams.get('buscar')       || ''

    const conds: string[] = ['is_active = TRUE']
    const vals: any[] = []

    if (categoria) {
      vals.push(categoria)
      conds.push(`UPPER(categoria) = UPPER($${vals.length})`)
    }
    if (subcategoria) {
      vals.push(subcategoria)
      conds.push(`UPPER(subcategoria) = UPPER($${vals.length})`)
    }
    if (buscar.trim()) {
      vals.push('%' + buscar.trim().toLowerCase() + '%')
      conds.push(`(LOWER(descripcion) LIKE $${vals.length} OR LOWER(sku) LIKE $${vals.length} OR LOWER(COALESCE(codigo_barras,'')) LIKE $${vals.length})`)
    }

    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''

    const { rows } = await pool.query(
      `SELECT
         id,
         sku,
         descripcion,
         categoria,
         subcategoria,
         codigo_barras,
         is_active,
         created_at,
         updated_at
       FROM dim_producto
       ${where}
       ORDER BY categoria, subcategoria, descripcion`,
      vals
    )

    // Categorías y subcategorías únicas para los filtros
    const { rows: cats } = await pool.query(
      `SELECT DISTINCT categoria, subcategoria
       FROM dim_producto
       WHERE is_active = TRUE AND categoria IS NOT NULL
       ORDER BY categoria, subcategoria`
    )

    return NextResponse.json({ productos: rows, categorias: cats })
  } catch (err) {
    return handleApiError(err)
  }
}
