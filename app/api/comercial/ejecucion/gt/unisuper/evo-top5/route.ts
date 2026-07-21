import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 1800

/**
 * Top 5 SKUs con evolución mensual 2025 vs 2026.
 * Para chart de líneas comparativas por SKU.
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
  return { where: conds.join(' AND '), params }
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const n  = Math.min(parseInt(sp.get('n') ?? '5'), 20)
    const w  = buildWhere(sp)

    // 1) Top N SKUs por valor 2026 YTD
    const topR = await pool.query(`
      SELECT sku, MAX(descripcion) AS descripcion,
        ROUND(SUM(ventas_valor)::numeric, 0) AS valor
      FROM fact_ventas_unisuper
      WHERE ${w.where} AND EXTRACT(YEAR FROM fecha)=2026 AND ventas_unidades > 0
      GROUP BY sku ORDER BY valor DESC LIMIT ${n}
    `, w.params)
    const topSkus = topR.rows.map(r => r.sku)
    if (topSkus.length === 0) return NextResponse.json({ series: [] })

    // 2) Serie mensual por SKU (2025 + 2026)
    const skuParams = [...w.params, ...topSkus]
    const skuStart  = w.params.length
    const skuPlaceholders = topSkus.map((_, i) => `$${skuStart + 1 + i}`).join(',')

    const serieR = await pool.query(`
      SELECT sku,
             EXTRACT(YEAR FROM fecha)::int  AS ano,
             EXTRACT(MONTH FROM fecha)::int AS mes,
             ROUND(SUM(ventas_valor)::numeric, 0) AS valor,
             ROUND(SUM(ventas_unidades)::numeric, 0) AS unidades
      FROM fact_ventas_unisuper
      WHERE ${w.where} AND EXTRACT(YEAR FROM fecha) IN (2025, 2026)
        AND sku IN (${skuPlaceholders})
        AND ventas_unidades > 0
      GROUP BY sku, ano, mes
      ORDER BY sku, ano, mes
    `, skuParams)

    // Armar series
    const skuMeta: Record<string, { descripcion: string; valor: number }> = {}
    for (const r of topR.rows) skuMeta[r.sku] = { descripcion: r.descripcion ?? '', valor: parseFloat(r.valor ?? '0') }

    const bySku: Record<string, { mes: number; y2025: number; y2026: number; u2025: number; u2026: number }[]> = {}
    for (const s of topSkus) {
      bySku[s] = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, y2025: 0, y2026: 0, u2025: 0, u2026: 0 }))
    }
    for (const r of serieR.rows) {
      const m = parseInt(r.mes) - 1
      const arr = bySku[r.sku]
      if (!arr) continue
      if (parseInt(r.ano) === 2025) { arr[m].y2025 = parseFloat(r.valor ?? '0'); arr[m].u2025 = parseInt(r.unidades ?? '0') }
      if (parseInt(r.ano) === 2026) { arr[m].y2026 = parseFloat(r.valor ?? '0'); arr[m].u2026 = parseInt(r.unidades ?? '0') }
    }

    return NextResponse.json({
      series: topSkus.map(sku => ({
        sku,
        descripcion: skuMeta[sku]?.descripcion,
        valor_ytd:   skuMeta[sku]?.valor,
        monthly:     bySku[sku],
      })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
