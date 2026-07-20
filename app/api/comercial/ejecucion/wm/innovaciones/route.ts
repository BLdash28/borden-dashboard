import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'
import { withTiming } from '@/lib/api/withTiming'

export const revalidate = 300

/**
 * Innovaciones · Walmart (aplica a los 5 países CR/GT/HN/NI/SV)
 *
 * Heurística: se considera innovación un SKU cuya PRIMERA venta en el país
 * ocurrió en los últimos 180 días. Cero mantenimiento, se autopobla.
 *
 * Query params:
 *   - pais (obligatorio): CR|GT|HN|NI|SV
 *   - cadena (opcional): filtra por cadena
 *   - dias (opcional, default 180): ventana de "primera venta reciente"
 */
export const GET = withTiming(async function GET(req: NextRequest) {
  try {
    const pais   = req.nextUrl.searchParams.get('pais') ?? ''
    const cadena = req.nextUrl.searchParams.get('cadena') ?? ''
    const dias   = parseInt(req.nextUrl.searchParams.get('dias') ?? '180')

    if (!pais) return NextResponse.json({ error: 'pais requerido' }, { status: 400 })

    const cadFilter = cadena ? `AND cadena = '${cadena.replace(/'/g, "''")}'` : ''

    // Universo de PDVs del país en el snapshot más reciente — se comparte
    // entre todos los SKUs para calcular cobertura % por producto.
    const univR = await pool.query(`
      WITH ult AS (
        SELECT MAX(fecha) AS f FROM fact_inventario_walmart_pdv WHERE pais = $1
      )
      SELECT COUNT(DISTINCT punto_venta) AS universo
      FROM fact_inventario_walmart_pdv
      WHERE pais = $1 AND fecha = (SELECT f FROM ult)
    `, [pais])
    const universoPdvs = parseInt(univR.rows[0]?.universo ?? '0') || 0

    // 1. SKUs con primera venta en la ventana.
    // Agrupamos por una key normalizada — SKU si existe, si no UPC.
    // Esto evita duplicados cuando un mismo SKU aparece con distinto codigo_barras
    // (ej. filas con UPC null vs UPC completo) y viceversa.
    const catR = await pool.query(`
      WITH primera AS (
        SELECT
          COALESCE(NULLIF(sku, ''), codigo_barras) AS product_key,
          MAX(NULLIF(sku, ''))              AS sku,
          MAX(NULLIF(codigo_barras, ''))    AS codigo_barras,
          MAX(descripcion)                  AS descripcion,
          MAX(categoria)                    AS categoria,
          MAX(subcategoria)                 AS subcategoria,
          MIN(fecha)                        AS primera_venta,
          MAX(fecha)                        AS ultima_venta
        FROM fact_ventas_walmart
        WHERE pais = $1 AND ventas_unidades > 0
          AND COALESCE(NULLIF(sku, ''), codigo_barras) IS NOT NULL
          ${cadFilter}
        GROUP BY COALESCE(NULLIF(sku, ''), codigo_barras)
      )
      SELECT * FROM primera
      WHERE primera_venta >= CURRENT_DATE - ($2::int * INTERVAL '1 day')
      ORDER BY primera_venta DESC
    `, [pais, dias])

    const items: any[] = []
    for (const it of catR.rows) {
      const [monthlyR, dailyR, statsR, stockR, vel90R] = await Promise.all([
        pool.query(`
          SELECT EXTRACT(YEAR FROM fecha)::int  AS ano,
                 EXTRACT(MONTH FROM fecha)::int AS mes,
                 SUM(ventas_unidades)::float   AS uds,
                 SUM(ventas_valor)::float      AS valor,
                 COUNT(DISTINCT punto_venta)   AS pdvs
          FROM fact_ventas_walmart
          WHERE pais = $1 AND (sku = $2 OR codigo_barras = $3)
            ${cadFilter}
          GROUP BY 1, 2 ORDER BY 1, 2
        `, [pais, it.sku, it.codigo_barras]),

        pool.query(`
          SELECT fecha::text                   AS fecha,
                 SUM(ventas_unidades)::float  AS uds,
                 SUM(ventas_valor)::float     AS valor,
                 COUNT(DISTINCT punto_venta)  AS pdvs
          FROM fact_ventas_walmart
          WHERE pais = $1 AND (sku = $2 OR codigo_barras = $3)
            AND fecha >= CURRENT_DATE - INTERVAL '90 day'
            ${cadFilter}
          GROUP BY fecha ORDER BY fecha
        `, [pais, it.sku, it.codigo_barras]),

        pool.query(`
          SELECT SUM(ventas_unidades)::float  AS total_uds,
                 SUM(ventas_valor)::float     AS total_valor,
                 COUNT(DISTINCT punto_venta)  AS pdvs_unicos,
                 COUNT(DISTINCT cadena)       AS cadenas_unicas
          FROM fact_ventas_walmart
          WHERE pais = $1 AND (sku = $2 OR codigo_barras = $3)
            ${cadFilter}
        `, [pais, it.sku, it.codigo_barras]),

        // Stock actual desde el último snapshot de inventario_walmart_pdv
        pool.query(`
          WITH ult AS (
            SELECT MAX(fecha) AS f FROM fact_inventario_walmart_pdv WHERE pais = $1
          )
          SELECT COALESCE(SUM(inv_mano), 0)::float             AS stock_und,
                 COUNT(DISTINCT punto_venta) FILTER (WHERE inv_mano > 0) AS pdvs_con_stock,
                 (SELECT f FROM ult)::text                     AS fecha_snap
          FROM fact_inventario_walmart_pdv
          WHERE pais = $1
            AND fecha = (SELECT f FROM ult)
            AND (sku = $2 OR codigo_barras = $3)
        `, [pais, it.sku, it.codigo_barras]),

        // Velocidad de venta últimos 90 días — para calcular DOH del SKU
        pool.query(`
          SELECT COALESCE(SUM(ventas_unidades), 0)::float AS uds_90d
          FROM fact_ventas_walmart
          WHERE pais = $1 AND (sku = $2 OR codigo_barras = $3)
            AND fecha >= CURRENT_DATE - INTERVAL '90 day'
            ${cadFilter}
        `, [pais, it.sku, it.codigo_barras]),
      ])

      const monthly = monthlyR.rows.map(r => ({
        ano: parseInt(r.ano), mes: parseInt(r.mes),
        uds: parseFloat(r.uds ?? '0'), valor: parseFloat(r.valor ?? '0'),
        pdvs: parseInt(r.pdvs ?? '0'),
      }))
      const daily = dailyR.rows.map(r => ({
        fecha: r.fecha,
        uds: parseFloat(r.uds ?? '0'), valor: parseFloat(r.valor ?? '0'),
        pdvs: parseInt(r.pdvs ?? '0'),
      }))
      const s        = statsR.rows[0] ?? {}
      const stock    = stockR.rows[0] ?? {}
      const stockUnd = parseFloat(stock.stock_und ?? '0')
      const pdvsCon  = parseInt(stock.pdvs_con_stock ?? '0')
      // "PDVs" del SKU = puntos de venta donde el SKU se ha vendido históricamente.
      // La cobertura se calcula sobre ese universo del SKU, no sobre el universo
      // global del país (un SKU nuevo no cubre todos los PDVs de Walmart).
      const pdvsSku  = parseInt(s.pdvs_unicos ?? '0')
      const uds90    = parseFloat(vel90R.rows[0]?.uds_90d ?? '0')
      const velDia   = uds90 / 90
      const doh      = velDia > 0 ? stockUnd / velDia : null
      const cobPct   = pdvsSku > 0 ? (pdvsCon / pdvsSku) * 100 : null

      items.push({
        sku:              it.sku,
        codigo_barras:    it.codigo_barras,
        descripcion:      it.descripcion,
        categoria:        it.categoria,
        subcategoria:     it.subcategoria,
        primera_venta:    it.primera_venta ? new Date(it.primera_venta).toISOString().slice(0, 10) : null,
        ultima_venta:     it.ultima_venta  ? new Date(it.ultima_venta).toISOString().slice(0, 10)  : null,
        dias_desde_lanz:  it.primera_venta
                            ? Math.floor((Date.now() - new Date(it.primera_venta).getTime()) / 86400000)
                            : null,
        sin_ventas:       parseFloat(s.total_uds ?? '0') === 0,
        total_uds:        parseFloat(s.total_uds ?? '0'),
        total_valor:      parseFloat(s.total_valor ?? '0'),
        pdvs_unicos:      parseInt(s.pdvs_unicos ?? '0'),
        cadenas_unicas:   parseInt(s.cadenas_unicas ?? '0'),
        stock_und:        stockUnd,
        pdvs_con_stock:   pdvsCon,
        stock_fecha:      stock.fecha_snap ?? null,
        doh:              doh !== null ? Math.round(doh * 10) / 10 : null,
        cobertura_pct:    cobPct !== null ? Math.round(cobPct * 10) / 10 : null,
        // Universo de PDVs sobre el que se mide la cobertura del SKU
        // (= los PDVs donde el SKU se ha vendido históricamente).
        universo_pdvs:    pdvsSku,
        monthly,
        daily,
      })
    }

    return NextResponse.json({ items, total: items.length, ventana_dias: dias })
  } catch (err) {
    return handleApiError(err)
  }
})
