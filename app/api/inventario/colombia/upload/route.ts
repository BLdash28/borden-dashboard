import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/api/auth'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function parseNum(v: string | undefined): number {
  if (!v) return 0
  // Quitar símbolo de moneda, espacios, y manejar tanto "1.234,56" como "1,234.56"
  let s = v.replace(/[^\d.,\-]/g, '').trim()
  // Si tiene coma Y punto, el último es el decimal
  if (s.includes(',') && s.includes('.')) {
    const lastComma = s.lastIndexOf(',')
    const lastDot   = s.lastIndexOf('.')
    if (lastComma > lastDot) {
      // formato europeo: 1.234,56
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      // formato anglosajón: 1,234.56
      s = s.replace(/,/g, '')
    }
  } else if (s.includes(',') && !s.includes('.')) {
    // puede ser decimal europeo: "1234,56" → o separador de miles "1,234"
    const parts = s.split(',')
    if (parts.length === 2 && parts[1].length <= 2) {
      s = s.replace(',', '.') // decimal
    } else {
      s = s.replace(/,/g, '') // miles
    }
  }
  return parseFloat(s) || 0
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth()

    const formData = await req.formData()
    const file     = formData.get('file') as File | null
    const anoParam = formData.get('ano') as string | null
    const mesParam = formData.get('mes') as string | null

    if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

    const text  = await file.text()
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    if (lines.length < 2) return NextResponse.json({ error: 'CSV vacío o sin datos' }, { status: 400 })

    // Detectar separador
    const firstLine = lines[0]
    const sep = firstLine.includes('\t') ? '\t'
              : firstLine.split(';').length > firstLine.split(',').length ? ';' : ','

    // Normalizar cabecera
    const header = lines[0].split(sep).map(h =>
      h.replace(/['"]/g, '').trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '')
    )

    const idx = (keys: string[]): number =>
      header.findIndex(h => keys.some(k => h === k || h.includes(k)))

    const col = {
      pais:          idx(['pa', 'pais', 'country']),
      cliente:       idx(['cliente', 'client', 'customer']),
      cadena:        idx(['cadena', 'chain']),
      formato:       idx(['formato', 'format']),
      categoria:     idx(['categoria', 'category']),
      subcategoria:  idx(['subcategoria', 'subcategory', 'subcat']),
      punto_venta:   idx(['punto_de_venta', 'punto_venta', 'puntoventa', 'store', 'tienda', 'pdv']),
      codigo_barras: idx(['codigo_de_barra', 'codigo_barras', 'codigobarras', 'codigo_barra',
                          'ean', 'barcode', 'ean_producto']),
      descripcion:   idx(['descripcion', 'description', 'producto', 'product', 'desc']),
      qty:           idx(['qty', 'cantidad', 'quantity', 'unidades', 'stock']),
      precio_valor:  idx(['precio_valor', 'preciovalo', 'valor_cop', 'valor', 'price', 'precio']),
      // fecha/periodo opcionales
      ano:           idx(['ano', 'year', 'anio']),
      mes:           idx(['mes', 'month']),
      fecha:         idx(['fecha', 'date', 'periodo']),
    }

    const fallbackAno = anoParam ? parseInt(anoParam) : new Date().getFullYear()
    const fallbackMes = mesParam ? parseInt(mesParam) : new Date().getMonth() + 1

    const rows: Record<string, unknown>[] = []
    const errors: string[] = []

    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(sep)
      const get   = (c: number) => c >= 0 ? (cells[c] ?? '').replace(/^["']|["']$/g, '').trim() : ''

      let ano = col.ano >= 0 ? parseInt(get(col.ano)) || 0 : 0
      let mes = col.mes >= 0 ? parseInt(get(col.mes)) || 0 : 0

      if ((!ano || !mes) && col.fecha >= 0) {
        const f  = get(col.fecha)
        const m1 = f.match(/^(\d{4})[-/](\d{1,2})/)
        const m2 = f.match(/^(\d{1,2})[-/](\d{4})/)
        if (m1) { ano = parseInt(m1[1]); mes = parseInt(m1[2]) }
        else if (m2) { mes = parseInt(m2[1]); ano = parseInt(m2[2]) }
      }

      if (!ano) ano = fallbackAno
      if (!mes) mes = fallbackMes

      if (!ano || !mes || mes < 1 || mes > 12) {
        errors.push(`Fila ${i + 1}: período inválido — omitida`)
        continue
      }

      rows.push({
        ano,
        mes,
        pais:          get(col.pais)          || null,
        cliente:       get(col.cliente)        || null,
        cadena:        get(col.cadena)          || null,
        formato:       get(col.formato)         || null,
        categoria:     get(col.categoria)       || null,
        subcategoria:  get(col.subcategoria)    || null,
        punto_venta:   get(col.punto_venta)     || null,
        codigo_barras: get(col.codigo_barras)   || null,
        descripcion:   get(col.descripcion)     || null,
        qty:           parseNum(get(col.qty)),
        precio_valor:  parseNum(get(col.precio_valor)),
      })
    }

    if (rows.length === 0) {
      return NextResponse.json({
        error: 'No se encontraron filas válidas',
        cabecera_detectada: header.join(' | '),
        detalles: errors.slice(0, 5),
      }, { status: 400 })
    }

    const BATCH = 500
    let insertados = 0
    for (let b = 0; b < rows.length; b += BATCH) {
      const batch = rows.slice(b, b + BATCH)
      const { error } = await supabase.from('inventario_colombia').insert(batch)
      if (error) throw new Error(error.message)
      insertados += batch.length
    }

    return NextResponse.json({ ok: true, insertados, total_filas: rows.length, errores: errors.slice(0, 10) })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('inventario/colombia/upload error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
