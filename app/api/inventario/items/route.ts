import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const fecha     = sp.get('fecha')      // YYYY-MM-DD — usa el más reciente si no viene
    const tipo      = sp.get('tipo')       // PRODUCTO_TERMINADO | EMPAQUE | CINTA
    const estado    = sp.get('estado')     // DISPONIBLE | DESPACHO | VIDA_UTIL_BAJA | PRUEBA_INDUSTRIAL
    const buscar    = sp.get('buscar')     // texto libre (sku / descripcion)
    const lote      = sp.get('lote')
    const semaforo  = sp.get('semaforo')   // verde | amarillo | rojo | gris

    // Resolver snapshot_id
    let snapId: number | null = null
    let fechaSnapshot: string | null = null

    if (fecha) {
      const r = await pool.query(
        'SELECT id, fecha_snapshot::text FROM inv_snapshots WHERE fecha_snapshot = $1',
        [fecha]
      )
      if (r.rows.length === 0) {
        return NextResponse.json({ error: 'Snapshot no encontrado para esa fecha' }, { status: 404 })
      }
      snapId = r.rows[0].id
      fechaSnapshot = r.rows[0].fecha_snapshot
    } else {
      const r = await pool.query(
        'SELECT id, fecha_snapshot::text FROM inv_snapshots ORDER BY fecha_snapshot DESC LIMIT 1'
      )
      if (r.rows.length === 0) {
        return NextResponse.json({ items: [], fecha_snapshot: null, totales: null })
      }
      snapId = r.rows[0].id
      fechaSnapshot = r.rows[0].fecha_snapshot
    }

    // Construir WHERE
    // Excluir registros sin stock: PT con litros=0, empaque/cinta con existencia=0
    const conds: string[] = [
      'i.snapshot_id = $1',
      `CASE WHEN i.tipo = 'PRODUCTO_TERMINADO'
            THEN COALESCE(i.total_litros, 0) > 0
            ELSE COALESCE(i.existencia, 0) > 0
       END`,
    ]
    const params: unknown[] = [snapId]
    let idx = 2

    if (tipo) {
      conds.push(`i.tipo = $${idx++}`)
      params.push(tipo)
    }
    if (estado) {
      conds.push(`i.estado = $${idx++}`)
      params.push(estado)
    }
    if (lote?.trim()) {
      conds.push(`i.lote ILIKE $${idx++}`)
      params.push(`%${lote.trim()}%`)
    }
    if (buscar?.trim()) {
      conds.push(`(i.sku ILIKE $${idx} OR i.codigo ILIKE $${idx} OR i.descripcion ILIKE $${idx})`)
      params.push(`%${buscar.trim()}%`)
      idx++
    }

    const where = conds.join(' AND ')

    // Días restantes calculados vs fecha del snapshot
    const diasExpr = `(i.fecha_vence - '${fechaSnapshot}'::date)`

    // Semáforo filter
    if (semaforo === 'verde') {
      conds.push(`${diasExpr} > 90`)
    } else if (semaforo === 'amarillo') {
      conds.push(`${diasExpr} BETWEEN 30 AND 90`)
    } else if (semaforo === 'rojo') {
      conds.push(`${diasExpr} < 30 AND i.fecha_vence IS NOT NULL`)
    } else if (semaforo === 'gris') {
      conds.push(`i.fecha_vence IS NULL`)
    }

    const whereUpdated = conds.join(' AND ')

    const r = await pool.query(`
      SELECT
        i.id,
        i.tipo,
        i.estado,
        i.sku,
        i.codigo,
        i.categoria,
        i.descripcion,
        i.lote,
        i.fecha_vence::text,
        i.fecha_ingreso::text,
        i.vida_util_dias,
        i.unidad_medida,
        i.total_cajas,
        i.total_unidades,
        i.total_litros,
        i.inv_inicial,
        i.despacho,
        i.devolucion,
        i.ingreso,
        i.reclamo,
        i.existencia,
        i.comentarios,
        ${diasExpr} AS dias_restantes
      FROM inv_snapshot_items i
      WHERE ${whereUpdated}
      ORDER BY i.tipo, i.estado NULLS LAST, i.descripcion
    `, params)

    // Totales PT (respetando filtros)
    const totR = await pool.query(`
      SELECT
        ROUND(SUM(total_cajas)::numeric, 2)    AS total_cajas,
        ROUND(SUM(total_unidades)::numeric, 2) AS total_unidades,
        ROUND(SUM(total_litros)::numeric, 2)   AS total_litros,
        ROUND(SUM(existencia)::numeric, 2)     AS total_existencia
      FROM inv_snapshot_items i
      WHERE ${whereUpdated}
    `, params)

    return NextResponse.json({
      items: r.rows,
      fecha_snapshot: fechaSnapshot,
      snapshot_id: snapId,
      totales: totR.rows[0],
    })
  } catch (err: any) {
    console.error('[inventario/items]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
