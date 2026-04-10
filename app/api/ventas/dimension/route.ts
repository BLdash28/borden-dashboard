import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'
import { getUserRestrictions } from '@/lib/auth/restrictions'
import { withCache, cacheHeaders } from '@/lib/db/cache'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
})

const DIM_COLS: Record<string, string> = {
  pais:          'pais',
  categoria:     'categoria',
  subcategoria:  'subcategoria',
  cliente:       'cliente',
  cadena:        'cadena',
  formato:       'formato',
  tienda:        'punto_venta',
  sku:           'sku',
  producto:      'descripcion',
  codigo_barras: 'codigo_barras',
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const dim           = searchParams.get('dim') || 'pais'
  const anoP          = searchParams.get('anos') || searchParams.get('ano')
  const mesP          = searchParams.get('meses') || searchParams.get('mes')
  const pais          = searchParams.get('pais')         // single
  const paisesP       = searchParams.get('paises')       // comma-separated (cascading)
  const categoria     = searchParams.get('categoria')    // single
  const categoriasP   = searchParams.get('categorias')   // comma-separated (cascading)
  const cliente       = searchParams.get('cliente')
  const clientesP     = searchParams.get('clientes')     // comma-separated (cascading)
  const subcategoriasP = searchParams.get('subcategorias') // comma-separated (cascading)
  const skusP         = searchParams.get('skus')         // comma-separated (cascading)
  const sku           = searchParams.get('sku')

  const col = DIM_COLS[dim] || 'pais'

  const restrictions = await getUserRestrictions()

  try {
    const client = await pool.connect()

    const anosArr = anoP ? anoP.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)) : []
    const mesesArr = mesP ? mesP.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)) : []

    const conds: string[] = []
    const params: any[]   = []
    let idx = 1

    if (anosArr.length === 1) { conds.push('ano = $' + idx++); params.push(anosArr[0]) }
    else if (anosArr.length > 1) {
      conds.push(`ano IN (${anosArr.map(() => '$' + idx++).join(', ')})`); params.push(...anosArr)
    }
    if (mesesArr.length === 1) { conds.push('mes = $' + idx++); params.push(mesesArr[0]) }
    else if (mesesArr.length > 1) {
      conds.push(`mes IN (${mesesArr.map(() => '$' + idx++).join(', ')})`); params.push(...mesesArr)
    }

    // Country: handle multi-select (paisesP) + single pais + user restrictions
    const paisesArr = paisesP ? paisesP.split(',').map(s => s.trim()).filter(Boolean) : []
    if (restrictions?.isRestricted && restrictions.paises.length > 0) {
      const allowed = restrictions.paises
      const requested = paisesArr.length > 0 ? paisesArr : (pais && pais !== 'Todos' ? [pais] : [])
      const filtered = requested.length > 0
        ? requested.filter(p => allowed.includes(p))
        : allowed
      if (filtered.length > 0) {
        const ph = filtered.map(() => '$' + idx++).join(', ')
        conds.push(`pais IN (${ph})`)
        params.push(...filtered)
      }
    } else {
      // No restriction — use multi-select if present, else single
      if (paisesArr.length > 0) {
        const ph = paisesArr.map(() => '$' + idx++).join(', ')
        conds.push(`pais IN (${ph})`)
        params.push(...paisesArr)
      } else if (pais && pais !== 'Todos') {
        conds.push('pais = $' + idx++); params.push(pais)
      }
    }

    // Categoría: handle multi-select (categoriasP) + single categoria
    const categoriasArr = categoriasP ? categoriasP.split(',').map(s => s.trim()).filter(Boolean) : []
    if (categoriasArr.length > 0) {
      const ph = categoriasArr.map(() => '$' + idx++).join(', ')
      conds.push(`categoria IN (${ph})`)
      params.push(...categoriasArr)
    } else if (categoria && categoria !== 'Todas') {
      conds.push('categoria ILIKE $' + idx++); params.push('%' + categoria + '%')
    }

    // Cliente: handle multi-select (clientesP) + single cliente
    const clientesArr = clientesP ? clientesP.split(',').map(s => s.trim()).filter(Boolean) : []
    if (clientesArr.length > 0) {
      const ph = clientesArr.map(() => '$' + idx++).join(', ')
      conds.push(`cliente IN (${ph})`)
      params.push(...clientesArr)
    } else if (cliente && cliente !== 'Todos') {
      conds.push('cliente ILIKE $' + idx++); params.push('%' + cliente + '%')
    }

    // Subcategoría: multi-select cascade
    const subcategoriasArr = subcategoriasP ? subcategoriasP.split(',').map(s => s.trim()).filter(Boolean) : []
    if (subcategoriasArr.length > 0) {
      const ph = subcategoriasArr.map(() => '$' + idx++).join(', ')
      conds.push(`subcategoria IN (${ph})`)
      params.push(...subcategoriasArr)
    }

    // SKU: multi-select cascade (for barcode dim)
    const skusArr = skusP ? skusP.split(',').map(s => s.trim()).filter(Boolean) : []
    if (skusArr.length > 0) {
      const ph = skusArr.map(() => '$' + idx++).join(', ')
      conds.push(`sku IN (${ph})`)
      params.push(...skusArr)
    } else if (sku) {
      conds.push('(sku ILIKE $' + idx + ' OR descripcion ILIKE $' + idx + ')'); idx++; params.push('%' + sku + '%')
    }

    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''

    // codigo_barras: special label combining barcode + description
    let selectExpr: string
    let groupByExpr: string
    if (dim === 'codigo_barras') {
      selectExpr = "codigo_barras || ' — ' || descripcion AS nombre"
      groupByExpr = 'codigo_barras, descripcion'
    } else {
      selectExpr = `${col} AS nombre`
      groupByExpr = col
    }

    // Cache key: dim + full param string (unique per filter combo)
    const cacheKey = `dim:${dim}:${where}:${params.join(',')}`

    const { data: rows } = await withCache(
      cacheKey,
      async () => {
        const r = await client.query(
          `SELECT ${selectExpr}, ` +
          'ROUND(SUM(ventas_valor)::numeric,4)    AS ventas_valor, ' +
          'ROUND(SUM(ventas_unidades)::numeric,0) AS ventas_unidades, ' +
          'COUNT(DISTINCT sku)                    AS num_skus ' +
          'FROM v_ventas ' + where + ' ' +
          `GROUP BY ${groupByExpr} ORDER BY ventas_valor DESC LIMIT 300`,
          params
        )
        return r.rows
      },
      5 * 60_000 // 5 min TTL — dimension options are stable within a session
    )
    client.release()

    const modo = mesesArr.length ? 'mes' : anosArr.length ? 'ano' : 'todos'
    return NextResponse.json(
      { rows, anos: anosArr, meses: mesesArr, modo, dim },
      { headers: cacheHeaders(300) }
    )
  } catch (err: any) {
    console.error('dimension route error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
