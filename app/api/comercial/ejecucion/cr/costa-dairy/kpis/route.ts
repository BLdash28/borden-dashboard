import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

const MN = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

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

    const [kpiR, canalR, subcanalR, monthlyR, clienteR, vendedorR, zonaR] = await Promise.all([
      pool.query(
        `SELECT
           ROUND(SUM(ventas_colones)::numeric,2)   AS total_crc,
           ROUND(SUM(ventas_valor)::numeric,2)     AS total_usd,
           ROUND(SUM(ventas_unidades)::numeric,0)  AS total_uds,
           ROUND(SUM(ventas_bultos)::numeric,0)    AS total_bultos,
           COUNT(DISTINCT cod_cliente)             AS n_clientes,
           COUNT(DISTINCT canal_ul)                AS n_canales,
           COUNT(DISTINCT cod_articulo)            AS n_skus,
           MAX(fecha)                              AS ultima_fecha,
           MIN(fecha)                              AS primera_fecha,
           COUNT(*) FILTER (WHERE ventas_colones < 0) AS notas_credito
         FROM mv_costadairy_mensual WHERE ${where}`, params),
      pool.query(
        `SELECT canal_ul AS canal,
                ROUND(SUM(ventas_colones)::numeric,2) AS crc,
                ROUND(SUM(ventas_valor)::numeric,2)   AS usd,
                ROUND(SUM(ventas_unidades)::numeric,0) AS uds,
                COUNT(DISTINCT cod_cliente)           AS n_clientes
         FROM mv_costadairy_mensual WHERE ${where}
         GROUP BY canal_ul ORDER BY crc DESC`, params),
      pool.query(
        `SELECT canal_ul AS canal, subcanal_ul AS subcanal,
                ROUND(SUM(ventas_colones)::numeric,2) AS crc,
                ROUND(SUM(ventas_unidades)::numeric,0) AS uds,
                COUNT(DISTINCT cod_cliente)           AS n_clientes
         FROM mv_costadairy_mensual WHERE ${where} AND subcanal_ul IS NOT NULL
         GROUP BY canal_ul, subcanal_ul ORDER BY crc DESC`, params),
      pool.query(
        `SELECT mes AS mes,
                ROUND(SUM(ventas_colones)::numeric,2) AS crc,
                ROUND(SUM(ventas_valor)::numeric,2)   AS usd,
                ROUND(SUM(ventas_unidades)::numeric,0) AS uds
         FROM mv_costadairy_mensual WHERE ${where}
         GROUP BY mes ORDER BY mes`, params),
      pool.query(
        `SELECT cod_cliente, nom_cliente,
                MAX(canal_ul) AS canal, MAX(zona) AS zona,
                ROUND(SUM(ventas_colones)::numeric,2) AS crc,
                ROUND(SUM(ventas_unidades)::numeric,0) AS uds,
                COUNT(DISTINCT fecha)                 AS dias_compra
         FROM mv_costadairy_mensual WHERE ${where} AND cod_cliente IS NOT NULL
         GROUP BY cod_cliente, nom_cliente
         ORDER BY crc DESC LIMIT 20`, params),
      pool.query(
        `SELECT codvendedor, vendedor,
                ROUND(SUM(ventas_colones)::numeric,2) AS crc,
                ROUND(SUM(ventas_unidades)::numeric,0) AS uds,
                COUNT(DISTINCT cod_cliente)           AS n_clientes
         FROM mv_costadairy_mensual WHERE ${where} AND vendedor IS NOT NULL
         GROUP BY codvendedor, vendedor ORDER BY crc DESC`, params),
      pool.query(
        `SELECT zona,
                ROUND(SUM(ventas_colones)::numeric,2) AS crc,
                ROUND(SUM(ventas_unidades)::numeric,0) AS uds,
                COUNT(DISTINCT cod_cliente)           AS n_clientes
         FROM mv_costadairy_mensual WHERE ${where} AND zona IS NOT NULL
         GROUP BY zona ORDER BY crc DESC LIMIT 15`, params),
    ])

    const kpi = kpiR.rows[0] ?? {}
    return NextResponse.json({
      ano,
      kpi: {
        total_crc:     parseFloat(kpi.total_crc ?? '0'),
        total_usd:     parseFloat(kpi.total_usd ?? '0'),
        total_uds:     parseInt(kpi.total_uds ?? '0'),
        total_bultos:  parseInt(kpi.total_bultos ?? '0'),
        n_clientes:    parseInt(kpi.n_clientes ?? '0'),
        n_canales:     parseInt(kpi.n_canales ?? '0'),
        n_skus:        parseInt(kpi.n_skus ?? '0'),
        ultima_fecha:  kpi.ultima_fecha,
        primera_fecha: kpi.primera_fecha,
        notas_credito: parseInt(kpi.notas_credito ?? '0'),
      },
      por_canal: canalR.rows.map(r => ({
        canal:      r.canal,
        crc:        parseFloat(r.crc ?? '0'),
        usd:        parseFloat(r.usd ?? '0'),
        uds:        parseInt(r.uds ?? '0'),
        n_clientes: parseInt(r.n_clientes ?? '0'),
      })),
      por_subcanal: subcanalR.rows.map(r => ({
        canal:      r.canal,
        subcanal:   r.subcanal,
        crc:        parseFloat(r.crc ?? '0'),
        uds:        parseInt(r.uds ?? '0'),
        n_clientes: parseInt(r.n_clientes ?? '0'),
      })),
      monthly: monthlyR.rows.map(r => ({
        mes:        parseInt(r.mes),
        mes_nombre: MN[parseInt(r.mes)] ?? '',
        crc:        parseFloat(r.crc ?? '0'),
        usd:        parseFloat(r.usd ?? '0'),
        uds:        parseInt(r.uds ?? '0'),
      })),
      top_clientes: clienteR.rows.map(r => ({
        cod_cliente: r.cod_cliente,
        nom_cliente: r.nom_cliente,
        canal:       r.canal,
        zona:        r.zona,
        crc:         parseFloat(r.crc ?? '0'),
        uds:         parseInt(r.uds ?? '0'),
        dias_compra: parseInt(r.dias_compra ?? '0'),
      })),
      por_vendedor: vendedorR.rows.map(r => ({
        codvendedor: r.codvendedor,
        vendedor:    r.vendedor,
        crc:         parseFloat(r.crc ?? '0'),
        uds:         parseInt(r.uds ?? '0'),
        n_clientes:  parseInt(r.n_clientes ?? '0'),
      })),
      por_zona: zonaR.rows.map(r => ({
        zona:       r.zona,
        crc:        parseFloat(r.crc ?? '0'),
        uds:        parseInt(r.uds ?? '0'),
        n_clientes: parseInt(r.n_clientes ?? '0'),
      })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
