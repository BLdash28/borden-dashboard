import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams

    const fetchAll = sp.get('all') === 'true'
    // Granularidad opcional: 'mes' agrega ano,mes al GROUP BY (para CSV mes a mes)
    const granularidad = sp.get('granularidad') === 'mes' ? 'mes' : 'combo'
    const page     = parseInt(sp.get('page')     || '1')
    const pageSize = parseInt(sp.get('pageSize') || '500')
    const offset   = (page - 1) * pageSize

    const conds: string[] = ['venta_neta > 0']
    const params: unknown[] = []
    let idx = 1

    // Período
    const anosArr  = (sp.get('anos')  || sp.get('ano')  || '').split(',').map(Number).filter(n => n > 2000)
    const mesesArr = (sp.get('meses') || sp.get('mes')  || '').split(',').map(Number).filter(n => n >= 1 && n <= 12)
    if (anosArr.length)  { conds.push(`ano_pedido IN (${anosArr.map(() => `$${idx++}`).join(',')})`);  params.push(...anosArr) }
    if (mesesArr.length) { conds.push(`mes IN (${mesesArr.map(() => `$${idx++}`).join(',')})`); params.push(...mesesArr) }

    // Geografía
    const paisesArr = (sp.get('paises') || '').split(',').map(s => s.trim()).filter(Boolean)
    if (paisesArr.length) { conds.push(`pais IN (${paisesArr.map(() => `$${idx++}`).join(',')})`); params.push(...paisesArr) }

    // Comercial
    const canalesArr  = (sp.get('canales')  || '').split(',').map(s => s.trim()).filter(Boolean)
    if (canalesArr.length)  { conds.push(`canal IN (${canalesArr.map(() => `$${idx++}`).join(',')})`);  params.push(...canalesArr) }

    const clientesArr = (sp.get('clientes') || '').split(',').map(s => s.trim()).filter(Boolean)
    if (clientesArr.length) { conds.push(`cliente_nombre IN (${clientesArr.map(() => `$${idx++}`).join(',')})`); params.push(...clientesArr) }

    const negocioArr = (sp.get('tipo_negocio') || '').split(',').map(s => s.trim()).filter(Boolean)
    if (negocioArr.length) { conds.push(`tipo_negocio IN (${negocioArr.map(() => `$${idx++}`).join(',')})`); params.push(...negocioArr) }

    // Producto
    const categArr = (sp.get('categorias') || '').split(',').map(s => s.trim()).filter(Boolean)
    if (categArr.length) { conds.push(`categoria IN (${categArr.map(() => `$${idx++}`).join(',')})`); params.push(...categArr) }

    const subcategArr = (sp.get('subcategorias') || '').split(',').map(s => s.trim()).filter(Boolean)
    if (subcategArr.length) { conds.push(`subcategoria IN (${subcategArr.map(() => `$${idx++}`).join(',')})`); params.push(...subcategArr) }

    const skusArr = (sp.get('skus') || '').split(',').map(s => s.trim()).filter(Boolean)
    if (skusArr.length) { conds.push(`sku IN (${skusArr.map(() => `$${idx++}`).join(',')})`); params.push(...skusArr) }

    const provArr = (sp.get('proveedores') || '').split(',').map(s => s.trim()).filter(Boolean)
    if (provArr.length) { conds.push(`proveedor IN (${provArr.map(() => `$${idx++}`).join(',')})`); params.push(...provArr) }

    // Búsqueda libre
    const buscarP = sp.get('buscar') || ''
    if (buscarP) {
      conds.push(`(sku ILIKE $${idx} OR descripcion ILIKE $${idx} OR cliente_nombre ILIKE $${idx})`)
      params.push(`%${buscarP}%`); idx++
    }

    const where = 'WHERE ' + conds.join(' AND ')

    // KPIs
    const kpiR = await pool.query(
      `SELECT
         ROUND(SUM(venta_neta)::numeric,      2) AS total_ingresos,
         ROUND(SUM(cantidad_cajas)::numeric,  0) AS total_unidades,
         ROUND(SUM(margen_valor)::numeric,    2) AS total_margen,
         COUNT(DISTINCT cliente_nombre)          AS total_clientes,
         COUNT(DISTINCT sku)                     AS total_skus
       FROM fact_sales_sellin ${where}`,
      params
    )
    // Total libras (solo Quesos — dim_producto.peso_lb es NULL para Leches/Helados).
    // Total litros (solo Leches — dim_producto.litros es NULL para Quesos/Helados).
    // Usamos CTE para aplicar el mismo where una sola vez sin colisión con dim_producto.
    const [lbR, ltR] = await Promise.all([
      pool.query(
        `WITH filtered AS (
           SELECT sku, cantidad_cajas FROM fact_sales_sellin ${where}
         )
         SELECT ROUND(SUM(f.cantidad_cajas * dp.peso_lb)::numeric, 1) AS total_lb
         FROM filtered f
         JOIN dim_producto dp ON dp.sku = f.sku
         WHERE dp.peso_lb IS NOT NULL`,
        params,
      ),
      pool.query(
        // Litros = cajas × VNPK (unidades por caja) × litros por unidad.
        // Todas las leches vienen con VNPK=12; usamos COALESCE por seguridad.
        `WITH filtered AS (
           SELECT sku, cantidad_cajas FROM fact_sales_sellin ${where}
         )
         SELECT ROUND(SUM(f.cantidad_cajas * COALESCE(dp.vnpk_qty, 1) * dp.litros)::numeric, 1) AS total_litros
         FROM filtered f
         JOIN dim_producto dp ON dp.sku = f.sku
         WHERE dp.litros IS NOT NULL`,
        params,
      ),
    ])
    const kpi = {
      total_ingresos: parseFloat(kpiR.rows[0]?.total_ingresos ?? '0'),
      total_unidades: parseFloat(kpiR.rows[0]?.total_unidades ?? '0'),
      total_margen:   parseFloat(kpiR.rows[0]?.total_margen   ?? '0'),
      total_clientes: parseInt(kpiR.rows[0]?.total_clientes   ?? '0'),
      total_skus:     parseInt(kpiR.rows[0]?.total_skus       ?? '0'),
      total_lb:       parseFloat(lbR.rows[0]?.total_lb        ?? '0'),
      total_litros:   parseFloat(ltR.rows[0]?.total_litros    ?? '0'),
      margen_pct: kpiR.rows[0]?.total_ingresos > 0
        ? (parseFloat(kpiR.rows[0]?.total_margen ?? '0') / parseFloat(kpiR.rows[0]?.total_ingresos)) * 100
        : 0,
    }

    // GROUP BY dinámico según granularidad
    // 'mes' = fila por (combo × mes × OC) — para CSV detallado
    // 'combo' = fila por combo (default de la tabla paginada)
    // NB: `ano` en la salida es el AÑO DEL PEDIDO (sufijo de numero_factura), no fecha_factura
    const groupBy = granularidad === 'mes'
      ? 'pais, cliente_nombre, canal, tipo_negocio, proveedor, sku, descripcion, categoria, subcategoria, ano_pedido, mes, numero_factura'
      : 'pais, cliente_nombre, canal, tipo_negocio, proveedor, sku, descripcion, categoria, subcategoria'
    const selectExtra = granularidad === 'mes' ? ', ano_pedido AS ano, mes, numero_factura AS orden_compra' : ''
    const countGroupBy = granularidad === 'mes'
      ? 'pais, cliente_nombre, canal, proveedor, sku, descripcion, categoria, ano_pedido, mes, numero_factura'
      : 'pais, cliente_nombre, canal, proveedor, sku, descripcion, categoria'

    // Count (filas agrupadas)
    const countR = await pool.query(
      `SELECT COUNT(*) AS total FROM (
         SELECT ${countGroupBy}
         FROM fact_sales_sellin ${where}
         GROUP BY ${countGroupBy}
       ) sub`,
      params
    )
    const total = parseInt(countR.rows[0]?.total ?? '0')

    // Rows agrupadas — usamos LATERAL para joinar peso_lb sin colisionar con
    // otras columnas de dim_producto (sku, descripcion, categoria, subcategoria).
    const r = await pool.query(
      `SELECT
         pais,
         cliente_nombre                               AS cliente,
         canal,
         tipo_negocio,
         proveedor,
         sku,
         descripcion,
         categoria,
         subcategoria${selectExtra},
         MIN(fecha_factura)                           AS fecha_min,
         MAX(fecha_factura)                           AS fecha_max,
         COUNT(DISTINCT fecha_factura)                AS dias_venta,
         ROUND(SUM(cantidad_unidades)::numeric, 0)   AS unidades,
         ROUND(SUM(cantidad_cajas)::numeric,    2)   AS cajas,
         ROUND(SUM(cantidad_cajas * dp.peso_lb)::numeric, 1) AS total_lb,
         ROUND(SUM(cantidad_cajas * COALESCE(dp.vnpk_qty, 1) * dp.litros)::numeric, 1) AS total_litros,
         ROUND(SUM(venta_neta)::numeric,        2)   AS ingresos,
         ROUND(SUM(margen_valor)::numeric,      2)   AS margen_valor,
         CASE WHEN SUM(venta_neta) > 0
              THEN ROUND((SUM(margen_valor)/SUM(venta_neta))::numeric, 4)
              ELSE 0 END                              AS margen_pct,
         CASE WHEN SUM(cantidad_cajas) > 0
              THEN ROUND((SUM(venta_neta)/SUM(cantidad_cajas))::numeric, 4)
              ELSE 0 END                              AS precio_promedio
       FROM fact_sales_sellin
       LEFT JOIN LATERAL (SELECT peso_lb, litros, vnpk_qty FROM dim_producto WHERE sku = fact_sales_sellin.sku LIMIT 1) dp ON true
       ${where}
       GROUP BY ${groupBy}
       ORDER BY ${granularidad === 'mes' ? 'ano_pedido, mes, ingresos DESC' : 'ingresos DESC'}
       ${fetchAll ? '' : `LIMIT $${idx} OFFSET $${idx + 1}`}`,
      fetchAll ? params : [...params, pageSize, offset]
    )

    return NextResponse.json({ rows: r.rows, kpi, total, page, pageSize })
  } catch (err) {
    return handleApiError(err)
  }
}
