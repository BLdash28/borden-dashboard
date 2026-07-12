import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'
import { parseExitoFilters, buildExitoWhere } from '@/lib/api/exito-filtros'

export const revalidate = 300

/**
 * Score Card Innovaciones · Extracontenido Parmesano
 *
 * Devuelve una lista de SKUs marcados como innovación en precios_exito y,
 * para cada uno, sus ventas registradas en fact_ventas_exito (si existen).
 * Si aún no hay ventas, se marca con `sin_ventas: true` — la sección UI
 * puede mostrar el catálogo y esperar a que arranquen.
 */
export async function GET(req: NextRequest) {
  try {
    const filt = parseExitoFilters(req)
    // WHERE parametrizado que se agrega a cada sub-query — $3+ (ya usamos $1,$2 para skus/barras)
    const w = buildExitoWhere(filt, { startAt: 3 })

    // 1. SKUs innovación desde precios_exito
    const catR = await pool.query(
      `SELECT ean13, plu, codigo_borden, sku, descripcion, gramos,
              precio_anterior_cop, precio_vigente_cop, fecha_vigencia_desde
       FROM precios_exito
       WHERE es_innovacion = true AND pais='CO' AND cliente='GRUPO ÉXITO'
       ORDER BY plu`,
    )

    const items = []
    for (const it of catR.rows) {
      // 2. Buscar ventas por sku o por codigo_barras variantes
      const eanCanon = String(it.ean13 ?? '').replace(/^0+/, '')
      const skus:       string[] = [it.sku, it.codigo_borden].filter(Boolean)
      const barras:     string[] = [it.ean13, eanCanon].filter(Boolean)

      const ventasR = await pool.query(
        `SELECT
           ano, mes,
           SUM(ventas_unidades)     AS uds,
           SUM(venta_valorcop)      AS cop,
           SUM(ventas_valorusd)     AS usd,
           COUNT(DISTINCT punto_venta) AS pdvs,
           COUNT(DISTINCT cadena)      AS cadenas
         FROM fact_ventas_exito
         WHERE pais='CO'
           AND (sku = ANY($1::text[]) OR codigo_barras = ANY($2::text[]))
           AND ${w.where}
         GROUP BY ano, mes ORDER BY ano, mes`,
        [skus, barras, ...w.params],
      )

      const monthly = ventasR.rows.map(r => ({
        ano: parseInt(r.ano), mes: parseInt(r.mes),
        uds: parseFloat(r.uds ?? '0'),
        cop: parseFloat(r.cop ?? '0'),
        usd: parseFloat(r.usd ?? '0'),
        pdvs: parseInt(r.pdvs ?? '0'),
        cadenas: parseInt(r.cadenas ?? '0'),
      }))

      // Evolución diaria
      const dailyR = await pool.query(
        `SELECT
           ano, mes, dia,
           SUM(ventas_unidades) AS uds,
           SUM(venta_valorcop)  AS cop,
           SUM(ventas_valorusd) AS usd,
           COUNT(DISTINCT punto_venta) AS pdvs
         FROM fact_ventas_exito
         WHERE pais='CO'
           AND (sku = ANY($1::text[]) OR codigo_barras = ANY($2::text[]))
           AND ${w.where}
         GROUP BY ano, mes, dia ORDER BY ano, mes, dia`,
        [skus, barras, ...w.params],
      )
      const daily = dailyR.rows.map(r => {
        const a = parseInt(r.ano), m = parseInt(r.mes), d = parseInt(r.dia)
        return {
          fecha: `${a}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`,
          uds: parseFloat(r.uds ?? '0'),
          cop: parseFloat(r.cop ?? '0'),
          usd: parseFloat(r.usd ?? '0'),
          pdvs: parseInt(r.pdvs ?? '0'),
        }
      })

      // Primera y última venta
      const primeraR = await pool.query(
        `SELECT MIN(ano*10000 + mes*100 + dia) AS f, MAX(ano*10000 + mes*100 + dia) AS ult
         FROM fact_ventas_exito
         WHERE pais='CO' AND (sku = ANY($1::text[]) OR codigo_barras = ANY($2::text[]))
           AND ventas_unidades > 0
           AND ${w.where}`,
        [skus, barras, ...w.params],
      )
      const pFn = parseInt(primeraR.rows[0]?.f ?? '0')
      const uFn = parseInt(primeraR.rows[0]?.ult ?? '0')
      const fmtFecha = (n: number) => n ? `${Math.floor(n/10000)}-${String(Math.floor(n/100)%100).padStart(2,'0')}-${String(n%100).padStart(2,'0')}` : null

      const totalUds  = monthly.reduce((s, m) => s + m.uds, 0)
      const totalCop  = monthly.reduce((s, m) => s + m.cop, 0)
      const totalUsd  = monthly.reduce((s, m) => s + m.usd, 0)
      const pdvsUniq  = Math.max(...monthly.map(m => m.pdvs), 0)
      const cadUniq   = Math.max(...monthly.map(m => m.cadenas), 0)

      items.push({
        ean13:                it.ean13,
        plu:                  it.plu,
        codigo_borden:        it.codigo_borden,
        sku:                  it.sku,
        descripcion:          it.descripcion,
        gramos:               it.gramos !== null ? parseFloat(it.gramos) : null,
        precio_anterior_cop:  it.precio_anterior_cop !== null ? parseFloat(it.precio_anterior_cop) : null,
        precio_vigente_cop:   it.precio_vigente_cop  !== null ? parseFloat(it.precio_vigente_cop)  : null,
        fecha_vigencia_desde: it.fecha_vigencia_desde,
        sin_ventas:           totalUds === 0,
        primera_venta:        fmtFecha(pFn),
        ultima_venta:         fmtFecha(uFn),
        total_uds:            Math.round(totalUds),
        total_cop:            Math.round(totalCop),
        total_usd:            Math.round(totalUsd * 100) / 100,
        pdvs_unicos:          pdvsUniq,
        cadenas_unicas:       cadUniq,
        monthly,
        daily,
      })
    }

    return NextResponse.json({ items, total: items.length })
  } catch (err) {
    return handleApiError(err)
  }
}
