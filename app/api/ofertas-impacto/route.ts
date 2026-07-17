import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError, AppError } from '@/lib/api/errors'
import { requireAuth } from '@/lib/api/auth'

export const dynamic = 'force-dynamic'

/**
 * GET  /api/ofertas-impacto
 *   Lista ofertas con conteo de productos y cadenas. Paginado.
 *   Query: ?buscar=&pais=&page=1&limit=20
 *
 * POST /api/ofertas-impacto
 *   Crea una oferta + sus productos en una transacción.
 *   Body: { nombre, mecanica, precio_display, precio_regular?, precio_oferta?,
 *           pais, cadenas: string[], vigencia_inicio, vigencia_fin,
 *           semanas_ventana, productos: [{ upc, item_nbr?, descripcion? }] }
 */

interface ProductoInput {
  upc:          string
  item_nbr?:    string | null
  descripcion?: string | null
}

interface OfertaBody {
  nombre:            string
  mecanica?:         string | null
  precio_display?:   string | null
  precio_regular?:   number | null
  precio_oferta?:    number | null
  pais:              string
  cadenas:           string[]
  vigencia_inicio:   string
  vigencia_fin:      string
  semanas_ventana?:  number
  productos:         ProductoInput[]
}

export async function GET(req: NextRequest) {
  try {
    await requireAuth()

    const sp     = req.nextUrl.searchParams
    const buscar = (sp.get('buscar') ?? '').trim()
    const pais   = (sp.get('pais')   ?? '').trim()
    const cadena = (sp.get('cadena') ?? '').trim()
    const page   = Math.max(1, Number(sp.get('page')  ?? '1'))
    const limit  = Math.min(100, Math.max(10, Number(sp.get('limit') ?? '20')))
    const offset = (page - 1) * limit

    const params: any[] = []
    const where: string[] = []
    if (buscar) {
      params.push(`%${buscar}%`)
      where.push(`(o.nombre ILIKE $${params.length} OR o.mecanica ILIKE $${params.length})`)
    }
    if (pais) {
      params.push(pais)
      where.push(`o.pais = $${params.length}`)
    }
    if (cadena) {
      // Devuelve ofertas donde esta cadena está incluida en el array `cadenas`.
      // Usa el índice GIN idx_ofertas_cadenas_gin.
      params.push(cadena)
      where.push(`$${params.length} = ANY(o.cadenas)`)
    }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : ''

    const listParams = [...params, limit, offset]
    const listSql = `
      SELECT
        o.id, o.nombre, o.mecanica,
        o.precio_regular, o.precio_oferta, o.precio_display,
        o.pais, o.cadenas, o.vigencia_inicio, o.vigencia_fin, o.semanas_ventana,
        o.created_at, o.updated_at,
        (SELECT COUNT(*) FROM oferta_productos op WHERE op.oferta_id = o.id) AS n_productos
      FROM ofertas o
      ${whereSql}
      ORDER BY o.vigencia_inicio DESC, o.created_at DESC
      LIMIT $${listParams.length - 1} OFFSET $${listParams.length}
    `
    const countSql = `SELECT COUNT(*)::int AS total FROM ofertas o ${whereSql}`

    const [listR, countR] = await Promise.all([
      pool.query(listSql, listParams),
      pool.query(countSql, params),
    ])

    return NextResponse.json({
      ofertas: listR.rows,
      total:   countR.rows[0]?.total ?? 0,
      page,
      limit,
    })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest) {
  const client = await pool.connect()
  try {
    const user = await requireAuth()
    const body = (await req.json()) as OfertaBody

    // Validación
    if (!body.nombre?.trim())        throw new AppError(400, 'nombre required',   'El nombre es requerido')
    if (!body.pais?.trim())          throw new AppError(400, 'pais required',     'El país es requerido')
    if (!Array.isArray(body.cadenas) || body.cadenas.length === 0)
      throw new AppError(400, 'cadenas required', 'Debe seleccionar al menos una cadena')
    if (!body.vigencia_inicio)       throw new AppError(400, 'inicio required',   'Vigencia inicio requerida')
    if (!body.vigencia_fin)          throw new AppError(400, 'fin required',      'Vigencia fin requerida')
    if (body.vigencia_fin < body.vigencia_inicio)
      throw new AppError(400, 'dates', 'La fecha fin debe ser >= inicio')
    if (!Array.isArray(body.productos) || body.productos.length === 0)
      throw new AppError(400, 'productos required', 'Debe seleccionar al menos un producto')

    const semanas = body.semanas_ventana ?? 4
    if (semanas < 1 || semanas > 12)
      throw new AppError(400, 'semanas', 'semanas_ventana debe estar entre 1 y 12')

    // Dedup productos por upc
    const uniqueProductos = Array.from(
      new Map(body.productos.filter(p => p.upc?.trim()).map(p => [p.upc.trim(), p])).values(),
    )
    if (uniqueProductos.length === 0)
      throw new AppError(400, 'productos empty', 'Ningún producto tiene UPC válido')

    await client.query('BEGIN')

    const insOfertaR = await client.query(
      `INSERT INTO ofertas
         (nombre, mecanica, precio_display, precio_regular, precio_oferta,
          pais, cadenas, vigencia_inicio, vigencia_fin, semanas_ventana, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id`,
      [
        body.nombre.trim(),
        body.mecanica?.trim() ?? null,
        body.precio_display?.trim() ?? null,
        body.precio_regular ?? null,
        body.precio_oferta  ?? null,
        body.pais.trim(),
        body.cadenas.map(c => c.trim()).filter(Boolean),
        body.vigencia_inicio,
        body.vigencia_fin,
        semanas,
        user.id,
      ],
    )
    const ofertaId = insOfertaR.rows[0].id as string

    // Bulk insert productos
    const values: string[] = []
    const params: any[] = []
    uniqueProductos.forEach((p, i) => {
      const base = i * 4
      values.push(`($${base+1}, $${base+2}, $${base+3}, $${base+4})`)
      params.push(ofertaId, p.upc.trim(), p.item_nbr?.trim() ?? null, p.descripcion?.trim() ?? null)
    })

    await client.query(
      `INSERT INTO oferta_productos (oferta_id, upc, item_nbr, descripcion)
       VALUES ${values.join(',')}`,
      params,
    )

    await client.query('COMMIT')

    return NextResponse.json({ id: ofertaId }, { status: 201 })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    return handleApiError(err)
  } finally {
    client.release()
  }
}
