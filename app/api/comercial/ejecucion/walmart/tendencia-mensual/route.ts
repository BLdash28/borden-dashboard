import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'
import { parseWalmartFilters, buildWalmartWhere } from '@/lib/api/walmart-filtros'

export const revalidate = 300

const MN = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

// Tendencia mensual continua (rango completo por defecto).
// Cuando `?skus=...` está filtrado, devuelve además una serie por SKU.
// Walmart usa solo USD (no COP), por lo tanto valor_cop = valor_usd.
export async function GET(req: NextRequest) {
  try {
    const sp   = req.nextUrl.searchParams
    const pais = sp.get('pais') ?? 'CR'
    const f    = parseWalmartFilters(req)
    // Modo por defecto: rango completo. Compat: `?meses=N` → ventana rolling.
    const mesesParam = sp.get('meses')
    const usarRangoCompleto = !mesesParam || mesesParam === 'full'
    const meses = usarRangoCompleto ? 0 : Math.max(1, Math.min(48, parseInt(mesesParam)))

    // Rango con data — respeta filtros para que la ventana sea coherente
    const wUlt = buildWalmartWhere(f, { startAt: 2 })
    const ultR = await pool.query(
      `SELECT MAX(ano*100 + mes) AS mx, MIN(ano*100 + mes) AS mn
         FROM mv_walmart_mensual
        WHERE pais = $1 AND ${wUlt.where}`,
      [pais, ...wUlt.params],
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
    const desdeSerialCompleto = primerAno * 12 + primerMes
    const desdeSerial = usarRangoCompleto ? desdeSerialCompleto : hastaSerial - (meses - 1)
    const desdeAno = Math.floor((desdeSerial - 1) / 12)
    const desdeMes = ((desdeSerial - 1) % 12) + 1

    // Ventana de meses (labels)
    const labels: { ano: number; mes: number; mes_str: string; serial: number }[] = []
    for (let s = desdeSerial; s <= hastaSerial; s++) {
      const a = Math.floor((s - 1) / 12)
      const m = ((s - 1) % 12) + 1
      labels.push({ ano: a, mes: m, mes_str: `${MN[m]}-${String(a).slice(2)}`, serial: s })
    }

    // Data mensual con filtros ($1=pais, $2=desdeSerial, $3=hastaSerial, luego filtros walmart)
    const w = buildWalmartWhere(f, { startAt: 4 })
    const rows = await pool.query(
      `SELECT m.ano, m.mes,
              COALESCE(NULLIF(m.sku, ''), '(sin sku)') AS sku,
              SUM(m.ventas_valor)::numeric    AS valor_usd,
              SUM(m.ventas_unidades)::numeric AS unidades
         FROM mv_walmart_mensual m
        WHERE m.pais = $1
          AND (m.ano*12 + m.mes) BETWEEN $2 AND $3
          AND ${w.where}
        GROUP BY m.ano, m.mes, m.sku
        ORDER BY m.ano, m.mes`,
      [pais, desdeSerial, hastaSerial, ...w.params],
    )

    // Descripción por SKU (para el label de la línea) — solo si hay filtro por SKU
    const skusInvolved = Array.from(new Set(rows.rows.map(r => String(r.sku)).filter(s => s !== '(sin sku)')))
    const descBySku: Record<string, string> = {}
    if (skusInvolved.length > 0 && f.skus.length > 0) {
      const dp = await pool.query(
        `SELECT sku, MAX(descripcion) AS descripcion
           FROM mv_walmart_mensual
          WHERE pais = $1 AND sku = ANY($2)
          GROUP BY sku`,
        [pais, skusInvolved],
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
      p.valor_cop = p.valor_usd // Walmart no tiene COP
      p.precio_usd = p.unidades > 0 ? p.valor_usd / p.unidades : 0
      p.precio_cop = p.precio_usd
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
        p.unidades  += Number(r.unidades ?? 0)
      }
      por_sku = f.skus.map(sku => ({
        sku,
        descripcion: descBySku[sku] ?? '',
        points: labels.map(l => finalize(bySku[sku][`${l.ano}-${l.mes}`])),
      }))
    }

    // Silence unused-var warning: meses solo se usa para el cálculo de desdeSerial arriba.
    void meses

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
