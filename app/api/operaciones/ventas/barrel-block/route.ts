// app/api/operaciones/ventas/barrel-block/route.ts
// Compras Barrel & Block — fuente primaria de costos
import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'
import { getUserRestrictions } from '@/lib/auth/restrictions'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
})

// ── GET ──────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tipo       = searchParams.get('tipo') || 'compras'  // compras | kpis | tendencia | filtros | skus_costo
  const pais       = searchParams.get('pais')
  const sku        = searchParams.get('sku')
  const proveedor  = searchParams.get('proveedor')
  const anoP       = searchParams.get('ano')
  const mesP       = searchParams.get('mes')
  const categoriaP = searchParams.get('categoria')          // barrel | block

  const restrictions = await getUserRestrictions()
  const client = await pool.connect()

  try {
    // ── Filtros disponibles ──────────────────────────────────
    if (tipo === 'filtros') {
      const catWhere = categoriaP ? `WHERE tipo = '${categoriaP === 'barrel' ? 'barrel' : 'block'}'` : ''
      const [rSkus, rProveedores, rPeriodos] = await Promise.all([
        client.query(`SELECT DISTINCT sku, descripcion FROM barrel_block ${catWhere} ORDER BY sku LIMIT 500`),
        client.query(`SELECT DISTINCT proveedor FROM barrel_block WHERE proveedor IS NOT NULL ${categoriaP ? `AND tipo = '${categoriaP === 'barrel' ? 'barrel' : 'block'}'` : ''} ORDER BY proveedor`),
        client.query(`
          SELECT DISTINCT
            EXTRACT(YEAR  FROM fecha_compra)::INT AS ano,
            EXTRACT(MONTH FROM fecha_compra)::INT AS mes
          FROM barrel_block
          ${catWhere}
          ORDER BY ano DESC, mes DESC
          LIMIT 36`),
      ])
      client.release()
      return NextResponse.json({
        skus:        rSkus.rows,
        proveedores: rProveedores.rows.map((r: any) => r.proveedor),
        periodos:    rPeriodos.rows,
      })
    }

    // ── Condiciones de filtro ────────────────────────────────
    const conds: string[] = ['1=1']
    const params: any[]   = []
    let idx = 1

    if (restrictions?.isRestricted && restrictions.paises.length > 0) {
      const allowed = restrictions.paises
      if (pais && pais !== 'Todos' && allowed.includes(pais)) {
        conds.push(`bb.pais = $${idx++}`); params.push(pais)
      } else {
        conds.push(`bb.pais IN (${allowed.map(() => `$${idx++}`).join(', ')})`); params.push(...allowed)
      }
    } else {
      if (pais && pais !== 'Todos') { conds.push(`bb.pais = $${idx++}`); params.push(pais) }
    }

    if (sku        && sku        !== 'Todos') { conds.push(`bb.sku = $${idx++}`);          params.push(sku) }
    if (proveedor  && proveedor  !== 'Todos') { conds.push(`bb.proveedor ILIKE $${idx++}`); params.push('%' + proveedor + '%') }
    if (anoP) { conds.push(`EXTRACT(YEAR  FROM bb.fecha_compra)::INT = $${idx++}`); params.push(parseInt(anoP)) }
    if (mesP) { conds.push(`EXTRACT(MONTH FROM bb.fecha_compra)::INT = $${idx++}`); params.push(parseInt(mesP)) }
    if (categoriaP && (categoriaP === 'barrel' || categoriaP === 'block')) {
      conds.push(`bb.tipo = $${idx++}`); params.push(categoriaP)
    }

    const where = 'WHERE ' + conds.join(' AND ')

    // ── KPIs ─────────────────────────────────────────────────
    if (tipo === 'kpis') {
      const r = await client.query(
        `SELECT
            COUNT(*)                                        AS total_compras,
            COUNT(DISTINCT bb.sku)                          AS n_skus,
            ROUND(SUM(bb.costo_total_lote)::numeric, 2)     AS inversion_total,
            ROUND(SUM(bb.volumen_comprado)::numeric, 0)     AS volumen_total,
            ROUND(AVG(bb.costo_compra)::numeric, 4)         AS costo_unitario_promedio,
            COUNT(DISTINCT bb.proveedor)                    AS n_proveedores
         FROM barrel_block bb ${where}`,
        params
      )
      client.release()
      return NextResponse.json(r.rows[0] || {})
    }

    // ── Tendencia de compras mensual ─────────────────────────
    if (tipo === 'tendencia') {
      const r = await client.query(
        `SELECT
            EXTRACT(YEAR  FROM bb.fecha_compra)::INT  AS ano,
            EXTRACT(MONTH FROM bb.fecha_compra)::INT  AS mes,
            COUNT(DISTINCT bb.sku)                    AS n_skus,
            ROUND(SUM(bb.costo_total_lote)::numeric, 2) AS inversion,
            ROUND(SUM(bb.volumen_comprado)::numeric, 0) AS volumen
         FROM barrel_block bb ${where}
         GROUP BY
            EXTRACT(YEAR  FROM bb.fecha_compra),
            EXTRACT(MONTH FROM bb.fecha_compra)
         ORDER BY ano ASC, mes ASC`,
        params
      )
      client.release()
      return NextResponse.json({ rows: r.rows })
    }

    // ── Último costo por SKU (para la vista de Costos) ───────
    if (tipo === 'skus_costo') {
      const r = await client.query(
        `SELECT DISTINCT ON (bb.sku)
            bb.pais, bb.sku, bb.descripcion,
            bb.costo_compra   AS costo_unitario,
            bb.fecha_compra   AS fecha_ultima_compra,
            bb.proveedor
         FROM barrel_block bb ${where}
         ORDER BY bb.sku, bb.fecha_compra DESC`,
        params
      )
      client.release()
      return NextResponse.json({ rows: r.rows })
    }

    // ── Lista de compras (default) ───────────────────────────
    const r = await client.query(
      `SELECT
          bb.id,
          bb.pais, bb.sku, bb.descripcion, bb.proveedor, bb.tipo,
          ROUND(bb.costo_compra::numeric, 4)         AS costo_compra,
          bb.fecha_compra,
          ROUND(bb.volumen_comprado::numeric, 2)     AS volumen_comprado,
          ROUND(bb.costo_total_lote::numeric, 2)     AS costo_total_lote,
          bb.lote, bb.referencia, bb.notas,
          pr.precio_objetivo                         AS precio_venta_ref,
          CASE WHEN pr.precio_objetivo > 0
               THEN ROUND((pr.precio_objetivo - bb.costo_compra)::numeric, 4)
               ELSE NULL END                         AS margen,
          CASE WHEN pr.precio_objetivo > 0
               THEN ROUND(((pr.precio_objetivo - bb.costo_compra) / pr.precio_objetivo * 100)::numeric, 2)
               ELSE NULL END                         AS ganancia_pct
       FROM barrel_block bb
       LEFT JOIN (
           SELECT DISTINCT ON (pais, sku)
               pais, sku, precio_objetivo
           FROM precios
           ORDER BY pais, sku, fecha DESC
       ) pr ON pr.pais = bb.pais AND pr.sku = bb.sku
       ${where}
       ORDER BY bb.fecha_compra DESC, bb.sku
       LIMIT 500`,
      params
    )
    client.release()
    return NextResponse.json({ rows: r.rows })

  } catch (err: any) {
    client.release()
    if (err.code === '42P01') {
      return NextResponse.json({ rows: [], empty: true, message: 'Tabla barrel_block no creada aún' })
    }
    console.error('barrel-block error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ── POST — Registrar nueva compra ─────────────────────────────
export async function POST(req: NextRequest) {
  const restrictions = await getUserRestrictions()
  if (!restrictions || restrictions.isRestricted) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const body = await req.json()
  const { sku, descripcion, proveedor, costo_compra, fecha_compra, volumen_comprado, lote, referencia, notas, tipo } = body

  if (!sku || !costo_compra || !fecha_compra) {
    return NextResponse.json({ error: 'sku, costo_compra y fecha_compra son requeridos' }, { status: 400 })
  }

  const tipoVal = tipo === 'block' ? 'block' : 'barrel'

  const client = await pool.connect()
  try {
    const r = await client.query(
      `INSERT INTO barrel_block
          (pais, sku, descripcion, proveedor, costo_compra, fecha_compra, volumen_comprado, lote, referencia, notas, tipo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id, sku, costo_compra, fecha_compra, costo_total_lote, tipo`,
      [
        'US',
        sku,
        descripcion || null,
        proveedor   || 'Dairy Farmers of America',
        Number(costo_compra),
        fecha_compra,
        Number(volumen_comprado) || 1,
        lote        || null,
        referencia  || null,
        notas       || null,
        tipoVal,
      ]
    )
    client.release()
    return NextResponse.json({ ok: true, row: r.rows[0] })
  } catch (err: any) {
    client.release()
    console.error('barrel-block POST error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
