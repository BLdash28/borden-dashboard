import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

const MN = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

export async function GET(req: NextRequest) {
  try {
    const sp        = req.nextUrl.searchParams
    const pais      = sp.get('pais')      ?? 'CR'
    const categoria = sp.get('categoria') ?? ''
    const cadena    = sp.get('cadena')    ?? ''
    const paisSafe  = pais.replace(/'/g,"''")
    const catFilter   = categoria ? `AND categoria = '${categoria.replace(/'/g,"''")}'` : ''
    const cadenaFilter = cadena ? `AND cadena = '${cadena.replace(/'/g,"''")}'` : ''

    const [monthlyR, byCadenaR, byCatR] = await Promise.all([
      // Overall monthly 2025 + 2026
      pool.query(`
        SELECT
          EXTRACT(YEAR  FROM fecha)::int  AS ano,
          EXTRACT(MONTH FROM fecha)::int  AS mes,
          ROUND(SUM(ventas_valor)::numeric,    2) AS valor,
          ROUND(SUM(ventas_unidades)::numeric, 0) AS unidades
        FROM fact_ventas_walmart
        WHERE pais = '${paisSafe}' ${catFilter} ${cadenaFilter}
          AND EXTRACT(YEAR FROM fecha) IN (2025, 2026)
        GROUP BY 1, 2
        ORDER BY 1, 2
      `),
      // Monthly by cadena (2026 only)
      pool.query(`
        SELECT
          cadena,
          EXTRACT(MONTH FROM fecha)::int AS mes,
          ROUND(SUM(ventas_valor)::numeric, 2) AS valor
        FROM fact_ventas_walmart
        WHERE pais = '${paisSafe}'
          AND EXTRACT(YEAR FROM fecha) = 2026
          ${catFilter}
        GROUP BY cadena, mes
        ORDER BY cadena, mes
      `),
      // Monthly by categoria (2026 only)
      pool.query(`
        SELECT
          categoria,
          EXTRACT(MONTH FROM fecha)::int AS mes,
          ROUND(SUM(ventas_valor)::numeric, 2) AS valor
        FROM fact_ventas_walmart
        WHERE pais = '${paisSafe}'
          AND EXTRACT(YEAR FROM fecha) = 2026
          ${cadenaFilter}
        GROUP BY categoria, mes
        ORDER BY categoria, mes
      `),
    ])

    // Build overall monthly series
    const byMes: Record<number, { mes: number; mes_nombre: string; y2025: number; y2026: number | null; u2025: number; u2026: number | null }> = {}
    for (let m = 1; m <= 12; m++) {
      byMes[m] = { mes: m, mes_nombre: MN[m], y2025: 0, y2026: null, u2025: 0, u2026: null }
    }
    for (const r of monthlyR.rows) {
      const m = parseInt(r.mes); const a = parseInt(r.ano)
      if (a === 2025) { byMes[m].y2025 = parseFloat(r.valor); byMes[m].u2025 = parseFloat(r.unidades) }
      if (a === 2026) { byMes[m].y2026 = parseFloat(r.valor); byMes[m].u2026 = parseFloat(r.unidades) }
    }
    const meses2026 = monthlyR.rows.filter(r => parseInt(r.ano) === 2026 && parseFloat(r.valor) > 0)
    const ultimoMes = meses2026.length > 0 ? Math.max(...meses2026.map(r => parseInt(r.mes))) : 0
    for (let m = ultimoMes + 1; m <= 12; m++) { byMes[m].y2026 = null; byMes[m].u2026 = null }

    // Build by-cadena series
    const cadenas = [...new Set(byCadenaR.rows.map(r => r.cadena as string))]
    const byCadenaSeries: Record<number, Record<string, any>> = {}
    for (let m = 1; m <= 12; m++) {
      byCadenaSeries[m] = { mes: m, mes_nombre: MN[m] }
      for (const c of cadenas) byCadenaSeries[m][c] = null
    }
    for (const r of byCadenaR.rows) {
      const m = parseInt(r.mes)
      byCadenaSeries[m][r.cadena] = parseFloat(r.valor)
    }

    // Build by-categoria series
    const cats = [...new Set(byCatR.rows.map(r => r.categoria as string))]
    const byCatSeries: Record<number, Record<string, any>> = {}
    for (let m = 1; m <= 12; m++) {
      byCatSeries[m] = { mes: m, mes_nombre: MN[m] }
      for (const c of cats) byCatSeries[m][c] = null
    }
    for (const r of byCatR.rows) {
      const m = parseInt(r.mes)
      byCatSeries[m][r.categoria] = parseFloat(r.valor)
    }

    return NextResponse.json({
      series:           Object.values(byMes),
      cadenas,
      byCadena:         Object.values(byCadenaSeries),
      categorias:       cats,
      byCategorias:     Object.values(byCatSeries),
      ultimo_mes:       ultimoMes,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
