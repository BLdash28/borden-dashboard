import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

/**
 * Top SKUs Unisuper GT — para tabla + chart Pareto.
 * Devuelve top N ordenados por ventas 2026, con cum_share para la curva.
 */
function csv(sp: URLSearchParams, key: string): string[] {
  const v = sp.get(key)
  return v ? v.split(',').map(s => s.trim()).filter(Boolean) : []
}

function buildWhere(sp: URLSearchParams) {
  const params: unknown[] = []
  const conds: string[] = [`pais = 'GT'`]

  const cadenas = csv(sp, 'cadenas')
  if (cadenas.length) {
    const start = params.length
    cadenas.forEach(v => params.push(v))
    conds.push(`cadena IN (${cadenas.map((_, i) => `$${start + 1 + i}`).join(',')})`)
  }
  const subcats = csv(sp, 'subcategorias')
  if (subcats.length) {
    const start = params.length
    subcats.forEach(v => params.push(v))
    conds.push(`subcategoria IN (${subcats.map((_, i) => `$${start + 1 + i}`).join(',')})`)
  }
  const pdvs = csv(sp, 'punto_venta')
  if (pdvs.length) {
    const start = params.length
    pdvs.forEach(v => params.push(v))
    conds.push(`nombre_sucursal IN (${pdvs.map((_, i) => `$${start + 1 + i}`).join(',')})`)
  }
  return { where: conds.join(' AND '), params }
}

export async function GET(req: NextRequest) {
  try {
    const sp  = req.nextUrl.searchParams
    const top = Math.min(parseInt(sp.get('top') ?? '20'), 200)
    const w   = buildWhere(sp)

    const { rows } = await pool.query(`
      WITH cur AS (
        SELECT sku,
          MAX(descripcion) AS descripcion,
          MAX(subcategoria) AS subcategoria,
          ROUND(SUM(ventas_valor)::numeric, 2)    AS valor_2026,
          ROUND(SUM(ventas_unidades)::numeric, 0) AS uni_2026
        FROM fact_ventas_unisuper
        WHERE ${w.where} AND EXTRACT(YEAR FROM fecha) = 2026 AND ventas_unidades > 0
        GROUP BY sku
      ),
      prev AS (
        SELECT sku,
          ROUND(SUM(ventas_valor)::numeric, 2) AS valor_2025
        FROM fact_ventas_unisuper
        WHERE ${w.where} AND EXTRACT(YEAR FROM fecha) = 2025 AND ventas_unidades > 0
        GROUP BY sku
      ),
      total AS (SELECT SUM(valor_2026) AS grand_total FROM cur)
      SELECT c.sku, c.descripcion, c.subcategoria,
             c.valor_2026, c.uni_2026,
             COALESCE(p.valor_2025, 0) AS valor_2025,
             CASE WHEN COALESCE(p.valor_2025, 0) > 0
                  THEN ROUND(((c.valor_2026 - p.valor_2025) / p.valor_2025 * 100)::numeric, 1)
                  ELSE NULL END AS delta,
             CASE WHEN t.grand_total > 0
                  THEN ROUND((c.valor_2026 / t.grand_total * 100)::numeric, 1)
                  ELSE 0 END AS share_pct
      FROM cur c
      CROSS JOIN total t
      LEFT JOIN prev p ON p.sku = c.sku
      ORDER BY c.valor_2026 DESC
      LIMIT ${top}
    `, w.params)

    let cumShare = 0
    const result = rows.map((r: any) => {
      cumShare += parseFloat(r.share_pct ?? '0')
      return {
        descripcion: r.descripcion,
        sku:         r.sku,
        subcategoria: r.subcategoria,
        valor_2026:  parseFloat(r.valor_2026 ?? '0'),
        uni_2026:    parseInt(r.uni_2026 ?? '0'),
        valor_2025:  parseFloat(r.valor_2025 ?? '0'),
        delta:       r.delta !== null ? parseFloat(r.delta) : null,
        share_pct:   parseFloat(r.share_pct ?? '0'),
        cum_share:   Math.min(parseFloat(cumShare.toFixed(1)), 100),
      }
    })

    return NextResponse.json({ rows: result, total: result.length })
  } catch (err) {
    return handleApiError(err)
  }
}
