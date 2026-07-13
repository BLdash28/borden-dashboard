// Normaliza cadena y formato en fact_ventas_walmart:
// - Case: 'Hipermercado' → 'HIPERMERCADO', 'Walmart' → 'WALMART'
// - Rptcodes (ME, MI, PI, PZ, LN, DF, LJ, HM) → nombres display
//
// Uso: node --env-file=.env.local scripts/normalizar-walmart-cadena-formato.mjs
import pg from 'pg'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const c = new pg.Client({connectionString: process.env.DATABASE_URL})
await c.connect()

// Mapeo rptcode → { cadena, formato } — según memoria project_walmart_rptcodes.md
const RPTCODE_MAP = {
  'HM': { cadena: 'WALMART',              formato: 'HIPERMERCADO' },
  'PI': { cadena: 'PALI',                 formato: 'DESCUENTOS'   },
  'ME': { cadena: 'MAS X MENOS',          formato: 'SUPERMERCADO' },
  'MI': { cadena: 'MAXI PALI',            formato: 'BODEGAS'      },
  'DF': { cadena: 'DESPENSA FAMILIAR',    formato: 'DESCUENTOS'   },
  'LJ': { cadena: 'LA DESPENSA DON JUAN', formato: 'SUPERMERCADO' },
  'PZ': { cadena: 'PAIZ',                 formato: 'SUPERMERCADO' },
  'LN': { cadena: 'LA UNION',             formato: 'SUPERMERCADO' },
}

// ── Estado ANTES ────────────────────────────────────────────────────────────
console.log('\n[ANTES] Distribución formato:')
console.table((await c.query(
  `SELECT formato, COUNT(*)::int filas FROM fact_ventas_walmart WHERE formato IS NOT NULL GROUP BY formato ORDER BY filas DESC`,
)).rows)
console.log('\n[ANTES] Distribución cadena:')
console.table((await c.query(
  `SELECT cadena, COUNT(*)::int filas FROM fact_ventas_walmart WHERE cadena IS NOT NULL GROUP BY cadena ORDER BY filas DESC`,
)).rows)

// ── 1. Normalizar case ───────────────────────────────────────────────────────
let r
r = await c.query(`UPDATE fact_ventas_walmart SET formato=UPPER(formato) WHERE formato IS NOT NULL AND formato <> UPPER(formato)`)
console.log(`\n[OK] formato → UPPER: ${r.rowCount} filas`)

r = await c.query(`UPDATE fact_ventas_walmart SET cadena=UPPER(cadena) WHERE cadena IS NOT NULL AND cadena <> UPPER(cadena)`)
console.log(`[OK] cadena  → UPPER: ${r.rowCount} filas`)

// ── 2. Mapear rptcodes → display ─────────────────────────────────────────────
for (const [rpt, { cadena, formato }] of Object.entries(RPTCODE_MAP)) {
  // Solo actualizar donde el valor actual coincide con el rptcode literal
  r = await c.query(
    `UPDATE fact_ventas_walmart SET cadena=$1, formato=$2 WHERE cadena=$3`,
    [cadena, formato, rpt],
  )
  if (r.rowCount > 0) console.log(`  [${rpt}] → cadena='${cadena}', formato='${formato}': ${r.rowCount} filas`)
}

// Adicional: si algún row tiene cadena display pero formato rptcode (ej: cadena='WALMART' formato='HM')
for (const [rpt, { formato }] of Object.entries(RPTCODE_MAP)) {
  r = await c.query(
    `UPDATE fact_ventas_walmart SET formato=$1 WHERE formato=$2`,
    [formato, rpt],
  )
  if (r.rowCount > 0) console.log(`  [formato ${rpt}] → '${formato}': ${r.rowCount} filas`)
}

// ── Estado DESPUÉS ───────────────────────────────────────────────────────────
console.log('\n[DESPUÉS] Distribución formato:')
console.table((await c.query(
  `SELECT formato, COUNT(*)::int filas FROM fact_ventas_walmart WHERE formato IS NOT NULL GROUP BY formato ORDER BY filas DESC`,
)).rows)
console.log('\n[DESPUÉS] Distribución cadena:')
console.table((await c.query(
  `SELECT cadena, COUNT(*)::int filas FROM fact_ventas_walmart WHERE cadena IS NOT NULL GROUP BY cadena ORDER BY filas DESC`,
)).rows)

await c.end()
