import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 0

const inC = (col: string, vals: string[]) =>
  `${col} IN (${vals.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`

export async function GET(req: NextRequest) {
  try {
    const sp       = req.nextUrl.searchParams
    const dim      = sp.get('dim') || 'cliente'
    const paises   = sp.get('pais')     ? sp.get('pais')!.split(',').filter(Boolean)     : []
    const cadenas  = sp.get('cadena')   ? sp.get('cadena')!.split(',').filter(Boolean)   : []
    const clientes = sp.get('cliente')  ? sp.get('cliente')!.split(',').filter(Boolean)  : []

    // Año completo — 12 meses
    const meses   = Array.from({ length: 12 }, (_, i) => i + 1)
    const mesSql  = `mes IN (${meses.join(',')})`
    const paisCond    = paises.length   ? 'AND ' + inC('pais',    paises)   : ''
    const clienteCond = clientes.length ? 'AND ' + inC('cliente', clientes) : ''

    const dimCol = dim === 'categoria' ? 'categoria' : 'cliente'

    // Normalizar variantes de "GRUPO EXITO" (con/sin acento) a una sola clave
    const dimExpr = dimCol === 'cliente'
      ? `CASE WHEN UPPER(cliente) IN ('GRUPO EXITO','GRUPO ÉXITO') THEN 'GRUPO ÉXITO' ELSE cliente END`
      : 'categoria'

    const r = await pool.query(`
      SELECT ${dimExpr} AS dim, ano, mes,
        ROUND(SUM(ventas_valor)::numeric, 2) AS valor
      FROM v_ventas
      WHERE ano IN (2025, 2026) AND ${mesSql}
        ${paisCond} ${clienteCond}
        AND ${dimCol} IS NOT NULL AND ${dimCol} <> ''
      GROUP BY ${dimExpr}, ano, mes
      ORDER BY ${dimExpr}, ano, mes
    `)

    // Pivot: dim → mes → { y2025, y2026 }
    const map: Record<string, Record<number, { y2025: number; y2026: number }>> = {}
    for (const row of r.rows) {
      const d = row.dim as string
      const m = parseInt(row.mes)
      const a = parseInt(row.ano)
      if (!map[d]) map[d] = {}
      if (!map[d][m]) map[d][m] = { y2025: 0, y2026: 0 }
      if (a === 2025) map[d][m].y2025 = parseFloat(row.valor)
      if (a === 2026) map[d][m].y2026 = parseFloat(row.valor)
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
