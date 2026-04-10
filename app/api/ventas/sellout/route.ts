import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const anosStr        = searchParams.get('anos') || searchParams.get('ano') || ''
    const mesesStr       = searchParams.get('meses') || searchParams.get('mes') || ''
    const paisesP        = searchParams.get('paises')
    const categoriasP    = searchParams.get('categorias')
    const subcategoriasP = searchParams.get('subcategorias')
    const clientesP      = searchParams.get('clientes')
    const skusP          = searchParams.get('skus')
    const barcodesP      = searchParams.get('barcodes')
    const page           = parseInt(searchParams.get('page') || '1')
    const pageSize       = parseInt(searchParams.get('pageSize') || '500')
    const offset         = (page - 1) * pageSize

    const conds: string[] = ['dia > 0']
    const params: unknown[] = []
    let idx = 1

    const anosArr = anosStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n))
    if (anosArr.length > 0) {
      conds.push(`ano IN (${anosArr.map(() => `$${idx++}`).join(', ')})`)
      params.push(...anosArr)
    }

    const mesesArr = mesesStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n))
    if (mesesArr.length > 0) {
      conds.push(`mes IN (${mesesArr.map(() => `$${idx++}`).join(', ')})`)
      params.push(...mesesArr)
    }

    const paisesArr = paisesP ? paisesP.split(',').map(s => s.trim()).filter(Boolean) : []
    if (paisesArr.length > 0) {
      conds.push(`pais IN (${paisesArr.map(() => `$${idx++}`).join(', ')})`)
      params.push(...paisesArr)
    }

    const catsArr = categoriasP ? categoriasP.split(',').map(s => s.trim()).filter(Boolean) : []
    if (catsArr.length > 0) {
      conds.push(`categoria IN (${catsArr.map(() => `$${idx++}`).join(', ')})`)
      params.push(...catsArr)
    }

    const subcatsArr = subcategoriasP ? subcategoriasP.split(',').map(s => s.trim()).filter(Boolean) : []
    if (subcatsArr.length > 0) {
      conds.push(`subcategoria IN (${subcatsArr.map(() => `$${idx++}`).join(', ')})`)
      params.push(...subcatsArr)
    }

    const clientesArr = clientesP ? clientesP.split(',').map(s => s.trim()).filter(Boolean) : []
    if (clientesArr.length > 0) {
      conds.push(`cliente IN (${clientesArr.map(() => `$${idx++}`).join(', ')})`)
      params.push(...clientesArr)
    }

    const skusArr = skusP ? skusP.split(',').map(s => s.trim()).filter(Boolean) : []
    if (skusArr.length > 0) {
      conds.push(`sku IN (${skusArr.map(() => `$${idx++}`).join(', ')})`)
      params.push(...skusArr)
    }

    const barcodesArr = barcodesP ? barcodesP.split(',').map(s => s.trim()).filter(Boolean) : []
    if (barcodesArr.length > 0) {
      conds.push(`codigo_barras IN (${barcodesArr.map(() => `$${idx++}`).join(', ')})`)
      params.push(...barcodesArr)
    }

    const where = 'WHERE ' + conds.join(' AND ')

    // KPI totals
    const kpiR = await pool.query(
      `SELECT ROUND(SUM(ventas_valor)::numeric, 2) AS total_valor,
              ROUND(SUM(ventas_unidades)::numeric, 0) AS total_unidades
       FROM v_ventas ${where}`,
      params
    )
    const kpi = {
      total_valor:    parseFloat(kpiR.rows[0]?.total_valor ?? '0'),
      total_unidades: parseFloat(kpiR.rows[0]?.total_unidades ?? '0'),
    }

    // Total count
    const countR = await pool.query(
      `SELECT COUNT(*) AS total FROM v_ventas ${where}`,
      params
    )
    const total = parseInt(countR.rows[0]?.total ?? '0')

    // Raw rows with pagination
    const r = await pool.query(
      `SELECT ano,
              mes,
              dia,
              pais,
              cliente,
              punto_venta,
              codigo_barras,
              sku,
              descripcion,
              subcategoria,
              ROUND(ventas_unidades::numeric, 0) AS ventas_unidades,
              ROUND(ventas_valor::numeric, 2)    AS ventas_valor
       FROM v_ventas ${where}
       ORDER BY ano DESC, mes DESC, dia DESC, ventas_valor DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, pageSize, offset]
    )

    return NextResponse.json({ rows: r.rows, kpi, total, page, pageSize })
  } catch (err) {
    return handleApiError(err)
  }
}
