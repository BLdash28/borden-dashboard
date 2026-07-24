import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300  // 5 min cache HTTP

const inC = (col: string, vals: string[]) =>
  `${col} IN (${vals.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`

export async function GET(req: NextRequest) {
  try {
    const sp       = req.nextUrl.searchParams
    const dim      = sp.get('dim') || 'cliente'
    const paises   = sp.get('pais')          ? sp.get('pais')!.split(',').filter(Boolean)          : []
    const clientes = sp.get('cliente')       ? sp.get('cliente')!.split(',').filter(Boolean)       : []
    const cats     = sp.get('categoria')     ? sp.get('categoria')!.split(',').filter(Boolean)     : []
    const subcats  = sp.get('subcategoria')  ? sp.get('subcategoria')!.split(',').filter(Boolean)  : []

    // Año completo — 12 meses
    const meses   = Array.from({ length: 12 }, (_, i) => i + 1)
    const paisCond    = paises.length   ? 'AND ' + inC('pais',         paises)   : ''
    const clienteCond = clientes.length ? 'AND ' + inC('cliente',      clientes) : ''
    const catCond     = cats.length     ? 'AND ' + inC('categoria',    cats)     : ''
    const subcatCond  = subcats.length  ? 'AND ' + inC('subcategoria', subcats)  : ''

    const dimCol = dim === 'categoria' ? 'categoria' : 'cliente'

    // Normalizar variantes de "GRUPO EXITO" (con/sin acento) a una sola clave
    const dimExpr = dimCol === 'cliente'
      ? `CASE WHEN UPPER(cliente) IN ('GRUPO EXITO','GRUPO ÉXITO') THEN 'GRUPO ÉXITO' ELSE cliente END`
      : 'categoria'

    // 1) Cutoff — último (mes, dia) con ventas en 2026 respetando filtros.
    //    Se saca en query mínima sobre mv_sellout_mensual (que sí tiene dia).
    const cutoffR = await pool.query(`
      SELECT COALESCE(MAX(mes * 100 + dia), 1231) AS cut_num
      FROM mv_sellout_mensual
      WHERE ano = 2026
        ${paisCond} ${clienteCond} ${catCond} ${subcatCond}
        AND ${dimCol} IS NOT NULL AND ${dimCol} <> ''
        AND ventas_valor > 0
    `)
    const cutNum = parseInt(cutoffR.rows[0]?.cut_num ?? '0') || 1231
    const cutMes = Math.floor(cutNum / 100)
    // "Mes completo" incluye todos los meses < cutMes; el mes cutMes tiene corte diario.

    // 2) Data mensual — mv_sellout_agg (pre-agregada mensual, ~4K filas) para
    //    2026 completo y 2025 hasta el mes anterior al de corte (comparable full-month).
    const r = await pool.query(`
      SELECT ${dimExpr} AS dim, ano, mes,
        ROUND(SUM(ventas_valor)::numeric, 2) AS valor
      FROM mv_sellout_agg
      WHERE ano IN (2025, 2026)
        AND (
          ano = 2026
          OR (ano = 2025 AND mes < ${cutMes})
        )
        ${paisCond} ${clienteCond} ${catCond} ${subcatCond}
        AND ${dimCol} IS NOT NULL AND ${dimCol} <> ''
      GROUP BY ${dimExpr}, ano, mes
      ORDER BY ${dimExpr}, ano, mes
    `)

    // 3) Para el mes en curso (cutMes), 2025 se recorta a día — usa mv_sellout_mensual
    //    que sí tiene columna dia. Sumamos solo hasta cutNum % 100.
    const cutDia = cutNum % 100
    let r2025Parcial: { rows: { dim: string; mes: number; valor: string }[] } = { rows: [] }
    if (cutDia > 0 && cutMes >= 1 && cutMes <= 12) {
      const q = await pool.query(`
        SELECT ${dimExpr} AS dim, mes,
          ROUND(SUM(ventas_valor)::numeric, 2) AS valor
        FROM mv_sellout_mensual
        WHERE ano = 2025 AND mes = ${cutMes} AND dia <= ${cutDia}
          ${paisCond} ${clienteCond} ${catCond} ${subcatCond}
          AND ${dimCol} IS NOT NULL AND ${dimCol} <> ''
        GROUP BY ${dimExpr}, mes
      `)
      r2025Parcial = q as any
    }
    // Merge parcial 2025 en el resultado principal
    r.rows.push(...r2025Parcial.rows.map(x => ({ ...x, ano: 2025 })))

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

    // Cutoff exacto ya calculado arriba (cutNum) — reutilizamos.
    const ultimoMes = cutMes || null
    const ultimoDia = cutDia || null

    return NextResponse.json({ rows, totals, meses, dim, ultimoMes, ultimoDia })
  } catch (err) {
    return handleApiError(err)
  }
}
