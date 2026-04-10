import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

/**
 * GET /api/ventas/crecimientos
 *
 * Calcula crecimiento YTD por producto comparando el año seleccionado
 * vs el mismo período (mismos meses) del año anterior.
 *
 * Query params:
 *   ano      — año de referencia (default: max año en la tabla)
 *   paises   — filtro CSV de países
 *   categorias — filtro CSV de categorías
 *   clientes — filtro CSV de clientes
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const anoP        = searchParams.get('ano')
    const paisesP     = searchParams.get('paises')
    const categoriasP = searchParams.get('categorias')
    const clientesP   = searchParams.get('clientes')

    // ── Determinar año de referencia y fecha de corte ──────────
    let anoActual: number
    if (anoP) {
      anoActual = parseInt(anoP)
    } else {
      const r = await pool.query(
        'SELECT MAX(ano) AS max_ano FROM v_ventas WHERE ano > 2000'
      )
      anoActual = parseInt(r.rows[0]?.max_ano ?? new Date().getFullYear())
    }
    const anoAnterior = anoActual - 1

    // Fecha de corte: último mes con datos en el año actual
    const corteR = await pool.query(
      'SELECT MAX(mes) AS max_mes FROM v_ventas WHERE ano = $1',
      [anoActual]
    )
    const mesCorteCurrent = parseInt(corteR.rows[0]?.max_mes ?? '12')

    // ── Filtros opcionales ─────────────────────────────────────
    const conds: string[] = []
    const params: unknown[] = []
    let idx = 1

    const paisesArr = paisesP ? paisesP.split(',').map(s => s.trim()).filter(Boolean) : []
    if (paisesArr.length > 0) {
      conds.push(`pais IN (${paisesArr.map(() => `$${idx++}`).join(', ')})`)
      params.push(...paisesArr)
    }

    const catsArr = categoriasP ? categoriasP.split(',').map(s => s.trim()).filter(Boolean) : []
    if (catsArr.length > 0) {
      conds.push(`categoria IN (${catsArr.map(() => `$${idx++}`).join(', ')})`)
      params.push(...catsArr)
    }

    const clientesArr = clientesP ? clientesP.split(',').map(s => s.trim()).filter(Boolean) : []
    if (clientesArr.length > 0) {
      conds.push(`cliente IN (${clientesArr.map(() => `$${idx++}`).join(', ')})`)
      params.push(...clientesArr)
    }

    const extraWhere = conds.length > 0 ? ' AND ' + conds.join(' AND ') : ''

    // ── Parámetros para las queries ────────────────────────────
    const pActual   = idx; params.push(anoActual);   idx++
    const pAnterior = idx; params.push(anoAnterior); idx++
    const pCorte    = idx; params.push(mesCorteCurrent); idx++

    // ── Query principal: ventas por producto, ambos años ───────
    const sql = `
      WITH ventas_ytd AS (
        SELECT
          COALESCE(sku, '') AS sku,
          COALESCE(descripcion, '') AS descripcion,
          COALESCE(categoria, '') AS categoria,
          COALESCE(subcategoria, '') AS subcategoria,
          ano,
          ROUND(SUM(ventas_valor)::numeric, 2) AS ventas_valor,
          ROUND(SUM(ventas_unidades)::numeric, 0) AS ventas_unidades
        FROM v_ventas
        WHERE ano IN ($${pActual}, $${pAnterior})
          AND mes <= $${pCorte}
          AND sku IS NOT NULL AND sku != ''
          ${extraWhere}
        GROUP BY sku, descripcion, categoria, subcategoria, ano
      ),
      pivoted AS (
        SELECT
          sku,
          MAX(descripcion) AS descripcion,
          MAX(categoria) AS categoria,
          MAX(subcategoria) AS subcategoria,
          COALESCE(SUM(ventas_valor)    FILTER (WHERE ano = $${pActual}), 0)   AS valor_actual,
          COALESCE(SUM(ventas_unidades) FILTER (WHERE ano = $${pActual}), 0)   AS unidades_actual,
          COALESCE(SUM(ventas_valor)    FILTER (WHERE ano = $${pAnterior}), 0) AS valor_anterior,
          COALESCE(SUM(ventas_unidades) FILTER (WHERE ano = $${pAnterior}), 0) AS unidades_anterior
        FROM ventas_ytd
        GROUP BY sku
      )
      SELECT *,
        CASE WHEN valor_anterior > 0
          THEN ROUND(((valor_actual - valor_anterior) / valor_anterior * 100)::numeric, 1)
          ELSE NULL
        END AS crecimiento_pct,
        ROUND((valor_actual - valor_anterior)::numeric, 2) AS diferencia_valor,
        CASE WHEN unidades_anterior > 0
          THEN ROUND(((unidades_actual - unidades_anterior) / unidades_anterior * 100)::numeric, 1)
          ELSE NULL
        END AS crecimiento_unidades_pct
      FROM pivoted
      ORDER BY valor_actual DESC
    `

    // ── KPI totales ────────────────────────────────────────────
    const kpiSql = `
      SELECT
        ROUND(SUM(CASE WHEN ano = $${pActual}   AND mes <= $${pCorte} THEN ventas_valor ELSE 0 END)::numeric, 2) AS total_actual,
        ROUND(SUM(CASE WHEN ano = $${pAnterior} AND mes <= $${pCorte} THEN ventas_valor ELSE 0 END)::numeric, 2) AS total_anterior,
        ROUND(SUM(CASE WHEN ano = $${pActual}   AND mes <= $${pCorte} THEN ventas_unidades ELSE 0 END)::numeric, 0) AS unidades_actual,
        ROUND(SUM(CASE WHEN ano = $${pAnterior} AND mes <= $${pCorte} THEN ventas_unidades ELSE 0 END)::numeric, 0) AS unidades_anterior,
        COUNT(DISTINCT CASE WHEN ano = $${pActual} AND mes <= $${pCorte} THEN sku END) AS skus_actual
      FROM v_ventas
      WHERE ano IN ($${pActual}, $${pAnterior})
        AND mes <= $${pCorte}
        ${extraWhere}
    `

    // ── Crecimiento mensual (para gráfica) ─────────────────────
    const mensualSql = `
      SELECT
        mes,
        ROUND(SUM(CASE WHEN ano = $${pActual}   THEN ventas_valor ELSE 0 END)::numeric, 2) AS valor_actual,
        ROUND(SUM(CASE WHEN ano = $${pAnterior} THEN ventas_valor ELSE 0 END)::numeric, 2) AS valor_anterior
      FROM v_ventas
      WHERE ano IN ($${pActual}, $${pAnterior})
        AND mes <= $${pCorte}
        ${extraWhere}
      GROUP BY mes
      ORDER BY mes
    `

    const [productosR, kpiR, mensualR] = await Promise.all([
      pool.query(sql, params),
      pool.query(kpiSql, params),
      pool.query(mensualSql, params),
    ])

    const kpi = kpiR.rows[0]
    const totalActual   = parseFloat(kpi?.total_actual ?? '0')
    const totalAnterior = parseFloat(kpi?.total_anterior ?? '0')

    return NextResponse.json({
      ano_actual: anoActual,
      ano_anterior: anoAnterior,
      mes_corte: mesCorteCurrent,
      kpi: {
        total_actual:   totalActual,
        total_anterior: totalAnterior,
        unidades_actual:   parseFloat(kpi?.unidades_actual ?? '0'),
        unidades_anterior: parseFloat(kpi?.unidades_anterior ?? '0'),
        skus_actual: parseInt(kpi?.skus_actual ?? '0'),
        crecimiento_pct: totalAnterior > 0
          ? Math.round(((totalActual - totalAnterior) / totalAnterior) * 1000) / 10
          : null,
      },
      productos: productosR.rows,
      mensual: mensualR.rows,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
