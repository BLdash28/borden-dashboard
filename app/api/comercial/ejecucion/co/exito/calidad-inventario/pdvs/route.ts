import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

/**
 * Detalle de PDVs por SKU × bucket de nivel de inventario.
 *
 * Query params:
 *  - sku (obligatorio): SKU o PLU
 *  - bucket: 'menos_de_3' | 'entre_3_y_10' | 'mayor_a_10' | 'todos'
 *  - cadena: filtra por cadena
 */
export async function GET(req: NextRequest) {
  try {
    const sku    = req.nextUrl.searchParams.get('sku') ?? ''
    const bucket = req.nextUrl.searchParams.get('bucket') ?? 'todos'
    const cadena = req.nextUrl.searchParams.get('cadena') ?? ''

    if (!sku) return NextResponse.json({ error: 'sku requerido' }, { status: 400 })

    let bucketFilter = 'AND inv_unidades > 0'
    if (bucket === 'menos_de_3')   bucketFilter = 'AND inv_unidades > 0 AND inv_unidades < 3'
    if (bucket === 'entre_3_y_10') bucketFilter = 'AND inv_unidades >= 3 AND inv_unidades <= 10'
    if (bucket === 'mayor_a_10')   bucketFilter = 'AND inv_unidades > 10'

    const cadFilter = cadena ? `AND cadena = '${cadena.replace(/'/g, "''")}'` : ''

    const r = await pool.query(`
      WITH ult AS (
        SELECT MAX(fecha_snapshot) AS f
        FROM inventario_exito
        WHERE pais='CO' AND cliente='GRUPO ÉXITO'
      )
      SELECT
        gln,
        punto_venta,
        cadena,
        subcadena,
        departamento,
        ciudad,
        MAX(descripcion) AS descripcion,
        MAX(sku) AS sku,
        MAX(plu) AS plu,
        SUM(inv_unidades)  AS inv_unidades,
        SUM(inv_valor_cop) AS inv_valor_cop,
        SUM(inv_valor_usd) AS inv_valor_usd
      FROM inventario_exito
      WHERE pais='CO' AND cliente='GRUPO ÉXITO'
        AND fecha_snapshot = (SELECT f FROM ult)
        AND (sku = $1 OR plu = $1)
        ${bucketFilter}
        ${cadFilter}
      GROUP BY gln, punto_venta, cadena, subcadena, departamento, ciudad
      ORDER BY SUM(inv_unidades) DESC
    `, [sku])

    return NextResponse.json({
      sku,
      bucket,
      pdvs: r.rows.map(x => ({
        gln:           x.gln,
        punto_venta:   x.punto_venta,
        cadena:        x.cadena,
        subcadena:     x.subcadena,
        departamento:  x.departamento,
        ciudad:        x.ciudad,
        descripcion:   x.descripcion,
        inv_unidades:  parseFloat(x.inv_unidades ?? '0'),
        inv_valor_cop: parseFloat(x.inv_valor_cop ?? '0'),
        inv_valor_usd: parseFloat(x.inv_valor_usd ?? '0'),
      })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
