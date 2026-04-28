import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError, AppError } from '@/lib/api/errors'
import { VentasResumenQuerySchema, parsePaisList } from '@/lib/validation/ventas'
import { getUserRestrictions } from '@/lib/auth/restrictions'
import { withCache, cacheHeaders } from '@/lib/db/cache'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {

    const raw = Object.fromEntries(new URL(req.url).searchParams)
    const parsed = VentasResumenQuerySchema.safeParse(raw)
    if (!parsed.success) {
      throw new AppError(400, parsed.error.message, 'Invalid query parameters')
    }

    const {
      tipo, ano: anoP, mes: mesP, todos: todosP,
      pais, categoria, cliente, sku,
      anos: anosP, meses: mesesP, paises: paisesP, categorias: catsP,
    } = parsed.data

    // ── Periods listing (no per-user restrictions needed) ────────
    if (tipo === 'periodos') {
      const { data: periodos } = await withCache(
        'periodos-v5',
        async () => {
          const r = await pool.query(
            'SELECT ano, mes, COUNT(DISTINCT pais) AS n_paises, COUNT(*) AS filas, ' +
            'ROUND(SUM(ventas_valor)::numeric,0) AS valor_usd ' +
            'FROM mv_sellout_mensual WHERE ano > 2000 ' +
            'GROUP BY ano, mes ORDER BY ano DESC, mes DESC'
          )
          return r.rows
        },
        10 * 60_000 // 10 min TTL — periods list rarely changes
      )
      return NextResponse.json({ periodos }, { headers: cacheHeaders(600) })
    }

    // ── Parse multi-select arrays ────────────────────────────────
    const anosArr  = anosP  ? anosP.split(',').map(Number).filter(n => n > 2000 && n < 2100) : []
    const mesesArr = mesesP ? mesesP.split(',').map(Number).filter(n => n >= 1 && n <= 12)   : []
    const paisesArr = parsePaisList(paisesP)
    const catsArr   = catsP ? catsP.split(',').map(s => s.trim()).filter(Boolean) : []

    // ── Per-user country restrictions ────────────────────────────
    const restrictions = await getUserRestrictions().catch(() => null)

    // ── Determine mode ───────────────────────────────────────────
    const modoTodos = todosP === '1'
    let anoQ: number | null = anoP ?? null
    let mesQ: number | null = mesP ?? null
    let modo: 'todos' | 'ano' | 'mes' | 'multi' = 'mes'

    if (modoTodos) {
      anoQ = null; mesQ = null; modo = 'todos'
    } else if (anosArr.length > 0 || mesesArr.length > 0) {
      anoQ = null; mesQ = null
      modo = (anosArr.length === 1 && mesesArr.length === 1) ? 'mes'
           : anosArr.length > 0                              ? 'ano'
           : 'multi'
    } else if (anoQ && !mesQ) {
      modo = 'ano'
    } else if (!anoQ && !mesQ) {
      // Default: show all data (no time restriction)
      modo = 'todos'
    }

    // ── Build WHERE ──────────────────────────────────────────────
    const conds: string[] = []
    const params: unknown[] = []
    let idx = 1

    if (anoQ && anosArr.length === 0)  { conds.push(`ano = $${idx++}`); params.push(anoQ) }
    if (mesQ && mesesArr.length === 0) { conds.push(`mes = $${idx++}`); params.push(mesQ) }

    if (anosArr.length === 1 && mesesArr.length === 1) {
      conds.push(`ano = $${idx++}`); params.push(anosArr[0])
      conds.push(`mes = $${idx++}`); params.push(mesesArr[0])
      anoQ = anosArr[0]; mesQ = mesesArr[0]
    } else {
      if (anosArr.length > 0) {
        conds.push(`ano IN (${anosArr.map(() => `$${idx++}`).join(',')})`); params.push(...anosArr)
      }
      if (mesesArr.length > 0) {
        conds.push(`mes IN (${mesesArr.map(() => `$${idx++}`).join(',')})`); params.push(...mesesArr)
      }
    }

    // País — intersect with user's allowed countries when restricted
    const effectivePaises = paisesArr.length > 0 ? paisesArr : parsePaisList(pais)
    if (restrictions?.isRestricted && restrictions.paises.length > 0) {
      const allowed = restrictions.paises
      const filtered = effectivePaises.length > 0
        ? effectivePaises.filter(p => allowed.includes(p))
        : allowed
      if (filtered.length > 0) {
        const ph = filtered.map(() => `$${idx++}`).join(', ')
        conds.push(`pais IN (${ph})`); params.push(...filtered)
      }
    } else if (effectivePaises.length === 1) {
      conds.push(`pais = $${idx++}`); params.push(effectivePaises[0])
    } else if (effectivePaises.length > 1) {
      conds.push(`pais IN (${effectivePaises.map(() => `$${idx++}`).join(',')})`); params.push(...effectivePaises)
    }

    // Categoría — exact match (allows index usage)
    const effectiveCats = catsArr.length > 0 ? catsArr : (categoria && categoria !== 'Todas' ? [categoria] : [])
    if (effectiveCats.length === 1) {
      conds.push(`categoria = $${idx++}`); params.push(effectiveCats[0])
    } else if (effectiveCats.length > 1) {
      conds.push(`categoria IN (${effectiveCats.map(() => `$${idx++}`).join(',')})`); params.push(...effectiveCats)
    }

    if (cliente && cliente !== 'Todos') { conds.push(`cliente ILIKE $${idx++}`); params.push(`%${cliente}%`) }
    if (sku) {
      conds.push(`(sku ILIKE $${idx} OR descripcion ILIKE $${idx})`); idx++; params.push(`%${sku}%`)
    }

    const subcatsArr = parsed.data.subcategorias ? parsed.data.subcategorias.split(',').map(s => s.trim()).filter(Boolean) : []
    if (subcatsArr.length === 1) {
      conds.push(`subcategoria ILIKE $${idx++}`); params.push(subcatsArr[0])
    } else if (subcatsArr.length > 1) {
      conds.push(`subcategoria IN (${subcatsArr.map(() => `$${idx++}`).join(',')})`); params.push(...subcatsArr)
    }

    const formatosArr = parsed.data.formatos ? parsed.data.formatos.split(',').map(s => s.trim()).filter(Boolean) : []
    if (formatosArr.length === 1) {
      conds.push(`formato ILIKE $${idx++}`); params.push(formatosArr[0])
    } else if (formatosArr.length > 1) {
      conds.push(`formato IN (${formatosArr.map(() => `$${idx++}`).join(',')})`); params.push(...formatosArr)
    }

    const clientesArr = parsed.data.clientes ? parsed.data.clientes.split(',').map(s => s.trim()).filter(Boolean) : []
    if (clientesArr.length === 1) {
      conds.push(`cliente ILIKE $${idx++}`); params.push(clientesArr[0])
    } else if (clientesArr.length > 1) {
      conds.push(`(${clientesArr.map(() => `cliente ILIKE $${idx++}`).join(' OR ')})`); params.push(...clientesArr.map(c => `%${c}%`))
    }

    conds.push('ano > 2000')
    const where = conds.join(' AND ')

    // ── Full response cache (5 min TTL) ─────────────────────────
    const cacheKey = `resumen-v5:${new URL(req.url).searchParams.toString()}`
    const { data: result } = await withCache(
      cacheKey,
      async () => {
        // mv_sellout_mensual (17MB) para aggregates — skuQ usa JOIN dim_producto para codigo_barras
        const MV = 'mv_sellout_mensual'
        // For modo='mes': single query on fact_sales_sellout gets both dia and semana breakdowns
        const diaSemanasPromise = modo === 'mes'
          ? pool.query(
              `SELECT dia,
                      EXTRACT(WEEK FROM make_date(ano::int, mes::int, GREATEST(dia::int,1)))::int AS semana,
                      ROUND(SUM(ventas_valor)::numeric,2)    AS ventas_valor,
                      ROUND(SUM(ventas_unidades)::numeric,0) AS ventas_unidades
               FROM fact_sales_sellout WHERE ${where} AND dia > 0
               GROUP BY dia, semana ORDER BY dia`, params)
              .catch(() => ({ rows: [] as any[] }))
          : Promise.resolve({ rows: [] as any[] })

        const [kpiQ, timeQ, catQ, paisQ, skuQ, subcatQ, clienteQ, diaSemanasR] = await Promise.all([
          pool.query(
            `SELECT ROUND(SUM(ventas_valor)::numeric,2) AS total_valor,
                    ROUND(SUM(ventas_unidades)::numeric,0) AS total_unidades,
                    COUNT(DISTINCT pais)    AS n_paises,
                    COUNT(DISTINCT sku)     AS n_skus,
                    COUNT(DISTINCT cliente) AS n_clientes,
                    COUNT(*)                AS n_filas
             FROM ${MV} WHERE ${where}`, params),
          modo === 'mes'
            ? Promise.resolve({ rows: [] as any[] })
            : pool.query(
                `SELECT ano, mes, ROUND(SUM(ventas_valor)::numeric,2) AS ventas_valor,
                         ROUND(SUM(ventas_unidades)::numeric,0) AS ventas_unidades
                  FROM ${MV} WHERE ${where} GROUP BY ano, mes ORDER BY ano, mes`, params),
          pool.query(
            `SELECT categoria, ROUND(SUM(ventas_valor)::numeric,2) AS ventas_valor,
                    ROUND(SUM(ventas_unidades)::numeric,0) AS ventas_unidades
             FROM ${MV} WHERE ${where} GROUP BY categoria ORDER BY ventas_valor DESC LIMIT 30`, params),
          pool.query(
            `SELECT pais, ROUND(SUM(ventas_valor)::numeric,2) AS ventas_valor,
                    ROUND(SUM(ventas_unidades)::numeric,0) AS ventas_unidades
             FROM ${MV} WHERE ${where} GROUP BY pais ORDER BY ventas_valor DESC`, params),
          // skuQ: filtrar en subquery para evitar ambigüedad de columnas en el JOIN
          pool.query(
            `SELECT m.sku, MAX(m.descripcion) AS descripcion, MIN(m.categoria) AS categoria,
                    MIN(p.codigo_barras) AS codigo_barras,
                    ROUND(SUM(m.ventas_valor)::numeric,2) AS ventas_valor,
                    ROUND(SUM(m.ventas_unidades)::numeric,0) AS ventas_unidades
             FROM (SELECT sku, descripcion, categoria, ventas_valor, ventas_unidades
                   FROM ${MV} WHERE ${where}) m
             LEFT JOIN dim_producto p USING (sku)
             GROUP BY m.sku ORDER BY ventas_valor DESC LIMIT 10`, params),
          pool.query(
            `SELECT subcategoria AS nombre,
                    ROUND(SUM(ventas_valor)::numeric,2) AS ventas_valor,
                    ROUND(SUM(ventas_unidades)::numeric,0) AS ventas_unidades
             FROM ${MV} WHERE ${where} AND subcategoria IS NOT NULL AND subcategoria != ''
             GROUP BY subcategoria ORDER BY ventas_unidades DESC LIMIT 10`, params),
          pool.query(
            `SELECT cliente AS nombre,
                    ROUND(SUM(ventas_valor)::numeric,2) AS ventas_valor,
                    ROUND(SUM(ventas_unidades)::numeric,0) AS ventas_unidades
             FROM ${MV} WHERE ${where} AND cliente IS NOT NULL AND cliente != ''
             GROUP BY cliente ORDER BY ventas_valor DESC LIMIT 10`, params),
          diaSemanasPromise,
        ])
        // Derive dias and semanas from the combined query result
        const diasRows    = diaSemanasR.rows.map((r: any) => ({ dia: r.dia, ventas_valor: r.ventas_valor, ventas_unidades: r.ventas_unidades }))
        const semanasMap  = new Map<number, { ventas_valor: number; ventas_unidades: number }>()
        for (const r of diaSemanasR.rows) {
          const s = Number(r.semana)
          const prev = semanasMap.get(s) ?? { ventas_valor: 0, ventas_unidades: 0 }
          semanasMap.set(s, { ventas_valor: prev.ventas_valor + Number(r.ventas_valor), ventas_unidades: prev.ventas_unidades + Number(r.ventas_unidades) })
        }
        const semanasRows = Array.from(semanasMap.entries()).sort((a,b) => a[0]-b[0]).map(([semana, v]) => ({ semana, ...v }))
        return {
          ano:           anoQ,
          mes:           mesQ,
          modo:          modo === 'multi' ? 'ano' : modo,
          kpi:           kpiQ.rows[0],
          dias:          modo === 'mes' ? diasRows : [],
          meses:         modo !== 'mes' ? timeQ.rows : [],
          semanas:       semanasRows,
          categorias:    catQ.rows,
          paises:        paisQ.rows,
          top_skus:      skuQ.rows,
          subcategorias: subcatQ.rows,
          clientes:      clienteQ.rows,
        }
      },
      5 * 60_000 // 5 min TTL
    )

    return NextResponse.json(result, { headers: cacheHeaders(300) })

  } catch (err) {
    return handleApiError(err)
  }
}
