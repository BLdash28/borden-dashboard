import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const dynamic = 'force-dynamic'

// Share of Market por categoría y país (sell-out)
export async function GET(req: NextRequest) {
  try {
    const sp     = req.nextUrl.searchParams
    const paises = sp.get('pais') ? sp.get('pais')!.split(',').filter(Boolean) : []
    const ano    = parseInt(sp.get('ano') || '2026')

    const inC = (col: string, vals: string[]) =>
      `${col} IN (${vals.map(v => `'${v.replace(/'/g,"''")}'`).join(',')})`

    const filters: string[] = [`ano = ${ano}`]
    if (paises.length) filters.push(inC('pais', paises))
    const where = 'WHERE ' + filters.join(' AND ')

    const r = await pool.query(`
      WITH base AS (
        SELECT pais, categoria,
               SUM(ventas_valor)    AS valor,
               SUM(ventas_unidades) AS unidades
        FROM fact_sales_sellout ${where}
        GROUP BY pais, categoria
      ),
      total_pais AS (
        SELECT pais, SUM(valor) AS total_valor FROM base GROUP BY pais
      )
      SELECT
        b.pais,
        b.categoria,
        ROUND(b.valor::numeric, 2)     AS valor,
        ROUND(b.unidades::numeric, 0)  AS unidades,
        ROUND((b.valor / NULLIF(tp.total_valor,0) * 100)::numeric, 2) AS som_pct
      FROM base b
      JOIN total_pais tp ON tp.pais = b.pais
      ORDER BY b.pais, b.valor DESC
    `)

    // Pivot por categoría → { pais: { categoria: som_pct } }
    const paisMap: Record<string, { total: number; cats: Record<string, { valor: number; som: number }> }> = {}
    for (const row of r.rows) {
      if (!paisMap[row.pais]) paisMap[row.pais] = { total: 0, cats: {} }
      paisMap[row.pais].total += parseFloat(row.valor)
      paisMap[row.pais].cats[row.categoria] = {
        valor: parseFloat(row.valor),
        som:   parseFloat(row.som_pct),
      }
    }

    const rows = Object.entries(paisMap).map(([pais, d]) => ({
      pais,
      total:      d.total,
      categorias: d.cats,
    })).sort((a, b) => b.total - a.total)

    const categorias = [...new Set(r.rows.map((r: any) => r.categoria))]

    return NextResponse.json({ rows, categorias, ano })
  } catch (err) {
    return handleApiError(err)
  }
}
