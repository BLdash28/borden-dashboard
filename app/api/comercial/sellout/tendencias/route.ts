import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'
import { withCache, cacheHeaders } from '@/lib/db/cache'

export const dynamic = 'force-dynamic'

const MESES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const paises   = sp.get('pais')?.split(',').filter(Boolean)      ?? []
    const cats     = sp.get('categoria')?.split(',').filter(Boolean) ?? []
    const clientes = sp.get('cliente')?.split(',').filter(Boolean)   ?? []

    const conds: string[] = ['ano > 2000']
    const params: unknown[] = []
    let idx = 1

    if (paises.length === 1)    { conds.push(`pais = $${idx++}`);                                        params.push(paises[0]) }
    else if (paises.length > 1) { conds.push(`pais IN (${paises.map(() => `$${idx++}`).join(',')})`);   params.push(...paises) }

    if (cats.length === 1)    { conds.push(`INITCAP(LOWER(categoria)) = $${idx++}`);                                          params.push(cats[0]) }
    else if (cats.length > 1) { conds.push(`INITCAP(LOWER(categoria)) IN (${cats.map(() => `$${idx++}`).join(',')})`);       params.push(...cats) }

    if (clientes.length === 1)    { conds.push(`cliente ILIKE $${idx++}`);                                                               params.push(`%${clientes[0]}%`) }
    else if (clientes.length > 1) { conds.push(`(${clientes.map(() => `cliente ILIKE $${idx++}`).join(' OR ')})`);                      params.push(...clientes.map(c => `%${c}%`)) }

    const where = conds.join(' AND ')

    const cacheKey = `tend-v2:${sp.toString()}`
    const { data } = await withCache(cacheKey, async () => {
      const MV = 'mv_ventas_agg'

      const [mensualR, clienteR, paisR, catR, skuR, optsR, kpiR] = await Promise.all([
        // Mensual 2024/2025/2026
        pool.query(`
          SELECT ano, mes,
                 ROUND(SUM(ventas_valor)::numeric,2)    AS valor,
                 ROUND(SUM(ventas_unidades)::numeric,0) AS unidades
          FROM ${MV} WHERE ${where} AND ano IN (2024,2025,2026)
          GROUP BY ano, mes ORDER BY ano, mes
        `, params),

        // Por cliente — 2026 vs 2025
        pool.query(`
          SELECT cliente, ano,
                 ROUND(SUM(ventas_valor)::numeric,2)    AS valor,
                 ROUND(SUM(ventas_unidades)::numeric,0) AS unidades
          FROM ${MV} WHERE ${where} AND ano IN (2025,2026)
          GROUP BY cliente, ano ORDER BY cliente, ano
        `, params),

        // Por país — 2025 vs 2026
        pool.query(`
          SELECT pais, ano,
                 ROUND(SUM(ventas_valor)::numeric,2)    AS valor,
                 ROUND(SUM(ventas_unidades)::numeric,0) AS unidades
          FROM ${MV} WHERE ${where} AND ano IN (2025,2026)
          GROUP BY pais, ano ORDER BY pais, ano
        `, params),

        // Por categoría 2026
        pool.query(`
          SELECT INITCAP(LOWER(categoria)) AS categoria,
                 ROUND(SUM(ventas_valor)::numeric,2)    AS valor,
                 ROUND(SUM(ventas_unidades)::numeric,0) AS unidades
          FROM ${MV} WHERE ${where} AND ano = 2026
            AND categoria IS NOT NULL AND categoria != ''
          GROUP BY 1 ORDER BY valor DESC LIMIT 12
        `, params),

        // Top 10 SKUs por codigo_barras 2026 vs 2025
        pool.query(`
          SELECT m.codigo_barras,
                 MAX(m.sku) AS sku,
                 MAX(m.descripcion) AS descripcion,
                 MIN(m.categoria) AS categoria,
                 ROUND(SUM(CASE WHEN m.ano=2026 THEN m.ventas_valor    ELSE 0 END)::numeric,2) AS valor_2026,
                 ROUND(SUM(CASE WHEN m.ano=2025 THEN m.ventas_valor    ELSE 0 END)::numeric,2) AS valor_2025,
                 ROUND(SUM(CASE WHEN m.ano=2026 THEN m.ventas_unidades ELSE 0 END)::numeric,0) AS uds_2026,
                 ROUND(SUM(CASE WHEN m.ano=2025 THEN m.ventas_unidades ELSE 0 END)::numeric,0) AS uds_2025
          FROM (SELECT codigo_barras, sku, descripcion, categoria, ano, ventas_valor, ventas_unidades
                FROM mv_sellout_mensual
                WHERE ${where} AND ano IN (2025,2026)
                  AND codigo_barras IS NOT NULL AND codigo_barras != '') m
          GROUP BY m.codigo_barras
          ORDER BY valor_2026 DESC LIMIT 10
        `, params),

        // Filter options
        pool.query(`
          SELECT
            array_agg(DISTINCT cliente   ORDER BY cliente)   FILTER (WHERE cliente   IS NOT NULL AND cliente   != '') AS clientes,
            array_agg(DISTINCT pais      ORDER BY pais)      FILTER (WHERE pais      IS NOT NULL)                     AS paises,
            array_agg(DISTINCT INITCAP(LOWER(categoria)) ORDER BY INITCAP(LOWER(categoria)))
              FILTER (WHERE categoria IS NOT NULL AND categoria != '') AS categorias
          FROM ${MV} WHERE ano > 2000
        `, []),

        // KPI: YTD 2025 vs 2026 (up to last month with data in 2026)
        pool.query(`
          WITH max_mes_26 AS (SELECT COALESCE(MAX(mes),0) AS m FROM ${MV} WHERE ano=2026 AND ${where})
          SELECT ano,
                 ROUND(SUM(ventas_valor)::numeric,2)    AS valor,
                 ROUND(SUM(ventas_unidades)::numeric,0) AS uds
          FROM ${MV}, max_mes_26
          WHERE ${where} AND ano IN (2025,2026) AND mes <= max_mes_26.m
          GROUP BY ano
        `, params),
      ])

      // ── Pivot mensual ──────────────────────────────────────────
      const byMes: Record<number, any> = {}
      for (let m = 1; m <= 12; m++) byMes[m] = { mes: m, mes_label: MESES[m], '2024': null, '2025': null, '2026': null }
      for (const r of mensualR.rows) {
        const m = parseInt(r.mes)
        if (byMes[m]) byMes[m][String(r.ano)] = parseFloat(r.valor)
      }
      const mensual = Object.values(byMes)

      // ── YTD acumulado ──────────────────────────────────────────
      // Para cada año calculamos el último mes con datos reales; después de ese
      // mes devolvemos null → la línea se corta en lugar de quedar plana.
      const ultMesPorAno: Record<string, number> = { '2024': 0, '2025': 0, '2026': 0 }
      for (const ano of ['2024', '2025', '2026']) {
        for (let j = 1; j <= 12; j++) {
          if (byMes[j][ano] !== null) ultMesPorAno[ano] = j
        }
      }
      const ytdRows = Array.from({ length: 12 }, (_, i) => {
        const m = i + 1
        const row: any = { mes: m, mes_label: MESES[m] }
        for (const ano of ['2024', '2025', '2026']) {
          if (m > ultMesPorAno[ano]) { row[ano] = null; continue }
          let acc = 0
          for (let j = 1; j <= m; j++) {
            const v = byMes[j][ano]
            if (v !== null) acc += v
          }
          row[ano] = acc
        }
        return row
      })

      // ── Por cliente pivot ──────────────────────────────────────
      const cliMap: Record<string, any> = {}
      for (const r of clienteR.rows) {
        if (!cliMap[r.cliente]) cliMap[r.cliente] = { cliente: r.cliente, valor_2025: 0, valor_2026: 0, uds_2025: 0, uds_2026: 0 }
        cliMap[r.cliente][`valor_${r.ano}`] = parseFloat(r.valor)
        cliMap[r.cliente][`uds_${r.ano}`]   = parseFloat(r.unidades)
      }
      const porCliente = Object.values(cliMap)
        .map((c: any) => ({
          ...c,
          var_pct: c.valor_2025 > 0 ? ((c.valor_2026 - c.valor_2025) / c.valor_2025) * 100 : null,
        }))
        .sort((a: any, b: any) => b.valor_2026 - a.valor_2026)

      // ── Por país pivot ─────────────────────────────────────────
      const paisMap: Record<string, any> = {}
      for (const r of paisR.rows) {
        if (!paisMap[r.pais]) paisMap[r.pais] = { pais: r.pais, valor_2025: 0, valor_2026: 0, uds_2025: 0, uds_2026: 0 }
        paisMap[r.pais][`valor_${r.ano}`] = parseFloat(r.valor)
        paisMap[r.pais][`uds_${r.ano}`]   = parseFloat(r.unidades)
      }
      const porPais = Object.values(paisMap)
        .map((p: any) => ({
          ...p,
          var_pct: p.valor_2025 > 0 ? ((p.valor_2026 - p.valor_2025) / p.valor_2025) * 100 : null,
        }))
        .sort((a: any, b: any) => b.valor_2026 - a.valor_2026)

      // ── KPIs ───────────────────────────────────────────────────
      const k26 = kpiR.rows.find((r: any) => parseInt(r.ano) === 2026) ?? { valor: 0, uds: 0 }
      const k25 = kpiR.rows.find((r: any) => parseInt(r.ano) === 2025) ?? { valor: 0, uds: 0 }
      const v26 = parseFloat(k26.valor), v25 = parseFloat(k25.valor)
      const u26 = parseFloat(k26.uds),   u25 = parseFloat(k25.uds)

      // ── Top SKUs ───────────────────────────────────────────────
      const topSkus = skuR.rows.map((r: any) => {
        const v6 = parseFloat(r.valor_2026 || 0), v5 = parseFloat(r.valor_2025 || 0)
        const u6 = parseFloat(r.uds_2026   || 0), u5 = parseFloat(r.uds_2025   || 0)
        return {
          codigo_barras: r.codigo_barras,
          sku:           r.sku,
          descripcion:   r.descripcion?.slice(0, 38),
          categoria:     r.categoria,
          valor_2026:    v6,
          valor_2025:    v5,
          uds_2026:      u6,
          uds_2025:      u5,
          var_pct:       v5 > 0 ? ((v6 - v5) / v5) * 100 : null,
          var_uds_pct:   u5 > 0 ? ((u6 - u5) / u5) * 100 : null,
        }
      })

      return {
        kpis: {
          valor_26:      v26,
          valor_25:      v25,
          uds_26:        u26,
          uds_25:        u25,
          var_valor_pct: v25 > 0 ? ((v26 - v25) / v25) * 100 : null,
          var_uds_pct:   u25 > 0 ? ((u26 - u25) / u25) * 100 : null,
        },
        mensual,
        ytd:           ytdRows,
        por_cliente:   porCliente,
        por_pais:      porPais,
        por_categoria: catR.rows.map((r: any) => ({ categoria: r.categoria, valor: parseFloat(r.valor), unidades: parseFloat(r.unidades) })),
        top_skus:      topSkus,
        opciones:      optsR.rows[0] ?? {},
      }
    }, 30 * 60_000)

    return NextResponse.json(data, { headers: cacheHeaders(300) })
  } catch (err) {
    return handleApiError(err)
  }
}
