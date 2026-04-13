import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { pool } from '@/lib/db/pool'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT semana, pais, item_nbr, item, item_type, item_status,
              inventario, ordenes, transito, wharehouse,
              inv_cedi_cajas, inv_cedi_unds, ventas_periodo, dias_periodo
       FROM inventario_doh_retail
       ORDER BY semana, pais, item_nbr`
    )

    if (rows.length === 0) return NextResponse.json({ ok: true, message: 'Nada que migrar', total: 0 })

    const BATCH = 500
    let total = 0
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await supabase
        .from('inventario_doh_retail')
        .upsert(rows.slice(i, i + BATCH), { onConflict: 'semana,pais,item_nbr' })
      if (error) throw new Error(error.message)
      total += Math.min(BATCH, rows.length - i)
    }

    return NextResponse.json({ ok: true, total, message: `Migradas ${total} filas a Supabase` })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
