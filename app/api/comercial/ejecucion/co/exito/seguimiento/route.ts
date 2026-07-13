import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'
import { parseExitoFilters, buildExitoWhere } from '@/lib/api/exito-filtros'

export const revalidate = 300

// Mapeo SKU Borden → PluCD Éxito (del email de Ignacio)
const SKU_TO_PLUCD: Record<string, string> = {
  '120059': '3711386',  // MOZZARELLA PALITOS X 200 G
  '110420': '3711392',  // HOLANDES TAJADO 130 G
  '110421': '3711393',  // PROVOLONE TAJADO 130 G
  '110422': '3711395',  // MUENSTER TAJADO 130 G
  '110423': '3711387',  // FETA CUÑA 200 G
  '110419': '3711391',  // GOUDA AHUMADO TAJADO 130 G
  '110425': '3711388',  // TIPO PARMESANO RALLADO 250 G
  '110424': '3711389',  // TIPO PARMESANO RALLADO 100 G
  '10319':  '3711390',  // AMERICANO FUNDIDO LONCHAS 216 G
  '10318':  '3711397',  // IMITACION DE MOZZARELLA LONCHAS 180 G
  '10317':  '3711396',  // IMITACION DE AMERICANO LONCHAS 180 G
}

const SKU_TO_DESC: Record<string, string> = {
  '120059': 'MOZZARELLA PALITOS X 200 G',
  '110420': 'HOLANDES TAJ X 130 G',
  '110421': 'PROVOLONE TAJ X 130 G',
  '110422': 'MUENSTER TAJ X 130 G',
  '110423': 'FETA CUÑA X 200 G',
  '110419': 'GOUDA AHUMADO TAJ X 130 G',
  '110425': 'TIPO PARMESANO RALLADO X 250 G',
  '110424': 'TIPO PARMESANO RALLADO X 100 G',
  '10319':  'LONCHAS AMERICANO FUNDIDO X 216 G',
  '10318':  'LONCHAS IMITACION MOZZARELLA X 180 G',
  '10317':  'LONCHAS IMITACION AMERICANO X 180 G',
}

const DIAS_MES: Record<number, number> = { 1: 31, 2: 28, 3: 31, 4: 30, 5: 31, 6: 30, 7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31 }
const MES_LBL = (m: number) => ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][m - 1]

type Bucket = { und: number; usd: number; cop: number }
type RowOut = {
  key: string
  label: string
  plucd?: string
  sku?: string
  meses: Record<number, number>      // mes → COP
  mesesUsd: Record<number, number>   // mes → USD (margen Borden)
  mesesUnd: Record<number, number>   // mes → unidades
  ytdCop: number
  ytdUsd: number
  ytdUnd: number
  rrUnd: number     // unidades por día (mes en curso)
  rrCop: number     // COP por día (mes en curso)
  rrUsd: number     // USD por día (mes en curso)
  undActual: number
  copActual: number
  usdActual: number
  proyUnd: number   // proyección cierre mes (und)
  proyCop: number   // proyección cierre mes (COP)
  proyUsd: number   // proyección cierre mes (USD)
}

