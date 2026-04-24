import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const dynamic = 'force-dynamic'

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
          COALESCE(SUM(venta_neta),        0) AS ingresos,
          COALESCE(SUM(cantidad_unidades), 0) AS unidades,
          COALESCE(SUM(margen_valor),      0) AS margen,
          COALESCE(CASE WHEN SUM(venta_neta) > 0
               THEN SUM(margen_valor) / SUM(venta_neta) * 100
               ELSE 0 END, 0)                AS margen_pct,
          COUNT(DISTINCT cliente_nombre) AS clientes,
          COUNT(DISTINCT sku)            AS skus
        FROM fact_sales_sellin ${buildWhere(ano)}`),
      pool.query(`SELECT
          COALESCE(SUM(venta_neta),        0) AS ingresos,
          COALESCE(SUM(cantidad_unidades), 0) AS unidades,
          COALESCE(SUM(margen_valor),      0) AS margen,
          COALESCE(CASE WHEN SUM(venta_neta) > 0
               THEN SUM(margen_valor) / SUM(venta_neta) * 100
               ELSE 0 END, 0)                AS margen_pct
        FROM fact_sales_sellin ${buildWhere(ano - 1)}`),
    ])

    const cur  = currR.rows[0]
    const prev = prevR.rows[0]

    const delta = (c: number, p: number) =>
      p > 0 ? ((c - p) / p) * 100 : c > 0 ? 100 : 0

    return NextResponse.json({
      ano,
      kpis: {
        ingresos:   { valor: parseFloat(cur.ingresos),   delta: delta(parseFloat(cur.ingresos),   parseFloat(prev.ingresos)) },
        unidades:   { valor: parseFloat(cur.unidades),   delta: delta(parseFloat(cur.unidades),   parseFloat(prev.unidades)) },
        margen:     { valor: parseFloat(cur.margen),     delta: delta(parseFloat(cur.margen),     parseFloat(prev.margen)) },
        margen_pct: { valor: parseFloat(cur.margen_pct), delta: parseFloat(cur.margen_pct) - parseFloat(prev.margen_pct) },
        clientes:   parseInt(cur.clientes),
        skus:       parseInt(cur.skus),
      },
    })
  } catch (err) {
    return handleApiError(err)
  }
}
