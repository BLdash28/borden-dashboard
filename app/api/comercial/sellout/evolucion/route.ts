import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sp   = req.nextUrl.searchParams
    const pais = sp.get('pais') || ''
    const cat  = sp.get('categoria') || ''
    const cad  = sp.get('cadena') || ''

    const extra: string[] = []
    if (pais) extra.push(`pais = '${pais.replace(/'/g,"''")}'`)
    if (cat)  extra.push(`categoria = '${cat.replace(/'/g,"''")}'`)
    if (cad)  extra.push(`cadena = '${cad.replace(/'/g,"''")}'`)
    const and = extra.length ? 'AND ' + extra.join(' AND ') : ''

    const r = await pool.query(`
      SELECT
        ano,
        mes,
        ROUND(SUM(ventas_valor)::numeric,    2) AS valor,
        ROUND(SUM(ventas_unidades)::numeric,  0) AS unidades
      FROM fact_sales_sellout
      WHERE ano IN (2024, 2025, 2026) ${and}
      GROUP BY ano, mes
      ORDER BY ano, mes
    `)

    // Pivot por mes
    const byMes: Record<number, Record<string, number>> = {}
    for (let m = 1; m <= 12; m++) byMes[m] = { mes: m, 2024: 0, 2025: 0, 2026: 0 }
    for (const row of r.rows) {
      const m = parseInt(row.mes)
      if (byMes[m]) byMes[m][row.ano] = parseFloat(row.valor)
    }

    // YTD acumulado
    const ytd: Record<string, number[]> = { 2024: [], 2025: [], 2026: [] }
    for (const ano of [2024, 2025, 2026] as const) {
      let acc = 0
      for (let m = 1; m <= 12; m++) { acc += byMes[m][ano] ?? 0; ytd[ano].push(acc) }
    }

    // Top países
    const pR = await pool.query(`
      SELECT pais,
        ROUND(SUM(ventas_valor)::numeric, 2) AS valor,
        ROUND(SUM(ventas_unidades)::numeric, 0) AS unidades
      FROM fact_sales_sellout
      WHERE ano = 2026 ${and}
      GROUP BY pais ORDER BY valor DESC
    `)

    // Top categorías
    const cR = await pool.query(`
      SELECT categoria,
        ROUND(SUM(ventas_valor)::numeric, 2) AS valor
      FROM fact_sales_sellout
      WHERE ano = 2026 ${and}
      GROUP BY categoria ORDER BY valor DESC
    `)

    return NextResponse.json({
      mensual: Object.values(byMes),
      ytd: Object.entries(ytd).map(([ano, vals]) => ({ ano: parseInt(ano), vals })),
      por_pais: pR.rows,
      por_categoria: cR.rows,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
