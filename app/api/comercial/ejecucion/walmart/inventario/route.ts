import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

export async function GET(req: NextRequest) {
  try {
    const pais     = req.nextUrl.searchParams.get('pais') ?? 'CR'
    const paisSafe = pais.replace(/'/g, "''")

    // Latest semana for this pais
    const latestR = await pool.query(
      `SELECT semana FROM inventario_walmart WHERE pais = '${paisSafe}' ORDER BY semana DESC LIMIT 1`
    )

    if (latestR.rows.length === 0) {
      return NextResponse.json({ disponible: false, rows: [], kpis: null, msg: `Sin datos de inventario para ${pais}` })
    }

    const semana = latestR.rows[0].semana

    const [kpiR, rowsR] = await Promise.all([
      pool.query(`
        WITH doh_calc AS (
          SELECT *,
            CASE WHEN ventas_periodo > 0 AND dias_periodo > 0
              THEN inventario / (ventas_periodo::float / dias_periodo)
              ELSE NULL END AS doh_val
          FROM inventario_walmart
          WHERE pais = '${paisSafe}' AND semana = ${semana}
        )
        SELECT
          COUNT(*)                                                        AS total_items,
          SUM(inventario)                                                  AS total_unidades,
          SUM(inv_cedi_unds)                                               AS cedi_unidades,
          SUM(inv_cedi_cajas)                                              AS cedi_cajas,
          SUM(CASE WHEN doh_val <= 7                    THEN 1 ELSE 0 END) AS criticos,
          SUM(CASE WHEN doh_val BETWEEN 8 AND 14        THEN 1 ELSE 0 END) AS alertas,
          SUM(CASE WHEN doh_val > 60                    THEN 1 ELSE 0 END) AS excedentes
        FROM doh_calc
      `),
      pool.query(`
        SELECT item_nbr, item, item_type, item_status,
          ROUND(inventario::numeric, 0)     AS inventario,
          ROUND(ordenes::numeric, 0)        AS ordenes,
          ROUND(transito::numeric, 0)       AS transito,
          ROUND(wharehouse::numeric, 0)     AS wharehouse,
          ROUND(inv_cedi_cajas::numeric, 0) AS inv_cedi_cajas,
          ROUND(inv_cedi_unds::numeric, 0)  AS inv_cedi_unds,
          ventas_periodo, dias_periodo,
          CASE WHEN dias_periodo > 0
            THEN ROUND((ventas_periodo::float / dias_periodo)::numeric, 2)
            ELSE 0 END AS venta_dia,
          CASE WHEN ventas_periodo > 0 AND dias_periodo > 0
            THEN ROUND((inventario / (ventas_periodo::float / dias_periodo))::numeric, 1)
            ELSE NULL END AS doh
        FROM inventario_walmart
        WHERE pais = '${paisSafe}' AND semana = ${semana}
        ORDER BY doh ASC NULLS LAST
        LIMIT 500
      `),
    ])

    const k = kpiR.rows[0]
    return NextResponse.json({
      disponible: true,
      semana,
      kpis: {
        total_items:    parseInt(k.total_items   ?? '0'),
        total_unidades: parseInt(k.total_unidades ?? '0'),
        cedi_unidades:  parseInt(k.cedi_unidades  ?? '0'),
        cedi_cajas:     parseInt(k.cedi_cajas     ?? '0'),
        criticos:       parseInt(k.criticos        ?? '0'),
        alertas:        parseInt(k.alertas         ?? '0'),
        excedentes:     parseInt(k.excedentes      ?? '0'),
        ultima_semana:  semana,
      },
      rows: rowsR.rows.map((r: any) => ({
        sku:           r.item_nbr,
        descripcion:   r.item ?? '',
        item_type:     r.item_type ?? '',
        item_status:   r.item_status ?? '',
        inventario:    parseInt(r.inventario    ?? '0'),
        ordenes:       parseInt(r.ordenes       ?? '0'),
        transito:      parseInt(r.transito      ?? '0'),
        wharehouse:    parseInt(r.wharehouse    ?? '0'),
        inv_cedi_cajas: parseInt(r.inv_cedi_cajas ?? '0'),
        inv_cedi_unds:  parseInt(r.inv_cedi_unds  ?? '0'),
        venta_dia:     parseFloat(r.venta_dia   ?? '0'),
        doh:           r.doh !== null ? parseFloat(r.doh) : null,
      })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
