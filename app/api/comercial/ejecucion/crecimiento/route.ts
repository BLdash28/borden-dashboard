import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

export async function GET(req: NextRequest) {
  try {
    const sp     = req.nextUrl.searchParams
    const paises = sp.get('pais')      ? sp.get('pais')!.split(',').filter(Boolean)      : []
    const cats   = sp.get('categoria') ? sp.get('categoria')!.split(',').filter(Boolean) : []

    const inC = (col: string, vals: string[]) =>
      `${col} IN (${vals.map(v => `'${v.replace(/'/g,"''")}'`).join(',')})`

    const filters: string[] = []
    if (paises.length) filters.push(inC('pais', paises))
    if (cats.length)   filters.push(inC('categoria', cats))
    const and = filters.length ? 'AND ' + filters.join(' AND ') : ''

    const r = await pool.query(`
      SELECT
        sku,
        MAX(descripcion) AS descripcion,
        MAX(categoria)   AS categoria,
        ROUND(SUM(CASE WHEN ano = 2024 THEN ventas_valor    ELSE 0 END)::numeric, 2) AS y2024,
        ROUND(SUM(CASE WHEN ano = 2025 THEN ventas_valor    ELSE 0 END)::numeric, 2) AS y2025,
        ROUND(SUM(CASE WHEN ano = 2026 THEN ventas_valor    ELSE 0 END)::numeric, 2) AS y2026,
        ROUND(SUM(CASE WHEN ano = 2025 THEN ventas_unidades ELSE 0 END)::numeric, 0) AS u2025,
        ROUND(SUM(CASE WHEN ano = 2026 THEN ventas_unidades ELSE 0 END)::numeric, 0) AS u2026
      FROM mv_sellout_mensual
      WHERE ano IN (2024, 2025, 2026) ${and}
      GROUP BY sku
      HAVING SUM(CASE WHEN ano = 2026 THEN ventas_valor ELSE 0 END) > 0
        OR   SUM(CASE WHEN ano = 2025 THEN ventas_valor ELSE 0 END) > 0
      ORDER BY y2026 DESC
      LIMIT 200
    `)

    const rows = r.rows.map(row => {
      const y25 = parseFloat(row.y2025)
      const y26 = parseFloat(row.y2026)
      const y24 = parseFloat(row.y2024)
      return {
        sku:         row.sku,
        descripcion: row.descripcion,
        categoria:   row.categoria,
        y2024:       y24,
        y2025:       y25,
        y2026:       y26,
        u2025:       parseInt(row.u2025),
        u2026:       parseInt(row.u2026),
        var_2524:    y24 > 0 ? ((y25 - y24) / y24) * 100 : null,
        var_2625:    y25 > 0 ? ((y26 - y25) / y25) * 100 : (y26 > 0 ? 100 : null),
      }
    }).sort((a, b) => (b.var_2625 ?? -999) - (a.var_2625 ?? -999))

    return NextResponse.json({ rows })
  } catch (err) {
    return handleApiError(err)
  }
}
