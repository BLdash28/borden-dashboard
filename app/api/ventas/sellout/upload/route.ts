import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { requireAuth } from '@/lib/api/auth'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60 // segundos (Vercel Pro/hobby max)

function parseNum(v: string | undefined): number {
  if (!v) return 0
  return parseFloat(v.replace(/,/g, '').trim()) || 0
}

function parseIntVal(v: string | undefined): number {
  if (!v) return 0
  return parseInt(v.replace(/,/g, '').trim()) || 0
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth()

    const formData  = await req.formData()
    const file      = formData.get('file') as File | null
    const archivo   = (formData.get('archivo') as string || '').trim() || 'upload-manual'
    const reemplazar = formData.get('reemplazar') === '1'

    if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

    const text  = await file.text()
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    if (lines.length < 2) return NextResponse.json({ error: 'CSV vacío o sin datos' }, { status: 400 })

    // Detectar separador (coma o punto y coma)
    const sep = lines[0].includes(';') ? ';' : ','

    // Normalizar cabecera
    const header = lines[0].split(sep).map(h =>
      h.replace(/[^a-zA-Z0-9_]/g, '').trim().toLowerCase()
    )

    const idx = (keys: string[]): number =>
      header.findIndex(h => keys.some(k => h === k || h.includes(k)))

    const col = {
      pais:            idx(['pais', 'país', 'country']),
      cliente:         idx(['cliente', 'client', 'customer']),
      cadena:          idx(['cadena', 'chain']),
      formato:         idx(['formato', 'format']),
      categoria:       idx(['categoria', 'categoría', 'category']),
      subcategoria:    idx(['subcategoria', 'subcategoría', 'subcatego', 'subcategory']),
      punto_venta:     idx(['punto_venta', 'puntoventa', 'punto_ven', 'store', 'tienda']),
      codigo_barras:   idx(['codigo_barras', 'codigobarras', 'barcode', 'ean']),
      sku:             idx(['sku', 'codigo_interno', 'codigointerno']),
      descripcion:     idx(['descripcion', 'descripció', 'description', 'descripcio']),
      ano:             idx(['ano', 'año', 'year']),
      mes:             idx(['mes', 'month']),
      dia:             idx(['dia', 'día', 'day']),
      ventas_unidades: idx(['ventas_un', 'ventas_unidades', 'unidades', 'units', 'qty']),
      ventas_valor:    idx(['ventas_valor', 'valor', 'value', 'sales', 'monto']),
    }

    // Validar columnas mínimas
    const missing = (['pais','ano','mes','dia'] as const).filter(k => col[k] < 0)
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

      const pais = get(col.pais)
      const ano  = parseIntVal(get(col.ano))
      const mes  = parseIntVal(get(col.mes))
      const dia  = parseIntVal(get(col.dia))

      if (!pais || !ano || !mes) {
        errors.push(`Fila ${i + 1}: pais="${pais}" ano="${ano}" mes="${mes}" — omitida`)
        continue
      }

      rows.push({
        pais,
        cliente:         get(col.cliente)       || null,
        cadena:          get(col.cadena)         || null,
        formato:         get(col.formato)        || null,
        categoria:       get(col.categoria)      || null,
        subcategoria:    get(col.subcategoria)   || null,
        punto_venta:     get(col.punto_venta)   || '',
        codigo_barras:   get(col.codigo_barras) || null,
        sku:             get(col.sku)           || '',
        descripcion:     get(col.descripcion)    || null,
        ano,
        mes,
        dia:             dia || 1,
        ventas_unidades: parseNum(get(col.ventas_unidades)),
        ventas_valor:    parseNum(get(col.ventas_valor)),
        archivo_origen:  archivo,
      })
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No se encontraron filas válidas', detalles: errors }, { status: 400 })
    }

    // Borrar todo si se pide reemplazar
    let eliminados = 0
    if (reemplazar) {
      const del = await pool.query('DELETE FROM fact_sales_sellout')
      eliminados = del.rowCount ?? 0
    }

    // Insertar en lotes de 1000
    const BATCH = 1000
    let insertados = 0
    let omitidos   = 0

    for (let b = 0; b < rows.length; b += BATCH) {
      const batch = rows.slice(b, b + BATCH)
      const cols  = ['pais','cliente','cadena','formato','categoria','subcategoria',
                     'punto_venta','codigo_barras','sku','descripcion',
                     'ano','mes','dia','ventas_unidades','ventas_valor','archivo_origen']

      const vals = batch.map((_, i) => {
        const base = i * cols.length
        return `(${cols.map((_, j) => `$${base + j + 1}`).join(',')})`
      }).join(',')

      const flat = batch.flatMap(r => cols.map(c => (r as any)[c]))

      const result = await pool.query(
        `INSERT INTO fact_sales_sellout (${cols.join(',')})
         VALUES ${vals}
         ON CONFLICT DO NOTHING`,
        flat
      )
      insertados += result.rowCount ?? 0
    }

    return NextResponse.json({
      ok:          true,
      insertados,
      eliminados,
      omitidos:    errors.length,
      total_filas: rows.length,
      errores:     errors.slice(0, 10),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('sellout upload error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
