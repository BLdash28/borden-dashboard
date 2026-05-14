/**
 * Sube COMERCIAL_2025_2026_MARZO.csv directamente a fact_sales_sellout
 * Maneja conversión de moneda: GTQ → USD (/7.7), COP → USD (/4200)
 * Uso: node scripts/upload-sellout-csv.mjs
 */

import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Cargar .env.local línea a línea (resistente a CRLF)
try {
  const env = readFileSync(join(__dirname, '../.env.local'), 'utf8')
  for (const raw of env.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eqIdx = line.indexOf('=')
    if (eqIdx < 0) continue
    const key = line.slice(0, eqIdx).trim()
    const val = line.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    process.env[key] = val
  }
} catch (e) { console.warn('No se pudo cargar .env.local:', e.message) }

const DB_URL = process.env.DATABASE_URL
if (!DB_URL) { console.error('DATABASE_URL no encontrado en .env.local'); process.exit(1) }
console.log('Conectando a:', DB_URL.replace(/:([^@:]+)@/, ':***@'))

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const pool = new pg.Pool({ connectionString: DB_URL })

const CSV_PATH = join(__dirname, '../COMERCIAL_2025_2026_MARZO.csv')

const TASA_GTQ = 7.7    // 1 USD = 7.7 GTQ (fija)

// Tasas promedio COP/USD por mes — ajustar si se tienen datos más precisos
const TASAS_COP = {
  '2024-01': 3950, '2024-02': 3920, '2024-03': 3890,
  '2024-04': 3870, '2024-05': 3940, '2024-06': 4100,
  '2024-07': 4200, '2024-08': 4100, '2024-09': 4200,
  '2024-10': 4350, '2024-11': 4350, '2024-12': 4400,
  '2025-01': 4350, '2025-02': 4350, '2025-03': 4300,
  '2025-04': 4200, '2025-05': 4250, '2025-06': 4200,
  '2025-07': 4200, '2025-08': 4250, '2025-09': 4300,
  '2025-10': 4350, '2025-11': 4400, '2025-12': 4450,
  '2026-01': 4400, '2026-02': 4350, '2026-03': 4300,
}
const TASA_COP_DEFAULT = 4200 // fallback si el mes no está en la tabla

function parseNum(v) {
  if (!v) return 0
  const clean = String(v).replace(/USD|GTQ|COP/gi, '').replace(/,/g, '').trim()
  return parseFloat(clean) || 0
}

function detectarMoneda(v) {
  const s = String(v || '').trim().toUpperCase()
  if (s.startsWith('GTQ')) return 'GTQ'
  if (s.startsWith('COP')) return 'COP'
  return 'USD'
}

function parseIntVal(v) {
  return parseInt(String(v || '0').replace(/,/g, '').trim()) || 0
}

function cleanBarcode(v) {
  if (!v) return null
  // Notación científica de Excel (ej. "7.45211E+12") → inutilizable, se nullea
  if (/^\d+\.?\d*[Ee][+\-]\d+$/.test(v.trim())) return null
  return v.trim() || null
}

function convertirAUSD(valor, moneda, ano, mes) {
  const m = String(moneda || 'USD').trim().toUpperCase()
  if (m === 'GTQ') return valor / TASA_GTQ
  if (m === 'COP') {
    const key = `${ano}-${String(mes).padStart(2, '0')}`
    const tasa = TASAS_COP[key] ?? TASA_COP_DEFAULT
    return valor / tasa
  }
  return valor
}

