// app/api/finanzas/balance/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'
import { getUserRestrictions } from '@/lib/auth/restrictions'

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 })

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tipo = searchParams.get('tipo') || 'detalle'
  const pais = searchParams.get('pais')
  const anoP = searchParams.get('ano')
  const mesP = searchParams.get('mes')

  const restrictions = await getUserRestrictions()
  const client = await pool.connect()

  try {
    if (tipo === 'filtros') {
      const r = await client.query(`SELECT DISTINCT ano, mes FROM fin_balance ORDER BY ano DESC, mes DESC LIMIT 36`)
      client.release()
      return NextResponse.json({ periodos: r.rows })
    }

    const conds: string[] = ['1=1']
    const params: any[] = []
    let idx = 1
    if (restrictions?.isRestricted && restrictions.paises.length > 0) {
      conds.push(`pais IN (${restrictions.paises.map(() => `$${idx++}`).join(',')})`); params.push(...restrictions.paises)
    } else if (pais && pais !== 'Todos') { conds.push(`pais = $${idx++}`); params.push(pais) }
    if (anoP) { conds.push(`ano = $${idx++}`); params.push(parseInt(anoP)) }
    if (mesP) { conds.push(`mes = $${idx++}`); params.push(parseInt(mesP)) }
    const where = 'WHERE ' + conds.join(' AND ')

    if (tipo === 'kpis') {
      const r = await client.query(`
        SELECT
          SUM(CASE WHEN tipo LIKE 'activo%'    THEN valor ELSE 0 END) AS total_activos,
          SUM(CASE WHEN tipo LIKE 'pasivo%'    THEN valor ELSE 0 END) AS total_pasivos,
          SUM(CASE WHEN tipo = 'patrimonio'    THEN valor ELSE 0 END) AS patrimonio,
          SUM(CASE WHEN tipo = 'activo_corriente'     THEN valor ELSE 0 END) AS activo_corriente,
          SUM(CASE WHEN tipo = 'activo_no_corriente'  THEN valor ELSE 0 END) AS activo_no_corriente,
          SUM(CASE WHEN tipo = 'pasivo_corriente'     THEN valor ELSE 0 END) AS pasivo_corriente,
          SUM(CASE WHEN tipo = 'pasivo_no_corriente'  THEN valor ELSE 0 END) AS pasivo_no_corriente
        FROM fin_balance ${where}`, params)
      client.release()
      const row = r.rows[0] || {}
      const activos  = Number(row.total_activos || 0)
      const pasivos  = Number(row.total_pasivos || 0)
      const patrimonio = Number(row.patrimonio || 0)
      return NextResponse.json({
        ...row,
        ratio_deuda_equity:   patrimonio > 0 ? (pasivos / patrimonio).toFixed(2) : null,
        ratio_liquidez:       Number(row.pasivo_corriente || 0) > 0
                                ? (Number(row.activo_corriente || 0) / Number(row.pasivo_corriente || 0)).toFixed(2)
                                : null,
        solvencia_pct:        activos > 0 ? ((patrimonio / activos) * 100).toFixed(1) : null,
      })
    }

    const r = await client.query(`
      SELECT tipo, categoria, concepto,
             ROUND(SUM(valor)::numeric, 2) AS valor, moneda
      FROM fin_balance ${where}
      GROUP BY tipo, categoria, concepto, moneda
      ORDER BY tipo, categoria, concepto`, params)
    client.release()
    return NextResponse.json({ rows: r.rows })

  } catch (err: any) {
    client.release()
    if (err.code === '42P01') return NextResponse.json({ rows: [], empty: true })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const restrictions = await getUserRestrictions()
  if (!restrictions || restrictions.isRestricted) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  const body = await req.json()
  const { pais, ano, mes, tipo, categoria, concepto, valor, moneda } = body
  if (!ano || !mes || !tipo || !concepto || valor == null)
    return NextResponse.json({ error: 'Campos requeridos faltantes' }, { status: 400 })
  const client = await pool.connect()
  try {
    const r = await client.query(`
      INSERT INTO fin_balance (pais, ano, mes, tipo, categoria, concepto, valor, moneda)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (pais, ano, mes, tipo, concepto)
      DO UPDATE SET valor=EXCLUDED.valor, categoria=EXCLUDED.categoria
      RETURNING id`,
      [pais||'US', ano, mes, tipo, categoria||null, concepto, Number(valor), moneda||'USD'])
    client.release()
    return NextResponse.json({ ok: true, id: r.rows[0].id })
  } catch (err: any) { client.release(); return NextResponse.json({ error: err.message }, { status: 500 }) }
}
