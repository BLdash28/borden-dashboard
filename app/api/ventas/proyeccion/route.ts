import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

export const dynamic = 'force-dynamic'

const MES: Record<number, string> = {
  1:'Ene', 2:'Feb', 3:'Mar', 4:'Abr', 5:'May', 6:'Jun',
  7:'Jul', 8:'Ago', 9:'Sep', 10:'Oct', 11:'Nov', 12:'Dic',
}

export async function GET(req: NextRequest) {
  try {
    const sp      = req.nextUrl.searchParams
    const ano     = sp.get('ano')     || ''
    const mes     = sp.get('mes')     || ''
    const empresa = sp.get('empresa') || ''

    const modo: 'mes' | 'ano' | 'todos' =
      ano && mes ? 'mes' : ano ? 'ano' : 'todos'

    // ── Proyecciones (nivel empresa, sin desglose de categoría) ─
    const pWhere: string[] = ['categoria IS NULL']
    const pParams: unknown[] = []
    let pi = 1

    if (empresa) {
      pWhere.push(`empresa = $${pi++}`)
      pParams.push(empresa)
    } else {
      pWhere.push(`empresa IN ('LICENCIAMIENTO', 'BL FOODS')`)
    }
    if (ano) { pWhere.push(`ano = $${pi++}`); pParams.push(Number(ano)) }
    if (mes) { pWhere.push(`mes = $${pi++}`); pParams.push(Number(mes)) }

    const { rows: projRows } = await pool.query<{
      ano: string; mes: string; empresa: string; valor_usd: string
    }>(`
      SELECT ano, mes, empresa, valor_usd
      FROM proyecciones
      WHERE ${pWhere.join(' AND ')}
      ORDER BY mes ASC, empresa ASC
    `, pParams)

    // ── Ventas reales (BL FOODS — fact_sales_sellout) ────────────
    const rWhere: string[] = ["categoria IN ('Leches', 'Quesos')"]
    const rParams: unknown[] = []
    let ri = 1
    if (ano) { rWhere.push(`ano = $${ri++}`); rParams.push(Number(ano)) }
    if (mes) { rWhere.push(`mes = $${ri++}`); rParams.push(Number(mes)) }

    const { rows: realRows } = await pool.query<{
      ano: string; mes: string; pais: string; categoria: string; valor_real: string
    }>(`
      SELECT ano, mes, pais, categoria, SUM(ventas_valor) AS valor_real
      FROM fact_sales_sellout
      WHERE ${rWhere.join(' AND ')}
      GROUP BY ano, mes, pais, categoria
    `, rParams)

    // realMap total: "<ano>-<mes>" → valor_real
    // realByPaisCat: "<ano>-<mes>-<pais>-<cat>" → valor_real
    const realMap: Record<string, number> = {}
    const realByPaisCat: Record<string, number> = {}
    for (const r of realRows) {
      const key = `${r.ano}-${r.mes}`
      realMap[key] = (realMap[key] || 0) + (Number(r.valor_real) || 0)
      realByPaisCat[`${r.ano}-${r.mes}-${r.pais}-${r.categoria}`] = Number(r.valor_real) || 0
    }

    // ── Años disponibles ─────────────────────────────────────────
    const { rows: anosRows } = await pool.query<{ ano: number }>(
      'SELECT DISTINCT ano FROM proyecciones ORDER BY ano'
    )
    const anos = anosRows.map(r => r.ano)

    // ── Cat-rows (LICENCIAMIENTO + BL FOODS breakdown) ────────────
    const cWhere: string[] = ['categoria IS NOT NULL']
    const cParams: unknown[] = []
    let ci = 1
    if (empresa) { cWhere.push(`empresa = $${ci++}`); cParams.push(empresa) }
    else         { cWhere.push(`empresa IN ('LICENCIAMIENTO', 'BL FOODS')`) }
    if (ano) { cWhere.push(`ano = $${ci++}`); cParams.push(Number(ano)) }
    if (mes) { cWhere.push(`mes = $${ci++}`); cParams.push(Number(mes)) }

    const { rows: catDbRows } = await pool.query<{
      id: string; ano: string; mes: string; empresa: string
      categoria: string; pais: string; cliente: string
      valor_usd: string; real_usd: string | null
    }>(`
      SELECT id, ano, mes, empresa, categoria, pais, cliente, valor_usd, real_usd
      FROM proyecciones
      WHERE ${cWhere.join(' AND ')}
      ORDER BY mes ASC, empresa ASC, categoria ASC, pais ASC, cliente ASC
    `, cParams)

    const catRows = catDbRows.map(r => {
      // real_usd manual tiene prioridad; si es null, buscar en fact_sales_sellout por pais+categoria
      const selloutReal = realByPaisCat[`${r.ano}-${r.mes}-${r.pais}-${r.categoria}`] ?? null
      const real_usd    = r.real_usd !== null ? Number(r.real_usd) : selloutReal
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

    // ── Mapa de real_usd manual por empresa+mes (suma de cat rows) ───
    const manualRealMap: Record<string, number> = {}
    for (const c of catDbRows) {
      if (c.real_usd === null) continue
      const k = `${c.ano}-${c.mes}-${c.empresa}`
      manualRealMap[k] = (manualRealMap[k] ?? 0) + Number(c.real_usd)
    }

    // ── Combinar empresa-level rows ───────────────────────────────
    const rows = projRows.map(r => {
      const key              = `${r.ano}-${r.mes}`
      const empresaKey       = `${r.ano}-${r.mes}-${r.empresa}`
      const valor_proyectado = Number(r.valor_usd)
      // BL FOODS: sellout real; LICENCIAMIENTO: suma manual de cat rows
      const valor_real =
        r.empresa === 'BL FOODS'
          ? (realMap[key] ?? 0) || (manualRealMap[empresaKey] ?? 0)
          : (manualRealMap[empresaKey] ?? 0)
      const diferencia       = valor_real - valor_proyectado
      const pct_cumplimiento = valor_proyectado > 0
        ? Math.round(valor_real / valor_proyectado * 1000) / 10
        : null

      return {
        ano:              Number(r.ano),
        mes:              Number(r.mes),
        mes_label:        MES[Number(r.mes)] ?? String(r.mes),
        empresa:          r.empresa,
        valor_proyectado,
        valor_real,
        diferencia,
        pct_cumplimiento,
      }
    })

    return NextResponse.json({ modo, anos, rows, catRows })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('proyeccion error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
