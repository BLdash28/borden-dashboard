import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

const MN = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export async function GET(req: NextRequest) {
  try {
    const sp       = req.nextUrl.searchParams
    const pais     = sp.get('pais')     ?? 'CR'
    const cliente  = sp.get('cliente')  ?? 'WALMART'
    const paisSafe    = pais.replace(/'/g, "''")
    const clienteSafe = cliente.replace(/'/g, "''")

    const [selloutR, sellinR] = await Promise.all([
      pool.query(`
        SELECT
          EXTRACT(MONTH FROM fecha)::int          AS mes,
          categoria,
          ROUND(SUM(ventas_valor)::numeric,    2) AS sellout_val,
          ROUND(SUM(ventas_unidades)::numeric, 0) AS sellout_uni
        FROM fact_ventas_walmart
        WHERE pais = '${paisSafe}'
          AND fecha >= '2026-01-01' AND fecha < '2027-01-01'
          AND categoria IN ('Quesos', 'Leches')
        GROUP BY EXTRACT(MONTH FROM fecha)::int, categoria
        ORDER BY mes, categoria
      `),
      pool.query(`
        SELECT mes, categoria,
          ROUND(SUM(venta_neta)::numeric,     2) AS sellin_val,
          ROUND(SUM(cantidad_cajas)::numeric, 0) AS sellin_cajas
        FROM fact_sales_sellin
        WHERE ano = 2026
          AND pais = '${paisSafe}'
          AND cliente_nombre = '${clienteSafe}'
          AND categoria IN ('Quesos', 'Leches')
        GROUP BY mes, categoria
        ORDER BY mes, categoria
      `),
    ])

    const selloutByKey: Record<string, number> = {}
    for (const r of selloutR.rows) {
      selloutByKey[`${r.mes}-${r.categoria}`] = parseFloat(r.sellout_val)
    }

    const sellinByKey: Record<string, number> = {}
    for (const r of sellinR.rows) {
      sellinByKey[`${r.mes}-${r.categoria}`] = parseFloat(r.sellin_val)
    }

    const allMeses = new Set([
      ...selloutR.rows.map(r => parseInt(r.mes)),
      ...sellinR.rows.map(r => parseInt(r.mes)),
    ])
    const maxMes = allMeses.size > 0 ? Math.max(...allMeses) : 0

    type Point = { mes: number; mes_nombre: string; sellout: number; sellin: number }
    const quesos: Point[] = []
    const leches: Point[] = []

    for (let m = 1; m <= maxMes; m++) {
      const qSellout = selloutByKey[`${m}-Quesos`] ?? 0
      const qSellin  = sellinByKey[`${m}-Quesos`]  ?? 0
      if (qSellout > 0 || qSellin > 0) {
        quesos.push({ mes: m, mes_nombre: MN[m] ?? '', sellout: qSellout, sellin: qSellin })
      }

      const lSellout = selloutByKey[`${m}-Leches`] ?? 0
      const lSellin  = sellinByKey[`${m}-Leches`]  ?? 0
      if (lSellout > 0 || lSellin > 0) {
        leches.push({ mes: m, mes_nombre: MN[m] ?? '', sellout: lSellout, sellin: lSellin })
      }
    }

    return NextResponse.json({ quesos, leches })
  } catch (err) {
    return handleApiError(err)
  }
}
