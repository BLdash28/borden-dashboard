import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

const MN = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export async function GET(req: NextRequest) {
  try {
    const sp     = req.nextUrl.searchParams
    const cats   = sp.get('categoria')    ? sp.get('categoria')!.split(',').filter(Boolean) : []
    const subcats = sp.get('subcategoria') ? sp.get('subcategoria')!.split(',').filter(Boolean) : []

    const catFilter    = cats.length   ? `AND categoria    IN (${cats.map(c   => `'${c.replace(/'/g,"''")}'`).join(',')})` : ''
    const subcatFilter = subcats.length ? `AND subcategoria IN (${subcats.map(s => `'${s.replace(/'/g,"''")}'`).join(',')})` : ''

    const [monthlyR, baselineR] = await Promise.all([
      pool.query(`
        SELECT
          EXTRACT(YEAR  FROM fecha)::int AS ano,
          EXTRACT(MONTH FROM fecha)::int AS mes,
          ROUND(SUM(ventas_valor)::numeric,    2) AS valor,
          ROUND(SUM(ventas_unidades)::numeric, 0) AS unidades
        FROM fact_ventas_selectos
        WHERE fecha >= '2024-01-01' AND fecha < '2027-01-01'
          ${catFilter} ${subcatFilter}
        GROUP BY 1, 2
        ORDER BY 1, 2
      `),
      pool.query(`
        WITH monthly AS (
          SELECT
            EXTRACT(MONTH FROM fecha)::int AS mes,
            SUM(ventas_valor)    AS valor_mes,
            SUM(ventas_unidades) AS uni_mes
          FROM fact_ventas_selectos
          WHERE fecha >= '2025-10-01' AND fecha < '2027-01-01'
          ${catFilter} ${subcatFilter}
          GROUP BY 1
          HAVING SUM(ventas_valor) >= 5000
        )
        SELECT
          COALESCE(AVG(valor_mes), 0) AS avg_val,
          COALESCE(AVG(uni_mes),   0) AS avg_uni
        FROM monthly
      `),
    ])

    const baseline_val = parseFloat(baselineR.rows[0]?.avg_val ?? '0') || 0
    const baseline_uni = parseFloat(baselineR.rows[0]?.avg_uni ?? '0') || 0

    type Row = { mes: number; mes_nombre: string; y2024: number; y2025: number; y2026: number | null; u2024: number; u2025: number; u2026: number | null }
    const byMes: Record<number, Row> = {}
    for (let m = 1; m <= 12; m++) {
      byMes[m] = { mes: m, mes_nombre: MN[m], y2024: 0, y2025: 0, y2026: null, u2024: 0, u2025: 0, u2026: null }
    }
    for (const row of monthlyR.rows) {
      const m = parseInt(row.mes)
      const a = parseInt(row.ano)
      if (!byMes[m]) continue
      if (a === 2024) { byMes[m].y2024 = parseFloat(row.valor); byMes[m].u2024 = parseFloat(row.unidades) }
      if (a === 2025) { byMes[m].y2025 = parseFloat(row.valor); byMes[m].u2025 = parseFloat(row.unidades) }
      if (a === 2026) { byMes[m].y2026 = parseFloat(row.valor); byMes[m].u2026 = parseFloat(row.unidades) }
    }

    const meses2026 = monthlyR.rows.filter(r => parseInt(r.ano) === 2026 && parseFloat(r.valor) > 0)
    const ultimoMes = meses2026.length > 0 ? Math.max(...meses2026.map(r => parseInt(r.mes))) : 0

    for (let m = ultimoMes + 1; m <= 12; m++) {
      byMes[m].y2026 = null
      byMes[m].u2026 = null
    }

    const oosMeses: string[] = []
    for (let m = 1; m <= ultimoMes; m++) {
      if (baseline_val > 0 && (byMes[m].y2026 ?? 0) < baseline_val * 0.3) {
        oosMeses.push(MN[m])
      }
    }

    const ytd2026 = Object.values(byMes).filter(r => r.mes <= ultimoMes).reduce((s, r) => s + (r.y2026 ?? 0), 0)
    const ytd2025 = Object.values(byMes).filter(r => r.mes <= ultimoMes).reduce((s, r) => s + r.y2025, 0)
    const delta_ytd = ytd2025 > 0 ? ((ytd2026 - ytd2025) / ytd2025) * 100 : (ytd2026 > 0 ? 100 : 0)

    return NextResponse.json({
      series: Object.values(byMes),
      baseline_val,
      baseline_uni,
      ytd_2026: ytd2026,
      ytd_2025: ytd2025,
      delta_ytd,
      oos_meses: oosMeses,
      ultimo_mes: ultimoMes,
      ultimo_mes_nombre: MN[ultimoMes] ?? '',
    })
  } catch (err) {
    return handleApiError(err)
  }
}
