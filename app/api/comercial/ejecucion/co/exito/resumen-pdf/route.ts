import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { handleApiError } from '@/lib/api/errors'
import { parseExitoFilters, buildExitoWhere } from '@/lib/api/exito-filtros'
import PDFDocument from 'pdfkit'
import { readFileSync } from 'fs'
import path from 'path'

export const revalidate = 0

// Paleta
const AMBER    = '#c8873a'
const AMBER_L  = '#fef3c7'
const AMBER_D  = '#92400e'
const EMERALD  = '#059669'
const RED      = '#dc2626'
const GRAY_1   = '#1f2937'
const GRAY_2   = '#6b7280'
const GRAY_3   = '#9ca3af'
const GRAY_BG  = '#f3f4f6'
const WHITE    = '#ffffff'

const MN = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const fmtCOP = (v: number) => {
  if (!isFinite(v)) return '$0'
  if (Math.abs(v) >= 1e9) return '$' + (v / 1e9).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MM'
  if (Math.abs(v) >= 1e6) return '$' + (v / 1e6).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'M'
  if (Math.abs(v) >= 1e3) return '$' + (v / 1e3).toLocaleString('es-CO', { maximumFractionDigits: 0 }) + 'K'
  return '$' + Math.round(v).toLocaleString('es-CO')
}
const fmtUSD = (v: number) => '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })
const fmtNum = (v: number) => Math.round(v).toLocaleString('es-CO')

