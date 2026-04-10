// scripts/import-productos.mjs
// Importa la base maestra de productos a dim_producto en Neon.
//
// Uso:
//   1. Pon el Excel en la raíz del proyecto con el nombre PRODUCTOS.xlsx
//   2. node scripts/import-productos.mjs
//   3. Opcional: especifica otro archivo → node scripts/import-productos.mjs OTRA_BASE.xlsx
//
// Columnas esperadas en el Excel (nombres exactos, primera fila):
//   categoria | SUBCATE. (o SUBCATEGORIA) | COD DE BARRAS | COD INTERN. | DESCRIPCION
//
// Clave única: COD DE BARRAS (normalizado). Un SKU puede repetirse entre productos.

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { Pool } from 'pg'
import XLSX from 'xlsx'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir   = join(__dirname, '..')

// ── Cargar .env.local ─────────────────────────────────────────
const envPath    = join(rootDir, '.env.local')
const envContent = readFileSync(envPath, 'utf8')
const envVars    = {}
for (const line of envContent.split(/\r?\n/)) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx === -1) continue
  envVars[trimmed.substring(0, eqIdx).trim()] = trimmed.substring(eqIdx + 1).trim()
}

// dim_producto vive en la misma base que fact_sales_sellout para poder hacer JOINs
const DATABASE_URL = envVars['DATABASE_URL_NEON']
if (!DATABASE_URL) {
  console.error('❌  DATABASE_URL_NEON no encontrado en .env.local')
  process.exit(1)
}

const pool = new Pool({
  connectionString: DATABASE_URL.includes('sslmode=')
    ? DATABASE_URL
    : DATABASE_URL + '?sslmode=verify-full',
})

// ── Leer Excel ────────────────────────────────────────────────
const xlsxFile = process.argv[2] ?? 'PRODUCTOS.xlsx'
const filePath  = join(rootDir, xlsxFile)
console.log('📂  Leyendo:', filePath)

let wb
try {
  wb = XLSX.readFile(filePath)
} catch {
  console.error(`❌  No se encontró el archivo: ${filePath}`)
  console.error('    Pon el Excel en la raíz del proyecto o pasa la ruta como argumento.')
  process.exit(1)
}

// Toma la primera hoja disponible
const sheetName = wb.SheetNames[0]
console.log(`📋  Hoja: "${sheetName}"`)
const ws  = wb.Sheets[sheetName]
const raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
console.log(`📊  Filas leídas: ${raw.length}`)

// ── Normalizar filas ──────────────────────────────────────────
// Acepta variantes de nombre de columna
function col(row, ...names) {
  for (const n of names) {
    const found = Object.keys(row).find(k => k.trim().toUpperCase() === n.toUpperCase())
    if (found !== undefined) return String(row[found] ?? '').trim()
  }
  return ''
}

/**
 * Normaliza al formato del sistema de ventas (13 chars, sin dígito verificador).
 *
 * Regla odd/even:
 *   - Longitud IMPAR  → tiene dígito verificador al final → se quita → pad a 13
 *   - Longitud PAR    → ya es solo datos (sin check digit) → pad directo a 13
 *
 * Ejemplos:
 *   7452105970109  (13, impar) → quitar check → 745210597010  → 0745210597010
 *   745210597010   (12, par)   → pad directo  →                  0745210597010
 *   53000000433    (11, impar) → quitar check → 5300000043    → 0005300000043
 *   5300000043     (10, par)   → pad directo  →                  0005300000043
 */
function normalizeBarcode(raw) {
  const s = String(raw).replace(/\s/g, '').replace(/\.0*$/, '')
  if (!/^\d+$/.test(s) || s.length < 2) return s
  const base = s.length % 2 !== 0 ? s.slice(0, -1) : s   // impar → quitar check
  return base.padStart(13, '0')
}

const rows = raw
  .map(r => {
    const barcode = col(r, 'COD DE BARRAS', 'COD DE BARR', 'COD BARRAS', 'CODIGO DE BARRAS', 'BARCODE')
    const sku     = col(r, 'COD INTERNO',   'COD INTERN.', 'CODIGO INTERNO', 'COD_INTERN', 'SKU')
    return {
      sku,
      codigo_barras: barcode ? normalizeBarcode(barcode) : '',
      descripcion:   col(r, 'DESCRIPCION', 'DESCRIPCIÓN', 'DESCRIPTION'),
      categoria:     col(r, 'categoria', 'CATEGORIA', 'CATEGORÍA'),
      subcategoria:  col(r, 'SUBCATEGORIA', 'SUBCATE.', 'SUBCATEGORÍA', 'SUBCATE'),
    }
  })
  .filter(r => r.codigo_barras && r.descripcion)

if (rows.length === 0) {
  console.error('❌  No se encontraron filas válidas (se requiere COD DE BARRAS y DESCRIPCION).')
  console.error('    Columnas detectadas:', Object.keys(raw[0] ?? {}).join(', '))
  process.exit(1)
}
console.log(`✅  Filas válidas: ${rows.length}`)

// ── Deduplicar por código de barras normalizado ───────────────
// El código de barras es el identificador real del producto.
// Ante duplicados conserva la última aparición (más abajo en el Excel).
const dedupMap = new Map()
for (const r of rows) dedupMap.set(r.codigo_barras, r)
const unique = [...dedupMap.values()]
const dupes  = rows.length - unique.length
if (dupes > 0) console.log(`⚠️   Códigos duplicados eliminados: ${dupes} (se conservó la última aparición)`)
console.log(`📦  Productos únicos a importar: ${unique.length}`)

