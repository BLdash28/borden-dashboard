/**
 * Import registros_sanitarios from Portafolio-Registros Sanitarios.xlsx
 * Reads the BASE sheet (row 8 = headers, rows 9+ = data)
 * Pivots each country block into individual rows
 *
 * Usage:
 *   node scripts/import-registros-sanitarios.mjs
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createClient } from '@supabase/supabase-js'
import { read, utils } from 'xlsx'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Cargar .env.local línea a línea (resistente a CRLF)
try {
  const env = readFileSync(join(__dirname, '../.env.local'), 'utf8')
  for (const raw of env.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 1) continue
    const key = line.slice(0, eq).trim()
    const val = line.slice(eq + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
} catch (e) { console.warn('No se pudo cargar .env.local:', e.message) }

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Country blocks starting at col index 5, each block is 6 columns wide
// Col layout per block: Alerta, N°Registro, Tramitador/Dueño, F.Estimada, Vencimiento, Días
const COUNTRY_BLOCKS = [
  { pais: 'GT', label: 'GUATEMALA/UNISUPER', startCol: 5  },
  { pais: 'GT', label: 'GUATEMALA/IDEAS',    startCol: 11 },
  { pais: 'SV', label: 'EL SALVADOR',        startCol: 17 },
  { pais: 'HN', label: 'HONDURAS',           startCol: 23 },
  { pais: 'NI', label: 'NICARAGUA',          startCol: 29 },
  { pais: 'CR', label: 'COSTA RICA',         startCol: 35 },
  { pais: 'CO', label: 'COLOMBIA',           startCol: 41 },
  // ECUADOR (47), PERU (53), VENEZUELA (59), GUYANA (65), SURINAM (71), Belize (77) — skipped
]

function toDateStr(val) {
  if (!val) return null
  if (val instanceof Date) return val.toISOString().split('T')[0]
  if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) return val.split('T')[0]
  return null
}

function splitTramitador(combined) {
  if (!combined) return { tramitador: null, dueno_registro: null }
  const parts = String(combined).split(' / ')
  return {
    tramitador:    parts[0]?.trim() || null,
    dueno_registro: parts.slice(1).join(' / ').trim() || null,
  }
}

async function main() {
  const filePath = process.argv[2] || 'C:/Users/IAN/Downloads/Portafolio-Registros Sanitarios.xlsx'
  console.log(`Reading: ${filePath}`)

  const buf = readFileSync(filePath)
  const wb  = read(buf, { cellDates: true })
  const ws  = wb.Sheets['BASE']

  if (!ws) {
    console.error('Sheet "BASE" not found')
    process.exit(1)
  }

  // Get raw array-of-arrays, starting from row 1
  const rows = utils.sheet_to_json(ws, { header: 1, defval: null })

  // Row index 7 = Excel row 8 = headers, data starts at index 8
  const dataRows = rows.slice(8).filter(r => r[4]) // skip empty rows (no description)

  const records = []

  for (const row of dataRows) {
    const portafolio   = row[0] ? String(row[0]).trim() : null
    const clasificacion = row[1] ? String(row[1]).trim() : null
    const cod_dfa      = row[2] != null ? String(row[2]).trim() : null
    const ean          = row[3] != null ? String(row[3]).trim() : null
    const descripcion  = row[4] ? String(row[4]).trim() : null

    if (!descripcion) continue

    for (const block of COUNTRY_BLOCKS) {
      const c = block.startCol
      const alerta           = row[c]
      const numero_registro  = row[c + 1]
      const tramitadorRaw    = row[c + 2]
      const fecha_estimada   = row[c + 3]
      const fecha_vencimiento = row[c + 4]

      // Only import rows with a real registration number and a vencimiento date
      if (!numero_registro || alerta === 'NEED / REGISTER') continue
      const fecha_venc = toDateStr(fecha_vencimiento)
      if (!fecha_venc) continue

      const { tramitador, dueno_registro } = splitTramitador(tramitadorRaw)
      // Fallback to '' so NOT NULL constraint is satisfied even when field is absent
      const tramitadorFinal    = tramitador    ?? ''
      const dueno_registroFinal = dueno_registro ?? ''

      records.push({
        pais:                    block.pais,
        portafolio,
        clasificacion,
        cod_dfa,
        ean,
        descripcion,
        numero_registro:         String(numero_registro).trim(),
        tramitador:    tramitadorFinal,
        dueno_registro: dueno_registroFinal,
        fecha_estimada_registro: toDateStr(fecha_estimada),
        fecha_vencimiento:       fecha_venc,
      })
    }
  }

  // Deduplicate by (pais, numero_registro) — keep last occurrence
  const seen = new Map()
  for (const r of records) seen.set(`${r.pais}|${r.numero_registro}`, r)
  const unique = [...seen.values()]

  console.log(`Parsed ${records.length} records → ${unique.length} unique after dedup`)
  if (unique.length === 0) {
    console.log('Nothing to import.')
    return
  }

  // Preview first 3
  console.log('\nSample records:')
  records.slice(0, 3).forEach(r => console.log(JSON.stringify(r)))

  // Upsert in batches of 50
  const BATCH = 50
  let inserted = 0
  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH)
    const { error } = await supabase
      .from('registros_sanitarios')
      .upsert(batch, { onConflict: 'pais,numero_registro', ignoreDuplicates: false })

    if (error) {
      console.error(`Error in batch ${i / BATCH + 1}:`, error.message)
    } else {
      inserted += batch.length
      console.log(`Imported batch ${i / BATCH + 1}: ${inserted}/${unique.length}`)
    }
  }

  console.log(`\nDone. ${inserted} records upserted.`)
}

main().catch(e => { console.error(e); process.exit(1) })
