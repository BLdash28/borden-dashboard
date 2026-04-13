import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function parseNum(v: string | undefined): number {
  if (!v) return 0
  return parseFloat(v.replace(/,/g, '').trim()) || 0
}

function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo    = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return d.getUTCFullYear() * 100 + weekNo
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file     = formData.get('file') as File | null
    const pais     = (formData.get('pais') as string || '').trim().toUpperCase()
    const semana   = formData.get('semana')
      ? Number(formData.get('semana'))
      : isoWeek(new Date())
    const diasPeriodo = Number(formData.get('dias_periodo') || 91)

    if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })
    if (!pais) return NextResponse.json({ error: 'Falta el campo pais' },  { status: 400 })

    const text  = await file.text()
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    if (lines.length < 2) return NextResponse.json({ error: 'CSV vacío' }, { status: 400 })

    const header = lines[0].split(',').map(h =>
      h.replace(/[^a-zA-Z0-9 ]/g, '').trim().toLowerCase()
    )

    const idx = (keywords: string[]): number =>
      header.findIndex(h => keywords.some(k => h.includes(k)))

    const col = {
      item_nbr:       idx(['item nbr', 'itemnbr', 'item_nbr', 'sku', 'nbr']),
      item:           idx(['item', 'descripcion', 'description', 'producto']),
      item_type:      idx(['item type', 'type', 'tipo']),
      item_status:    idx(['item status', 'status', 'estado']),
      inventario:     idx(['inventario', 'inventory', 'store inv']),
      ordenes:        idx(['ordenes', 'orders', 'orden']),
      transito:       idx(['transito', 'transit']),
      wharehouse:     idx(['wharehouse', 'warehouse', 'bodega']),
      inv_cedi_cajas: idx(['cedi cajas', 'cajas cedi', 'cajas']),
      inv_cedi_unds:  idx(['cedi unds', 'cedi unit', 'unds cedi', 'unidades cedi']),
      ventas:         idx(['ventas', 'sales', 'venta']),
    }

    const rows: Record<string, unknown>[] = []

    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(',')
      const get   = (c: number) => c >= 0 ? (cells[c] || '').trim() : ''
      const item_nbr = get(col.item_nbr)
      if (!item_nbr) continue

      rows.push({
        semana,
        pais,
        item_nbr,
        item:           get(col.item),
        item_type:      get(col.item_type),
        item_status:    get(col.item_status),
        inventario:     parseNum(get(col.inventario)),
        ordenes:        parseNum(get(col.ordenes)),
        transito:       parseNum(get(col.transito)),
        wharehouse:     parseNum(get(col.wharehouse)),
        inv_cedi_cajas: parseNum(get(col.inv_cedi_cajas)),
        inv_cedi_unds:  parseNum(get(col.inv_cedi_unds)),
        ventas_periodo: parseNum(get(col.ventas)),
        dias_periodo:   diasPeriodo,
      })
    }

    if (rows.length === 0)
      return NextResponse.json({ error: 'No se encontraron filas válidas' }, { status: 400 })

    // Borrar semana+pais y re-insertar
    const { error: delErr } = await supabase
      .from('inventario_doh_retail')
      .delete()
      .eq('semana', semana)
      .eq('pais', pais)
    if (delErr) throw new Error(delErr.message)

    const BATCH = 500
    let insertados = 0
    for (let b = 0; b < rows.length; b += BATCH) {
      const { error } = await supabase.from('inventario_doh_retail').insert(rows.slice(b, b + BATCH))
      if (error) throw new Error(error.message)
      insertados += Math.min(BATCH, rows.length - b)
    }

    return NextResponse.json({ ok: true, insertados, semana, pais })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('doh-retail upload error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
