// app/api/operaciones/ventas/costos/route.ts
// Margen = Precio venta - Costo
// Ganancia % = (Margen / Precio venta) * 100
// Fuente de costo: Barrel & Block (prioridad) → costos manual (fallback)
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
  const tipo  = searchParams.get('tipo') || 'margen'   // margen | kpis | historial | filtros
  const pais  = searchParams.get('pais')
  const sku   = searchParams.get('sku')
  const zona  = searchParams.get('zona')
  const anoP  = searchParams.get('ano')
  const mesP  = searchParams.get('mes')

  const restrictions = await getUserRestrictions()
  const client = await pool.connect()

  try {
    // ── Filtros disponibles ──────────────────────────────────
    if (tipo === 'filtros') {
      // Combina SKUs de ambas fuentes: barrel_block + costos
      const r = await client.query(`
        SELECT sku, descripcion FROM (
          SELECT DISTINCT sku, descripcion FROM barrel_block
          UNION
          SELECT DISTINCT sku, descripcion FROM costos
        ) t ORDER BY sku LIMIT 500
      `)
      client.release()
      return NextResponse.json({ skus: r.rows })
    }

    // ── Filtros dinámicos (se aplican sobre barrel_block y costos) ──
    const paisCond: string[] = []
    const paisParams: any[]  = []
    let idx = 1

    if (restrictions?.isRestricted && restrictions.paises.length > 0) {
      const allowed = restrictions.paises
      if (pais && pais !== 'Todos' && allowed.includes(pais)) {
        paisCond.push(`pais = $${idx++}`); paisParams.push(pais)
      } else {
        paisCond.push(`pais IN (${allowed.map(() => `$${idx++}`).join(', ')})`); paisParams.push(...allowed)
      }
    } else {
      if (pais && pais !== 'Todos') { paisCond.push(`pais = $${idx++}`); paisParams.push(pais) }
    }
    if (sku  && sku  !== 'Todos') { paisCond.push(`sku = $${idx++}`);           paisParams.push(sku) }

    // Filtros de fecha solo sobre costos manual (barrel usa fecha_compra)
    const fechaConds: string[] = []
    if (anoP) { fechaConds.push(`EXTRACT(YEAR  FROM fecha)::INT = $${idx++}`); paisParams.push(parseInt(anoP)) }
    if (mesP) { fechaConds.push(`EXTRACT(MONTH FROM fecha)::INT = $${idx++}`); paisParams.push(parseInt(mesP)) }

    const baseCond    = paisCond.length   ? 'WHERE ' + paisCond.join(' AND ')   : ''
    const fechaFilter = fechaConds.length ? ' AND ' + fechaConds.join(' AND ')   : ''

    // ── Consulta principal de margen ─────────────────────────
    // CTE 1: Último costo Barrel & Block por pais+sku
    // CTE 2: Último costo manual (costos table) por pais+sku — fallback
    // CTE 3: Precio de venta más reciente (precios table)
    // JOIN: COALESCE para usar BB primero, manual como fallback
    const margenQuery = `
      WITH bb_ultimo AS (
          SELECT DISTINCT ON (pais, sku)
              pais, sku, descripcion,
              costo_compra                AS costo,
              fecha_compra                AS fecha_costo,
              'Barrel & Block'            AS fuente_costo
          FROM barrel_block
          ${baseCond}
          ORDER BY pais, sku, fecha_compra DESC
      ),
      co_ultimo AS (
          SELECT DISTINCT ON (pais, sku)
              pais, sku, descripcion,
              costo_total                 AS costo,
              fecha                       AS fecha_costo,
              'Manual'                    AS fuente_costo
          FROM costos
          ${baseCond.replace(/sku = \$\d+/g, m => m) /* mismo filtro */}
          ${fechaFilter}
          ORDER BY pais, sku, fecha DESC
      ),
      precio_ref AS (
          SELECT DISTINCT ON (pais, sku)
              pais, sku,
              precio_objetivo             AS precio_venta
          FROM precios
          ORDER BY pais, sku, fecha DESC
      ),
      costo_final AS (
          SELECT
              COALESCE(bb.pais, co.pais)               AS pais,
              COALESCE(bb.sku,  co.sku)                AS sku,
              COALESCE(bb.descripcion, co.descripcion) AS descripcion,
              COALESCE(bb.costo, co.costo)             AS costo,
              COALESCE(bb.fecha_costo, co.fecha_costo) AS fecha_costo,
              COALESCE(bb.fuente_costo, co.fuente_costo) AS fuente_costo
          FROM bb_ultimo bb
          FULL OUTER JOIN co_ultimo co
              ON co.pais = bb.pais AND co.sku = bb.sku
      )
      SELECT
          cf.pais,
          cf.sku,
          cf.descripcion,
          ROUND(cf.costo::numeric, 4)                                 AS costo,
          cf.fuente_costo,
          cf.fecha_costo,
          ROUND(pr.precio_venta::numeric, 4)                          AS precio_venta,
          -- Margen = Precio venta - Costo
          CASE WHEN pr.precio_venta IS NOT NULL
               THEN ROUND((pr.precio_venta - cf.costo)::numeric, 4)
               ELSE NULL END                                          AS margen,
          -- Ganancia % = (Margen / Precio venta) * 100
          CASE WHEN pr.precio_venta > 0
               THEN ROUND(((pr.precio_venta - cf.costo) / pr.precio_venta * 100)::numeric, 2)
               ELSE NULL END                                          AS ganancia_pct,
          -- Estado: umbral 20 % según especificación
          CASE
              WHEN pr.precio_venta IS NULL OR pr.precio_venta = 0    THEN 'sin_precio'
              WHEN (pr.precio_venta - cf.costo) / pr.precio_venta * 100 < 10 THEN 'critico'
              WHEN (pr.precio_venta - cf.costo) / pr.precio_venta * 100 < 20 THEN 'bajo'
              ELSE 'ok'
          END                                                         AS estado_margen
      FROM costo_final cf
      LEFT JOIN precio_ref pr
          ON pr.pais = cf.pais AND pr.sku = cf.sku
      ORDER BY
          CASE
              WHEN pr.precio_venta > 0 AND (pr.precio_venta - cf.costo) / pr.precio_venta * 100 < 10 THEN 0
              WHEN pr.precio_venta > 0 AND (pr.precio_venta - cf.costo) / pr.precio_venta * 100 < 20 THEN 1
              ELSE 2
          END,
          cf.sku
    `

    if (tipo === 'margen') {
      const r = await client.query(margenQuery, paisParams)
      client.release()
      return NextResponse.json({ rows: r.rows })
    }

    // ── KPIs ─────────────────────────────────────────────────
    if (tipo === 'kpis') {
      const r = await client.query(
        `WITH data AS (${margenQuery})
         SELECT
             COUNT(*)                                             AS total_skus,
             COUNT(*) FILTER (WHERE fuente_costo = 'Barrel & Block') AS skus_bb,
             ROUND(AVG(ganancia_pct)::numeric, 2)                AS ganancia_promedio_pct,
             ROUND(AVG(margen)::numeric, 4)                      AS margen_promedio,
             ROUND(MIN(ganancia_pct)::numeric, 2)                AS ganancia_minima_pct,
             ROUND(MAX(ganancia_pct)::numeric, 2)                AS ganancia_maxima_pct,
             COUNT(*) FILTER (WHERE estado_margen = 'critico')  AS skus_criticos,
             COUNT(*) FILTER (WHERE estado_margen = 'bajo')     AS skus_bajo_margen,
             COUNT(*) FILTER (WHERE estado_margen = 'ok')       AS skus_ok,
             COUNT(*) FILTER (WHERE estado_margen = 'sin_precio') AS sin_precio,
             (SELECT sku || ' — ' || COALESCE(descripcion,'') FROM data
              WHERE ganancia_pct IS NOT NULL ORDER BY ganancia_pct DESC LIMIT 1) AS sku_mas_rentable,
             (SELECT sku || ' — ' || COALESCE(descripcion,'') FROM data
              WHERE ganancia_pct IS NOT NULL ORDER BY ganancia_pct ASC  LIMIT 1) AS sku_menos_rentable
         FROM data`,
        paisParams
      )
      client.release()
      return NextResponse.json(r.rows[0] || {})
    }

    // ── Historial costos manual ───────────────────────────────
    if (tipo === 'historial') {
      const condHist = [
        ...(baseCond ? [baseCond.replace('WHERE ', '')] : []),
        ...(fechaConds),
      ]
      const r = await client.query(
        `SELECT pais, sku, descripcion, zona,
                ROUND(costo_unitario::numeric,4) AS costo_unitario,
                ROUND(costo_logistico::numeric,4) AS costo_logistico,
                ROUND(costo_total::numeric,4) AS costo_total,
                fecha
         FROM costos
         ${condHist.length ? 'WHERE ' + condHist.join(' AND ') : ''}
         ORDER BY fecha DESC LIMIT 200`,
        paisParams
      )
      client.release()
      return NextResponse.json({ rows: r.rows })
    }

    client.release()
    return NextResponse.json({ error: 'tipo no válido' }, { status: 400 })

  } catch (err: any) {
    client.release()
    if (err.code === '42P01') {
      return NextResponse.json({ rows: [], empty: true, message: 'Tablas de costos/precios no creadas aún' })
    }
    console.error('ventas/costos error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
