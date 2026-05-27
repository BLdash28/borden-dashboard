import { NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 0

export async function GET() {
  try {
    // Último mes con datos en 2026 para SELECTOS
    const { rows: cutR } = await pool.query(`
      SELECT COALESCE(MAX(mes), 0) AS ultimo_mes
      FROM mv_sellout_mensual
      WHERE cadena = 'SELECTOS' AND ano = 2026 AND ventas_valor > 0
    `)
    const ultimoMes = parseInt(cutR[0].ultimo_mes) || 0

    const [curr26, curr25, fy25] = await Promise.all([
      // YTD 2026 — hasta último mes con datos
      pool.query(`
        SELECT
          COALESCE(SUM(ventas_valor), 0)                                          AS total,
          COALESCE(SUM(ventas_valor) FILTER (WHERE categoria = 'Quesos'), 0)      AS quesos,
          COALESCE(SUM(ventas_valor) FILTER (WHERE categoria = 'Leches'), 0)      AS leches,
          COALESCE(SUM(ventas_unidades), 0)                                        AS unidades,
          MAX(mes)                                                                 AS ultimo_mes
        FROM mv_sellout_mensual
        WHERE cadena = 'SELECTOS' AND ano = 2026 AND mes <= ${ultimoMes}
      `),
      // YTD 2025 — mismo período
      pool.query(`
        SELECT
          COALESCE(SUM(ventas_valor), 0)                                          AS total,
          COALESCE(SUM(ventas_valor) FILTER (WHERE categoria = 'Quesos'), 0)      AS quesos,
          COALESCE(SUM(ventas_valor) FILTER (WHERE categoria = 'Leches'), 0)      AS leches
        FROM mv_sellout_mensual
        WHERE cadena = 'SELECTOS' AND ano = 2025 AND mes <= ${ultimoMes}
      `),
      // FY 2025 completo
      pool.query(`
        SELECT
          COALESCE(SUM(ventas_valor), 0)                                          AS total,
          COALESCE(SUM(ventas_valor) FILTER (WHERE categoria = 'Quesos'), 0)      AS quesos,
          COALESCE(SUM(ventas_valor) FILTER (WHERE categoria = 'Leches'), 0)      AS leches
        FROM mv_sellout_mensual
        WHERE cadena = 'SELECTOS' AND ano = 2025
      `),
    ])

    const ytd26 = { total: parseFloat(curr26.rows[0].total), quesos: parseFloat(curr26.rows[0].quesos), leches: parseFloat(curr26.rows[0].leches), unidades: parseFloat(curr26.rows[0].unidades) }
    const ytd25 = { total: parseFloat(curr25.rows[0].total), quesos: parseFloat(curr25.rows[0].quesos), leches: parseFloat(curr25.rows[0].leches) }
    const fy25v = { total: parseFloat(fy25.rows[0].total),  quesos: parseFloat(fy25.rows[0].quesos),  leches: parseFloat(fy25.rows[0].leches) }

    const delta = (c: number, p: number) => p > 0 ? ((c - p) / p) * 100 : c > 0 ? 100 : 0

    // FY 2026 proyectado = promedio mensual × 12
    const monthlyAvg = ultimoMes > 0 ? ytd26.total / ultimoMes : 0
    const fy26_est   = monthlyAvg * 12

    return NextResponse.json({
      ultimo_mes: ultimoMes,
      ytd_2026:   ytd26,
      ytd_2025:   ytd25,
      fy_2025:    fy25v,
      fy_2026_est: fy26_est,
      delta_ytd:   delta(ytd26.total, ytd25.total),
      delta_fy:    delta(fy26_est, fy25v.total),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
