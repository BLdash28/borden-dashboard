import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'
import { requireAuth } from '@/lib/api/auth'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()

    const { searchParams } = new URL(req.url)
    const categoria    = searchParams.get('categoria')   || ''
    const subcategoria = searchParams.get('subcategoria') || ''
    const buscar       = searchParams.get('buscar')       || ''

    const conds: string[] = []
    const vals: any[] = []

    if (categoria) {
      vals.push(categoria)
      conds.push(`UPPER(categoria) = UPPER($${vals.length})`)
    }
    if (subcategoria) {
      vals.push(subcategoria)
      conds.push(`UPPER(subcategoria) = UPPER($${vals.length})`)
    }
    if (buscar.trim()) {
      vals.push('%' + buscar.trim().toLowerCase() + '%')
      conds.push(`(LOWER(descripcion) LIKE $${vals.length} OR LOWER(sku) LIKE $${vals.length} OR LOWER(COALESCE(codigo_barras,'')) LIKE $${vals.length})`)
    }

    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''

    const { rows } = await pool.query(
      `SELECT
         id,
         sku,
         descripcion,
         categoria,
         subcategoria,
         codigo_barras,
         is_active
       FROM dim_producto
       ${where}
       ORDER BY categoria, subcategoria, descripcion`,
      vals
    )

    // Categorías y subcategorías únicas para los filtros
    const { rows: cats } = await pool.query(
      `SELECT DISTINCT categoria, subcategoria
       FROM dim_producto
       WHERE categoria IS NOT NULL
       ORDER BY categoria, subcategoria`
    )

    return NextResponse.json({ productos: rows, categorias: cats })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth()
    const { sku, descripcion, categoria, subcategoria, codigo_barras, presentacion, is_active } = await req.json()
    if (!sku?.trim() || !descripcion?.trim())
      return NextResponse.json({ error: 'SKU y descripción son requeridos' }, { status: 400 })

    const { rows } = await pool.query(
      `INSERT INTO dim_producto (sku, descripcion, categoria, subcategoria, codigo_barras, presentacion, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, sku, descripcion, categoria, subcategoria, codigo_barras, is_active`,
      [sku.trim(), descripcion.trim(), categoria || null, subcategoria || null,
       codigo_barras || null, presentacion || null, is_active !== false]
    )
    return NextResponse.json({ producto: rows[0] }, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAuth()
    const { id, sku, descripcion, categoria, subcategoria, codigo_barras, presentacion, is_active } = await req.json()
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    const sets: string[] = []
    const vals: any[] = []
    const add = (col: string, v: any) => { vals.push(v); sets.push(`${col} = $${vals.length}`) }

    if (sku        !== undefined) add('sku',          sku?.trim() || null)
    if (descripcion !== undefined) add('descripcion',  descripcion?.trim() || null)
    if (categoria  !== undefined) add('categoria',    categoria || null)
    if (subcategoria !== undefined) add('subcategoria', subcategoria || null)
    if (codigo_barras !== undefined) add('codigo_barras', codigo_barras || null)
    if (presentacion !== undefined) add('presentacion', presentacion || null)
    if (is_active  !== undefined) add('is_active',    is_active)

    if (sets.length === 0)
      return NextResponse.json({ error: 'Sin campos a actualizar' }, { status: 400 })

    vals.push(id)
    const { rows } = await pool.query(
      `UPDATE dim_producto SET ${sets.join(', ')}
       WHERE id = $${vals.length}
       RETURNING id, sku, descripcion, categoria, subcategoria, codigo_barras, is_active`,
      vals
    )
    if (rows.length === 0)
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })

    return NextResponse.json({ producto: rows[0] })
  } catch (err) {
    return handleApiError(err)
  }
}
