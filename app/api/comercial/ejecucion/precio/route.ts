import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sp   = req.nextUrl.searchParams
    const pais = sp.get('pais') || ''
    const cat  = sp.get('categoria') || ''

    const filters: string[] = []
    if (pais) filters.push(`pais = '${pais.replace(/'/g,"''")}'`)
    if (cat)  filters.push(`categoria = '${cat.replace(/'/g,"''")}'`)
    const and = filters.length ? 'AND ' + filters.join(' AND ') : ''

    const r = await pool.query(`
      SELECT
        sku,
        MAX(descripcion) AS descripcion,
        MAX(categoria)   AS categoria,
        ROUND(AVG(CASE WHEN ano = 2024 THEN precio_promedio END)::numeric, 4) AS precio_2024,
        ROUND(AVG(CASE WHEN ano = 2025 THEN precio_promedio END)::numeric, 4) AS precio_2025,
        ROUND(AVG(CASE WHEN ano = 2026 THEN precio_promedio END)::numeric, 4) AS precio_2026,
        ROUND(SUM(CASE WHEN ano = 2026 THEN ventas_unidades ELSE 0 END)::numeric, 0) AS u2026,
        ROUND(SUM(CASE WHEN ano = 2026 THEN ventas_valor    ELSE 0 END)::numeric, 2) AS v2026
      FROM fact_sales_sellout
      WHERE ano IN (2024, 2025, 2026) ${and}
      GROUP BY sku
      HAVING SUM(CASE WHEN ano = 2026 THEN ventas_unidades ELSE 0 END) > 0
      ORDER BY v2026 DESC
      LIMIT 200
    `)

    const rows = r.rows.map(row => {
      const p24 = parseFloat(row.precio_2024) || null
      const p25 = parseFloat(row.precio_2025) || null
      const p26 = parseFloat(row.precio_2026) || null
      return {
        sku:         row.sku,
        descripcion: row.descripcion,
        categoria:   row.categoria,
        precio_2024: p24,
        precio_2025: p25,
        precio_2026: p26,
        var_precio:  p25 && p26 ? ((p26 - p25) / p25) * 100 : null,
        u2026:       parseInt(row.u2026),
        v2026:       parseFloat(row.v2026),
      }
    })

    return NextResponse.json({ rows })
  } catch (err) {
    return handleApiError(err)
  }
}
