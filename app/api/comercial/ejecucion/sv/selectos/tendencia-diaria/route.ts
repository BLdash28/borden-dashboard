import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

const MN = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

// Serie diaria fact_ventas_selectos compat con TendDailyRow.
// Rango 2026 por defecto. Filtros: categoria, subcategoria, skus (CSV).
export async function GET(req: NextRequest) {
  try {
    const sp     = req.nextUrl.searchParams
    const desde  = sp.get('desde')  || '2026-01-01'
    const hasta  = sp.get('hasta')  || '2026-12-31'
    const cats   = (sp.get('categoria')    ?? '').split(',').map(s => s.trim()).filter(Boolean)
    const subs   = (sp.get('subcategoria') ?? '').split(',').map(s => s.trim()).filter(Boolean)
    const skus   = (sp.get('skus')         ?? sp.get('sku') ?? '').split(',').map(s => s.trim()).filter(Boolean)

    const parts: string[] = []
    const params: unknown[] = [desde, hasta]
    let n = 3
    if (cats.length) { parts.push(`categoria    = ANY($${n++})`); params.push(cats) }
    if (subs.length) { parts.push(`subcategoria = ANY($${n++})`); params.push(subs) }
    if (skus.length) { parts.push(`codigo_barras = ANY($${n++})`); params.push(skus) }
    const extra = parts.length ? 'AND ' + parts.join(' AND ') : ''

    const r = await pool.query(
      `SELECT fecha::date AS fecha,
              ROUND(SUM(ventas_valor)::numeric,    2) AS valor_usd,
              ROUND(SUM(ventas_unidades)::numeric, 0) AS unidades
         FROM fact_ventas_selectos
        WHERE fecha BETWEEN $1 AND $2 ${extra}
        GROUP BY fecha::date
        ORDER BY fecha::date`,
      params,
    )

    const rows = r.rows.map(row => {
      const iso = row.fecha instanceof Date
        ? row.fecha.toISOString().slice(0, 10)
        : String(row.fecha)
      const [, mStr, dStr] = iso.split('-')
      const mes = parseInt(mStr)
      const dia = parseInt(dStr)
      const valor_usd = parseFloat(row.valor_usd)
      return {
        fecha: iso,
        dia_str: `${dia} ${MN[mes]}`,
        valor_usd,
        valor_cop: valor_usd,
        unidades: parseFloat(row.unidades),
      }
    })

    return NextResponse.json({ rows })
  } catch (err) {
    return handleApiError(err)
  }
}
