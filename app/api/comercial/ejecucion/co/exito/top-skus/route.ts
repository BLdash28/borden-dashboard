import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

export async function GET(req: NextRequest) {
  try {
    const categoria = req.nextUrl.searchParams.get('categoria') ?? ''
    const cadena    = req.nextUrl.searchParams.get('cadena') ?? ''
    const top       = parseInt(req.nextUrl.searchParams.get('top') ?? '15')
    const catFilter = categoria ? `AND categoria = '${categoria.replace(/'/g, "''")}'` : ''
    const cadFilter = cadena    ? `AND cadena    = '${cadena.replace(/'/g, "''")}'`    : ''

    // Top SKUs YTD 2026 + YTD 2025 (mismo período)
    const r = await pool.query(`
      WITH ult AS (
        SELECT COALESCE(MAX(mes), 12) AS m
        FROM fact_ventas_exito
        WHERE pais='CO' AND ano=2026 ${catFilter} ${cadFilter}
      ),
      agg AS (
        SELECT
          sku,
          MAX(descripcion) AS descripcion,
          MAX(categoria)   AS categoria,
          SUM(CASE WHEN ano=2026 THEN ventas_valorusd ELSE 0 END) AS valor_2026,
          SUM(CASE WHEN ano=2026 THEN ventas_unidades ELSE 0 END) AS uni_2026,
          SUM(CASE WHEN ano=2025 AND mes <= (SELECT m FROM ult) THEN ventas_valorusd ELSE 0 END) AS valor_2025,
          SUM(CASE WHEN ano=2025 AND mes <= (SELECT m FROM ult) THEN ventas_unidades ELSE 0 END) AS uni_2025
        FROM fact_ventas_exito
        WHERE pais='CO' AND ano IN (2025, 2026)
          AND sku IS NOT NULL AND sku <> ''
          ${catFilter} ${cadFilter}
        GROUP BY sku
      )
      SELECT * FROM agg
      WHERE valor_2026 > 0
      ORDER BY valor_2026 DESC
      LIMIT $1
    `, [top])

    const rows = r.rows.map(x => ({
      sku:         x.sku,
      descripcion: x.descripcion ?? x.sku,
      categoria:   x.categoria ?? '',
      valor_2026:  parseFloat(x.valor_2026 ?? '0'),
      uni_2026:    parseInt(x.uni_2026 ?? '0'),
      valor_2025:  parseFloat(x.valor_2025 ?? '0'),
      uni_2025:    parseInt(x.uni_2025 ?? '0'),
      delta:       parseFloat(x.valor_2025 ?? '0') > 0
        ? ((parseFloat(x.valor_2026) - parseFloat(x.valor_2025)) / parseFloat(x.valor_2025)) * 100
        : null,
    }))
    const total = rows.reduce((s, r) => s + r.valor_2026, 0)
    let acum = 0
    for (const x of rows) {
      const sp = total > 0 ? (x.valor_2026 / total) * 100 : 0
      acum += sp
      ;(x as any).share_pct = sp
      ;(x as any).cum_share = acum
    }

    return NextResponse.json({ rows })
  } catch (err) {
    return handleApiError(err)
  }
}
