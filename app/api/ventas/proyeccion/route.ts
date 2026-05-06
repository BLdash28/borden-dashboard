import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

export const dynamic = 'force-dynamic'

const MES: Record<number, string> = {
  1:'Ene', 2:'Feb', 3:'Mar', 4:'Abr', 5:'May', 6:'Jun',
  7:'Jul', 8:'Ago', 9:'Sep', 10:'Oct', 11:'Nov', 12:'Dic',
}

export async function GET(req: NextRequest) {
  try {
    const sp         = req.nextUrl.searchParams
    const anosParam  = sp.get('ano')     ? sp.get('ano')!.split(',').map(Number).filter(Boolean)  : []
    const mesesParam = sp.get('mes')     ? sp.get('mes')!.split(',').map(Number).filter(Boolean)  : []
    const empresas   = sp.get('empresa') ? sp.get('empresa')!.split(',').filter(Boolean)           : []

    const inNums = (col: string, vals: number[]) => `${col} IN (${vals.join(',')})`

    // ── Proyecciones nivel empresa ────────────────────────────────
    const pWhere: string[] = ['categoria IS NULL']
    const pParams: unknown[] = []
    let pi = 1

    if (empresas.length) {
      pWhere.push(`empresa IN (${empresas.map(() => `$${pi++}`).join(',')})`)
      pParams.push(...empresas)
    } else {
      pWhere.push(`empresa IN ('LICENCIAMIENTO', 'BL FOODS')`)
    }
    if (anosParam.length)  pWhere.push(inNums('ano', anosParam))
    if (mesesParam.length) pWhere.push(inNums('mes', mesesParam))

    const { rows: projRows } = await pool.query<{
      ano: string; mes: string; empresa: string; valor_usd: string
    }>(`
      SELECT ano, mes, empresa, valor_usd
      FROM proyecciones
      WHERE ${pWhere.join(' AND ')}
      ORDER BY mes ASC, empresa ASC
    `, pParams)

    // ── Ventas reales (fact_sales_sellin — todas las categorías) ─
    const rWhere: string[] = ['venta_neta > 0']
    if (anosParam.length)  rWhere.push(inNums('ano', anosParam))
    if (mesesParam.length) rWhere.push(inNums('mes', mesesParam))

    const { rows: realRows } = await pool.query<{
      ano: string; mes: string; pais: string; categoria: string; cliente_nombre: string; empresa: string; valor_real: string
    }>(`
      SELECT
        ano, mes, pais, categoria, cliente_nombre,
        CASE WHEN tipo_negocio = 'REGULAR' THEN 'BL FOODS' ELSE 'LICENCIAMIENTO' END AS empresa,
        SUM(venta_neta) AS valor_real
      FROM fact_sales_sellin
      WHERE ${rWhere.join(' AND ')}
      GROUP BY ano, mes, pais, categoria, cliente_nombre,
        CASE WHEN tipo_negocio = 'REGULAR' THEN 'BL FOODS' ELSE 'LICENCIAMIENTO' END
    `)

    // realByEmpresa: total sellin por empresa+mes (empresa-level real)
    // realByKey: por empresa+pais+categoria+cliente para catRows
    // realByPaisCat: por empresa+pais+categoria (para sintéticos sin cliente específico)
    const realByEmpresa: Record<string, number> = {}
    const realByKey: Record<string, number> = {}
    const realByPaisCat: Record<string, number> = {}
    for (const r of realRows) {
      const empKey = `${r.ano}-${r.mes}-${r.empresa}`
      realByEmpresa[empKey] = (realByEmpresa[empKey] || 0) + (Number(r.valor_real) || 0)
      realByKey[`${r.ano}-${r.mes}-${r.empresa}-${r.pais}-${r.categoria}-${r.cliente_nombre}`] = Number(r.valor_real) || 0
      const pcKey = `${r.ano}-${r.mes}-${r.empresa}-${r.pais}-${r.categoria}`
      realByPaisCat[pcKey] = (realByPaisCat[pcKey] || 0) + (Number(r.valor_real) || 0)
    }

    // ── Años disponibles ─────────────────────────────────────────
    const { rows: anosRows } = await pool.query<{ ano: number }>(
      'SELECT DISTINCT ano FROM proyecciones ORDER BY ano'
    )
    const anos = anosRows.map(r => r.ano)

    // ── Cat-rows detalle ─────────────────────────────────────────
    const cWhere: string[] = ['categoria IS NOT NULL']
    const cParams: unknown[] = []
    let ci = 1
    if (empresas.length) {
      cWhere.push(`empresa IN (${empresas.map(() => `$${ci++}`).join(',')})`)
      cParams.push(...empresas)
    } else {
      cWhere.push(`empresa IN ('LICENCIAMIENTO', 'BL FOODS')`)
    }
    if (anosParam.length)  cWhere.push(inNums('ano', anosParam))
    if (mesesParam.length) cWhere.push(inNums('mes', mesesParam))

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
      // match exacto por cliente; si no hay sellin para ese cliente, real = null
      const byCliente = realByKey[`${r.ano}-${r.mes}-${r.empresa}-${r.pais}-${r.categoria}-${r.cliente}`]
      const sellinReal = byCliente ?? null
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
        synthetic:        false,
      }
    })

    // Agregar filas de sellin que no tienen catRow proyectado (no fueron planeadas)
    const existingKeys = new Set(
      catDbRows.map(r => `${r.ano}-${r.mes}-${r.empresa}-${r.pais}-${r.categoria}-${r.cliente}`)
    )
    const syntheticRows = realRows
      .filter(r => !existingKeys.has(`${r.ano}-${r.mes}-${r.empresa}-${r.pais}-${r.categoria}-${r.cliente_nombre}`))
      .map(r => ({
        id:               null as null,
        ano:              Number(r.ano),
        mes:              Number(r.mes),
        mes_label:        MES[Number(r.mes)] ?? String(r.mes),
        empresa:          r.empresa,
        categoria:        r.categoria,
        pais:             r.pais ?? '',
        cliente:          r.cliente_nombre ?? '',
        valor_proyectado: 0,
        real_usd:         Number(r.valor_real) || 0,
        synthetic:        true,
      }))

    const allCatRows = [...catRows, ...syntheticRows].sort((a, b) =>
      a.mes - b.mes ||
      a.empresa.localeCompare(b.empresa) ||
      a.categoria.localeCompare(b.categoria) ||
      a.pais.localeCompare(b.pais)
    )

    // Manual real_usd sum por empresa+mes
    const manualRealMap: Record<string, number> = {}
    for (const c of catDbRows) {
      if (c.real_usd === null) continue
      const k = `${c.ano}-${c.mes}-${c.empresa}`
      manualRealMap[k] = (manualRealMap[k] ?? 0) + Number(c.real_usd)
    }

    // ── Empresa-level rows ────────────────────────────────────────
    const rows = projRows.map(r => {
      const empresaKey       = `${r.ano}-${r.mes}-${r.empresa}`
      const valor_proyectado = Number(r.valor_usd)
      const sellinTotal      = realByEmpresa[empresaKey] ?? 0
      // Usar sellin si hay datos; si no (ej. LICENCIAMIENTO), usar suma manual de catRows
      const valor_real = sellinTotal > 0
        ? sellinTotal
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

    return NextResponse.json({ anos, rows, catRows: allCatRows })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('proyeccion error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
