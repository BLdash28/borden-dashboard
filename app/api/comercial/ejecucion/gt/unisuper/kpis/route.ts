import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

/**
 * KPIs Unisuper GT — mismo shape que /walmart/kpis para reutilizar
 * el mismo componente de tabs/gráficos. País hardcodeado a GT porque
 * Unisuper solo opera en Guatemala.
 *
 * Filtros aceptados (todos opcionales, CSV):
 *   - cadenas         (ej: "LA TORRE,ECONOSUPER")
 *   - subcategorias
 *   - punto_venta     (nombre_sucursal)
 *   - skus
 *
 * Devuelve:
 *   ytd_2026, uni_2026, ytd_2025, uni_2025 (mismo período), delta_ytd
 *   ultimo_mes / ultimo_mes_nombre / ultima_fecha
 *   por_cadena[]    (todas las cadenas, ignora filtro de cadena)
 *   por_categoria[] (para consistencia con Walmart; Unisuper solo tiene Quesos)
 *   monthly[]       (12 meses con y2025/y2026 + u2025/u2026)
 */
const MN = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const PAIS = 'GT'

function csv(sp: URLSearchParams, key: string): string[] {
  const v = sp.get(key)
  if (!v) return []
  return v.split(',').map(s => s.trim()).filter(Boolean)
}

function inList(col: string, vals: string[], params: unknown[]): string {
  if (!vals.length) return ''
  const placeholders = vals.map(() => `$${params.length + 1 + params.push(vals[params.length - vals.length]) - 1}`).join(',')
  // Simple version — push manually
  return ''
}

