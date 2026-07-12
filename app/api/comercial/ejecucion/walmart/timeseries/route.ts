import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'
import { CADENA_NORM_SQL } from '@/lib/db/walmart-cadena'
import { parseWalmartFilters, buildWalmartWhere } from '@/lib/api/walmart-filtros'

export const revalidate = 300

const MN = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

export async function GET(req: NextRequest) {
  try {
    const sp   = req.nextUrl.searchParams
    const pais = sp.get('pais') ?? 'CR'
    const f    = parseWalmartFilters(req)
    const w    = buildWalmartWhere(f, { startAt: 2 })
    // Vista "por cadena": mostrar todas aunque haya filtro de cadena
    const wSinCad = buildWalmartWhere({ ...f, cadenas: [] }, { startAt: 2 })
    // Vista "por categoria": mostrar todas aunque haya filtro de categoria
    const wSinCat = buildWalmartWhere({ ...f, categoria: '', categorias: [] }, { startAt: 2 })

    const [monthlyR, byCadenaR, byCatR, baselineR] = await Promise.all([
      // Overall monthly 2024/2025/2026
      pool.query(`
        SELECT
          EXTRACT(YEAR  FROM fecha)::int  AS ano,
          EXTRACT(MONTH FROM fecha)::int  AS mes,
          ROUND(SUM(ventas_valor)::numeric,    2) AS valor,
          ROUND(SUM(ventas_unidades)::numeric, 0) AS unidades
        FROM fact_ventas_walmart
        WHERE pais = $1 AND ${w.where}
          AND fecha >= '2024-01-01' AND fecha < '2027-01-01'
        GROUP BY 1, 2
        ORDER BY 1, 2
      `, [pais, ...w.params]),
      // Monthly by cadena (2026 only) — no filtramos por cadena aquí
      pool.query(`
        SELECT
          ${CADENA_NORM_SQL} AS cadena,
          EXTRACT(MONTH FROM fecha)::int AS mes,
          ROUND(SUM(ventas_valor)::numeric, 2) AS valor
        FROM fact_ventas_walmart
        WHERE pais = $1
          AND fecha >= '2026-01-01' AND fecha < '2027-01-01'
          AND ${wSinCad.where}
        GROUP BY ${CADENA_NORM_SQL}, mes
        ORDER BY ${CADENA_NORM_SQL}, mes
      `, [pais, ...wSinCad.params]),
      // Monthly by categoria (2026 only) — no filtramos por categoria aquí
      pool.query(`
        SELECT
          categoria,
          EXTRACT(MONTH FROM fecha)::int AS mes,
          ROUND(SUM(ventas_valor)::numeric, 2) AS valor
        FROM fact_ventas_walmart
        WHERE pais = $1
          AND fecha >= '2026-01-01' AND fecha < '2027-01-01'
          AND ${wSinCat.where}
        GROUP BY categoria, mes
        ORDER BY categoria, mes
      `, [pais, ...wSinCat.params]),
      // Baseline: avg monthly value for months ≥$5K from Oct 2025 onwards
      pool.query(`
        WITH monthly AS (
          SELECT
            EXTRACT(MONTH FROM fecha)::int AS mes,
            SUM(ventas_valor)    AS valor_mes,
            SUM(ventas_unidades) AS uni_mes
          FROM fact_ventas_walmart
          WHERE pais = $1
            AND fecha >= '2025-10-01' AND fecha < '2027-01-01'
            AND ${w.where}
          GROUP BY 1
          HAVING SUM(ventas_valor) >= 5000
        )
        SELECT
          COALESCE(AVG(valor_mes), 0) AS avg_val,
          COALESCE(AVG(uni_mes),   0) AS avg_uni
        FROM monthly
      `, [pais, ...w.params]),
    ])

    const baseline_val = parseFloat(baselineR.rows[0]?.avg_val ?? '0') || 0
    const baseline_uni = parseFloat(baselineR.rows[0]?.avg_uni ?? '0') || 0

    // Build overall monthly series (2024/2025/2026)
    type Row = { mes: number; mes_nombre: string; y2024: number; y2025: number; y2026: number | null; u2024: number; u2025: number; u2026: number | null }
    const byMes: Record<number, Row> = {}
    for (let m = 1; m <= 12; m++) {
      byMes[m] = { mes: m, mes_nombre: MN[m], y2024: 0, y2025: 0, y2026: null, u2024: 0, u2025: 0, u2026: null }
    }
    for (const r of monthlyR.rows) {
      const m = parseInt(r.mes); const a = parseInt(r.ano)
      if (a === 2024) { byMes[m].y2024 = parseFloat(r.valor); byMes[m].u2024 = parseFloat(r.unidades) }
      if (a === 2025) { byMes[m].y2025 = parseFloat(r.valor); byMes[m].u2025 = parseFloat(r.unidades) }
      if (a === 2026) { byMes[m].y2026 = parseFloat(r.valor); byMes[m].u2026 = parseFloat(r.unidades) }
    }
    const meses2026 = monthlyR.rows.filter(r => parseInt(r.ano) === 2026 && parseFloat(r.valor) > 0)
    const ultimoMes = meses2026.length > 0 ? Math.max(...meses2026.map(r => parseInt(r.mes))) : 0
    for (let m = ultimoMes + 1; m <= 12; m++) { byMes[m].y2026 = null; byMes[m].u2026 = null }

    // Build by-cadena series
    const cadenas = [...new Set(byCadenaR.rows.map(r => r.cadena as string))]
    const byCadenaSeries: Record<number, Record<string, any>> = {}
    for (let m = 1; m <= 12; m++) {
      byCadenaSeries[m] = { mes: m, mes_nombre: MN[m] }
      for (const c of cadenas) byCadenaSeries[m][c] = null
    }
    for (const r of byCadenaR.rows) {
      const m = parseInt(r.mes)
      byCadenaSeries[m][r.cadena] = parseFloat(r.valor)
    }

    // Build by-categoria series
    const cats = [...new Set(byCatR.rows.map(r => r.categoria as string))]
    const byCatSeries: Record<number, Record<string, any>> = {}
    for (let m = 1; m <= 12; m++) {
      byCatSeries[m] = { mes: m, mes_nombre: MN[m] }
      for (const c of cats) byCatSeries[m][c] = null
    }
    for (const r of byCatR.rows) {
      const m = parseInt(r.mes)
      byCatSeries[m][r.categoria] = parseFloat(r.valor)
    }

    // OOS detection: months with <30% of baseline
    const oosMeses: string[] = []
    for (let m = 1; m <= ultimoMes; m++) {
      if (baseline_val > 0 && (byMes[m].y2026 ?? 0) < baseline_val * 0.3) {
        oosMeses.push(MN[m])
      }
    }

    // YTD
    const ytd2026 = Object.values(byMes).filter(r => r.mes <= ultimoMes).reduce((s, r) => s + (r.y2026 ?? 0), 0)
    const ytd2025 = Object.values(byMes).filter(r => r.mes <= ultimoMes).reduce((s, r) => s + r.y2025, 0)
    const delta_ytd = ytd2025 > 0 ? ((ytd2026 - ytd2025) / ytd2025) * 100 : (ytd2026 > 0 ? 100 : 0)

    return NextResponse.json({
      series:            Object.values(byMes),
      baseline_val,
      baseline_uni,
      ytd_2026:          ytd2026,
      ytd_2025:          ytd2025,
      delta_ytd,
      oos_meses:         oosMeses,
      ultimo_mes:        ultimoMes,
      ultimo_mes_nombre: MN[ultimoMes] ?? '',
      cadenas,
      byCadena:          Object.values(byCadenaSeries),
      categorias:        cats,
      byCategorias:      Object.values(byCatSeries),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
