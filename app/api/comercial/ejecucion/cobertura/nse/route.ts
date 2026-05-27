import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

const NSE_VALUES = `
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
`

export async function GET(req: NextRequest) {
  try {
    const sp   = req.nextUrl.searchParams
    const cats = sp.get('categoria') ? sp.get('categoria')!.split(',').filter(Boolean) : []
    const ano  = parseInt(sp.get('ano') || '2026')

    const subcats      = sp.get('subcategoria') ? sp.get('subcategoria')!.split(',').filter(Boolean) : []
    const catFilter    = cats.length    ? `AND categoria    IN (${cats.map(c => `'${c.replace(/'/g, "''")}'`).join(',')})` : ''
    const subcatFilter = subcats.length ? `AND subcategoria IN (${subcats.map(s => `'${s.replace(/'/g, "''")}'`).join(',')})` : ''
    const histParts    = [cats.length && `categoria IN (${cats.map(c => `'${c.replace(/'/g,"''")}'`).join(',')})`,
                          subcats.length && `subcategoria IN (${subcats.map(s => `'${s.replace(/'/g,"''")}'`).join(',')})`].filter(Boolean)
    const catWhere     = histParts.length ? `WHERE ${histParts.join(' AND ')}` : ''

    // NSE group totals + per-SKU/NSE coverage in one query
    const [groupRows, skuNseRows] = await Promise.all([
      pool.query(`
        WITH nse_map(codigo, nse) AS (VALUES ${NSE_VALUES}),
        store_nse AS (
          SELECT DISTINCT fvs.nombre_sucursal, nm.nse
          FROM fact_ventas_selectos fvs
          JOIN nse_map nm
            ON nm.codigo = LPAD(REGEXP_REPLACE(fvs.nombre_sucursal, '^(\\d+).*$', '\\1'), 4, '0')
          WHERE EXTRACT(YEAR FROM fvs.fecha) = ${ano}
        )
        SELECT nse, COUNT(DISTINCT nombre_sucursal) AS n_tiendas
        FROM store_nse GROUP BY nse ORDER BY nse
      `),

      pool.query(`
        WITH nse_map(codigo, nse) AS (VALUES ${NSE_VALUES}),
        store_nse AS (
          SELECT DISTINCT fvs.nombre_sucursal, nm.nse
          FROM fact_ventas_selectos fvs
          JOIN nse_map nm
            ON nm.codigo = LPAD(REGEXP_REPLACE(fvs.nombre_sucursal, '^(\\d+).*$', '\\1'), 4, '0')
          WHERE EXTRACT(YEAR FROM fvs.fecha) = ${ano}
        ),
        nse_totals AS (
          SELECT nse, COUNT(DISTINCT nombre_sucursal) AS n_total FROM store_nse GROUP BY nse
        ),
        sku_val AS (
          SELECT codigo_barras,
            SUM(ventas_valor) AS total_val,
            SUM(SUM(ventas_valor)) OVER () AS gran_total
          FROM fact_ventas_selectos
          WHERE EXTRACT(YEAR FROM fecha) = ${ano} ${catFilter} ${subcatFilter}
          GROUP BY codigo_barras
        ),
        sku_nse_current AS (
          SELECT fvs.codigo_barras AS sku, sn.nse,
            COUNT(DISTINCT fvs.nombre_sucursal) AS pdvs_actual,
            nt.n_total AS pdvs_total
          FROM fact_ventas_selectos fvs
          JOIN store_nse sn ON sn.nombre_sucursal = fvs.nombre_sucursal
          JOIN nse_totals nt ON nt.nse = sn.nse
          WHERE EXTRACT(YEAR FROM fvs.fecha) = ${ano} ${catFilter} ${subcatFilter}
          GROUP BY fvs.codigo_barras, sn.nse, nt.n_total
        ),
        sku_nse_hist AS (
          SELECT fvs.codigo_barras AS sku, sn.nse,
            MAX(DATE_TRUNC('month', fvs.fecha)) AS _,
            COUNT(DISTINCT fvs.nombre_sucursal) AS n_month
          FROM fact_ventas_selectos fvs
          JOIN store_nse sn ON sn.nombre_sucursal = fvs.nombre_sucursal
          ${catWhere}
          GROUP BY fvs.codigo_barras, sn.nse, DATE_TRUNC('month', fvs.fecha)
        ),
        sku_nse_max AS (
          SELECT sku, nse, MAX(n_month) AS pdvs_max FROM sku_nse_hist GROUP BY sku, nse
        )
        SELECT
          c.sku,
          c.nse,
          MAX(fvs.descripcion)                                              AS descripcion,
          MAX(fvs.categoria)                                                AS categoria,
          c.pdvs_actual,
          c.pdvs_total,
          COALESCE(m.pdvs_max, c.pdvs_actual)                              AS pdvs_max,
          ROUND(c.pdvs_actual::numeric / NULLIF(c.pdvs_total,0) * 100, 1) AS cob_actual,
          ROUND(COALESCE(m.pdvs_max, c.pdvs_actual)::numeric / NULLIF(c.pdvs_total,0) * 100, 1) AS cob_max,
          ROUND(sv.total_val / NULLIF(sv.gran_total,0) * 100, 1)          AS pct_venta
        FROM sku_nse_current c
        LEFT JOIN sku_nse_max m ON m.sku = c.sku AND m.nse = c.nse
        JOIN fact_ventas_selectos fvs
          ON fvs.codigo_barras = c.sku AND EXTRACT(YEAR FROM fvs.fecha) = ${ano}
        LEFT JOIN sku_val sv ON sv.codigo_barras = c.sku
        GROUP BY c.sku, c.nse, c.pdvs_actual, c.pdvs_total, m.pdvs_max, sv.total_val, sv.gran_total
        ORDER BY sv.total_val DESC NULLS LAST, c.sku, c.nse
      `),
    ])

    // Compute per-NSE global averages (for bar chart)
    const nseGroups: Record<string, { nse: string; n_tiendas: number; cob_actual_avg: number; cob_max_avg: number }> = {}
    for (const g of groupRows.rows) {
      nseGroups[g.nse] = { nse: g.nse, n_tiendas: parseInt(g.n_tiendas), cob_actual_avg: 0, cob_max_avg: 0 }
    }
    const nseAcc: Record<string, { as_: number; ms: number; cnt: number }> = {}
    for (const r of skuNseRows.rows) {
      if (!nseAcc[r.nse]) nseAcc[r.nse] = { as_: 0, ms: 0, cnt: 0 }
      nseAcc[r.nse].as_  += parseFloat(r.cob_actual)
      nseAcc[r.nse].ms   += parseFloat(r.cob_max)
      nseAcc[r.nse].cnt  += 1
    }
    for (const [nse, acc] of Object.entries(nseAcc)) {
      if (nseGroups[nse]) {
        nseGroups[nse].cob_actual_avg = parseFloat((acc.as_ / acc.cnt).toFixed(1))
        nseGroups[nse].cob_max_avg    = parseFloat((acc.ms  / acc.cnt).toFixed(1))
      }
    }

    // Build SKU map for heatmap
    const skuMap: Record<string, any> = {}
    for (const r of skuNseRows.rows) {
      if (!skuMap[r.sku]) {
        skuMap[r.sku] = {
          sku: r.sku,
          descripcion: r.descripcion,
          categoria: r.categoria,
          pct_venta: parseFloat(r.pct_venta ?? '0'),
          nse: {},
        }
      }
      skuMap[r.sku].nse[r.nse] = {
        cob_actual:  parseFloat(r.cob_actual),
        cob_max:     parseFloat(r.cob_max),
        pdvs_actual: parseInt(r.pdvs_actual),
        pdvs_total:  parseInt(r.pdvs_total),
      }
    }

    const skus   = Object.values(skuMap).sort((a: any, b: any) => b.pct_venta - a.pct_venta)
    const groups = Object.values(nseGroups).sort((a, b) => a.nse.localeCompare(b.nse))

    return NextResponse.json({ groups, skus })
  } catch (err) {
    return handleApiError(err)
  }
}
