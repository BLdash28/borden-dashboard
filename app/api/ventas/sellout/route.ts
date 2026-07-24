import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

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

    const SORT_COLS: Record<string, string> = {
      mes: 'mes', dia: 'dia', pais: 'pais',
      ventas_valor: 'ventas_valor', ventas_unidades: 'ventas_unidades', ano: 'ano',
    }
    const sortCol = SORT_COLS[searchParams.get('sortBy') || ''] || 'mes'
    const sortDir = searchParams.get('sortDir') === 'asc' ? 'ASC' : 'DESC'

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

    if (buscarP) {
      conds.push(`(codigo_barras ILIKE $${idx} OR sku ILIKE $${idx} OR descripcion ILIKE $${idx})`)
      params.push(`%${buscarP}%`); idx++
    }

    const where = 'WHERE ' + conds.join(' AND ')
    // KPI usa mv_sellout_agg (4K filas, ~100ms) removiendo `dia > 0`.
    const whereAgg = conds.filter(c => c !== 'dia > 0').length
      ? 'WHERE ' + conds.filter(c => c !== 'dia > 0').join(' AND ')
      : ''

    // COUNT es costoso (4s+) sobre 943K filas. Sólo lo ejecutamos en la página 1;
    // en páginas siguientes reutilizamos el count desde el frontend.
    // Timeout defensivo de 2s: si Postgres tarda más, devolvemos null.
    const runCount = page === 1
    const countPromise = runCount
      ? (async () => {
          const client = await pool.connect()
          try {
            await client.query('SET LOCAL statement_timeout = 2000')
            const rc = await client.query(
              `SELECT COUNT(*) AS total FROM mmv_sellout_mensual ${where}`, params
            )
            return parseInt(rc.rows[0]?.total ?? '0')
          } catch {
            return null
          } finally {
            client.release()
          }
        })()
      : Promise.resolve(null)

    const [kpiR, countVal, r] = await Promise.all([
      pool.query(
        `SELECT ROUND(SUM(ventas_valor)::numeric, 2) AS total_valor,
                ROUND(SUM(ventas_unidades)::numeric, 0) AS total_unidades
         FROM mv_sellout_agg ${whereAgg}`,
        params
      ),
      countPromise,
      pool.query(
        `SELECT ano, mes, dia, pais, cliente, cadena, formato, punto_venta,
                codigo_barras, sku, descripcion, categoria, subcategoria,
                ROUND(ventas_unidades::numeric, 0) AS ventas_unidades,
                ROUND(ventas_valor::numeric, 2)    AS ventas_valor
         FROM mmv_sellout_mensual ${where}
         ORDER BY ${sortCol} ${sortDir}, ventas_valor DESC, dia DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, pageSize, offset]
      ),
    ])

    const kpi = {
      total_valor:    parseFloat(kpiR.rows[0]?.total_valor ?? '0'),
      total_unidades: parseFloat(kpiR.rows[0]?.total_unidades ?? '0'),
    }
    const total = countVal   // null si timeout o si page > 1
    const has_more = r.rows.length === pageSize

    return NextResponse.json({ rows: r.rows, kpi, total, has_more, page, pageSize })
  } catch (err) {
    return handleApiError(err)
  }
}
