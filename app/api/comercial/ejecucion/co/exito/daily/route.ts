import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'
import { parseExitoFilters, buildExitoWhere } from '@/lib/api/exito-filtros'

export const revalidate = 300

// Serie diaria 2026 para el chart "Ventas mensuales" en modo Diaria.
// Devuelve [{ fecha, dia_str, ano, mes, dia, valor_usd, valor_cop, unidades }]
export async function GET(req: NextRequest) {
  try {
    const f = parseExitoFilters(req)
    const w = buildExitoWhere(f, { startAt: 1 })

    const r = await pool.query(`
      SELECT ano, mes, dia,
        ROUND(SUM(ventas_valorusd)::numeric, 2) AS valor_usd,
        ROUND(SUM(venta_valorcop)::numeric,  0) AS valor_cop,
        ROUND(SUM(ventas_unidades)::numeric, 0) AS unidades
      FROM fact_ventas_exito
      WHERE pais='CO' AND ano = 2026 AND dia > 0
        AND ${w.where}
      GROUP BY ano, mes, dia
      ORDER BY ano, mes, dia
    `, w.params)

    const MN = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
    const rows = r.rows.map(row => {
      const ano = parseInt(row.ano)
      const mes = parseInt(row.mes)
      const dia = parseInt(row.dia)
      return {
        fecha: `${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`,
        dia_str: `${dia} ${MN[mes]}`,
        ano, mes, dia,
        valor_usd: parseFloat(row.valor_usd),
        valor_cop: parseFloat(row.valor_cop),
        unidades:  parseFloat(row.unidades),
      }
    })

    return NextResponse.json({ rows })
  } catch (err) {
    return handleApiError(err)
  }
}
