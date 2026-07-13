import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

export async function GET(req: NextRequest) {
  try {
    const sp  = req.nextUrl.searchParams
    const cat = sp.get('categoria') ?? ''

    const catFilterFvs = cat ? `AND categoria = '${cat.replace(/'/g, "''")}'` : ''
    const catFilterDp  = cat ? `AND categoria = '${cat.replace(/'/g, "''")}'` : ''

    const { rows } = await pool.query(`
      SELECT DISTINCT subcategoria FROM (
        SELECT subcategoria FROM mv_selectos_mensual
        WHERE subcategoria IS NOT NULL AND subcategoria <> ''
        ${catFilterFvs}
        UNION
        SELECT subcategoria FROM dim_producto
        WHERE subcategoria IS NOT NULL AND subcategoria <> ''
        ${catFilterDp}
      ) t
      ORDER BY subcategoria
    `)

    return NextResponse.json({ subcategorias: rows.map(r => r.subcategoria as string) })
  } catch (err) {
    return handleApiError(err)
  }
}
