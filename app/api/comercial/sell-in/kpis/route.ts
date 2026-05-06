import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

export async function GET(req: NextRequest) {
  try {
    const sp     = req.nextUrl.searchParams
    const ano    = parseInt(sp.get('ano') || '2026')
    const paises = sp.get('pais')      ? sp.get('pais')!.split(',').filter(Boolean)      : []
    const cats   = sp.get('categoria') ? sp.get('categoria')!.split(',').filter(Boolean) : []
    const tipos  = sp.get('tipo_negocio') ? sp.get('tipo_negocio')!.split(',').filter(Boolean) : []

    const inC = (col: string, vals: string[]) =>
      `${col} IN (${vals.map(v => `'${v.replace(/'/g,"''")}'`).join(',')})`

    const extraConds: string[] = []
    if (paises.length) extraConds.push(inC('pais', paises))
    if (cats.length)   extraConds.push(inC('categoria', cats))
    if (tipos.length)  extraConds.push(inC('tipo_negocio', tipos))
    const extra = extraConds.length ? 'AND ' + extraConds.join(' AND ') : ''

    // Último mes con datos del año actual (corte YTD)
    const cutoffR = await pool.query(`
      SELECT COALESCE(MAX(mes), 0) AS ultimo_mes
      FROM fact_sales_sellin
      WHERE ano = ${ano} AND venta_neta > 0 ${extra}
    `)
    const ultimoMes = parseInt(cutoffR.rows[0].ultimo_mes) || 0

    // Año actual: YTD completo
    // Año anterior: solo los mismos meses (1..ultimoMes) para comparación justa
    const [currR, prevR] = await Promise.all([
      pool.query(`
        SELECT
          COALESCE(SUM(venta_neta),     0) AS ingresos,
          COALESCE(SUM(cantidad_cajas), 0) AS cajas,
          COUNT(DISTINCT cliente_nombre)   AS clientes,
          COUNT(DISTINCT sku)              AS skus
        FROM fact_sales_sellin
        WHERE ano = ${ano} ${extra}
      `),
      pool.query(`
        SELECT
          COALESCE(SUM(venta_neta),     0) AS ingresos,
          COALESCE(SUM(cantidad_cajas), 0) AS cajas
        FROM (
          SELECT venta_neta, cantidad_cajas FROM fact_sales_sellin
          WHERE ano = ${ano - 1} AND mes <= ${ultimoMes} ${extra}
          UNION ALL
          SELECT ingresos AS venta_neta, 0 AS cantidad_cajas FROM ventas_sell_in
          WHERE ano = ${ano - 1} AND mes <= ${ultimoMes}
            ${paises.length ? 'AND ' + inC('pais', paises) : ''}
            ${cats.length   ? 'AND ' + inC('categoria', cats) : ''}
            AND (ano, mes) NOT IN (SELECT DISTINCT ano, mes FROM fact_sales_sellin)
        ) sub
      `),
    ])

    const cur  = currR.rows[0]
    const prev = prevR.rows[0]

    const delta = (c: number, p: number) =>
      p > 0 ? ((c - p) / p) * 100 : c > 0 ? 100 : 0

    return NextResponse.json({
      ano,
      ultimoMes,
      kpis: {
        ingresos: { valor: parseFloat(cur.ingresos), delta: delta(parseFloat(cur.ingresos), parseFloat(prev.ingresos)) },
        cajas:    { valor: parseFloat(cur.cajas),    delta: delta(parseFloat(cur.cajas),    parseFloat(prev.cajas)) },
        clientes: parseInt(cur.clientes),
        skus:     parseInt(cur.skus),
      },
    })
  } catch (err) {
    return handleApiError(err)
  }
}
