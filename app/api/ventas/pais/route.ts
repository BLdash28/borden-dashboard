import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError, AppError } from '@/lib/api/errors'
import { requireAuth } from '@/lib/api/auth'
import { VentasPaisQuerySchema, parsePaisList } from '@/lib/validation/ventas'
import { withCache, cacheHeaders } from '@/lib/db/cache'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()

    const raw = Object.fromEntries(new URL(req.url).searchParams)
    const parsed = VentasPaisQuerySchema.safeParse(raw)
    if (!parsed.success) {
      throw new AppError(400, parsed.error.message, 'Invalid query parameters')
    }

    const { ano: anoQ, mes: mesQ, pais, categoria, cliente, tipo,
            categorias: catsP, subcategorias: subcatsP, clientes: clientesP } = parsed.data
    const modo = mesQ ? 'mes' : anoQ ? 'ano' : 'todos'

    // mvConds: for mv_sellout_mensual (no dia column)
    // rawConds: for fact_sales_sellout (has dia)
    const mvConds: string[]  = []
    const rawConds: string[] = ['dia > 0']
    const params: unknown[]  = []
    let idx = 1

    if (anoQ) {
      mvConds.push(`ano = $${idx}`); rawConds.push(`ano = $${idx}`); idx++
      params.push(anoQ)
    }
    if (mesQ) {
      mvConds.push(`mes = $${idx}`); rawConds.push(`mes = $${idx}`); idx++
      params.push(mesQ)
    }

    const paisList = parsePaisList(pais)
    if (paisList.length === 1) {
      mvConds.push(`pais = $${idx}`); rawConds.push(`pais = $${idx}`); idx++
      params.push(paisList[0])
    } else if (paisList.length > 1) {
      const ph = paisList.map(() => `$${idx++}`).join(', ')
      mvConds.push(`pais IN (${ph})`); rawConds.push(`pais IN (${ph})`)
      params.push(...paisList)
    }

    const catsArr = catsP ? catsP.split(',').map(s => s.trim()).filter(Boolean) : []
    if (catsArr.length > 0) {
      const ph = catsArr.map(() => `$${idx++}`).join(', ')
      mvConds.push(`categoria IN (${ph})`); rawConds.push(`categoria IN (${ph})`)
      params.push(...catsArr)
    } else if (categoria && categoria !== 'Todas') {
      mvConds.push(`categoria ILIKE $${idx}`); rawConds.push(`categoria ILIKE $${idx}`); idx++
      params.push('%' + categoria + '%')
    }

    const subcatsArr = subcatsP ? subcatsP.split(',').map(s => s.trim()).filter(Boolean) : []
    if (subcatsArr.length > 0) {
      const ph = subcatsArr.map(() => `$${idx++}`).join(', ')
      mvConds.push(`subcategoria IN (${ph})`); rawConds.push(`subcategoria IN (${ph})`)
      params.push(...subcatsArr)
    }

    const clientesArr = clientesP ? clientesP.split(',').map(s => s.trim()).filter(Boolean) : []
    if (clientesArr.length > 0) {
      const clause = `(${clientesArr.map(() => `cliente ILIKE $${idx++}`).join(' OR ')})`
      mvConds.push(clause); rawConds.push(clause)
      params.push(...clientesArr.map(c => `%${c}%`))
    } else if (cliente && cliente !== 'Todos') {
      mvConds.push(`cliente ILIKE $${idx}`); rawConds.push(`cliente ILIKE $${idx}`); idx++
      params.push('%' + cliente + '%')
    }

    const mvWhere  = mvConds.length  ? 'WHERE ' + mvConds.join(' AND ')  : ''
    const rawWhere = 'WHERE ' + rawConds.join(' AND ')

    const cacheKey = `pais-v2:${new URL(req.url).searchParams.toString()}`

    const { data } = await withCache(cacheKey, async () => {
      // SKU drill-down — needs codigo_barras and dia → fact_sales_sellout
      if (tipo === 'skus') {
        const r = await pool.query(
          `SELECT descripcion, codigo_barras, sku,
                  ROUND(SUM(ventas_valor)::numeric, 2)    AS ventas_valor,
                  ROUND(SUM(ventas_unidades)::numeric, 0) AS ventas_unidades
           FROM fact_sales_sellout ${rawWhere}
           GROUP BY descripcion, codigo_barras, sku
           ORDER BY ventas_valor DESC LIMIT 15`,
          params
        )
        return { rows: r.rows }
      }

      // Time-series: mode='todos' → mv_sellout_mensual (no dia needed, fast)
      // mode='ano'/'mes' → fact_sales_sellout (needs dia column)
      let r
      if (modo === 'todos') {
        r = await pool.query(
          `SELECT pais, ano, mes,
                  ROUND(SUM(ventas_valor)::numeric, 4)    AS ventas_valor,
                  ROUND(SUM(ventas_unidades)::numeric, 0) AS ventas_unidades
           FROM mv_sellout_mensual ${mvWhere}
           GROUP BY pais, ano, mes ORDER BY pais, ano, mes`,
          params
        )
      } else if (modo === 'ano') {
        r = await pool.query(
          `SELECT pais, mes, dia,
                  ROUND(SUM(ventas_valor)::numeric, 4)    AS ventas_valor,
                  ROUND(SUM(ventas_unidades)::numeric, 0) AS ventas_unidades
           FROM fact_sales_sellout ${rawWhere}
           GROUP BY pais, mes, dia ORDER BY pais, mes, dia`,
          params
        )
      } else {
        r = await pool.query(
          `SELECT pais, dia,
                  ROUND(SUM(ventas_valor)::numeric, 4)    AS ventas_valor,
                  ROUND(SUM(ventas_unidades)::numeric, 0) AS ventas_unidades
           FROM fact_sales_sellout ${rawWhere}
           GROUP BY pais, dia ORDER BY pais, dia`,
          params
        )
      }

      return { rows: r.rows, ano: anoQ ?? null, mes: mesQ ?? null, modo }
    }, 5 * 60_000)

    return NextResponse.json(data, { headers: cacheHeaders(300) })

  } catch (err) {
    return handleApiError(err)
  }
}
