import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 0

export async function GET(req: NextRequest) {
  try {
    const sp   = req.nextUrl.searchParams
    const pais = sp.get('pais') || ''
    const where = pais ? `WHERE pais = '${pais.replace(/'/g, "''")}'` : ''

    const r = await pool.query(`
      SELECT * FROM registro_ofertas
      ${where}
      ORDER BY fecha_registro DESC
      LIMIT 200
    `)
    return NextResponse.json({ rows: r.rows })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json()
    const r = await pool.query(`
      INSERT INTO registro_ofertas (
        pais, cliente, formatos, producto, upc,
        pvp, pct_descuento, precio_oferta,
        fecha_inicio, fecha_fin, dias, quincena,
        so_prom_mes, factor_elast, so_proy_uds, so_proy_valor,
        impacto_local, impacto_usd,
        inv_total, tendencia, estado_stock, estado
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
      ) RETURNING id, fecha_registro
    `, [
      b.pais, b.cliente, b.formatos, b.producto, b.upc,
      b.pvp, b.pct_descuento, b.precio_oferta,
      b.fecha_inicio, b.fecha_fin, b.dias, b.quincena,
      b.so_prom_mes, b.factor_elast, b.so_proy_uds, b.so_proy_valor,
      b.impacto_local, b.impacto_usd,
      b.inv_total, b.tendencia, b.estado_stock, b.estado ?? 'Borrador',
    ])
    return NextResponse.json({ ok: true, id: r.rows[0].id })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, estado } = await req.json()
    await pool.query(
      `UPDATE registro_ofertas SET estado = $1 WHERE id = $2`,
      [estado, id]
    )
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}
