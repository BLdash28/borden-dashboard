import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { requireAuth } from '@/lib/api/auth'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()

    const sp = new URL(req.url).searchParams
    const anoP = sp.get('ano') ? Number(sp.get('ano')) : null
    const mesP = sp.get('mes') ? Number(sp.get('mes')) : null

    const paisesArr   = sp.get('paises')        ? sp.get('paises')!.split(',').map(s => s.trim()).filter(Boolean)        : []
    const catsArr     = sp.get('categorias')    ? sp.get('categorias')!.split(',').map(s => s.trim()).filter(Boolean)    : []
    const subcatsArr  = sp.get('subcategorias') ? sp.get('subcategorias')!.split(',').map(s => s.trim()).filter(Boolean) : []
    const clientesArr = sp.get('clientes')      ? sp.get('clientes')!.split(',').map(s => s.trim()).filter(Boolean)      : []

    // ── Determine current period ───────────────────────────────────────────
    let anoActual: number
    let mesActual: number

    if (anoP && mesP) {
      anoActual = anoP
      mesActual = mesP
    } else {
      const best = await pool.query(
        'SELECT ano, mes FROM v_ventas WHERE ano > 2000 ' +
        'GROUP BY ano, mes HAVING COUNT(*) > 10 ORDER BY ano DESC, mes DESC LIMIT 1'
      )
      anoActual = Number(best.rows[0]?.ano ?? new Date().getFullYear())
      mesActual = Number(best.rows[0]?.mes ?? (new Date().getMonth() + 1))
    }

    // ── Build WHERE (current period only) ─────────────────────────────────
    // $1 = mesActual, $2 = anoActual
    const conds: string[] = ['mes = $1', 'ano = $2']
    const params: unknown[] = [mesActual, anoActual]
    let idx = 3

    if (paisesArr.length === 1) {
      conds.push(`pais = $${idx++}`); params.push(paisesArr[0])
    } else if (paisesArr.length > 1) {
      conds.push(`pais IN (${paisesArr.map(() => `$${idx++}`).join(',')})`); params.push(...paisesArr)
    }

    if (catsArr.length === 1) {
      conds.push(`categoria = $${idx++}`); params.push(catsArr[0])
    } else if (catsArr.length > 1) {
      conds.push(`categoria IN (${catsArr.map(() => `$${idx++}`).join(',')})`); params.push(...catsArr)
    }

    if (subcatsArr.length === 1) {
      conds.push(`subcategoria = $${idx++}`); params.push(subcatsArr[0])
    } else if (subcatsArr.length > 1) {
      conds.push(`subcategoria IN (${subcatsArr.map(() => `$${idx++}`).join(',')})`); params.push(...subcatsArr)
    }

    if (clientesArr.length === 1) {
      conds.push(`cliente = $${idx++}`); params.push(clientesArr[0])
    } else if (clientesArr.length > 1) {
      conds.push(`cliente IN (${clientesArr.map(() => `$${idx++}`).join(',')})`); params.push(...clientesArr)
    }

    const where = conds.join(' AND ')

    // ── Run queries in parallel ────────────────────────────────────────────
    const [detalleQ, porPaisQ] = await Promise.all([
      pool.query(`
        SELECT
          pais, cliente, categoria,
          SUM(ventas_unidades)::numeric                    AS unidades_actual,
          ROUND(SUM(ventas_valor)::numeric, 2)             AS valor_actual
        FROM v_ventas
        WHERE ${where}
        GROUP BY pais, cliente, categoria
        ORDER BY valor_actual DESC
      `, params),

      pool.query(`
        SELECT
          pais,
          SUM(ventas_unidades)::numeric                    AS unidades_actual,
          ROUND(SUM(ventas_valor)::numeric, 2)             AS valor_actual
        FROM v_ventas
        WHERE ${where}
        GROUP BY pais
        ORDER BY valor_actual DESC
      `, params),
    ])

    return NextResponse.json({
      ano_actual: anoActual,
      mes_actual: mesActual,
      por_pais:   porPaisQ.rows,
      detalle:    detalleQ.rows,
    })
  } catch (err) {
    console.error('[cumplimiento]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
