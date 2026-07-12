import { NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 600

/**
 * Opciones disponibles para los filtros globales del módulo Grupo Éxito CO:
 * - cadenas       (de fact_ventas_exito)
 * - subcategorias (de fact_ventas_exito)
 * - departamentos (de fact_ventas_exito)
 * - ciudades      (de fact_ventas_exito, con su departamento)
 * - skus          (de fact_ventas_exito + descripcion)
 *
 * Solo se listan valores con ventas en el año en curso (o el más reciente).
 */
export async function GET() {
  try {
    // Año de referencia: el mayor con ventas registradas
    const anoR = await pool.query(
      `SELECT MAX(ano)::int AS ano FROM fact_ventas_exito WHERE pais='CO'`,
    )
    const ano = anoR.rows[0]?.ano ?? 2026

    const [cadR, subR, deptR, ciuR, skuR] = await Promise.all([
      pool.query(
        `SELECT cadena, SUM(venta_valorcop)::float AS venta
           FROM fact_ventas_exito
          WHERE pais='CO' AND ano=$1 AND cadena IS NOT NULL AND cadena <> ''
          GROUP BY cadena
          ORDER BY venta DESC NULLS LAST`,
        [ano],
      ),
      pool.query(
        `SELECT subcategoria, SUM(venta_valorcop)::float AS venta
           FROM fact_ventas_exito
          WHERE pais='CO' AND ano=$1 AND subcategoria IS NOT NULL AND subcategoria <> ''
          GROUP BY subcategoria
          ORDER BY venta DESC NULLS LAST`,
        [ano],
      ),
      pool.query(
        `SELECT departamento, SUM(venta_valorcop)::float AS venta
           FROM fact_ventas_exito
          WHERE pais='CO' AND ano=$1 AND departamento IS NOT NULL AND departamento <> ''
          GROUP BY departamento
          ORDER BY venta DESC NULLS LAST`,
        [ano],
      ),
      pool.query(
        `SELECT ciudad, MAX(departamento) AS departamento,
                SUM(venta_valorcop)::float AS venta
           FROM fact_ventas_exito
          WHERE pais='CO' AND ano=$1 AND ciudad IS NOT NULL AND ciudad <> ''
          GROUP BY ciudad
          ORDER BY venta DESC NULLS LAST`,
        [ano],
      ),
      pool.query(
        `SELECT sku, MAX(descripcion) AS descripcion, MAX(subcategoria) AS subcategoria,
                SUM(venta_valorcop)::float AS venta
           FROM fact_ventas_exito
          WHERE pais='CO' AND ano=$1 AND sku IS NOT NULL AND sku <> ''
          GROUP BY sku
          ORDER BY venta DESC NULLS LAST`,
        [ano],
      ),
    ])

    return NextResponse.json({
      ano,
      cadenas:       cadR.rows.map(r => ({ value: r.cadena,       venta: r.venta })),
      subcategorias: subR.rows.map(r => ({ value: r.subcategoria, venta: r.venta })),
      departamentos: deptR.rows.map(r => ({ value: r.departamento, venta: r.venta })),
      ciudades:      ciuR.rows.map(r => ({ value: r.ciudad, departamento: r.departamento, venta: r.venta })),
      skus:          skuR.rows.map(r => ({ value: r.sku, descripcion: r.descripcion, subcategoria: r.subcategoria, venta: r.venta })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
