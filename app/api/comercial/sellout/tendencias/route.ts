import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'

export const revalidate = 300

const MESES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

export async function GET(req: NextRequest) {
  try {
    const sp       = req.nextUrl.searchParams
    const paises   = sp.get('pais')      ? sp.get('pais')!.split(',').filter(Boolean)      : []
    const cats     = sp.get('categoria') ? sp.get('categoria')!.split(',').filter(Boolean) : []
    const formatos = sp.get('formato')   ? sp.get('formato')!.split(',').filter(Boolean)   : []
    const meses    = parseInt(sp.get('meses') || '13')

    const inC = (col: string, vals: string[]) =>
      `${col} IN (${vals.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`

    const extra: string[] = []
    if (paises.length)   extra.push(inC('pais', paises))
    if (cats.length)     extra.push(inC('categoria', cats))
    if (formatos.length) extra.push(inC('formato', formatos))
    const and = extra.length ? 'AND ' + extra.join(' AND ') : ''

    // Opciones disponibles de formato
    const fmtRes = await pool.query(`
      SELECT DISTINCT formato FROM fact_sales_sellout
      WHERE formato IS NOT NULL ORDER BY formato
    `)
    const available_formatos = fmtRes.rows.map(r => r.formato).filter(Boolean)

    // Últimos N meses con datos (sellout + Unisuper GT)
    const r = await pool.query(`
      WITH combined AS (
        SELECT ano, mes, ventas_unidades, ventas_valor, categoria, pais, formato
        FROM fact_sales_sellout
        WHERE dia > 0
        UNION ALL
        SELECT
          EXTRACT(YEAR  FROM fecha)::int               AS ano,
          EXTRACT(MONTH FROM fecha)::int               AS mes,
          unidades                                     AS ventas_unidades,
          ROUND((venta_neta / 7.7)::numeric, 2)        AS ventas_valor,
          categoria,
          'GT'                                         AS pais,
          NULL::text                                   AS formato
        FROM fact_ventas_unisuper
      )
      SELECT
        ano,
        mes,
        ROUND(SUM(ventas_unidades)::numeric, 0)                           AS ventas_unidades,
        ROUND(SUM(ventas_valor)::numeric, 2)                              AS ventas_valor,
        ROUND(
          CASE WHEN SUM(ventas_unidades) > 0
               THEN SUM(ventas_valor) / SUM(ventas_unidades)
               ELSE 0 END::numeric, 4
        )                                                                  AS precio_usd_unidad
      FROM combined
      WHERE 1=1 ${and}
      GROUP BY ano, mes
      ORDER BY ano ASC, mes ASC
    `)

    // Tomar los últimos N meses
    const all = r.rows.map(row => ({
      ano:              parseInt(row.ano),
      mes:              parseInt(row.mes),
      mes_label:        `${MESES[parseInt(row.mes)]} ${row.ano}`,
      ventas_unidades:  parseFloat(row.ventas_unidades),
      ventas_valor:     parseFloat(row.ventas_valor),
      precio_usd_unidad: parseFloat(row.precio_usd_unidad),
    }))

    const puntos = all.slice(-meses)

    // Calcular variaciones MoM %
    const variaciones = puntos.map((p, i) => {
      const prev = puntos[i - 1]
      const varUnidades = prev && prev.ventas_unidades > 0
        ? ((p.ventas_unidades - prev.ventas_unidades) / prev.ventas_unidades) * 100 : null
      const varPrecio = prev && prev.precio_usd_unidad > 0
        ? ((p.precio_usd_unidad - prev.precio_usd_unidad) / prev.precio_usd_unidad) * 100 : null
      return { ...p, var_unidades: varUnidades, var_precio: varPrecio }
    })

    return NextResponse.json({ puntos, variaciones, available_formatos })
  } catch (err) {
    return handleApiError(err)
  }
}
