import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'
import { parseExitoFilters, buildExitoWhere } from '@/lib/api/exito-filtros'

export const revalidate = 300

const MN = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

// Tendencia mensual continua (por defecto últimos 14 meses).
// Cuando `?skus=...` está filtrado, devuelve además una serie por SKU.
export async function GET(req: NextRequest) {
  try {
    const f = parseExitoFilters(req)
    const meses = Math.max(1, Math.min(36, parseInt(req.nextUrl.searchParams.get('meses') ?? '14')))

    // Último (ano, mes) con data — respeta filtros para que el rango sea coherente
    const wUlt = buildExitoWhere(f, { startAt: 1 })
    const ultR = await pool.query(
      `SELECT MAX(ano*100 + mes) AS f
         FROM mv_exito_mensual
        WHERE pais='CO' AND ${wUlt.where}`,
      wUlt.params,
    )
    const fNum = parseInt(ultR.rows[0]?.f ?? '0')
    if (!fNum) {
      return NextResponse.json({ desde: null, hasta: null, labels: [], total: [], por_sku: [] })
    }
    const hastaAno = Math.floor(fNum / 100)
    const hastaMes = fNum % 100
    // Convertir a serial (ano*12 + mes) para calcular ventana continua
    const hastaSerial = hastaAno * 12 + hastaMes
    const desdeSerial = hastaSerial - (meses - 1)
    const desdeAno = Math.floor((desdeSerial - 1) / 12)
    const desdeMes = ((desdeSerial - 1) % 12) + 1

    // Ventana de meses (labels)
    const labels: { ano: number; mes: number; mes_str: string; serial: number }[] = []
    for (let s = desdeSerial; s <= hastaSerial; s++) {
      const a = Math.floor((s - 1) / 12)
      const m = ((s - 1) % 12) + 1
      labels.push({ ano: a, mes: m, mes_str: `${MN[m]}-${String(a).slice(2)}`, serial: s })
    }

    // Data mensual con filtros
    const w = buildExitoWhere(f, { startAt: 5 })
    const rows = await pool.query(
      `SELECT m.ano, m.mes,
              COALESCE(NULLIF(m.sku, ''), '(sin sku)') AS sku,
              SUM(m.ventas_valorusd)::numeric AS valor_usd,
              SUM(m.venta_valorcop)::numeric  AS valor_cop,
              SUM(m.ventas_unidades)::numeric AS unidades
         FROM mv_exito_mensual m
        WHERE m.pais='CO'
          AND (m.ano*12 + m.mes) BETWEEN $1 AND $2
          AND (m.ano > $3 OR (m.ano = $3 AND m.mes >= $4) OR TRUE)
          AND ${w.where}
        GROUP BY m.ano, m.mes, m.sku
        ORDER BY m.ano, m.mes`,
      [desdeSerial, hastaSerial, desdeAno, desdeMes, ...w.params],
    )

    // Descripción por SKU (para el label de la línea) — solo si hay filtro
    const skusInvolved = Array.from(new Set(rows.rows.map(r => String(r.sku)).filter(s => s !== '(sin sku)')))
    const descBySku: Record<string, string> = {}
    if (skusInvolved.length > 0 && f.skus.length > 0) {
      const dp = await pool.query(
        `SELECT DISTINCT sku, descripcion
           FROM dim_producto
          WHERE pais='CO' AND sku = ANY($1)`,
        [skusInvolved],
      )
      for (const r of dp.rows) descBySku[String(r.sku)] = r.descripcion ?? ''
    }

    // Pivotar: total por mes (aggregate) y — si hay skuSel — series por sku
    type Point = { ano: number; mes: number; mes_str: string; valor_usd: number; valor_cop: number; unidades: number; precio_usd: number; precio_cop: number }
    const emptyPoint = (l: typeof labels[number]): Point => ({
      ano: l.ano, mes: l.mes, mes_str: l.mes_str,
      valor_usd: 0, valor_cop: 0, unidades: 0, precio_usd: 0, precio_cop: 0,
    })
    const finalize = (p: Point) => {
      p.precio_usd = p.unidades > 0 ? p.valor_usd / p.unidades : 0
      p.precio_cop = p.unidades > 0 ? p.valor_cop / p.unidades : 0
      return p
    }

    // Total (agregado sobre todos los skus filtrados)
    const totalMap: Record<string, Point> = {}
    labels.forEach(l => { totalMap[`${l.ano}-${l.mes}`] = emptyPoint(l) })
    for (const r of rows.rows) {
      const key = `${r.ano}-${r.mes}`
      const p = totalMap[key]
      if (!p) continue
      p.valor_usd += Number(r.valor_usd ?? 0)
      p.valor_cop += Number(r.valor_cop ?? 0)
      p.unidades  += Number(r.unidades ?? 0)
    }
    const total = labels.map(l => finalize(totalMap[`${l.ano}-${l.mes}`]))

    // Serie por SKU — solo cuando el usuario filtró explícitamente por SKUs
    let por_sku: { sku: string; descripcion: string; points: Point[] }[] = []
    if (f.skus.length > 0) {
      const bySku: Record<string, Record<string, Point>> = {}
      for (const sku of f.skus) {
        bySku[sku] = {}
        labels.forEach(l => { bySku[sku][`${l.ano}-${l.mes}`] = emptyPoint(l) })
      }
      for (const r of rows.rows) {
        const sku = String(r.sku)
        if (!bySku[sku]) continue
        const p = bySku[sku][`${r.ano}-${r.mes}`]
        if (!p) continue
        p.valor_usd += Number(r.valor_usd ?? 0)
        p.valor_cop += Number(r.valor_cop ?? 0)
        p.unidades  += Number(r.unidades ?? 0)
      }
      por_sku = f.skus.map(sku => ({
        sku,
        descripcion: descBySku[sku] ?? '',
        points: labels.map(l => finalize(bySku[sku][`${l.ano}-${l.mes}`])),
      }))
    }

    return NextResponse.json({
      desde: `${desdeAno}-${String(desdeMes).padStart(2, '0')}`,
      hasta: `${hastaAno}-${String(hastaMes).padStart(2, '0')}`,
      labels: labels.map(l => ({ ano: l.ano, mes: l.mes, mes_str: l.mes_str })),
      total,
      por_sku,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
