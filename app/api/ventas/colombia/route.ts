import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'
import { withCache, cacheHeaders } from '@/lib/db/cache'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const anosP      = searchParams.get('anos')
    const mesesP     = searchParams.get('meses')
    const cadenaP    = searchParams.get('cadenas')
    const formatoP   = searchParams.get('formatos')
    const catP       = searchParams.get('categorias')
    const subcatP    = searchParams.get('subcategorias')

    const cacheKey = `colombia:${anosP}:${mesesP}:${cadenaP}:${formatoP}:${catP}:${subcatP}`
    const TTL = 5 * 60 * 1000 // 5 min

    const { data, cached } = await withCache(cacheKey, async () => {
      const conds: string[] = ["pais = 'CO'"]
      const params: unknown[] = []
      let idx = 1

      const anosArr = anosP ? anosP.split(',').map(s => s.trim()).filter(Boolean) : []
      if (anosArr.length) {
        conds.push(`ano IN (${anosArr.map(() => `$${idx++}`).join(', ')})`)
        params.push(...anosArr.map(Number))
      }

      const mesesArr = mesesP ? mesesP.split(',').map(s => s.trim()).filter(Boolean) : []
      if (mesesArr.length) {
        conds.push(`mes IN (${mesesArr.map(() => `$${idx++}`).join(', ')})`)
        params.push(...mesesArr.map(Number))
      }

      const cadenasArr = cadenaP ? cadenaP.split(',').map(s => s.trim()).filter(Boolean) : []
      if (cadenasArr.length) {
        conds.push(`cadena IN (${cadenasArr.map(() => `$${idx++}`).join(', ')})`)
        params.push(...cadenasArr)
      }

      const formatosArr = formatoP ? formatoP.split(',').map(s => s.trim()).filter(Boolean) : []
      if (formatosArr.length) {
        conds.push(`formato IN (${formatosArr.map(() => `$${idx++}`).join(', ')})`)
        params.push(...formatosArr)
      }

      const catsArr = catP ? catP.split(',').map(s => s.trim()).filter(Boolean) : []
      if (catsArr.length) {
        conds.push(`categoria IN (${catsArr.map(() => `$${idx++}`).join(', ')})`)
        params.push(...catsArr)
      }

      const subcatsArr = subcatP ? subcatP.split(',').map(s => s.trim()).filter(Boolean) : []
      if (subcatsArr.length) {
        conds.push(`subcategoria IN (${subcatsArr.map(() => `$${idx++}`).join(', ')})`)
        params.push(...subcatsArr)
      }

      const where = 'WHERE ' + conds.join(' AND ')

      // mv_sellout_mensual doesn't have codigo_barras or precio_promedio.
      // Use fact_sales_sellout (with JOIN to dim_producto) only for the row-level
      // detail query; KPI/cadenas/formatos come from the fast MV.
      const [rowsR, kpiR, cadenasR, formatosR] = await Promise.all([
        // Rows aggregated by month × cadena × formato × product (from MV, no precio_promedio)
        pool.query(
          `SELECT
             ano, mes,
             COALESCE(cadena, '') AS cadena,
             COALESCE(formato, '') AS formato,
             sku,
             COALESCE(descripcion, sku) AS descripcion,
             COALESCE(categoria, '') AS categoria,
             COALESCE(subcategoria, '') AS subcategoria,
             ROUND(SUM(ventas_unidades)::numeric, 0) AS ventas_unidades,
             ROUND(SUM(ventas_valor)::numeric, 2)    AS ventas_valor
           FROM mv_sellout_mensual ${where}
           GROUP BY ano, mes, cadena, formato, sku, descripcion, categoria, subcategoria
           ORDER BY ano ASC, mes ASC`,
          params
        ),
        // Global KPIs
        pool.query(
          `SELECT
             ROUND(SUM(ventas_valor)::numeric, 2)    AS total_valor,
             ROUND(SUM(ventas_unidades)::numeric, 0) AS total_unidades,
             COUNT(DISTINCT sku)                     AS total_skus,
             COUNT(DISTINCT COALESCE(cadena,''))     AS total_cadenas,
             COUNT(DISTINCT COALESCE(punto_venta,'')) AS total_pdvs
           FROM mv_sellout_mensual ${where}`,
          params
        ),
        // Available cadenas
        pool.query(
          `SELECT DISTINCT COALESCE(cadena,'') AS cadena FROM mv_sellout_mensual WHERE pais='CO' AND cadena IS NOT NULL ORDER BY cadena`,
          []
        ),
        // Available formatos
        pool.query(
          `SELECT DISTINCT COALESCE(formato,'') AS formato FROM mv_sellout_mensual WHERE pais='CO' AND formato IS NOT NULL ORDER BY formato`,
          []
        ),
      ])

      return {
        rows:     rowsR.rows,
        kpi:      kpiR.rows[0] ?? {},
        cadenas:  cadenasR.rows.map((r: any) => r.cadena).filter(Boolean),
        formatos: formatosR.rows.map((r: any) => r.formato).filter(Boolean),
      }
    }, TTL)

    return NextResponse.json(data, {
      headers: { ...cacheHeaders(300), 'X-Cache': cached ? 'HIT' : 'MISS' },
    })
  } catch (err) {
    return handleApiError(err)
  }
}
