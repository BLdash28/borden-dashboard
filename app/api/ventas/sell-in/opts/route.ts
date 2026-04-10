import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const dynamic = 'force-dynamic'

const DIM_MAP: Record<string, string> = {
  pais:      'pais',
  categoria: 'categoria',
  cliente:   'cliente',
  canal:     'canal',
  sku:       'sku',
}

export async function GET(req: NextRequest) {
  try {
    const sp  = req.nextUrl.searchParams
    const dim = sp.get('dim') ?? ''

    const col = DIM_MAP[dim]
    if (!col) return NextResponse.json({ error: `dim inválido: ${dim}` }, { status: 400 })

    const conds: string[] = [`${col} IS NOT NULL`, `${col} <> ''`]
    const params: unknown[] = []
    let idx = 1

    const ano     = sp.get('ano')
    const mes     = sp.get('mes')
    const paises   = sp.get('paises')?.split(',').filter(Boolean) ?? []
    const cats     = sp.get('categorias')?.split(',').filter(Boolean) ?? []
    const clientes = sp.get('clientes')?.split(',').filter(Boolean) ?? []
    const canales  = sp.get('canales')?.split(',').filter(Boolean) ?? []

    const anosArr  = (sp.get('anos')  || ano  || '').split(',').map(Number).filter(n => n > 2000)
    const mesesArr = (sp.get('meses') || mes  || '').split(',').map(Number).filter(n => n >= 1 && n <= 12)
    if (anosArr.length)  { conds.push(`ano IN (${anosArr.map(() => `$${idx++}`).join(',')})`);  params.push(...anosArr) }
    if (mesesArr.length) { conds.push(`mes IN (${mesesArr.map(() => `$${idx++}`).join(',')})`); params.push(...mesesArr) }
    if (paises.length)   { conds.push(`pais IN (${paises.map(() => `$${idx++}`).join(',')})`);    params.push(...paises) }
    if (cats.length)     { conds.push(`categoria IN (${cats.map(() => `$${idx++}`).join(',')})`); params.push(...cats) }
    if (canales.length)  { conds.push(`canal IN (${canales.map(() => `$${idx++}`).join(',')})`);  params.push(...canales) }
    if (clientes.length) { conds.push(`cliente IN (${clientes.map(() => `$${idx++}`).join(',')})`); params.push(...clientes) }

    const { rows } = await pool.query(
      `SELECT DISTINCT ${col} AS val FROM ventas_sell_in
       WHERE ${conds.join(' AND ')}
       ORDER BY ${col}`,
      params
    )

    return NextResponse.json({ opts: rows.map(r => r.val) })
  } catch (err) {
    return handleApiError(err)
  }
}
