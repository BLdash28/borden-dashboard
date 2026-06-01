/**
 * Carga hoja GT-UNISUPER de SELLOUT_ABRIL_WM2026.xlsx
 * a fact_ventas_unisuper (Abril 2026).
 * Elimina datos previos de Abril 2026 para los mismos pais+cadena antes de insertar.
 * Uso: node scripts/import-unisuper-abril.mjs
 */

import pg   from 'pg'
import XLSX from 'xlsx'
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
const XLSX_PATH = join(__dirname, '../SELLOUT_ABRIL_WM2026.xlsx')
const SHEET     = 'GT-UNISUPER'

function parseNum(v) {
  if (v === null || v === undefined || v === '') return 0
  return parseFloat(String(v).replace(/[$,\s]/g, '')) || 0
}

function cleanBarcode(v) {
  if (!v) return null
  if (/^\d+\.?\d*[Ee][+\-]\d+$/.test(String(v).trim())) return null
  return String(v).trim() || null
}

async function main() {
  const wb   = XLSX.readFile(XLSX_PATH)
  const ws   = wb.Sheets[SHEET]
  const data = XLSX.utils.sheet_to_json(ws, { defval: '' })
  console.log(`Filas en hoja ${SHEET}: ${data.length}`)

  // Detectar columna de valor (puede tener espacios)
  const sampleKeys = Object.keys(data[0] || {})
  const valorKey   = sampleKeys.find(k => k.trim().toLowerCase().includes('ventas_valor') || k.trim().toLowerCase().includes('valor'))
  console.log(`Columna valor detectada: "${valorKey}"`)

  const rows = []
  let omitidas = 0

  for (const r of data) {
    const ano  = parseInt(r.ano  || 0)
    const mes  = parseInt(r.mes  || 0)
    const dia  = parseInt(r.dia  || 1) || 1
    const pais = String(r.pais   || '').trim()

    if (!pais || !ano || !mes) { omitidas++; continue }

    const unidades = parseNum(r.ventas_unidades)
    const valorUSD = parseNum(r[valorKey])
    if (unidades === 0 && valorUSD === 0) { omitidas++; continue }

    const valorGTQ = Math.round(valorUSD * TASA_GTQ * 100) / 100
    const fecha    = `${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`

    rows.push([
      fecha,
      pais,
      String(r.cadena   || '').trim(),
      null,                                           // codigo_sucursal
      String(r.punto_venta || '').trim() || null,     // nombre_sucursal
      String(r.categoria   || '').trim() || null,
      String(r.subcategoria|| '').trim() || null,
      null,                                           // marca
      String(r.sku         || '').trim(),
      cleanBarcode(r.codigo_barras),
      String(r.descripcion || '').trim() || null,
      unidades,
      valorUSD,
      valorGTQ,
    ])
  }

  console.log(`Filas válidas: ${rows.length} | Omitidas: ${omitidas}`)

  // Obtener combinaciones únicas pais+cadena para limpiar solo esas
  const combos = [...new Set(rows.map(r => `${r[1]}|${r[2]}`))]
  console.log(`Limpiando Abril 2026 para: ${combos.join(', ')}`)

  for (const combo of combos) {
    const [pais, cadena] = combo.split('|')
    const { rowCount } = await pool.query(
      `DELETE FROM fact_ventas_unisuper
       WHERE pais = $1 AND cadena = $2
         AND EXTRACT(YEAR FROM fecha) = 2026
         AND EXTRACT(MONTH FROM fecha) = 4`,
      [pais, cadena]
    )
    console.log(`  Eliminadas ${rowCount} filas previas de ${pais}/${cadena} Abr-2026`)
  }

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

    try {
      const result = await pool.query(
        `INSERT INTO fact_ventas_unisuper (${COLS.join(',')}) VALUES ${vals}`,
        batch.flat()
      )
      insertados += result.rowCount ?? 0
    } catch (err) {
      console.error(`Error en batch ${b}:`, err.message)
      console.error('Primer row:', JSON.stringify(batch[0]))
      throw err
    }

    process.stdout.write(`\r  ${b + batch.length}/${rows.length} filas procesadas...`)
  }

  console.log(`\n✓ Insertadas: ${insertados} filas en fact_ventas_unisuper`)
  await pool.end()
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
