// app/api/mercadeo/tendencias/route.ts
// Series de tiempo de ventas (unidades) — SIN ventas_valor por política de Mercadeo
import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { getUserRestrictions } from '@/lib/auth/restrictions'
import { withCache, cacheHeaders } from '@/lib/db/cache'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agrup    = searchParams.get('agrup')    || 'mes'   // mes | semana | dia
  const pais     = searchParams.get('pais')
  const categoria= searchParams.get('categoria')
  const anoP     = searchParams.get('ano')
  const compAnio = searchParams.get('comp')     === '1'   // comparar con año anterior

  const restrictions = await getUserRestrictions()

  try {
    const buildWhere = (source: 'mv' | 'raw', extraConds: string[] = []) => {
      // 'raw' = fact_sales_sellout (has dia), 'mv' = mv_sellout_mensual (no dia)
      const baseCond = source === 'raw' ? ['dia > 0'] : []
      const conds: string[] = ['ano > 2000', ...baseCond, ...extraConds]
      const params: any[]   = []
      let idx = 1

      if (anoP) { conds.push(`ano = $${idx++}`); params.push(parseInt(anoP)) }

      // Restricción de países por rol
      if (restrictions?.isRestricted && restrictions.paises.length > 0) {
        const allowed = restrictions.paises
        if (pais && pais !== 'Todos' && allowed.includes(pais)) {
          conds.push(`pais = $${idx++}`); params.push(pais)
        } else {
          conds.push(`pais IN (${allowed.map(() => `$${idx++}`).join(', ')})`); params.push(...allowed)
        }
      } else {
        if (pais && pais !== 'Todos') { conds.push(`pais = $${idx++}`); params.push(pais) }
      }

      if (categoria && categoria !== 'Todas') { conds.push(`categoria ILIKE $${idx++}`); params.push('%' + categoria + '%') }

      return { where: 'WHERE ' + conds.join(' AND '), params, nextIdx: idx }
    }

    const cacheKey = `tendencias:${agrup}:${pais}:${categoria}:${anoP}:${compAnio}:${restrictions?.isRestricted}`
    const TTL = 5 * 60 * 1000 // 5 min

    const { data, cached } = await withCache(cacheKey, async () => {
      let rows: any[] = []
      let rowsComp: any[] = []

      if (agrup === 'dia') {
        // Daily needs dia column → fact_sales_sellout
        const { where, params } = buildWhere('raw')
        const r = await pool.query(
          `SELECT ano, mes, dia,
                  ROUND(SUM(ventas_unidades)::numeric,0) AS ventas_unidades,
                  COUNT(DISTINCT pais)                   AS n_paises
           FROM fact_sales_sellout ${where}
           GROUP BY ano, mes, dia ORDER BY ano, mes, dia`,
          params
        )
        rows = r.rows

      } else if (agrup === 'semana') {
        // Weekly needs dia column → fact_sales_sellout
        const { where, params } = buildWhere('raw')
        const r = await pool.query(
          `SELECT ano,
                  EXTRACT(WEEK FROM make_date(ano::int, mes::int, GREATEST(dia::int,1)))::int AS semana,
                  ROUND(SUM(ventas_unidades)::numeric,0) AS ventas_unidades,
                  COUNT(DISTINCT pais)                   AS n_paises
           FROM fact_sales_sellout ${where}
           GROUP BY ano, semana ORDER BY ano, semana`,
          params
        )
        rows = r.rows

      } else {
        // Mensual (default) → mv_sellout_mensual (fast)
        const { where, params } = buildWhere('mv')
        const r = await pool.query(
          `SELECT ano, mes,
                  ROUND(SUM(ventas_unidades)::numeric,0) AS ventas_unidades,
                  COUNT(DISTINCT pais)                   AS n_paises,
                  COUNT(DISTINCT descripcion)            AS n_productos
           FROM mv_sellout_mensual ${where}
           GROUP BY ano, mes ORDER BY ano, mes`,
          params
        )
        rows = r.rows

        // Comparación interanual: mismo query pero año-1
        if (compAnio && anoP) {
          const anoAnterior = parseInt(anoP) - 1
          const condsComp: string[] = ['ano > 2000']
          const paramsComp: any[]   = []
          let idx2 = 1

          condsComp.push(`ano = $${idx2++}`)
          paramsComp.push(anoAnterior)

          if (restrictions?.isRestricted && restrictions.paises.length > 0) {
            const allowed = restrictions.paises
            if (pais && pais !== 'Todos' && allowed.includes(pais)) {
              condsComp.push(`pais = $${idx2++}`); paramsComp.push(pais)
            } else {
              condsComp.push(`pais IN (${allowed.map(() => `$${idx2++}`).join(', ')})`); paramsComp.push(...allowed)
            }
          } else {
            if (pais && pais !== 'Todos') { condsComp.push(`pais = $${idx2++}`); paramsComp.push(pais) }
          }
          if (categoria && categoria !== 'Todas') { condsComp.push(`categoria ILIKE $${idx2++}`); paramsComp.push('%' + categoria + '%') }

          const rComp = await pool.query(
            `SELECT ano, mes,
                    ROUND(SUM(ventas_unidades)::numeric,0) AS ventas_unidades
             FROM mv_sellout_mensual WHERE ${condsComp.join(' AND ')}
             GROUP BY ano, mes ORDER BY ano, mes`,
            paramsComp
          )
          rowsComp = rComp.rows
        }
      }

      // Países disponibles para el filtro — use MV for speed
      const { where: wPaises, params: pPaises } = buildWhere('mv')
      const rPaises = await pool.query(
        `SELECT DISTINCT pais FROM mv_sellout_mensual ${wPaises} ORDER BY pais`,
        pPaises
      )

      return {
        rows,
        rowsComp,
        agrup,
        paises: rPaises.rows.map((r: any) => r.pais),
      }
    }, TTL)

    return NextResponse.json(data, {
      headers: { ...cacheHeaders(300), 'X-Cache': cached ? 'HIT' : 'MISS' },
    })
  } catch (err: any) {
    console.error('mercadeo/tendencias error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
