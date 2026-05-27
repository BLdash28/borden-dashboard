import { NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 0

export async function GET() {
  try {
    const CEDI_FILTER = `tienda ILIKE '1001%' OR tienda ILIKE '1017%'`
    const { rows } = await pool.query(`
      WITH ultima AS (SELECT MAX(fecha) AS fecha FROM fact_selectos_inventario)
      SELECT
        u.fecha,
        SUM(CASE WHEN NOT (${CEDI_FILTER}) THEN inventario_valor    ELSE 0 END) AS pdv_valor,
        SUM(CASE WHEN NOT (${CEDI_FILTER}) THEN inventario_unidades ELSE 0 END) AS pdv_unidades,
        SUM(CASE WHEN      (${CEDI_FILTER}) THEN inventario_valor    ELSE 0 END) AS cedi_valor,
        SUM(CASE WHEN      (${CEDI_FILTER}) THEN inventario_unidades ELSE 0 END) AS cedi_unidades
      FROM fact_selectos_inventario fsi
      JOIN ultima u ON fsi.fecha = u.fecha
      GROUP BY u.fecha
    `)
    const row = rows[0]
    return NextResponse.json({
      pdv_valor:      row ? parseFloat(row.pdv_valor)      : 0,
      pdv_unidades:   row ? parseFloat(row.pdv_unidades)   : 0,
      cedi_valor:     row ? parseFloat(row.cedi_valor)     : 0,
      cedi_unidades:  row ? parseFloat(row.cedi_unidades)  : 0,
      total_valor:    row ? parseFloat(row.pdv_valor) + parseFloat(row.cedi_valor) : 0,
      total_unidades: row ? parseFloat(row.pdv_unidades) + parseFloat(row.cedi_unidades) : 0,
      fecha:          row?.fecha ?? null,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