// ── Asegurar tabla ────────────────────────────────────────────
await pool.query(`
  CREATE TABLE IF NOT EXISTS dim_producto (
    id            SERIAL PRIMARY KEY,
    sku           VARCHAR(50),
    codigo_barras VARCHAR(50)  UNIQUE NOT NULL,
    descripcion   VARCHAR(255) NOT NULL,
    categoria     VARCHAR(20),
    subcategoria  VARCHAR(100),
    presentacion  VARCHAR(50),
    is_active     BOOLEAN     DEFAULT TRUE,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
  )
`)

// ── Upsert en lotes de 200 ────────────────────────────────────
const BATCH = 200
let upserted = 0

for (let i = 0; i < unique.length; i += BATCH) {
  const batch = unique.slice(i, i + BATCH)

  // Build multi-row VALUES ($1,$2,...), ($n+1,$n+2,...) ...
  const values  = []
  const placeholders = batch.map((r, j) => {
    const base = j * 5
    values.push(r.sku, r.codigo_barras || null, r.descripcion, r.categoria || null, r.subcategoria || null)
    return `($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5})`
  })

  await pool.query(
    `INSERT INTO dim_producto (sku, codigo_barras, descripcion, categoria, subcategoria)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (codigo_barras) DO UPDATE SET
       sku          = EXCLUDED.sku,
       descripcion  = EXCLUDED.descripcion,
       categoria    = EXCLUDED.categoria,
       subcategoria = EXCLUDED.subcategoria,
       is_active    = TRUE,
       updated_at   = NOW()`,
    values
  )

  upserted += batch.length
  process.stdout.write(`\r⬆️   Procesando... ${upserted}/${unique.length}`)
}

console.log(`\n🎉  Completado: ${upserted} productos upserted en dim_producto`)

// ── Enriquecer fact_sales_sellout con el catálogo maestro ─────
// Regla: ventas tienen 13 dígitos sin el dígito verificador final
// → comparamos los primeros 12 dígitos de cada lado
console.log('\n🔄  Enriqueciendo fact_sales_sellout con datos maestros...')
const { rowCount: updated } = await pool.query(`
  UPDATE fact_sales_sellout f
  SET
    descripcion  = p.descripcion,
    sku          = p.sku,
    categoria    = p.categoria,
    subcategoria = p.subcategoria
  FROM dim_producto p
  WHERE TRIM(p.codigo_barras) = TRIM(f.codigo_barras)
    AND p.is_active = TRUE
`)
console.log(`✅  Filas de ventas actualizadas: ${updated}`)

// ── Resumen por categoría ─────────────────────────────────────
const { rows: stats } = await pool.query(
  `SELECT categoria, COUNT(*) AS total
   FROM dim_producto WHERE is_active = TRUE
   GROUP BY categoria ORDER BY total DESC`
)
console.log('\n📊  Productos activos por categoría:')
stats.forEach(s => console.log(`    ${(s.categoria || '(sin categoría)').padEnd(20)} ${s.total}`))

// ── Correlación con fact_sales_sellout ────────────────────────
// Verifica cuántos códigos de barras de ventas tienen match en el catálogo
const { rows: corr } = await pool.query(`
  SELECT
    COUNT(DISTINCT f.codigo_barras) AS barcodes_en_ventas,
    COUNT(DISTINCT f.codigo_barras) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM dim_producto p
        WHERE TRIM(p.codigo_barras) = TRIM(f.codigo_barras)
      )
    ) AS con_match,
    COUNT(DISTINCT f.codigo_barras) FILTER (
      WHERE NOT EXISTS (
        SELECT 1 FROM dim_producto p
        WHERE TRIM(p.codigo_barras) = TRIM(f.codigo_barras)
      )
    ) AS sin_match
  FROM fact_sales_sellout f
  WHERE f.codigo_barras IS NOT NULL AND f.codigo_barras <> ''
`)

if (corr.length > 0) {
  const { barcodes_en_ventas, con_match, sin_match } = corr[0]
  const pct = barcodes_en_ventas > 0
    ? ((con_match / barcodes_en_ventas) * 100).toFixed(1)
    : '0.0'
  console.log('\n🔗  Correlación con fact_sales_sellout:')
  console.log(`    Códigos de barras en ventas : ${barcodes_en_ventas}`)
  console.log(`    Con match en dim_producto   : ${con_match}  (${pct}%)`)
  console.log(`    Sin match (sin catálogo)    : ${sin_match}`)

  if (Number(sin_match) > 0) {
    const { rows: missing } = await pool.query(`
      SELECT DISTINCT f.codigo_barras, MAX(f.descripcion) AS descripcion_venta
      FROM fact_sales_sellout f
      WHERE f.codigo_barras IS NOT NULL AND f.codigo_barras <> ''
        AND NOT EXISTS (
          SELECT 1 FROM dim_producto p WHERE p.codigo_barras = f.codigo_barras
        )
      GROUP BY f.codigo_barras
      ORDER BY f.codigo_barras
      LIMIT 20
    `)
    console.log('\n⚠️   Primeros códigos sin catálogo (agrégalos al Excel y vuelve a importar):')
    missing.forEach(r => console.log(`    ${r.codigo_barras}  →  ${r.descripcion_venta}`))
  }
}

await pool.end()
