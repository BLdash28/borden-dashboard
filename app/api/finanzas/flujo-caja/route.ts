// app/api/finanzas/flujo-caja/route.ts
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
      const r = await client.query(`SELECT DISTINCT ano, mes FROM fin_flujo ORDER BY ano DESC, mes DESC LIMIT 36`)
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
          SUM(CASE WHEN tipo='entrada' THEN monto ELSE 0 END)  AS entradas,
          SUM(CASE WHEN tipo='salida'  THEN monto ELSE 0 END)  AS salidas,
          SUM(CASE WHEN tipo='entrada' THEN monto ELSE -monto END) AS flujo_neto,
          SUM(CASE WHEN actividad='operativa'      AND tipo='entrada' THEN monto
                   WHEN actividad='operativa'      AND tipo='salida'  THEN -monto ELSE 0 END) AS flujo_operativo,
          SUM(CASE WHEN actividad='inversion'      AND tipo='entrada' THEN monto
                   WHEN actividad='inversion'      AND tipo='salida'  THEN -monto ELSE 0 END) AS flujo_inversion,
          SUM(CASE WHEN actividad='financiamiento' AND tipo='entrada' THEN monto
                   WHEN actividad='financiamiento' AND tipo='salida'  THEN -monto ELSE 0 END) AS flujo_financiamiento
        FROM fin_flujo ${where} AND actividad != 'saldo_inicial'`, params)
      const saldo = await client.query(`SELECT COALESCE(SUM(monto),0) AS saldo_inicial FROM fin_flujo ${where} AND actividad='saldo_inicial'`, params)
      client.release()
      const row = r.rows[0] || {}
      return NextResponse.json({ ...row, saldo_inicial: saldo.rows[0]?.saldo_inicial || 0 })
    }

    if (tipo === 'tendencia') {
      const r = await client.query(`
        SELECT ano, mes,
          SUM(CASE WHEN tipo='entrada' THEN monto ELSE 0 END) AS entradas,
          SUM(CASE WHEN tipo='salida'  THEN monto ELSE 0 END) AS salidas,
          SUM(CASE WHEN tipo='entrada' THEN monto ELSE -monto END) AS flujo_neto
        FROM fin_flujo ${where} AND actividad != 'saldo_inicial'
        GROUP BY ano, mes ORDER BY ano, mes`, params)
      client.release()
      return NextResponse.json({ rows: r.rows })
    }

    const r = await client.query(`
      SELECT actividad, tipo, concepto,
             ROUND(SUM(monto)::numeric, 2) AS monto, moneda
      FROM fin_flujo ${where}
      GROUP BY actividad, tipo, concepto, moneda
      ORDER BY actividad, tipo, concepto`, params)
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
  const { pais, ano, mes, actividad, tipo, concepto, monto, moneda, notas } = body
  if (!ano || !mes || !actividad || !concepto || monto == null)
    return NextResponse.json({ error: 'Campos requeridos faltantes' }, { status: 400 })
  const client = await pool.connect()
  try {
    const r = await client.query(`
      INSERT INTO fin_flujo (pais, ano, mes, actividad, tipo, concepto, monto, moneda, notas)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (pais, ano, mes, actividad, tipo, concepto)
      DO UPDATE SET monto=EXCLUDED.monto RETURNING id`,
      [pais||'US', ano, mes, actividad, tipo||'entrada', concepto, Number(monto), moneda||'USD', notas||null])
    client.release()
    return NextResponse.json({ ok: true, id: r.rows[0].id })
  } catch (err: any) { client.release(); return NextResponse.json({ error: err.message }, { status: 500 }) }
}
