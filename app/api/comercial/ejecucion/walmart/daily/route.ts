import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

const MES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function toIso(v: unknown): string {
  return v instanceof Date ? (v as Date).toISOString().slice(0, 10) : String(v)
}
function formatFecha(iso: string) {
  const [, m, d] = iso.split('-')
  return `${parseInt(d)} ${MES[parseInt(m)]}`
}

export async function GET(req: NextRequest) {
  try {
    const sp        = req.nextUrl.searchParams
    const pais      = sp.get('pais')         ?? 'CR'
    const categoria = sp.get('categoria')    ?? ''
    const subcat    = sp.get('subcategoria') ?? ''
    const cadena    = sp.get('cadena')       ?? ''
    const desde     = sp.get('desde')        || '2026-01-01'
    const hasta     = sp.get('hasta')        || '2026-12-31'
    const topN      = Math.min(Math.max(parseInt(sp.get('top') ?? '5'), 1), 200)

    const p    = `'${pais.replace(/'/g, "''")}'`
    const catF = categoria ? `AND categoria    = '${categoria.replace(/'/g, "''")}'` : ''
    const subF = subcat    ? `AND subcategoria = '${subcat.replace(/'/g, "''")}'`    : ''
    const cadF = cadena    ? `AND cadena       = '${cadena.replace(/'/g, "''")}'`   : ''

    // shared WHERE for simple queries
    const where  = `pais = ${p} AND fecha BETWEEN $1 AND $2 ${catF} ${subF} ${cadF}`
    // shared WHERE for aliased f. queries
    const whereF = `f.pais = ${p} AND f.fecha BETWEEN $1 AND $2 ${catF.replace(/AND /g, 'AND f.')} ${subF.replace(/AND /g, 'AND f.')} ${cadF.replace(/AND /g, 'AND f.')}`

    const [overallR, byCadenaR, bySkuR] = await Promise.all([

      pool.query(`
        SELECT fecha::date AS fecha,
          ROUND(SUM(ventas_valor)::numeric,    2) AS valor,
          ROUND(SUM(ventas_unidades)::numeric, 0) AS unidades
        FROM fact_ventas_walmart
        WHERE ${where}
        GROUP BY fecha::date ORDER BY fecha::date
      `, [desde, hasta]),

      cadena ? Promise.resolve({ rows: [] as any[] }) : pool.query(`
        SELECT fecha::date AS fecha, cadena,
          ROUND(SUM(ventas_valor)::numeric,    2) AS valor,
          ROUND(SUM(ventas_unidades)::numeric, 0) AS unidades
        FROM fact_ventas_walmart
        WHERE ${where}
        GROUP BY fecha::date, cadena ORDER BY fecha::date, cadena
      `, [desde, hasta]),

      pool.query(`
        WITH top_skus AS (
          SELECT codigo_barras, MAX(descripcion) AS descripcion
          FROM fact_ventas_walmart
          WHERE ${where}
          GROUP BY codigo_barras
          ORDER BY SUM(ventas_valor) DESC
          LIMIT ${topN}
        )
        SELECT f.fecha::date AS fecha, t.descripcion,
          ROUND(SUM(f.ventas_valor)::numeric,    2) AS valor,
          ROUND(SUM(f.ventas_unidades)::numeric, 0) AS unidades
        FROM fact_ventas_walmart f
        JOIN top_skus t ON t.codigo_barras = f.codigo_barras
        WHERE ${whereF}
        GROUP BY f.fecha::date, t.descripcion
        ORDER BY f.fecha::date, t.descripcion
      `, [desde, hasta]),

    ])

    // Overall series
    const series = overallR.rows.map(r => ({
      fecha:    toIso(r.fecha),
      label:    formatFecha(toIso(r.fecha)),
      valor:    parseFloat(r.valor),
      unidades: parseInt(r.unidades),
    }))

    const allDates = series.map(s => s.fecha)

    // Wide byCadena
    const cadenas = [...new Set(byCadenaR.rows.map(r => r.cadena as string))]
    const byCadMap: Record<string, any> = {}
    for (const s of series) {
      byCadMap[s.fecha] = { fecha: s.fecha, label: s.label }
      for (const c of cadenas) byCadMap[s.fecha][c] = null
    }
    for (const r of byCadenaR.rows) {
      const iso = toIso(r.fecha)
      if (!byCadMap[iso]) { byCadMap[iso] = { fecha: iso, label: formatFecha(iso) }; for (const c of cadenas) byCadMap[iso][c] = null }
      byCadMap[iso][r.cadena] = parseFloat(r.valor)
    }
    const byCadena = allDates.map(d => byCadMap[d]).filter(Boolean)

    // Wide bySkus
    const skuNames = [...new Set(bySkuR.rows.map(r => r.descripcion as string))]
    const bySkuMap: Record<string, any> = {}
    for (const s of series) {
      bySkuMap[s.fecha] = { fecha: s.fecha, label: s.label }
      for (const n of skuNames) bySkuMap[s.fecha][n] = null
    }
    for (const r of bySkuR.rows) {
      const iso = toIso(r.fecha)
      if (!bySkuMap[iso]) { bySkuMap[iso] = { fecha: iso, label: formatFecha(iso) }; for (const n of skuNames) bySkuMap[iso][n] = null }
      bySkuMap[iso][r.descripcion] = parseFloat(r.valor)
    }
    const bySkus = allDates.map(d => bySkuMap[d]).filter(Boolean)

    return NextResponse.json({ series, byCadena, cadenas, bySkus, skuNames })
  } catch (err) {
    return handleApiError(err)
  }
}
