import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

export const dynamic = 'force-dynamic'

const MES: Record<number, string> = {
  1:'Ene', 2:'Feb', 3:'Mar', 4:'Abr', 5:'May', 6:'Jun',
  7:'Jul', 8:'Ago', 9:'Sep', 10:'Oct', 11:'Nov', 12:'Dic',
}

export async function GET(req: NextRequest) {
  try {
    const sp          = req.nextUrl.searchParams
    const anosParam   = sp.get('ano')       ? sp.get('ano')!.split(',').map(Number).filter(Boolean) : []
    const mesesParam  = sp.get('mes')       ? sp.get('mes')!.split(',').map(Number).filter(Boolean) : []
    const empresas    = sp.get('empresa')   ? sp.get('empresa')!.split(',').filter(Boolean)          : []
    const categorias  = sp.get('categoria') ? sp.get('categoria')!.split(',').filter(Boolean)        : []
    const paises      = sp.get('pais')      ? sp.get('pais')!.split(',').filter(Boolean)             : []
    const clientes    = sp.get('cliente')   ? sp.get('cliente')!.split(',').filter(Boolean)          : []

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

    // ── Ventas reales sellin (sin filtro de sub-categoría para real empresa-level) ─
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

    const realByEmpresa: Record<string, number> = {}
    const realByKey:     Record<string, number> = {}
    for (const r of realRows) {
      const empKey = `${r.ano}-${r.mes}-${r.empresa}`
      realByEmpresa[empKey] = (realByEmpresa[empKey] || 0) + (Number(r.valor_real) || 0)
      realByKey[`${r.ano}-${r.mes}-${r.empresa}-${r.pais}-${r.categoria}-${r.cliente_nombre?.toLowerCase().trim()}`] = Number(r.valor_real) || 0
    }

    // ── Años disponibles ─────────────────────────────────────────
    const { rows: anosRows } = await pool.query<{ ano: number }>(
      'SELECT DISTINCT ano FROM proyecciones ORDER BY ano'
    )
    const anos = anosRows.map(r => r.ano)

    // ── Cat-rows — filtrados por todos los params incluyendo categoria/pais/cliente ──
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
    // Sub-filtros: categoria, pais, cliente aplicados en el WHERE
    if (categorias.length) {
      cWhere.push(`categoria IN (${categorias.map(() => `$${ci++}`).join(',')})`)
      cParams.push(...categorias)
    }
    if (paises.length) {
      cWhere.push(`pais IN (${paises.map(() => `$${ci++}`).join(',')})`)
      cParams.push(...paises)
    }
    if (clientes.length) {
      cWhere.push(`cliente IN (${clientes.map(() => `$${ci++}`).join(',')})`)
      cParams.push(...clientes)
    }

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
      const byCliente  = realByKey[`${r.ano}-${r.mes}-${r.empresa}-${r.pais}-${r.categoria}-${r.cliente?.toLowerCase().trim()}`]
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

    // Synthetic: sellin sin proyección planificada, filtrado por los mismos sub-filtros
    const existingKeys = new Set(
      catDbRows.map(r => `${r.ano}-${r.mes}-${r.empresa}-${r.pais}-${r.categoria}-${r.cliente}`)
    )
    const syntheticRows = realRows
      .filter(r => !existingKeys.has(`${r.ano}-${r.mes}-${r.empresa}-${r.pais}-${r.categoria}-${r.cliente_nombre}`))
      .filter(r =>
        (!categorias.length || categorias.includes(r.categoria)) &&
        (!paises.length     || paises.includes(r.pais))          &&
        (!clientes.length   || clientes.includes(r.cliente_nombre))
      )
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

    // Manual real sum por empresa+mes (solo catRows con real_usd manual)
    const manualRealMap: Record<string, number> = {}
    for (const c of catDbRows) {
      if (c.real_usd === null) continue
      const k = `${c.ano}-${c.mes}-${c.empresa}`
      manualRealMap[k] = (manualRealMap[k] ?? 0) + Number(c.real_usd)
    }

    // ── Empresa-level rows para la tabla ─────────────────────────
    const rows = projRows.map(r => {
      const empresaKey       = `${r.ano}-${r.mes}-${r.empresa}`
      const valor_proyectado = Number(r.valor_usd)
      const sellinTotal      = realByEmpresa[empresaKey] ?? 0
      const valor_real       = sellinTotal > 0 ? sellinTotal : (manualRealMap[empresaKey] ?? 0)
      const diferencia       = valor_real - valor_proyectado
      const pct_cumplimiento = valor_proyectado > 0
        ? Math.round(valor_real / valor_proyectado * 1000) / 10
        : null
      return {
        ano: Number(r.ano), mes: Number(r.mes),
        mes_label: MES[Number(r.mes)] ?? String(r.mes),
        empresa: r.empresa, valor_proyectado, valor_real, diferencia, pct_cumplimiento,
      }
    })

    return NextResponse.json({ anos, rows, catRows: allCatRows })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('proyeccion error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
