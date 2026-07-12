import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 600

/**
 * Opciones de filtros globales del módulo Walmart CA por país.
 * Dimensiones: cadena, subcategoria, formato, punto_venta, sku.
 */
export async function GET(req: NextRequest) {
  try {
    const pais = req.nextUrl.searchParams.get('pais') ?? 'CR'
    const anoR = await pool.query(
      `SELECT EXTRACT(YEAR FROM MAX(fecha))::int AS ano FROM fact_ventas_walmart WHERE pais=$1`,
      [pais],
    )
    const ano = anoR.rows[0]?.ano ?? new Date().getFullYear()

    const [cadR, catR, subR, fmtR, pdvR, skuR] = await Promise.all([
      pool.query(
        `SELECT cadena, SUM(ventas_valor)::float AS venta
           FROM fact_ventas_walmart
          WHERE pais=$1 AND EXTRACT(YEAR FROM fecha)=$2
            AND cadena IS NOT NULL AND cadena <> ''
          GROUP BY cadena ORDER BY venta DESC NULLS LAST`,
        [pais, ano],
      ),
      pool.query(
        `SELECT categoria, SUM(ventas_valor)::float AS venta
           FROM fact_ventas_walmart
          WHERE pais=$1 AND EXTRACT(YEAR FROM fecha)=$2
            AND categoria IS NOT NULL AND categoria <> ''
          GROUP BY categoria ORDER BY venta DESC NULLS LAST`,
        [pais, ano],
      ),
      pool.query(
        `SELECT subcategoria, SUM(ventas_valor)::float AS venta
           FROM fact_ventas_walmart
          WHERE pais=$1 AND EXTRACT(YEAR FROM fecha)=$2
            AND subcategoria IS NOT NULL AND subcategoria <> ''
          GROUP BY subcategoria ORDER BY venta DESC NULLS LAST`,
        [pais, ano],
      ),
      pool.query(
        `SELECT formato, SUM(ventas_valor)::float AS venta
           FROM fact_ventas_walmart
          WHERE pais=$1 AND EXTRACT(YEAR FROM fecha)=$2
            AND formato IS NOT NULL AND formato <> ''
          GROUP BY formato ORDER BY venta DESC NULLS LAST`,
        [pais, ano],
      ),
      pool.query(
        `SELECT punto_venta, MAX(cadena) AS cadena, SUM(ventas_valor)::float AS venta
           FROM fact_ventas_walmart
          WHERE pais=$1 AND EXTRACT(YEAR FROM fecha)=$2
            AND punto_venta IS NOT NULL AND punto_venta <> ''
          GROUP BY punto_venta ORDER BY venta DESC NULLS LAST
          LIMIT 500`,
        [pais, ano],
      ),
      pool.query(
        `SELECT sku, MAX(descripcion) AS descripcion,
                MAX(subcategoria) AS subcategoria, SUM(ventas_valor)::float AS venta
           FROM fact_ventas_walmart
          WHERE pais=$1 AND EXTRACT(YEAR FROM fecha)=$2
            AND sku IS NOT NULL AND sku <> ''
          GROUP BY sku ORDER BY venta DESC NULLS LAST`,
        [pais, ano],
      ),
    ])

    return NextResponse.json({
      pais, ano,
      cadenas:       cadR.rows.map(r => ({ value: r.cadena, venta: r.venta })),
      categorias:    catR.rows.map(r => ({ value: r.categoria, venta: r.venta })),
      subcategorias: subR.rows.map(r => ({ value: r.subcategoria, venta: r.venta })),
      formatos:      fmtR.rows.map(r => ({ value: r.formato, venta: r.venta })),
      puntos:        pdvR.rows.map(r => ({ value: r.punto_venta, cadena: r.cadena, venta: r.venta })),
      skus:          skuR.rows.map(r => ({ value: r.sku, descripcion: r.descripcion, subcategoria: r.subcategoria, venta: r.venta })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
