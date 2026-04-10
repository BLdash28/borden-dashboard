// app/api/finanzas/presupuesto/route.ts
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
      const r = await client.query(`SELECT DISTINCT ano, mes FROM fin_presupuesto ORDER BY ano DESC, mes DESC LIMIT 36`)
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
          ROUND(SUM(presupuesto)::numeric, 2)  AS total_presupuesto,
          ROUND(SUM(real)::numeric, 2)         AS total_real,
          ROUND(SUM(real - presupuesto)::numeric, 2) AS variacion,
          CASE WHEN SUM(presupuesto) > 0
               THEN ROUND((SUM(real) / SUM(presupuesto) * 100)::numeric, 1)
               ELSE 0 END                      AS cumplimiento_pct,
          COUNT(*) FILTER (WHERE real >= presupuesto)          AS items_ok,
          COUNT(*) FILTER (WHERE real < presupuesto * 0.9)     AS items_critico,
          COUNT(*) FILTER (WHERE real >= presupuesto * 0.9
                             AND real < presupuesto)           AS items_alerta
        FROM fin_presupuesto ${where}`, params)
      client.release()
      return NextResponse.json(r.rows[0] || {})
    }

    if (tipo === 'por_categoria') {
      const r = await client.query(`
        SELECT categoria,
          ROUND(SUM(presupuesto)::numeric, 2) AS presupuesto,
          ROUND(SUM(real)::numeric, 2)        AS real,
          ROUND(SUM(real - presupuesto)::numeric, 2) AS variacion,
          CASE WHEN SUM(presupuesto) > 0
               THEN ROUND((SUM(real) / SUM(presupuesto) * 100)::numeric, 1)
               ELSE 0 END AS cumplimiento_pct
        FROM fin_presupuesto ${where}
        GROUP BY categoria ORDER BY categoria`, params)
      client.release()
      return NextResponse.json({ rows: r.rows })
    }

    const r = await client.query(`
      SELECT categoria, concepto,
             ROUND(presupuesto::numeric, 2) AS presupuesto,
             ROUND(real::numeric, 2)        AS real,
             ROUND((real - presupuesto)::numeric, 2)  AS variacion,
             CASE WHEN presupuesto > 0
                  THEN ROUND((real / presupuesto * 100)::numeric, 1)
                  ELSE 0 END AS cumplimiento_pct,
             moneda
      FROM fin_presupuesto ${where}
      ORDER BY categoria, concepto`, params)
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
  const { pais, ano, mes, categoria, concepto, presupuesto, real, moneda } = body
  if (!ano || !mes || !categoria || !concepto || presupuesto == null)
    return NextResponse.json({ error: 'Campos requeridos faltantes' }, { status: 400 })
  const client = await pool.connect()
  try {
    const r = await client.query(`
      INSERT INTO fin_presupuesto (pais, ano, mes, categoria, concepto, presupuesto, real, moneda)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (pais, ano, mes, categoria, concepto)
      DO UPDATE SET presupuesto=EXCLUDED.presupuesto, real=EXCLUDED.real, updated_at=NOW()
      RETURNING id`,
      [pais||'US', ano, mes, categoria, concepto, Number(presupuesto), Number(real||0), moneda||'USD'])
    client.release()
    return NextResponse.json({ ok: true, id: r.rows[0].id })
  } catch (err: any) { client.release(); return NextResponse.json({ error: err.message }, { status: 500 }) }
}
