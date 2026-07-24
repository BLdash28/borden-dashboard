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
    const cad    = sp.get('cadena') || ''

    const inC = (col: string, vals: string[]) =>
      `${col} IN (${vals.map(v => `'${v.replace(/'/g,"''")}'`).join(',')})`

    const buildWhere = (a: number) => {
      const c = [`ano = ${a}`]
      if (paises.length) c.push(inC('pais', paises))
      if (cats.length)   c.push(inC('categoria', cats))
      if (cad)           c.push(`cadena = '${cad.replace(/'/g,"''")}'`)
      return 'WHERE ' + c.join(' AND ')
    }

    const [currR, prevR] = await Promise.all([
      pool.query(`SELECT
          COALESCE(SUM(ventas_valor),    0) AS valor,
          COALESCE(SUM(ventas_unidades), 0) AS unidades,
          COUNT(DISTINCT punto_venta)       AS pdvs,
          COUNT(DISTINCT sku)               AS skus,
          CASE WHEN SUM(ventas_unidades) > 0
               THEN SUM(ventas_valor) / SUM(ventas_unidades)
               ELSE 0 END                  AS precio_prom
        FROM mv_sellout_mensual ${buildWhere(ano)}`),
      pool.query(`SELECT
          COALESCE(SUM(ventas_valor),    0) AS valor,
          COALESCE(SUM(ventas_unidades), 0) AS unidades,
          COUNT(DISTINCT punto_venta)       AS pdvs,
          COUNT(DISTINCT sku)               AS skus
        FROM mv_sellout_mensual ${buildWhere(ano - 1)}`),
    ])

    const cur  = currR.rows[0]
    const prev = prevR.rows[0]
    const delta = (c: number, p: number) =>
      p > 0 ? ((c - p) / p) * 100 : c > 0 ? 100 : 0

    return NextResponse.json({
      ano,
      kpis: {
        valor:      { valor: parseFloat(cur.valor),      delta: delta(parseFloat(cur.valor),      parseFloat(prev.valor)) },
        unidades:   { valor: parseFloat(cur.unidades),   delta: delta(parseFloat(cur.unidades),   parseFloat(prev.unidades)) },
        pdvs:       { valor: parseInt(cur.pdvs),         delta: delta(parseInt(cur.pdvs),         parseInt(prev.pdvs)) },
        precio_prom:{ valor: parseFloat(cur.precio_prom),delta: 0 },
        skus: parseInt(cur.skus),
      },
    })
  } catch (err) {
    return handleApiError(err)
  }
}
