import { NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

const MN = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

// EANs de los 4 helados Borden 320gr (línea licenciamiento CR)
const EAN_HELADOS = ['7441134017824','7441134017831','7441134017848','7441134017855']

// Tendencia mensual continua compat con TendData del chart reusable.
// Rango completo por defecto; sin filtros — solo los 4 EAN de helados Borden.
export async function GET() {
  try {
    // Rango con data
    const ultR = await pool.query(
      `SELECT
         MAX(EXTRACT(YEAR FROM fecha)::int * 100 + EXTRACT(MONTH FROM fecha)::int) AS mx,
         MIN(EXTRACT(YEAR FROM fecha)::int * 100 + EXTRACT(MONTH FROM fecha)::int) AS mn
       FROM fact_ventas_walmart
       WHERE pais='CR' AND codigo_barras = ANY($1::text[])`,
      [EAN_HELADOS],
    )
    const mx = parseInt(ultR.rows[0]?.mx ?? '0')
    const mn = parseInt(ultR.rows[0]?.mn ?? '0')
    if (!mx) {
      return NextResponse.json({ desde: null, hasta: null, labels: [], total: [], por_sku: [] })
    }
    const hastaAno = Math.floor(mx / 100)
    const hastaMes = mx % 100
    const primerAno = Math.floor(mn / 100)
    const primerMes = mn % 100
    const hastaSerial = hastaAno * 12 + hastaMes
    const desdeSerial = primerAno * 12 + primerMes

    // Labels
    const labels: { ano: number; mes: number; mes_str: string }[] = []
    for (let s = desdeSerial; s <= hastaSerial; s++) {
      const a = Math.floor((s - 1) / 12)
      const m = ((s - 1) % 12) + 1
      labels.push({ ano: a, mes: m, mes_str: `${MN[m]}-${String(a).slice(2)}` })
    }

    const rows = await pool.query(
      `SELECT EXTRACT(YEAR FROM fecha)::int AS ano,
              EXTRACT(MONTH FROM fecha)::int AS mes,
              ROUND(SUM(ventas_valor)::numeric,    2) AS valor_usd,
              ROUND(SUM(ventas_unidades)::numeric, 0) AS unidades
         FROM fact_ventas_walmart
        WHERE pais='CR'
          AND codigo_barras = ANY($1::text[])
          AND (EXTRACT(YEAR FROM fecha)::int * 12 + EXTRACT(MONTH FROM fecha)::int) BETWEEN $2 AND $3
        GROUP BY 1, 2
        ORDER BY 1, 2`,
      [EAN_HELADOS, desdeSerial, hastaSerial],
    )

    type Point = { ano: number; mes: number; mes_str: string; valor_usd: number; valor_cop: number; unidades: number; precio_usd: number; precio_cop: number }
    const emptyPoint = (l: typeof labels[number]): Point => ({
      ano: l.ano, mes: l.mes, mes_str: l.mes_str,
      valor_usd: 0, valor_cop: 0, unidades: 0, precio_usd: 0, precio_cop: 0,
    })
    const finalize = (p: Point) => {
      p.valor_cop = p.valor_usd // Walmart no tiene COP
      p.precio_usd = p.unidades > 0 ? p.valor_usd / p.unidades : 0
      p.precio_cop = p.precio_usd
      return p
    }

    const totalMap: Record<string, Point> = {}
    labels.forEach(l => { totalMap[`${l.ano}-${l.mes}`] = emptyPoint(l) })
    for (const r of rows.rows) {
      const key = `${r.ano}-${r.mes}`
      const p = totalMap[key]
      if (!p) continue
      p.valor_usd += Number(r.valor_usd ?? 0)
      p.unidades  += Number(r.unidades ?? 0)
    }
    const total = labels.map(l => finalize(totalMap[`${l.ano}-${l.mes}`]))

    return NextResponse.json({
      desde: `${primerAno}-${String(primerMes).padStart(2, '0')}`,
      hasta: `${hastaAno}-${String(hastaMes).padStart(2, '0')}`,
      labels,
      total,
      por_sku: [],
    })
  } catch (err) {
    return handleApiError(err)
  }
}
