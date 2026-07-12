import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'
import { parseExitoFilters, buildExitoWhere } from '@/lib/api/exito-filtros'

export const revalidate = 300

/**
 * devoluciones_exito comparte columnas con fact_ventas_exito:
 * pais, cadena, subcadena, departamento, ciudad, categoria, subcategoria, sku.
 * Aplicamos los mismos filtros globales.
 */

/**
 * Devoluciones · Grupo Éxito CO — misma forma de dato que Seguimiento Semanal.
 * Devuelve filas por SKU con desglose mensual + YTD + RR + proyección.
 *
 * Los valores COP se estiman uniendo con `precios_exito.precio_vigente_cop`
 * porque `devoluciones_exito` no trae valor monetario directo.
 */
export async function GET(req: NextRequest) {
  try {
    const ano = 2026
    const filt = parseExitoFilters(req)
    // devoluciones_exito comparte cadena/subcategoria/depto/ciudad/sku con fact
    const w    = buildExitoWhere(filt, { alias: 'd', startAt: 2 })
    const wRaw = buildExitoWhere(filt, { startAt: 2 })   // sin alias, para subquery interna

    const [ultR, prodR, totR] = await Promise.all([
      pool.query(`
        SELECT MAX(mes)::int AS ultimo_mes,
               MAX(ano*10000+mes*100+dia) AS ult_n
        FROM devoluciones_exito
        WHERE pais='CO' AND ano=$1 AND ${wRaw.where}
      `, [ano, ...wRaw.params]),

      // Devoluciones por SKU × mes
      pool.query(`
        SELECT
          COALESCE(d.sku, d.plu, d.codigo_barras) AS sku,
          MAX(COALESCE(d.descripcion, p.descripcion)) AS descripcion,
          d.mes,
          SUM(d.unidades)::float AS uds,
          SUM(d.unidades * COALESCE(p.precio_vigente_cop, 0))::float AS cop,
          SUM(d.unidades * COALESCE(p.precio_vigente_cop, 0))::float / NULLIF(3800, 0) AS usd_est
        FROM devoluciones_exito d
        LEFT JOIN precios_exito p
          ON (p.ean13 = d.codigo_barras OR p.sku = d.sku)
         AND p.pais='CO' AND p.cliente='GRUPO ÉXITO'
        WHERE d.pais='CO' AND d.ano=$1 AND ${w.where}
        GROUP BY COALESCE(d.sku, d.plu, d.codigo_barras), d.mes
        ORDER BY 1, 2
      `, [ano, ...w.params]),

      // Totales generales para calcular proyección al cierre
      pool.query(`
        SELECT
          MAX(mes)::int AS ultimo_mes,
          MAX(dia) FILTER (WHERE mes = (SELECT MAX(mes) FROM devoluciones_exito WHERE pais='CO' AND ano=$1 AND ${wRaw.where}))::int AS ultimo_dia
        FROM devoluciones_exito
        WHERE pais='CO' AND ano=$1 AND ${wRaw.where}
      `, [ano, ...wRaw.params]),
    ])

    const ult = ultR.rows[0] ?? {}
    const ultimoMes = parseInt(ult.ultimo_mes ?? '0')
    const ultimoDia = parseInt(totR.rows[0]?.ultimo_dia ?? '0')
    const DIAS_MES: Record<number, number> = { 1:31,2:28,3:31,4:30,5:31,6:30,7:31,8:31,9:30,10:31,11:30,12:31 }
    const diasMesActual = DIAS_MES[ultimoMes] ?? 30

    // Fecha última
    const ultN = parseInt(ult.ult_n ?? '0')
    const ultimaFecha = ultN
      ? `${Math.floor(ultN/10000)}-${String(Math.floor(ultN/100)%100).padStart(2,'0')}-${String(ultN%100).padStart(2,'0')}`
      : null

    // Agrupar por SKU
    type Row = {
      key: string; label: string;
      meses: Record<number, number>
      mesesUsd: Record<number, number>
      mesesUnd: Record<number, number>
      ytdCop: number; ytdUsd: number; ytdUnd: number
      rrUnd: number; rrCop: number; rrUsd: number
      undActual: number; copActual: number; usdActual: number
      proyUnd: number; proyCop: number; proyUsd: number
      sku?: string
    }
    const bySku: Record<string, Row> = {}
    for (const r of prodR.rows) {
      const sku = r.sku
      if (!bySku[sku]) bySku[sku] = {
        key: sku, label: r.descripcion || sku,
        meses: {}, mesesUsd: {}, mesesUnd: {},
        ytdCop: 0, ytdUsd: 0, ytdUnd: 0,
        rrUnd: 0, rrCop: 0, rrUsd: 0,
        undActual: 0, copActual: 0, usdActual: 0,
        proyUnd: 0, proyCop: 0, proyUsd: 0,
        sku,
      }
      const row = bySku[sku]
      const m   = parseInt(r.mes)
      const cop = parseFloat(r.cop ?? '0')
      const uds = parseFloat(r.uds ?? '0')
      const usd = parseFloat(r.usd_est ?? '0')

      row.meses[m]    = cop
      row.mesesUsd[m] = usd
      row.mesesUnd[m] = uds
      row.ytdCop += cop
      row.ytdUsd += usd
      row.ytdUnd += uds

      if (m === ultimoMes) {
        row.copActual = cop
        row.usdActual = usd
        row.undActual = uds
        // RR = venta del mes actual / días transcurridos
        row.rrCop = ultimoDia > 0 ? cop / ultimoDia : 0
        row.rrUsd = ultimoDia > 0 ? usd / ultimoDia : 0
        row.rrUnd = ultimoDia > 0 ? uds / ultimoDia : 0
        // Proy = RR × días totales del mes
        row.proyCop = row.rrCop * diasMesActual
        row.proyUsd = row.rrUsd * diasMesActual
        row.proyUnd = row.rrUnd * diasMesActual
      }
    }

    // Sort por ytdCop desc
    const rows = Object.values(bySku).sort((a, b) => b.ytdCop - a.ytdCop)

    return NextResponse.json({
      ano,
      ultimo_mes: ultimoMes,
      ultima_fecha: ultimaFecha,
      ultimo_dia:  ultimoDia,
      dias_mes:    diasMesActual,
      por_producto: rows,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