export async function GET(req: NextRequest) {
  try {
    const ano = parseInt(req.nextUrl.searchParams.get('ano') ?? '2026')
    const f   = parseExitoFilters(req)

    // Última fecha cargada para el año (con filtros aplicados)
    const wUlt = buildExitoWhere(f, { startAt: 2 })
    const ultR = await pool.query(
      `SELECT MAX(ano*10000 + mes*100 + dia) AS f
         FROM fact_ventas_exito
        WHERE pais='CO' AND ano=$1 AND ${wUlt.where}`,
      [ano, ...wUlt.params],
    )
    const fNum = parseInt(ultR.rows[0]?.f ?? '0')
    if (!fNum) {
      return NextResponse.json({
        ano,
        ultimo_mes: 0,
        ultimo_dia: 0,
        ultima_fecha: null,
        por_producto: [],
        por_cadena: [],
        por_subformato: [],
      })
    }
    const mesActual = Math.floor(fNum / 100) % 100
    const diaActual = fNum % 100
    const ultimaFecha = `${ano}-${String(mesActual).padStart(2, '0')}-${String(diaActual).padStart(2, '0')}`

    // Todas las sub-queries usan los mismos filtros
    const w = buildExitoWhere(f, { startAt: 2 })
    const [prodR, cadR, subR, geoR] = await Promise.all([
      pool.query(
        `SELECT sku, mes,
                SUM(ventas_unidades)::numeric AS und,
                SUM(ventas_valorusd)::numeric  AS usd,
                SUM(venta_valorcop)::numeric   AS cop
         FROM mv_exito_mensual
         WHERE pais='CO' AND ano=$1 AND sku IS NOT NULL AND sku <> ''
           AND ${w.where}
         GROUP BY sku, mes`,
        [ano, ...w.params],
      ),
      pool.query(
        `SELECT cadena AS grp, mes,
                SUM(ventas_unidades)::numeric AS und,
                SUM(ventas_valorusd)::numeric  AS usd,
                SUM(venta_valorcop)::numeric   AS cop
         FROM mv_exito_mensual
         WHERE pais='CO' AND ano=$1 AND cadena IS NOT NULL AND cadena <> ''
           AND ${w.where}
         GROUP BY cadena, mes`,
        [ano, ...w.params],
      ),
      pool.query(
        `SELECT subcadena AS grp, cadena, mes,
                SUM(ventas_unidades)::numeric AS und,
                SUM(ventas_valorusd)::numeric  AS usd,
                SUM(venta_valorcop)::numeric   AS cop
         FROM mv_exito_mensual
         WHERE pais='CO' AND ano=$1 AND subcadena IS NOT NULL AND subcadena <> ''
           AND ${w.where}
         GROUP BY subcadena, cadena, mes`,
        [ano, ...w.params],
      ),
      pool.query(
        `SELECT COALESCE(NULLIF(departamento, ''), 'SIN GEOGRAFÍA') AS grp, mes,
                COUNT(DISTINCT punto_venta) AS pdvs,
                SUM(ventas_unidades)::numeric AS und,
                SUM(ventas_valorusd)::numeric  AS usd,
                SUM(venta_valorcop)::numeric   AS cop
         FROM fact_ventas_exito
         WHERE pais='CO' AND ano=$1 AND ${w.where}
         GROUP BY COALESCE(NULLIF(departamento, ''), 'SIN GEOGRAFÍA'), mes`,
        [ano, ...w.params],
      ),
    ])

    // Agrupar producto por SKU
    const bySku: Record<string, Record<number, Bucket>> = {}
    for (const r of prodR.rows) {
      const sku = r.sku as string
      if (!bySku[sku]) bySku[sku] = {}
      bySku[sku][parseInt(r.mes)] = {
        und: Number(r.und ?? 0),
        usd: Number(r.usd ?? 0),
        cop: Number(r.cop ?? 0),
      }
    }

    const buildRow = (key: string, label: string, mesesData: Record<number, Bucket>, extra?: { plucd?: string; sku?: string }): RowOut => {
      const meses: Record<number, number> = {}
      const mesesUsd: Record<number, number> = {}
      const mesesUnd: Record<number, number> = {}
      let ytdCop = 0
      let ytdUsd = 0
      let ytdUnd = 0
      for (let m = 1; m <= mesActual; m++) {
        const b = mesesData[m]
        const cop = b?.cop ?? 0
        const usd = b?.usd ?? 0
        const und = b?.und ?? 0
        meses[m]    = cop
        mesesUsd[m] = usd
        mesesUnd[m] = und
        ytdCop += cop
        ytdUsd += usd
        ytdUnd += und
      }
      const cur = mesesData[mesActual]
      const undActual = cur?.und ?? 0
      const copActual = cur?.cop ?? 0
      const usdActual = cur?.usd ?? 0
      const rrUnd = diaActual > 0 ? undActual / diaActual : 0
      const rrCop = diaActual > 0 ? copActual / diaActual : 0
      const rrUsd = diaActual > 0 ? usdActual / diaActual : 0
      const diasMes = DIAS_MES[mesActual] ?? 30
      return {
        key,
        label,
        plucd: extra?.plucd,
        sku: extra?.sku,
        meses,
        mesesUsd,
        mesesUnd,
        ytdCop,
        ytdUsd,
        ytdUnd,
        rrUnd: Math.round(rrUnd * 10) / 10,
        rrCop: Math.round(rrCop),
        rrUsd: Math.round(rrUsd * 100) / 100,
        undActual,
        copActual,
        usdActual,
        proyUnd: Math.round(rrUnd * diasMes),
        proyCop: Math.round(rrCop * diasMes),
        proyUsd: Math.round(rrUsd * diasMes),
      }
    }

    // Por Producto: solo SKUs con mapeo PluCD conocido
    const porProducto: RowOut[] = []
    for (const sku of Object.keys(bySku)) {
      const plucd = SKU_TO_PLUCD[sku]
      if (!plucd) continue
      const label = SKU_TO_DESC[sku] ?? sku
      porProducto.push(buildRow(sku, label, bySku[sku], { plucd, sku }))
    }
    porProducto.sort((a, b) => b.ytdCop - a.ytdCop)

    // Por Cadena
    const byCadena: Record<string, Record<number, Bucket>> = {}
    for (const r of cadR.rows) {
      const grp = r.grp as string
      if (!byCadena[grp]) byCadena[grp] = {}
      const m = parseInt(r.mes)
      byCadena[grp][m] = {
        und: Number(r.und ?? 0),
        usd: Number(r.usd ?? 0),
        cop: Number(r.cop ?? 0),
      }
    }
    const porCadena: RowOut[] = Object.keys(byCadena)
      .map(c => buildRow(c, c, byCadena[c]))
      .sort((a, b) => b.ytdCop - a.ytdCop)

    // Por Subformato (con cadena para badge)
    const bySub: Record<string, { cadena: string; meses: Record<number, Bucket> }> = {}
    for (const r of subR.rows) {
      const grp = r.grp as string
      const cadena = (r.cadena as string) ?? ''
      if (!bySub[grp]) bySub[grp] = { cadena, meses: {} }
      const m = parseInt(r.mes)
      const prev = bySub[grp].meses[m] ?? { und: 0, usd: 0, cop: 0 }
      bySub[grp].meses[m] = {
        und: prev.und + Number(r.und ?? 0),
        usd: prev.usd + Number(r.usd ?? 0),
        cop: prev.cop + Number(r.cop ?? 0),
      }
    }
    const porSubformato: (RowOut & { cadena?: string })[] = Object.keys(bySub)
      .map(s => ({ ...buildRow(s, s, bySub[s].meses), cadena: bySub[s].cadena }))
      .sort((a, b) => b.ytdCop - a.ytdCop)

    // Por Geografía (departamento)
    const byGeo: Record<string, { pdvsMes: Record<number, number>; meses: Record<number, Bucket> }> = {}
    for (const r of geoR.rows) {
      const grp = r.grp as string
      if (!byGeo[grp]) byGeo[grp] = { pdvsMes: {}, meses: {} }
      const m = parseInt(r.mes)
      byGeo[grp].meses[m] = {
        und: Number(r.und ?? 0),
        usd: Number(r.usd ?? 0),
        cop: Number(r.cop ?? 0),
      }
      byGeo[grp].pdvsMes[m] = Math.max(byGeo[grp].pdvsMes[m] ?? 0, parseInt(r.pdvs ?? '0'))
    }
    const porGeografia: (RowOut & { pdvs?: number })[] = Object.keys(byGeo)
      .map(g => {
        const row = buildRow(g, g, byGeo[g].meses)
        const pdvs = Math.max(...Object.values(byGeo[g].pdvsMes), 0)
        return { ...row, pdvs }
      })
      .sort((a, b) => b.ytdCop - a.ytdCop)

    return NextResponse.json({
      ano,
      ultimo_mes: mesActual,
      ultimo_mes_label: MES_LBL(mesActual),
      ultimo_dia: diaActual,
      dias_mes: DIAS_MES[mesActual] ?? 30,
      ultima_fecha: ultimaFecha,
      por_producto: porProducto,
      por_cadena: porCadena,
      por_subformato: porSubformato,
      por_geografia: porGeografia,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
