import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

const MN = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export async function GET(req: NextRequest) {
  try {
    const sp       = req.nextUrl.searchParams
    const pais     = sp.get('pais')      ?? 'CR'
    const cat      = sp.get('categoria') ?? ''
    const topN     = Math.min(Math.max(parseInt(sp.get('top') ?? '5'), 1), 200)
    const paisSafe = pais.replace(/'/g, "''")
    const catFilter = cat ? `AND categoria = '${cat.replace(/'/g, "''")}'` : ''

    const { rows } = await pool.query(`
      WITH top_skus AS (
        SELECT codigo_barras, SUM(ventas_valor) AS total
        FROM fact_ventas_walmart
        WHERE pais = '${paisSafe}' AND EXTRACT(YEAR FROM fecha) = 2026 ${catFilter}
        GROUP BY codigo_barras
        ORDER BY total DESC
        LIMIT ${topN}
      )
      SELECT
        f.codigo_barras                    AS sku,
        MAX(f.descripcion)                 AS descripcion,
        MAX(f.categoria)                   AS categoria,
        EXTRACT(MONTH FROM f.fecha)::int   AS mes,
        ROUND(SUM(f.ventas_valor)::numeric,    2) AS valor,
        ROUND(SUM(f.ventas_unidades)::numeric, 0) AS unidades
      FROM fact_ventas_walmart f
      JOIN top_skus t ON t.codigo_barras = f.codigo_barras
      WHERE f.pais = '${paisSafe}' AND EXTRACT(YEAR FROM f.fecha) = 2026 ${catFilter}
      GROUP BY f.codigo_barras, EXTRACT(MONTH FROM f.fecha)
      ORDER BY f.codigo_barras, mes
    `)

    const skuMap: Record<string, { sku: string; descripcion: string; categoria: string; series: { mes: number; mes_nombre: string; valor: number; unidades: number }[] }> = {}
    for (const row of rows) {
      if (!skuMap[row.sku]) {
        skuMap[row.sku] = { sku: row.sku, descripcion: row.descripcion, categoria: row.categoria, series: [] }
      }
      skuMap[row.sku].series.push({
        mes:        parseInt(row.mes),
        mes_nombre: MN[parseInt(row.mes)] ?? '',
        valor:      parseFloat(row.valor),
        unidades:   parseInt(row.unidades),
      })
    }

    return NextResponse.json({ skus: Object.values(skuMap) })
  } catch (err) {
    return handleApiError(err)
  }
}
