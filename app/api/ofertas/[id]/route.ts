import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { handleApiError, AppError } from '@/lib/api/errors'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) throw new AppError(401, 'Not authenticated', 'Authentication required')

    const id = Number(params.id)
    if (!id) throw new AppError(400, 'Invalid id', 'ID inválido')

    const body = await req.json()
    const {
      cliente, codigo_interno, ean, descripcion,
      baseline_mensual, baseline_diario,
      periodo_oferta_inicio, periodo_oferta_fin,
      precio_regular, precio_oferta,
    } = body

    if (!cliente?.trim())       throw new AppError(400, 'cliente required', 'El campo cliente es requerido')
    if (!periodo_oferta_inicio) throw new AppError(400, 'inicio required',  'Fecha de inicio requerida')
    if (!periodo_oferta_fin)    throw new AppError(400, 'fin required',     'Fecha de fin requerida')
    if (periodo_oferta_fin < periodo_oferta_inicio)
      throw new AppError(400, 'dates', 'La fecha de fin debe ser mayor o igual a la de inicio')

    const { data, error } = await supabase
      .from('dim_ofertas')
      .update({
        cliente:               cliente.trim(),
        codigo_interno:        codigo_interno || null,
        ean:                   ean            || null,
        descripcion:           descripcion    || null,
        baseline_mensual:      Number(baseline_mensual) || 0,
        baseline_diario:       Number(baseline_diario)  || 0,
        periodo_oferta_inicio,
        periodo_oferta_fin,
        precio_regular:        Number(precio_regular) || 0,
        precio_oferta:         Number(precio_oferta)  || 0,
        updated_at:            new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw new AppError(500, error.message, 'Error al actualizar oferta')
    if (!data)  throw new AppError(404, 'not found', 'Oferta no encontrada')
    return NextResponse.json({ oferta: data })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) throw new AppError(401, 'Not authenticated', 'Authentication required')

    const id = Number(params.id)
    if (!id) throw new AppError(400, 'Invalid id', 'ID inválido')

    const { error } = await supabase
      .from('dim_ofertas')
      .delete()
      .eq('id', id)

    if (error) throw new AppError(500, error.message, 'Error al eliminar oferta')
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}
