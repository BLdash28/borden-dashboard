import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'
import { parseWalmartFilters, buildWalmartWhere } from '@/lib/api/walmart-filtros'

export const revalidate = 3600

export async function GET(req: NextRequest) {
  try {
    const sp   = req.nextUrl.searchParams
    const pais = sp.get('pais') ?? 'CR'
    const f    = parseWalmartFilters(req)
    // Este endpoint DEVUELVE la lista de subcategorías: no filtramos por
    // subcategoria (o solo devolvería las ya seleccionadas). Sí acotamos por
    // cadena/categoria/formato/punto_venta/sku.
    const w    = buildWalmartWhere({ ...f, subcategorias: [] }, { startAt: 2 })

    const { rows } = await pool.query(`
      SELECT DISTINCT subcategoria
      FROM fact_ventas_walmart
      WHERE pais = $1
        AND subcategoria IS NOT NULL AND subcategoria <> ''
        AND ${w.where}
        AND fecha >= '2026-01-01' AND fecha < '2027-01-01'
      ORDER BY subcategoria
    `, [pais, ...w.params])

    return NextResponse.json({ subcategorias: rows.map(r => r.subcategoria as string) })
  } catch (err) {
    return handleApiError(err)
  }
}
