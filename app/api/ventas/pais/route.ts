import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError, AppError } from '@/lib/api/errors'
import { requireAuth } from '@/lib/api/auth'
import { VentasPaisQuerySchema, parsePaisList } from '@/lib/validation/ventas'

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

    const conds: string[] = ['dia > 0']
    const params: unknown[] = []
    let idx = 1

    if (anoQ) { conds.push(`ano = $${idx++}`); params.push(anoQ) }
    if (mesQ) { conds.push(`mes = $${idx++}`); params.push(mesQ) }

    const paisList = parsePaisList(pais)
    if (paisList.length === 1) {
      conds.push(`pais = $${idx++}`)
      params.push(paisList[0])
    } else if (paisList.length > 1) {
      const ph = paisList.map(() => `$${idx++}`).join(', ')
      conds.push(`pais IN (${ph})`)
      params.push(...paisList)
    }

    // Multi-select categorías
    const catsArr = catsP ? catsP.split(',').map(s => s.trim()).filter(Boolean) : []
    if (catsArr.length > 0) {
      conds.push(`categoria IN (${catsArr.map(() => `$${idx++}`).join(', ')})`)
      params.push(...catsArr)
    } else if (categoria && categoria !== 'Todas') {
      conds.push(`categoria ILIKE $${idx++}`)
      params.push('%' + categoria + '%')
    }

    // Multi-select subcategorías
    const subcatsArr = subcatsP ? subcatsP.split(',').map(s => s.trim()).filter(Boolean) : []
    if (subcatsArr.length > 0) {
      conds.push(`subcategoria IN (${subcatsArr.map(() => `$${idx++}`).join(', ')})`)
      params.push(...subcatsArr)
    }

    // Multi-select clientes
    const clientesArr = clientesP ? clientesP.split(',').map(s => s.trim()).filter(Boolean) : []
    if (clientesArr.length > 0) {
      conds.push(`(${clientesArr.map(() => `cliente ILIKE $${idx++}`).join(' OR ')})`)
      params.push(...clientesArr.map(c => `%${c}%`))
    } else if (cliente && cliente !== 'Todos') {
      conds.push(`cliente ILIKE $${idx++}`)
      params.push('%' + cliente + '%')
    }

    const where = 'WHERE ' + conds.join(' AND ')

    // ── SKU drill-down ──────────────────────────────────────────
    if (tipo === 'skus') {
      const r = await pool.query(
        `SELECT descripcion, codigo_barras, sku,
                ROUND(SUM(ventas_valor)::numeric, 2)    AS ventas_valor,
                ROUND(SUM(ventas_unidades)::numeric, 0) AS ventas_unidades
         FROM v_ventas ${where}
         GROUP BY descripcion, codigo_barras, sku
         ORDER BY ventas_valor DESC
         LIMIT 15`,
        params
      )
      return NextResponse.json({ rows: r.rows })
    }

    // ── Time-series ─────────────────────────────────────────────
    let selectGroup: string
    let orderBy: string
    if (modo === 'mes') {
      selectGroup = 'pais, dia';       orderBy = 'pais, dia'
    } else if (modo === 'ano') {
      selectGroup = 'pais, mes, dia';  orderBy = 'pais, mes, dia'
    } else {
      selectGroup = 'pais, ano, mes';  orderBy = 'pais, ano, mes'
    }

    const r = await pool.query(
      `SELECT ${selectGroup},
              ROUND(SUM(ventas_valor)::numeric, 4)    AS ventas_valor,
              ROUND(SUM(ventas_unidades)::numeric, 0) AS ventas_unidades
       FROM v_ventas ${where}
       GROUP BY ${selectGroup} ORDER BY ${orderBy}`,
      params
    )

    return NextResponse.json({ rows: r.rows, ano: anoQ ?? null, mes: mesQ ?? null, modo })

  } catch (err) {
    return handleApiError(err)
  }
}
