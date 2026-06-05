import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

export async function GET(req: NextRequest) {
  try {
    const sp     = req.nextUrl.searchParams
    const paises = sp.get('pais')      ? sp.get('pais')!.split(',').filter(Boolean)      : []
    const cats   = sp.get('categoria') ? sp.get('categoria')!.split(',').filter(Boolean) : []
    const ano    = parseInt(sp.get('ano') || '2026')

    const inC = (col: string, vals: string[]) =>
      `${col} IN (${vals.map(v => `'${v.replace(/'/g,"''")}'`).join(',')})`

    const isSelectosSV = paises.length === 1 && paises[0] === 'SV'

    if (isSelectosSV) {
      const subcats      = sp.get('subcategoria') ? sp.get('subcategoria')!.split(',').filter(Boolean) : []
      const catFilter    = cats.length    ? `AND ${inC('categoria',    cats)}` : ''
      const subcatFilter = subcats.length ? `AND ${inC('subcategoria', subcats)}` : ''

      const IS_PDV  = `NOT (tienda ILIKE '1001%' OR tienda ILIKE '1017%')`

      const [skuR, totalR, histR, wgtR] = await Promise.all([
        // SKU metadata from sales + current inventory presence at latest snapshot
        pool.query(`
          WITH ultima AS (
            SELECT MAX(fecha) AS fecha FROM fact_selectos_inventario
          ),
          sku_meta AS (
            SELECT codigo_barras AS sku,
              MAX(descripcion) AS descripcion,
              MAX(categoria)   AS categoria,
              ROUND(SUM(ventas_valor)::numeric, 2) AS valor
            FROM fact_ventas_selectos
            WHERE EXTRACT(YEAR FROM fecha) = ${ano} ${catFilter} ${subcatFilter}
            GROUP BY codigo_barras
          ),
          sku_inv AS (
            SELECT fsi.codigo_barra AS sku,
              COUNT(DISTINCT fsi.tienda) AS pdvs_activos
            FROM fact_selectos_inventario fsi
            JOIN ultima u ON fsi.fecha = u.fecha
            WHERE ${IS_PDV} AND fsi.inventario_unidades > 0
            GROUP BY fsi.codigo_barra
          )
          SELECT m.sku, m.descripcion, m.categoria, m.valor,
            COALESCE(i.pdvs_activos, 0) AS pdvs_activos
          FROM sku_meta m
          LEFT JOIN sku_inv i ON i.sku = m.sku
          ORDER BY COALESCE(i.pdvs_activos, 0) DESC, m.valor DESC
          LIMIT 200
        `),
        // Total PDV stores at latest inventory snapshot
        pool.query(`
          SELECT COUNT(DISTINCT tienda) AS n
          FROM fact_selectos_inventario
          JOIN (SELECT MAX(fecha) AS fecha FROM fact_selectos_inventario) u USING (fecha)
          WHERE ${IS_PDV}
        `),
        // Historical max: best snapshot date per SKU (all time, inventory-based)
        pool.query(`
          WITH daily AS (
            SELECT codigo_barra, fecha,
              COUNT(DISTINCT tienda) AS n
            FROM fact_selectos_inventario
            WHERE ${IS_PDV} AND inventario_unidades > 0
            GROUP BY codigo_barra, fecha
          )
          SELECT codigo_barra AS sku, MAX(n) AS pdvs_max
          FROM daily GROUP BY codigo_barra
        `),
        // Weighted coverage: stores weighted by their share of total ${ano} sales
        pool.query(`
          WITH store_val AS (
            SELECT nombre_sucursal, SUM(ventas_valor) AS venta
            FROM fact_ventas_selectos
            WHERE EXTRACT(YEAR FROM fecha) = ${ano} ${catFilter} ${subcatFilter}
            GROUP BY nombre_sucursal
          ),
          total_val AS (SELECT NULLIF(SUM(venta), 0) AS t FROM store_val),
          sku_stores AS (
            SELECT DISTINCT codigo_barras, nombre_sucursal
            FROM fact_ventas_selectos
            WHERE EXTRACT(YEAR FROM fecha) = ${ano} ${catFilter} ${subcatFilter}
          )
          SELECT s.codigo_barras AS sku,
            ROUND((SUM(sv.venta / tv.t) * 100)::numeric, 1) AS cob_ponderada
          FROM sku_stores s
          JOIN store_val sv ON sv.nombre_sucursal = s.nombre_sucursal
          CROSS JOIN total_val tv
          GROUP BY s.codigo_barras
        `),
      ])

      const total_pdvs = parseInt(totalR.rows[0]?.n ?? '0')

      const maxMap: Record<string, number> = {}
      for (const r of histR.rows) maxMap[r.sku] = parseInt(r.pdvs_max)

      const wgtMap: Record<string, number> = {}
      for (const r of wgtR.rows) wgtMap[r.sku] = parseFloat(r.cob_ponderada)

      const rows = skuR.rows.map(row => {
        const pdvs          = parseInt(row.pdvs_activos)
        const pdvs_max      = maxMap[row.sku] ?? pdvs
        const cob_actual    = total_pdvs > 0 ? parseFloat((pdvs / total_pdvs * 100).toFixed(1)) : 0
        const cob_maxima    = total_pdvs > 0 ? parseFloat((pdvs_max / total_pdvs * 100).toFixed(1)) : 0
        const cob_ponderada = wgtMap[row.sku] ?? cob_actual
        return {
          sku:                row.sku,
          descripcion:        row.descripcion,
          categoria:          row.categoria,
          pdvs_activos:       pdvs,
          pdvs_max,
          valor:              parseFloat(row.valor),
          cobertura_pct:      cob_actual,
          cobertura_maxima:   cob_maxima,
          cobertura_ponderada: cob_ponderada,
          gap_pp:             parseFloat((cob_maxima - cob_actual).toFixed(1)),
        }
      })

      const n             = rows.length || 1
      const avg_cob       = parseFloat((rows.reduce((s, r) => s + r.cobertura_pct,       0) / n).toFixed(1))
      const avg_ponderada = parseFloat((rows.reduce((s, r) => s + r.cobertura_ponderada, 0) / n).toFixed(1))
      const max_historica = parseFloat((rows.reduce((s, r) => s + r.cobertura_maxima,    0) / n).toFixed(1))
      const gap_global    = parseFloat((max_historica - avg_cob).toFixed(1))

      return NextResponse.json({ rows, total_pdvs, avg_cob, avg_ponderada, max_historica, gap_global })
    }

    // Generic: mv_sellout_mensual
    const filters: string[] = [`ano = ${ano}`]
    if (paises.length) filters.push(inC('pais', paises))
    if (cats.length)   filters.push(inC('categoria', cats))
    const where = 'WHERE ' + filters.join(' AND ')

    const [skuR, totalR] = await Promise.all([
      pool.query(`
        SELECT sku, MAX(descripcion) AS descripcion, MAX(categoria) AS categoria,
          COUNT(DISTINCT punto_venta) AS pdvs_activos, COUNT(DISTINCT pais) AS paises,
          ROUND(SUM(ventas_valor)::numeric, 2) AS valor
        FROM mv_sellout_mensual ${where}
        GROUP BY sku ORDER BY pdvs_activos DESC, valor DESC LIMIT 200
      `),
      pool.query(`SELECT COUNT(DISTINCT punto_venta) AS n FROM mv_sellout_mensual ${where}`),
    ])

    const total_pdvs = parseInt(totalR.rows[0]?.n ?? '0')
    const rows = skuR.rows.map(row => {
      const pdvs = parseInt(row.pdvs_activos)
      const cob  = total_pdvs > 0 ? parseFloat((pdvs / total_pdvs * 100).toFixed(1)) : 0
      return {
        sku: row.sku, descripcion: row.descripcion, categoria: row.categoria,
        pdvs_activos: pdvs, paises: parseInt(row.paises), valor: parseFloat(row.valor),
        cobertura_pct: cob, cobertura_maxima: cob, cobertura_ponderada: cob, gap_pp: 0,
      }
    })

    return NextResponse.json({ rows, total_pdvs, avg_cob: 0, avg_ponderada: 0, max_historica: 0, gap_global: 0 })
  } catch (err) {
    return handleApiError(err)
  }
}
