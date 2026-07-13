import { NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 600

export async function GET() {
  try {
    const r = await pool.query(`
      SELECT
        ARRAY_AGG(DISTINCT cadena   ORDER BY cadena)   FILTER (WHERE cadena   IS NOT NULL AND cadena   <> '') cadenas,
        ARRAY_AGG(DISTINCT producto ORDER BY producto) FILTER (WHERE producto IS NOT NULL AND producto <> '') productos
      FROM sellin_sensacion
    `)
    const row = r.rows[0] ?? {}
    return NextResponse.json({
      cadenas:   (row.cadenas   ?? []).map((c: string) => ({ value: c })),
      productos: (row.productos ?? []).map((p: string) => ({ value: p })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
