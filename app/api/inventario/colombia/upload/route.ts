import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/api/auth'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } }
)

function parseNum(v: string | undefined): number {
  if (!v) return 0
  return parseFloat(v.replace(/,/g, '').replace(/\s/g, '').trim()) || 0
}

function parseIntVal(v: string | undefined): number {
  if (!v) return 0
  return parseInt(v.replace(/,/g, '').trim()) || 0
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth()

    const formData = await req.formData()
    const file     = formData.get('file') as File | null

    if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

    const text  = await file.text()
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    if (lines.length < 2) return NextResponse.json({ error: 'CSV vacío o sin datos' }, { status: 400 })

    // Detectar separador
    const sep = lines[0].split(';').length > lines[0].split(',').length ? ';' : ','

    const header = lines[0].split(sep).map(h =>
      h.replace(/[^a-zA-Z0-9_áéíóúñ]/gi, '').trim().toLowerCase()
    )

    const idx = (keys: string[]): number =>
      header.findIndex(h => keys.some(k => h === k || h.includes(k)))

    const col = {
      ano:             idx(['ano', 'año', 'year']),
      mes:             idx(['mes', 'month']),
      dia:             idx(['dia', 'día', 'day']),
      ean_punto_venta: idx(['ean_punto_venta', 'eanpuntoventa', 'ean_point_sale', 'eanpointsale']),
      punto_venta:     idx(['punto_venta', 'puntoventa', 'punto de venta', 'store', 'tienda']),
      marca:           idx(['marca', 'brand']),
      codigo_interno:  idx(['codigo_interno', 'codigointerno', 'cod_interno', 'plu', 'sku', 'codigo interno']),
      ean_producto:    idx(['ean_producto', 'ean producto', 'eanproducto', 'ean', 'barcode', 'codigo_barras']),
      descripcion:     idx(['descripcion', 'descripción', 'producto', 'description', 'product']),
      qty:             idx(['qty', 'inventario q', 'inventarioq', 'cantidad', 'quantity', 'unidades', 'inventario_q']),
      valor_cop:       idx(['valor_cop', 'valorcop', 'inventario cop', 'inventariocop', 'valor', 'value', 'inventario_cop']),
    }

    // Validar columnas mínimas
    const missing = (['ano', 'mes'] as const).filter(k => col[k] < 0)
    if (missing.length > 0) {
      return NextResponse.json({
        error: `Columnas requeridas no encontradas: ${missing.join(', ')}. Cabecera detectada: ${header.join(', ')}`
      }, { status: 400 })
    }

    const rows: Record<string, unknown>[] = []
    const errors: string[] = []

    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(sep)
      const get   = (c: number) => c >= 0 ? (cells[c] || '').trim() : ''

      const ano = parseIntVal(get(col.ano))
      const mes = parseIntVal(get(col.mes))
      const dia = parseIntVal(get(col.dia))

      if (!ano || !mes) {
        errors.push(`Fila ${i + 1}: ano="${ano}" mes="${mes}" — omitida`)
        continue
      }

      rows.push({
        ano,
        mes,
        dia:             dia || 0,
        ean_punto_venta: get(col.ean_punto_venta) || null,
        punto_venta:     get(col.punto_venta)     || null,
        marca:           get(col.marca)            || null,
        codigo_interno:  get(col.codigo_interno)   || null,
        ean_producto:    get(col.ean_producto)     || null,
        descripcion:     get(col.descripcion)      || null,
        qty:             Math.round(parseNum(get(col.qty))),
        valor_cop:       parseNum(get(col.valor_cop)),
      })
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No se encontraron filas válidas', detalles: errors }, { status: 400 })
    }

    // Insertar en lotes de 500 vía Supabase
    const BATCH = 500
    let insertados = 0

    for (let b = 0; b < rows.length; b += BATCH) {
      const batch = rows.slice(b, b + BATCH)
      const { error } = await supabase.from('inventario_colombia').insert(batch)
      if (error) throw new Error(error.message)
      insertados += batch.length
    }

    return NextResponse.json({
      ok:          true,
      insertados,
      total_filas: rows.length,
      errores:     errors.slice(0, 10),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('inventario/colombia/upload error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
