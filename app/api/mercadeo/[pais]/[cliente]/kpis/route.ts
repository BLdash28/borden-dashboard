import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError, AppError } from '@/lib/api/errors'
import { requireAuth } from '@/lib/api/auth'
import { clienteDb, inventarioConfig } from '@/lib/mercadeo/cliente'

export const revalidate = 300

/**
 * GET /api/mercadeo/[pais]/[cliente]/kpis
 *
 * KPIs cliente-nivel EN UNIDADES (sin dinero): unidades YTD + comparativa vs
 * año anterior, cobertura, DOH promedio, SKUs activos, top categorías.
 *
 * Cada bloque es defensivo — si el subquery falla (tabla ausente, columna
 * cambió, etc), devuelve null en su sección en vez de tirar el endpoint entero.
 */
export async function GET(_req: NextRequest, { params }: { params: { pais: string; cliente: string } }) {
  try {
    await requireAuth()
    const pais    = params.pais.toUpperCase()
    const cliente = clienteDb(params.cliente)
    if (!cliente) throw new AppError(400, 'cliente', 'Cliente no reconocido')

    const anoActual = new Date().getFullYear()
    const anoAnt    = anoActual - 1

    // ── Volumen YTD + año anterior ─────────────────────────────────────
    let volumen: any = {
      unidades_ytd: 0, unidades_ytd_prev: 0, delta_pct: null, ultima_fecha: null,
    }
    let skusActivos = 0
    try {
      const q = await pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN ano = $3 THEN ventas_unidades END), 0)::numeric AS uds_ytd,
           COALESCE(SUM(CASE WHEN ano = $4 THEN ventas_unidades END), 0)::numeric AS uds_ytd_prev,
           COUNT(DISTINCT sku)                                                   AS skus_activos,
           MAX(MAKE_DATE(ano, mes, dia))::text                                   AS ultima_fecha
         FROM v_ventas
         WHERE pais = $1 AND cliente = $2`,
        [pais, cliente, anoActual, anoAnt],
      )
      const v = q.rows[0]
      const udsYtd     = Number(v.uds_ytd)     || 0
      const udsYtdPrev = Number(v.uds_ytd_prev) || 0
      volumen = {
        unidades_ytd:      Math.round(udsYtd),
        unidades_ytd_prev: Math.round(udsYtdPrev),
        delta_pct:         udsYtdPrev > 0 ? Number((((udsYtd - udsYtdPrev) / udsYtdPrev) * 100).toFixed(1)) : null,
        ultima_fecha:      v.ultima_fecha ?? null,
      }
      skusActivos = parseInt(v.skus_activos) || 0
    } catch (e) {
      console.error('[mercadeo/kpis] volumen fail:', e)
    }

    // ── Top 5 categorías por unidades ──────────────────────────────────
    let topCategorias: Array<{ categoria: string; unidades: number }> = []
    try {
      const q = await pool.query(
        `SELECT categoria, SUM(ventas_unidades)::numeric AS unidades
         FROM v_ventas
         WHERE pais = $1 AND cliente = $2
           AND ano = $3
           AND categoria IS NOT NULL AND categoria <> ''
         GROUP BY categoria
         ORDER BY unidades DESC
         LIMIT 5`,
        [pais, cliente, anoActual],
      )
      topCategorias = q.rows.map(c => ({
        categoria: c.categoria,
        unidades:  Math.round(Number(c.unidades) || 0),
      }))
    } catch (e) {
      console.error('[mercadeo/kpis] top_categorias fail:', e)
    }

    // ── Cobertura + DOH — depende de inventario del cliente ────────────
    let cobertura: any = {
      universo_pdvs: null, pdvs_con_stock: null,
      cobertura_pct: null, doh_promedio: null, ultima_fecha: null,
    }
    const inv = inventarioConfig(params.cliente)
    if (inv) {
      try {
        const paisFilter = inv.filtroPais ? `AND pais = '${pais.replace(/'/g,"''")}'` : ''
        const snapQ = await pool.query(
          `SELECT MAX(${inv.colFecha})::text AS f FROM ${inv.tabla} WHERE 1=1 ${paisFilter}`,
        )
        const fechaSnap = snapQ.rows[0]?.f ?? null

        if (fechaSnap) {
          const covQ = await pool.query(
            `SELECT
               COUNT(DISTINCT ${inv.colPdv})                                    AS universo,
               COUNT(DISTINCT ${inv.colPdv}) FILTER (WHERE ${inv.colInv} > 0)   AS con_stock
             FROM ${inv.tabla}
             WHERE ${inv.colFecha} = $1 ${paisFilter}`,
            [fechaSnap],
          )
          const universo = parseInt(covQ.rows[0]?.universo)  || 0
          const conStock = parseInt(covQ.rows[0]?.con_stock) || 0
          cobertura = {
            universo_pdvs:  universo,
            pdvs_con_stock: conStock,
            cobertura_pct:  universo > 0 ? Number(((conStock / universo) * 100).toFixed(1)) : null,
            doh_promedio:   null,
            ultima_fecha:   fechaSnap,
          }

          // DOH promedio (opcional — si falla no tira todo)
          try {
            const dohQ = await pool.query(
              `WITH vel AS (
                 SELECT codigo_barras,
                        SUM(ventas_unidades) / 90.0 AS venta_dia
                 FROM v_ventas
                 WHERE pais = $1 AND cliente = $2
                   AND MAKE_DATE(ano, mes, dia) >= CURRENT_DATE - INTERVAL '90 days'
                 GROUP BY codigo_barras
               ),
               inv_agg AS (
                 SELECT ${inv.colUpc} AS codigo_barras, SUM(${inv.colInv}) AS inv_total
                 FROM ${inv.tabla}
                 WHERE ${inv.colFecha} = $3 ${paisFilter}
                 GROUP BY ${inv.colUpc}
               )
               SELECT AVG(inv_total / NULLIF(vel.venta_dia, 0))::numeric AS doh_prom
               FROM inv_agg
               JOIN vel USING (codigo_barras)
               WHERE vel.venta_dia > 0`,
              [pais, cliente, fechaSnap],
            )
            cobertura.doh_promedio = dohQ.rows[0]?.doh_prom
              ? Number(Number(dohQ.rows[0].doh_prom).toFixed(1))
              : null
          } catch (e) {
            console.error('[mercadeo/kpis] DOH fail:', e)
          }
        }
      } catch (e) {
        console.error('[mercadeo/kpis] cobertura fail:', e)
      }
    }

    return NextResponse.json({
      pais, cliente,
      ano_actual: anoActual,
      volumen,
      cobertura,
      skus_activos: skusActivos,
      top_categorias: topCategorias,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
