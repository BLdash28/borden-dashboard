import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sp     = req.nextUrl.searchParams
    const paises = sp.get('pais')      ? sp.get('pais')!.split(',').filter(Boolean)      : []
    const cats   = sp.get('categoria') ? sp.get('categoria')!.split(',').filter(Boolean) : []
    const tipo   = sp.get('tipo_negocio') || ''

    const inC = (col: string, vals: string[]) =>
      `${col} IN (${vals.map(v => `'${v.replace(/'/g,"''")}'`).join(',')})`

    const extraConds: string[] = []
    if (paises.length) extraConds.push(inC('pais', paises))
    if (cats.length)   extraConds.push(inC('categoria', cats))
    if (tipo)          extraConds.push(`tipo_negocio = '${tipo.replace(/'/g,"''")}'`)
    const extra = extraConds.length ? 'AND ' + extraConds.join(' AND ') : ''

    const r = await pool.query(`
      SELECT
        ano,
        mes,
        ROUND(SUM(venta_neta)::numeric, 2)        AS ingresos,
        ROUND(SUM(cantidad_unidades)::numeric, 0) AS unidades,
        ROUND(SUM(margen_valor)::numeric, 2)       AS margen
      FROM fact_sales_sellin
      WHERE ano IN (2024, 2025, 2026) ${extra}
      GROUP BY ano, mes
      ORDER BY ano, mes
    `)

    // Estructurar: { mes: 1..12, 2024: x, 2025: x, 2026: x }
    const byMes: Record<number, Record<string, number>> = {}
    for (let m = 1; m <= 12; m++) byMes[m] = { mes: m, 2024: 0, 2025: 0, 2026: 0 }

    for (const row of r.rows) {
      const m = parseInt(row.mes)
      if (byMes[m]) byMes[m][row.ano] = parseFloat(row.ingresos)
    }

    // YTD acumulado por año
    const ytd: Record<string, number[]> = { 2024: [], 2025: [], 2026: [] }
    for (const ano of [2024, 2025, 2026] as const) {
      let acc = 0
      for (let m = 1; m <= 12; m++) {
        acc += byMes[m][ano] ?? 0
        ytd[ano].push(acc)
      }
    }

    return NextResponse.json({
      mensual: Object.values(byMes),
      ytd: Object.entries(ytd).map(([ano, vals]) => ({ ano: parseInt(ano), vals })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
