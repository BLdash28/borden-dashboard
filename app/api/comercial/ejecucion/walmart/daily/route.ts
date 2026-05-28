import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

const MES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function formatFecha(iso: string) {
  const [, m, d] = iso.split('-')
  return `${parseInt(d)} ${MES[parseInt(m)]}`
}

export async function GET(req: NextRequest) {
  try {
    const sp       = req.nextUrl.searchParams
    const pais     = sp.get('pais')      ?? 'CR'
    const categoria = sp.get('categoria') ?? ''
    const desde    = sp.get('desde')     || '2026-01-01'
    const hasta    = sp.get('hasta')     || '2026-12-31'

    const paisSafe = pais.replace(/'/g, "''")
    const catFilter = categoria ? `AND categoria = '${categoria.replace(/'/g, "''")}'` : ''

    const { rows } = await pool.query(`
      SELECT
        fecha::date                                AS fecha,
        ROUND(SUM(ventas_valor)::numeric,    2)    AS valor,
        ROUND(SUM(ventas_unidades)::numeric, 0)    AS unidades
      FROM fact_ventas_walmart
      WHERE pais = '${paisSafe}'
        AND fecha BETWEEN $1 AND $2
        ${catFilter}
      GROUP BY fecha::date
      ORDER BY fecha::date
    `, [desde, hasta])

    const series = rows.map(r => ({
      fecha:    r.fecha instanceof Date ? r.fecha.toISOString().slice(0, 10) : String(r.fecha),
      label:    formatFecha(r.fecha instanceof Date ? r.fecha.toISOString().slice(0, 10) : String(r.fecha)),
      valor:    parseFloat(r.valor),
      unidades: parseInt(r.unidades),
    }))

    return NextResponse.json({ series })
  } catch (err) {
    return handleApiError(err)
  }
}
