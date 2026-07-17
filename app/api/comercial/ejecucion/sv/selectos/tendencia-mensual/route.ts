import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

const MN = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

// Tendencia mensual continua sobre fact_ventas_selectos.
// Filtros: categoria, subcategoria (CSV). No hay COP → valor_cop = valor_usd.
// Rango completo por defecto.
export async function GET(req: NextRequest) {
  try {
    const sp     = req.nextUrl.searchParams
    const cats   = (sp.get('categoria')    ?? '').split(',').map(s => s.trim()).filter(Boolean)
    const subs   = (sp.get('subcategoria') ?? '').split(',').map(s => s.trim()).filter(Boolean)
    const skus   = (sp.get('skus')         ?? sp.get('sku') ?? '').split(',').map(s => s.trim()).filter(Boolean)

    const mesesParam = sp.get('meses')
    const usarRangoCompleto = !mesesParam || mesesParam === 'full'
    const meses = usarRangoCompleto ? 0 : Math.max(1, Math.min(48, parseInt(mesesParam)))

    // WHERE dinámico
    const parts: string[] = []
    const params: unknown[] = []
    let n = 1
    if (cats.length) { parts.push(`categoria    = ANY($${n++})`); params.push(cats) }
    if (subs.length) { parts.push(`subcategoria = ANY($${n++})`); params.push(subs) }
    if (skus.length) { parts.push(`codigo_barras = ANY($${n++})`); params.push(skus) }
    const where = parts.length ? parts.join(' AND ') : 'TRUE'

    // Rango
    const ultR = await pool.query(
      `SELECT
         MAX(EXTRACT(YEAR FROM fecha)::int * 100 + EXTRACT(MONTH FROM fecha)::int) AS mx,
         MIN(EXTRACT(YEAR FROM fecha)::int * 100 + EXTRACT(MONTH FROM fecha)::int) AS mn
       FROM fact_ventas_selectos
       WHERE ${where}`,
      params,
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

    const labels: { ano: number; mes: number; mes_str: string }[] = []
    for (let s = desdeSerial; s <= hastaSerial; s++) {
      const a = Math.floor((s - 1) / 12)
      const m = ((s - 1) % 12) + 1
      labels.push({ ano: a, mes: m, mes_str: `${MN[m]}-${String(a).slice(2)}` })
    }

    // Data mensual
    const rangeStart = params.length + 1
    const rangeEnd   = params.length + 2
    const rows = await pool.query(
      `SELECT EXTRACT(YEAR FROM fecha)::int  AS ano,
              EXTRACT(MONTH FROM fecha)::int AS mes,
              COALESCE(NULLIF(codigo_barras, ''), '(sin sku)') AS sku,
              ROUND(SUM(ventas_valor)::numeric,    2) AS valor_usd,
              ROUND(SUM(ventas_unidades)::numeric, 0) AS unidades
         FROM fact_ventas_selectos
        WHERE ${where}
          AND (EXTRACT(YEAR FROM fecha)::int * 12 + EXTRACT(MONTH FROM fecha)::int) BETWEEN $${rangeStart} AND $${rangeEnd}
        GROUP BY 1, 2, 3
        ORDER BY 1, 2`,
      [...params, desdeSerial, hastaSerial],
    )

    // Descripción por SKU (solo si hay filtro)
    const skusInvolved = Array.from(new Set(rows.rows.map(r => String(r.sku)).filter(s => s !== '(sin sku)')))
    const descBySku: Record<string, string> = {}
    if (skusInvolved.length > 0 && skus.length > 0) {
      const dp = await pool.query(
        `SELECT codigo_barras AS sku, MAX(descripcion) AS descripcion
           FROM fact_ventas_selectos
          WHERE codigo_barras = ANY($1)
          GROUP BY codigo_barras`,
        [skusInvolved],
      )
      for (const r of dp.rows) descBySku[String(r.sku)] = r.descripcion ?? ''
    }

    type Point = { ano: number; mes: number; mes_str: string; valor_usd: number; valor_cop: number; unidades: number; precio_usd: number; precio_cop: number }
    const emptyPoint = (l: typeof labels[number]): Point => ({
      ano: l.ano, mes: l.mes, mes_str: l.mes_str,
      valor_usd: 0, valor_cop: 0, unidades: 0, precio_usd: 0, precio_cop: 0,
    })
    const finalize = (p: Point) => {
      p.valor_cop = p.valor_usd
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

    let por_sku: { sku: string; descripcion: string; points: Point[] }[] = []
    if (skus.length > 0) {
      const bySku: Record<string, Record<string, Point>> = {}
      for (const sku of skus) {
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
      por_sku = skus.map(sku => ({
        sku,
        descripcion: descBySku[sku] ?? '',
        points: labels.map(l => finalize(bySku[sku][`${l.ano}-${l.mes}`])),
      }))
    }

    void meses

    return NextResponse.json({
      desde: `${desdeAno}-${String(desdeMes).padStart(2, '0')}`,
      hasta: `${hastaAno}-${String(hastaMes).padStart(2, '0')}`,
      labels,
      total,
      por_sku,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
