import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError, AppError } from '@/lib/api/errors'
import { requireAuth } from '@/lib/api/auth'

export const dynamic = 'force-dynamic'

/**
 * GET    /api/ofertas-impacto/[id]   → oferta + productos
 * PUT    /api/ofertas-impacto/[id]   → actualiza cabecera + reemplaza productos
 * DELETE /api/ofertas-impacto/[id]
 */

interface ProductoInput {
  upc:          string
  item_nbr?:    string | null
  descripcion?: string | null
}

interface PutBody {
  nombre?:           string
  mecanica?:         string | null
  precio_display?:   string | null
  precio_regular?:   number | null
  precio_oferta?:    number | null
  pais?:             string
  cadenas?:          string[]
  vigencia_inicio?:  string
  vigencia_fin?:     string
  semanas_ventana?:  number
  productos?:        ProductoInput[]
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth()
    const id = params.id

    const [ofertaR, prodR] = await Promise.all([
      pool.query(
        `SELECT id, nombre, mecanica, precio_display, precio_regular, precio_oferta,
                pais, cadenas, vigencia_inicio, vigencia_fin, semanas_ventana,
                created_by, created_at, updated_at
         FROM ofertas WHERE id = $1`,
        [id],
      ),
      pool.query(
        `SELECT id, upc, item_nbr, descripcion
         FROM oferta_productos
         WHERE oferta_id = $1
         ORDER BY descripcion NULLS LAST, upc`,
        [id],
      ),
    ])

    if (ofertaR.rowCount === 0) throw new AppError(404, 'not found', 'Oferta no encontrada')

    return NextResponse.json({
      oferta:    ofertaR.rows[0],
      productos: prodR.rows,
    })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const client = await pool.connect()
  try {
    await requireAuth()
    const id = params.id
    const body = (await req.json()) as PutBody

    // Validación selectiva (solo campos presentes)
    if (body.vigencia_inicio && body.vigencia_fin && body.vigencia_fin < body.vigencia_inicio)
      throw new AppError(400, 'dates', 'La fecha fin debe ser >= inicio')
    if (body.cadenas !== undefined && (!Array.isArray(body.cadenas) || body.cadenas.length === 0))
      throw new AppError(400, 'cadenas', 'Debe seleccionar al menos una cadena')
    if (body.semanas_ventana !== undefined && (body.semanas_ventana < 1 || body.semanas_ventana > 12))
      throw new AppError(400, 'semanas', 'semanas_ventana debe estar entre 1 y 12')

    await client.query('BEGIN')

    // Update de cabecera — solo columnas presentes en el body
    const sets: string[] = []
    const vals: any[] = []
    const put = (col: string, val: any) => { sets.push(`${col} = $${vals.length + 1}`); vals.push(val) }

    if (body.nombre         !== undefined) put('nombre',          body.nombre.trim())
    if (body.mecanica       !== undefined) put('mecanica',        body.mecanica?.trim() ?? null)
    if (body.precio_display !== undefined) put('precio_display',  body.precio_display?.trim() ?? null)
    if (body.precio_regular !== undefined) put('precio_regular',  body.precio_regular)
    if (body.precio_oferta  !== undefined) put('precio_oferta',   body.precio_oferta)
    if (body.pais           !== undefined) put('pais',            body.pais.trim())
    if (body.cadenas        !== undefined) put('cadenas',         body.cadenas.map(c => c.trim()).filter(Boolean))
    if (body.vigencia_inicio!== undefined) put('vigencia_inicio', body.vigencia_inicio)
    if (body.vigencia_fin   !== undefined) put('vigencia_fin',    body.vigencia_fin)
    if (body.semanas_ventana!== undefined) put('semanas_ventana', body.semanas_ventana)

    if (sets.length > 0) {
      vals.push(id)
      const upd = await client.query(
        `UPDATE ofertas SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING id`,
        vals,
      )
      if (upd.rowCount === 0) throw new AppError(404, 'not found', 'Oferta no encontrada')
    } else {
      // Sin cambios de cabecera — igual verificar que existe
      const exists = await client.query('SELECT 1 FROM ofertas WHERE id = $1', [id])
      if (exists.rowCount === 0) throw new AppError(404, 'not found', 'Oferta no encontrada')
    }

    // Si vienen productos, reemplazar el set completo
    if (body.productos !== undefined) {
      const unique = Array.from(
        new Map(body.productos.filter(p => p.upc?.trim()).map(p => [p.upc.trim(), p])).values(),
      )
      if (unique.length === 0) throw new AppError(400, 'productos empty', 'Debe quedar al menos un producto')

      await client.query('DELETE FROM oferta_productos WHERE oferta_id = $1', [id])

      const values: string[] = []
      const params: any[] = []
      unique.forEach((p, i) => {
        const base = i * 4
        values.push(`($${base+1}, $${base+2}, $${base+3}, $${base+4})`)
        params.push(id, p.upc.trim(), p.item_nbr?.trim() ?? null, p.descripcion?.trim() ?? null)
      })
      await client.query(
        `INSERT INTO oferta_productos (oferta_id, upc, item_nbr, descripcion) VALUES ${values.join(',')}`,
        params,
      )
    }

    await client.query('COMMIT')
    return NextResponse.json({ id })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    return handleApiError(err)
  } finally {
    client.release()
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth()
    const r = await pool.query('DELETE FROM ofertas WHERE id = $1 RETURNING id', [params.id])
    if (r.rowCount === 0) throw new AppError(404, 'not found', 'Oferta no encontrada')
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}
