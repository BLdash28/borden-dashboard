import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'
import { parseExitoFilters, buildExitoWhere } from '@/lib/api/exito-filtros'

export const revalidate = 300

const MN = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

// Serie diaria 2026 para el chart "Ventas mensuales" en modo Diaria.
// Devuelve { rows: [aggregate...], por_sku?: [{sku, descripcion, points: [...]}] }
// Cuando el filtro incluye SKUs específicos, devuelve ADEMÁS por_sku para
// dibujar una línea por SKU en el frontend.
export async function GET(req: NextRequest) {
  try {
    const f = parseExitoFilters(req)
    const w = buildExitoWhere(f, { startAt: 1 })

    // Aggregate diaria (todas las filas colapsadas)
    const r = await pool.query(`
      SELECT ano, mes, dia,
        ROUND(SUM(ventas_valorusd)::numeric, 2) AS valor_usd,
        ROUND(SUM(venta_valorcop)::numeric,  0) AS valor_cop,
        ROUND(SUM(ventas_unidades)::numeric, 0) AS unidades
      FROM fact_ventas_exito
      WHERE pais='CO' AND ano = 2026 AND dia > 0
        AND ${w.where}
      GROUP BY ano, mes, dia
      ORDER BY ano, mes, dia
    `, w.params)

    const mkRow = (row: { ano: string; mes: string; dia: string; valor_usd: string; valor_cop: string; unidades: string }) => {
      const ano = parseInt(row.ano)
      const mes = parseInt(row.mes)
      const dia = parseInt(row.dia)
      return {
        fecha: `${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`,
        dia_str: `${dia} ${MN[mes]}`,
        ano, mes, dia,
        valor_usd: parseFloat(row.valor_usd),
        valor_cop: parseFloat(row.valor_cop),
        unidades:  parseFloat(row.unidades),
      }
    }
    const rows = r.rows.map(mkRow)

    // Por SKU — solo cuando el usuario filtró explícitamente por SKUs.
    // Devuelve una serie por cada SKU seleccionado, alineada por fecha.
    let por_sku: { sku: string; descripcion: string | null; points: { fecha: string; dia_str: string; valor_usd: number; valor_cop: number; unidades: number }[] }[] = []
    if (f.skus.length > 0) {
      const rSku = await pool.query(`
        SELECT COALESCE(NULLIF(sku, ''), '(sin sku)') AS sku,
               ano, mes, dia,
               ROUND(SUM(ventas_valorusd)::numeric, 2) AS valor_usd,
               ROUND(SUM(venta_valorcop)::numeric,  0) AS valor_cop,
               ROUND(SUM(ventas_unidades)::numeric, 0) AS unidades
          FROM fact_ventas_exito
         WHERE pais='CO' AND ano = 2026 AND dia > 0
           AND ${w.where}
         GROUP BY sku, ano, mes, dia
         ORDER BY sku, ano, mes, dia
      `, w.params)
      const bySku: Record<string, { fecha: string; dia_str: string; valor_usd: number; valor_cop: number; unidades: number }[]> = {}
      for (const row of rSku.rows) {
        const sku = String(row.sku)
        if (!bySku[sku]) bySku[sku] = []
        const mes = parseInt(row.mes)
        const dia = parseInt(row.dia)
        const ano = parseInt(row.ano)
        bySku[sku].push({
          fecha: `${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`,
          dia_str: `${dia} ${MN[mes]}`,
          valor_usd: parseFloat(row.valor_usd),
          valor_cop: parseFloat(row.valor_cop),
          unidades:  parseFloat(row.unidades),
        })
      }
      // Descripciones
      const descBySku: Record<string, string> = {}
      if (Object.keys(bySku).length > 0) {
        const dp = await pool.query(
          `SELECT DISTINCT sku, descripcion FROM dim_producto WHERE pais='CO' AND sku = ANY($1)`,
          [Object.keys(bySku)],
        )
        for (const d of dp.rows) descBySku[String(d.sku)] = d.descripcion ?? ''
      }
      por_sku = Object.keys(bySku).map(sku => ({
        sku,
        descripcion: descBySku[sku] ?? null,
        points: bySku[sku],
      }))
    }

    return NextResponse.json({ rows, por_sku })
  } catch (err) {
    return handleApiError(err)
  }
}
