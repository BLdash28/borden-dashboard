import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  try {
    const sp     = req.nextUrl.searchParams
    const pais   = sp.get('pais')   || ''
    const semana = sp.get('semana') || ''
    const search = sp.get('q')      || ''

    // Semanas disponibles
    const { data: semanaRows } = await supabase
      .from('inventario_doh_retail')
      .select('semana, pais')
      .order('semana', { ascending: false })

    const latestSemana = semanaRows?.[0]?.semana ?? null
    const activeSemana = semana ? Number(semana) : latestSemana

    if (!activeSemana) {
      return NextResponse.json({ semanas: [], paises: [], rows: [], semana_actual: null })
    }

    const paises = [...new Set((semanaRows || [])
      .filter(r => r.semana === activeSemana)
      .map(r => r.pais)
    )].sort()

    let q = supabase
      .from('inventario_doh_retail')
      .select('id, semana, pais, item_nbr, item, item_type, item_status, inventario, ordenes, transito, wharehouse, inv_cedi_cajas, inv_cedi_unds, ventas_periodo, dias_periodo')
      .eq('semana', activeSemana)
      .order('inventario', { ascending: false })

    if (pais)   q = q.eq('pais', pais)
    if (search) q = q.or(`item.ilike.%${search}%,item_nbr.ilike.%${search}%`)

    const { data: rows, error } = await q.limit(2000)
    if (error) throw new Error(error.message)

    const semanas = [...new Set((semanaRows || []).map(r => r.semana))].sort((a, b) => b - a)

    return NextResponse.json({
      semana_actual: activeSemana,
      semanas,
      paises,
      rows: (rows || []).map(r => ({
        id:             Number(r.id),
        semana:         Number(r.semana),
        pais:           r.pais,
        item_nbr:       r.item_nbr,
        item:           r.item          ?? '',
        item_type:      r.item_type     ?? '',
        item_status:    r.item_status   ?? '',
        inventario:     Number(r.inventario)     || 0,
        ordenes:        Number(r.ordenes)        || 0,
        transito:       Number(r.transito)       || 0,
        wharehouse:     Number(r.wharehouse)     || 0,
        inv_cedi_cajas: Number(r.inv_cedi_cajas) || 0,
        inv_cedi_unds:  Number(r.inv_cedi_unds)  || 0,
        ventas_periodo: Number(r.ventas_periodo) || 0,
        dias_periodo:   Number(r.dias_periodo)   || 91,
      })),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('doh-retail GET error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
