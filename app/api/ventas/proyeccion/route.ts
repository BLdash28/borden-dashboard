import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

export const dynamic = 'force-dynamic'

const MES: Record<number, string> = {
  1:'Ene', 2:'Feb', 3:'Mar', 4:'Abr', 5:'May', 6:'Jun',
  7:'Jul', 8:'Ago', 9:'Sep', 10:'Oct', 11:'Nov', 12:'Dic',
}

const inNums = (col: string, vals: number[]) =>
  `${col} IN (${vals.join(',')})`

const inStrs = (col: string, vals: string[]) =>
  `${col} IN (${vals.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams

    const anosArr  = (sp.get('ano')     || '').split(',').map(Number).filter(Boolean)
    const mesesArr = (sp.get('mes')     || '').split(',').map(Number).filter(Boolean)
    const empArr   = (sp.get('empresa') || '').split(',').filter(Boolean)

    // ── Proyecciones nivel empresa (categoria IS NULL) ────────────
    const pWhere: string[] = ['categoria IS NULL', `empresa IN ('LICENCIAMIENTO', 'BL FOODS')`]
    if (anosArr.length)  pWhere.push(inNums('ano', anosArr))
    if (mesesArr.length) pWhere.push(inNums('mes', mesesArr))
    if (empArr.length)   pWhere.push(inStrs('empresa', empArr))

    const { rows: projRows } = await pool.query<{
      ano: string; mes: string; empresa: string; valor_usd: string
    }>(`
      SELECT ano, mes, empresa, valor_usd
      FROM proyecciones
      WHERE ${pWhere.join(' AND ')}
      ORDER BY mes ASC, empresa ASC
    `)

    // ── Ventas reales desde fact_sales_sellin ─────────────────────
    const rWhere: string[] = []
    if (anosArr.length)  rWhere.push(inNums('ano', anosArr))
    if (mesesArr.length) rWhere.push(inNums('mes', mesesArr))
    const rWhereSql = rWhere.length ? 'WHERE ' + rWhere.join(' AND ') : ''

    const { rows: realRows } = await pool.query<{
      ano: string; mes: string; pais: string; categoria: string
      empresa: string; valor_real: string
    }>(`
      SELECT
        ano, mes, pais, categoria,
        CASE WHEN tipo_negocio LIKE 'LICENCIAMIENTO%' THEN 'LICENCIAMIENTO' ELSE 'BL FOODS' END AS empresa,
        SUM(venta_neta) AS valor_real
      FROM fact_sales_sellin
      ${rWhereSql}
      GROUP BY ano, mes, pais, categoria, empresa
    `)

    // Mapas de real: por empresa-mes y por empresa-mes-pais-cat
    const realByEmpresa:  Record<string, number> = {}
    const realByPaisCat:  Record<string, number> = {}
    for (const r of realRows) {
      const eKey = `${r.ano}-${r.mes}-${r.empresa}`
      realByEmpresa[eKey] = (realByEmpresa[eKey] ?? 0) + Number(r.valor_real)
      realByPaisCat[`${r.ano}-${r.mes}-${r.empresa}-${r.pais}-${r.categoria}`] = Number(r.valor_real)
    }

    // ── Años disponibles ──────────────────────────────────────────
    const { rows: anosRows } = await pool.query<{ ano: number }>(
      'SELECT DISTINCT ano FROM proyecciones ORDER BY ano'
    )
    const anos = anosRows.map(r => r.ano)

    // ── Cat-rows (desglose por categoría / país / cliente) ────────
    const cWhere: string[] = ['categoria IS NOT NULL', `empresa IN ('LICENCIAMIENTO', 'BL FOODS')`]
    if (anosArr.length)  cWhere.push(inNums('ano', anosArr))
    if (mesesArr.length) cWhere.push(inNums('mes', mesesArr))
    if (empArr.length)   cWhere.push(inStrs('empresa', empArr))

    const { rows: catDbRows } = await pool.query<{
      id: string; ano: string; mes: string; empresa: string
      categoria: string; pais: string; cliente: string
      valor_usd: string; real_usd: string | null
    }>(`
      SELECT id, ano, mes, empresa, categoria, pais, cliente, valor_usd, real_usd
      FROM proyecciones
      WHERE ${cWhere.join(' AND ')}
      ORDER BY mes ASC, empresa ASC, categoria ASC, pais ASC, cliente ASC
    `)

    // Mapa de real_usd manual por empresa-mes (suma)
    const manualRealMap: Record<string, number> = {}
    for (const c of catDbRows) {
      if (c.real_usd === null) continue
      const k = `${c.ano}-${c.mes}-${c.empresa}`
      manualRealMap[k] = (manualRealMap[k] ?? 0) + Number(c.real_usd)
    }

    const catRows = catDbRows.map(r => {
      // Manual tiene prioridad; si null, usar fact_sales_sellin por pais+categoria
      const sellinReal = realByPaisCat[`${r.ano}-${r.mes}-${r.empresa}-${r.pais}-${r.categoria}`] ?? null
      const real_usd   = r.real_usd !== null ? Number(r.real_usd) : sellinReal
      return {
        id:               Number(r.id),
        ano:              Number(r.ano),
        mes:              Number(r.mes),
        mes_label:        MES[Number(r.mes)] ?? String(r.mes),
        empresa:          r.empresa,
        categoria:        r.categoria,
        pais:             r.pais    ?? '',
        cliente:          r.cliente ?? '',
        valor_proyectado: Number(r.valor_usd),
        real_usd,
      }
    })

    // ── Combinar filas empresa-level ──────────────────────────────
    const rows = projRows.map(r => {
      const empresaKey       = `${r.ano}-${r.mes}-${r.empresa}`
      const valor_proyectado = Number(r.valor_usd)
      const valor_real       = (realByEmpresa[empresaKey] ?? 0) || (manualRealMap[empresaKey] ?? 0)
      const diferencia       = valor_real - valor_proyectado
      const pct_cumplimiento = valor_proyectado > 0
        ? Math.round(valor_real / valor_proyectado * 1000) / 10
        : null
      return {
        ano:  Number(r.ano),
        mes:  Number(r.mes),
        mes_label:        MES[Number(r.mes)] ?? String(r.mes),
        empresa:          r.empresa,
        valor_proyectado,
        valor_real,
        diferencia,
        pct_cumplimiento,
      }
    })

    return NextResponse.json({ anos, rows, catRows })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('proyeccion error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
