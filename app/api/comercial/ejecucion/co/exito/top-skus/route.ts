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

    // Partimos del catálogo oficial dim_producto_co (los 13 SKUs reales de Éxito)
    // y hacemos LEFT JOIN a fact_ventas. Así:
    //   - Aparecen SIEMPRE los 13 SKUs oficiales (incl. innovaciones sin ventas).
    //   - SKUs fantasma en fact_ventas que no están en dim_producto_co quedan afuera.
    const r = await pool.query(`
      WITH ult AS (
        SELECT COALESCE(MAX(mes), 12) AS m
        FROM fact_ventas_exito
        WHERE pais='CO' AND ano=2026 ${catFilter} ${cadFilter}
      ),
      agg AS (
        SELECT
          d.sku,
          d.descripcion,
          d.categoria,
          COALESCE(SUM(CASE WHEN f.ano=2026 THEN f.ventas_valorusd ELSE 0 END), 0) AS valor_2026,
          COALESCE(SUM(CASE WHEN f.ano=2026 THEN f.venta_valorcop  ELSE 0 END), 0) AS valor_2026_cop,
          COALESCE(SUM(CASE WHEN f.ano=2026 THEN f.ventas_unidades  ELSE 0 END), 0) AS uni_2026,
          COALESCE(SUM(CASE WHEN f.ano=2025 AND f.mes <= (SELECT m FROM ult) THEN f.ventas_valorusd ELSE 0 END), 0) AS valor_2025,
          COALESCE(SUM(CASE WHEN f.ano=2025 AND f.mes <= (SELECT m FROM ult) THEN f.venta_valorcop  ELSE 0 END), 0) AS valor_2025_cop,
          COALESCE(SUM(CASE WHEN f.ano=2025 AND f.mes <= (SELECT m FROM ult) THEN f.ventas_unidades  ELSE 0 END), 0) AS uni_2025
        FROM dim_producto_co d
        LEFT JOIN fact_ventas_exito f
          ON f.sku = d.sku
         AND f.pais = 'CO' AND f.ano IN (2025, 2026)
         ${catFilter ? `AND f.${catFilter.slice(4)}` : ''}
         ${cadFilter ? `AND f.${cadFilter.slice(4)}` : ''}
        ${categoria ? `WHERE d.categoria = '${categoria.replace(/'/g, "''")}'` : ''}
        GROUP BY d.sku, d.descripcion, d.categoria
      )
      SELECT * FROM agg
      ORDER BY valor_2026 DESC, valor_2025 DESC
      LIMIT $1
    `, [top])

    const rows = r.rows.map(x => ({
      sku:            x.sku,
      descripcion:    x.descripcion ?? x.sku,
      categoria:      x.categoria ?? '',
      valor_2026:     parseFloat(x.valor_2026 ?? '0'),
      valor_2026_cop: parseFloat(x.valor_2026_cop ?? '0'),
      uni_2026:       parseInt(x.uni_2026 ?? '0'),
      valor_2025:     parseFloat(x.valor_2025 ?? '0'),
      valor_2025_cop: parseFloat(x.valor_2025_cop ?? '0'),
      uni_2025:       parseInt(x.uni_2025 ?? '0'),
      delta:          parseFloat(x.valor_2025 ?? '0') > 0
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
