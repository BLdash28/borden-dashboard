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
        MAX(descripcion)                                                                  AS descripcion,
        MAX(categoria)                                                                    AS categoria,
        MAX(NULLIF(subcategoria, ''))                                                     AS subcategoria,
        MAX(NULLIF(codigo_barras, ''))                                                    AS codigo_barras,
        ROUND(AVG(CASE WHEN ano = 2024 THEN precio_promedio END)::numeric, 4)             AS precio_2024,
        ROUND(AVG(CASE WHEN ano = 2025 THEN precio_promedio END)::numeric, 4)             AS precio_2025,
        ROUND(AVG(CASE WHEN ano = 2026 THEN precio_promedio END)::numeric, 4)             AS precio_2026,
        ROUND(SUM(CASE WHEN ano = 2025 THEN ventas_unidades ELSE 0 END)::numeric, 0)     AS u2025,
        ROUND(SUM(CASE WHEN ano = 2026 THEN ventas_unidades ELSE 0 END)::numeric, 0)     AS u2026,
        ROUND(SUM(CASE WHEN ano = 2026 THEN ventas_valor    ELSE 0 END)::numeric, 2)     AS v2026
      FROM mv_sellout_mensual
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
      const u25 = parseInt(row.u2025)
      const u26 = parseInt(row.u2026)

      const var_precio   = p25 && p26 ? ((p26 - p25) / p25) * 100 : null
      const var_unidades = u25 > 0    ? ((u26 - u25) / u25) * 100 : null

      // Elasticidad precio-demanda: ΔQ%/ΔP%  (significativa solo si |ΔP| > 0.1%)
      const elasticidad = var_precio !== null && var_unidades !== null && Math.abs(var_precio) > 0.1
        ? var_unidades / var_precio
        : null

      return {
        sku:          row.sku,
        descripcion:  row.descripcion,
        categoria:    row.categoria,
        subcategoria: row.subcategoria ?? null,
        codigo_barras:row.codigo_barras ?? null,
        precio_2024:  p24,
        precio_2025:  p25,
        precio_2026:  p26,
        var_precio,
        var_unidades,
        elasticidad,
        u2025:        u25,
        u2026:        u26,
        v2026:        parseFloat(row.v2026),
      }
    })

    return NextResponse.json({ rows })
  } catch (err) {
    return handleApiError(err)
  }
}
