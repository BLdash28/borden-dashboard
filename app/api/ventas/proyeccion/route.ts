import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

export const revalidate = 300

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

    // Fuente por defecto: REVISION (la Cuota). Si no existe REVISION para el filtro,
    // el cliente puede pedir ORIGINAL. Se acepta `?fuente=ORIGINAL|REVISION`.
    const fuenteSolicitada = (sp.get('fuente') ?? 'REVISION').toUpperCase()
    const fuente           = fuenteSolicitada === 'ORIGINAL' ? 'ORIGINAL' : 'REVISION'

    // ── Proyecciones nivel empresa ────────────────────────────────
    // Para ORIGINAL: existen filas con categoria IS NULL (empresa-level).
    // Para REVISION: solo hay cat-level → sintetizamos SUMando por empresa.
    const pWhere: string[] = []
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
    // Sub-filtros aplican al agregar cat-level (para REVISION) — no rompen ORIGINAL
    // porque en ORIGINAL empresa-level la fila no tiene categoria/pais/cliente.
    if (fuente === 'REVISION') {
      if (categorias.length) {
        pWhere.push(`categoria IN (${categorias.map(() => `$${pi++}`).join(',')})`)
        pParams.push(...categorias)
      }
      if (paises.length) {
        pWhere.push(`pais IN (${paises.map(() => `$${pi++}`).join(',')})`)
        pParams.push(...paises)
      }
      if (clientes.length) {
        pWhere.push(`cliente IN (${clientes.map(() => `$${pi++}`).join(',')})`)
        pParams.push(...clientes)
      }
    }

    const projSql = fuente === 'ORIGINAL'
      ? `
        SELECT ano, mes, empresa, valor_usd
        FROM proyecciones
        WHERE tipo='ORIGINAL' AND categoria IS NULL AND ${pWhere.join(' AND ')}
        ORDER BY mes ASC, empresa ASC
      `
      : `
        SELECT ano, mes, empresa, SUM(valor_usd)::numeric AS valor_usd
        FROM proyecciones
        WHERE tipo='REVISION' AND categoria IS NOT NULL AND ${pWhere.join(' AND ')}
        GROUP BY ano, mes, empresa
        ORDER BY mes ASC, empresa ASC
      `
    const { rows: projRows } = await pool.query<{
      ano: string; mes: string; empresa: string; valor_usd: string
    }>(projSql, pParams)

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

    // ── Cat-rows — filtrados por todos los params, tipo = fuente ──
    const cWhere: string[] = ['categoria IS NOT NULL', `tipo = '${fuente}'`]
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

    // ── Otras proyecciones (tipo != fuente) — totales por tipo ─────────────────
    // Aplica los mismos filtros de contexto (empresas/ano/mes/categoria/pais/cliente).
    // Restringimos a cat-level para evitar doble conteo (las filas empresa-level
    // suman lo mismo que la agregación de cat-level en la tabla `proyecciones`).
    const oWhere: string[] = [`tipo <> '${fuente}'`, 'categoria IS NOT NULL']
    const oParams: unknown[] = []
    let oi = 1
    if (empresas.length) {
      oWhere.push(`empresa IN (${empresas.map(() => `$${oi++}`).join(',')})`)
      oParams.push(...empresas)
    } else {
      oWhere.push(`empresa IN ('LICENCIAMIENTO', 'BL FOODS')`)
    }
    if (anosParam.length)  oWhere.push(inNums('ano', anosParam))
    if (mesesParam.length) oWhere.push(inNums('mes', mesesParam))
    if (categorias.length) {
      oWhere.push(`(categoria IS NULL OR categoria IN (${categorias.map(() => `$${oi++}`).join(',')}))`)
      oParams.push(...categorias)
    }
    if (paises.length) {
      oWhere.push(`(pais IS NULL OR pais IN (${paises.map(() => `$${oi++}`).join(',')}))`)
      oParams.push(...paises)
    }
    if (clientes.length) {
      oWhere.push(`(cliente IS NULL OR cliente IN (${clientes.map(() => `$${oi++}`).join(',')}))`)
      oParams.push(...clientes)
    }

    const { rows: otrasRows } = await pool.query<{ tipo: string; total: string; meses: string }>(`
      SELECT tipo,
             SUM(valor_usd)::numeric AS total,
             COUNT(DISTINCT mes)::int AS meses
      FROM proyecciones
      WHERE ${oWhere.join(' AND ')}
      GROUP BY tipo
      ORDER BY tipo
    `, oParams)

    // Breakdown mensual por tipo — permite calcular YTD del lado del cliente
    const { rows: otrasMensualRows } = await pool.query<{ tipo: string; mes: string; total: string }>(`
      SELECT tipo, mes, SUM(valor_usd)::numeric AS total
      FROM proyecciones
      WHERE ${oWhere.join(' AND ')}
      GROUP BY tipo, mes
      ORDER BY tipo, mes
    `, oParams)

    const mensualPorTipo: Record<string, Record<number, number>> = {}
    for (const r of otrasMensualRows) {
      if (!mensualPorTipo[r.tipo]) mensualPorTipo[r.tipo] = {}
      mensualPorTipo[r.tipo][Number(r.mes)] = Number(r.total ?? 0)
    }

    const otras_proyecciones = otrasRows.map(r => ({
      tipo:    r.tipo,
      total:   Number(r.total ?? 0),
      meses:   Number(r.meses ?? 0),
      mensual: mensualPorTipo[r.tipo] ?? {},
    }))

    return NextResponse.json({ anos, rows, catRows: allCatRows, otras_proyecciones })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('proyeccion error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
