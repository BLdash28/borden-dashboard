/**
 * Cruce SOS Walmart CR × Ventas × Inventario → responder:
 *   1. Una góndola full = cuántos DOH por PDV
 *   2. Cuántos días desabastecidos
 *   3. Cuánto más espacio necesitan para picos (Vie/Sáb/Dom + quincena)
 *
 * Asunciones (leche 1L Tetra):
 *   - Individual: 6 unidades por frente (5 profundidad + 1 frontal)
 *   - 3-pack:     2 packs por frente = 6 unidades (3 uds cada pack)
 *   - 6-pack:     1 pack por frente  = 6 unidades
 *   - 12-pack:    1 pack por frente  = 12 unidades
 *
 * Uso: node --env-file=.env.local scripts/sos-doh-analysis.mjs
 */
import XLSX from 'xlsx'
import pg from 'pg'
import { writeFileSync, readFileSync } from 'fs'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const SP = 'C:/Users/IAN/AppData/Local/Temp/claude/c--Users-IAN-Documents-bl-dashboard/ceb6616b-df65-4963-b452-50f601f62b10/scratchpad'

// Unidades por frente por formato
const UDS_POR_FRENTE = {
  individual: 6,
  pack3:      6,   // 2 packs de 3 uds
  pack6:      6,   // 1 pack de 6 uds
  pack12:    12,   // 1 pack de 12 uds
}

// ── 1. Parse SOS Excel ────────────────────────────────────────────────────
const wb = XLSX.readFile(SP + '/sos.xlsx')
const sos = []
for (const sheetName of wb.SheetNames) {
  if (sheetName === 'LISTA P.V' || sheetName === 'FORMATO') continue
  const ws = wb.Sheets[sheetName]
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  if (!grid || grid.length < 10) continue
  const pdvName = grid[4]?.[1] ?? sheetName
  const headers = []
  for (let i = 0; i < grid.length; i++) if (grid[i]?.[0] === 'Marca' && grid[i]?.[1] === 'Variedad') headers.push(i)
  for (const hRow of headers) {
    const marca = grid[hRow + 1]?.[0]
    if (!marca) continue
    for (let v = 0; v < 12; v++) {
      const row = grid[hRow + 1 + v]
      if (!row) continue
      const variedad = row[1]
      const ind = Number(row[2]) || 0, p3 = Number(row[3]) || 0, p6 = Number(row[4]) || 0, p12 = Number(row[5]) || 0
      if (ind + p3 + p6 + p12 === 0) continue
      // Capacidad en unidades individuales equivalentes
      const capacidad_uds =
        ind * UDS_POR_FRENTE.individual +
        p3  * UDS_POR_FRENTE.pack3 +
        p6  * UDS_POR_FRENTE.pack6 +
        p12 * UDS_POR_FRENTE.pack12
      sos.push({ pdv: pdvName.trim(), marca, variedad, ind, p3, p6, p12, frentes_total: ind+p3+p6+p12, capacidad_uds })
    }
  }
}

// Agregar Borden por PDV
const bordenPorPDV = {}
for (const r of sos) {
  if (r.marca !== 'Borden') continue
  if (!bordenPorPDV[r.pdv]) bordenPorPDV[r.pdv] = { pdv: r.pdv, frentes: 0, capacidad_uds: 0 }
  bordenPorPDV[r.pdv].frentes += r.frentes_total
  bordenPorPDV[r.pdv].capacidad_uds += r.capacidad_uds
}

