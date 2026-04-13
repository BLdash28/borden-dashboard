import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const sp     = req.nextUrl.searchParams
    const pais   = sp.get('pais')   || ''
    const semana = sp.get('semana') || ''
    const search = sp.get('q')      || ''

    // Semanas disponibles
    const { rows: semanaRows } = await pool.query<{ semana: number; pais: string }>(
      'SELECT DISTINCT semana, pais FROM inventario_doh_retail ORDER BY semana DESC'
    )

    // Si no viene semana, usar la más reciente
    const latestSemana = semanaRows[0]?.semana ?? null
    const activeSemana = semana ? Number(semana) : latestSemana

    if (!activeSemana) {
      return NextResponse.json({ semanas: [], paises: [], rows: [], semana_actual: null })
    }

    // Países disponibles para la semana activa
    const paises = [...new Set(semanaRows
      .filter(r => r.semana === activeSemana)
      .map(r => r.pais)
    )].sort()

    // Construir query
    const where: string[] = ['semana = $1']
    const params: unknown[] = [activeSemana]
    let pi = 2

    if (pais)   { where.push(`pais = $${pi++}`);               params.push(pais) }
    if (search) {
      where.push(`(item ILIKE $${pi} OR item_nbr ILIKE $${pi})`)
      params.push(`%${search}%`); pi++
    }

    const { rows } = await pool.query<{
      id: string; semana: string; pais: string
      item_nbr: string; item: string; item_type: string; item_status: string
      inventario: string; ordenes: string; transito: string; wharehouse: string
      inv_cedi_cajas: string; inv_cedi_unds: string
      ventas_periodo: string; dias_periodo: string
    }>(`
      SELECT id, semana, pais, item_nbr, item, item_type, item_status,
             inventario, ordenes, transito, wharehouse,
             inv_cedi_cajas, inv_cedi_unds,
             ventas_periodo, dias_periodo
      FROM inventario_doh_retail
      WHERE ${where.join(' AND ')}
      ORDER BY inventario DESC
    `, params)

    const semanas = [...new Set(semanaRows.map(r => r.semana))].sort((a, b) => b - a)

    return NextResponse.json({
      semana_actual: activeSemana,
      semanas,
      paises,
      rows: rows.map(r => ({
        id:            Number(r.id),
        semana:        Number(r.semana),
        pais:          r.pais,
        item_nbr:      r.item_nbr,
        item:          r.item          ?? '',
        item_type:     r.item_type     ?? '',
        item_status:   r.item_status   ?? '',
        inventario:    Number(r.inventario)    || 0,
        ordenes:       Number(r.ordenes)       || 0,
        transito:      Number(r.transito)      || 0,
        wharehouse:    Number(r.wharehouse)    || 0,
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
