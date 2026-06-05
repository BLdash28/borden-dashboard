import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

function norm(s: string) { return s.toLowerCase().replace(/[\s_\-\.]/g, '') }

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Falta archivo' }, { status: 400 })

    const buf  = Buffer.from(await file.arrayBuffer())
    const wb   = XLSX.read(buf)
    const ws   = wb.Sheets[wb.SheetNames[0]]
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

    if (data.length === 0) return NextResponse.json({ error: 'Excel vacío' }, { status: 400 })

    // Detect columns by normalized name
    const sample = data[0]
    const keys   = Object.keys(sample)
    const findCol = (...candidates: string[]) =>
      keys.find(k => candidates.some(c => norm(k) === norm(c))) ?? ''

    const colUpc     = findCol('UPC', 'Upc', 'upc', 'codigo_barras', 'codigobarras')
    const colItem    = findCol('Item Nbr', 'Item_Nbr', 'ItemNbr', 'item_nbr', 'itemnbr', 'Nbr')
    const colVnpk    = findCol('VNPK Qty', 'VNPK_Qty', 'vnpk_qty', 'vnpkqty', 'VnpkQty', 'Multiplicador', 'UnidadesxCaja', 'unidades_caja')

    if (!colVnpk) return NextResponse.json({ error: 'No se encontró columna VNPK Qty / Multiplicador' }, { status: 400 })
    if (!colUpc && !colItem) return NextResponse.json({ error: 'No se encontró columna UPC o Item Nbr' }, { status: 400 })

    const updates: { upc: string | null; item_nbr: number | null; vnpk: number }[] = []
    for (const row of data) {
      const vnpk = parseInt(String(row[colVnpk] ?? '0')) || 0
      if (vnpk <= 0) continue
      const rawUpc  = colUpc  ? String(row[colUpc]  ?? '').trim() : null
      const rawItem = colItem ? parseInt(String(row[colItem] ?? '0')) || null : null
      if (!rawUpc && !rawItem) continue
      // Pad UPC to 13 digits (strip check digit → 12, pad to 13)
      const upc = rawUpc ? rawUpc.replace(/\D/g, '').padStart(13, '0') : null
      updates.push({ upc, item_nbr: rawItem, vnpk })
    }

    if (updates.length === 0) return NextResponse.json({ error: 'Sin filas válidas' }, { status: 400 })

    let updated = 0
    for (const u of updates) {
      let res
      if (u.upc) {
        // Match by codigo_barras (last digit = check digit, so match on leading 12)
        res = await pool.query(
          `UPDATE dim_producto SET vnpk_qty = $1
           WHERE LEFT(codigo_barras, LENGTH(codigo_barras) - 1) = LPAD(LEFT($2, LENGTH($2) - 1), 12, '0')
              OR codigo_barras = $2`,
          [u.vnpk, u.upc]
        )
      }
      if ((!res || res.rowCount === 0) && u.item_nbr) {
        res = await pool.query(
          `UPDATE dim_producto SET vnpk_qty = $1 WHERE item_nbr = $2`,
          [u.vnpk, u.item_nbr]
        )
      }
      updated += res?.rowCount ?? 0
    }

    return NextResponse.json({ ok: true, procesadas: updates.length, actualizadas: updated })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
