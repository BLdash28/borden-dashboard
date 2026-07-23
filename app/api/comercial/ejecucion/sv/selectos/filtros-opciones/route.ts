import { NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 900 // 15 min

/**
 * Opciones para los filtros del módulo Ejecución Selectos SV.
 * Devuelve subcategorías + SKUs (con descripción) ordenados por venta
 * descendente para que los más relevantes aparezcan arriba en el multi-select.
 */
export async function GET() {
  try {
    const [subR, skuR] = await Promise.all([
      pool.query(`
        SELECT subcategoria AS value, SUM(ventas_valor)::numeric(14,2) AS venta
        FROM fact_ventas_selectos
        WHERE pais='SV' AND subcategoria IS NOT NULL AND subcategoria <> ''
        GROUP BY subcategoria
        ORDER BY venta DESC
      `),
      pool.query(`
        SELECT
          sku AS value,
          MAX(descripcion) AS descripcion,
          MAX(subcategoria) AS subcategoria,
          SUM(ventas_valor)::numeric(14,2) AS venta
        FROM fact_ventas_selectos
        WHERE pais='SV' AND sku IS NOT NULL AND sku <> ''
        GROUP BY sku
        ORDER BY venta DESC
      `),
    ])
    return NextResponse.json({
      subcategorias: subR.rows.map(r => ({
        value: r.value,
        venta: parseFloat(r.venta ?? '0'),
      })),
      skus: skuR.rows.map(r => ({
        value:        r.value,
        descripcion:  r.descripcion,
        subcategoria: r.subcategoria,
        venta:        parseFloat(r.venta ?? '0'),
      })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
