import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 0

const inC = (col: string, vals: string[]) =>
  `${col} IN (${vals.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`

export async function GET(req: NextRequest) {
  try {
    const sp         = req.nextUrl.searchParams
    const dim        = sp.get('dim') || 'cliente'
    const paises     = sp.get('pais')         ? sp.get('pais')!.split(',').filter(Boolean)         : []
    const tipos      = sp.get('tipo_negocio') ? sp.get('tipo_negocio')!.split(',').filter(Boolean) : []
    const clientes   = sp.get('cliente')      ? sp.get('cliente')!.split(',').filter(Boolean)      : []
    const categorias = sp.get('categoria')    ? sp.get('categoria')!.split(',').filter(Boolean)    : []
    const subcats    = sp.get('subcategoria') ? sp.get('subcategoria')!.split(',').filter(Boolean) : []

    // Año completo — 12 meses
    const meses    = Array.from({ length: 12 }, (_, i) => i + 1)
    const mesSql   = `mes IN (${meses.join(',')})`
    const paisCond = paises.length ? 'AND ' + inC('pais',         paises) : ''
    const tipoCond = tipos.length  ? 'AND ' + inC('tipo_negocio', tipos)  : ''

    // ventas_sell_in no tiene tipo_negocio — solo filtrar por pais
    const paisCondOld = paises.length ? 'AND ' + inC('pais', paises) : ''

    const dimColNew  = dim === 'categoria' ? 'categoria' : 'cliente_nombre'
    const dimColOld  = dim === 'categoria' ? 'categoria' : 'cliente'
    const clienteNew = clientes.length   ? 'AND ' + inC('cliente_nombre', clientes) : ''
    const clienteOld = clientes.length   ? 'AND ' + inC('cliente',        clientes) : ''
    const catCond    = categorias.length ? 'AND ' + inC('categoria',      categorias) : ''
    const subcatCond = subcats.length    ? 'AND ' + inC('subcategoria',   subcats)    : ''

    // Usa fact_sales_sellin para 2025 y 2026 (consistente con resumen ejecutivo)
    // Suplementa 2025 con ventas_sell_in solo para meses no cubiertos por fact_sales_sellin
    const r = await pool.query(`
      SELECT dim, ano, mes, ROUND(SUM(ingresos)::numeric, 2) AS ingresos
      FROM (
        SELECT ${dimColNew} AS dim, ano, mes, venta_neta AS ingresos
        FROM fact_sales_sellin
        WHERE ano IN (2025, 2026) AND ${mesSql} ${paisCond} ${tipoCond} ${clienteNew} ${catCond} ${subcatCond}

        UNION ALL

        SELECT ${dimColOld} AS dim, 2025 AS ano, mes, ingresos
        FROM ventas_sell_in
        WHERE ano = 2025 AND ${mesSql} ${paisCondOld} ${clienteOld} ${catCond} ${subcatCond}
          AND (ano, mes) NOT IN (
            SELECT DISTINCT ano, mes FROM fact_sales_sellin WHERE ano = 2025
          )
      ) sub
      WHERE dim IS NOT NULL AND dim <> ''
      GROUP BY dim, ano, mes
      ORDER BY dim, ano, mes
    `)

    // Pivot: dim → mes → { y2025, y2026 }
    const map: Record<string, Record<number, { y2025: number; y2026: number }>> = {}
    for (const row of r.rows) {
      const d = row.dim as string
      const m = parseInt(row.mes)
      const a = parseInt(row.ano)
      if (!map[d]) map[d] = {}
      if (!map[d][m]) map[d][m] = { y2025: 0, y2026: 0 }
      if (a === 2025) map[d][m].y2025 = parseFloat(row.ingresos)
      if (a === 2026) map[d][m].y2026 = parseFloat(row.ingresos)
    }

    const rows = Object.entries(map).map(([dim, mesData]) => {
      let total2025 = 0, total2026 = 0
      const mesesRow: Record<number, { y2025: number; y2026: number; var: number | null }> = {}
      for (const m of meses) {
        const d = mesData[m] ?? { y2025: 0, y2026: 0 }
        total2025 += d.y2025
        total2026 += d.y2026
        mesesRow[m] = {
          y2025: d.y2025,
          y2026: d.y2026,
          var: d.y2025 > 0 ? ((d.y2026 - d.y2025) / d.y2025) * 100 : null,
        }
      }
      return {
        dim,
        meses: mesesRow,
        total2025,
        total2026,
        varTotal: total2025 > 0 ? ((total2026 - total2025) / total2025) * 100 : null,
      }
    }).sort((a, b) => b.total2026 - a.total2026)

    // Totales generales
    const totals = rows.reduce((acc, r) => {
      const t = { total2025: acc.total2025 + r.total2025, total2026: acc.total2026 + r.total2026, meses: { ...acc.meses } }
      for (const m of meses) {
        if (!t.meses[m]) t.meses[m] = { y2025: 0, y2026: 0 }
        t.meses[m].y2025 += r.meses[m]?.y2025 ?? 0
        t.meses[m].y2026 += r.meses[m]?.y2026 ?? 0
      }
      return t
    }, { total2025: 0, total2026: 0, meses: {} as Record<number, { y2025: number; y2026: number }> })

    return NextResponse.json({ rows, totals, meses, dim })
  } catch (err) {
    return handleApiError(err)
  }
}
