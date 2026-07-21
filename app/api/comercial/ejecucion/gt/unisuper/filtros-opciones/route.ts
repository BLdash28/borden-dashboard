import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 3600

/**
 * Opciones para los filtros globales de Unisuper GT.
 * Devuelve cadenas, subcategorías, tiendas (nombre_sucursal) y SKUs con
 * ordenamiento por volumen de ventas (los más importantes arriba).
 */
export async function GET(_req: NextRequest) {
  try {
    const [cadenasR, subcatR, tiendasR, skusR] = await Promise.all([
      pool.query(`
        SELECT cadena AS value,
               ROUND(SUM(ventas_valor)::numeric, 0) AS venta
        FROM fact_ventas_unisuper
        WHERE pais='GT' AND EXTRACT(YEAR FROM fecha)=2026 AND cadena IS NOT NULL AND cadena <> ''
        GROUP BY cadena ORDER BY venta DESC NULLS LAST
      `),
      pool.query(`
        SELECT subcategoria AS value,
               ROUND(SUM(ventas_valor)::numeric, 0) AS venta
        FROM fact_ventas_unisuper
        WHERE pais='GT' AND EXTRACT(YEAR FROM fecha)=2026 AND subcategoria IS NOT NULL AND subcategoria <> ''
        GROUP BY subcategoria ORDER BY venta DESC NULLS LAST
      `),
      pool.query(`
        SELECT nombre_sucursal AS value,
               MAX(cadena) AS cadena,
               ROUND(SUM(ventas_valor)::numeric, 0) AS venta
        FROM fact_ventas_unisuper
        WHERE pais='GT' AND EXTRACT(YEAR FROM fecha)=2026 AND nombre_sucursal IS NOT NULL
        GROUP BY nombre_sucursal ORDER BY venta DESC NULLS LAST
      `),
      pool.query(`
        SELECT sku AS value,
               MAX(descripcion)  AS descripcion,
               MAX(subcategoria) AS subcategoria,
               ROUND(SUM(ventas_valor)::numeric, 0) AS venta
        FROM fact_ventas_unisuper
        WHERE pais='GT' AND EXTRACT(YEAR FROM fecha)=2026 AND sku IS NOT NULL AND ventas_unidades > 0
        GROUP BY sku ORDER BY venta DESC NULLS LAST
      `),
    ])

    return NextResponse.json({
      pais: 'GT',
      ano: 2026,
      cadenas:       cadenasR.rows.map(r => ({ value: r.value, venta: parseFloat(r.venta ?? '0') })),
      subcategorias: subcatR.rows.map(r => ({ value: r.value,  venta: parseFloat(r.venta ?? '0') })),
      puntos:        tiendasR.rows.map(r => ({ value: r.value, cadena: r.cadena, venta: parseFloat(r.venta ?? '0') })),
      skus:          skusR.rows.map(r => ({
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
