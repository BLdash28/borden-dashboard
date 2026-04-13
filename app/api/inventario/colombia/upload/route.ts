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
    // Período manual si el CSV no tiene ano/mes
    const anoParam = formData.get('ano') as string | null
    const mesParam = formData.get('mes') as string | null

    if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

    const text  = await file.text()
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    if (lines.length < 2) return NextResponse.json({ error: 'CSV vacío o sin datos' }, { status: 400 })

    // Detectar separador (tabulación, punto y coma, coma)
    const firstLine = lines[0]
    const sep = firstLine.includes('\t') ? '\t'
              : firstLine.split(';').length > firstLine.split(',').length ? ';' : ','

    // Normalizar cabecera: minúsculas, sin caracteres especiales excepto letras y números
    const rawHeader = lines[0].split(sep)
    const header = rawHeader.map(h =>
      h.replace(/['"]/g, '').trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar tildes
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '')
    )

    const idx = (keys: string[]): number =>
      header.findIndex(h => keys.some(k => h === k || h.includes(k)))

    const col = {
      ano:             idx(['ano', 'year', 'anio']),
      mes:             idx(['mes', 'month']),
      dia:             idx(['dia', 'day']),
      fecha:           idx(['fecha', 'date', 'periodo', 'period']),
      pais:            idx(['pa', 'pais', 'country', 'pa_']),
      cliente:         idx(['cliente', 'client', 'customer']),
      cadena:          idx(['cadena', 'chain']),
      formato:         idx(['formato', 'format']),
      categoria:       idx(['categoria', 'category']),
      subcategoria:    idx(['subcategoria', 'subcategory', 'subcat']),
      punto_venta:     idx(['punto_venta', 'punto_de_venta', 'puntoventa', 'store', 'tienda', 'pdv']),
      ean_punto_venta: idx(['ean_punto_venta', 'eanpuntoventa', 'ean_point', 'ean_pdv']),
      codigo_interno:  idx(['codigo_interno', 'codigointerno', 'cod_interno', 'plu', 'sku']),
      ean_producto:    idx(['codigo_de_barra', 'codigo_barra', 'codigobarras', 'codigo_barras',
                            'ean_producto', 'eanproducto', 'ean', 'barcode']),
      descripcion:     idx(['descripcion', 'description', 'producto', 'product', 'desc']),
      marca:           idx(['marca', 'brand']),
      qty:             idx(['qty', 'cantidad', 'quantity', 'unidades', 'inventario_q', 'inv_q', 'stock']),
      valor_cop:       idx(['precio_valor', 'preciovalo', 'valor_cop', 'valorcop', 'valor',
                            'inventario_cop', 'price', 'precio']),
    }

    // Período fallback: parámetro manual o fecha actual
    const fallbackAno = anoParam ? parseInt(anoParam) : new Date().getFullYear()
    const fallbackMes = mesParam ? parseInt(mesParam) : new Date().getMonth() + 1

    const rows: Record<string, unknown>[] = []
    const errors: string[] = []

    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(sep)
      const get   = (c: number) => c >= 0 ? (cells[c] ?? '').replace(/^["']|["']$/g, '').trim() : ''

      // Período: columna en CSV > parámetro manual > fecha actual
      let ano = col.ano >= 0 ? parseIntVal(get(col.ano)) : 0
      let mes = col.mes >= 0 ? parseIntVal(get(col.mes)) : 0
      let dia = col.dia >= 0 ? parseIntVal(get(col.dia)) : 0

      // Si hay columna fecha tipo "2025-03" o "03/2025"
      if ((!ano || !mes) && col.fecha >= 0) {
        const f = get(col.fecha)
        const m1 = f.match(/^(\d{4})[-/](\d{1,2})/)
        const m2 = f.match(/^(\d{1,2})[-/](\d{4})/)
        if (m1) { ano = parseInt(m1[1]); mes = parseInt(m1[2]) }
        else if (m2) { mes = parseInt(m2[1]); ano = parseInt(m2[2]) }
      }

      if (!ano) ano = fallbackAno
      if (!mes) mes = fallbackMes

      if (!ano || !mes || mes < 1 || mes > 12) {
        errors.push(`Fila ${i + 1}: período inválido ano=${ano} mes=${mes} — omitida`)
        continue
      }

      rows.push({
        ano,
        mes,
        dia:             dia || 0,
        pais:            get(col.pais)            || null,
        cliente:         get(col.cliente)          || null,
        cadena:          get(col.cadena)            || null,
        formato:         get(col.formato)           || null,
        categoria:       get(col.categoria)         || null,
        subcategoria:    get(col.subcategoria)      || null,
        punto_venta:     get(col.punto_venta)       || null,
        ean_punto_venta: get(col.ean_punto_venta)   || null,
        codigo_interno:  get(col.codigo_interno)    || null,
        ean_producto:    get(col.ean_producto)      || null,
        descripcion:     get(col.descripcion)       || null,
        qty:             Math.round(parseNum(get(col.qty))),
        valor_cop:       parseNum(get(col.valor_cop)),
      })
    }

    if (rows.length === 0) {
      return NextResponse.json({
        error: 'No se encontraron filas válidas',
        cabecera_detectada: header.join(' | '),
        detalles: errors.slice(0, 5),
      }, { status: 400 })
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
