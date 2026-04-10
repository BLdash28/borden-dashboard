import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { pool } from '@/lib/db/pool'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    // 1. Fetch offer from Supabase
    const supabase = createClient()
    const { data: oferta, error } = await supabase
      .from('dim_ofertas')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !oferta) {
      return NextResponse.json({ error: 'Oferta no encontrada' }, { status: 404 })
    }

    // Normalize EAN: strip leading zeros for Neon lookup
    const ean = (oferta.ean || '').replace(/^0+/, '')
    if (!ean) return NextResponse.json({ error: 'Oferta sin EAN' }, { status: 400 })

    const inicio = new Date(oferta.periodo_oferta_inicio)
    const fin    = new Date(oferta.periodo_oferta_fin)
    const anoOferta = inicio.getUTCFullYear()
    const mesOferta = inicio.getUTCMonth() + 1
    const diaInicio = inicio.getUTCDate()
    const diaFin    = fin.getUTCDate()

    // 2. Ventas DURANTE la oferta
    const duranteQ = await pool.query(`
      SELECT
        dia,
        ROUND(SUM(ventas_unidades)::numeric, 0) AS unidades,
        ROUND(SUM(ventas_valor)::numeric, 2)    AS valor,
        ROUND(AVG(ventas_valor / NULLIF(ventas_unidades,0))::numeric, 4) AS precio_prom
      FROM fact_sales_sellout
      WHERE codigo_barras = $1
        AND ano = $2 AND mes = $3
        AND dia BETWEEN $4 AND $5
      GROUP BY dia ORDER BY dia
    `, [ean, anoOferta, mesOferta, diaInicio, diaFin])

    // 3. Ventas FUERA del período de oferta (mismo mes)
    const fueraQ = await pool.query(`
      SELECT
        dia,
        ROUND(SUM(ventas_unidades)::numeric, 0) AS unidades,
        ROUND(SUM(ventas_valor)::numeric, 2)    AS valor,
        ROUND(AVG(ventas_valor / NULLIF(ventas_unidades,0))::numeric, 4) AS precio_prom
      FROM fact_sales_sellout
      WHERE codigo_barras = $1
        AND ano = $2 AND mes = $3
        AND (dia < $4 OR dia > $5)
      GROUP BY dia ORDER BY dia
    `, [ean, anoOferta, mesOferta, diaInicio, diaFin])

    // 4. Histórico mensual (últimos 6 meses antes de la oferta)
    const historicoQ = await pool.query(`
      SELECT
        ano, mes,
        COUNT(DISTINCT dia)                      AS dias_con_venta,
        ROUND(SUM(ventas_unidades)::numeric, 0)  AS unidades,
        ROUND(SUM(ventas_valor)::numeric, 2)     AS valor,
        ROUND(SUM(ventas_unidades)::numeric,0) / NULLIF(COUNT(DISTINCT dia), 0) AS uds_diario,
        ROUND(SUM(ventas_valor)::numeric,2)    / NULLIF(COUNT(DISTINCT dia), 0) AS valor_diario
      FROM fact_sales_sellout
      WHERE codigo_barras = $1
        AND (ano * 100 + mes) < $2
      GROUP BY ano, mes
      ORDER BY ano DESC, mes DESC
      LIMIT 6
    `, [ean, anoOferta * 100 + mesOferta])

    // 5. Calcular KPIs comparativos
    const durRows   = duranteQ.rows
    const fueraRows = fueraQ.rows
    const histRows  = historicoQ.rows

    const sumUds   = (rows: any[]) => rows.reduce((s, r) => s + Number(r.unidades), 0)
    const sumVal   = (rows: any[]) => rows.reduce((s, r) => s + Number(r.valor), 0)
    const diasCnt  = (rows: any[]) => rows.length

    const durUds    = sumUds(durRows)
    const durVal    = sumVal(durRows)
    const durDias   = diasCnt(durRows)
    const durUdsDia = durDias > 0 ? durUds / durDias : 0
    const durValDia = durDias > 0 ? durVal / durDias : 0

    const fueraUds    = sumUds(fueraRows)
    const fueraVal    = sumVal(fueraRows)
    const fueraDias   = diasCnt(fueraRows)
    const fueraUdsDia = fueraDias > 0 ? fueraUds / fueraDias : 0
    const fueraValDia = fueraDias > 0 ? fueraVal / fueraDias : 0

    // Promedio histórico diario (prom de los 6 meses)
    const histUdsDia = histRows.length > 0
      ? histRows.reduce((s, r) => s + Number(r.uds_diario), 0) / histRows.length
      : 0
    const histValDia = histRows.length > 0
      ? histRows.reduce((s, r) => s + Number(r.valor_diario), 0) / histRows.length
      : 0

    // Incrementales vs histórico
    const incUds = histUdsDia > 0 ? ((durUdsDia - histUdsDia) / histUdsDia) * 100 : null
    const incVal = histValDia > 0 ? ((durValDia - histValDia) / histValDia) * 100 : null

    // Vs baseline declarado
    const baselineDiario = Number(oferta.baseline_diario)
    const vsBaselineUds  = baselineDiario > 0 ? ((durUdsDia - baselineDiario) / baselineDiario) * 100 : null
    const diasOferta     = Number(oferta.dias_oferta)
    const udsEsperadas   = baselineDiario * diasOferta
    const udsReales      = durUds

    return NextResponse.json({
      oferta,
      ean_neon: ean,
      durante: {
        dias_con_datos: durDias,
        unidades: durUds,
        valor: Math.round(durVal * 100) / 100,
        uds_diario: Math.round(durUdsDia * 100) / 100,
        val_diario: Math.round(durValDia * 100) / 100,
        por_dia: durRows,
      },
      fuera: {
        dias_con_datos: fueraDias,
        unidades: fueraUds,
        valor: Math.round(fueraVal * 100) / 100,
        uds_diario: Math.round(fueraUdsDia * 100) / 100,
        val_diario: Math.round(fueraValDia * 100) / 100,
        por_dia: fueraRows,
      },
      historico: {
        meses: histRows,
        prom_uds_diario: Math.round(histUdsDia * 100) / 100,
        prom_val_diario: Math.round(histValDia * 100) / 100,
      },
      comparativa: {
        // vs meses anteriores
        inc_uds_pct:   incUds   !== null ? Math.round(incUds   * 10) / 10 : null,
        inc_val_pct:   incVal   !== null ? Math.round(incVal   * 10) / 10 : null,
        // vs baseline declarado
        vs_baseline_uds_pct: vsBaselineUds !== null ? Math.round(vsBaselineUds * 10) / 10 : null,
        uds_esperadas: Math.round(udsEsperadas * 10) / 10,
        uds_reales:    udsReales,
        uds_incrementales: Math.round((udsReales - udsEsperadas) * 10) / 10,
      },
    })
  } catch (err: any) {
    console.error('[ofertas/analisis]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
