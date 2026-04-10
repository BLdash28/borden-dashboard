// app/api/mercadeo/tendencias/route.ts
// Series de tiempo de ventas (unidades) — SIN ventas_valor por política de Mercadeo
import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'
import { getUserRestrictions } from '@/lib/auth/restrictions'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
})

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agrup    = searchParams.get('agrup')    || 'mes'   // mes | semana | dia
  const pais     = searchParams.get('pais')
  const categoria= searchParams.get('categoria')
  const anoP     = searchParams.get('ano')
  const compAnio = searchParams.get('comp')     === '1'   // comparar con año anterior

  const restrictions = await getUserRestrictions()

  const client = await pool.connect()
  try {
    const buildWhere = (extraConds: string[] = []) => {
      const conds: string[] = ['ano > 2000', ...extraConds]
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

    let rows: any[] = []
    let rowsComp: any[] = []

    if (agrup === 'dia') {
      // Ventas diarias del período seleccionado
      const { where, params } = buildWhere(['dia > 0'])
      const r = await client.query(
        `SELECT ano, mes, dia,
                ROUND(SUM(ventas_unidades)::numeric,0) AS ventas_unidades,
                COUNT(DISTINCT pais)                   AS n_paises
         FROM v_ventas ${where}
         GROUP BY ano, mes, dia ORDER BY ano, mes, dia`,
        params
      )
      rows = r.rows

    } else if (agrup === 'semana') {
      const { where, params } = buildWhere(['dia > 0'])
      const r = await client.query(
        `SELECT ano,
                EXTRACT(WEEK FROM make_date(ano::int, mes::int, GREATEST(dia::int,1)))::int AS semana,
                ROUND(SUM(ventas_unidades)::numeric,0) AS ventas_unidades,
                COUNT(DISTINCT pais)                   AS n_paises
         FROM v_ventas ${where}
         GROUP BY ano, semana ORDER BY ano, semana`,
        params
      )
      rows = r.rows

    } else {
      // Mensual (default)
      const { where, params, nextIdx } = buildWhere()
      const r = await client.query(
        `SELECT ano, mes,
                ROUND(SUM(ventas_unidades)::numeric,0) AS ventas_unidades,
                COUNT(DISTINCT pais)                   AS n_paises,
                COUNT(DISTINCT descripcion)            AS n_productos
         FROM v_ventas ${where}
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

        const rComp = await client.query(
          `SELECT ano, mes,
                  ROUND(SUM(ventas_unidades)::numeric,0) AS ventas_unidades
           FROM v_ventas WHERE ${condsComp.join(' AND ')}
           GROUP BY ano, mes ORDER BY ano, mes`,
          paramsComp
        )
        rowsComp = rComp.rows
      }
    }

    // Países disponibles para el filtro (respetando restricción de usuario)
    const { where: wPaises, params: pPaises } = buildWhere()
    const rPaises = await client.query(
      `SELECT DISTINCT pais FROM v_ventas ${wPaises} ORDER BY pais`,
      pPaises
    )

    client.release()
    return NextResponse.json({
      rows,
      rowsComp,
      agrup,
      paises: rPaises.rows.map((r: any) => r.pais),
    })
  } catch (err: any) {
    client.release()
    console.error('mercadeo/tendencias error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
