import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { handleApiError } from '@/lib/api/errors'
import { requireAuth } from '@/lib/api/auth'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  try {
    await requireAuth()

    const { searchParams } = new URL(req.url)
    const categoria    = searchParams.get('categoria')    || ''
    const subcategoria = searchParams.get('subcategoria') || ''
    const buscar       = searchParams.get('buscar')       || ''

    // ── Catálogo en Supabase ─────────────────────────────────────
    let q = supabase
      .from('dim_producto')
      .select('id, sku, descripcion, categoria, subcategoria, codigo_barras, is_active')
      .order('categoria').order('subcategoria').order('descripcion')

    if (categoria)    q = q.eq('categoria', categoria)
    if (subcategoria) q = q.eq('subcategoria', subcategoria)
    if (buscar.trim()) {
      q = q.or(
        `descripcion.ilike.%${buscar.trim()}%,sku.ilike.%${buscar.trim()}%,codigo_barras.ilike.%${buscar.trim()}%`
      )
    }

    const { data: rows, error } = await q.limit(2000)
    if (error) throw new Error(error.message)

    // Categorías únicas para filtros
    const { data: cats } = await supabase
      .from('dim_producto')
      .select('categoria, subcategoria')
      .not('categoria', 'is', null)
      .order('categoria').order('subcategoria')

    const catsUniq = Array.from(
      new Map((cats || []).map((c: any) => [`${c.categoria}|${c.subcategoria}`, c])).values()
    )

    return NextResponse.json({
      productos:  rows || [],
      categorias: catsUniq,
    })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth()
    const { sku, descripcion, categoria, subcategoria, codigo_barras, is_active } = await req.json()
    if (!sku?.trim() || !descripcion?.trim())
      return NextResponse.json({ error: 'SKU y descripción son requeridos' }, { status: 400 })

    const { data, error } = await supabase
      .from('dim_producto')
      .insert({
        sku:           sku.trim(),
        descripcion:   descripcion.trim(),
        categoria:     categoria     || null,
        subcategoria:  subcategoria  || null,
        codigo_barras: codigo_barras || null,
        is_active:     is_active !== false,
      })
      .select('id, sku, descripcion, categoria, subcategoria, codigo_barras, is_active')
      .single()

    if (error) throw new Error(error.message)
    return NextResponse.json({ producto: data }, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAuth()
    const { id, sku, descripcion, categoria, subcategoria, codigo_barras, is_active } = await req.json()
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    const updates: Record<string, any> = {}
    if (sku         !== undefined) updates.sku           = sku?.trim()          || null
    if (descripcion !== undefined) updates.descripcion   = descripcion?.trim()  || null
    if (categoria   !== undefined) updates.categoria     = categoria            || null
    if (subcategoria !== undefined) updates.subcategoria = subcategoria         || null
    if (codigo_barras !== undefined) updates.codigo_barras = codigo_barras      || null
    if (is_active   !== undefined) updates.is_active     = is_active

    if (Object.keys(updates).length === 0)
      return NextResponse.json({ error: 'Sin campos a actualizar' }, { status: 400 })

    const { data, error } = await supabase
      .from('dim_producto')
      .update(updates)
      .eq('id', id)
      .select('id, sku, descripcion, categoria, subcategoria, codigo_barras, is_active')
      .single()

    if (error) throw new Error(error.message)
    if (!data)  return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
    return NextResponse.json({ producto: data })
  } catch (err) {
    return handleApiError(err)
  }
}
