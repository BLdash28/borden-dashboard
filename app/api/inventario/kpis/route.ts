import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const fecha = req.nextUrl.searchParams.get('fecha')

    // Resolver snapshot
    let snapId: number
    let fechaSnapshot: string

    if (fecha) {
      const r = await pool.query(
        'SELECT id, fecha_snapshot::text FROM inv_snapshots WHERE fecha_snapshot = $1',
        [fecha]
      )
      if (r.rows.length === 0) {
        return NextResponse.json({ error: 'Snapshot no encontrado' }, { status: 404 })
      }
      snapId = r.rows[0].id
      fechaSnapshot = r.rows[0].fecha_snapshot
    } else {
      const r = await pool.query(
        'SELECT id, fecha_snapshot::text FROM inv_snapshots ORDER BY fecha_snapshot DESC LIMIT 1'
      )
      if (r.rows.length === 0) {
        return NextResponse.json({ error: 'Sin snapshots disponibles' }, { status: 404 })
      }
      snapId = r.rows[0].id
      fechaSnapshot = r.rows[0].fecha_snapshot
    }

    // KPIs generales PT
    const ptR = await pool.query(`
      SELECT
        ROUND(SUM(total_cajas)::numeric, 0)    AS total_cajas,
        ROUND(SUM(total_unidades)::numeric, 0) AS total_unidades,
        ROUND(SUM(total_litros)::numeric, 0)   AS total_litros,
        COUNT(*)                                AS total_items
      FROM inv_snapshot_items
      WHERE snapshot_id = $1 AND tipo = 'PRODUCTO_TERMINADO'
    `, [snapId])

    const pt = ptR.rows[0]

    // Días restantes promedio (solo PT con fecha de vencimiento)
    const diasR = await pool.query(`
      SELECT
        ROUND(AVG((fecha_vence - $2::date))::numeric, 1) AS dias_prom,
        COUNT(*) FILTER (WHERE (fecha_vence - $2::date) < 30 AND fecha_vence IS NOT NULL)   AS skus_rojo,
        COUNT(*) FILTER (WHERE (fecha_vence - $2::date) BETWEEN 30 AND 90)                  AS skus_amarillo,
        COUNT(*) FILTER (WHERE (fecha_vence - $2::date) > 90)                               AS skus_verde,
        ROUND(
          SUM(total_cajas) FILTER (WHERE (fecha_vence - $2::date) < 30 AND fecha_vence IS NOT NULL)::numeric
          / NULLIF(SUM(total_cajas)::numeric, 0) * 100
        , 1) AS pct_vida_baja
      FROM inv_snapshot_items
      WHERE snapshot_id = $1 AND tipo = 'PRODUCTO_TERMINADO'
    `, [snapId, fechaSnapshot])

    const dias = diasR.rows[0]

    // Inventario por estado
    const estadosR = await pool.query(`
      SELECT
        estado,
        ROUND(SUM(total_cajas)::numeric, 0)    AS cajas,
        ROUND(SUM(total_unidades)::numeric, 0) AS unidades,
        COUNT(*)                                AS items
      FROM inv_snapshot_items
      WHERE snapshot_id = $1 AND tipo = 'PRODUCTO_TERMINADO'
      GROUP BY estado
      ORDER BY estado
    `, [snapId])

    // Top SKUs por cajas (PT)
    const topR = await pool.query(`
      SELECT
        sku,
        descripcion,
        ROUND(SUM(total_cajas)::numeric, 0)    AS cajas,
        ROUND(SUM(total_unidades)::numeric, 0) AS unidades
      FROM inv_snapshot_items
      WHERE snapshot_id = $1 AND tipo = 'PRODUCTO_TERMINADO' AND sku != 'SIN_SKU'
      GROUP BY sku, descripcion
      ORDER BY cajas DESC
      LIMIT 10
    `, [snapId])

    // KPIs empaque/cinta
    const empaqueR = await pool.query(`
      SELECT
        tipo,
        categoria,
        ROUND(SUM(existencia)::numeric, 0) AS existencia,
        COUNT(*) AS items
      FROM inv_snapshot_items
      WHERE snapshot_id = $1 AND tipo IN ('EMPAQUE', 'CINTA')
      GROUP BY tipo, categoria
      ORDER BY tipo, categoria
    `, [snapId])

    return NextResponse.json({
      fecha_snapshot: fechaSnapshot,
      snapshot_id: snapId,
      pt: {
        total_cajas:    Number(pt.total_cajas    || 0),
        total_unidades: Number(pt.total_unidades || 0),
        total_litros:   Number(pt.total_litros   || 0),
        total_items:    Number(pt.total_items    || 0),
        dias_prom_vida: Number(dias.dias_prom    || 0),
        skus_rojo:      Number(dias.skus_rojo    || 0),
        skus_amarillo:  Number(dias.skus_amarillo || 0),
        skus_verde:     Number(dias.skus_verde   || 0),
        pct_vida_baja:  Number(dias.pct_vida_baja || 0),
      },
      por_estado: estadosR.rows,
      top_skus:   topR.rows,
      empaque:    empaqueR.rows,
    })
  } catch (err: any) {
    console.error('[inventario/kpis]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
