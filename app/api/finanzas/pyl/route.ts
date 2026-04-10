// app/api/finanzas/pyl/route.ts — Estado de Resultados
import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'
import { getUserRestrictions } from '@/lib/auth/restrictions'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
})

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tipo  = searchParams.get('tipo') || 'detalle'  // detalle | kpis | tendencia | filtros
  const pais  = searchParams.get('pais')
  const anoP  = searchParams.get('ano')
  const mesP  = searchParams.get('mes')

  const restrictions = await getUserRestrictions()
  const client = await pool.connect()

  try {
    if (tipo === 'filtros') {
      const r = await client.query(`
        SELECT DISTINCT ano, mes FROM fin_pyl ORDER BY ano DESC, mes DESC LIMIT 36`)
      client.release()
      return NextResponse.json({ periodos: r.rows })
    }

    const conds: string[] = ['1=1']
    const params: any[]   = []
    let idx = 1

    if (restrictions?.isRestricted && restrictions.paises.length > 0) {
      conds.push(`pais IN (${restrictions.paises.map(() => `$${idx++}`).join(',')})`);
      params.push(...restrictions.paises)
    } else if (pais && pais !== 'Todos') {
      conds.push(`pais = $${idx++}`); params.push(pais)
    }
    if (anoP) { conds.push(`ano = $${idx++}`); params.push(parseInt(anoP)) }
    if (mesP) { conds.push(`mes = $${idx++}`); params.push(parseInt(mesP)) }

    const where = 'WHERE ' + conds.join(' AND ')

    if (tipo === 'kpis') {
      const r = await client.query(`
        SELECT
          SUM(CASE WHEN tipo='ingreso'           THEN valor ELSE 0 END) AS ingresos,
          SUM(CASE WHEN tipo='costo_venta'       THEN valor ELSE 0 END) AS costo_ventas,
          SUM(CASE WHEN tipo IN ('gasto_venta','gasto_admin','gasto_general') THEN valor ELSE 0 END) AS gastos_op,
          SUM(CASE WHEN tipo='gasto_financiero'  THEN valor ELSE 0 END) AS gastos_financieros,
          SUM(CASE WHEN tipo='impuesto'          THEN valor ELSE 0 END) AS impuestos,
          SUM(CASE WHEN tipo='ingreso'           THEN valor
              WHEN tipo IN ('costo_venta','gasto_venta','gasto_admin','gasto_general',
                            'deprec','gasto_financiero','impuesto') THEN -valor
              WHEN tipo='ingreso_financiero' THEN valor
              ELSE 0 END)                                               AS resultado_neto
        FROM fin_pyl ${where}`, params)
      client.release()
      const row = r.rows[0] || {}
      const ingresos = Number(row.ingresos || 0)
      const costo    = Number(row.costo_ventas || 0)
      const gastos   = Number(row.gastos_op || 0)
      const ebitda   = ingresos - costo - gastos
      return NextResponse.json({
        ...row,
        margen_bruto:     ingresos - costo,
        ebitda,
        margen_bruto_pct: ingresos > 0 ? ((ingresos - costo) / ingresos * 100).toFixed(1) : '0',
        ebitda_pct:       ingresos > 0 ? (ebitda / ingresos * 100).toFixed(1) : '0',
        resultado_neto_pct: ingresos > 0 ? (Number(row.resultado_neto || 0) / ingresos * 100).toFixed(1) : '0',
      })
    }

    if (tipo === 'tendencia') {
      const r = await client.query(`
        SELECT
          ano, mes,
          SUM(CASE WHEN tipo='ingreso'     THEN valor ELSE 0 END) AS ingresos,
          SUM(CASE WHEN tipo='costo_venta' THEN valor ELSE 0 END) AS costo_ventas,
          SUM(CASE WHEN tipo IN ('gasto_venta','gasto_admin','gasto_general') THEN valor ELSE 0 END) AS gastos_op
        FROM fin_pyl ${where}
        GROUP BY ano, mes ORDER BY ano, mes`, params)
      client.release()
      return NextResponse.json({ rows: r.rows.map(r => ({
        ...r,
        ebitda:      Number(r.ingresos) - Number(r.costo_ventas) - Number(r.gastos_op),
        margen_bruto: Number(r.ingresos) - Number(r.costo_ventas),
      })) })
    }

    // detalle — desglose por tipo/concepto
    const r = await client.query(`
      SELECT tipo, categoria, concepto,
             ROUND(SUM(valor)::numeric, 2) AS valor,
             moneda
      FROM fin_pyl ${where}
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
  if (!restrictions || restrictions.isRestricted)
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const body = await req.json()
  const { pais, ano, mes, tipo, categoria, concepto, valor, moneda, notas } = body
  if (!ano || !mes || !tipo || !concepto || valor == null)
    return NextResponse.json({ error: 'ano, mes, tipo, concepto y valor son requeridos' }, { status: 400 })

  const client = await pool.connect()
  try {
    const r = await client.query(`
      INSERT INTO fin_pyl (pais, ano, mes, tipo, categoria, concepto, valor, moneda, notas)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (pais, ano, mes, tipo, concepto)
      DO UPDATE SET valor=EXCLUDED.valor, categoria=EXCLUDED.categoria, notas=EXCLUDED.notas
      RETURNING id`, [pais||'US', ano, mes, tipo, categoria||null, concepto, Number(valor), moneda||'USD', notas||null])
    client.release()
    return NextResponse.json({ ok: true, id: r.rows[0].id })
  } catch (err: any) {
    client.release()
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
