import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 0

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
    const sp     = req.nextUrl.searchParams
    const salud  = sp.get('salud')  || ''
    const nse    = sp.get('nse')    || ''
    const tienda = sp.get('tienda') || ''
    const prod   = sp.get('prod')   || ''

    const conditions: string[] = []
    const params: (string | number)[] = []
    let pIdx = 1

    if (salud)  { conditions.push(`salud = $${pIdx++}`);              params.push(salud) }
    if (nse)    { conditions.push(`nse = $${pIdx++}`);                params.push(nse) }
    if (tienda) { conditions.push(`tienda ILIKE $${pIdx++}`);         params.push(`%${tienda}%`) }
    if (prod)   { conditions.push(`descripcion ILIKE $${pIdx++}`);    params.push(`%${prod}%`) }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const { rows } = await pool.query(`
      WITH
      ultima    AS (SELECT MAX(fecha) AS fecha FROM fact_selectos_inventario),
      nse_map(codigo, nse) AS (VALUES ${NSE_VALUES}),
      inv_pdv   AS (
        SELECT fsi.codigo_barra, fsi.tienda, fsi.inventario_unidades, fsi.inventario_valor
        FROM fact_selectos_inventario fsi
        JOIN ultima u ON fsi.fecha = u.fecha
        WHERE NOT (fsi.tienda ILIKE '1001%' OR fsi.tienda ILIKE '1017%')
          AND fsi.inventario_unidades > 0
      ),
      vpd       AS (
        SELECT fsi.codigo_barra, fsi.tienda,
          SUM(fsi.ventas_unidades)::float /
            GREATEST(EXTRACT(DAY FROM (
              DATE_TRUNC('month', (SELECT fecha FROM ultima))
              + INTERVAL '1 month' - INTERVAL '1 day'
            ))::float, 1) AS vpd_dia
        FROM fact_selectos_inventario fsi
        WHERE fsi.fecha >= DATE_TRUNC('month', (SELECT fecha FROM ultima))
          AND NOT (fsi.tienda ILIKE '1001%' OR fsi.tienda ILIKE '1017%')
        GROUP BY fsi.codigo_barra, fsi.tienda
      ),
      cedi_stock AS (
        SELECT DISTINCT fsi.codigo_barra
        FROM fact_selectos_inventario fsi
        JOIN ultima u ON fsi.fecha = u.fecha
        WHERE (fsi.tienda ILIKE '1001%' OR fsi.tienda ILIKE '1017%')
          AND fsi.inventario_unidades > 0
      ),
      nombres   AS (
        SELECT DISTINCT ON (codigo_barras) codigo_barras, descripcion, categoria
        FROM fact_ventas_selectos ORDER BY codigo_barras, fecha DESC
      ),
      result    AS (
        SELECT
          p.codigo_barra                                              AS sku,
          COALESCE(n.descripcion, p.codigo_barra)                    AS descripcion,
          COALESCE(n.categoria, '')                                   AS categoria,
          p.tienda,
          COALESCE(nm.nse, '?')                                      AS nse,
          p.inventario_unidades                                       AS inv_uni,
          ROUND(p.inventario_valor::numeric, 2)                      AS inv_valor,
          ROUND(COALESCE(v.vpd_dia, 0)::numeric, 2)                  AS vpd_dia,
          CASE WHEN COALESCE(v.vpd_dia, 0) > 0
            THEN ROUND(p.inventario_unidades::numeric / v.vpd_dia::numeric, 0)
            ELSE NULL END                                             AS doh,
          (cs.codigo_barra IS NOT NULL)                              AS cedi_disp,
          CASE
            WHEN COALESCE(v.vpd_dia, 0) > 0 AND p.inventario_unidades / v.vpd_dia < 7   THEN 'CRÍTICO'
            WHEN COALESCE(v.vpd_dia, 0) > 0 AND p.inventario_unidades / v.vpd_dia < 14  THEN 'ATENCIÓN'
            WHEN COALESCE(v.vpd_dia, 0) > 0 AND p.inventario_unidades / v.vpd_dia > 120 THEN 'SOBRESTOCK'
            WHEN COALESCE(v.vpd_dia, 0) > 0 AND p.inventario_unidades / v.vpd_dia > 60  THEN 'COB ALTA'
            WHEN COALESCE(v.vpd_dia, 0) = 0                                              THEN 'SIN VPD'
            ELSE 'OK'
          END AS salud
        FROM inv_pdv p
        LEFT JOIN vpd v        ON v.codigo_barra = p.codigo_barra AND v.tienda = p.tienda
        LEFT JOIN cedi_stock cs ON cs.codigo_barra = p.codigo_barra
        LEFT JOIN nombres n    ON n.codigo_barras = p.codigo_barra
        LEFT JOIN nse_map nm   ON nm.codigo = LPAD(REGEXP_REPLACE(p.tienda, '^(\\d+).*$', '\\1'), 4, '0')
      )
      SELECT * FROM result
      ${whereClause}
      ORDER BY descripcion, tienda
      LIMIT 3000
    `, params)

    const mapped = rows.map(r => ({
      sku:       r.sku,
      descripcion: r.descripcion,
      categoria:   r.categoria,
      tienda:      r.tienda,
      nse:         r.nse,
      inv_uni:     parseInt(r.inv_uni),
      inv_valor:   parseFloat(r.inv_valor),
      vpd_dia:     parseFloat(r.vpd_dia),
      doh:         r.doh !== null ? parseInt(r.doh) : null,
      cedi_disp:   Boolean(r.cedi_disp),
      salud:       r.salud as string,
    }))

    return NextResponse.json({ rows: mapped, total: mapped.length })
  } catch (err) {
    return handleApiError(err)
  }
}
