import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 3600

export async function GET(req: NextRequest) {
  try {
    const sp       = req.nextUrl.searchParams
    const pais     = sp.get('pais')      ?? 'CR'
    const categoria = sp.get('categoria') ?? ''

    const paisSafe = pais.replace(/'/g, "''")
    const catFilter = categoria ? `AND categoria = '${categoria.replace(/'/g, "''")}'` : ''

    const { rows } = await pool.query(`
      SELECT DISTINCT subcategoria
      FROM fact_ventas_walmart
      WHERE pais = '${paisSafe}'
        AND subcategoria IS NOT NULL AND subcategoria <> ''
        ${catFilter}
        AND fecha >= '2026-01-01' AND fecha < '2027-01-01'
      ORDER BY subcategoria
    `)

    return NextResponse.json({ subcategorias: rows.map(r => r.subcategoria as string) })
  } catch (err) {
    return handleApiError(err)
  }
}
