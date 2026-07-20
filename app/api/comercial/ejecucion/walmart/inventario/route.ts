import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'
import { parseWalmartFilters, buildWalmartWhere } from '@/lib/api/walmart-filtros'

// Snapshot de inventario Walmart — el bot RetailLink lo actualiza 1×día.
// 30 min de cache reduce carga masivamente sin desactualizar percepciblemente.
export const revalidate = 1800

export async function GET(req: NextRequest) {
  try {
    const pais = req.nextUrl.searchParams.get('pais') ?? 'CR'
    const f    = parseWalmartFilters(req)

    // WHEREs — se aplican sobre fact_inventario_walmart_pdv (alias t) y
    // fact_inventario_walmart_cedi (alias c). También sobre fact_ventas_walmart
    // (subquery vel) sin alias.
    // PDV: tiene cadena, categoria, punto_venta, sku (NO subcategoria/formato)
    const wT   = buildWalmartWhere(f, { alias: 't', startAt: 2, omit: ['subcategoria', 'formato'] })
    // CEDI: solo tiene categoria, sku (NO cadena/subcategoria/formato/punto_venta)
    const wC   = buildWalmartWhere(f, { alias: 'c', startAt: 2, omit: ['cadena', 'subcategoria', 'formato', 'punto_venta'] })
    // Ventas (referencia velocity): tabla completa, todos los filtros aplican
    const wV   = buildWalmartWhere(f, { startAt: 2 })

    // ── Check availability ──────────────────────────────────────────────────
    const [countTiendas, countCedi] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS n FROM fact_inventario_walmart_pdv  WHERE pais = $1`, [pais]),
      pool.query(`SELECT COUNT(*) AS n FROM fact_inventario_walmart_cedi WHERE pais = $1`, [pais]),
    ])
    const nTiendas = parseInt(countTiendas.rows[0]?.n ?? '0')
    const nCedi    = parseInt(countCedi.rows[0]?.n    ?? '0')

    if (nTiendas === 0 && nCedi === 0) {
      return NextResponse.json({ disponible: false, rows: [], kpis: null, msg: `Sin datos de inventario para ${pais}` })
    }

    // ── Run main queries in parallel ────────────────────────────────────────
    const [pdvResult, cediResult, storeStatsResult] = await Promise.all([

      // PDV: aggregated by SKU with sell-out pricing
      nTiendas > 0 ? pool.query(`
        WITH ultima AS (
          SELECT MAX(fecha) AS f FROM fact_inventario_walmart_pdv WHERE pais = $1
        ),
        base AS (
          SELECT
            COALESCE(dp.codigo_barras, t.codigo_barras) AS codigo_barras,
            MAX(dp.sku)                                                              AS sku,
            COALESCE(MAX(NULLIF(dp.descripcion,'')), MAX(NULLIF(t.descripcion,''))) AS descripcion,
            MAX(dp.categoria)    AS categoria,
            MAX(dp.subcategoria) AS subcategoria,
            SUM(t.inv_mano)      AS inv_mano,
            COUNT(DISTINCT t.punto_venta) AS tiendas,
            TO_CHAR(MAX(t.fecha), 'YYYY-MM-DD') AS fecha_snap
          FROM fact_inventario_walmart_pdv t
          JOIN ultima ON t.fecha = ultima.f
          LEFT JOIN dim_producto dp ON (
            CASE WHEN t.codigo_barras LIKE '0%'
                 THEN LTRIM(t.codigo_barras, '0')
                 ELSE LTRIM(LEFT(t.codigo_barras, LENGTH(t.codigo_barras)-1), '0')
            END
          ) = LTRIM(LEFT(dp.codigo_barras, LENGTH(dp.codigo_barras)-1), '0')
          WHERE t.pais = $1 AND ${wT.where}
          GROUP BY COALESCE(dp.codigo_barras, t.codigo_barras)
        ),
        vel AS (
          SELECT codigo_barras,
            ROUND((SUM(ventas_unidades) / 90.0)::numeric, 4) AS venta_dia,
            CASE WHEN SUM(ventas_unidades) > 0
              THEN ROUND((SUM(ventas_valor) / SUM(ventas_unidades))::numeric, 4)
              ELSE 0 END AS precio_unitario
          FROM fact_ventas_walmart
          WHERE fecha >= CURRENT_DATE - INTERVAL '90 days'
            AND pais = $1 AND ${wV.where}
          GROUP BY codigo_barras
        )
        SELECT
          b.*,
          COALESCE(v.venta_dia, 0)       AS venta_dia,
          COALESCE(v.precio_unitario, 0) AS precio_unitario,
          CASE WHEN COALESCE(v.venta_dia, 0) > 0
            THEN ROUND((b.inv_mano / v.venta_dia)::numeric, 1)
            ELSE NULL END AS doh
        FROM base b
        LEFT JOIN vel v ON b.codigo_barras = v.codigo_barras
        ORDER BY b.inv_mano DESC
        LIMIT 300
      `, [pais, ...wT.params]) : Promise.resolve({ rows: [] }),

      // CEDI: per-SKU with VNPK conversion and pricing
      nCedi > 0 ? pool.query(`
        WITH ultima AS (
          SELECT MAX(fecha) AS f FROM fact_inventario_walmart_cedi WHERE pais = $1
        ),
        vel AS (
          SELECT codigo_barras,
            ROUND((SUM(ventas_unidades) / 90.0)::numeric, 4) AS venta_dia,
            CASE WHEN SUM(ventas_unidades) > 0
              THEN ROUND((SUM(ventas_valor) / SUM(ventas_unidades))::numeric, 4)
              ELSE 0 END AS precio_unitario
          FROM fact_ventas_walmart
          WHERE fecha >= CURRENT_DATE - INTERVAL '90 days'
            AND pais = $1 AND ${wV.where}
          GROUP BY codigo_barras
        )
        SELECT
          COALESCE(dp.sku, c.sku, c.codigo_barras)                                  AS sku,
          COALESCE(dp.codigo_barras, c.codigo_barras)                               AS codigo_barras,
          COALESCE(NULLIF(dp.descripcion,''), NULLIF(c.descripcion,''), c.codigo_barras) AS descripcion,
          COALESCE(dp.categoria, '')    AS categoria,
          COALESCE(dp.subcategoria, '') AS subcategoria,
          COALESCE(dp.vnpk_qty, 1)      AS vnpk_qty,
          ROUND(c.inv_cajas::numeric, 0) AS inv_mano_cajas,
          ROUND((c.inv_cajas * COALESCE(dp.vnpk_qty, 1))::numeric, 0) AS inv_mano_unidades,
          COALESCE(vel.venta_dia, 0)       AS venta_dia,
          COALESCE(vel.precio_unitario, 0) AS precio_unitario,
          CASE WHEN COALESCE(vel.venta_dia, 0) > 0
            THEN ROUND(((c.inv_cajas * COALESCE(dp.vnpk_qty, 1)) / vel.venta_dia)::numeric, 1)
            ELSE NULL END AS doh,
          TO_CHAR(c.fecha, 'YYYY-MM-DD') AS fecha_snap
        FROM fact_inventario_walmart_cedi c
        JOIN ultima ON c.fecha = ultima.f
        LEFT JOIN dim_producto dp ON (
          CASE WHEN c.codigo_barras LIKE '0%'
               THEN LTRIM(c.codigo_barras, '0')
               ELSE LTRIM(LEFT(c.codigo_barras, LENGTH(c.codigo_barras)-1), '0')
          END
        ) = LTRIM(LEFT(dp.codigo_barras, LENGTH(dp.codigo_barras)-1), '0')
        LEFT JOIN vel ON COALESCE(dp.codigo_barras, c.codigo_barras) = vel.codigo_barras
        WHERE c.pais = $1 AND ${wC.where}
        ORDER BY c.inv_cajas DESC
        LIMIT 300
      `, [pais, ...wC.params]) : Promise.resolve({ rows: [] }),

      // Store-level DOH counts (SKU × Tienda combinations)
      nTiendas > 0 ? pool.query(`
        WITH ultima AS (
          SELECT MAX(fecha) AS f FROM fact_inventario_walmart_pdv WHERE pais = $1
        ),
        vel AS (
          SELECT codigo_barras, SUM(ventas_unidades)::float / 90.0 AS vpd
          FROM fact_ventas_walmart
          WHERE fecha >= CURRENT_DATE - INTERVAL '90 days' AND pais = $1
            AND ${wV.where}
          GROUP BY codigo_barras
        )
        SELECT
          COUNT(DISTINCT t.punto_venta)::int AS tiendas_distinct,
          COUNT(*) FILTER (
            WHERE v.vpd > 0 AND (t.inv_mano::float / v.vpd) <= 7
          ) AS criticos,
          COUNT(*) FILTER (
            WHERE v.vpd > 0 AND (t.inv_mano::float / v.vpd) > 7
              AND (t.inv_mano::float / v.vpd) <= 14
          ) AS alertas,
          COUNT(*) FILTER (
            WHERE v.vpd > 0 AND (t.inv_mano::float / v.vpd) > 60
          ) AS sobrestock
        FROM fact_inventario_walmart_pdv t
        JOIN ultima ON t.fecha = ultima.f
        LEFT JOIN dim_producto dp ON (
          CASE WHEN t.codigo_barras LIKE '0%'
               THEN LTRIM(t.codigo_barras, '0')
               ELSE LTRIM(LEFT(t.codigo_barras, LENGTH(t.codigo_barras)-1), '0')
          END
        ) = LTRIM(LEFT(dp.codigo_barras, LENGTH(dp.codigo_barras)-1), '0')
        LEFT JOIN vel v ON COALESCE(dp.codigo_barras, t.codigo_barras) = v.codigo_barras
        WHERE t.pais = $1 AND ${wT.where}
      `, [pais, ...wT.params]) : Promise.resolve({ rows: [{ tiendas_distinct: 0, criticos: 0, alertas: 0, sobrestock: 0 }] }),
    ])

    // ── Assemble ────────────────────────────────────────────────────────────
    const pdv = pdvResult.rows
    const ced = cediResult.rows
    const ss  = storeStatsResult.rows[0] ?? { tiendas_distinct: 0, criticos: 0, alertas: 0, sobrestock: 0 }

    const fechaTienda = pdv[0]?.fecha_snap ?? null
    const fechaCedi   = ced[0]?.fecha_snap ?? null

    const pdv_valor  = pdv.reduce((s: number, r: any) => s + (parseFloat(r.inv_mano) || 0) * (parseFloat(r.precio_unitario) || 0), 0)
    const cedi_valor = ced.reduce((s: number, r: any) => s + (parseInt(r.inv_mano_unidades) || 0) * (parseFloat(r.precio_unitario) || 0), 0)

    const kpis = {
      // PDV — SKU level
      pdv_skus:          pdv.length,
      pdv_tiendas:       pdv.reduce((s: number, r: any) => s + (parseInt(r.tiendas) || 0), 0),
      pdv_tiendas_dist:  parseInt(ss.tiendas_distinct) || 0,
      pdv_inv:           pdv.reduce((s: number, r: any) => s + (parseFloat(r.inv_mano) || 0), 0),
      pdv_valor,
      pdv_criticos:      pdv.filter((r: any) => r.doh !== null && parseFloat(r.doh) <= 7).length,
      pdv_alertas:       pdv.filter((r: any) => r.doh !== null && parseFloat(r.doh) > 7  && parseFloat(r.doh) <= 21).length,
      pdv_excedentes:    pdv.filter((r: any) => r.doh !== null && parseFloat(r.doh) > 60).length,
      pdv_sin_datos:     pdv.filter((r: any) => r.doh === null).length,
      // PDV — store × SKU level
      pdv_criticos_stores:  parseInt(ss.criticos)   || 0,
      pdv_alertas_stores:   parseInt(ss.alertas)    || 0,
      pdv_sobrestock_stores:parseInt(ss.sobrestock) || 0,
      fecha_tiendas: fechaTienda,
      // CEDI
      cedi_skus:       ced.length,
      cedi_cajas:      ced.reduce((s: number, r: any) => s + (parseInt(r.inv_mano_cajas)    || 0), 0),
      cedi_unidades:   ced.reduce((s: number, r: any) => s + (parseInt(r.inv_mano_unidades) || 0), 0),
      cedi_ordenes:    0,
      cedi_sin_stock:  ced.filter((r: any) => parseInt(r.inv_mano_cajas) === 0).length,
      cedi_criticos:   ced.filter((r: any) => r.doh !== null && parseFloat(r.doh) <= 7).length,
      cedi_valor,
      fecha_cedi: fechaCedi,
    }

    return NextResponse.json({
      disponible: true,
      kpis,
      pdv_rows: pdv.map((r: any) => ({
        sku:             r.sku             ?? r.codigo_barras ?? '',
        upc:             r.codigo_barras   ?? '',
        descripcion:     r.descripcion     ?? '',
        categoria:       r.categoria       ?? '',
        subcategoria:    r.subcategoria    ?? '',
        inv_mano:        parseFloat(r.inv_mano)        || 0,
        tiendas:         parseInt(r.tiendas)           || 0,
        venta_dia:       parseFloat(r.venta_dia)       || 0,
        precio_unitario: parseFloat(r.precio_unitario) || 0,
        doh: r.doh !== null ? parseFloat(r.doh) : null,
      })),
      cedi_rows: ced.map((r: any) => ({
        sku:               r.sku            ?? r.codigo_barras ?? '',
        upc:               r.codigo_barras  ?? '',
        descripcion:       r.descripcion    ?? '',
        categoria:         r.categoria      ?? '',
        subcategoria:      r.subcategoria   ?? '',
        vnpk_qty:          parseInt(r.vnpk_qty)           || 1,
        inv_mano_cajas:    parseInt(r.inv_mano_cajas)     || 0,
        inv_orden_cajas:   0,
        inv_mano_unidades: parseInt(r.inv_mano_unidades)  || 0,
        inv_orden_unidades:0,
        venta_dia:         parseFloat(r.venta_dia)        || 0,
        precio_unitario:   parseFloat(r.precio_unitario)  || 0,
        doh: r.doh !== null ? parseFloat(r.doh) : null,
      })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
