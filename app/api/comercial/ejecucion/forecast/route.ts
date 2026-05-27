import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

export async function GET(req: NextRequest) {
  try {
    const sp           = req.nextUrl.searchParams
    const paises       = sp.get('pais')      ? sp.get('pais')!.split(',').filter(Boolean)      : []
    const cats         = sp.get('categoria') ? sp.get('categoria')!.split(',').filter(Boolean) : []
    const wm_week      = sp.get('wm_week')   || null
    const forecast_week = parseInt(sp.get('forecast_week') || '1')

    const inC = (col: string, vals: string[]) =>
      `${col} IN (${vals.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`

    // Semanas disponibles para el selector
    const weeksRes = await pool.query(`
      SELECT DISTINCT wm_week FROM forecast ORDER BY wm_week DESC LIMIT 20
    `)
    const available_weeks: number[] = weeksRes.rows.map(r => r.wm_week)
    const effective_week = wm_week ? parseInt(wm_week) : (available_weeks[0] ?? null)

    if (!effective_week) {
      return NextResponse.json({ rows: [], totals: null, available_weeks: [], wm_week: null })
    }

    const filters: string[] = [
      `wm_week = ${effective_week}`,
      `forecast_week = ${forecast_week}`,
    ]
    if (paises.length) filters.push(inC('pais', paises))
    if (cats.length)   filters.push(inC('categoria', cats))
    const where = 'WHERE ' + filters.join(' AND ')

    const r = await pool.query(`
      SELECT
        sku,
        item_nbr,
        MAX(descripcion)                                   AS descripcion,
        MAX(categoria)                                     AS categoria,
        COUNT(DISTINCT pais)                               AS n_paises,
        COUNT(DISTINCT tienda_nbr)                         AS n_tiendas,
        ROUND(SUM(pos_sales)::numeric, 0)                  AS venta_real,
        ROUND(SUM(forecast_value)::numeric, 0)             AS und_forecast,
        ROUND(SUM(pos_sales_usd)::numeric, 2)              AS venta_usd,
        ROUND(SUM(forecast_value * exchange_rate)::numeric, 2) AS forecast_usd
      FROM forecast
      ${where}
      GROUP BY sku, item_nbr
      ORDER BY venta_real DESC, und_forecast DESC
      LIMIT 300
    `)

    const rows = r.rows.map(row => {
      const real      = parseFloat(row.venta_real    ?? '0')
      const fcst      = parseFloat(row.und_forecast  ?? '0')
      const real_usd  = parseFloat(row.venta_usd     ?? '0')
      const fcst_usd  = parseFloat(row.forecast_usd  ?? '0')
      const dif_abs   = real - fcst
      const dif_pct   = fcst !== 0 ? (dif_abs / fcst) * 100 : null
      const ape       = real !== 0 ? ((fcst - real) / real) * 100 : null
      const dif_usd   = real_usd - fcst_usd
      const dif_usd_pct = fcst_usd !== 0 ? (dif_usd / fcst_usd) * 100 : null

      return {
        sku:          row.sku,
        item_nbr:     row.item_nbr,
        descripcion:  row.descripcion,
        categoria:    row.categoria,
        n_paises:     parseInt(row.n_paises),
        n_tiendas:    parseInt(row.n_tiendas),
        venta_real:   real,
        und_forecast: fcst,
        dif_abs,
        dif_pct,
        ape,
        venta_usd:    real_usd,
        forecast_usd: fcst_usd,
        dif_usd,
        dif_usd_pct,
      }
    })

    // Fila de totales
    const tot = rows.reduce((acc, r) => ({
      venta_real:   acc.venta_real   + r.venta_real,
      und_forecast: acc.und_forecast + r.und_forecast,
      venta_usd:    acc.venta_usd    + r.venta_usd,
      forecast_usd: acc.forecast_usd + r.forecast_usd,
    }), { venta_real: 0, und_forecast: 0, venta_usd: 0, forecast_usd: 0 })

    const t_dif_abs    = tot.venta_real - tot.und_forecast
    const t_dif_pct    = tot.und_forecast !== 0 ? (t_dif_abs / tot.und_forecast) * 100 : null
    const t_ape        = tot.venta_real  !== 0 ? ((tot.und_forecast - tot.venta_real) / tot.venta_real) * 100 : null
    const t_dif_usd    = tot.venta_usd - tot.forecast_usd
    const t_dif_usd_pct = tot.forecast_usd !== 0 ? (t_dif_usd / tot.forecast_usd) * 100 : null

    const totals = { ...tot, dif_abs: t_dif_abs, dif_pct: t_dif_pct, ape: t_ape, dif_usd: t_dif_usd, dif_usd_pct: t_dif_usd_pct }

    return NextResponse.json({ rows, totals, available_weeks, wm_week: effective_week })
  } catch (err) {
    return handleApiError(err)
  }
}
