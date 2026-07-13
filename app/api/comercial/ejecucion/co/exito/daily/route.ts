import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'
import { parseExitoFilters, buildExitoWhere } from '@/lib/api/exito-filtros'

export const revalidate = 300

// Serie diaria 2026 para el módulo Éxito CO.
// Devuelve [{ fecha, dia_str, valor_usd, valor_cop, unidades, precio_und_cop, precio_und_usd }]
// Usa fact_ventas_exito (no MV) porque necesita día — la MV mensual no lo tiene.
export async function GET(req: NextRequest) {
  try {
    const f = parseExitoFilters(req)
    const w = buildExitoWhere(f, { startAt: 1 })
    // Rango opcional YYYY-MM (desde/hasta) para acotar el chart.
    const sp     = req.nextUrl.searchParams
    const desde  = sp.get('desde') || ''   // "2026-01"
    const hasta  = sp.get('hasta') || ''   // "2026-07"
    const [dY, dM] = desde ? desde.split('-').map(Number) : [null, null]
    const [hY, hM] = hasta ? hasta.split('-').map(Number) : [null, null]
    const rangeConds: string[] = []
    if (dY && dM) rangeConds.push(`(ano * 100 + mes) >= ${dY * 100 + dM}`)
    if (hY && hM) rangeConds.push(`(ano * 100 + mes) <= ${hY * 100 + hM}`)
    const rangeSql = rangeConds.length ? 'AND ' + rangeConds.join(' AND ') : 'AND ano = 2026'

    const r = await pool.query(`
      SELECT ano, mes, dia,
        ROUND(SUM(ventas_valorusd)::numeric, 2) AS valor_usd,
        ROUND(SUM(venta_valorcop)::numeric,  0) AS valor_cop,
        ROUND(SUM(ventas_unidades)::numeric, 0) AS unidades
      FROM fact_ventas_exito
      WHERE pais='CO' AND dia > 0
        ${rangeSql}
        AND ${w.where}
      GROUP BY ano, mes, dia
      ORDER BY ano, mes, dia
    `, w.params)

    const rows = r.rows.map(row => {
      const ano = parseInt(row.ano)
      const mes = parseInt(row.mes)
      const dia = parseInt(row.dia)
      const valor_usd = parseFloat(row.valor_usd)
      const valor_cop = parseFloat(row.valor_cop)
      const unidades  = parseFloat(row.unidades)
      const fecha     = `${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`
      return {
        fecha,
        dia_str: `${dia}/${mes}`,
        ano, mes, dia,
        valor_usd,
        valor_cop,
        unidades,
        precio_und_cop: unidades > 0 ? valor_cop / unidades : 0,
        precio_und_usd: unidades > 0 ? valor_usd / unidades : 0,
      }
    })

    // Totales para exponer precio promedio general del período
    const totV = rows.reduce((s, r) => s + r.valor_usd, 0)
    const totVC = rows.reduce((s, r) => s + r.valor_cop, 0)
    const totU = rows.reduce((s, r) => s + r.unidades, 0)
    const precio_und_usd_avg = totU > 0 ? totV / totU : 0
    const precio_und_cop_avg = totU > 0 ? totVC / totU : 0

    return NextResponse.json({
      rows,
      totales: {
        valor_usd: totV,
        valor_cop: totVC,
        unidades: totU,
        precio_und_usd_avg,
        precio_und_cop_avg,
        n_dias: rows.length,
      },
    })
  } catch (err) {
    return handleApiError(err)
  }
}
