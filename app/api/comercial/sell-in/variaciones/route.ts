import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sp     = req.nextUrl.searchParams
    const dim    = sp.get('dim') || 'cliente'   // cliente | categoria
    const paises = sp.get('pais') ? sp.get('pais')!.split(',').filter(Boolean) : []
    const mesesP = sp.get('meses') || ''

    const inC = (col: string, vals: string[]) =>
      `${col} IN (${vals.map(v => `'${v.replace(/'/g,"''")}'`).join(',')})`

    const extra: string[] = []
    if (paises.length) extra.push(inC('pais', paises))
    if (mesesP) {
      const ms = mesesP.split(',').map(Number).filter(n => n >= 1 && n <= 12)
      if (ms.length) extra.push(`mes IN (${ms.join(',')})`)
    }
    const and = extra.length ? 'AND ' + extra.join(' AND ') : ''

    const dimCol = dim === 'categoria' ? 'categoria' : 'cliente_nombre'

    const r = await pool.query(`
      SELECT
        ${dimCol}                                   AS dim,
        ano,
        ROUND(SUM(venta_neta)::numeric, 2)          AS ingresos,
        ROUND(SUM(cantidad_unidades)::numeric, 0)   AS unidades,
        ROUND(SUM(margen_valor)::numeric, 2)        AS margen
      FROM fact_sales_sellin
      WHERE ano IN (2024, 2025, 2026) ${and}
      GROUP BY ${dimCol}, ano
      ORDER BY ${dimCol}, ano
    `)

    // Pivot por dim → { dim, y2024, y2025, y2026 }
    const map: Record<string, { y2024: number; y2025: number; y2026: number }> = {}
    for (const row of r.rows) {
      const key = row.dim || '—'
      if (!map[key]) map[key] = { y2024: 0, y2025: 0, y2026: 0 }
      map[key][`y${row.ano}` as 'y2024' | 'y2025' | 'y2026'] = parseFloat(row.ingresos)
    }

    const rows = Object.entries(map)
      .map(([dim, v]) => ({
        dim,
        y2024: v.y2024,
        y2025: v.y2025,
        y2026: v.y2026,
        var_2524: v.y2024 > 0 ? ((v.y2025 - v.y2024) / v.y2024) * 100 : null,
        var_2625: v.y2025 > 0 ? ((v.y2026 - v.y2025) / v.y2025) * 100 : null,
        presupuesto: 0,
      }))
      .sort((a, b) => b.y2026 - a.y2026)

    const totals = rows.reduce((acc, r) => ({
      y2024: acc.y2024 + r.y2024,
      y2025: acc.y2025 + r.y2025,
      y2026: acc.y2026 + r.y2026,
    }), { y2024: 0, y2025: 0, y2026: 0 })

    return NextResponse.json({ rows, totals, dim })
  } catch (err) {
    return handleApiError(err)
  }
}
