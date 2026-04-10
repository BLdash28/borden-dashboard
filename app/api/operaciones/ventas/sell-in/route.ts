// app/api/operaciones/ventas/sell-in/route.ts
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
  const tipo    = searchParams.get('tipo') || 'resumen'   // resumen | tendencia | detalle | filtros
  const pais    = searchParams.get('pais')
  const cliente = searchParams.get('cliente')
  const sku     = searchParams.get('sku')
  const canal   = searchParams.get('canal')
  const anoP    = searchParams.get('ano')
  const mesP    = searchParams.get('mes')

  const restrictions = await getUserRestrictions()
  const client = await pool.connect()

  try {
    // ── Filtros dinámicos ────────────────────────────────────
    const conds: string[] = ['ano > 2000']
    const params: any[]   = []
    let idx = 1

    if (anoP) { conds.push(`ano = $${idx++}`); params.push(parseInt(anoP)) }
    if (mesP) { conds.push(`mes = $${idx++}`); params.push(parseInt(mesP)) }

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

    if (cliente && cliente !== 'Todos') { conds.push(`cliente ILIKE $${idx++}`); params.push('%' + cliente + '%') }
    if (sku    && sku    !== 'Todos')   { conds.push(`sku = $${idx++}`); params.push(sku) }
    if (canal  && canal  !== 'Todos')   { conds.push(`canal ILIKE $${idx++}`); params.push('%' + canal + '%') }

    const where = 'WHERE ' + conds.join(' AND ')

    // ── Valores de filtros disponibles ──────────────────────
    if (tipo === 'filtros') {
      const [rPeriodos, rClientes, rCanales, rSkus] = await Promise.all([
        client.query(`SELECT DISTINCT ano, mes FROM ventas_sell_in WHERE ano > 2000 ORDER BY ano DESC, mes DESC LIMIT 36`),
        client.query(`SELECT DISTINCT cliente FROM ventas_sell_in WHERE cliente IS NOT NULL ORDER BY cliente LIMIT 200`),
        client.query(`SELECT DISTINCT canal FROM ventas_sell_in WHERE canal IS NOT NULL ORDER BY canal LIMIT 50`),
        client.query(`SELECT DISTINCT sku, descripcion FROM ventas_sell_in ORDER BY sku LIMIT 500`),
      ])
      client.release()
      return NextResponse.json({
        periodos: rPeriodos.rows,
        clientes: rClientes.rows.map((r: any) => r.cliente),
        canales:  rCanales.rows.map((r: any) => r.canal),
        skus:     rSkus.rows,
      })
    }

    // ── KPIs de resumen ──────────────────────────────────────
    if (tipo === 'resumen') {
      const r = await client.query(
        `SELECT
            ROUND(SUM(ingresos)::numeric, 2)          AS ingresos_total,
            ROUND(SUM(unidades)::numeric, 0)          AS unidades_total,
            CASE WHEN SUM(unidades) > 0
                 THEN ROUND((SUM(ingresos)/SUM(unidades))::numeric, 4)
                 ELSE 0 END                           AS precio_promedio,
            COUNT(DISTINCT sku)                       AS n_skus,
            COUNT(DISTINCT cliente)                   AS n_clientes,
            COUNT(DISTINCT canal)                     AS n_canales,
            COUNT(DISTINCT pais)                      AS n_paises
         FROM ventas_sell_in ${where}`,
        params
      )
      client.release()
      return NextResponse.json(r.rows[0] || {})
    }

    // ── Tendencia mensual ────────────────────────────────────
    if (tipo === 'tendencia') {
      const r = await client.query(
        `SELECT
            ano, mes,
            ROUND(SUM(ingresos)::numeric, 2)   AS ingresos,
            ROUND(SUM(unidades)::numeric, 0)   AS unidades,
            COUNT(DISTINCT sku)                AS n_skus
         FROM ventas_sell_in ${where}
         GROUP BY ano, mes
         ORDER BY ano ASC, mes ASC`,
        params
      )
      client.release()
      return NextResponse.json({ rows: r.rows })
    }

    // ── Top SKUs ─────────────────────────────────────────────
    if (tipo === 'top_sku') {
      const r = await client.query(
        `SELECT
            sku,
            descripcion,
            categoria,
            ROUND(SUM(ingresos)::numeric, 2)   AS ingresos,
            ROUND(SUM(unidades)::numeric, 0)   AS unidades,
            CASE WHEN SUM(unidades) > 0
                 THEN ROUND((SUM(ingresos)/SUM(unidades))::numeric, 4)
                 ELSE 0 END                    AS precio_promedio,
            COUNT(DISTINCT cliente)            AS n_clientes
         FROM ventas_sell_in ${where}
         GROUP BY sku, descripcion, categoria
         ORDER BY ingresos DESC
         LIMIT 20`,
        params
      )
      client.release()
      return NextResponse.json({ rows: r.rows })
    }

    // ── Top Clientes ─────────────────────────────────────────
    if (tipo === 'top_cliente') {
      const r = await client.query(
        `SELECT
            cliente,
            canal,
            ROUND(SUM(ingresos)::numeric, 2)   AS ingresos,
            ROUND(SUM(unidades)::numeric, 0)   AS unidades,
            COUNT(DISTINCT sku)                AS n_skus
         FROM ventas_sell_in ${where}
         GROUP BY cliente, canal
         ORDER BY ingresos DESC
         LIMIT 20`,
        params
      )
      client.release()
      return NextResponse.json({ rows: r.rows })
    }

    // ── Detalle ───────────────────────────────────────────────
    const r = await client.query(
      `SELECT
          pais, ano, mes, dia, cliente, canal, zona,
          sku, descripcion, categoria,
          ROUND(unidades::numeric, 0)       AS unidades,
          ROUND(ingresos::numeric, 2)       AS ingresos,
          ROUND(precio_unitario::numeric, 4) AS precio_unitario
       FROM ventas_sell_in ${where}
       ORDER BY ano DESC, mes DESC, dia DESC, ingresos DESC
       LIMIT 500`,
      params
    )
    client.release()
    return NextResponse.json({ rows: r.rows })

  } catch (err: any) {
    client.release()
    // Tabla no existe todavía → retorna vacío con gracia
    if (err.code === '42P01') {
      return NextResponse.json({ rows: [], empty: true, message: 'Tabla ventas_sell_in no creada aún' })
    }
    console.error('ventas/sell-in error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
