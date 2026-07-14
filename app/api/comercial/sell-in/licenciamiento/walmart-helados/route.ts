import { NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

const MN = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

// Sellout Walmart de helados Borden 320gr (los 4 EANs de la línea licenciamiento).
// Complementa el Sell-In de Sensación mostrando qué pasó en el punto de venta.
export async function GET() {
  try {
    const EAN_HELADOS = ['7441134017824','7441134017831','7441134017848','7441134017855']
    // Walmart guarda el EAN en formato: 0005300000051 (13 chars con lead zero, sin check digit)
    // Los helados Borden tienen EAN 13 chars real (7441134017824). El match debe ser directo.

    const [ytdR, monthlyR, prodR, tiendaR] = await Promise.all([
      // YTD 2026 vs 2025 mismo período
      pool.query(`
        WITH cur AS (
          SELECT SUM(ventas_valor) usd, SUM(ventas_unidades) uds,
                 MAX(EXTRACT(MONTH FROM fecha))::int ultimo_mes
          FROM fact_ventas_walmart
          WHERE pais='CR' AND fecha >= '2026-01-01' AND fecha < '2027-01-01'
            AND codigo_barras = ANY($1::text[])
        ),
        prev AS (
          SELECT SUM(ventas_valor) usd, SUM(ventas_unidades) uds
          FROM fact_ventas_walmart
          WHERE pais='CR' AND fecha >= '2025-01-01' AND fecha < '2026-01-01'
            AND EXTRACT(MONTH FROM fecha) <= (SELECT COALESCE(ultimo_mes, 12) FROM cur)
            AND codigo_barras = ANY($1::text[])
        )
        SELECT
          COALESCE(cur.usd, 0)  ytd_usd,
          COALESCE(cur.uds, 0)  ytd_uds,
          COALESCE(prev.usd, 0) prev_usd,
          COALESCE(prev.uds, 0) prev_uds,
          cur.ultimo_mes,
          CASE WHEN COALESCE(prev.usd,0) > 0
               THEN ROUND(((cur.usd - prev.usd) / prev.usd * 100)::numeric, 1)
               ELSE NULL END delta_usd
        FROM cur, prev
      `, [EAN_HELADOS]),
      // Mensual 2025 + 2026
      pool.query(`
        SELECT EXTRACT(YEAR FROM fecha)::int ano, EXTRACT(MONTH FROM fecha)::int mes,
          ROUND(SUM(ventas_valor)::numeric, 2)    usd,
          ROUND(SUM(ventas_unidades)::numeric, 0) uds
        FROM fact_ventas_walmart
        WHERE pais='CR' AND fecha >= '2025-01-01' AND fecha < '2027-01-01'
          AND codigo_barras = ANY($1::text[])
        GROUP BY 1, 2 ORDER BY 1, 2
      `, [EAN_HELADOS]),
      // Por producto (EAN) 2026
      pool.query(`
        SELECT codigo_barras,
          COALESCE(MAX(descripcion), '') descripcion,
          SUM(ventas_valor) usd,
          SUM(ventas_unidades) uds,
          COUNT(DISTINCT punto_venta) pdvs
        FROM fact_ventas_walmart
        WHERE pais='CR' AND fecha >= '2026-01-01' AND fecha < '2027-01-01'
          AND codigo_barras = ANY($1::text[])
        GROUP BY codigo_barras ORDER BY usd DESC
      `, [EAN_HELADOS]),
      // Por punto de venta 2026 (top 15)
      pool.query(`
        SELECT punto_venta, cadena,
          SUM(ventas_valor) usd, SUM(ventas_unidades) uds
        FROM fact_ventas_walmart
        WHERE pais='CR' AND fecha >= '2026-01-01' AND fecha < '2027-01-01'
          AND codigo_barras = ANY($1::text[])
          AND punto_venta IS NOT NULL AND punto_venta <> ''
        GROUP BY punto_venta, cadena ORDER BY usd DESC LIMIT 15
      `, [EAN_HELADOS]),
    ])

    const kpi = ytdR.rows[0] ?? {}
    const ultimoMes = parseInt(kpi.ultimo_mes ?? '0')

    type MonRow = { mes: number; mes_nombre: string; y2025: number; y2026: number | null; uds2025: number; uds2026: number | null }
    const monthly: Record<number, MonRow> = {}
    for (let m = 1; m <= 12; m++) monthly[m] = { mes: m, mes_nombre: MN[m], y2025: 0, y2026: null, uds2025: 0, uds2026: null }
    for (const r of monthlyR.rows) {
      const m = +r.mes, a = +r.ano
      if (a === 2025) { monthly[m].y2025 = +r.usd; monthly[m].uds2025 = +r.uds }
      if (a === 2026) { monthly[m].y2026 = +r.usd; monthly[m].uds2026 = +r.uds }
    }
    for (let m = ultimoMes + 1; m <= 12; m++) { monthly[m].y2026 = null; monthly[m].uds2026 = null }

    return NextResponse.json({
      ytd_2026: +kpi.ytd_usd,
      uds_2026: +kpi.ytd_uds,
      ytd_2025: +kpi.prev_usd,
      uds_2025: +kpi.prev_uds,
      delta_ytd: kpi.delta_usd !== null ? +kpi.delta_usd : null,
      ultimo_mes: ultimoMes,
      ultimo_mes_nombre: MN[ultimoMes] ?? '',
      monthly: Object.values(monthly),
      por_producto: prodR.rows.map(r => ({
        codigo_barras: r.codigo_barras,
        descripcion: r.descripcion,
        usd: +r.usd, uds: +r.uds, pdvs: +r.pdvs,
      })),
      top_pdvs: tiendaR.rows.map(r => ({
        punto_venta: r.punto_venta, cadena: r.cadena,
        usd: +r.usd, uds: +r.uds,
      })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
