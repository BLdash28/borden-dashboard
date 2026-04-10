import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

export const dynamic = 'force-dynamic'

function parseNum(v: string | undefined): number {
  if (!v) return 0
  return parseFloat(v.replace(/,/g, '').trim()) || 0
}

/** Calcula el número de semana ISO YYYYWW */
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

    // Parsear cabecera — normalizar nombres
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
      transito:       idx(['transito', 'transit', 'transito']),
      wharehouse:     idx(['wharehouse', 'warehouse', 'bodega']),
      inv_cedi_cajas: idx(['cedi cajas', 'cedi caj', 'cajas cedi', 'cajas']),
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

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No se encontraron filas válidas' }, { status: 400 })
    }

    // Borrar semana+pais anteriores y re-insertar
    await pool.query(
      'DELETE FROM inventario_doh_retail WHERE semana = $1 AND pais = $2',
      [semana, pais]
    )

    const vals = rows.map((_, i) => {
      const base = i * 14
      return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10},$${base+11},$${base+12},$${base+13},$${base+14})`
    }).join(',')

    const flat = rows.flatMap(r => [
      r.semana, r.pais, r.item_nbr, r.item, r.item_type, r.item_status,
      r.inventario, r.ordenes, r.transito, r.wharehouse,
      r.inv_cedi_cajas, r.inv_cedi_unds, r.ventas_periodo, r.dias_periodo,
    ])

    await pool.query(
      `INSERT INTO inventario_doh_retail
         (semana,pais,item_nbr,item,item_type,item_status,
          inventario,ordenes,transito,wharehouse,
          inv_cedi_cajas,inv_cedi_unds,ventas_periodo,dias_periodo)
       VALUES ${vals}`,
      flat
    )

    return NextResponse.json({ ok: true, insertados: rows.length, semana, pais })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('doh-retail upload error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
