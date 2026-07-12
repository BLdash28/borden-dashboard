// Carga la proyección "REVISION" 2026 desde 'Proyección 2026 - seguimiento.xlsx'
// hoja "BASE 2026" a la tabla `proyecciones` (con tipo='REVISION').
//
// Preserva la proyección ORIGINAL. Idempotente: purga solo tipo=REVISION año=2026.
//
// Uso:
//   node --env-file=.env.local scripts/cargar-proyeccion-revision.mjs [ruta.xlsx]

import XLSX from 'xlsx'
import pg from 'pg'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const XLSX_PATH = process.argv[2] ?? 'C:/Users/IAN/Downloads/Proyección 2026.xlsx'
const SHEET     = 'BASE 2026 version 2'
const TIPO      = 'REVISION'
const ANO       = 2026

// Mapeo país Excel → código país BD
const PAIS_MAP = {
  'CR': 'CR', 'GT': 'GT', 'SV': 'SV', 'HN': 'HN', 'NIC': 'NI', 'NI': 'NI',
  'CO': 'CO', 'PU': 'PU', 'EC': 'EC',
}

// Mapeo División Excel (mayúsculas singular) → Categoría normalizada (que usa ORIGINAL, plural)
// Esto asegura que los filtros de la UI comparten valores entre ORIGINAL y REVISION.
const DIVISION_A_CATEGORIA = {
  'QUESO':  'Quesos',
  'LECHE':  'Leches',
  'HELADO': 'Helados',
}

const MESES = [
  { col: 'Jan-26', mes: 1 }, { col: 'Feb-26', mes: 2 }, { col: 'Mar-26', mes: 3 },
  { col: 'Apr-26', mes: 4 }, { col: 'May-26', mes: 5 }, { col: 'Jun-26', mes: 6 },
  { col: 'Jul-26', mes: 7 }, { col: 'Aug-26', mes: 8 }, { col: 'Sep-26', mes: 9 },
  { col: 'Oct-26', mes: 10 },{ col: 'Nov-26', mes: 11 },{ col: 'Dec-26', mes: 12 },
]

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

// Asegurar columna tipo (por si el script se corre en otra instancia sin la migración)
await client.query(
  `ALTER TABLE proyecciones ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'ORIGINAL'`,
)

// Purga solo lo que se va a re-cargar
const del = await client.query(
  `DELETE FROM proyecciones WHERE tipo=$1 AND ano=$2`,
  [TIPO, ANO],
)
console.log(`[OK] purgadas ${del.rowCount} filas previas de tipo=${TIPO}, ano=${ANO}`)

const wb   = XLSX.readFile(XLSX_PATH)
if (!wb.SheetNames.includes(SHEET)) {
  console.error(`No se encontró hoja "${SHEET}" en el archivo`)
  process.exit(1)
}
const rows = XLSX.utils.sheet_to_json(wb.Sheets[SHEET], { defval: null })
console.log(`[OK] leídas ${rows.length} filas de la hoja "${SHEET}"`)

let insertadas = 0
let saltadas   = 0
const problemas = []

for (const r of rows) {
  const paisXlsx  = (r['PAIS'] ?? '').toString().trim().toUpperCase()
  const pais      = PAIS_MAP[paisXlsx] ?? null
  const cliente   = (r['CLIENTE']    ?? '').toString().trim()
  const division  = (r['DIVISION']   ?? '').toString().trim().toUpperCase()
  // Guardamos la categoría de nivel División (Quesos/Leches/Helados) para que
  // los filtros de la UI compartan valores entre ORIGINAL y REVISION.
  const categoria    = DIVISION_A_CATEGORIA[division] ?? division
  const subcategoria = (r['CATEGORIA'] ?? '').toString().trim() || null
  const empresa      = (r['LICENCIAMIENTO'] ?? '').toString().trim() || 'BL FOODS'

  if (!pais || !cliente || !categoria) {
    saltadas++
    problemas.push({ paisXlsx, cliente, categoria, razon: 'faltan campos clave' })
    continue
  }

  for (const { col, mes } of MESES) {
    const raw = r[col]
    if (raw === null || raw === undefined) continue
    const valor = Number(raw)
    if (!isFinite(valor) || valor === 0) continue

    await client.query(
      `INSERT INTO proyecciones (ano, mes, empresa, categoria, subcategoria, pais, cliente, valor_usd, tipo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [ANO, mes, empresa, categoria, subcategoria, pais, cliente, valor, TIPO],
    )
    insertadas++
  }
}

console.log(`\n[OK] insertadas ${insertadas} filas (${saltadas} filas saltadas del Excel)`)
if (problemas.length) {
  console.log('\n[Problemas]:')
  console.table(problemas.slice(0, 20))
}

// Resumen
const t = await client.query(
  `SELECT tipo, COUNT(*)::int filas,
          COUNT(DISTINCT mes) meses,
          COUNT(DISTINCT pais) paises,
          COUNT(DISTINCT cliente) clientes,
          SUM(valor_usd)::numeric(20,2) total
     FROM proyecciones
    WHERE ano=$1
    GROUP BY tipo ORDER BY tipo`,
  [ANO],
)
console.log('\n[Totales por tipo · 2026]')
console.table(t.rows)

await client.end()
