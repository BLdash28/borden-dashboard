import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

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

    // ventas_sell_in no tiene tipo_negocio — si hay filtro de tipo solo usamos fact_sales_sellin
    const extraViejo = (() => {
      const c: string[] = []
      if (paises.length) c.push(inC('pais', paises))
      if (cats.length)   c.push(inC('categoria', cats))
      return c.length ? 'AND ' + c.join(' AND ') : ''
    })()

    const r = await pool.query(`
      -- fact_sales_sellin: fuente principal (2026+)
      SELECT ano, mes,
        ROUND(SUM(venta_neta)::numeric, 2)       AS ingresos,
        ROUND(SUM(cantidad_unidades)::numeric, 0) AS unidades,
        ROUND(SUM(margen_valor)::numeric, 2)      AS margen
      FROM fact_sales_sellin
      WHERE ano IN (2024, 2025, 2026) ${extra}
      GROUP BY ano, mes

      UNION ALL

      -- ventas_sell_in: solo años/meses no cubiertos por fact_sales_sellin
      SELECT ano, mes,
        ROUND(SUM(ingresos)::numeric, 2) AS ingresos,
        ROUND(SUM(unidades)::numeric, 0) AS unidades,
        0                                AS margen
      FROM ventas_sell_in
      WHERE ano IN (2024, 2025, 2026) ${extraViejo}
        AND (ano, mes) NOT IN (
          SELECT DISTINCT ano, mes FROM fact_sales_sellin
        )
      GROUP BY ano, mes

      ORDER BY ano, mes
    `)

    // Proyecciones 2026 por mes — misma lógica que /dashboard/comercial/proyeccion
    const pConds: string[] = [
      'ano = 2026',
      'categoria IS NULL',
      `empresa IN ('LICENCIAMIENTO', 'BL FOODS')`,
    ]
    if (tipo) {
      const emp = tipo.startsWith('LICENCIAMIENTO') ? 'LICENCIAMIENTO' : 'BL FOODS'
      pConds.push(`empresa = '${emp}'`)
    }
    const pR = await pool.query(`
      SELECT mes, ROUND(SUM(valor_usd)::numeric, 2) AS proyeccion
      FROM proyecciones
      WHERE ${pConds.join(' AND ')}
      GROUP BY mes
      ORDER BY mes
    `)
    const proyByMes: Record<number, number> = {}
    for (const row of pR.rows) proyByMes[parseInt(row.mes)] = parseFloat(row.proyeccion)

    // Estructurar: { mes: 1..12, 2025: x, proyeccion: x, 2026: x }
    const byMes: Record<number, Record<string, number>> = {}
    for (let m = 1; m <= 12; m++) byMes[m] = { mes: m, 2025: 0, proyeccion: proyByMes[m] ?? 0, 2026: 0 }

    for (const row of r.rows) {
      const m = parseInt(row.mes)
      if (byMes[m] && (row.ano === '2025' || parseInt(row.ano) === 2025)) byMes[m][2025] = parseFloat(row.ingresos)
      if (byMes[m] && (row.ano === '2026' || parseInt(row.ano) === 2026)) byMes[m][2026] = parseFloat(row.ingresos)
    }

    // Último mes con datos en 2026
    const ultimoMes2026 = Math.max(0, ...r.rows
      .filter(row => parseInt(row.ano) === 2026 && parseFloat(row.ingresos) > 0)
      .map(row => parseInt(row.mes))
    )

    // YTD acumulado — 2026 se corta en el último mes reportado
    const ytd: Record<string, (number | null)[]> = { 2025: [], proyeccion: [], 2026: [] }
    for (const key of ['2025', 'proyeccion', '2026'] as const) {
      let acc = 0
      for (let m = 1; m <= 12; m++) {
        if (key === '2026' && m > ultimoMes2026) {
          ytd[key].push(null)
        } else {
          acc += byMes[m][key] ?? 0
          ytd[key].push(acc)
        }
      }
    }

    return NextResponse.json({
      mensual: Object.values(byMes),
      ytd: Object.entries(ytd).map(([ano, vals]) => ({ ano, vals })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
