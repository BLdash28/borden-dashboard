import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'
import { withTiming } from '@/lib/api/withTiming'

export const revalidate = 300

/**
 * Innovaciones · Selectos SV
 * Heurística: primera venta en los últimos N días (default 180).
 */
export const GET = withTiming(async function GET(req: NextRequest) {
  try {
    const dias = parseInt(req.nextUrl.searchParams.get('dias') ?? '180')

    const catR = await pool.query(`
      WITH primera AS (
        SELECT sku, codigo_barras,
          MAX(descripcion)  AS descripcion,
          MAX(categoria)    AS categoria,
          MAX(subcategoria) AS subcategoria,
          MIN(fecha)        AS primera_venta,
          MAX(fecha)        AS ultima_venta
        FROM fact_ventas_selectos
        WHERE ventas_unidades > 0
        GROUP BY sku, codigo_barras
      )
      SELECT * FROM primera
      WHERE primera_venta >= CURRENT_DATE - ($1::int * INTERVAL '1 day')
      ORDER BY primera_venta DESC
    `, [dias])

    const items: any[] = []
    for (const it of catR.rows) {
      const [monthlyR, dailyR, statsR] = await Promise.all([
        pool.query(`
          SELECT EXTRACT(YEAR FROM fecha)::int  AS ano,
                 EXTRACT(MONTH FROM fecha)::int AS mes,
                 SUM(ventas_unidades)::float   AS uds,
                 SUM(ventas_valor)::float      AS valor,
                 COUNT(DISTINCT nombre_sucursal) AS pdvs
          FROM fact_ventas_selectos
          WHERE (sku = $1 OR codigo_barras = $2)
          GROUP BY 1, 2 ORDER BY 1, 2
        `, [it.sku, it.codigo_barras]),

        pool.query(`
          SELECT fecha::text                    AS fecha,
                 SUM(ventas_unidades)::float   AS uds,
                 SUM(ventas_valor)::float      AS valor,
                 COUNT(DISTINCT nombre_sucursal) AS pdvs
          FROM fact_ventas_selectos
          WHERE (sku = $1 OR codigo_barras = $2)
            AND fecha >= CURRENT_DATE - INTERVAL '90 day'
          GROUP BY fecha ORDER BY fecha
        `, [it.sku, it.codigo_barras]),

        pool.query(`
          SELECT SUM(ventas_unidades)::float  AS total_uds,
                 SUM(ventas_valor)::float     AS total_valor,
                 COUNT(DISTINCT nombre_sucursal) AS pdvs_unicos,
                 COUNT(DISTINCT cadena)       AS cadenas_unicas
          FROM fact_ventas_selectos
          WHERE (sku = $1 OR codigo_barras = $2)
        `, [it.sku, it.codigo_barras]),
      ])

      const s = statsR.rows[0] ?? {}
      items.push({
        sku: it.sku, codigo_barras: it.codigo_barras,
        descripcion: it.descripcion, categoria: it.categoria, subcategoria: it.subcategoria,
        primera_venta: it.primera_venta ? new Date(it.primera_venta).toISOString().slice(0, 10) : null,
        ultima_venta:  it.ultima_venta  ? new Date(it.ultima_venta).toISOString().slice(0, 10)  : null,
        dias_desde_lanz: it.primera_venta
          ? Math.floor((Date.now() - new Date(it.primera_venta).getTime()) / 86400000) : null,
        sin_ventas: parseFloat(s.total_uds ?? '0') === 0,
        total_uds: parseFloat(s.total_uds ?? '0'),
        total_valor: parseFloat(s.total_valor ?? '0'),
        pdvs_unicos: parseInt(s.pdvs_unicos ?? '0'),
        cadenas_unicas: parseInt(s.cadenas_unicas ?? '0'),
        monthly: monthlyR.rows.map(r => ({
          ano: parseInt(r.ano), mes: parseInt(r.mes),
          uds: parseFloat(r.uds ?? '0'), valor: parseFloat(r.valor ?? '0'),
          pdvs: parseInt(r.pdvs ?? '0'),
        })),
        daily: dailyR.rows.map(r => ({
          fecha: r.fecha,
          uds: parseFloat(r.uds ?? '0'), valor: parseFloat(r.valor ?? '0'),
          pdvs: parseInt(r.pdvs ?? '0'),
        })),
      })
    }

    return NextResponse.json({ items, total: items.length, ventana_dias: dias })
  } catch (err) {
    return handleApiError(err)
  }
})
