import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'
import { parseExitoFilters, buildExitoWhere } from '@/lib/api/exito-filtros'

export const revalidate = 300

const MN = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

export async function GET(req: NextRequest) {
  try {
    const f = parseExitoFilters(req)

    // WHERE base con filtros parametrizados
    const wa = buildExitoWhere(f, { startAt: 1 })
    const wb = buildExitoWhere(f, { startAt: 1 })     // clon para la 2ª query
    const wc = buildExitoWhere(f, { startAt: 1, includeCategoria: false })  // cadena_R: no filtrar por cadena (queremos ver todas)
    // Nota: para la vista "por cadena" queremos ver todas las cadenas aunque haya filtro,
    // así el usuario puede comparar. Por eso construimos una versión sin cadena.
    const fSinCadena = { ...f, cadenas: [] as string[] }
    const wcad = buildExitoWhere(fSinCadena, { startAt: 1 })

    const [ytdR, cadenaR, catR, monthlyR, devolR] = await Promise.all([
      // YTD 2026 vs 2025 — mv_exito_mensual (12K filas terminales)
      pool.query(`
        WITH cur AS (
          SELECT SUM(ventas_valorusd) AS valor,
                 SUM(venta_valorcop)  AS valor_cop,
                 SUM(ventas_unidades) AS unidades,
                 MAX(mes) AS ultimo_mes
          FROM mv_exito_mensual
          WHERE pais='CO' AND ano=2026 AND ${wa.where}
        ),
        ultf AS (
          SELECT MAX(ano*10000 + mes*100 + dia) AS ultima_fecha_n
          FROM fact_ventas_exito WHERE pais='CO' AND ano=2026
        ),
        prev AS (
          SELECT SUM(ventas_valorusd) AS valor,
                 SUM(venta_valorcop)  AS valor_cop,
                 SUM(ventas_unidades) AS unidades
          FROM mv_exito_mensual
          WHERE pais='CO' AND ano=2025
            AND mes <= (SELECT COALESCE(ultimo_mes, 12) FROM cur)
            AND ${wa.where}
        )
        SELECT
          COALESCE(cur.valor, 0)      AS ytd_2026,
          COALESCE(cur.valor_cop, 0)  AS ytd_2026_cop,
          COALESCE(cur.unidades, 0)   AS uni_2026,
          COALESCE(prev.valor, 0)     AS ytd_2025,
          COALESCE(prev.valor_cop, 0) AS ytd_2025_cop,
          COALESCE(prev.unidades, 0)  AS uni_2025,
          ultf.ultima_fecha_n,
          cur.ultimo_mes,
          CASE WHEN COALESCE(prev.valor, 0) > 0
               THEN ROUND(((cur.valor - prev.valor) / prev.valor * 100)::numeric, 1)
               ELSE NULL END AS delta_ytd
        FROM cur, prev, ultf
      `, wa.params),

      // por cadena — ignoramos el filtro de cadena para mostrar todas
      pool.query(`
        SELECT cadena,
          SUM(CASE WHEN ano = 2026 THEN ventas_valorusd ELSE 0 END) AS valor_2026,
          SUM(CASE WHEN ano = 2026 THEN venta_valorcop  ELSE 0 END) AS valor_2026_cop,
          SUM(CASE WHEN ano = 2026 THEN ventas_unidades ELSE 0 END) AS uni_2026,
          SUM(CASE WHEN ano = 2025 THEN ventas_valorusd ELSE 0 END) AS valor_2025,
          SUM(CASE WHEN ano = 2025 THEN venta_valorcop  ELSE 0 END) AS valor_2025_cop
        FROM mv_exito_mensual
        WHERE pais='CO' AND ano IN (2025, 2026)
          AND cadena IS NOT NULL AND cadena <> ''
          AND ${wcad.where}
        GROUP BY cadena
        ORDER BY valor_2026 DESC
      `, wcad.params),

      // por categoría (siempre útil aunque haya filtro)
      pool.query(`
        SELECT categoria,
          SUM(ventas_valorusd) AS valor_2026,
          SUM(venta_valorcop)  AS valor_2026_cop,
          SUM(ventas_unidades) AS uni_2026
        FROM mv_exito_mensual
        WHERE pais='CO' AND ano=2026
          AND categoria IS NOT NULL AND categoria <> ''
          AND ${wb.where}
        GROUP BY categoria
        ORDER BY valor_2026 DESC
      `, wb.params),

      // monthly (con filtros aplicados)
      pool.query(`
        SELECT ano, mes,
          ROUND(SUM(ventas_valorusd)::numeric, 2) AS valor,
          ROUND(SUM(venta_valorcop)::numeric, 0)  AS valor_cop,
          ROUND(SUM(ventas_unidades)::numeric, 0) AS unidades
        FROM mv_exito_mensual
        WHERE pais='CO' AND ano IN (2025, 2026) AND ${wa.where}
        GROUP BY ano, mes
        ORDER BY ano, mes
      `, wa.params),

      // Devoluciones mensuales — join con precios_exito para estimar valor COP
      // (aplicamos solo filtro de cadena porque devoluciones_exito tiene subset de columnas)
      (() => {
        const df = {
          ...f,
          departamentos: [] as string[], ciudades: [] as string[], skus: [] as string[],
        }
        const wd = buildExitoWhere(df, { alias: 'd', startAt: 1 })
        return pool.query(`
          SELECT d.ano, d.mes,
            ROUND(SUM(d.unidades)::numeric, 0) AS uds,
            ROUND(SUM(d.unidades * COALESCE(p.precio_vigente_cop, 0))::numeric, 0) AS valor_cop
          FROM devoluciones_exito d
          LEFT JOIN precios_exito p
            ON (p.ean13 = d.codigo_barras OR p.sku = d.sku)
           AND p.pais='CO' AND p.cliente='GRUPO ÉXITO'
          WHERE d.pais='CO' AND d.ano IN (2025, 2026) AND ${wd.where}
          GROUP BY d.ano, d.mes ORDER BY d.ano, d.mes
        `, wd.params)
      })(),
    ])

    const row = ytdR.rows[0] ?? {}
    const ultimoMes = parseInt(row.ultimo_mes ?? '0')
    const ufN = parseInt(row.ultima_fecha_n ?? '0')
    const ultimaFecha = ufN
      ? `${Math.floor(ufN/10000)}-${String(Math.floor(ufN/100)%100).padStart(2,'0')}-${String(ufN%100).padStart(2,'0')}`
      : null

    type MonthlyRow = {
      mes: number; mes_nombre: string
      y2025: number; y2026: number | null
      cop2025: number; cop2026: number | null
      uds2025: number; uds2026: number | null
      devol_uds_2025: number;  devol_uds_2026: number | null
      devol_cop_2025: number;  devol_cop_2026: number | null
    }
    const monthly: Record<number, MonthlyRow> = {}
    for (let m = 1; m <= 12; m++) {
      monthly[m] = { mes: m, mes_nombre: MN[m],
        y2025: 0, y2026: null,
        cop2025: 0, cop2026: null,
        uds2025: 0, uds2026: null,
        devol_uds_2025: 0, devol_uds_2026: null,
        devol_cop_2025: 0, devol_cop_2026: null }
    }
    for (const r of monthlyR.rows) {
      const m = parseInt(r.mes)
      const a = parseInt(r.ano)
      if (a === 2025) {
        monthly[m].y2025   = parseFloat(r.valor)
        monthly[m].cop2025 = parseFloat(r.valor_cop ?? '0')
        monthly[m].uds2025 = parseFloat(r.unidades ?? '0')
      }
      if (a === 2026) {
        monthly[m].y2026   = parseFloat(r.valor)
        monthly[m].cop2026 = parseFloat(r.valor_cop ?? '0')
        monthly[m].uds2026 = parseFloat(r.unidades ?? '0')
      }
    }
    for (const r of devolR.rows) {
      const m = parseInt(r.mes)
      const a = parseInt(r.ano)
      if (a === 2025) {
        monthly[m].devol_uds_2025 = parseFloat(r.uds ?? '0')
        monthly[m].devol_cop_2025 = parseFloat(r.valor_cop ?? '0')
      }
      if (a === 2026) {
        monthly[m].devol_uds_2026 = parseFloat(r.uds ?? '0')
        monthly[m].devol_cop_2026 = parseFloat(r.valor_cop ?? '0')
      }
    }
    for (let m = ultimoMes + 1; m <= 12; m++) {
      monthly[m].y2026 = null
      monthly[m].cop2026 = null
      monthly[m].uds2026 = null
      monthly[m].devol_uds_2026 = null
      monthly[m].devol_cop_2026 = null
    }

    return NextResponse.json({
      ytd_2026:      parseFloat(row.ytd_2026 ?? '0'),
      ytd_2026_cop:  parseFloat(row.ytd_2026_cop ?? '0'),
      uni_2026:      parseInt(row.uni_2026 ?? '0'),
      ytd_2025:      parseFloat(row.ytd_2025 ?? '0'),
      ytd_2025_cop:  parseFloat(row.ytd_2025_cop ?? '0'),
      uni_2025:      parseInt(row.uni_2025 ?? '0'),
      delta_ytd:     row.delta_ytd !== null && row.delta_ytd !== undefined ? parseFloat(row.delta_ytd) : null,
      ultimo_mes: ultimoMes,
      ultimo_mes_nombre: MN[ultimoMes] ?? '',
      ultima_fecha: ultimaFecha,
      por_cadena: cadenaR.rows.map(r => ({
        cadena:         r.cadena,
        valor_2026:     parseFloat(r.valor_2026 ?? '0'),
        valor_2026_cop: parseFloat(r.valor_2026_cop ?? '0'),
        uni_2026:       parseInt(r.uni_2026 ?? '0'),
        valor_2025:     parseFloat(r.valor_2025 ?? '0'),
        valor_2025_cop: parseFloat(r.valor_2025_cop ?? '0'),
        delta: parseFloat(r.valor_2025 ?? '0') > 0
          ? ((parseFloat(r.valor_2026 ?? '0') - parseFloat(r.valor_2025 ?? '0')) / parseFloat(r.valor_2025)) * 100
          : null,
      })),
      por_categoria: catR.rows.map(r => ({
        categoria:      r.categoria,
        valor_2026:     parseFloat(r.valor_2026 ?? '0'),
        valor_2026_cop: parseFloat(r.valor_2026_cop ?? '0'),
        uni_2026:       parseInt(r.uni_2026 ?? '0'),
      })),
      monthly: Object.values(monthly),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
