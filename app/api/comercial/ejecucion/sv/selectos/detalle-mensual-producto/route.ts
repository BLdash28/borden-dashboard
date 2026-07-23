import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

/**
 * Detalle Seguimiento Mensual — Selectos SV.
 *
 * Réplica del formato Éxito: fila por SKU (y por sucursal) con desglose
 * mensual + YTD + Run Rate + valor mes actual + proyección de cierre.
 *
 * Todo el valor es USD (Selectos ya viene en USD). Se cruza contra
 * dim_producto para exponer SKU/descripción/categoría/subcategoría canónicos.
 *
 * Filtros (todos opcionales, CSV): categoria, subcategoria, skus.
 */

const DIAS_MES: Record<number, number> = { 1:31, 2:28, 3:31, 4:30, 5:31, 6:30, 7:31, 8:31, 9:30, 10:31, 11:30, 12:31 }
const MES_LBL = (m: number) => ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][m - 1]

type Bucket = { und: number; val: number }
type Row = {
  key:   string
  label: string
  sku?:  string
  subcategoria?: string | null
  meses:     Record<number, number>   // mes → valor USD
  mesesUnd:  Record<number, number>   // mes → unidades
  ytdVal:    number
  ytdUnd:    number
  rrVal:     number
  rrUnd:     number
  valActual: number
  undActual: number
  proyVal:   number
  proyUnd:   number
}

