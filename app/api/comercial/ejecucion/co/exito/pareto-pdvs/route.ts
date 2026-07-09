import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

/**
 * Pareto de puntos de venta — Sell-Out Grupo Éxito CO FY 2026.
 *
 * Devuelve TODOS los PDVs ordenados por ventas descendentes con share y
 * cum_share, más un resumen: cuántos PDVs traen el 50 / 80 / 95 % del total.
 *
 * Params:
 *   - cadena: filtra por cadena
 *   - categoria: filtra por categoría
 */
export async function GET(req: NextRequest) {
  try {
    const cadena    = req.nextUrl.searchParams.get('cadena')    ?? ''
    const categoria = req.nextUrl.searchParams.get('categoria') ?? ''
    const cadFilter = cadena    ? `AND cadena    = '${cadena.replace(/'/g, "''")}'`    : ''
    const catFilter = categoria ? `AND categoria = '${categoria.replace(/'/g, "''")}'` : ''

    const r = await pool.query(`
      SELECT
        punto_venta,
        MAX(cadena)      AS cadena,
        MAX(subcadena)   AS subcadena,
        MAX(departamento) AS departamento,
        MAX(ciudad)      AS ciudad,
        SUM(ventas_valorusd) AS valor_usd,
        SUM(venta_valorcop)  AS valor_cop,
        SUM(ventas_unidades) AS uds
      FROM fact_ventas_exito
      WHERE pais='CO' AND ano=2026
        AND punto_venta IS NOT NULL AND punto_venta <> ''
        ${cadFilter} ${catFilter}
      GROUP BY punto_venta
      ORDER BY valor_usd DESC
    `)

    const rows = r.rows.map(x => ({
      punto_venta:  x.punto_venta,
      cadena:       x.cadena,
      subcadena:    x.subcadena,
      departamento: x.departamento,
      ciudad:       x.ciudad,
      valor_usd:    parseFloat(x.valor_usd ?? '0'),
      valor_cop:    parseFloat(x.valor_cop ?? '0'),
      uds:          parseFloat(x.uds ?? '0'),
    }))

    const total = rows.reduce((s, x) => s + x.valor_usd, 0)
    let acum = 0
    const conShare = rows.map(x => {
      const share = total > 0 ? (x.valor_usd / total) * 100 : 0
      acum += share
      return { ...x, share_pct: share, cum_share: acum }
    })

    // Buckets: cuántos PDVs traen 50 / 80 / 95 %
    const bucket = (target: number) => {
      const found = conShare.find(x => x.cum_share >= target)
      const idx = found ? conShare.indexOf(found) + 1 : conShare.length
      const cop = conShare.slice(0, idx).reduce((s, x) => s + x.valor_cop, 0)
      const usd = conShare.slice(0, idx).reduce((s, x) => s + x.valor_usd, 0)
      return { pdvs: idx, pct_pdvs: conShare.length > 0 ? (idx / conShare.length) * 100 : 0, cop, usd }
    }

    return NextResponse.json({
      total_pdvs:   rows.length,
      total_valor_usd: total,
      total_valor_cop: rows.reduce((s, x) => s + x.valor_cop, 0),
      buckets: {
        p50: bucket(50),
        p80: bucket(80),
        p95: bucket(95),
      },
      rows: conShare,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
