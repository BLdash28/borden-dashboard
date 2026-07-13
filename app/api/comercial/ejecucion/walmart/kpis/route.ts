import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'
import { CADENA_NORM_SQL } from '@/lib/db/walmart-cadena'
import { parseWalmartFilters, buildWalmartWhere } from '@/lib/api/walmart-filtros'

export const revalidate = 300

const MN = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

export async function GET(req: NextRequest) {
  try {
    const pais = req.nextUrl.searchParams.get('pais') ?? 'CR'
    const f    = parseWalmartFilters(req)
    const w    = buildWalmartWhere(f, { startAt: 2 })
    // Vista "por cadena": queremos ver todas las cadenas aunque el usuario filtre por cadena
    const wSinCad = buildWalmartWhere({ ...f, cadenas: [] }, { startAt: 2 })

    const [ytdR, cadenaR, catR, monthlyR] = await Promise.all([
      // YTD 2026 vs same-period 2025 — usa mv_walmart_mensual (2.6K filas)
      pool.query(`
        WITH cur AS (
          SELECT SUM(ventas_valor)    AS valor,
                 SUM(ventas_unidades) AS unidades,
                 MAX(mes)::int        AS ultimo_mes
          FROM mv_walmart_mensual
          WHERE pais = $1 AND ano = 2026 AND ${w.where}
        ),
        prev AS (
          SELECT SUM(ventas_valor)    AS valor,
                 SUM(ventas_unidades) AS unidades
          FROM mv_walmart_mensual
          WHERE pais = $1 AND ano = 2025
            AND mes <= (SELECT COALESCE(ultimo_mes, 12) FROM cur)
            AND ${w.where}
        ),
        ultf AS (
          SELECT MAX(fecha) ultima_fecha FROM fact_ventas_walmart
          WHERE pais = $1 AND fecha >= '2026-01-01' AND fecha < '2027-01-01'
        )
        SELECT COALESCE(cur.valor, 0)     AS ytd_2026,
               COALESCE(cur.unidades, 0)  AS uni_2026,
               COALESCE(prev.valor, 0)    AS ytd_2025,
               COALESCE(prev.unidades, 0) AS uni_2025,
               ultf.ultima_fecha,
               cur.ultimo_mes,
               CASE WHEN COALESCE(prev.valor,0) > 0
                    THEN ROUND(((cur.valor - prev.valor) / prev.valor * 100)::numeric, 1)
                    ELSE NULL END AS delta_ytd
        FROM cur, prev, ultf
      `, [pais, ...w.params]),
      // By cadena — mostrar todas
      pool.query(`
        SELECT ${CADENA_NORM_SQL} AS cadena,
          SUM(CASE WHEN ano = 2026 THEN ventas_valor    ELSE 0 END) AS valor_2026,
          SUM(CASE WHEN ano = 2026 THEN ventas_unidades ELSE 0 END) AS uni_2026,
          SUM(CASE WHEN ano = 2025 THEN ventas_valor    ELSE 0 END) AS valor_2025
        FROM mv_walmart_mensual
        WHERE pais = $1 AND ano IN (2025, 2026) AND ${wSinCad.where}
        GROUP BY ${CADENA_NORM_SQL}
        ORDER BY valor_2026 DESC
      `, [pais, ...wSinCad.params]),
      // By categoria
      pool.query(`
        SELECT categoria,
          SUM(ventas_valor)    AS valor_2026,
          SUM(ventas_unidades) AS uni_2026
        FROM mv_walmart_mensual
        WHERE pais = $1 AND ano = 2026 AND ${w.where}
        GROUP BY categoria ORDER BY valor_2026 DESC
      `, [pais, ...w.params]),
      // Monthly 2025 + 2026
      pool.query(`
        SELECT ano, mes,
               ROUND(SUM(ventas_valor)::numeric, 2) AS valor
        FROM mv_walmart_mensual
        WHERE pais = $1 AND ano IN (2025, 2026) AND ${w.where}
        GROUP BY 1, 2 ORDER BY 1, 2
      `, [pais, ...w.params]),
    ])

    const row = ytdR.rows[0] ?? {}
    const ultimoMes = parseInt(row.ultimo_mes ?? '0')

    const monthly: Record<string, { mes: number; mes_nombre: string; y2025: number; y2026: number | null }> = {}
    for (let m = 1; m <= 12; m++) {
      monthly[m] = { mes: m, mes_nombre: MN[m], y2025: 0, y2026: null }
    }
    for (const r of monthlyR.rows) {
      const m = parseInt(r.mes)
      const a = parseInt(r.ano)
      if (a === 2025) monthly[m].y2025 = parseFloat(r.valor)
      if (a === 2026) monthly[m].y2026 = parseFloat(r.valor)
    }
    for (let m = ultimoMes + 1; m <= 12; m++) monthly[m].y2026 = null

    return NextResponse.json({
      ytd_2026:    parseFloat(row.ytd_2026 ?? '0'),
      uni_2026:    parseInt(row.uni_2026 ?? '0'),
      ytd_2025:    parseFloat(row.ytd_2025 ?? '0'),
      uni_2025:    parseInt(row.uni_2025 ?? '0'),
      delta_ytd:   row.delta_ytd !== null ? parseFloat(row.delta_ytd) : null,
      ultimo_mes:  ultimoMes,
      ultimo_mes_nombre: MN[ultimoMes] ?? '',
      ultima_fecha: row.ultima_fecha ?? null,
      por_cadena:  cadenaR.rows.map(r => ({
        cadena:     r.cadena,
        valor_2026: parseFloat(r.valor_2026 ?? '0'),
        uni_2026:   parseInt(r.uni_2026 ?? '0'),
        valor_2025: parseFloat(r.valor_2025 ?? '0'),
        delta: parseFloat(r.valor_2025 ?? '0') > 0
          ? ((parseFloat(r.valor_2026 ?? '0') - parseFloat(r.valor_2025 ?? '0')) / parseFloat(r.valor_2025)) * 100
          : null,
      })),
      por_categoria: catR.rows.map(r => ({
        categoria:  r.categoria,
        valor_2026: parseFloat(r.valor_2026 ?? '0'),
        uni_2026:   parseInt(r.uni_2026 ?? '0'),
      })),
      monthly: Object.values(monthly),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
