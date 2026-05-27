import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 0

// TCs from Params sheet: CRC, GTQ, HNL, NIO, SV=USD
const TC: Record<string, number> = { CR: 510, GT: 7.75, HN: 25, NI: 37, SV: 1, CO: 4000 }

export async function GET(req: NextRequest) {
  try {
    const sp       = req.nextUrl.searchParams
    const pais     = sp.get('pais') || ''
    const cat      = sp.get('categoria') || ''
    const sku      = sp.get('sku') || ''
    const formatos = sp.get('formatos')?.split(',').filter(Boolean) ?? []

    const inC = (col: string, vals: string[]) =>
      `${col} IN (${vals.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`

    // fact_sales_sellout guarda formato en MAYÚSCULAS (HIPERMERCADO, SUPERMERCADO).
    // Los nombres de display usan mixed case y plural ("Supermercados") — normalizar antes de filtrar.
    const normFmt = (f: string): string => {
      const m: Record<string, string> = {
        'supermercados': 'SUPERMERCADO', 'supermercado': 'SUPERMERCADO',
        'hipermercado':  'HIPERMERCADO', 'hipermercados': 'HIPERMERCADO',
        'bodegas':       'BODEGAS',
        'descuentos':    'DESCUENTOS',
      }
      return m[f.toLowerCase()] ?? f.toUpperCase()
    }

    // ── Lista de productos desde dim_producto ───────────────────────────────
    if (!sku) {
      const paisQ = pais.replace(/'/g, "''")
      const catQ  = cat.replace(/'/g, "''")
      const subQ  = sp.get('subcategoria')?.replace(/'/g, "''") ?? ''
      // Carga completa (sin filtros de cat/sub): incluye todos los productos activos
      // para poblar los dropdowns de categoría/subcategoría sin cortes por LIMIT.
      // Carga filtrada: aplica EXISTS en ventas para mostrar solo productos comercializados.
      const useSalesFilter = catQ || subQ
      const r = await pool.query(`
        SELECT
          dp.sku,
          dp.descripcion,
          dp.categoria,
          dp.subcategoria,
          dp.codigo_barras
        FROM dim_producto dp
        WHERE dp.is_active = true
          AND dp.sku IS NOT NULL
          ${pais && useSalesFilter ? `AND EXISTS (
            SELECT 1 FROM fact_sales_sellout fs
            WHERE fs.sku = dp.sku
              AND fs.pais = '${paisQ}'
              AND fs.ano >= 2024
          )` : ''}
          ${catQ ? `AND dp.categoria = '${catQ}'` : ''}
          ${subQ ? `AND dp.subcategoria = '${subQ}'` : ''}
        ORDER BY dp.categoria, dp.subcategoria, dp.descripcion
        LIMIT ${useSalesFilter ? 600 : 3000}
      `)
      return NextResponse.json({ productos: r.rows })
    }

    // ── Métricas completas para un SKU ───────────────────────────────────────
    const paisFilter  = pais    ? `AND pais = '${pais.replace(/'/g, "''")}'` : ''
    const fmtFilter   = formatos.length
      ? `AND formato IN (${formatos.map(f => `'${normFmt(f)}'`).join(',')})`
      : ''
    const skuQ        = sku.replace(/'/g, "''")

    const [metaR, selloutR, inv8dR, invR, monitorR, yoyR] = await Promise.all([
      // Metadata + precio histórico ponderado (codigo_barras desde dim_producto)
      pool.query(`
        SELECT
          fss.sku,
          MAX(fss.descripcion)                        AS descripcion,
          MAX(fss.categoria)                          AS categoria,
          MAX(fss.subcategoria)                       AS subcategoria,
          (SELECT dp.codigo_barras FROM dim_producto dp
           WHERE dp.sku = '${skuQ}' LIMIT 1)         AS codigo_barras,
          ROUND(
            CASE WHEN SUM(fss.ventas_unidades) > 0
                 THEN SUM(fss.ventas_valor) / SUM(fss.ventas_unidades)
                 ELSE 0 END::numeric, 4
          )                                           AS precio_hist
        FROM fact_sales_sellout fss
        WHERE fss.sku = '${skuQ}' ${paisFilter} ${fmtFilter}
          AND fss.ano IN (2025, 2026)
        GROUP BY fss.sku
      `),

      // Sell out promedio mensual (últimos 3 meses con datos)
      pool.query(`
        WITH meses AS (
          SELECT ano, mes,
            SUM(ventas_unidades) AS uds,
            SUM(ventas_valor)    AS val
          FROM fact_sales_sellout
          WHERE sku = '${skuQ}' ${paisFilter} ${fmtFilter}
            AND dia > 0
          GROUP BY ano, mes
          ORDER BY ano DESC, mes DESC
          LIMIT 3
        )
        SELECT
          ROUND(AVG(uds)::numeric, 1) AS so_prom_mes,
          ROUND(AVG(val)::numeric, 2) AS val_prom_mes
        FROM meses
      `),

      // Ventas últimos 8 días
      pool.query(`
        SELECT COALESCE(SUM(ventas_unidades), 0) AS ventas_8d
        FROM fact_sales_sellout
        WHERE sku = '${skuQ}' ${paisFilter} ${fmtFilter}
          AND MAKE_DATE(ano::int, mes::int, dia::int) >= CURRENT_DATE - INTERVAL '8 days'
      `),

      // Inventario tiendas + CEDI — mismo JOIN que /api/comercial/ejecucion/inventario
      pool.query(`
        WITH
          upc_prod AS (
            SELECT LPAD(LEFT(dp.codigo_barras, LENGTH(dp.codigo_barras) - 1), 13, '0') AS upc
            FROM dim_producto dp
            WHERE dp.sku = '${skuQ}'
            LIMIT 1
          ),
          ult_t AS (SELECT MAX(fecha) AS f FROM inventario_tiendas),
          ult_c AS (SELECT MAX(fecha) AS f FROM inventario_cedi)
        SELECT
          COALESCE(
            (SELECT SUM(t.inv_mano)
             FROM inventario_tiendas t, ult_t, upc_prod
             WHERE t.fecha = ult_t.f
               AND t.upc   = upc_prod.upc
               ${pais ? `AND t.pais = '${pais.replace(/'/g, "''")}'` : ''}
            ), 0
          ) AS inv_tiendas,
          COALESCE(
            (SELECT SUM(c.inv_mano_cajas)
             FROM inventario_cedi c, ult_c, upc_prod
             WHERE c.fecha = ult_c.f
               AND c.upc   = upc_prod.upc
               ${pais ? `AND c.pais = '${pais.replace(/'/g, "''")}'` : ''}
            ), 0
          ) AS inv_cedi
        FROM upc_prod
      `),

      // PVP desde monitoreo de precios (ListPrice VTEX, ya en moneda local)
      pool.query(`
        SELECT precio_walmart
        FROM monitor_precios_walmart
        WHERE sku = '${skuQ}'
          AND pais = '${pais.replace(/'/g, "''")}'
          AND encontrado = true
          AND precio_walmart IS NOT NULL
        ORDER BY fecha_captura DESC
        LIMIT 1
      `),

      // ΔYoY: comparar mismos meses 2025 vs 2026
      pool.query(`
        SELECT
          SUM(CASE WHEN ano = 2025 THEN ventas_unidades ELSE 0 END) AS u2025,
          SUM(CASE WHEN ano = 2026 THEN ventas_unidades ELSE 0 END) AS u2026,
          SUM(CASE WHEN ano = 2025 THEN ventas_valor    ELSE 0 END) AS v2025,
          SUM(CASE WHEN ano = 2026 THEN ventas_valor    ELSE 0 END) AS v2026
        FROM fact_sales_sellout
        WHERE sku = '${skuQ}' ${paisFilter} ${fmtFilter}
          AND ano IN (2025, 2026)
          AND mes <= (SELECT EXTRACT(MONTH FROM MAX(
                MAKE_DATE(ano::int, mes::int, GREATEST(dia::int,1))
              )) FROM fact_sales_sellout WHERE sku = '${skuQ}' AND ano = 2026)
      `),
    ])

    const meta      = metaR.rows[0]
    const so        = selloutR.rows[0]
    const inv8d     = inv8dR.rows[0]
    const invRow    = invR.rows[0]
    const yoy       = yoyR.rows[0]
    const monitorRow = monitorR.rows[0]

    const soProm    = parseFloat(so?.so_prom_mes)  || 0
    const valProm   = parseFloat(so?.val_prom_mes) || 0
    const tcFactor  = TC[pais] ?? 1
    // fact_sales_sellout almacena ventas_valor en USD (RetailLink). Multiplicar por TC → moneda local.
    const pvpUsd    = valProm > 0 && soProm > 0 ? valProm / soProm : parseFloat(meta?.precio_hist) || 0
    const pvpSellout = pvpUsd * tcFactor
    // PVP real = ListPrice del monitoreo (ya en moneda local). Fallback: promedio de sellout.
    const pvp       = parseFloat(monitorRow?.precio_walmart) || pvpSellout
    const invTiendas = parseFloat(invRow?.inv_tiendas) || 0
    const invCedi    = parseFloat(invRow?.inv_cedi)    || 0
    const invTotal   = invTiendas + invCedi

    const u2025 = parseFloat(yoy?.u2025) || 0
    const u2026 = parseFloat(yoy?.u2026) || 0
    const deltaYoy = u2025 > 0 ? ((u2026 - u2025) / u2025) * 100 : null

    const diasStock = soProm > 0 ? Math.round((invTotal / soProm) * 30) : null

    // Factor elasticidad: replica exacta de la fórmula Excel (Params!$I$12).
    // Excel agrupa por DÍA (no por formato×día), calcula la mediana global de precio USD,
    // luego divide avg_uds de días por debajo de la mediana / avg_uds de días por encima.
    // Ejemplo Pepper Jack CR: (1367/100) / (1860/149) = 13.67 / 12.48 = 1.09507.
    let factorElast = 1.3
    let registros = 0, rBajo = 0, rAlto = 0, volBajo = 0, volAlto = 0
    try {
      const elastR = await pool.query(`
        WITH daily AS (
          SELECT
            ano, mes, dia,
            SUM(ventas_valor)::float    AS val,
            SUM(ventas_unidades)::float AS uds
          FROM fact_sales_sellout
          WHERE sku = '${skuQ}' ${paisFilter} ${fmtFilter}
            AND dia > 0 AND dia <= 31
            AND ventas_unidades > 0
            AND ano IN (2024, 2025, 2026)
          GROUP BY ano, mes, dia
          HAVING SUM(ventas_unidades) > 0
        ),
        med AS (
          SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (
            ORDER BY val / NULLIF(uds, 0)
          ) AS median_price
          FROM daily
        )
        SELECT
          SUM(CASE WHEN d.val / NULLIF(d.uds,0) <  m.median_price THEN d.uds ELSE 0 END) AS vol_bajo,
          SUM(CASE WHEN d.val / NULLIF(d.uds,0) >= m.median_price THEN d.uds ELSE 0 END) AS vol_alto,
          COUNT(CASE WHEN d.val / NULLIF(d.uds,0) <  m.median_price THEN 1 END)::int     AS reg_bajo,
          COUNT(CASE WHEN d.val / NULLIF(d.uds,0) >= m.median_price THEN 1 END)::int     AS reg_alto,
          COUNT(*)::int                                                                   AS registros
        FROM daily d, med m
      `)
      const e = elastR.rows[0]
      registros = parseInt(e?.registros) || 0
      rBajo     = parseInt(e?.reg_bajo)  || 0
      rAlto     = parseInt(e?.reg_alto)  || 0
      volBajo   = parseFloat(e?.vol_bajo) || 0
      volAlto   = parseFloat(e?.vol_alto) || 0
      // Fórmula Excel: SI.ERROR(SI(O(vb=0,va=0,rb<5,ra<5); 1.3; MIN(2;MAX(1.05;(vb/rb)/(va/ra)))); 1.3)
      if (volBajo > 0 && volAlto > 0 && rBajo >= 5 && rAlto >= 5) {
        const ratio = (volBajo / rBajo) / (volAlto / rAlto)
        factorElast = Math.min(2.0, Math.max(1.05, ratio))
      }
    } catch (elastErr) {
      console.error('[calculadora] elasticidad query failed:', elastErr)
    }

    const tendencia = deltaYoy === null ? '⚪ SIN DATA'
      : deltaYoy >= 5  ? '📈 SUBE'
      : deltaYoy <= -5 ? '📉 BAJA'
      : '➡️ ESTABLE'

    const estadoStock = diasStock === null ? '⚪ SIN DATA'
      : diasStock <= 30 ? '🟢 OK'
      : diasStock <= 60 ? '🟡 MEDIO'
      : '🔴 EXCESO'

    return NextResponse.json({
      sku:           meta?.sku         ?? sku,
      descripcion:   meta?.descripcion ?? '',
      categoria:     meta?.categoria   ?? '',
      subcategoria:  meta?.subcategoria ?? null,
      codigo_barras: meta?.codigo_barras ?? null,
      pvp:           parseFloat(pvp.toFixed(2)),
      precio_hist:   parseFloat(pvpSellout.toFixed(2)),
      tc:            tcFactor,
      moneda:        pais === 'CR' ? 'CRC' : pais === 'GT' ? 'GTQ' : pais === 'HN' ? 'HNL' : pais === 'NI' ? 'NIO' : 'USD',
      so_prom_mes:   soProm,
      val_prom_mes:  valProm,
      ventas_8d:     parseFloat(inv8d?.ventas_8d) || 0,
      inv_tiendas:   invTiendas,
      inv_cedi:      invCedi,
      inv_total:     invTotal,
      dias_stock:    diasStock,
      estado_stock:  estadoStock,
      delta_yoy:     deltaYoy,
      tendencia,
      factor_elast:    parseFloat(factorElast.toFixed(4)),
      registros_elast: registros,
      elast_reg_bajo:  rBajo,
      elast_reg_alto:  rAlto,
      elast_vol_bajo:  Math.round(volBajo),
      elast_vol_alto:  Math.round(volAlto),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