export async function GET(req: NextRequest) {
  try {
    const filt   = parseExitoFilters(req)
    const moneda = (req.nextUrl.searchParams.get('moneda') ?? 'cop').toLowerCase()

    const w  = buildExitoWhere(filt, { startAt: 1 })
    // Para el listado "por cadena" mostramos todas independientemente del filtro
    const wCad = buildExitoWhere({ ...filt, cadenas: [] }, { startAt: 1 })

    // Query datos
    const [kpiR, cadenaR, catR, monthlyR, invR] = await Promise.all([
      pool.query(`
        WITH cur AS (
          SELECT SUM(ventas_valorusd) AS usd,
                 SUM(venta_valorcop)  AS cop,
                 SUM(ventas_unidades) AS uds,
                 MAX(mes) AS ultimo_mes,
                 MAX(ano*10000 + mes*100 + dia) AS ult_n
          FROM fact_ventas_exito
          WHERE pais='CO' AND ano=2026 AND ${w.where}
        ),
        prev AS (
          SELECT SUM(ventas_valorusd) AS usd,
                 SUM(venta_valorcop)  AS cop,
                 SUM(ventas_unidades) AS uds
          FROM fact_ventas_exito
          WHERE pais='CO' AND ano=2025
            AND mes <= (SELECT COALESCE(ultimo_mes,12) FROM cur) AND ${w.where}
        )
        SELECT
          COALESCE(cur.usd,0) AS usd_26, COALESCE(cur.cop,0) AS cop_26, COALESCE(cur.uds,0) AS uds_26,
          COALESCE(prev.usd,0) AS usd_25, COALESCE(prev.cop,0) AS cop_25, COALESCE(prev.uds,0) AS uds_25,
          cur.ultimo_mes, cur.ult_n
        FROM cur, prev
      `, w.params),
      pool.query(`
        SELECT cadena,
          SUM(CASE WHEN ano=2026 THEN venta_valorcop  ELSE 0 END) AS cop_26,
          SUM(CASE WHEN ano=2026 THEN ventas_valorusd ELSE 0 END) AS usd_26,
          SUM(CASE WHEN ano=2026 THEN ventas_unidades ELSE 0 END) AS uds_26,
          SUM(CASE WHEN ano=2025 THEN venta_valorcop  ELSE 0 END) AS cop_25
        FROM fact_ventas_exito
        WHERE pais='CO' AND ano IN (2025, 2026) AND cadena IS NOT NULL AND cadena <> ''
          AND ${wCad.where}
        GROUP BY cadena ORDER BY cop_26 DESC
      `, wCad.params),
      pool.query(`
        SELECT categoria,
          SUM(venta_valorcop)  AS cop_26,
          SUM(ventas_valorusd) AS usd_26,
          SUM(ventas_unidades) AS uds_26
        FROM fact_ventas_exito
        WHERE pais='CO' AND ano=2026 AND categoria IS NOT NULL AND categoria <> ''
          AND ${w.where}
        GROUP BY categoria ORDER BY cop_26 DESC
      `, w.params),
      pool.query(`
        SELECT ano, mes,
          SUM(venta_valorcop)  AS cop,
          SUM(ventas_valorusd) AS usd,
          SUM(ventas_unidades) AS uds
        FROM fact_ventas_exito
        WHERE pais='CO' AND ano IN (2025, 2026) AND ${w.where}
        GROUP BY ano, mes ORDER BY ano, mes
      `, w.params),
      pool.query(`
        SELECT COUNT(DISTINCT punto_venta) AS pdvs,
               SUM(inv_unidades)  AS uds,
               SUM(inv_valor_cop) AS cop,
               MAX(fecha_snapshot) AS fecha
        FROM inventario_exito WHERE pais='CO'
      `),
    ])

    const k = kpiR.rows[0] ?? {}
    const ultimo_mes = parseInt(k.ultimo_mes ?? '0')
    const ult_n = parseInt(k.ult_n ?? '0')
    const ultima_fecha = ult_n
      ? `${Math.floor(ult_n/10000)}-${String(Math.floor(ult_n/100)%100).padStart(2,'0')}-${String(ult_n%100).padStart(2,'0')}`
      : '—'
    const usd_26 = parseFloat(k.usd_26 ?? '0'), cop_26 = parseFloat(k.cop_26 ?? '0'), uds_26 = parseFloat(k.uds_26 ?? '0')
    const usd_25 = parseFloat(k.usd_25 ?? '0'), cop_25 = parseFloat(k.cop_25 ?? '0'), uds_25 = parseFloat(k.uds_25 ?? '0')
    const delta_val = cop_25 > 0 ? ((cop_26 - cop_25) / cop_25) * 100 : null
    const delta_uds = uds_25 > 0 ? ((uds_26 - uds_25) / uds_25) * 100 : null

    // Monthly agrupado
    const monthly: Record<number, { mes: number; cop_25: number; cop_26: number; uds_26: number }> = {}
    for (let m = 1; m <= 12; m++) monthly[m] = { mes: m, cop_25: 0, cop_26: 0, uds_26: 0 }
    for (const r of monthlyR.rows) {
      const m = parseInt(r.mes), a = parseInt(r.ano)
      if (a === 2025) monthly[m].cop_25 = parseFloat(r.cop ?? '0')
      if (a === 2026) { monthly[m].cop_26 = parseFloat(r.cop ?? '0'); monthly[m].uds_26 = parseFloat(r.uds ?? '0') }
    }

    // ── Generar PDF ─────────────────────────────────────────────────────
    const doc = new PDFDocument({ size: 'A4', margin: 40, layout: 'landscape', bufferPages: true })
    const chunks: Buffer[] = []
    doc.on('data', c => chunks.push(c))
    const done: Promise<Buffer> = new Promise(resolve => doc.on('end', () => resolve(Buffer.concat(chunks))))

    const PAGE_W = doc.page.width
    const PAGE_H = doc.page.height
    const M = 40

    // ── Header ──
    let logoY = M
    try {
      const logoBuf = readFileSync(path.join(process.cwd(), 'public', 'borden-logo.png'))
      doc.image(logoBuf, M, logoY, { height: 42 })
    } catch {}

    doc.font('Helvetica-Bold').fontSize(20).fillColor(GRAY_1)
       .text('Resumen Ejecutivo · Grupo Éxito Colombia', M + 130, M + 4)
    doc.font('Helvetica').fontSize(10).fillColor(GRAY_2)
       .text(`Sell-Out · FY 2026${filt.cadenas.length ? ` · ${filt.cadenas.length === 1 ? filt.cadenas[0] : `${filt.cadenas.length} cadenas`}` : ''} · Moneda: ${moneda.toUpperCase()}`, M + 130, M + 30)
    doc.font('Helvetica').fontSize(9).fillColor(GRAY_3)
       .text(`Última carga: ${ultima_fecha} · Generado: ${new Date().toISOString().slice(0,10)}`,
             PAGE_W - M - 220, M + 8, { width: 220, align: 'right' })

    // Línea divisoria
    doc.moveTo(M, M + 54).lineTo(PAGE_W - M, M + 54).lineWidth(1).strokeColor(GRAY_BG).stroke()

    // ── KPIs (4 cards horizontales) ──
    const cardY = M + 68
    const cardW = (PAGE_W - M * 2 - 30) / 4
    const cardH = 74

    const kpis = [
      {
        label: 'FY 2026 · Sell-Out',
        value: moneda === 'usd' ? fmtUSD(usd_26) : fmtCOP(cop_26),
        sub: `${fmtNum(uds_26)} unidades`,
        color: AMBER,
        bg: AMBER_L,
      },
      {
        label: 'vs 2025 (mismo período)',
        value: delta_val !== null ? `${delta_val > 0 ? '+' : ''}${delta_val.toFixed(1)}%` : '—',
        sub: cop_25 > 0 ? `2025: ${moneda === 'usd' ? fmtUSD(usd_25) : fmtCOP(cop_25)}` : 'Sin dato 2025',
        color: (delta_val ?? 0) >= 0 ? EMERALD : RED,
        bg: (delta_val ?? 0) >= 0 ? '#d1fae5' : '#fecaca',
      },
      {
        label: 'Unidades vs 2025',
        value: delta_uds !== null ? `${delta_uds > 0 ? '+' : ''}${delta_uds.toFixed(1)}%` : '—',
        sub: `${fmtNum(uds_26)} und 2026`,
        color: (delta_uds ?? 0) >= 0 ? EMERALD : RED,
        bg: (delta_uds ?? 0) >= 0 ? '#d1fae5' : '#fecaca',
      },
      {
        label: 'Inventario actual',
        value: fmtCOP(parseFloat(invR.rows[0]?.cop ?? '0')),
        sub: `${fmtNum(parseFloat(invR.rows[0]?.uds ?? '0'))} und · ${invR.rows[0]?.pdvs ?? 0} PDVs`,
        color: GRAY_1,
        bg: GRAY_BG,
      },
    ]

    kpis.forEach((kpi, i) => {
      const x = M + i * (cardW + 10)
      doc.roundedRect(x, cardY, cardW, cardH, 6).fillColor(kpi.bg).fill()
      doc.font('Helvetica-Bold').fontSize(7).fillColor(GRAY_2)
         .text(kpi.label.toUpperCase(), x + 12, cardY + 10, { width: cardW - 20, characterSpacing: 0.5 })
      doc.font('Helvetica-Bold').fontSize(18).fillColor(kpi.color)
         .text(kpi.value, x + 12, cardY + 26, { width: cardW - 20 })
      doc.font('Helvetica').fontSize(9).fillColor(GRAY_2)
         .text(kpi.sub, x + 12, cardY + 52, { width: cardW - 20 })
    })

    // ── Por Cadena (tabla) ──
    let yBlock = cardY + cardH + 22
    doc.font('Helvetica-Bold').fontSize(11).fillColor(GRAY_1).text('Por Cadena', M, yBlock)
    yBlock += 18

    const colX = [M, M + 130, M + 250, M + 340, M + 430, M + 520]
    doc.font('Helvetica-Bold').fontSize(8).fillColor(GRAY_2)
    doc.text('CADENA',    colX[0], yBlock)
    doc.text('COP 2026',  colX[1], yBlock, { width: 110, align: 'right' })
    doc.text('USD 2026',  colX[2], yBlock, { width: 80, align: 'right' })
    doc.text('UNIDADES',  colX[3], yBlock, { width: 80, align: 'right' })
    doc.text('vs 2025',   colX[4], yBlock, { width: 80, align: 'right' })
    doc.text('% TOTAL',   colX[5], yBlock, { width: 70, align: 'right' })
    yBlock += 14
    doc.moveTo(M, yBlock - 3).lineTo(PAGE_W - M, yBlock - 3).lineWidth(0.5).strokeColor(GRAY_BG).stroke()

    const totCad = cadenaR.rows.reduce((s, r) => s + parseFloat(r.cop_26 ?? '0'), 0)
    doc.font('Helvetica').fontSize(9).fillColor(GRAY_1)
    for (const r of cadenaR.rows.slice(0, 8)) {
      const c26 = parseFloat(r.cop_26 ?? '0')
      const u26 = parseFloat(r.usd_26 ?? '0')
      const uds = parseFloat(r.uds_26 ?? '0')
      const c25 = parseFloat(r.cop_25 ?? '0')
      const d = c25 > 0 ? ((c26 - c25) / c25) * 100 : null
      const pct = totCad > 0 ? (c26 / totCad) * 100 : 0

      doc.fillColor(GRAY_1).text(r.cadena, colX[0], yBlock, { width: 125 })
      doc.text(fmtCOP(c26), colX[1], yBlock, { width: 110, align: 'right' })
      doc.text(fmtUSD(u26), colX[2], yBlock, { width: 80, align: 'right' })
      doc.text(fmtNum(uds), colX[3], yBlock, { width: 80, align: 'right' })
      doc.fillColor(d === null ? GRAY_3 : d >= 0 ? EMERALD : RED)
      doc.text(d === null ? '—' : `${d > 0 ? '+' : ''}${d.toFixed(1)}%`, colX[4], yBlock, { width: 80, align: 'right' })
      doc.fillColor(GRAY_2).text(pct.toFixed(1) + '%', colX[5], yBlock, { width: 70, align: 'right' })
      yBlock += 15
    }

    // ── Evolución mensual (barras simples) ──
    yBlock += 20
    doc.font('Helvetica-Bold').fontSize(11).fillColor(GRAY_1).text('Evolución mensual · 2026 vs 2025 (COP)', M, yBlock)
    yBlock += 18

    const chartH = 100
    const chartW = PAGE_W - M * 2
    const barsPerMonth = 2
    const gap = 3
    const groupW = (chartW - 24) / 12
    const barW = (groupW - gap - 4) / barsPerMonth
    const maxV = Math.max(...Object.values(monthly).map(m => Math.max(m.cop_25, m.cop_26)), 1)

    // Ejes/grid
    const baseY = yBlock + chartH
    doc.strokeColor(GRAY_BG).lineWidth(0.5)
    for (let g = 0; g <= 4; g++) {
      const y = yBlock + chartH * (1 - g / 4)
      doc.moveTo(M + 24, y).lineTo(M + chartW, y).stroke()
      doc.font('Helvetica').fontSize(7).fillColor(GRAY_3)
         .text(fmtCOP(maxV * g / 4), M, y - 4, { width: 22, align: 'right' })
    }

    for (let m = 1; m <= 12; m++) {
      const d = monthly[m]
      const x0 = M + 26 + (m - 1) * groupW
      const h25 = (d.cop_25 / maxV) * chartH
      const h26 = (d.cop_26 / maxV) * chartH
      doc.rect(x0, baseY - h25, barW, h25).fillColor('#cbd5e1').fill()
      doc.rect(x0 + barW + gap, baseY - h26, barW, h26).fillColor(AMBER).fill()
      doc.font('Helvetica').fontSize(7).fillColor(GRAY_3)
         .text(MN[m], x0, baseY + 3, { width: groupW - gap, align: 'left' })
    }

    // Leyenda
    const legY = baseY + 18
    doc.rect(M + 24, legY, 10, 8).fillColor('#cbd5e1').fill()
    doc.font('Helvetica').fontSize(9).fillColor(GRAY_2).text('2025', M + 38, legY - 1)
    doc.rect(M + 80, legY, 10, 8).fillColor(AMBER).fill()
    doc.font('Helvetica').fontSize(9).fillColor(GRAY_2).text('2026', M + 94, legY - 1)

    // ── Página 2: Por Categoría + Info ──
    doc.addPage({ layout: 'landscape', margin: M })

    doc.font('Helvetica-Bold').fontSize(14).fillColor(GRAY_1).text('Por Categoría · FY 2026', M, M)
    doc.moveTo(M, M + 22).lineTo(PAGE_W - M, M + 22).lineWidth(1).strokeColor(GRAY_BG).stroke()

    let yCat = M + 40
    const totCat = catR.rows.reduce((s, r) => s + parseFloat(r.cop_26 ?? '0'), 0)

    doc.font('Helvetica-Bold').fontSize(8).fillColor(GRAY_2)
    doc.text('CATEGORÍA', M,       yCat)
    doc.text('COP 2026',  M + 180, yCat, { width: 110, align: 'right' })
    doc.text('USD 2026',  M + 300, yCat, { width: 100, align: 'right' })
    doc.text('UNIDADES',  M + 410, yCat, { width: 100, align: 'right' })
    doc.text('% TOTAL',   M + 520, yCat, { width: 100, align: 'right' })
    yCat += 14
    doc.moveTo(M, yCat - 3).lineTo(PAGE_W - M, yCat - 3).lineWidth(0.5).strokeColor(GRAY_BG).stroke()

    doc.font('Helvetica').fontSize(10).fillColor(GRAY_1)
    for (const r of catR.rows) {
      const c26 = parseFloat(r.cop_26 ?? '0')
      const u26 = parseFloat(r.usd_26 ?? '0')
      const uds = parseFloat(r.uds_26 ?? '0')
      const pct = totCat > 0 ? (c26 / totCat) * 100 : 0
      doc.fillColor(GRAY_1).text(r.categoria, M,       yCat, { width: 175 })
      doc.text(fmtCOP(c26),        M + 180, yCat, { width: 110, align: 'right' })
      doc.text(fmtUSD(u26),        M + 300, yCat, { width: 100, align: 'right' })
      doc.text(fmtNum(uds),        M + 410, yCat, { width: 100, align: 'right' })
      doc.fillColor(GRAY_2).text(pct.toFixed(1) + '%', M + 520, yCat, { width: 100, align: 'right' })
      yCat += 18
    }

    // Footer todas las páginas
    const total = doc.bufferedPageRange().count
    for (let i = 0; i < total; i++) {
      doc.switchToPage(i)
      doc.font('Helvetica').fontSize(8).fillColor(GRAY_3)
         .text(`BL Foods · Dashboard Comercial · Confidencial`, M, PAGE_H - 25)
      doc.text(`Página ${i + 1} de ${total}`, PAGE_W - M - 100, PAGE_H - 25, { width: 100, align: 'right' })
    }

    doc.end()
    const buf = await done
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="Resumen_Exito_CO_${new Date().toISOString().slice(0,10)}.pdf"`,
        'Cache-Control':       'no-store',
      },
    })
  } catch (err) {
    console.error('[resumen-pdf] error:', err)
    return handleApiError(err)
  }
}
