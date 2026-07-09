import { NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

export async function GET() {
  try {
    const r = await pool.query(
      `SELECT ean13, plu, codigo_borden, sku, descripcion, gramos,
              precio_anterior_cop, precio_vigente_cop,
              fecha_vigencia_desde, es_oferta, es_innovacion, cargado_en
       FROM precios_exito
       WHERE pais='CO' AND cliente='GRUPO ÉXITO'
       ORDER BY es_innovacion, es_oferta, plu`,
    )
    const filas = r.rows.map(x => ({
      ean13:                x.ean13,
      plu:                  x.plu,
      codigo_borden:        x.codigo_borden,
      sku:                  x.sku,
      descripcion:          x.descripcion,
      gramos:               x.gramos !== null ? parseFloat(x.gramos) : null,
      precio_anterior_cop:  x.precio_anterior_cop !== null ? parseFloat(x.precio_anterior_cop) : null,
      precio_vigente_cop:   x.precio_vigente_cop  !== null ? parseFloat(x.precio_vigente_cop)  : null,
      fecha_vigencia_desde: x.fecha_vigencia_desde,
      es_oferta:            !!x.es_oferta,
      es_innovacion:        !!x.es_innovacion,
    }))
    const ultimaCarga = r.rows[0]?.cargado_en ?? null

    return NextResponse.json({ filas, ultima_carga: ultimaCarga, total: filas.length })
  } catch (err) {
    return handleApiError(err)
  }
}
