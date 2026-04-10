import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } }
)

function eanNorm(raw: string): string | null {
  const s = (raw || '').replace(/\D/g, '')
  if (s.length < 2) return null
  return s.length >= 13 ? s.slice(0, 13) : s.padStart(13, '0')
}

export async function GET(_req: NextRequest) {
  try {
    const { data, error } = await supabase
      .from('precios_colombia')
      .select('cod_barras, cod_interno, descripcion, cadena, formato, precio_compra, precio_comparable, precio_venta')

    if (error) throw new Error(error.message)

    // Mapa: ean → precios (sin cadena = genérico)
    // Mapa: cod_interno → precios
    // Si hay precio por cadena específica, tiene prioridad sobre genérico
    type PrecioEntry = { pc: number; pcomp: number; pv: number }
    const byEan:    Record<string, PrecioEntry> = {}
    const bySku:    Record<string, PrecioEntry> = {}

    for (const row of (data || [])) {
      const entry: PrecioEntry = {
        pc:    Number(row.precio_compra)    || 0,
        pcomp: Number(row.precio_comparable) || 0,
        pv:    Number(row.precio_venta)     || 0,
      }

      const en = eanNorm(row.cod_barras || '')
      if (en) {
        // específico por cadena gana sobre genérico (sin cadena)
        if (!byEan[en] || row.cadena) byEan[en] = entry
        // v_ventas almacena EANs con el check digit cortado y cero prepuesto
        // ej: 7452105970291 → 0745210597029  (mismo bug del normalizador viejo)
        const altKey = '0' + en.slice(0, 12)
        if (altKey !== en && (!byEan[altKey] || row.cadena)) byEan[altKey] = entry
      }

      const sk = (row.cod_interno || '').trim().toUpperCase()
      if (sk) {
        if (!bySku[sk] || row.cadena) bySku[sk] = entry
      }
    }

    return NextResponse.json({ byEan, bySku, _debug: { rawSample: (data || []).slice(0, 3) } })
  } catch (err: any) {
    console.error('precios/colombia error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { cod_interno, precio_compra, precio_comparable, precio_venta, precio_cellar, precio_tirada } = body

    if (!cod_interno) return NextResponse.json({ error: 'cod_interno requerido' }, { status: 400 })

    const updates: Record<string, number> = {}
    if (precio_compra    != null) updates.precio_compra    = Number(precio_compra)
    if (precio_comparable != null) updates.precio_comparable = Number(precio_comparable)
    if (precio_venta     != null) updates.precio_venta     = Number(precio_venta)
    if (precio_cellar    != null) updates.precio_cellar    = Number(precio_cellar)
    if (precio_tirada    != null) updates.precio_tirada    = Number(precio_tirada)

    if (Object.keys(updates).length === 0)
      return NextResponse.json({ error: 'Sin campos a actualizar' }, { status: 400 })

    const { error } = await supabase
      .from('precios_colombia')
      .update(updates)
      .eq('cod_interno', cod_interno.trim().toUpperCase())

    if (error) throw new Error(error.message)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('precios/colombia PATCH error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
