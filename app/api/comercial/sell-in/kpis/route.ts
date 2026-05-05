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
    const tipo   = sp.get('tipo_negocio') || ''

    const inC = (col: string, vals: string[]) =>
      `${col} IN (${vals.map(v => `'${v.replace(/'/g,"''")}'`).join(',')})`

    const buildWhere = (anoVal: number) => {
      const conds = [`ano = ${anoVal}`]
      if (paises.length) conds.push(inC('pais', paises))
      if (cats.length)   conds.push(inC('categoria', cats))
      if (tipo)          conds.push(`tipo_negocio = '${tipo.replace(/'/g,"''")}'`)
      return 'WHERE ' + conds.join(' AND ')
    }

    const [currR, prevR] = await Promise.all([
      pool.query(`SELECT
          COALESCE(SUM(venta_neta),     0) AS ingresos,
          COALESCE(SUM(cantidad_cajas), 0) AS cajas,
          COUNT(DISTINCT cliente_nombre)   AS clientes,
          COUNT(DISTINCT sku)              AS skus
        FROM fact_sales_sellin ${buildWhere(ano)}`),
      pool.query(`SELECT
          COALESCE(SUM(venta_neta),     0) AS ingresos,
          COALESCE(SUM(cantidad_cajas), 0) AS cajas
        FROM fact_sales_sellin ${buildWhere(ano - 1)}`),
    ])

    const cur  = currR.rows[0]
    const prev = prevR.rows[0]

    const delta = (c: number, p: number) =>
      p > 0 ? ((c - p) / p) * 100 : c > 0 ? 100 : 0

    return NextResponse.json({
      ano,
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
