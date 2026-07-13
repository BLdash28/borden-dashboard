import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

const MN = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

// KPIs y series de Sensación CR (distribuidor helados).
// Sensación tiene rango parcial Nov'25 → Jun'26, por lo que comparativos usan
// mismos meses en ambos años cuando estén disponibles.
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const cadenas   = sp.get('cadenas')  ? sp.get('cadenas')!.split(',').filter(Boolean) : []
    const productos = sp.get('productos')? sp.get('productos')!.split(',').filter(Boolean) : []

    const conds: string[] = []
    const params: unknown[] = []
    let p = 1
    if (cadenas.length) {
      conds.push(`cadena IN (${cadenas.map(() => `$${p++}`).join(',')})`)
      params.push(...cadenas)
    }
    if (productos.length) {
      conds.push(`producto IN (${productos.map(() => `$${p++}`).join(',')})`)
      params.push(...productos)
    }
    const where = conds.length ? `AND ${conds.join(' AND ')}` : ''

    const [ytdR, cadenaR, prodR, monthlyR] = await Promise.all([
      // YTD 2026 vs 2025 (mismo período — hasta último mes 2026)
      pool.query(`
        WITH cur AS (
          SELECT SUM(venta_neta_usd) usd,
                 SUM(venta_neta_crc) crc,
                 SUM(unidades)       uds,
                 MAX(mes)            ultimo_mes
          FROM sellin_sensacion
          WHERE ano = 2026 ${where}
        ),
        prev AS (
          SELECT SUM(venta_neta_usd) usd,
                 SUM(venta_neta_crc) crc,
                 SUM(unidades)       uds
          FROM sellin_sensacion, cur
          WHERE ano = 2025 AND mes <= COALESCE(cur.ultimo_mes, 12) ${where}
        )
        SELECT
          COALESCE(cur.usd, 0)  ytd_usd,
          COALESCE(cur.crc, 0)  ytd_crc,
          COALESCE(cur.uds, 0)  ytd_uds,
          COALESCE(prev.usd, 0) prev_usd,
          COALESCE(prev.crc, 0) prev_crc,
          COALESCE(prev.uds, 0) prev_uds,
          cur.ultimo_mes,
          CASE WHEN COALESCE(prev.usd, 0) > 0
               THEN ROUND(((cur.usd - prev.usd) / prev.usd * 100)::numeric, 1)
               ELSE NULL END delta_usd
        FROM cur, prev
      `, params),
      // Por cadena (ignora filtro de cadena para mostrar todas)
      pool.query(`
        SELECT cadena,
          SUM(CASE WHEN ano = 2026 THEN venta_neta_usd ELSE 0 END) usd_26,
          SUM(CASE WHEN ano = 2026 THEN unidades       ELSE 0 END) uds_26,
          SUM(CASE WHEN ano = 2025 THEN venta_neta_usd ELSE 0 END) usd_25
        FROM sellin_sensacion
        WHERE cadena IS NOT NULL AND cadena <> ''
        GROUP BY cadena ORDER BY usd_26 DESC
      `),
      // Por producto (con filtros aplicados)
      pool.query(`
        SELECT producto, codigo_barras,
          SUM(venta_neta_usd) usd,
          SUM(unidades)       uds
        FROM sellin_sensacion
        WHERE ano = 2026 AND producto IS NOT NULL AND producto <> '' ${where}
        GROUP BY producto, codigo_barras ORDER BY usd DESC
      `, params),
      // Serie mensual 2025 + 2026 con filtros
      pool.query(`
        SELECT ano, mes,
          ROUND(SUM(venta_neta_usd)::numeric, 2) usd,
          ROUND(SUM(venta_neta_crc)::numeric, 0) crc,
          SUM(unidades)::int uds
        FROM sellin_sensacion
        WHERE 1=1 ${where}
        GROUP BY ano, mes ORDER BY ano, mes
      `, params),
    ])

    const row = ytdR.rows[0] ?? {}
    const ultimoMes = parseInt(row.ultimo_mes ?? '0')

    type MonRow = {
      mes: number; mes_nombre: string
      y2025: number; y2026: number | null
      uds2025: number; uds2026: number | null
      crc2025: number; crc2026: number | null
    }
    const monthly: Record<number, MonRow> = {}
    for (let m = 1; m <= 12; m++) {
      monthly[m] = { mes: m, mes_nombre: MN[m], y2025: 0, y2026: null, uds2025: 0, uds2026: null, crc2025: 0, crc2026: null }
    }
    for (const r of monthlyR.rows) {
      const m = parseInt(r.mes), a = parseInt(r.ano)
      if (a === 2025) { monthly[m].y2025 = +r.usd; monthly[m].uds2025 = +r.uds; monthly[m].crc2025 = +r.crc }
      if (a === 2026) { monthly[m].y2026 = +r.usd; monthly[m].uds2026 = +r.uds; monthly[m].crc2026 = +r.crc }
    }
    for (let m = ultimoMes + 1; m <= 12; m++) {
      monthly[m].y2026 = null; monthly[m].uds2026 = null; monthly[m].crc2026 = null
    }

    return NextResponse.json({
      ytd_2026: +row.ytd_usd,
      ytd_2026_crc: +row.ytd_crc,
      uds_2026: +row.ytd_uds,
      ytd_2025: +row.prev_usd,
      ytd_2025_crc: +row.prev_crc,
      uds_2025: +row.prev_uds,
      delta_ytd: row.delta_usd !== null ? +row.delta_usd : null,
      ultimo_mes: ultimoMes,
      ultimo_mes_nombre: MN[ultimoMes] ?? '',
      por_cadena: cadenaR.rows.map(r => ({
        cadena: r.cadena,
        usd_2026: +r.usd_26,
        uds_2026: +r.uds_26,
        usd_2025: +r.usd_25,
        delta: +r.usd_25 > 0 ? ((+r.usd_26 - +r.usd_25) / +r.usd_25) * 100 : null,
      })),
      por_producto: prodR.rows.map(r => ({
        producto: r.producto,
        codigo_barras: r.codigo_barras,
        usd_2026: +r.usd,
        uds_2026: +r.uds,
      })),
      monthly: Object.values(monthly),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
