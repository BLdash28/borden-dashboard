import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 1800

const MN = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

/**
 * Tendencia mensual Unisuper GT — formato TendData compatible con
 * <TendenciaMensualChart>. Rango completo por defecto; `?meses=N` para ventana rolling.
 * Cuando `?skus=...` está seteado, devuelve serie por SKU también.
 * Unisuper no separa COP → valor_cop = valor_usd.
 */
function csv(sp: URLSearchParams, key: string): string[] {
  const v = sp.get(key)
  return v ? v.split(',').map(s => s.trim()).filter(Boolean) : []
}

function buildWhere(sp: URLSearchParams) {
  const params: unknown[] = []
  const conds: string[] = [`pais = 'GT'`]

  const cadenas = csv(sp, 'cadenas')
  if (cadenas.length) {
    const start = params.length
    cadenas.forEach(v => params.push(v))
    conds.push(`cadena IN (${cadenas.map((_, i) => `$${start + 1 + i}`).join(',')})`)
  }
  const subcats = csv(sp, 'subcategorias')
  if (subcats.length) {
    const start = params.length
    subcats.forEach(v => params.push(v))
    conds.push(`subcategoria IN (${subcats.map((_, i) => `$${start + 1 + i}`).join(',')})`)
  }
  const pdvs = csv(sp, 'punto_venta')
  if (pdvs.length) {
    const start = params.length
    pdvs.forEach(v => params.push(v))
    conds.push(`nombre_sucursal IN (${pdvs.map((_, i) => `$${start + 1 + i}`).join(',')})`)
  }
  const skus = csv(sp, 'skus')
  if (skus.length) {
    const start = params.length
    skus.forEach(v => params.push(v))
    conds.push(`sku IN (${skus.map((_, i) => `$${start + 1 + i}`).join(',')})`)
  }
  return { where: conds.join(' AND '), params, skus }
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const mesesParam       = sp.get('meses')
    const usarRangoCompleto = !mesesParam || mesesParam === 'full'
    const meses = usarRangoCompleto ? 0 : Math.max(1, Math.min(48, parseInt(mesesParam)))
    const w = buildWhere(sp)

    // Rango con data
    const ultR = await pool.query(
      `SELECT MAX(EXTRACT(YEAR FROM fecha)*100 + EXTRACT(MONTH FROM fecha))::int AS mx,
              MIN(EXTRACT(YEAR FROM fecha)*100 + EXTRACT(MONTH FROM fecha))::int AS mn
         FROM fact_ventas_unisuper
        WHERE ${w.where}`,
      w.params,
    )
    const mx = parseInt(ultR.rows[0]?.mx ?? '0')
    const mn = parseInt(ultR.rows[0]?.mn ?? '0')
    if (!mx || !mn) {
      return NextResponse.json({ desde: null, hasta: null, labels: [], total: [], por_sku: [] })
    }

    // Total mensual
    const totR = await pool.query(
      `SELECT EXTRACT(YEAR FROM fecha)::int  AS ano,
              EXTRACT(MONTH FROM fecha)::int AS mes,
              ROUND(SUM(ventas_valor)::numeric,    2) AS valor_usd,
              ROUND(SUM(ventas_unidades)::numeric, 0) AS unidades
         FROM fact_ventas_unisuper
        WHERE ${w.where}
        GROUP BY 1, 2
        ORDER BY 1, 2`,
      w.params,
    )

    // Armar labels rangos
    const yMn = Math.floor(mn / 100), mMn = mn % 100
    const yMx = Math.floor(mx / 100), mMx = mx % 100
    const labels: { ano: number; mes: number; mes_str: string }[] = []
    let y = yMn, m = mMn
    while (y < yMx || (y === yMx && m <= mMx)) {
      labels.push({ ano: y, mes: m, mes_str: `${MN[m]} ${String(y).slice(2)}` })
      m++
      if (m > 12) { m = 1; y++ }
    }
    // Rolling window
    const labelsFiltered = usarRangoCompleto ? labels : labels.slice(-meses)

    const key = (a: number, m: number) => `${a}-${m}`
    const totMap: Record<string, { valor_usd: number; unidades: number }> = {}
    for (const r of totR.rows) {
      totMap[key(parseInt(r.ano), parseInt(r.mes))] = {
        valor_usd: parseFloat(r.valor_usd ?? '0'),
        unidades: parseFloat(r.unidades ?? '0'),
      }
    }

    const total = labelsFiltered.map(l => {
      const d = totMap[key(l.ano, l.mes)] ?? { valor_usd: 0, unidades: 0 }
      return {
        ano: l.ano, mes: l.mes, mes_str: l.mes_str,
        valor_usd: d.valor_usd,
        valor_cop: d.valor_usd,  // Unisuper no separa COP
        unidades:  d.unidades,
        precio_usd: d.unidades > 0 ? d.valor_usd / d.unidades : 0,
        precio_cop: d.unidades > 0 ? d.valor_usd / d.unidades : 0,
      }
    })

    // Por SKU (si hay filtro)
    let por_sku: any[] = []
    if (w.skus.length > 0) {
      const skuR = await pool.query(
        `SELECT sku, MAX(descripcion) AS descripcion,
                EXTRACT(YEAR FROM fecha)::int AS ano,
                EXTRACT(MONTH FROM fecha)::int AS mes,
                ROUND(SUM(ventas_valor)::numeric,    2) AS valor_usd,
                ROUND(SUM(ventas_unidades)::numeric, 0) AS unidades
           FROM fact_ventas_unisuper
          WHERE ${w.where}
          GROUP BY sku, ano, mes
          ORDER BY sku, ano, mes`,
        w.params,
      )
      const skuMap: Record<string, { descripcion: string; pts: Record<string, { v: number; u: number }> }> = {}
      for (const r of skuR.rows) {
        if (!skuMap[r.sku]) skuMap[r.sku] = { descripcion: r.descripcion ?? '', pts: {} }
        skuMap[r.sku].pts[key(parseInt(r.ano), parseInt(r.mes))] = {
          v: parseFloat(r.valor_usd ?? '0'),
          u: parseFloat(r.unidades ?? '0'),
        }
      }
      por_sku = Object.entries(skuMap).map(([sku, obj]) => ({
        sku,
        descripcion: obj.descripcion,
        points: labelsFiltered.map(l => {
          const d = obj.pts[key(l.ano, l.mes)] ?? { v: 0, u: 0 }
          return {
            ano: l.ano, mes: l.mes, mes_str: l.mes_str,
            valor_usd: d.v, valor_cop: d.v,
            unidades: d.u,
            precio_usd: d.u > 0 ? d.v / d.u : 0,
            precio_cop: d.u > 0 ? d.v / d.u : 0,
          }
        }),
      }))
    }

    const desde = labelsFiltered[0] ? `${labelsFiltered[0].ano}-${String(labelsFiltered[0].mes).padStart(2, '0')}-01` : null
    const hastaL = labelsFiltered[labelsFiltered.length - 1]
    const hasta = hastaL ? `${hastaL.ano}-${String(hastaL.mes).padStart(2, '0')}-01` : null

    return NextResponse.json({ desde, hasta, labels: labelsFiltered, total, por_sku })
  } catch (err) {
    return handleApiError(err)
  }
}
