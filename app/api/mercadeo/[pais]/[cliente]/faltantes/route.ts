import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError, AppError } from '@/lib/api/errors'
import { requireAuth } from '@/lib/api/auth'
import { clienteDb, inventarioConfig } from '@/lib/mercadeo/cliente'

export const revalidate = 300

/**
 * GET /api/mercadeo/[pais]/[cliente]/faltantes?umbral=30
 *   umbral: % de PDVs con 0 stock a partir del cual un SKU cuenta como "faltante".
 *
 * Devuelve:
 *   - faltantes[]: SKUs con inv=0 en ≥umbral% de sus PDVs
 *   - doh_alto[]: SKUs con DOH promedio > 60 días (sobrestock latente)
 *   - por_categoria[]: DOH promedio por categoría
 */
export async function GET(req: NextRequest, { params }: { params: { pais: string; cliente: string } }) {
  try {
    await requireAuth()
    const pais    = params.pais.toUpperCase()
    const cliente = clienteDb(params.cliente)
    if (!cliente) throw new AppError(400, 'cliente', 'Cliente no reconocido')

    const inv = inventarioConfig(params.cliente)
    if (!inv) {
      return NextResponse.json({
        pais, cliente, disponible: false,
        motivo: 'Este cliente no tiene tabla de inventario integrada al dashboard.',
        faltantes: [], doh_alto: [], por_categoria: [],
      })
    }

    const umbral = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get('umbral') || 30)))
    const paisFilter = inv.filtroPais ? `AND t.pais = '${pais.replace(/'/g,"''")}'` : ''

    // Última fecha snapshot
    const snapQ = await pool.query(
      `SELECT MAX(${inv.colFecha})::text AS f FROM ${inv.tabla} t WHERE 1=1 ${paisFilter}`,
    )
    const fechaSnap = snapQ.rows[0]?.f
    if (!fechaSnap) {
      return NextResponse.json({
        pais, cliente, disponible: true, fecha_snapshot: null,
        faltantes: [], doh_alto: [], por_categoria: [],
      })
    }

    // ── Faltantes: SKUs con inv=0 en ≥ umbral% de sus PDVs ─────────────
    // Se une con dim_producto por codigo_barras para descripción/categoría
    const faltantesQ = await pool.query(
      `WITH inv AS (
         SELECT
           COALESCE(NULLIF(t.${inv.colUpc}, ''), t.${inv.colSku}) AS clave,
           t.${inv.colPdv} AS punto_venta,
           t.${inv.colInv} AS inv_uds
         FROM ${inv.tabla} t
         WHERE t.${inv.colFecha} = $1 ${paisFilter}
       ),
       agg AS (
         SELECT
           clave,
           COUNT(DISTINCT punto_venta)                                       AS pdvs_total,
           COUNT(DISTINCT punto_venta) FILTER (WHERE inv_uds = 0)            AS pdvs_sin_stock
         FROM inv
         GROUP BY clave
       )
       SELECT
         a.clave AS codigo_barras,
         dp.sku,
         dp.descripcion,
         dp.categoria,
         dp.subcategoria,
         a.pdvs_total,
         a.pdvs_sin_stock,
         ROUND(a.pdvs_sin_stock::numeric / NULLIF(a.pdvs_total, 0) * 100, 1) AS pct_sin_stock
       FROM agg a
       LEFT JOIN dim_producto dp ON dp.codigo_barras = a.clave
       WHERE a.pdvs_total > 0
         AND (a.pdvs_sin_stock::numeric / a.pdvs_total * 100) >= $2
       ORDER BY pct_sin_stock DESC, a.pdvs_sin_stock DESC
       LIMIT 100`,
      [fechaSnap, umbral],
    )

    // ── DOH alto: SKUs con DOH promedio > 60 días ──────────────────────
    // DOH = inv total / (venta últimos 90d / 90). Solo con velocidad > 0.
    const dohQ = await pool.query(
      `WITH vel AS (
         SELECT codigo_barras,
                SUM(ventas_unidades)::numeric / 90.0 AS venta_dia
         FROM v_ventas
         WHERE pais = $1 AND cliente = $2
           AND MAKE_DATE(ano, mes, dia) >= CURRENT_DATE - INTERVAL '90 days'
         GROUP BY codigo_barras
       ),
       inv_agg AS (
         SELECT t.${inv.colUpc} AS codigo_barras,
                SUM(t.${inv.colInv})::numeric AS inv_total,
                COUNT(DISTINCT t.${inv.colPdv}) AS pdvs
         FROM ${inv.tabla} t
         WHERE t.${inv.colFecha} = $3 ${paisFilter}
         GROUP BY t.${inv.colUpc}
       )
       SELECT
         i.codigo_barras,
         dp.sku,
         dp.descripcion,
         dp.categoria,
         i.inv_total,
         i.pdvs,
         ROUND((i.inv_total / vel.venta_dia)::numeric, 1) AS doh
       FROM inv_agg i
       JOIN vel USING (codigo_barras)
       LEFT JOIN dim_producto dp ON dp.codigo_barras = i.codigo_barras
       WHERE vel.venta_dia > 0
         AND i.inv_total / vel.venta_dia > 60
       ORDER BY doh DESC NULLS LAST
       LIMIT 100`,
      [pais, cliente, fechaSnap],
    )

    // ── DOH promedio por categoría ─────────────────────────────────────
    const porCatQ = await pool.query(
      `WITH vel AS (
         SELECT codigo_barras,
                SUM(ventas_unidades)::numeric / 90.0 AS venta_dia,
                MAX(categoria) AS categoria
         FROM v_ventas
         WHERE pais = $1 AND cliente = $2
           AND MAKE_DATE(ano, mes, dia) >= CURRENT_DATE - INTERVAL '90 days'
           AND categoria IS NOT NULL AND categoria <> ''
         GROUP BY codigo_barras
       ),
       inv_agg AS (
         SELECT t.${inv.colUpc} AS codigo_barras,
                SUM(t.${inv.colInv})::numeric AS inv_total
         FROM ${inv.tabla} t
         WHERE t.${inv.colFecha} = $3 ${paisFilter}
         GROUP BY t.${inv.colUpc}
       )
       SELECT vel.categoria,
              COUNT(*)                                                     AS skus,
              ROUND(AVG(i.inv_total / NULLIF(vel.venta_dia, 0))::numeric,1) AS doh_prom
       FROM vel
       JOIN inv_agg i USING (codigo_barras)
       WHERE vel.venta_dia > 0
       GROUP BY vel.categoria
       ORDER BY doh_prom DESC NULLS LAST`,
      [pais, cliente, fechaSnap],
    )

    return NextResponse.json({
      pais, cliente, disponible: true,
      fecha_snapshot: fechaSnap,
      umbral,
      faltantes: faltantesQ.rows.map(r => ({
        codigo_barras: r.codigo_barras,
        sku:           r.sku,
        descripcion:   r.descripcion,
        categoria:     r.categoria,
        subcategoria:  r.subcategoria,
        pdvs_total:    parseInt(r.pdvs_total),
        pdvs_sin_stock: parseInt(r.pdvs_sin_stock),
        pct_sin_stock: r.pct_sin_stock !== null ? Number(r.pct_sin_stock) : null,
      })),
      doh_alto: dohQ.rows.map(r => ({
        codigo_barras: r.codigo_barras,
        sku:           r.sku,
        descripcion:   r.descripcion,
        categoria:     r.categoria,
        inv_total:     Math.round(Number(r.inv_total)),
        pdvs:          parseInt(r.pdvs),
        doh:           r.doh !== null ? Number(r.doh) : null,
      })),
      por_categoria: porCatQ.rows.map(r => ({
        categoria: r.categoria,
        skus:      parseInt(r.skus),
        doh_prom:  r.doh_prom !== null ? Number(r.doh_prom) : null,
      })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