export async function GET(req: NextRequest) {
  try {
    const sp   = req.nextUrl.searchParams
    const ano  = parseInt(sp.get('ano') ?? '2026')
    const cats = (sp.get('categoria')    ?? '').split(',').map(s => s.trim()).filter(Boolean)
    const subs = (sp.get('subcategoria') ?? '').split(',').map(s => s.trim()).filter(Boolean)
    const skus = (sp.get('skus') ?? sp.get('sku') ?? '').split(',').map(s => s.trim()).filter(Boolean)

    // WHERE base con dim_producto para cruces canónicos
    const parts: string[] = [
      `f.pais='SV'`,
      `f.codigo_barras IS NOT NULL`,
      `f.codigo_barras <> ''`,
      `EXTRACT(YEAR FROM f.fecha) IN (${ano - 1}, ${ano})`,
    ]
    const params: unknown[] = []
    let n = 1
    if (cats.length) { parts.push(`COALESCE(dp.categoria, f.categoria) = ANY($${n++})`); params.push(cats) }
    if (subs.length) { parts.push(`COALESCE(dp.subcategoria, f.subcategoria) = ANY($${n++})`); params.push(subs) }
    if (skus.length) { parts.push(`(dp.sku = ANY($${n}) OR f.codigo_barras = ANY($${n}))`); params.push(skus); n++ }
    const where = parts.join(' AND ')

    // Última fecha con data del año objetivo (respetando filtros)
    const ultR = await pool.query(
      `SELECT MAX(f.fecha)::date AS f
       FROM fact_ventas_selectos f
       LEFT JOIN dim_producto dp ON dp.codigo_barras = f.codigo_barras
       WHERE ${where} AND EXTRACT(YEAR FROM f.fecha) = ${ano}`,
      params,
    )
    const ultFecha = ultR.rows[0]?.f
    if (!ultFecha) {
      return NextResponse.json({
        ano, ultimo_mes: 0, ultimo_mes_label: null, ultimo_dia: 0,
        dias_mes: 30, ultima_fecha: null,
        por_producto: [], por_sucursal: [],
      })
    }
    const d = new Date(ultFecha)
    const mesActual = d.getUTCMonth() + 1
    const diaActual = d.getUTCDate()
    const diasMes   = DIAS_MES[mesActual] ?? 30

    // Query producto — SKU canónico (dim_producto) o codigo_barras si no matchea
    const [prodR, sucR] = await Promise.all([
      pool.query(
        `SELECT
           COALESCE(dp.sku, f.codigo_barras) AS grp,
           COALESCE(dp.descripcion, MAX(f.descripcion)) AS label,
           MAX(COALESCE(dp.subcategoria, f.subcategoria)) AS subcategoria,
           EXTRACT(MONTH FROM f.fecha)::int AS mes,
           EXTRACT(YEAR FROM f.fecha)::int  AS ano,
           SUM(f.ventas_valor)::numeric    AS val,
           SUM(f.ventas_unidades)::numeric AS und
         FROM fact_ventas_selectos f
         LEFT JOIN dim_producto dp ON dp.codigo_barras = f.codigo_barras
         WHERE ${where}
         GROUP BY 1, dp.descripcion, 4, 5`,
        params,
      ),
      pool.query(
        `SELECT
           f.nombre_sucursal AS grp,
           EXTRACT(MONTH FROM f.fecha)::int AS mes,
           EXTRACT(YEAR FROM f.fecha)::int  AS ano,
           SUM(f.ventas_valor)::numeric    AS val,
           SUM(f.ventas_unidades)::numeric AS und
         FROM fact_ventas_selectos f
         LEFT JOIN dim_producto dp ON dp.codigo_barras = f.codigo_barras
         WHERE ${where} AND f.nombre_sucursal IS NOT NULL AND f.nombre_sucursal <> ''
         GROUP BY 1, 2, 3`,
        params,
      ),
    ])

    // Solo tomamos el año objetivo para las columnas mensuales / RR / proy.
    // El año anterior queda para calcular delta YTD si se quisiera después.
    const build = (key: string, label: string, mesesData: Record<number, Bucket>, subcat?: string | null): Row => {
      const meses:    Record<number, number> = {}
      const mesesUnd: Record<number, number> = {}
      let ytdVal = 0, ytdUnd = 0
      for (let m = 1; m <= mesActual; m++) {
        const b = mesesData[m]
        const v = b?.val ?? 0
        const u = b?.und ?? 0
        meses[m]    = v
        mesesUnd[m] = u
        ytdVal += v
        ytdUnd += u
      }
      const cur = mesesData[mesActual]
      const valActual = cur?.val ?? 0
      const undActual = cur?.und ?? 0
      const rrVal = diaActual > 0 ? valActual / diaActual : 0
      const rrUnd = diaActual > 0 ? undActual / diaActual : 0
      return {
        key, label, subcategoria: subcat,
        meses, mesesUnd,
        ytdVal, ytdUnd,
        rrVal: Math.round(rrVal * 100) / 100,
        rrUnd: Math.round(rrUnd * 10) / 10,
        valActual, undActual,
        proyVal: Math.round(rrVal * diasMes * 100) / 100,
        proyUnd: Math.round(rrUnd * diasMes),
      }
    }

    // Por Producto
    type ProdAcc = { label: string; subcategoria: string | null; meses: Record<number, Bucket> }
    const byProd = new Map<string, ProdAcc>()
    for (const r of prodR.rows) {
      const grp = String(r.grp)
      const rAno = parseInt(r.ano)
      if (rAno !== ano) continue
      let a = byProd.get(grp)
      if (!a) { a = { label: r.label ?? grp, subcategoria: r.subcategoria ?? null, meses: {} }; byProd.set(grp, a) }
      const m = parseInt(r.mes)
      const prev = a.meses[m] ?? { und: 0, val: 0 }
      a.meses[m] = { und: prev.und + Number(r.und ?? 0), val: prev.val + Number(r.val ?? 0) }
    }
    const porProducto: Row[] = Array.from(byProd.entries())
      .map(([k, v]) => ({ ...build(k, v.label, v.meses, v.subcategoria), sku: k }))
      .sort((a, b) => b.ytdVal - a.ytdVal)

    // Por Sucursal
    const bySuc = new Map<string, Record<number, Bucket>>()
    for (const r of sucR.rows) {
      const grp = String(r.grp)
      const rAno = parseInt(r.ano)
      if (rAno !== ano) continue
      let a = bySuc.get(grp)
      if (!a) { a = {}; bySuc.set(grp, a) }
      const m = parseInt(r.mes)
      const prev = a[m] ?? { und: 0, val: 0 }
      a[m] = { und: prev.und + Number(r.und ?? 0), val: prev.val + Number(r.val ?? 0) }
    }
    const porSucursal: Row[] = Array.from(bySuc.entries())
      .map(([k, meses]) => build(k, k, meses))
      .sort((a, b) => b.ytdVal - a.ytdVal)

    const ultimaFecha = ultFecha instanceof Date
      ? ultFecha.toISOString().slice(0, 10)
      : String(ultFecha).slice(0, 10)

    return NextResponse.json({
      ano,
      ultimo_mes:       mesActual,
      ultimo_mes_label: MES_LBL(mesActual),
      ultimo_dia:       diaActual,
      dias_mes:         diasMes,
      ultima_fecha:     ultimaFecha,
      por_producto:     porProducto,
      por_sucursal:     porSucursal,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
