import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'
import { parseWalmartFilters, buildWalmartWhere } from '@/lib/api/walmart-filtros'

export const revalidate = 300

const MN = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

// Serie diaria compatible con TendDailyRow: { dia_str, valor_usd, valor_cop, unidades }.
// Walmart no separa COP: valor_cop = valor_usd para satisfacer el shape del chart.
export async function GET(req: NextRequest) {
  try {
    const sp    = req.nextUrl.searchParams
    const pais  = sp.get('pais')  ?? 'CR'
    const desde = sp.get('desde') || '2026-01-01'
    const hasta = sp.get('hasta') || '2026-12-31'
    const f     = parseWalmartFilters(req)
    const w     = buildWalmartWhere(f, { startAt: 4 })

    const r = await pool.query(
      `SELECT fecha::date AS fecha,
              ROUND(SUM(ventas_valor)::numeric,    2) AS valor_usd,
              ROUND(SUM(ventas_unidades)::numeric, 0) AS unidades
         FROM fact_ventas_walmart
        WHERE pais = $1 AND fecha BETWEEN $2 AND $3 AND ${w.where}
        GROUP BY fecha::date
        ORDER BY fecha::date`,
      [pais, desde, hasta, ...w.params],
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
        valor_cop: valor_usd, // Walmart no tiene COP
        unidades: parseFloat(row.unidades),
      }
    })

    return NextResponse.json({ rows })
  } catch (err) {
    return handleApiError(err)
  }
}
