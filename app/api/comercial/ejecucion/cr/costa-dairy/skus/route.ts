import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

export async function GET(req: NextRequest) {
  try {
    const canal     = req.nextUrl.searchParams.get('canal') ?? ''
    const subcanal  = req.nextUrl.searchParams.get('subcanal') ?? ''
    const ano       = parseInt(req.nextUrl.searchParams.get('ano') ?? '2026')

    const conds: string[] = ["pais = 'CR'", "cadena = 'COSTA DAIRY'", "anulado = false"]
    const params: unknown[] = []
    let i = 1
    if (canal)    { conds.push(`canal_ul    = $${i++}`); params.push(canal) }
    if (subcanal) { conds.push(`subcanal_ul = $${i++}`); params.push(subcanal) }
    conds.push(`ano = $${i++}`); params.push(ano)
    const where = conds.join(' AND ')

    const r = await pool.query(
      `SELECT cod_articulo,
              MAX(des_articulo) AS des_articulo,
              MAX(sku) AS sku,
              MAX(codigo_barras) AS codigo_barras,
              MAX(categoria) AS categoria,
              MAX(subcategoria) AS subcategoria,
              ROUND(SUM(ventas_unidades)::numeric, 0) AS uds,
              ROUND(SUM(ventas_colones)::numeric, 2)  AS crc,
              ROUND(SUM(ventas_valor)::numeric, 2)    AS usd,
              ROUND(SUM(ventas_bultos)::numeric, 0)   AS bultos,
              COUNT(DISTINCT cod_cliente)             AS n_clientes,
              COUNT(*) FILTER (WHERE ventas_colones < 0) AS notas_credito
       FROM mv_costadairy_mensual WHERE ${where} AND cod_articulo IS NOT NULL
       GROUP BY cod_articulo
       ORDER BY crc DESC`, params)

    const total_crc = r.rows.reduce((s, x) => s + parseFloat(x.crc ?? '0'), 0)
    let acum = 0
    const skus = r.rows.map(x => {
      const crc = parseFloat(x.crc ?? '0')
      const share = total_crc > 0 ? (crc / total_crc) * 100 : 0
      acum += share
      return {
        cod_articulo:  x.cod_articulo,
        des_articulo:  x.des_articulo,
        sku:           x.sku,
        codigo_barras: x.codigo_barras,
        categoria:     x.categoria,
        subcategoria:  x.subcategoria,
        uds:           parseInt(x.uds ?? '0'),
        crc,
        usd:           parseFloat(x.usd ?? '0'),
        bultos:        parseInt(x.bultos ?? '0'),
        n_clientes:    parseInt(x.n_clientes ?? '0'),
        notas_credito: parseInt(x.notas_credito ?? '0'),
        share_pct:     Math.round(share * 10) / 10,
        cum_share:     Math.round(acum * 10) / 10,
      }
    })

    return NextResponse.json({ ano, total_crc, skus })
  } catch (err) {
    return handleApiError(err)
  }
}
