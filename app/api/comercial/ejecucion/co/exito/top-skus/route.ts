import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'
import { parseExitoFilters, buildExitoWhere } from '@/lib/api/exito-filtros'

export const revalidate = 300

export async function GET(req: NextRequest) {
  try {
    const top = parseInt(req.nextUrl.searchParams.get('top') ?? '15')
    const f   = parseExitoFilters(req)

    // WHERE parametrizado sobre alias 'f' (fact_ventas_exito)
    // Nota: los filtros aplican al fact via JOIN; el catálogo dim_producto_co
    // solo se restringe por categoría si viene explícita.
    const w = buildExitoWhere(f, { alias: 'f', startAt: 2 })   // $1 reservado para top

    const r = await pool.query(`
      WITH ult AS (
        SELECT COALESCE(MAX(mes), 12) AS m
        FROM mv_exito_mensual f
        WHERE f.pais='CO' AND f.ano=2026 AND ${w.where}
      ),
      agg AS (
        SELECT
          d.sku,
          d.descripcion,
          d.categoria,
          COALESCE(SUM(CASE WHEN f.ano=2026 THEN f.ventas_valorusd ELSE 0 END), 0) AS valor_2026,
          COALESCE(SUM(CASE WHEN f.ano=2026 THEN f.venta_valorcop  ELSE 0 END), 0) AS valor_2026_cop,
          COALESCE(SUM(CASE WHEN f.ano=2026 THEN f.ventas_unidades ELSE 0 END), 0) AS uni_2026,
          COALESCE(SUM(CASE WHEN f.ano=2025 AND f.mes <= (SELECT m FROM ult) THEN f.ventas_valorusd ELSE 0 END), 0) AS valor_2025,
          COALESCE(SUM(CASE WHEN f.ano=2025 AND f.mes <= (SELECT m FROM ult) THEN f.venta_valorcop  ELSE 0 END), 0) AS valor_2025_cop,
          COALESCE(SUM(CASE WHEN f.ano=2025 AND f.mes <= (SELECT m FROM ult) THEN f.ventas_unidades ELSE 0 END), 0) AS uni_2025
        FROM dim_producto_co d
        LEFT JOIN fact_ventas_exito f
          ON f.sku = d.sku
         AND f.pais = 'CO' AND f.ano IN (2025, 2026)
         AND ${w.where}
        ${f.categoria ? `WHERE d.categoria = $${w.next}` : ''}
        GROUP BY d.sku, d.descripcion, d.categoria
      )
      SELECT * FROM agg
      ORDER BY valor_2026 DESC, valor_2025 DESC
      LIMIT $1
    `, [top, ...w.params, ...(f.categoria ? [f.categoria] : [])])

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
