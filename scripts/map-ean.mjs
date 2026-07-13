/**
 * map-ean.mjs
 * Mapea un archivo de EANs contra dim_producto.
 * Uso: node scripts/map-ean.mjs <archivo_input> <archivo_output>
 *
 * Ejemplos:
 *   node scripts/map-ean.mjs C:/Users/IAN/Documents/ean_hn.txt C:/Users/IAN/Downloads/EAN_HN_mapping.csv
 *   node scripts/map-ean.mjs C:/Users/IAN/Documents/EAN_CR.txt C:/Users/IAN/Downloads/EAN_CR_mapping.csv
 */
import pg from 'pg'
import { readFileSync, writeFileSync } from 'fs'
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

const inputPath = process.argv[2]
const outputPath = process.argv[3]
if (!inputPath || !outputPath) {
  console.error('Uso: node scripts/map-ean.mjs <input.txt> <output.csv>')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

// ── 1. Leer archivo ──────────────────────────────────────────────────────
const fileLines = readFileSync(inputPath, 'utf8')
  .split(/\r?\n/)
  .map(l => l.trim())
  .filter(l => l.length > 0)
console.log(`📂 ${fileLines.length} líneas leídas de ${inputPath}`)

// ── 2. EANs únicos ───────────────────────────────────────────────────────
const uniqueEans = [...new Set(fileLines)]
console.log(`🔍 ${uniqueEans.length} EANs únicos`)

// ── 3. Columnas de dim_producto ──────────────────────────────────────────
const cols = await pool.query(`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'dim_producto' ORDER BY ordinal_position
`)
const colNames = cols.rows.map(r => r.column_name)

// ── 4. Buscar cada EAN (file con leading zeros → DB con check digit) ────
const mapping = new Map()
for (const ean of uniqueEans) {
  const eanNorm = ean.replace(/^0+/, '')
  const r = await pool.query(
    `SELECT * FROM dim_producto
     WHERE codigo_barras::text LIKE $1 || '%'
        OR codigo_barras::text = $2
     ORDER BY LENGTH(codigo_barras::text) ASC
     LIMIT 1`,
    [eanNorm, ean]
  )
  mapping.set(ean, r.rows[0] ?? null)
}
const foundCount = [...mapping.values()].filter(v => v).length
console.log(`✅ ${foundCount} de ${uniqueEans.length} EANs encontrados`)

const noEncontrados = uniqueEans.filter(e => !mapping.get(e))
if (noEncontrados.length > 0) {
  console.log('\n=== EANs NO encontrados ===')
  for (const e of noEncontrados) console.log(`  ❌ ${e}`)
}

// ── 5. Exportar CSV línea por línea ──────────────────────────────────────
const exportCols = ['sku', 'codigo_barras', 'descripcion', 'categoria', 'subcategoria', 'presentacion', 'vnpk_qty']
const headers = ['linea', 'ean_archivo', 'encontrado', ...exportCols]

const escape = (v) => {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

console.log(`\n✍️  Escribiendo ${fileLines.length} líneas...`)
const out = [headers.join(',')]
for (let i = 0; i < fileLines.length; i++) {
  const ean = fileLines[i]
  const m = mapping.get(ean)
  out.push([
    i + 1,
    ean,
    m ? 'SI' : 'NO',
    ...exportCols.map(c => escape(m?.[c])),
  ].join(','))
  if ((i + 1) % 10000 === 0) process.stdout.write(`\r   ${i + 1}/${fileLines.length}`)
}

writeFileSync(outputPath, out.join('\n'), 'utf8')
console.log(`\n\n📄 Archivo generado: ${outputPath}`)
console.log(`   ${out.length - 1} líneas de datos (+ 1 header)`)

await pool.end()
