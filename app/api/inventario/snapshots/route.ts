import { NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const r = await pool.query(`
      SELECT
        s.id,
        s.fecha_snapshot,
        s.archivo_origen,
        s.cargado_en,
        COUNT(i.id) AS total_items
      FROM inv_snapshots s
      LEFT JOIN inv_snapshot_items i ON i.snapshot_id = s.id
      GROUP BY s.id, s.fecha_snapshot, s.archivo_origen, s.cargado_en
      ORDER BY s.fecha_snapshot DESC
    `)
    return NextResponse.json({ snapshots: r.rows })
  } catch (err: any) {
    console.error('[inventario/snapshots]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