// ── 2. Normalizar nombres PDV para matchear con DB ──────────────────────
// Excel tiene "MXM LAS FLORES", "Walmart cartago", "Mxm ciudad colon" etc.
// DB tiene "WM SAN SEBASTIAN", "MXM SAN GERARDO" — mayúsculas, prefijo WM/MXM
const norm = s => (s ?? '').toUpperCase()
  .replace(/[ÁÀÂÃÄ]/g, 'A').replace(/[ÉÈÊË]/g, 'E').replace(/[ÍÌÎÏ]/g, 'I')
  .replace(/[ÓÒÔÕÖ]/g, 'O').replace(/[ÚÙÛÜ]/g, 'U').replace(/Ñ/g, 'N')
  .replace(/WALMART/g, 'WM').replace(/MAS X MENOS|MASXMENOS|MXM|MMX/g, 'MXM')
  .replace(/[^A-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim()

// ── 3. Ventas Walmart CR Leches por PDV (últimos 60 días) ───────────────
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()

const vRes = await c.query(`
  SELECT punto_venta, cadena,
    SUM(ventas_unidades) uds_totales,
    COUNT(DISTINCT fecha) dias_con_venta,
    ROUND(SUM(ventas_unidades)::numeric / GREATEST(COUNT(DISTINCT fecha), 1), 1) uds_dia
  FROM fact_ventas_walmart
  WHERE pais='CR' AND categoria='Leches'
    AND fecha >= (SELECT MAX(fecha) FROM fact_ventas_walmart WHERE pais='CR') - INTERVAL '60 days'
  GROUP BY punto_venta, cadena
`)
const ventasByPDV = {}
for (const r of vRes.rows) ventasByPDV[norm(r.punto_venta)] = { punto_venta: r.punto_venta, cadena: r.cadena, uds_dia: Number(r.uds_dia) }

// ── 4. Inventario snapshot actual por PDV ────────────────────────────────
const invRes = await c.query(`
  SELECT punto_venta, SUM(inv_mano) inv, MAX(fecha)::text fecha
  FROM fact_inventario_walmart_pdv
  WHERE pais='CR' AND categoria='Leches'
    AND fecha = (SELECT MAX(fecha) FROM fact_inventario_walmart_pdv WHERE pais='CR')
  GROUP BY punto_venta
`)
const invByPDV = {}
for (const r of invRes.rows) invByPDV[norm(r.punto_venta)] = { inv: Number(r.inv), fecha: r.fecha }

// ── 5. Días desabastecidos últimos 60d ────────────────────────────────────
const oosRes = await c.query(`
  SELECT punto_venta, COUNT(*) FILTER (WHERE inv_mano <= 0) dias_oos, COUNT(*) dias_totales
  FROM fact_inventario_walmart_pdv
  WHERE pais='CR' AND categoria='Leches'
    AND fecha >= (SELECT MAX(fecha) FROM fact_inventario_walmart_pdv WHERE pais='CR') - INTERVAL '60 days'
  GROUP BY punto_venta
`)
const oosByPDV = {}
for (const r of oosRes.rows) oosByPDV[norm(r.punto_venta)] = { oos: Number(r.dias_oos), tot: Number(r.dias_totales) }

// ── 6. Match SOS × Ventas × Inv ──────────────────────────────────────────
const analisis = []
for (const b of Object.values(bordenPorPDV)) {
  const k = norm(b.pdv)
  const v = ventasByPDV[k]
  const inv = invByPDV[k]
  const oos = oosByPDV[k]
  const udsDia = v?.uds_dia ?? null
  const doh_gondola = udsDia && udsDia > 0 ? +(b.capacidad_uds / udsDia).toFixed(1) : null
  const doh_gondola_pico = udsDia && udsDia > 0 ? +(b.capacidad_uds / (udsDia * 1.35)).toFixed(1) : null  // pico +35%
  const frentes_recomendados = udsDia && udsDia > 0 ? Math.ceil((udsDia * 3 * 1.35) / 6) : null  // 3 días de cobertura en pico
  const capacidad_actual_frentes = b.frentes
  const gap_frentes = frentes_recomendados !== null ? frentes_recomendados - capacidad_actual_frentes : null
  analisis.push({
    pdv: b.pdv,
    frentes_borden: b.frentes,
    capacidad_uds: b.capacidad_uds,
    uds_dia_prom: udsDia,
    doh_gondola_normal: doh_gondola,
    doh_gondola_pico: doh_gondola_pico,
    inv_actual: inv?.inv ?? null,
    dias_oos_60d: oos?.oos ?? null,
    frentes_recomendados_pico: frentes_recomendados,
    gap_frentes: gap_frentes,
  })
}

// Ordenar por uds_dia_prom desc
analisis.sort((a, b) => (b.uds_dia_prom ?? 0) - (a.uds_dia_prom ?? 0))
console.log('=== DOH · Frentes Borden vs Ventas Reales ===')
console.table(analisis)

// Resumen
const conMatch = analisis.filter(a => a.uds_dia_prom !== null)
const promDOH = conMatch.reduce((s, a) => s + (a.doh_gondola_normal ?? 0), 0) / conMatch.length
const promDOHPico = conMatch.reduce((s, a) => s + (a.doh_gondola_pico ?? 0), 0) / conMatch.length
const totalOOS = conMatch.reduce((s, a) => s + (a.dias_oos_60d ?? 0), 0)
const gapTot = conMatch.reduce((s, a) => s + (a.gap_frentes ?? 0), 0)

console.log('\n=== RESUMEN GLOBAL ===')
console.log('PDVs con match Excel↔DB:', conMatch.length, 'de', analisis.length)
console.log('DOH promedio (venta normal):', promDOH.toFixed(1), 'días')
console.log('DOH promedio (pico +35%):', promDOHPico.toFixed(1), 'días')
console.log('Total días out-of-stock (60d, suma PDVs):', totalOOS)
console.log('Gap frentes recomendados vs actuales:', gapTot, '(positivo = falta capacidad)')

// CSV
const csv = ['PDV,Frentes Borden,Capacidad (uds),Uds/día prom,DOH normal,DOH pico +35%,Inv actual,Días OOS (60d),Frentes recomendados,Gap frentes']
for (const a of analisis) csv.push([a.pdv, a.frentes_borden, a.capacidad_uds, a.uds_dia_prom ?? '', a.doh_gondola_normal ?? '', a.doh_gondola_pico ?? '', a.inv_actual ?? '', a.dias_oos_60d ?? '', a.frentes_recomendados_pico ?? '', a.gap_frentes ?? ''].join(','))
writeFileSync(SP + '/sos_doh_analysis.csv', csv.join('\n'))

await c.end()
console.log('\n📄 CSV completo: scratchpad/sos_doh_analysis.csv')
