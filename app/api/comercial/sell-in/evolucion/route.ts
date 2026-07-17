import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sp     = req.nextUrl.searchParams
    const ano    = parseInt(sp.get('ano') || '2026')
    const paises      = sp.get('pais')          ? sp.get('pais')!.split(',').filter(Boolean)          : []
    const cats        = sp.get('categoria')     ? sp.get('categoria')!.split(',').filter(Boolean)     : []
    const subcats     = sp.get('subcategoria')  ? sp.get('subcategoria')!.split(',').filter(Boolean)  : []
    const tipos       = sp.get('tipo_negocio')  ? sp.get('tipo_negocio')!.split(',').filter(Boolean)  : []
    const clientes    = sp.get('cliente')       ? sp.get('cliente')!.split(',').filter(Boolean)       : []
    const proveedores = sp.get('proveedor')     ? sp.get('proveedor')!.split(',').filter(Boolean)     : []
    const mesesArr    = sp.get('mes')           ? sp.get('mes')!.split(',').map(Number).filter(n => n >= 1 && n <= 12) : []

    const inC = (col: string, vals: string[]) =>
      `${col} IN (${vals.map(v => `'${v.replace(/'/g,"''")}'`).join(',')})`

    const extraConds: string[] = []
    if (paises.length)      extraConds.push(inC('pais', paises))
    if (cats.length)        extraConds.push(inC('categoria', cats))
    if (subcats.length)     extraConds.push(inC('subcategoria', subcats))
    if (tipos.length)       extraConds.push(inC('tipo_negocio', tipos))
    if (clientes.length)    extraConds.push(inC('cliente_nombre', clientes))
    if (proveedores.length) extraConds.push(inC('proveedor', proveedores))
    if (mesesArr.length)    extraConds.push(`mes IN (${mesesArr.join(',')})`)
    const extra = extraConds.length ? 'AND ' + extraConds.join(' AND ') : ''

    // ventas_sell_in no tiene tipo_negocio ni cliente_nombre — filtrar solo por pais/categoria
    const extraViejo = (() => {
      const c: string[] = []
      if (paises.length) c.push(inC('pais', paises))
      if (cats.length)   c.push(inC('categoria', cats))
      return c.length ? 'AND ' + c.join(' AND ') : ''
    })()

    // Para proyecciones: mapear tipos → empresas
    const tipo = tipos.length === 1 ? tipos[0] : ''

    const r = await pool.query(`
      -- fact_sales_sellin: fuente principal (agrupa por AÑO DEL PEDIDO, no fecha_factura)
      SELECT ano_pedido AS ano, mes,
        ROUND(SUM(venta_neta)::numeric, 2)       AS ingresos,
        ROUND(SUM(cantidad_unidades)::numeric, 0) AS unidades,
        ROUND(SUM(margen_valor)::numeric, 2)      AS margen
      FROM fact_sales_sellin
      WHERE ano_pedido IN (${ano - 1}, ${ano}) ${extra}
      GROUP BY ano_pedido, mes

      UNION ALL

      -- ventas_sell_in: solo años/meses no cubiertos por fact_sales_sellin
      SELECT ano, mes,
        ROUND(SUM(ingresos)::numeric, 2) AS ingresos,
        ROUND(SUM(unidades)::numeric, 0) AS unidades,
        0                                AS margen
      FROM ventas_sell_in
      WHERE ano IN (${ano - 1}, ${ano}) ${extraViejo}
        AND (ano, mes) NOT IN (
          SELECT DISTINCT ano_pedido AS ano, mes FROM fact_sales_sellin
        )
      GROUP BY ano, mes

      ORDER BY ano, mes
    `)

    // Proyecciones: dos tipos de filas en la tabla
    //   categoria IS NULL  → totales empresa (sin desglose de pais/cat)
    //   categoria IS NOT NULL → filas detalladas con pais, cliente, categoria
    // Sin filtros activos usamos las filas totales; con filtros usamos las detalladas
    const hayFiltroDetalle = cats.length > 0 || paises.length > 0
    const empCond = tipo
      ? `empresa = '${(tipo.startsWith('LICENCIAMIENTO') ? 'LICENCIAMIENTO' : 'BL FOODS')}'`
      : `empresa IN ('LICENCIAMIENTO', 'BL FOODS')`

    const pConds: string[] = [`ano = ${ano}`, empCond]

    if (!hayFiltroDetalle) {
      // Sin filtros: filas nivel empresa (categoria IS NULL)
      pConds.push('categoria IS NULL')
    } else {
      // Con filtros: filas detalladas (categoria IS NOT NULL)
      pConds.push('categoria IS NOT NULL')
      if (cats.length > 0)
        pConds.push(`categoria IN (${cats.map(c => `'${c.replace(/'/g, "''")}'`).join(',')})`)
      if (paises.length > 0)
        pConds.push(`pais IN (${paises.map(p => `'${p.replace(/'/g, "''")}'`).join(',')})`)
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

    // Estructurar: { mes: 1..12, [ano-1]: x, proyeccion: x, [ano]: x }
    const prevKey = String(ano - 1)
    const currKey = String(ano)
    const byMes: Record<number, Record<string, number>> = {}
    for (let m = 1; m <= 12; m++) byMes[m] = { mes: m, [prevKey]: 0, proyeccion: proyByMes[m] ?? 0, [currKey]: 0 }

    for (const row of r.rows) {
      const m   = parseInt(row.mes)
      const a   = parseInt(row.ano)
      if (byMes[m] && a === ano - 1) byMes[m][prevKey] = parseFloat(row.ingresos)
      if (byMes[m] && a === ano)     byMes[m][currKey] = parseFloat(row.ingresos)
    }

    // Último mes con datos en el año actual
    const ultimoMesAno = Math.max(0, ...r.rows
      .filter(row => parseInt(row.ano) === ano && parseFloat(row.ingresos) > 0)
      .map(row => parseInt(row.mes))
    )

    // YTD acumulado — año actual se corta en el último mes reportado
    const ytd: Record<string, (number | null)[]> = { [prevKey]: [], proyeccion: [], [currKey]: [] }
    for (const key of [prevKey, 'proyeccion', currKey]) {
      let acc = 0
      for (let m = 1; m <= 12; m++) {
        if (key === currKey && m > ultimoMesAno) {
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
