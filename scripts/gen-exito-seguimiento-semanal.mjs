/**
 * gen-exito-seguimiento-semanal.mjs
 * Informe semanal Grupo Éxito (Colombia):
 *   - Por Producto (PluCD, mes ene-jun, RR und/día y valor, proyección cierre mes)
 *   - Por Cadena (CARULLA, EXITO, SUPER INTER, etc.)
 *   - Por Subformato (CARULLA EXPRESS, TURBO CARULLA, EXITO, etc.)
 * Output: C:/Users/IAN/Downloads/Exito_Seguimiento_<fecha>.xlsx
 */
import pg from 'pg'
import XLSX from 'xlsx'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = readFileSync(join(__dirname, '../.env.local'), 'utf8')
for (const raw of env.split(/\r?\n/)) {
  const line = raw.trim()
  if (!line || line.startsWith('#')) continue
  const eq = line.indexOf('=')
  if (eq < 0) continue
  process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
}
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

const today = new Date()
const fechaIso = today.toISOString().slice(0, 10)
const ts = today.toISOString().slice(11, 16).replace(':', '')

// Mapeo SKU Borden → PluCD Éxito (del email Ignacio)
const SKU_TO_PLUCD = {
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

// Descripciones cortas para el reporte (estilo email)
const SKU_TO_DESC_EMAIL = {
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

// Días por mes 2026
const DIAS_MES = { 1: 31, 2: 28, 3: 31, 4: 30, 5: 31, 6: 30, 7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31 }
const MES_LBL = (m) => `${['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][m-1]}-26`

// 1. Última fecha con data en CO (para calcular días transcurridos del mes en curso)
const ultRes = await pool.query(`SELECT MAX(ano*10000+mes*100+dia) AS f FROM fact_ventas_exito WHERE pais='CO' AND ano=2026`)
const fNum = ultRes.rows[0].f
const ANO_ACTUAL = Math.floor(fNum / 10000)
const MES_ACTUAL = Math.floor(fNum / 100) % 100
const DIA_ACTUAL = fNum % 100
console.log(`📅 Última fecha con data CO: ${ANO_ACTUAL}-${String(MES_ACTUAL).padStart(2,'0')}-${String(DIA_ACTUAL).padStart(2,'0')}`)
console.log(`   Mes en curso: ${MES_LBL(MES_ACTUAL)} (${DIA_ACTUAL}/${DIAS_MES[MES_ACTUAL]} días)`)

// 2. Query agrupado por SKU y mes
console.log('\n📥 Sell-Out por SKU y mes…')
const ventasRes = await pool.query(`
  SELECT sku, mes,
         ROUND(SUM(ventas_unidades)::numeric, 0) AS und,
         ROUND(SUM(ventas_valorusd)::numeric, 0) AS usd,
         ROUND(SUM(venta_valorcop)::numeric, 0) AS cop
  FROM fact_ventas_exito
  WHERE pais='CO' AND ano=2026 AND sku IS NOT NULL AND sku <> ''
  GROUP BY sku, mes
`)
const dataBySku = {}  // sku → { mes: {und, usd, cop} }
for (const r of ventasRes.rows) {
  if (!dataBySku[r.sku]) dataBySku[r.sku] = {}
  dataBySku[r.sku][r.mes] = { und: Number(r.und), usd: Number(r.usd), cop: Number(r.cop) }
}

// 3. Helper: calcular RR + proyección para una fila
const calcRR = (mesData, mesActual, diaActual) => {
  const sel = mesData[mesActual]
  if (!sel) return { rrUnd: 0, rrUsd: 0, rrCop: 0, proyUnd: 0, proyUsd: 0, proyCop: 0, undActual: 0, usdActual: 0, copActual: 0 }
  const rrUnd  = sel.und / diaActual
  const rrUsd  = sel.usd / diaActual
  const rrCop  = sel.cop / diaActual
  const diasMes = DIAS_MES[mesActual]
  return {
    rrUnd: Math.round(rrUnd * 10) / 10,
    rrUsd: Math.round(rrUsd * 100) / 100,
    rrCop: Math.round(rrCop),
    proyUnd: Math.round(rrUnd * diasMes),
    proyUsd: Math.round(rrUsd * diasMes),
    proyCop: Math.round(rrCop * diasMes),
    undActual: sel.und,
    usdActual: sel.usd,
    copActual: sel.cop,
  }
}

// ── Sheet 1: Por Producto ─────────────────────────────────────────────
const colsProd = ['PluCD','SKU','Producto']
for (let m = 1; m <= MES_ACTUAL; m++) colsProd.push(MES_LBL(m) + ' (COP)')
colsProd.push('Total YTD (COP)')
colsProd.push(`RR und/día (${MES_LBL(MES_ACTUAL)})`)
colsProd.push(`RR COP/día`)
colsProd.push(`Und ${MES_LBL(MES_ACTUAL)} actuales`)
colsProd.push(`Proy. ${MES_LBL(MES_ACTUAL)} und`)
colsProd.push(`Proy. ${MES_LBL(MES_ACTUAL)} COP`)

const prodRows = []
const skus = Object.keys(dataBySku).filter(s => SKU_TO_PLUCD[s]).sort((a, b) => {
  // Ordenar por total YTD descendente
  const tA = Object.values(dataBySku[a]).reduce((s, x) => s + x.cop, 0)
  const tB = Object.values(dataBySku[b]).reduce((s, x) => s + x.cop, 0)
  return tB - tA
})

const totalesMes = {}
let totalYTD = 0, totalProyUnd = 0, totalProyCop = 0, totalRRund = 0, totalRRcop = 0, totalUndAct = 0
for (const sku of skus) {
  const mesData = dataBySku[sku]
  const row = {
    PluCD: SKU_TO_PLUCD[sku],
    SKU: sku,
    Producto: SKU_TO_DESC_EMAIL[sku] ?? sku,
  }
  let ytd = 0
  for (let m = 1; m <= MES_ACTUAL; m++) {
    const v = mesData[m]?.cop ?? 0
    row[MES_LBL(m) + ' (COP)'] = v
    ytd += v
    totalesMes[m] = (totalesMes[m] ?? 0) + v
  }
  row['Total YTD (COP)'] = ytd
  totalYTD += ytd

  const rr = calcRR(mesData, MES_ACTUAL, DIA_ACTUAL)
  row[`RR und/día (${MES_LBL(MES_ACTUAL)})`] = rr.rrUnd
  row[`RR COP/día`]                          = rr.rrCop
  row[`Und ${MES_LBL(MES_ACTUAL)} actuales`] = rr.undActual
  row[`Proy. ${MES_LBL(MES_ACTUAL)} und`]    = rr.proyUnd
  row[`Proy. ${MES_LBL(MES_ACTUAL)} COP`]    = rr.proyCop
  totalRRund += rr.rrUnd
  totalRRcop += rr.rrCop
  totalUndAct += rr.undActual
  totalProyUnd += rr.proyUnd
  totalProyCop += rr.proyCop
  prodRows.push(row)
}
// Fila total
const totRow = { PluCD: '', SKU: '', Producto: 'TOTAL GENERAL' }
for (let m = 1; m <= MES_ACTUAL; m++) totRow[MES_LBL(m) + ' (COP)'] = totalesMes[m] ?? 0
totRow['Total YTD (COP)'] = totalYTD
totRow[`RR und/día (${MES_LBL(MES_ACTUAL)})`] = Math.round(totalRRund * 10) / 10
totRow[`RR COP/día`]                          = Math.round(totalRRcop)
totRow[`Und ${MES_LBL(MES_ACTUAL)} actuales`] = totalUndAct
totRow[`Proy. ${MES_LBL(MES_ACTUAL)} und`]    = totalProyUnd
totRow[`Proy. ${MES_LBL(MES_ACTUAL)} COP`]    = totalProyCop
prodRows.push(totRow)

// ── Sheet 2 + 3: Por Cadena + Subformato ──────────────────────────────
async function buildAggrSheet(groupCol, label) {
  const r = await pool.query(`
    SELECT ${groupCol} AS grp, mes,
           ROUND(SUM(ventas_unidades)::numeric, 0) AS und,
           ROUND(SUM(ventas_valorusd)::numeric, 0) AS usd,
           ROUND(SUM(venta_valorcop)::numeric, 0) AS cop
    FROM fact_ventas_exito
    WHERE pais='CO' AND ano=2026 AND ${groupCol} IS NOT NULL AND ${groupCol} <> ''
    GROUP BY ${groupCol}, mes
  `)
  const dataByGrp = {}
  for (const x of r.rows) {
    if (!dataByGrp[x.grp]) dataByGrp[x.grp] = {}
    dataByGrp[x.grp][x.mes] = { und: Number(x.und), usd: Number(x.usd), cop: Number(x.cop) }
  }
  const cols = [label]
  for (let m = 1; m <= MES_ACTUAL; m++) cols.push(MES_LBL(m) + ' (COP)')
  cols.push('Total YTD (COP)')
  cols.push(`RR und/día (${MES_LBL(MES_ACTUAL)})`)
  cols.push(`RR COP/día`)
  cols.push(`Und ${MES_LBL(MES_ACTUAL)} actuales`)
  cols.push(`Proy. ${MES_LBL(MES_ACTUAL)} und`)
  cols.push(`Proy. ${MES_LBL(MES_ACTUAL)} COP`)

  const rows = []
  const totMes = {}
  let totYtd = 0, totUndAct = 0, totRRund = 0, totRRcop = 0, totProyUnd = 0, totProyCop = 0
  const sorted = Object.keys(dataByGrp).sort((a, b) => {
    const tA = Object.values(dataByGrp[a]).reduce((s, x) => s + x.cop, 0)
    const tB = Object.values(dataByGrp[b]).reduce((s, x) => s + x.cop, 0)
    return tB - tA
  })
  for (const grp of sorted) {
    const md = dataByGrp[grp]
    const row = { [label]: grp }
    let ytd = 0
    for (let m = 1; m <= MES_ACTUAL; m++) {
      const v = md[m]?.cop ?? 0
      row[MES_LBL(m) + ' (COP)'] = v
      ytd += v
      totMes[m] = (totMes[m] ?? 0) + v
    }
    row['Total YTD (COP)'] = ytd
    totYtd += ytd
    const rr = calcRR(md, MES_ACTUAL, DIA_ACTUAL)
    row[`RR und/día (${MES_LBL(MES_ACTUAL)})`] = rr.rrUnd
    row[`RR COP/día`]                          = rr.rrCop
    row[`Und ${MES_LBL(MES_ACTUAL)} actuales`] = rr.undActual
    row[`Proy. ${MES_LBL(MES_ACTUAL)} und`]    = rr.proyUnd
    row[`Proy. ${MES_LBL(MES_ACTUAL)} COP`]    = rr.proyCop
    totUndAct += rr.undActual; totRRund += rr.rrUnd; totRRcop += rr.rrCop
    totProyUnd += rr.proyUnd; totProyCop += rr.proyCop
    rows.push(row)
  }
  const tot = { [label]: 'TOTAL GENERAL' }
  for (let m = 1; m <= MES_ACTUAL; m++) tot[MES_LBL(m) + ' (COP)'] = totMes[m] ?? 0
  tot['Total YTD (COP)'] = totYtd
  tot[`RR und/día (${MES_LBL(MES_ACTUAL)})`] = Math.round(totRRund * 10) / 10
  tot[`RR COP/día`]                          = Math.round(totRRcop)
  tot[`Und ${MES_LBL(MES_ACTUAL)} actuales`] = totUndAct
  tot[`Proy. ${MES_LBL(MES_ACTUAL)} und`]    = totProyUnd
  tot[`Proy. ${MES_LBL(MES_ACTUAL)} COP`]    = totProyCop
  rows.push(tot)

  return { cols, rows }
}

console.log('\n📥 Construyendo agregados…')
const sheetCadena    = await buildAggrSheet('cadena', 'Cadena')
const sheetSubformato = await buildAggrSheet('subformato', 'Subformato')

// ── Generar Excel ──────────────────────────────────────────────────────
const wb = XLSX.utils.book_new()

const addSheet = (name, cols, rows) => {
  const aoa = [cols, ...rows.map(r => cols.map(c => r[c] ?? ''))]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  return ws
}

const wsProd = addSheet('Por Producto', colsProd, prodRows)
wsProd['!cols'] = colsProd.map(c => ({ wch: c === 'Producto' ? 38 : 16 }))
XLSX.utils.book_append_sheet(wb, wsProd, 'Por Producto')

const wsCad = addSheet('Por Cadena', sheetCadena.cols, sheetCadena.rows)
wsCad['!cols'] = sheetCadena.cols.map(c => ({ wch: c === 'Cadena' ? 22 : 16 }))
XLSX.utils.book_append_sheet(wb, wsCad, 'Por Cadena')

const wsSub = addSheet('Por Subformato', sheetSubformato.cols, sheetSubformato.rows)
wsSub['!cols'] = sheetSubformato.cols.map(c => ({ wch: c === 'Subformato' ? 22 : 16 }))
XLSX.utils.book_append_sheet(wb, wsSub, 'Por Subformato')

const outPath = `C:/Users/IAN/Downloads/Exito_Seguimiento_${fechaIso}_${ts}.xlsx`
XLSX.writeFile(wb, outPath)
console.log(`\n📄 ${outPath}`)
console.log(`   Por Producto: ${prodRows.length - 1} SKUs + total`)
console.log(`   Por Cadena: ${sheetCadena.rows.length - 1} cadenas + total`)
console.log(`   Por Subformato: ${sheetSubformato.rows.length - 1} subformatos + total`)

await pool.end()
