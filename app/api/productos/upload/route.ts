import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/api/auth'
import * as XLSX from 'xlsx'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function norm(v: any): string {
  return String(v ?? '').trim()
}

function normCol(h: string): string {
  return h.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth()

    const formData = await req.formData()
    const file      = formData.get('file')      as File | null
    const truncate  = formData.get('truncate')  === 'true'
    if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

    // Limpiar tabla antes de importar si se solicita
    if (truncate) {
      const { error: delErr } = await supabase.from('dim_producto').delete().gte('id', 0)
      if (delErr) throw new Error('Error limpiando tabla: ' + delErr.message)
    }

    const buffer    = Buffer.from(await file.arrayBuffer())
    const workbook  = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const sheet     = workbook.Sheets[sheetName]
    const rawRows   = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, any>[]

    if (rawRows.length === 0)
      return NextResponse.json({ error: 'Archivo vacío o sin datos' }, { status: 400 })

    // Normalizar cabeceras
    const firstRow   = rawRows[0]
    const headerMap: Record<string, string> = {}
    for (const key of Object.keys(firstRow)) {
      headerMap[key] = normCol(key)
    }

    // Detectar columnas clave
    const findCol = (raw: Record<string, any>, keys: string[]): string => {
      for (const origKey of Object.keys(raw)) {
        const n = normCol(origKey)
        if (keys.some(k => n === k || n.includes(k))) return origKey
      }
      return ''
    }

    const sampleRow   = rawRows[0]
    const colCat      = findCol(sampleRow, ['categoria', 'category'])
    const colSubcat   = findCol(sampleRow, ['subcategoria', 'subcategory', 'subcat'])
    const colBarras   = findCol(sampleRow, ['cod_barras', 'codigo_barras', 'cod_de_barras', 'barras', 'ean', 'barcode'])
    const colInterno  = findCol(sampleRow, ['cod_interno', 'codigo_interno', 'interno', 'sku', 'plu'])
    const colDesc     = findCol(sampleRow, ['descripcion', 'description', 'desc', 'producto', 'nombre'])

    if (!colDesc && !colInterno)
      return NextResponse.json({
        error: 'No se encontró columna de descripción o SKU',
        cabecera: Object.keys(sampleRow).join(' | '),
      }, { status: 400 })

    const toUpsert: Record<string, any>[] = []
    const errores: string[] = []

    for (let i = 0; i < rawRows.length; i++) {
      const r     = rawRows[i]
      const sku   = norm(colInterno ? r[colInterno] : '')
      const desc  = norm(colDesc    ? r[colDesc]    : '')

      if (!sku && !desc) continue

      const row: Record<string, any> = {
        sku:           sku   || desc.slice(0, 50),
        descripcion:   desc  || sku,
        categoria:     norm(colCat    ? r[colCat]    : '') || null,
        subcategoria:  norm(colSubcat ? r[colSubcat] : '') || null,
        codigo_barras: norm(colBarras ? r[colBarras] : '') || null,
        is_active:     true,
      }

      // Limpiar strings vacíos → null
      for (const k of Object.keys(row)) {
        if (row[k] === '') row[k] = null
      }

      if (!row.sku) {
        errores.push(`Fila ${i + 2}: sin SKU — omitida`)
        continue
      }

      toUpsert.push(row)
    }

    if (toUpsert.length === 0)
      return NextResponse.json({ error: 'No se encontraron filas válidas', errores }, { status: 400 })

    // Deduplicar por SKU — mantener último registro si hay duplicados en el archivo
    const dedupMap: Record<string, Record<string, any>> = {}
    for (const row of toUpsert) dedupMap[row.sku] = row
    const deduped = Object.values(dedupMap)

    // Upsert por SKU (actualiza si ya existe, inserta si no)
    const BATCH   = 200
    let insertados = 0
    let actualizados = 0

    for (let b = 0; b < deduped.length; b += BATCH) {
      const batch = deduped.slice(b, b + BATCH)
      const { data, error } = await supabase
        .from('dim_producto')
        .upsert(batch, { onConflict: 'sku', ignoreDuplicates: false })
        .select('id')

      if (error) throw new Error(error.message)
      insertados += data?.length ?? batch.length
    }

    return NextResponse.json({
      ok:          true,
      insertados,
      actualizados,
      total_filas: deduped.length,
      errores:     errores.slice(0, 10),
      columnas_detectadas: { colCat, colSubcat, colBarras, colInterno, colDesc },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('productos/upload error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
