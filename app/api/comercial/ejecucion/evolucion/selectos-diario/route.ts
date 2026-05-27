import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

export async function GET(req: NextRequest) {
  try {
    const sp     = req.nextUrl.searchParams
    const cats   = sp.get('categoria')    ? sp.get('categoria')!.split(',').filter(Boolean) : []
    const subcat = sp.get('subcategoria') ?? ''
    const desde  = sp.get('desde')  || '2026-01-01'
    const hasta  = sp.get('hasta')  || '2026-12-31'

    const catFilter    = cats.length ? `AND categoria IN (${cats.map(c => `'${c.replace(/'/g, "''")}'`).join(',')})` : ''
    const subcatFilter = subcat ? `AND subcategoria = '${subcat.replace(/'/g, "''")}'` : ''

    const { rows } = await pool.query(`
      SELECT
        fecha::date                                AS fecha,
        ROUND(SUM(ventas_valor)::numeric,    2)    AS valor,
        ROUND(SUM(ventas_unidades)::numeric, 0)    AS unidades
      FROM fact_ventas_selectos
      WHERE fecha BETWEEN $1 AND $2
        ${catFilter} ${subcatFilter}
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

const MES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
function formatFecha(iso: string) {
  const [, m, d] = iso.split('-')
  return `${parseInt(d)} ${MES[parseInt(m)]}`
}
