import { NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const IS_PDV = `NOT (fsi.tienda ILIKE '1001%' OR fsi.tienda ILIKE '1017%')`

const DOH_CTES = `
  ultima AS (SELECT MAX(fecha) AS fecha FROM fact_selectos_inventario),
  inv_latest AS (
    SELECT fsi.codigo_barra, SUM(fsi.inventario_unidades) AS inv_uni
    FROM fact_selectos_inventario fsi
    JOIN ultima u ON fsi.fecha = u.fecha
    WHERE ${IS_PDV}
    GROUP BY fsi.codigo_barra
  ),
  vpd_mes AS (
    SELECT
      fsi.codigo_barra,
      SUM(fsi.ventas_unidades)::float /
        EXTRACT(DAY FROM (
          DATE_TRUNC('month', (SELECT fecha FROM ultima))
          + INTERVAL '1 month' - INTERVAL '1 day'
        ))::float AS vpd_dia
    FROM fact_selectos_inventario fsi
    WHERE fsi.fecha >= DATE_TRUNC('month', (SELECT fecha FROM ultima))
      AND ${IS_PDV}
    GROUP BY fsi.codigo_barra
  ),
  nombres AS (
    SELECT DISTINCT ON (codigo_barras) codigo_barras, descripcion
    FROM fact_ventas_selectos
    ORDER BY codigo_barras, fecha DESC
  ),
  doh_sku AS (
    SELECT
      i.codigo_barra,
      COALESCE(n.descripcion, i.codigo_barra) AS descripcion,
      i.inv_uni,
      v.vpd_dia,
      CASE WHEN COALESCE(v.vpd_dia, 0) > 0 THEN i.inv_uni / v.vpd_dia ELSE NULL END AS doh
    FROM inv_latest i
    LEFT JOIN vpd_mes v  ON v.codigo_barra = i.codigo_barra
    LEFT JOIN nombres n  ON n.codigo_barras = i.codigo_barra
  )
`

const MES_NAME = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export async function GET() {
  try {
    const [monthlyR, dohR, innoR, nseR, paretoR] = await Promise.all([

      // Monthly sellout 2026 + baseline (uses fact_ventas_selectos)
      pool.query(`
        WITH monthly_2026 AS (
          SELECT
            EXTRACT(MONTH FROM fecha)::int    AS mes,
            SUM(ventas_valor)::float          AS ventas_valor,
            SUM(ventas_unidades)::float       AS ventas_unidades
          FROM fact_ventas_selectos
          WHERE EXTRACT(YEAR FROM fecha) = 2026
          GROUP BY EXTRACT(MONTH FROM fecha)::int
        ),
        baseline AS (
          SELECT AVG(m_val) AS avg_val, AVG(m_uni) AS avg_uni
          FROM (
            SELECT
              SUM(ventas_valor)::float    AS m_val,
              SUM(ventas_unidades)::float AS m_uni
            FROM fact_ventas_selectos
            WHERE (
              (EXTRACT(YEAR FROM fecha) = 2025 AND EXTRACT(MONTH FROM fecha) >= 10)
              OR EXTRACT(YEAR FROM fecha) = 2026
            )
            GROUP BY EXTRACT(YEAR FROM fecha)::int, EXTRACT(MONTH FROM fecha)::int
            HAVING SUM(ventas_valor) >= 5000
          ) healthy
        )
        SELECT
          m.mes,
          m.ventas_valor,
          m.ventas_unidades,
          b.avg_val  AS baseline_val,
          b.avg_uni  AS baseline_uni,
          (m.ventas_valor < b.avg_val * 0.3) AS es_oos
        FROM monthly_2026 m, baseline b
        ORDER BY m.mes
      `),

      // DOH — críticos (< 7) y excedentes (> 60)
      pool.query(`
        WITH ${DOH_CTES}
        SELECT
          codigo_barra, descripcion, inv_uni, vpd_dia, doh,
          CASE
            WHEN doh < 7  THEN 'critico'
            WHEN doh > 60 THEN 'excedente'
            ELSE 'normal'
          END AS estado
        FROM doh_sku
        WHERE doh IS NOT NULL AND (doh < 7 OR doh > 60)
        ORDER BY
          CASE WHEN doh < 7 THEN doh ELSE 9999 END ASC,
          CASE WHEN doh > 60 THEN doh ELSE 0 END DESC
      `),

      // Innovaciones: SKUs en 2026 sin historial en 2025
      pool.query(`
        SELECT
          v26.codigo_barras,
          MAX(v26.descripcion)    AS descripcion,
          MAX(v26.categoria)      AS categoria,
          SUM(v26.ventas_valor)   AS ventas_val,
          SUM(v26.ventas_unidades) AS ventas_uni,
          MIN(v26.fecha)          AS primera_venta
        FROM fact_ventas_selectos v26
        WHERE EXTRACT(YEAR FROM v26.fecha) = 2026
          AND NOT EXISTS (
            SELECT 1 FROM fact_ventas_selectos v25
            WHERE v25.codigo_barras = v26.codigo_barras
              AND EXTRACT(YEAR FROM v25.fecha) = 2025
          )
        GROUP BY v26.codigo_barras
        ORDER BY primera_venta ASC
      `),

      // NSE: tiendas con mapeo real A/C/D
      pool.query(`
        WITH
        ultima AS (SELECT MAX(fecha) AS fecha FROM fact_selectos_inventario),
        nse_map (codigo, nse) AS (
          VALUES
          ('0001','A'),('0003','C'),('0004','A'),('0006','C'),('0007','C'),
          ('0008','C'),('0009','A'),('0010','C'),('0011','C'),('0014','D'),
          ('0015','C'),('0016','C'),('0017','D'),('0019','A'),('0021','A'),
          ('0022','C'),('0023','C'),('0024','C'),('0026','A'),('0027','C'),
          ('0028','C'),('0029','C'),('0030','A'),('0031','C'),('0032','C'),
          ('0033','D'),('0034','A'),('0036','C'),('0037','C'),('0038','C'),
          ('0039','A'),('0040','C'),('0042','A'),('0043','A'),('0044','D'),
          ('0045','C'),('0046','D'),('0047','C'),('0048','C'),('0049','C'),
          ('0050','A'),('0052','C'),('0053','A'),('0055','A'),('0057','D'),
          ('0058','D'),('0060','D'),('0061','C'),('0062','C'),('0064','D'),
          ('0065','D'),('0066','C'),('0067','C'),('0068','C'),('0069','A'),
          ('0203','C'),('0205','A'),('0206','D'),('0207','C'),('0208','C'),
          ('0209','A'),('0210','C'),('0211','D'),('0213','C'),('0214','D'),
          ('0215','C'),('0216','C'),('0217','C'),('0218','C'),('0219','D'),
          ('0220','D'),('0221','C'),('0222','C'),('0225','A'),('0227','D'),
          ('0228','A'),('0229','C'),('0230','C'),('0232','A'),('0233','D'),
          ('0235','C'),('0236','A'),('0237','A'),('0238','A'),('0239','C'),
          ('0240','C'),('0241','A'),('0242','C'),('0243','C'),('0244','C'),
          ('0245','C'),('0246','D'),('0247','C'),('0248','A'),('0249','C'),
          ('0250','C'),('0251','C'),('0252','C'),('0253','A'),('0254','C'),
          ('0255','D'),('0256','C'),('0257','C'),('0258','C'),('0259','A'),
          ('0260','C'),('0261','C'),('0262','C')
        ),
        tienda_vals AS (
          SELECT
            LPAD(REGEXP_REPLACE(fsi.tienda, '^(\\d+).*$', '\\1'), 4, '0') AS codigo,
            COALESCE(n.nse, '?')         AS nse,
            SUM(fsi.inventario_valor)    AS valor,
            SUM(fsi.inventario_unidades) AS unidades
          FROM fact_selectos_inventario fsi
          JOIN ultima u ON fsi.fecha = u.fecha
          LEFT JOIN nse_map n ON n.codigo = LPAD(REGEXP_REPLACE(fsi.tienda, '^(\\d+).*$', '\\1'), 4, '0')
          WHERE NOT (fsi.tienda ILIKE '1001%' OR fsi.tienda ILIKE '1017%')
          GROUP BY LPAD(REGEXP_REPLACE(fsi.tienda, '^(\\d+).*$', '\\1'), 4, '0'), COALESCE(n.nse, '?')
        )
        SELECT
          nse,
          COUNT(*)                        AS n_tiendas,
          SUM(valor)                      AS total_valor,
          SUM(unidades)                   AS total_unidades,
          SUM(SUM(valor)) OVER ()         AS gran_total
        FROM tienda_vals
        GROUP BY nse
        ORDER BY nse
      `),

      // Pareto 2026
      pool.query(`
        WITH ranked AS (
          SELECT
            codigo_barras,
            SUM(ventas_valor) AS valor,
            SUM(SUM(ventas_valor)) OVER ()                                                          AS total_val,
            SUM(SUM(ventas_valor)) OVER (ORDER BY SUM(ventas_valor) DESC ROWS UNBOUNDED PRECEDING)  AS acum_val
          FROM fact_ventas_selectos
          WHERE EXTRACT(YEAR FROM fecha) = 2026
          GROUP BY codigo_barras
        )
        SELECT
          COALESCE(SUM(1) FILTER (WHERE acum_val::float / NULLIF(total_val, 0) <= 0.80),  0) AS clase_a,
          COALESCE(SUM(1) FILTER (WHERE acum_val::float / NULLIF(total_val, 0) > 0.80
                                    AND acum_val::float / NULLIF(total_val, 0) <= 0.95), 0) AS clase_b,
          COALESCE(SUM(1) FILTER (WHERE acum_val::float / NULLIF(total_val, 0) > 0.95),  0) AS clase_c
        FROM ranked
      `),
    ])

    // NSE processing (real mapping A / C / D)
    const nseRows  = nseR.rows
    const granTotal = parseFloat(nseRows[0]?.gran_total ?? '0') || 1
    const byNse = (code: string) => nseRows.find((r: any) => r.nse === code)
    const nseA  = byNse('A')
    const nseC  = byNse('C')
    const nseD  = byNse('D')

    const nA   = parseInt(nseA?.n_tiendas ?? '0') || 0
    const nC   = parseInt(nseC?.n_tiendas ?? '0') || 0
    const nD   = parseInt(nseD?.n_tiendas ?? '0') || 0
    const pctA = parseFloat(nseA?.total_valor ?? '0') / granTotal * 100
    const pctC = parseFloat(nseC?.total_valor ?? '0') / granTotal * 100
    const pctD = parseFloat(nseD?.total_valor ?? '0') / granTotal * 100

    const nse_insight =
      `NSE A (${nA} tiendas) concentra el ${pctA.toFixed(0)}% del valor en inventario — ` +
      `mayor riesgo de sobrestock si la rotación cae. ` +
      `NSE C/D (${nC + nD} tiendas) representa el ${(pctC + pctD).toFixed(0)}% del valor: ` +
      `requiere mayor monitoreo de quiebres por su baja cobertura promedio.`

    const monthly     = monthlyR.rows
    const baselineVal = parseFloat(monthly[0]?.baseline_val ?? '0') || 0
    const baselineUni = parseFloat(monthly[0]?.baseline_uni ?? '0') || 0
    const ultimo      = monthly[monthly.length - 1]
    const oos         = monthly.filter(m => m.es_oos)

    const criticos   = dohR.rows.filter(r => r.estado === 'critico')
    const excedentes = dohR.rows.filter(r => r.estado === 'excedente')

    return NextResponse.json({
      baseline_val: baselineVal,
      baseline_uni: baselineUni,

      monthly: monthly.map(m => ({
        mes:         parseInt(m.mes),
        mes_nombre:  MES_NAME[parseInt(m.mes)] ?? '',
        ventas_val:  parseFloat(m.ventas_valor),
        ventas_uni:  parseFloat(m.ventas_unidades),
        es_oos:      m.es_oos,
      })),

      oos_count:       oos.length,
      oos_meses:       oos.map(m => MES_NAME[parseInt(m.mes)] ?? '').join('-'),
      oos_perdida_val: oos.reduce((s, m) => s + Math.max(0, baselineVal - parseFloat(m.ventas_valor)), 0),
      oos_perdida_uni: oos.reduce((s, m) => s + Math.max(0, baselineUni - parseFloat(m.ventas_unidades)), 0),

      ultimo_mes: ultimo ? {
        mes:        parseInt(ultimo.mes),
        mes_nombre: MES_NAME[parseInt(ultimo.mes)] ?? '',
        ventas_val: parseFloat(ultimo.ventas_valor),
        ventas_uni: parseFloat(ultimo.ventas_unidades),
      } : null,

      criticos: criticos.map(r => ({
        codigo_barra: r.codigo_barra,
        descripcion:  r.descripcion,
        inv_uni:      parseFloat(r.inv_uni),
        vpd_dia:      parseFloat(r.vpd_dia),
        doh:          parseFloat(r.doh),
      })),

      excedentes: excedentes.map(r => ({
        codigo_barra: r.codigo_barra,
        descripcion:  r.descripcion,
        inv_uni:      parseFloat(r.inv_uni),
        vpd_dia:      parseFloat(r.vpd_dia),
        doh:          parseFloat(r.doh),
      })),

      innovaciones: innoR.rows.map(r => ({
        codigo_barras: r.codigo_barras,
        descripcion:   r.descripcion,
        categoria:     r.categoria ?? '',
        ventas_val:    parseFloat(r.ventas_val),
        ventas_uni:    parseInt(r.ventas_uni ?? '0'),
        primera_venta: r.primera_venta,
      })),

      pareto: {
        a: parseInt(paretoR.rows[0]?.clase_a ?? '0') || 0,
        b: parseInt(paretoR.rows[0]?.clase_b ?? '0') || 0,
        c: parseInt(paretoR.rows[0]?.clase_c ?? '0') || 0,
      },
      nse: {
        insight: nse_insight,
        grupos: [
          { nse: 'A',   n_tiendas: nA, pct_valor: pctA, valor: parseFloat(nseA?.total_valor ?? '0') },
          { nse: 'C',   n_tiendas: nC, pct_valor: pctC, valor: parseFloat(nseC?.total_valor ?? '0') },
          { nse: 'D',   n_tiendas: nD, pct_valor: pctD, valor: parseFloat(nseD?.total_valor ?? '0') },
        ].filter(g => g.n_tiendas > 0),
      },
    })
  } catch (err) {
    return handleApiError(err)
  }
}
