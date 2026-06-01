/**
 * Carga filas de cadena LA TORRE desde COMERCIAL_2025_2026_MARZO.csv
 * a fact_ventas_unisuper.
 * Uso: node scripts/import-unisuper-latorre.mjs
 */

import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

try {
  const env = readFileSync(join(__dirname, '../.env.local'), 'utf8')
  for (const raw of env.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eqIdx = line.indexOf('=')
    if (eqIdx < 0) continue
    process.env[line.slice(0, eqIdx).trim()] = line.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
  }
} catch (e) { console.warn('No se pudo cargar .env.local:', e.message) }

const DB_URL = process.env.DATABASE_URL
if (!DB_URL) { console.error('DATABASE_URL no encontrado'); process.exit(1) }
console.log('Conectando a:', DB_URL.replace(/:([^@:]+)@/, ':***@'))

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const pool = new pg.Pool({ connectionString: DB_URL })

const TASA_GTQ = 7.7
const CSV_PATH = join(__dirname, '../COMERCIAL_2025_2026_MARZO.csv')

function parseNum(v) {
  if (!v) return 0
  return parseFloat(String(v).replace(/[$,\s]/g, '')) || 0
}

function parseIntVal(v) {
  return parseInt(String(v || '0').replace(/,/g, '').trim()) || 0
}

function cleanBarcode(v) {
  if (!v) return null
  if (/^\d+\.?\d*[Ee][+\-]\d+$/.test(v.trim())) return null
  return v.trim() || null
}

async function main() {
  const text  = readFileSync(CSV_PATH, 'utf8')
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  console.log(`Total líneas CSV: ${lines.length}`)

  const sep    = lines[0].includes(';') ? ';' : ','
  const header = lines[0].split(sep).map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, '').trim())

  const idx = keys => header.findIndex(h => keys.some(k => h === k || h.includes(k)))

  const col = {
    pais:            idx(['pais']),
    cadena:          idx(['cadena']),
    categoria:       idx(['categoria']),
    subcategoria:    idx(['subcategoria']),
    punto_venta:     idx(['punto_venta', 'puntoventa']),
    codigo_barras:   idx(['codigo_barras', 'codigobarras']),
    sku:             idx(['sku']),
    descripcion:     idx(['descripcion']),
    ano:             idx(['ano']),
    mes:             idx(['mes']),
    dia:             idx(['dia']),
    ventas_unidades: idx(['ventas_un', 'unidades']),
    ventas_valor:    idx(['ventas_valor', 'valor']),
  }

  console.log('Columnas detectadas:', col)

  const rows = []
  let omitidas = 0

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(sep)
    const get   = c => c >= 0 ? (cells[c] || '').trim() : ''

    const cadena = get(col.cadena)
    if (cadena !== 'LA TORRE') continue

    const pais = get(col.pais)
    const ano  = parseIntVal(get(col.ano))
    const mes  = parseIntVal(get(col.mes))
    const dia  = parseIntVal(get(col.dia)) || 1

    if (!pais || !ano || !mes) { omitidas++; continue }

    const unidades  = parseNum(get(col.ventas_unidades))
    const valorUSD  = parseNum(get(col.ventas_valor))
    if (unidades === 0 && valorUSD === 0) { omitidas++; continue }

    const valorGTQ  = Math.round(valorUSD * TASA_GTQ * 100) / 100
    const fecha     = `${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`

    rows.push([
      fecha,
      pais,
      cadena,
      null,                              // codigo_sucursal
      get(col.punto_venta) || null,      // nombre_sucursal
      get(col.categoria)   || null,
      get(col.subcategoria)|| null,
      null,                              // marca
      get(col.sku)         || '',
      cleanBarcode(get(col.codigo_barras)),
      get(col.descripcion) || null,
      unidades,
      valorUSD,
      valorGTQ,
    ])
  }

  console.log(`Filas LA TORRE: ${rows.length} | Omitidas: ${omitidas}`)

  const COLS = [
    'fecha','pais','cadena','codigo_sucursal','nombre_sucursal',
    'categoria','subcategoria','marca','sku','codigo_barras',
    'descripcion','ventas_unidades','ventas_valor','ventas_valor_gtq',
  ]

  const BATCH = 1000
  let insertados = 0

  for (let b = 0; b < rows.length; b += BATCH) {
    const batch = rows.slice(b, b + BATCH)
    const vals  = batch.map((_, i) => {
      const base = i * COLS.length
      return `(${COLS.map((_, j) => `$${base + j + 1}`).join(',')})`
    }).join(',')

    const flat = batch.flat()

    try {
      const result = await pool.query(
        `INSERT INTO fact_ventas_unisuper (${COLS.join(',')}) VALUES ${vals}`,
        flat
      )
      insertados += result.rowCount ?? 0
    } catch (batchErr) {
      console.error(`\nError en batch ${b}-${b + batch.length}:`, batchErr.message)
      console.error('Primer row:', JSON.stringify(batch[0]))
      throw batchErr
    }

    process.stdout.write(`\r  ${b + batch.length}/${rows.length} filas procesadas...`)
  }

  console.log(`\n✓ Insertadas: ${insertados}`)
  await pool.end()
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
