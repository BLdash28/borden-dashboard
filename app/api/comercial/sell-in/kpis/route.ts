import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

export async function GET(req: NextRequest) {
  try {
    const sp     = req.nextUrl.searchParams
    const ano    = parseInt(sp.get('ano') || '2026')
    const paises      = sp.get('pais')          ? sp.get('pais')!.split(',').filter(Boolean)          : []
    const cats        = sp.get('categoria')     ? sp.get('categoria')!.split(',').filter(Boolean)     : []
    const subcats     = sp.get('subcategoria')  ? sp.get('subcategoria')!.split(',').filter(Boolean)  : []
    const tipos       = sp.get('tipo_negocio')  ? sp.get('tipo_negocio')!.split(',').filter(Boolean)  : []
    const clientes    = sp.get('cliente')       ? sp.get('cliente')!.split(',').filter(Boolean)       : []
    const proveedores = sp.get('proveedor')     ? sp.get('proveedor')!.split(',').filter(Boolean)     : []
    const mesesArr    = sp.get('mes')           ? sp.get('mes')!.split(',').map(Number).filter(n => n >= 1 && n <= 12) : []

    const inC = (col: string, vals: string[]) =>
      `${col} IN (${vals.map(v => `'${v.replace(/'/g,"''")}'`).join(',')})`

    const extraConds: string[] = []
    if (paises.length)      extraConds.push(inC('pais', paises))
    if (cats.length)        extraConds.push(inC('categoria', cats))
    if (subcats.length)     extraConds.push(inC('subcategoria', subcats))
    if (tipos.length)       extraConds.push(inC('tipo_negocio', tipos))
    if (clientes.length)    extraConds.push(inC('cliente_nombre', clientes))
    if (proveedores.length) extraConds.push(inC('proveedor', proveedores))
    if (mesesArr.length)    extraConds.push(`mes IN (${mesesArr.join(',')})`)
    const extra = extraConds.length ? 'AND ' + extraConds.join(' AND ') : ''

    // Último mes con datos del año actual (corte YTD)
    const cutoffR = await pool.query(`
      SELECT COALESCE(MAX(mes), 0) AS ultimo_mes
      FROM fact_sales_sellin
      WHERE ano_pedido = ${ano} AND venta_neta > 0 ${extra}
    `)
    const ultimoMes = parseInt(cutoffR.rows[0].ultimo_mes) || 0

    // Año actual: YTD completo
    // Año anterior: solo los mismos meses (1..ultimoMes) para comparación justa
    // total_lb: solo Quesos (dp.peso_lb NOT NULL)
    // total_litros: solo Leches (cajas × VNPK × litros)
    const [currR, prevR, lbltR] = await Promise.all([
      pool.query(`
        SELECT
          COALESCE(SUM(venta_neta),     0) AS ingresos,
          COALESCE(SUM(cantidad_cajas), 0) AS cajas,
          COALESCE(SUM(margen_valor),   0) AS margen,
          COALESCE(AVG(margen_pct),     0) AS margen_pct_avg,
          COUNT(DISTINCT cliente_nombre)   AS clientes,
          COUNT(DISTINCT sku)              AS skus
        FROM fact_sales_sellin
        WHERE ano_pedido = ${ano} AND mes <= ${ultimoMes} ${extra}
      `),
      pool.query(`
        SELECT
          COALESCE(SUM(venta_neta),     0) AS ingresos,
          COALESCE(SUM(cantidad_cajas), 0) AS cajas,
          COALESCE(SUM(margen_valor),   0) AS margen,
          COALESCE(AVG(margen_pct),     0) AS margen_pct_avg
        FROM (
          SELECT venta_neta, cantidad_cajas, margen_valor, margen_pct FROM fact_sales_sellin
          WHERE ano_pedido = ${ano - 1} AND mes <= ${ultimoMes} ${extra}
          UNION ALL
          SELECT ingresos AS venta_neta, 0 AS cantidad_cajas, 0 AS margen_valor, NULL AS margen_pct FROM ventas_sell_in
          WHERE ano = ${ano - 1} AND mes <= ${ultimoMes}
            ${paises.length ? 'AND ' + inC('pais', paises) : ''}
            ${cats.length   ? 'AND ' + inC('categoria', cats) : ''}
            AND (ano, mes) NOT IN (SELECT DISTINCT ano_pedido AS ano, mes FROM fact_sales_sellin)
        ) sub
      `),
      // Libras (Quesos) + Litros (Leches) YTD año actual y YTD año anterior
      pool.query(`
        WITH cur AS (
          SELECT sku, cantidad_cajas FROM fact_sales_sellin
          WHERE ano_pedido = ${ano} AND mes <= ${ultimoMes} ${extra}
        ),
        prev AS (
          SELECT sku, cantidad_cajas FROM fact_sales_sellin
          WHERE ano_pedido = ${ano - 1} AND mes <= ${ultimoMes} ${extra}
        )
        SELECT
          COALESCE((SELECT ROUND(SUM(c.cantidad_cajas * dp.peso_lb)::numeric, 1) FROM cur c JOIN dim_producto dp ON dp.sku=c.sku WHERE dp.peso_lb IS NOT NULL), 0) AS cur_lb,
          COALESCE((SELECT ROUND(SUM(c.cantidad_cajas * COALESCE(dp.vnpk_qty,1) * dp.litros)::numeric, 1) FROM cur c JOIN dim_producto dp ON dp.sku=c.sku WHERE dp.litros IS NOT NULL), 0) AS cur_l,
          COALESCE((SELECT ROUND(SUM(p.cantidad_cajas * dp.peso_lb)::numeric, 1) FROM prev p JOIN dim_producto dp ON dp.sku=p.sku WHERE dp.peso_lb IS NOT NULL), 0) AS prev_lb,
          COALESCE((SELECT ROUND(SUM(p.cantidad_cajas * COALESCE(dp.vnpk_qty,1) * dp.litros)::numeric, 1) FROM prev p JOIN dim_producto dp ON dp.sku=p.sku WHERE dp.litros IS NOT NULL), 0) AS prev_l
      `),
    ])

    const cur  = currR.rows[0]
    const prev = prevR.rows[0]
    const lblt = lbltR.rows[0] ?? { cur_lb: 0, cur_l: 0, prev_lb: 0, prev_l: 0 }
    const curLb = parseFloat(lblt.cur_lb) || 0
    const curL  = parseFloat(lblt.cur_l)  || 0
    const prevLb = parseFloat(lblt.prev_lb) || 0
    const prevL  = parseFloat(lblt.prev_l)  || 0

    const delta = (c: number, p: number) =>
      p > 0 ? ((c - p) / p) * 100 : c > 0 ? 100 : 0

    const curIngresos   = parseFloat(cur.ingresos)
    const curMargen     = parseFloat(cur.margen)
    const prevMargen    = parseFloat(prev.margen)
    const margenPct     = parseFloat(cur.margen_pct_avg)  * 100
    const margenPctPrev = parseFloat(prev.margen_pct_avg) * 100

    return NextResponse.json({
      ano,
      ultimoMes,
      kpis: {
        ingresos:   { valor: curIngresos,                delta: delta(curIngresos, parseFloat(prev.ingresos)) },
        cajas:      { valor: parseFloat(cur.cajas),      delta: delta(parseFloat(cur.cajas), parseFloat(prev.cajas)) },
        margen:     { valor: curMargen,                  delta: delta(curMargen, prevMargen) },
        margen_pct: margenPct,
        margen_pct_delta: margenPct - margenPctPrev,
        clientes: parseInt(cur.clientes),
        skus:     parseInt(cur.skus),
        libras:   { valor: curLb, delta: delta(curLb, prevLb) },
        litros:   { valor: curL,  delta: delta(curL,  prevL) },
      },
    })
  } catch (err) {
    return handleApiError(err)
  }
}