// Build simple WHERE conds + params. Returns { where, params }.
function buildWhere(sp: URLSearchParams, opts: { skipCadena?: boolean } = {}) {
  const params: unknown[] = []
  const conds: string[] = [`pais = 'GT'`]

  const cadenas = opts.skipCadena ? [] : csv(sp, 'cadenas')
  if (cadenas.length) {
    conds.push(`cadena IN (${cadenas.map(() => `$${params.length + 1 + params.push(cadenas[params.length]) - 1}`).join(',')})`)
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
  return { where: conds.join(' AND '), params }
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const w  = buildWhere(sp)
    const wSinCad = buildWhere(sp, { skipCadena: true })

    const [ytdR, cadenaR, subR, monthlyR] = await Promise.all([
      // YTD 2026 vs mismo período 2025 (recorte por fecha_max de 2026)
      pool.query(`
        WITH cur AS (
          SELECT SUM(ventas_valor)    AS valor,
                 SUM(ventas_unidades) AS unidades,
                 MAX(fecha)::date     AS ultima_fecha,
                 EXTRACT(MONTH FROM MAX(fecha))::int AS ultimo_mes
          FROM fact_ventas_unisuper
          WHERE ${w.where} AND EXTRACT(YEAR FROM fecha) = 2026
        ),
        prev AS (
          SELECT SUM(ventas_valor)    AS valor,
                 SUM(ventas_unidades) AS unidades
          FROM fact_ventas_unisuper
          WHERE ${w.where} AND EXTRACT(YEAR FROM fecha) = 2025
            AND fecha <= (SELECT (ultima_fecha - INTERVAL '1 year')::date FROM cur)
        )
        SELECT COALESCE(cur.valor, 0)     AS ytd_2026,
               COALESCE(cur.unidades, 0)  AS uni_2026,
               COALESCE(prev.valor, 0)    AS ytd_2025,
               COALESCE(prev.unidades, 0) AS uni_2025,
               cur.ultima_fecha,
               cur.ultimo_mes,
               CASE WHEN COALESCE(prev.valor, 0) > 0
                    THEN ROUND(((cur.valor - prev.valor) / prev.valor * 100)::numeric, 1)
                    ELSE NULL END AS delta_ytd
        FROM cur, prev
      `, w.params),

      // Por cadena — YTD comparable: 2026 hasta hoy, 2025 hasta mismo día del año
      // Ignora filtro cadenas para mostrar todas.
      pool.query(`
        WITH ult AS (
          SELECT MAX(fecha)::date AS ultima_fecha
          FROM fact_ventas_unisuper
          WHERE ${wSinCad.where} AND EXTRACT(YEAR FROM fecha) = 2026
        )
        SELECT f.cadena,
          SUM(CASE WHEN EXTRACT(YEAR FROM f.fecha) = 2026 THEN f.ventas_valor    ELSE 0 END) AS valor_2026,
          SUM(CASE WHEN EXTRACT(YEAR FROM f.fecha) = 2026 THEN f.ventas_unidades ELSE 0 END) AS uni_2026,
          SUM(CASE WHEN EXTRACT(YEAR FROM f.fecha) = 2025
                    AND f.fecha <= (SELECT (ultima_fecha - INTERVAL '1 year')::date FROM ult)
                   THEN f.ventas_valor ELSE 0 END) AS valor_2025
        FROM fact_ventas_unisuper f
        WHERE ${wSinCad.where} AND EXTRACT(YEAR FROM f.fecha) IN (2025, 2026)
        GROUP BY f.cadena ORDER BY valor_2026 DESC
      `, [...wSinCad.params, ...wSinCad.params]),

      // Por subcategoría (equivalente a "por categoria" en Walmart)
      pool.query(`
        SELECT subcategoria AS categoria,
          SUM(ventas_valor)    AS valor_2026,
          SUM(ventas_unidades) AS uni_2026
        FROM fact_ventas_unisuper
        WHERE ${w.where} AND EXTRACT(YEAR FROM fecha) = 2026
        GROUP BY subcategoria ORDER BY valor_2026 DESC
      `, w.params),

      // Monthly 2025 + 2026 — 2025 se corta al mismo día del año anterior
      // que la última fecha de 2026 (YTD consistente con "por_cadena" y ytd_2025).
      pool.query(`
        WITH ult AS (
          SELECT MAX(fecha)::date AS ultima_fecha
          FROM fact_ventas_unisuper
          WHERE ${w.where} AND EXTRACT(YEAR FROM fecha) = 2026
        )
        SELECT EXTRACT(YEAR FROM f.fecha)::int AS ano,
               EXTRACT(MONTH FROM f.fecha)::int AS mes,
               ROUND(SUM(f.ventas_valor)::numeric, 2)    AS valor,
               ROUND(SUM(f.ventas_unidades)::numeric, 0) AS unidades
        FROM fact_ventas_unisuper f
        WHERE ${w.where}
          AND EXTRACT(YEAR FROM f.fecha) IN (2025, 2026)
          AND (
            EXTRACT(YEAR FROM f.fecha) = 2026
            OR f.fecha <= (SELECT (ultima_fecha - INTERVAL '1 year')::date FROM ult)
          )
        GROUP BY 1, 2 ORDER BY 1, 2
      `, [...w.params, ...w.params]),
    ])

    const row = ytdR.rows[0] ?? {}
    const ultimoMes = parseInt(row.ultimo_mes ?? '0')

    const monthly: Record<string, { mes: number; mes_nombre: string; y2025: number; y2026: number | null; u2025: number; u2026: number | null }> = {}
    for (let m = 1; m <= 12; m++) {
      monthly[m] = { mes: m, mes_nombre: MN[m], y2025: 0, y2026: null, u2025: 0, u2026: null }
    }
    for (const r of monthlyR.rows) {
      const m = parseInt(r.mes)
      const a = parseInt(r.ano)
      if (a === 2025) { monthly[m].y2025 = parseFloat(r.valor); monthly[m].u2025 = parseFloat(r.unidades ?? '0') }
      if (a === 2026) { monthly[m].y2026 = parseFloat(r.valor); monthly[m].u2026 = parseFloat(r.unidades ?? '0') }
    }
    for (let m = ultimoMes + 1; m <= 12; m++) { monthly[m].y2026 = null; monthly[m].u2026 = null }

    return NextResponse.json({
      pais: PAIS,
      ytd_2026:    parseFloat(row.ytd_2026 ?? '0'),
      uni_2026:    parseInt(row.uni_2026 ?? '0'),
      ytd_2025:    parseFloat(row.ytd_2025 ?? '0'),
      uni_2025:    parseInt(row.uni_2025 ?? '0'),
      delta_ytd:   row.delta_ytd !== null && row.delta_ytd !== undefined ? parseFloat(row.delta_ytd) : null,
      ultimo_mes:  ultimoMes,
      ultimo_mes_nombre: MN[ultimoMes] ?? '',
      ultima_fecha: row.ultima_fecha ?? null,
      por_cadena:  cadenaR.rows.map(r => ({
        cadena:     r.cadena,
        valor_2026: parseFloat(r.valor_2026 ?? '0'),
        uni_2026:   parseInt(r.uni_2026 ?? '0'),
        valor_2025: parseFloat(r.valor_2025 ?? '0'),
        delta: parseFloat(r.valor_2025 ?? '0') > 0
          ? ((parseFloat(r.valor_2026 ?? '0') - parseFloat(r.valor_2025 ?? '0')) / parseFloat(r.valor_2025)) * 100
          : null,
      })),
      por_categoria: subR.rows.map(r => ({
        categoria:  r.categoria,
        valor_2026: parseFloat(r.valor_2026 ?? '0'),
        uni_2026:   parseInt(r.uni_2026 ?? '0'),
      })),
      monthly: Object.values(monthly),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