async function main() {
  const text  = readFileSync(CSV_PATH, 'utf8')
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)

  console.log(`Total líneas: ${lines.length}`)

  const sep    = lines[0].includes(';') ? ';' : ','
  const header = lines[0].split(sep).map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, '').trim())

  const idx = keys => header.findIndex(h => keys.some(k => h === k || h.includes(k)))

  const col = {
    pais:            idx(['pais']),
    cliente:         idx(['cliente']),
    cadena:          idx(['cadena']),
    formato:         idx(['formato']),
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
    moneda:          idx(['moneda', 'currency', 'moneda_origen']),
  }

  console.log('Columnas detectadas:', col)
  if (col.moneda < 0) console.warn('⚠  Columna moneda NO encontrada — se asume USD para todas las filas')

  const rows = []
  let omitidas = 0
  const resumenMoneda = { USD: 0, GTQ: 0, COP: 0, OTRO: 0 }

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(sep)
    const get   = c => c >= 0 ? (cells[c] || '').trim() : ''

    const pais = get(col.pais)
    const ano  = parseIntVal(get(col.ano))
    const mes  = parseIntVal(get(col.mes))

    if (!pais || !ano || !mes) { omitidas++; continue }

    const unidades = parseNum(get(col.ventas_unidades))
    const valorRaw = parseNum(get(col.ventas_valor))
    if (unidades === 0 && valorRaw === 0) { omitidas++; continue }

    const rawValor    = get(col.ventas_valor)
    const moneda      = col.moneda >= 0 ? get(col.moneda).toUpperCase() : detectarMoneda(rawValor)
    const valorOrigen = parseNum(rawValor)
    const valorUSD    = Math.round(convertirAUSD(valorOrigen, moneda, ano, mes) * 100) / 100

    if (moneda === 'GTQ') resumenMoneda.GTQ++
    else if (moneda === 'COP') resumenMoneda.COP++
    else if (moneda === 'USD') resumenMoneda.USD++
    else resumenMoneda.OTRO++

    rows.push([
      pais,
      get(col.cliente)      || null,
      get(col.cadena)       || null,
      get(col.formato)      || null,
      get(col.categoria)    || null,
      get(col.subcategoria) || null,
      get(col.punto_venta)  || '',
      cleanBarcode(get(col.codigo_barras)),
      get(col.sku)          || '',
      get(col.descripcion)  || null,
      ano,
      mes,
      parseIntVal(get(col.dia)) || 1,
      unidades,
      valorUSD,
      'COMERCIAL_2025_2026_MARZO',
    ])
  }

  console.log(`Filas válidas: ${rows.length} | Omitidas: ${omitidas}`)
  console.log(`Monedas: USD=${resumenMoneda.USD} | GTQ=${resumenMoneda.GTQ} (÷${TASA_GTQ}) | COP=${resumenMoneda.COP} (tasa mensual) | Otro=${resumenMoneda.OTRO}`)

  const rowsDedup = rows
  console.log(`Filas a insertar: ${rowsDedup.length}`)

  const COLS = [
    'pais','cliente','cadena','formato','categoria','subcategoria',
    'punto_venta','codigo_barras','sku','descripcion',
    'ano','mes','dia','ventas_unidades','ventas_valor','archivo_origen',
  ]

  const BATCH = 1000
  let insertados = 0
  let actualizados = 0

  for (let b = 0; b < rowsDedup.length; b += BATCH) {
    const batch = rowsDedup.slice(b, b + BATCH)
    const vals  = batch.map((_, i) => {
      const base = i * COLS.length
      return `(${COLS.map((_, j) => `$${base + j + 1}`).join(',')})`
    }).join(',')

    const flat = batch.flat()

    try {
      const result = await pool.query(
        `INSERT INTO fact_sales_sellout (${COLS.join(',')})
         VALUES ${vals}
         ON CONFLICT ON CONSTRAINT uq_fact_sales_sellout_key DO UPDATE SET
           ventas_unidades = EXCLUDED.ventas_unidades,
           ventas_valor    = EXCLUDED.ventas_valor,
           categoria       = EXCLUDED.categoria,
           archivo_origen  = EXCLUDED.archivo_origen`,
        flat
      )
      insertados += result.rowCount ?? 0
    } catch (batchErr) {
      console.error(`\nError en batch ${b}-${b+batch.length}:`, batchErr.message)
      console.error('Primer row del batch:', JSON.stringify(batch[0]))
      throw batchErr
    }

    process.stdout.write(`\r  ${b + batch.length}/${rowsDedup.length} filas procesadas...`)
  }

  console.log(`\n✓ Insertadas/actualizadas: ${insertados}`)
  await pool.end()
}

main().catch(e => { console.error('ERROR:', e.message, e.code, e.detail); process.exit(1) })
