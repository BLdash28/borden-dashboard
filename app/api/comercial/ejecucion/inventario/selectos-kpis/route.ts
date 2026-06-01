import { NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

const IS_PDV  = `NOT (tienda ILIKE '1001%' OR tienda ILIKE '1017%')`
const IS_CEDI = `(tienda ILIKE '1001%' OR tienda ILIKE '1017%')`

export async function GET() {
  try {
    const { rows } = await pool.query(`
      WITH
      ultima AS (
        SELECT MAX(fecha) AS fecha FROM fact_selectos_inventario
      ),

      -- ── PDV inventory at latest date ─────────────────────────────────────────
      inv_pdv AS (
        SELECT
          COUNT(DISTINCT fsi.tienda)                 AS n_tiendas,
          COUNT(DISTINCT fsi.codigo_barra)            AS n_skus,
          COALESCE(SUM(fsi.inventario_valor),    0)  AS valor,
          COALESCE(SUM(fsi.inventario_unidades), 0)  AS unidades
        FROM fact_selectos_inventario fsi
        JOIN ultima u ON fsi.fecha = u.fecha
        WHERE ${IS_PDV}
      ),

      -- ── CEDI inventory at latest date (tiendas 1001 & 1017) ─────────────────
      inv_cedi AS (
        SELECT
          COUNT(DISTINCT fsi.tienda)                 AS n_cedi,
          COUNT(DISTINCT fsi.codigo_barra)            AS n_skus_cedi,
          COALESCE(SUM(fsi.inventario_valor),    0)  AS valor,
          COALESCE(SUM(fsi.inventario_unidades), 0)  AS unidades
        FROM fact_selectos_inventario fsi
        JOIN ultima u ON fsi.fecha = u.fecha
        WHERE ${IS_CEDI}
      ),

      -- ── Latest PDV inventory per SKU×tienda ──────────────────────────────────
      inv_latest AS (
        SELECT fsi.codigo_barra, fsi.tienda, fsi.inventario_unidades
        FROM fact_selectos_inventario fsi
        JOIN ultima u ON fsi.fecha = u.fecha
        WHERE ${IS_PDV}
      ),

      -- ── VPD: sum of sales in current month / days in month ───────────────────
      vpd AS (
        SELECT
          fsi.codigo_barra,
          fsi.tienda,
          SUM(fsi.ventas_unidades)::float /
            EXTRACT(DAY FROM (
              DATE_TRUNC('month', (SELECT fecha FROM ultima))
              + INTERVAL '1 month' - INTERVAL '1 day'
            ))::float AS vpd_dia
        FROM fact_selectos_inventario fsi
        WHERE fsi.fecha >= DATE_TRUNC('month', (SELECT fecha FROM ultima))
          AND ${IS_PDV}
        GROUP BY fsi.codigo_barra, fsi.tienda
      ),

      -- ── DOH criticality (PDV only) ────────────────────────────────────────────
      criticidad AS (
        SELECT
          COUNT(*) FILTER (
            WHERE COALESCE(v.vpd_dia, 0) > 0
              AND il.inventario_unidades / v.vpd_dia < 7
          ) AS critico_sala,
          COUNT(*) FILTER (
            WHERE COALESCE(v.vpd_dia, 0) > 0
              AND il.inventario_unidades / v.vpd_dia > 60
          ) AS ofertar,
          COUNT(*) FILTER (
            WHERE COALESCE(v.vpd_dia, 0) > 0
              AND il.inventario_unidades / v.vpd_dia BETWEEN 7 AND 14
          ) AS alerta_sala
        FROM inv_latest il
        LEFT JOIN vpd v ON il.codigo_barra = v.codigo_barra AND il.tienda = v.tienda
      ),

      -- ── Quiebre CEDI: PDV SKUs with no CEDI stock ───────────────────────────
      quiebre_cedi AS (
        SELECT COUNT(DISTINCT pdv_skus.codigo_barra) AS cnt
        FROM (
          SELECT DISTINCT fsi.codigo_barra
          FROM fact_selectos_inventario fsi
          JOIN ultima u ON fsi.fecha = u.fecha
          WHERE ${IS_PDV} AND fsi.inventario_unidades > 0
        ) pdv_skus
        WHERE NOT EXISTS (
          SELECT 1
          FROM fact_selectos_inventario fsi_c
          JOIN ultima u ON fsi_c.fecha = u.fecha
          WHERE ${IS_CEDI}
            AND fsi_c.codigo_barra = pdv_skus.codigo_barra
            AND fsi_c.inventario_unidades > 0
        )
      ),

      -- ── Baseline: avg monthly sellout from months >= $5K ────────────────────
      baseline AS (
        SELECT
          ROUND(AVG(valor_mes)::numeric, 2) AS avg_valor_mes,
          ROUND(AVG(uni_mes)::numeric, 0)   AS avg_uni_mes,
          STRING_AGG(mes_label, '+' ORDER BY mes_label) AS meses_ref
        FROM (
          SELECT
            TO_CHAR(TO_DATE(EXTRACT(MONTH FROM fecha)::text, 'MM'), 'Mon') AS mes_label,
            SUM(ventas_valor)    AS valor_mes,
            SUM(ventas_unidades) AS uni_mes
          FROM fact_ventas_selectos
          WHERE fecha >= '2025-10-01'
          GROUP BY EXTRACT(MONTH FROM fecha),
                   TO_CHAR(TO_DATE(EXTRACT(MONTH FROM fecha)::text, 'MM'), 'Mon')
          HAVING SUM(ventas_valor) >= 5000
        ) sub
      )

      SELECT
        (SELECT n_tiendas   FROM inv_pdv)   AS pdv_tiendas,
        (SELECT n_skus      FROM inv_pdv)   AS pdv_skus,
        (SELECT valor       FROM inv_pdv)   AS pdv_valor,
        (SELECT unidades    FROM inv_pdv)   AS pdv_unidades,
        (SELECT fecha       FROM ultima)    AS ultima_fecha,
        (SELECT n_cedi      FROM inv_cedi)  AS cedi_tiendas,
        (SELECT n_skus_cedi FROM inv_cedi)  AS cedi_skus,
        (SELECT valor       FROM inv_cedi)  AS cedi_valor,
        (SELECT unidades    FROM inv_cedi)  AS cedi_unidades,
        (SELECT critico_sala FROM criticidad) AS critico_sala,
        (SELECT alerta_sala  FROM criticidad) AS alerta_sala,
        (SELECT ofertar      FROM criticidad) AS skus_ofertar,
        (SELECT cnt          FROM quiebre_cedi) AS quiebre_cedi,
        (SELECT avg_valor_mes FROM baseline) AS baseline_valor_mes,
        (SELECT avg_uni_mes   FROM baseline) AS baseline_uni_mes,
        (SELECT meses_ref     FROM baseline) AS baseline_meses
    `)

    const r = rows[0]
    const pdvValor  = parseFloat(r.pdv_valor)  || 0
    const cediValor = parseFloat(r.cedi_valor) || 0

    return NextResponse.json({
      pdv: {
        tiendas:      parseInt(r.pdv_tiendas)       || 0,
        skus:         parseInt(r.pdv_skus)           || 0,
        valor:        pdvValor,
        unidades:     parseFloat(r.pdv_unidades)     || 0,
        ultima_fecha: r.ultima_fecha ?? null,
      },
      cedi: {
        tiendas:  parseInt(r.cedi_tiendas)    || 0,
        skus:     parseInt(r.cedi_skus)       || 0,
        valor:    cediValor,
        unidades: parseFloat(r.cedi_unidades) || 0,
      },
      total: {
        valor:    pdvValor + cediValor,
        unidades: (parseFloat(r.pdv_unidades) || 0) + (parseFloat(r.cedi_unidades) || 0),
      },
      critico_sala:  parseInt(r.critico_sala)  || 0,
      alerta_sala:   parseInt(r.alerta_sala)   || 0,
      skus_ofertar:  parseInt(r.skus_ofertar)  || 0,
      quiebre_cedi:  parseInt(r.quiebre_cedi)  || 0,
      baseline: {
        valor_mes: parseFloat(r.baseline_valor_mes) || 0,
        uni_mes:   parseInt(r.baseline_uni_mes)     || 0,
        meses_ref: r.baseline_meses ?? '',
      },
    })
  } catch (err) {
    return handleApiError(err)
  }
}
