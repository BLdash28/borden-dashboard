import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

/**
 * Cobertura Unisuper GT — replica el shape del endpoint /walmart/cobertura
 * simplificado para 1 sola cadena de retail y 1 categoría (Quesos).
 *
 * Devuelve:
 *   universo:            total PDVs activos GT (con al menos 1 venta últimos 90d)
 *   por_cadena[]:        cobertura % por cadena (SKUs con venta / SKUs totales)
 *   por_sku[]:           por SKU, cuántos PDVs vendieron y %
 *   cob_efectiva:        promedio de cobertura por SKU
 */
function csv(sp: URLSearchParams, key: string): string[] {
  const v = sp.get(key)
  return v ? v.split(',').map(s => s.trim()).filter(Boolean) : []
}

function buildWhere(sp: URLSearchParams) {
  const params: unknown[] = []
  const conds: string[] = [`pais = 'GT'`]

  const cadenas = csv(sp, 'cadenas')
  if (cadenas.length) {
    const start = params.length
    cadenas.forEach(v => params.push(v))
    conds.push(`cadena IN (${cadenas.map((_, i) => `$${start + 1 + i}`).join(',')})`)
  }
  const subcats = csv(sp, 'subcategorias')
  if (subcats.length) {
    const start = params.length
    subcats.forEach(v => params.push(v))
    conds.push(`subcategoria IN (${subcats.map((_, i) => `$${start + 1 + i}`).join(',')})`)
  }
  return { where: conds.join(' AND '), params }
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const w  = buildWhere(sp)

    const [univR, cadenaR, skuR] = await Promise.all([
      // Universo: PDVs activos en últimos 90 días
      pool.query(`
        SELECT COUNT(DISTINCT nombre_sucursal) AS universo
        FROM fact_ventas_unisuper
        WHERE ${w.where}
          AND fecha >= CURRENT_DATE - INTERVAL '90 day'
          AND ventas_unidades > 0
      `, w.params),

      // Cobertura por cadena
      pool.query(`
        WITH pdvs AS (
          SELECT cadena, COUNT(DISTINCT nombre_sucursal) AS pdvs_activos
          FROM fact_ventas_unisuper
          WHERE ${w.where}
            AND fecha >= CURRENT_DATE - INTERVAL '90 day'
          GROUP BY cadena
        ),
        ventas AS (
          SELECT cadena,
            COUNT(DISTINCT sku) AS skus,
            SUM(ventas_unidades) AS uds
          FROM fact_ventas_unisuper
          WHERE ${w.where}
            AND fecha >= CURRENT_DATE - INTERVAL '90 day'
            AND ventas_unidades > 0
          GROUP BY cadena
        )
        SELECT p.cadena,
          p.pdvs_activos,
          COALESCE(v.skus, 0) AS skus,
          COALESCE(v.uds, 0)  AS uds,
          ROUND((COALESCE(v.skus, 0)::numeric / NULLIF(p.pdvs_activos, 0) * 100), 1) AS cobertura_pct
        FROM pdvs p
        LEFT JOIN ventas v ON v.cadena = p.cadena
        ORDER BY v.uds DESC NULLS LAST
      `, [...w.params, ...w.params]),

      // Por SKU: cuántos PDVs vendieron ese SKU en 90d
      pool.query(`
        WITH univ AS (
          SELECT COUNT(DISTINCT nombre_sucursal) AS total
          FROM fact_ventas_unisuper
          WHERE ${w.where}
            AND fecha >= CURRENT_DATE - INTERVAL '90 day'
            AND ventas_unidades > 0
        )
        SELECT f.sku,
          MAX(f.descripcion)             AS descripcion,
          MAX(f.subcategoria)            AS subcategoria,
          COUNT(DISTINCT f.nombre_sucursal) AS pdvs_con_venta,
          (SELECT total FROM univ)       AS universo,
          ROUND((COUNT(DISTINCT f.nombre_sucursal)::numeric / NULLIF((SELECT total FROM univ), 0) * 100), 1) AS cobertura_pct,
          SUM(f.ventas_unidades)::int    AS uds_90d,
          ROUND(SUM(f.ventas_valor)::numeric, 0) AS valor_90d
        FROM fact_ventas_unisuper f
        WHERE ${w.where}
          AND f.fecha >= CURRENT_DATE - INTERVAL '90 day'
          AND f.ventas_unidades > 0
        GROUP BY f.sku
        ORDER BY valor_90d DESC
      `, [...w.params, ...w.params]),
    ])

    const universo = parseInt(univR.rows[0]?.universo ?? '0')
    const porSku   = skuR.rows.map((r: any) => ({
      sku:            r.sku,
      descripcion:    r.descripcion,
      subcategoria:   r.subcategoria,
      pdvs_con_venta: parseInt(r.pdvs_con_venta ?? '0'),
      universo:       parseInt(r.universo ?? '0'),
      cobertura_pct:  parseFloat(r.cobertura_pct ?? '0'),
      uds_90d:        parseInt(r.uds_90d ?? '0'),
      valor_90d:      parseFloat(r.valor_90d ?? '0'),
    }))

    const cobEfectiva = porSku.length > 0
      ? porSku.reduce((s, r) => s + r.cobertura_pct, 0) / porSku.length
      : 0

    return NextResponse.json({
      pais:              'GT',
      universo,
      cobertura_efectiva: parseFloat(cobEfectiva.toFixed(1)),
      por_cadena: cadenaR.rows.map((r: any) => ({
        cadena:        r.cadena,
        pdvs_activos:  parseInt(r.pdvs_activos ?? '0'),
        skus:          parseInt(r.skus ?? '0'),
        uds:           parseFloat(r.uds ?? '0'),
        cobertura_pct: parseFloat(r.cobertura_pct ?? '0'),
      })),
      por_sku: porSku,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
