import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams

    const page     = parseInt(sp.get('page')     || '1')
    const pageSize = parseInt(sp.get('pageSize') || '500')
    const offset   = (page - 1) * pageSize

    const conds: string[] = []
    const params: unknown[] = []
    let idx = 1

    // Período
    const anosArr  = (sp.get('anos')  || sp.get('ano')  || '').split(',').map(Number).filter(n => n > 2000)
    const mesesArr = (sp.get('meses') || sp.get('mes')  || '').split(',').map(Number).filter(n => n >= 1 && n <= 12)
    if (anosArr.length)  { conds.push(`ano IN (${anosArr.map(() => `$${idx++}`).join(',')})`);  params.push(...anosArr) }
    if (mesesArr.length) { conds.push(`mes IN (${mesesArr.map(() => `$${idx++}`).join(',')})`); params.push(...mesesArr) }

    // Geografía
    const paisesArr = (sp.get('paises') || '').split(',').map(s => s.trim()).filter(Boolean)
    if (paisesArr.length) { conds.push(`pais IN (${paisesArr.map(() => `$${idx++}`).join(',')})`); params.push(...paisesArr) }

    // Comercial
    const canalesArr  = (sp.get('canales')  || '').split(',').map(s => s.trim()).filter(Boolean)
    if (canalesArr.length)  { conds.push(`canal IN (${canalesArr.map(() => `$${idx++}`).join(',')})`);  params.push(...canalesArr) }

    const clientesArr = (sp.get('clientes') || '').split(',').map(s => s.trim()).filter(Boolean)
    if (clientesArr.length) { conds.push(`cliente IN (${clientesArr.map(() => `$${idx++}`).join(',')})`); params.push(...clientesArr) }

    const negocioArr = (sp.get('tipo_negocio') || '').split(',').map(s => s.trim()).filter(Boolean)
    if (negocioArr.length) { conds.push(`tipo_negocio IN (${negocioArr.map(() => `$${idx++}`).join(',')})`); params.push(...negocioArr) }

    // Producto
    const categArr = (sp.get('categorias') || '').split(',').map(s => s.trim()).filter(Boolean)
    if (categArr.length) { conds.push(`categoria IN (${categArr.map(() => `$${idx++}`).join(',')})`); params.push(...categArr) }

    const subcategArr = (sp.get('subcategorias') || '').split(',').map(s => s.trim()).filter(Boolean)
    if (subcategArr.length) { conds.push(`subcategoria IN (${subcategArr.map(() => `$${idx++}`).join(',')})`); params.push(...subcategArr) }

    const skusArr = (sp.get('skus') || '').split(',').map(s => s.trim()).filter(Boolean)
    if (skusArr.length) { conds.push(`sku IN (${skusArr.map(() => `$${idx++}`).join(',')})`); params.push(...skusArr) }

    // Búsqueda libre
    const buscarP = sp.get('buscar') || ''
    if (buscarP) {
      conds.push(`(sku ILIKE $${idx} OR descripcion ILIKE $${idx} OR cliente ILIKE $${idx})`)
      params.push(`%${buscarP}%`); idx++
    }

    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''

    // KPIs
    const kpiR = await pool.query(
      `SELECT
         ROUND(SUM(ingresos)::numeric,    2) AS total_ingresos,
         ROUND(SUM(unidades)::numeric,    0) AS total_unidades,
         ROUND(SUM(margen_valor)::numeric,2) AS total_margen,
         COUNT(DISTINCT cliente)             AS total_clientes,
         COUNT(DISTINCT sku)                 AS total_skus
       FROM v_sellin ${where}`,
      params
    )
    const kpi = {
      total_ingresos: parseFloat(kpiR.rows[0]?.total_ingresos ?? '0'),
      total_unidades: parseFloat(kpiR.rows[0]?.total_unidades ?? '0'),
      total_margen:   parseFloat(kpiR.rows[0]?.total_margen   ?? '0'),
      total_clientes: parseInt(kpiR.rows[0]?.total_clientes   ?? '0'),
      total_skus:     parseInt(kpiR.rows[0]?.total_skus       ?? '0'),
      margen_pct: kpiR.rows[0]?.total_ingresos > 0
        ? (parseFloat(kpiR.rows[0]?.total_margen ?? '0') / parseFloat(kpiR.rows[0]?.total_ingresos)) * 100
        : 0,
    }

    // Count (filas agrupadas)
    const countR = await pool.query(
      `SELECT COUNT(*) AS total FROM (
         SELECT pais, cliente, canal, sku, descripcion, categoria
         FROM v_sellin ${where}
         GROUP BY pais, cliente, canal, sku, descripcion, categoria
       ) sub`,
      params
    )
    const total = parseInt(countR.rows[0]?.total ?? '0')

    // Rows agrupadas
    const r = await pool.query(
      `SELECT
         pais,
         cliente,
         canal,
         tipo_negocio,
         sku,
         descripcion,
         categoria,
         subcategoria,
         ROUND(SUM(unidades)::numeric,    0) AS unidades,
         ROUND(SUM(cajas)::numeric,       2) AS cajas,
         ROUND(SUM(ingresos)::numeric,    2) AS ingresos,
         ROUND(SUM(margen_valor)::numeric,2) AS margen_valor,
         CASE WHEN SUM(ingresos) > 0
              THEN ROUND((SUM(margen_valor)/SUM(ingresos))::numeric, 4)
              ELSE 0 END                      AS margen_pct,
         CASE WHEN SUM(unidades) > 0
              THEN ROUND((SUM(ingresos)/SUM(unidades))::numeric, 4)
              ELSE 0 END                      AS precio_promedio
       FROM v_sellin ${where}
       GROUP BY pais, cliente, canal, tipo_negocio, sku, descripcion, categoria, subcategoria
       ORDER BY ingresos DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, pageSize, offset]
    )

    return NextResponse.json({ rows: r.rows, kpi, total, page, pageSize })
  } catch (err) {
    return handleApiError(err)
  }
}
