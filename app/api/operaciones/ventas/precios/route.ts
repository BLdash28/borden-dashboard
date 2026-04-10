// app/api/operaciones/ventas/precios/route.ts
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
  const tipo    = searchParams.get('tipo') || 'control'   // control | historial | filtros | kpis
  const pais    = searchParams.get('pais')
  const sku     = searchParams.get('sku')
  const cliente = searchParams.get('cliente')
  const zona    = searchParams.get('zona')

  const restrictions = await getUserRestrictions()
  const client = await pool.connect()

  try {
    // ── Filtros disponibles ──────────────────────────────────
    if (tipo === 'filtros') {
      const [rSkus, rClientes, rZonas, rPaises] = await Promise.all([
        client.query(`SELECT DISTINCT sku, descripcion FROM precios ORDER BY sku LIMIT 500`),
        client.query(`SELECT DISTINCT cliente FROM precios WHERE cliente IS NOT NULL ORDER BY cliente LIMIT 200`),
        client.query(`SELECT DISTINCT zona FROM precios WHERE zona IS NOT NULL ORDER BY zona LIMIT 100`),
        client.query(`SELECT DISTINCT pais FROM precios ORDER BY pais`),
      ])
      client.release()
      return NextResponse.json({
        skus:     rSkus.rows,
        clientes: rClientes.rows.map((r: any) => r.cliente),
        zonas:    rZonas.rows.map((r: any) => r.zona),
        paises:   rPaises.rows.map((r: any) => r.pais),
      })
    }

    // ── Construir condiciones de filtro ──────────────────────
    const prConds: string[] = ['1=1']
    const prParams: any[]   = []
    let idx = 1

    if (restrictions?.isRestricted && restrictions.paises.length > 0) {
      const allowed = restrictions.paises
      if (pais && pais !== 'Todos' && allowed.includes(pais)) {
        prConds.push(`p.pais = $${idx++}`); prParams.push(pais)
      } else {
        prConds.push(`p.pais IN (${allowed.map(() => `$${idx++}`).join(', ')})`); prParams.push(...allowed)
      }
    } else {
      if (pais && pais !== 'Todos') { prConds.push(`p.pais = $${idx++}`); prParams.push(pais) }
    }

    if (sku    && sku    !== 'Todos') { prConds.push(`p.sku = $${idx++}`);    prParams.push(sku) }
    if (cliente && cliente !== 'Todos') { prConds.push(`p.cliente ILIKE $${idx++}`); prParams.push('%' + cliente + '%') }
    if (zona   && zona   !== 'Todas')  { prConds.push(`p.zona ILIKE $${idx++}`);   prParams.push('%' + zona + '%') }

    const prWhere = prConds.join(' AND ')

    // ── KPIs de control de precio ────────────────────────────
    if (tipo === 'kpis') {
      const r = await client.query(
        `WITH latest AS (
          SELECT DISTINCT ON (pais, sku, COALESCE(cliente,''))
            pais, sku, descripcion, cliente, zona,
            precio_objetivo, precio_minimo, precio_maximo, precio_real,
            fecha
          FROM precios p
          WHERE ${prWhere}
          ORDER BY pais, sku, COALESCE(cliente,''), fecha DESC
        ),
        con_sell AS (
          SELECT
            l.*,
            COALESCE(l.precio_real, si.precio_si) AS precio_efectivo
          FROM latest l
          LEFT JOIN (
            SELECT pais, sku,
              SUM(ingresos) / NULLIF(SUM(unidades), 0) AS precio_si
            FROM ventas_sell_in
            GROUP BY pais, sku
          ) si ON si.pais = l.pais AND si.sku = l.sku
        )
        SELECT
          COUNT(*)                                                     AS total_skus,
          COUNT(*) FILTER (
            WHERE precio_efectivo < COALESCE(precio_minimo, precio_objetivo * 0.90)
          )                                                            AS alertas_bajo,
          COUNT(*) FILTER (
            WHERE precio_efectivo > COALESCE(precio_maximo, precio_objetivo * 1.10)
          )                                                            AS alertas_alto,
          COUNT(*) FILTER (WHERE precio_efectivo IS NULL)             AS sin_dato,
          ROUND(AVG(precio_objetivo)::numeric, 4)                     AS precio_obj_promedio,
          ROUND(AVG(precio_efectivo)::numeric, 4)                     AS precio_real_promedio,
          ROUND(AVG(
            CASE WHEN precio_objetivo > 0 AND precio_efectivo IS NOT NULL
                 THEN (precio_efectivo - precio_objetivo) / precio_objetivo * 100
            END
          )::numeric, 2)                                              AS variacion_promedio_pct
        FROM con_sell`,
        prParams
      )
      client.release()
      return NextResponse.json(r.rows[0] || {})
    }

    // ── Historial de precios por SKU ─────────────────────────
    if (tipo === 'historial') {
      const r = await client.query(
        `SELECT
            p.pais, p.sku, p.descripcion, p.cliente, p.zona,
            p.precio_objetivo, p.precio_real, p.fecha, p.fuente,
            ROUND(
              CASE WHEN p.precio_objetivo > 0 AND p.precio_real IS NOT NULL
                   THEN (p.precio_real - p.precio_objetivo) / p.precio_objetivo * 100
              END::numeric, 2
            ) AS variacion_pct
         FROM precios p
         WHERE ${prWhere}
         ORDER BY p.fecha DESC
         LIMIT 200`,
        prParams
      )
      client.release()
      return NextResponse.json({ rows: r.rows })
    }

    // ── Control de precio (vista principal) ──────────────────
    const r = await client.query(
      `WITH latest AS (
          SELECT DISTINCT ON (pais, sku, COALESCE(cliente,''))
            pais, sku, descripcion, cliente, zona,
            precio_objetivo,
            COALESCE(precio_minimo, ROUND((precio_objetivo * 0.90)::numeric, 4)) AS precio_minimo,
            COALESCE(precio_maximo, ROUND((precio_objetivo * 1.10)::numeric, 4)) AS precio_maximo,
            precio_real,
            fecha
          FROM precios p
          WHERE ${prWhere}
          ORDER BY pais, sku, COALESCE(cliente,''), fecha DESC
      ),
      con_sell AS (
          SELECT
            l.*,
            si.precio_si,
            COALESCE(l.precio_real, si.precio_si)                    AS precio_efectivo
          FROM latest l
          LEFT JOIN (
            SELECT pais, sku,
              ROUND((SUM(ingresos) / NULLIF(SUM(unidades), 0))::numeric, 4) AS precio_si
            FROM ventas_sell_in
            GROUP BY pais, sku
          ) si ON si.pais = l.pais AND si.sku = l.sku
      )
      SELECT
        pais, sku, descripcion, cliente, zona,
        precio_objetivo, precio_minimo, precio_maximo,
        precio_efectivo                                               AS precio_real,
        precio_si,
        ROUND(
          CASE WHEN precio_objetivo > 0 AND precio_efectivo IS NOT NULL
               THEN (precio_efectivo - precio_objetivo) / precio_objetivo * 100
          END::numeric, 2
        )                                                             AS variacion_pct,
        CASE
          WHEN precio_efectivo IS NULL                                THEN 'sin_dato'
          WHEN precio_efectivo < precio_minimo                        THEN 'bajo'
          WHEN precio_efectivo > precio_maximo                        THEN 'alto'
          ELSE 'ok'
        END                                                           AS alerta,
        fecha
      FROM con_sell
      ORDER BY
        CASE WHEN precio_efectivo < precio_minimo OR precio_efectivo > precio_maximo THEN 0 ELSE 1 END,
        sku`,
      prParams
    )
    client.release()
    return NextResponse.json({ rows: r.rows })

  } catch (err: any) {
    client.release()
    if (err.code === '42P01') {
      return NextResponse.json({ rows: [], empty: true, message: 'Tablas de precios no creadas aún' })
    }
    console.error('ventas/precios error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
