import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams

    const anoP      = sp.get('ano')
    const mesP      = sp.get('mes')
    const paisesP   = sp.get('paises')
    const categP    = sp.get('categorias')
    const clientesP = sp.get('clientes')
    const canalesP  = sp.get('canales')
    const skusP     = sp.get('skus')
    const page      = parseInt(sp.get('page')     || '1')
    const pageSize  = parseInt(sp.get('pageSize') || '500')
    const offset    = (page - 1) * pageSize

    const conds: string[] = []
    const params: unknown[] = []
    let idx = 1

    const anosArr  = (sp.get('anos')  || anoP  || '').split(',').map(Number).filter(n => n > 2000)
    const mesesArr = (sp.get('meses') || mesP  || '').split(',').map(Number).filter(n => n >= 1 && n <= 12)
    if (anosArr.length)  { conds.push(`ano IN (${anosArr.map(() => `$${idx++}`).join(',')})`);  params.push(...anosArr) }
    if (mesesArr.length) { conds.push(`mes IN (${mesesArr.map(() => `$${idx++}`).join(',')})`); params.push(...mesesArr) }

    const paisesArr = paisesP ? paisesP.split(',').map(s => s.trim()).filter(Boolean) : []
    if (paisesArr.length) {
      conds.push(`pais IN (${paisesArr.map(() => `$${idx++}`).join(', ')})`)
      params.push(...paisesArr)
    }

    const categArr = categP ? categP.split(',').map(s => s.trim()).filter(Boolean) : []
    if (categArr.length) {
      conds.push(`categoria IN (${categArr.map(() => `$${idx++}`).join(', ')})`)
      params.push(...categArr)
    }

    const clientesArr = clientesP ? clientesP.split(',').map(s => s.trim()).filter(Boolean) : []
    if (clientesArr.length) {
      conds.push(`cliente IN (${clientesArr.map(() => `$${idx++}`).join(', ')})`)
      params.push(...clientesArr)
    }

    const canalesArr = canalesP ? canalesP.split(',').map(s => s.trim()).filter(Boolean) : []
    if (canalesArr.length) {
      conds.push(`canal IN (${canalesArr.map(() => `$${idx++}`).join(', ')})`)
      params.push(...canalesArr)
    }

    const skusArr = skusP ? skusP.split(',').map(s => s.trim()).filter(Boolean) : []
    if (skusArr.length) {
      conds.push(`sku IN (${skusArr.map(() => `$${idx++}`).join(', ')})`)
      params.push(...skusArr)
    }

    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''

    // KPIs
    const kpiR = await pool.query(
      `SELECT ROUND(SUM(ingresos)::numeric,  2) AS total_ingresos,
              ROUND(SUM(unidades)::numeric,   0) AS total_unidades,
              COUNT(DISTINCT cliente)            AS total_clientes
       FROM ventas_sell_in ${where}`,
      params
    )
    const kpi = {
      total_ingresos: parseFloat(kpiR.rows[0]?.total_ingresos ?? '0'),
      total_unidades: parseFloat(kpiR.rows[0]?.total_unidades ?? '0'),
      total_clientes: parseInt(kpiR.rows[0]?.total_clientes   ?? '0'),
    }

    // Count
    const countR = await pool.query(
      `SELECT COUNT(*) AS total FROM (
         SELECT pais, cliente, canal, sku, descripcion, categoria
         FROM ventas_sell_in ${where}
         GROUP BY pais, cliente, canal, sku, descripcion, categoria
       ) sub`,
      params
    )
    const total = parseInt(countR.rows[0]?.total ?? '0')

    // Rows
    const r = await pool.query(
      `SELECT pais,
              cliente,
              canal,
              sku,
              descripcion,
              categoria,
              ROUND(SUM(unidades)::numeric,  0) AS unidades,
              ROUND(SUM(ingresos)::numeric,  2) AS ingresos,
              CASE WHEN SUM(unidades) > 0
                   THEN ROUND((SUM(ingresos) / SUM(unidades))::numeric, 4)
                   ELSE 0 END                   AS precio_promedio
       FROM ventas_sell_in ${where}
       GROUP BY pais, cliente, canal, sku, descripcion, categoria
       ORDER BY ingresos DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, pageSize, offset]
    )

    return NextResponse.json({ rows: r.rows, kpi, total, page, pageSize })
  } catch (err) {
    return handleApiError(err)
  }
}
