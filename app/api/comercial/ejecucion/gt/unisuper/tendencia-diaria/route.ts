import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 1800

const MN = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

/**
 * Serie diaria Unisuper GT compatible con TendDailyRow: { dia_str, valor_usd, valor_cop, unidades }.
 * Unisuper no separa COP: valor_cop = valor_usd para satisfacer el shape del chart.
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
  const skus = csv(sp, 'skus')
  if (skus.length) {
    const start = params.length
    skus.forEach(v => params.push(v))
    conds.push(`sku IN (${skus.map((_, i) => `$${start + 1 + i}`).join(',')})`)
  }
  return { where: conds.join(' AND '), params }
}

export async function GET(req: NextRequest) {
  try {
    const sp    = req.nextUrl.searchParams
    const desde = sp.get('desde') || '2026-01-01'
    const hasta = sp.get('hasta') || '2026-12-31'
    const w     = buildWhere(sp)

    // fecha va como parámetro después de los del where
    const params = [...w.params, desde, hasta]
    const desdeIdx = w.params.length + 1
    const hastaIdx = w.params.length + 2

    const r = await pool.query(
      `SELECT fecha::date AS fecha,
              ROUND(SUM(ventas_valor)::numeric,    2) AS valor_usd,
              ROUND(SUM(ventas_unidades)::numeric, 0) AS unidades
         FROM fact_ventas_unisuper
        WHERE ${w.where}
          AND fecha BETWEEN $${desdeIdx} AND $${hastaIdx}
          AND ventas_unidades > 0
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
