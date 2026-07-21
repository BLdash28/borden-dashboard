import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 1800

/**
 * Tendencia diaria Unisuper GT — últimos 90 días.
 * Devuelve serie por fecha con valor + unidades, para chart de líneas.
 */
function csv(sp: URLSearchParams, key: string): string[] {
  const v = sp.get(key)
  return v ? v.split(',').map(s => s.trim()).filter(Boolean) : []
}

function buildWhere(sp: URLSearchParams) {
  const params: unknown[] = []
  const conds: string[] = [`pais = 'GT'`]

  const cadenas = csv(sp, 'cadenas')
  if (cadenas.length) {
    const start = params.length
    cadenas.forEach(v => params.push(v))
    conds.push(`cadena IN (${cadenas.map((_, i) => `$${start + 1 + i}`).join(',')})`)
  }
  const subcats = csv(sp, 'subcategorias')
  if (subcats.length) {
    const start = params.length
    subcats.forEach(v => params.push(v))
    conds.push(`subcategoria IN (${subcats.map((_, i) => `$${start + 1 + i}`).join(',')})`)
  }
  const pdvs = csv(sp, 'punto_venta')
  if (pdvs.length) {
    const start = params.length
    pdvs.forEach(v => params.push(v))
    conds.push(`nombre_sucursal IN (${pdvs.map((_, i) => `$${start + 1 + i}`).join(',')})`)
  }
  return { where: conds.join(' AND '), params }
}

export async function GET(req: NextRequest) {
  try {
    const sp   = req.nextUrl.searchParams
    const dias = Math.min(parseInt(sp.get('dias') ?? '90'), 365)
    const w    = buildWhere(sp)

    const { rows } = await pool.query(`
      SELECT fecha::date AS fecha,
             ROUND(SUM(ventas_valor)::numeric, 2)    AS valor,
             ROUND(SUM(ventas_unidades)::numeric, 0) AS unidades,
             COUNT(DISTINCT nombre_sucursal)         AS tiendas
      FROM fact_ventas_unisuper
      WHERE ${w.where}
        AND fecha >= CURRENT_DATE - INTERVAL '${dias} day'
        AND ventas_unidades > 0
      GROUP BY fecha
      ORDER BY fecha
    `, w.params)

    return NextResponse.json({
      dias,
      rows: rows.map(r => ({
        fecha:    r.fecha,
        valor:    parseFloat(r.valor ?? '0'),
        unidades: parseInt(r.unidades ?? '0'),
        tiendas:  parseInt(r.tiendas ?? '0'),
      })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
