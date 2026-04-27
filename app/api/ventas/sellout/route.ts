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
    const buscarP        = searchParams.get('buscar') || ''
    const page           = parseInt(searchParams.get('page') || '1')
    const pageSize       = parseInt(searchParams.get('pageSize') || '500')
    const offset         = (page - 1) * pageSize

    // mvConds: filters safe for mv_sellout_mensual (no dia, no codigo_barras)
    const mvConds:  string[] = []
    // rawConds: filters for fact_sales_sellout (has dia, codigo_barras)
    const rawConds: string[] = ['dia > 0']
    const params: unknown[] = []
    let idx = 1

    const anosArr = anosStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n))
    if (anosArr.length > 0) {
      const c = `ano IN (${anosArr.map(() => `$${idx++}`).join(', ')})`
      mvConds.push(c); rawConds.push(c)
      params.push(...anosArr)
    }

    const mesesArr = mesesStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n))
    if (mesesArr.length > 0) {
      const c = `mes IN (${mesesArr.map(() => `$${idx++}`).join(', ')})`
      mvConds.push(c); rawConds.push(c)
      params.push(...mesesArr)
    }

    const paisesArr = paisesP ? paisesP.split(',').map(s => s.trim()).filter(Boolean) : []
    if (paisesArr.length > 0) {
      const c = `pais IN (${paisesArr.map(() => `$${idx++}`).join(', ')})`
      mvConds.push(c); rawConds.push(c)
      params.push(...paisesArr)
    }

    const catsArr = categoriasP ? categoriasP.split(',').map(s => s.trim()).filter(Boolean) : []
    if (catsArr.length > 0) {
      const c = `categoria IN (${catsArr.map(() => `$${idx++}`).join(', ')})`
      mvConds.push(c); rawConds.push(c)
      params.push(...catsArr)
    }

    const subcatsArr = subcategoriasP ? subcategoriasP.split(',').map(s => s.trim()).filter(Boolean) : []
    if (subcatsArr.length > 0) {
      const c = `subcategoria IN (${subcatsArr.map(() => `$${idx++}`).join(', ')})`
      mvConds.push(c); rawConds.push(c)
      params.push(...subcatsArr)
    }

    const clientesArr = clientesP ? clientesP.split(',').map(s => s.trim()).filter(Boolean) : []
    if (clientesArr.length > 0) {
      const c = `cliente IN (${clientesArr.map(() => `$${idx++}`).join(', ')})`
      mvConds.push(c); rawConds.push(c)
      params.push(...clientesArr)
    }

    const skusArr = skusP ? skusP.split(',').map(s => s.trim()).filter(Boolean) : []
    if (skusArr.length > 0) {
      const c = `sku IN (${skusArr.map(() => `$${idx++}`).join(', ')})`
      mvConds.push(c); rawConds.push(c)
      params.push(...skusArr)
    }

    if (buscarP) {
      // codigo_barras only exists in fact_sales_sellout, not in MV — add to rawConds only
      rawConds.push(`(codigo_barras ILIKE $${idx} OR sku ILIKE $${idx} OR descripcion ILIKE $${idx})`)
      // For MV fallback search, use sku + descripcion only
      mvConds.push(`(sku ILIKE $${idx} OR descripcion ILIKE $${idx})`)
      params.push(`%${buscarP}%`); idx++
    }

    const mvWhere  = mvConds.length  ? 'WHERE ' + mvConds.join(' AND ')  : ''
    const rawWhere = 'WHERE ' + rawConds.join(' AND ')

    // KPI and count from MV (fast), rows from raw table
    const [kpiR, countR, r] = await Promise.all([
      pool.query(
        `SELECT ROUND(SUM(ventas_valor)::numeric, 2) AS total_valor,
                ROUND(SUM(ventas_unidades)::numeric, 0) AS total_unidades
         FROM mv_sellout_mensual ${mvWhere}`,
        params
      ),
      pool.query(
        `SELECT COUNT(*) AS total FROM fact_sales_sellout ${rawWhere}`,
        params
      ),
      pool.query(
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
         FROM fact_sales_sellout ${rawWhere}
         ORDER BY ano DESC, mes DESC, dia DESC, ventas_valor DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, pageSize, offset]
      ),
    ])
    const kpi = {
      total_valor:    parseFloat(kpiR.rows[0]?.total_valor ?? '0'),
      total_unidades: parseFloat(kpiR.rows[0]?.total_unidades ?? '0'),
    }
    const total = parseInt(countR.rows[0]?.total ?? '0')

    return NextResponse.json({ rows: r.rows, kpi, total, page, pageSize })
  } catch (err) {
    return handleApiError(err)
  }
}
