import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 0

const inC = (col: string, vals: string[]) =>
  `${col} IN (${vals.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`

export async function GET(req: NextRequest) {
  try {
    const sp     = req.nextUrl.searchParams
    const dim    = sp.get('dim') || 'cliente'
    const paises = sp.get('pais') ? sp.get('pais')!.split(',').filter(Boolean) : []

    // Determinar meses de los últimos 90 días (en 2026)
    const today       = new Date()
    const ninetyAgo   = new Date(); ninetyAgo.setDate(today.getDate() - 90)
    const meses: number[] = []
    const walker = new Date(ninetyAgo.getFullYear(), ninetyAgo.getMonth(), 1)
    while (walker <= today) {
      // Solo incluir meses dentro del año en curso (2026)
      if (walker.getFullYear() === today.getFullYear()) {
        meses.push(walker.getMonth() + 1)
      }
      walker.setMonth(walker.getMonth() + 1)
    }
    if (meses.length === 0) meses.push(today.getMonth() + 1)

    const mesSql   = `mes IN (${meses.join(',')})`
    const paisCond = paises.length ? 'AND ' + inC('pais', paises) : ''

    const dimColNew = dim === 'categoria' ? 'categoria' : 'cliente_nombre'
    const dimColOld = dim === 'categoria' ? 'categoria' : 'cliente'

    // Query combinada: fact_sales_sellin (2026) + ventas_sell_in (2025, solo meses no cubiertos por 2026)
    const r = await pool.query(`
      SELECT dim, ano, mes, ROUND(SUM(ingresos)::numeric, 2) AS ingresos
      FROM (
        SELECT ${dimColNew} AS dim, ano, mes, venta_neta AS ingresos
        FROM fact_sales_sellin
        WHERE ano = 2026 AND ${mesSql} ${paisCond}

        UNION ALL

        SELECT ${dimColOld} AS dim, 2025 AS ano, mes, ingresos
        FROM ventas_sell_in
        WHERE ano = 2025 AND ${mesSql} ${paisCond}
          AND mes NOT IN (
            SELECT DISTINCT mes FROM fact_sales_sellin WHERE ano = 2026
          )
      ) sub
      WHERE dim IS NOT NULL AND dim <> ''
      GROUP BY dim, ano, mes
      ORDER BY dim, ano, mes
    `)

    // Pivot: dim → mes → { y2025, y2026 }
    const map: Record<string, Record<number, { y2025: number; y2026: number }>> = {}
    for (const row of r.rows) {
      const d = row.dim as string
      const m = parseInt(row.mes)
      const a = parseInt(row.ano)
      if (!map[d]) map[d] = {}
      if (!map[d][m]) map[d][m] = { y2025: 0, y2026: 0 }
      if (a === 2025) map[d][m].y2025 = parseFloat(row.ingresos)
      if (a === 2026) map[d][m].y2026 = parseFloat(row.ingresos)
    }

    const rows = Object.entries(map).map(([dim, mesData]) => {
      let total2025 = 0, total2026 = 0
      const mesesRow: Record<number, { y2025: number; y2026: number; var: number | null }> = {}
      for (const m of meses) {
        const d = mesData[m] ?? { y2025: 0, y2026: 0 }
        total2025 += d.y2025
        total2026 += d.y2026
        mesesRow[m] = {
          y2025: d.y2025,
          y2026: d.y2026,
          var: d.y2025 > 0 ? ((d.y2026 - d.y2025) / d.y2025) * 100 : null,
        }
      }
      return {
        dim,
        meses: mesesRow,
        total2025,
        total2026,
        varTotal: total2025 > 0 ? ((total2026 - total2025) / total2025) * 100 : null,
      }
    }).sort((a, b) => b.total2026 - a.total2026)

    // Totales generales
    const totals = rows.reduce((acc, r) => {
      const t = { total2025: acc.total2025 + r.total2025, total2026: acc.total2026 + r.total2026, meses: { ...acc.meses } }
      for (const m of meses) {
        if (!t.meses[m]) t.meses[m] = { y2025: 0, y2026: 0 }
        t.meses[m].y2025 += r.meses[m]?.y2025 ?? 0
        t.meses[m].y2026 += r.meses[m]?.y2026 ?? 0
      }
      return t
    }, { total2025: 0, total2026: 0, meses: {} as Record<number, { y2025: number; y2026: number }> })

    return NextResponse.json({ rows, totals, meses, dim })
  } catch (err) {
    return handleApiError(err)
  }
}
