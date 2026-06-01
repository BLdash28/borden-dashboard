import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

export async function GET(req: NextRequest) {
  try {
    const pais     = req.nextUrl.searchParams.get('pais')     ?? 'CR'
    const categoria = req.nextUrl.searchParams.get('categoria') ?? ''
    const paisSafe  = pais.replace(/'/g,"''")
    const catFilter = categoria ? `AND categoria = '${categoria.replace(/'/g,"''")}'` : ''

    // Check if inventario_walmart has columns / data
    const colsR = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'inventario_walmart' AND table_schema = 'public'
      LIMIT 1
    `)

    if (colsR.rows.length === 0) {
      return NextResponse.json({ disponible: false, rows: [], kpis: null, msg: 'Tabla sin estructura definida aún' })
    }

    const countR = await pool.query(`SELECT COUNT(*) AS n FROM inventario_walmart WHERE pais = '${paisSafe}'`)
    const n = parseInt(countR.rows[0]?.n ?? '0')

    if (n === 0) {
      return NextResponse.json({ disponible: false, rows: [], kpis: null, msg: `Sin datos de inventario para ${pais}` })
    }

    // When data exists: aggregate KPIs
    const [kpiR, rowsR] = await Promise.all([
      pool.query(`
        WITH inv AS (
          SELECT *,
            (punto_venta ILIKE '%CEDI%' OR cadena ILIKE '%CEDI%') AS es_cedi
          FROM inventario_walmart
          WHERE pais = '${paisSafe}' ${catFilter}
        )
        SELECT
          COUNT(DISTINCT CASE WHEN NOT es_cedi THEN sku END)         AS skus,
          COUNT(DISTINCT CASE WHEN NOT es_cedi THEN punto_venta END) AS tiendas,
          ROUND(SUM(inv_mano)::numeric, 0)                           AS total_unidades,
          ROUND(SUM(inv_mano * costo_unit)::numeric, 2)              AS total_valor,
          ROUND(SUM(CASE WHEN NOT es_cedi THEN inv_mano ELSE 0 END)::numeric, 0)                AS pdv_unidades,
          ROUND(SUM(CASE WHEN NOT es_cedi THEN inv_mano * costo_unit ELSE 0 END)::numeric, 2)   AS pdv_valor,
          COUNT(DISTINCT CASE WHEN NOT es_cedi THEN punto_venta END) AS pdv_tiendas,
          COUNT(DISTINCT CASE WHEN NOT es_cedi THEN sku END)         AS pdv_skus,
          ROUND(SUM(CASE WHEN es_cedi THEN inv_mano ELSE 0 END)::numeric, 0)                    AS cedi_unidades,
          ROUND(SUM(CASE WHEN es_cedi THEN inv_mano * costo_unit ELSE 0 END)::numeric, 2)       AS cedi_valor,
          COUNT(DISTINCT CASE WHEN es_cedi THEN punto_venta END)     AS n_cedis,
          SUM(CASE WHEN doh <= 7   THEN 1 ELSE 0 END)                AS criticos,
          SUM(CASE WHEN doh BETWEEN 8 AND 14 THEN 1 ELSE 0 END)      AS alertas,
          SUM(CASE WHEN doh > 60  THEN 1 ELSE 0 END)                 AS excedentes,
          MAX(fecha)                                                  AS ultima_fecha
        FROM inv
      `),
      pool.query(`
        SELECT sku, descripcion, categoria, punto_venta, cadena,
          ROUND(inv_mano::numeric, 0) AS inv_mano,
          ROUND(venta_dia::numeric, 2) AS venta_dia,
          ROUND(doh::numeric, 1)      AS doh,
          semaforo, fecha
        FROM inventario_walmart
        WHERE pais = '${paisSafe}' ${catFilter}
        ORDER BY doh ASC NULLS LAST
        LIMIT 500
      `),
    ])

    const k = kpiR.rows[0]
    return NextResponse.json({
      disponible: true,
      kpis: {
        skus:           parseInt(k.skus          ?? '0'),
        tiendas:        parseInt(k.tiendas        ?? '0'),
        total_unidades: parseInt(k.total_unidades ?? '0'),
        total_valor:    parseFloat(k.total_valor  ?? '0'),
        pdv_unidades:   parseInt(k.pdv_unidades   ?? '0'),
        pdv_valor:      parseFloat(k.pdv_valor     ?? '0'),
        pdv_tiendas:    parseInt(k.pdv_tiendas    ?? '0'),
        pdv_skus:       parseInt(k.pdv_skus       ?? '0'),
        cedi_unidades:  parseInt(k.cedi_unidades  ?? '0'),
        cedi_valor:     parseFloat(k.cedi_valor    ?? '0'),
        n_cedis:        parseInt(k.n_cedis         ?? '0'),
        criticos:       parseInt(k.criticos        ?? '0'),
        alertas:        parseInt(k.alertas         ?? '0'),
        excedentes:     parseInt(k.excedentes      ?? '0'),
        ultima_fecha:   k.ultima_fecha ?? null,
      },
      rows: rowsR.rows.map((r: any) => ({
        sku:         r.sku,
        descripcion: r.descripcion,
        categoria:   r.categoria,
        punto_venta: r.punto_venta,
        cadena:      r.cadena,
        inv_mano:    parseFloat(r.inv_mano ?? '0'),
        venta_dia:   parseFloat(r.venta_dia ?? '0'),
        doh:         r.doh !== null ? parseFloat(r.doh) : null,
        semaforo:    r.semaforo,
        fecha:       r.fecha,
      })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
