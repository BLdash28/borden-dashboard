/**
 * Importa un archivo DCD descargado manualmente de RetailLink a inventario_cedi
 * Uso: node scripts/import-cedi-manual.mjs <ruta-archivo>
 */
import pg from 'pg'
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
    const eq = line.indexOf('=')
    if (eq < 0) continue
    process.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
  }
} catch (e) { console.warn('No se pudo cargar .env.local:', e.message) }

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

const archivo = process.argv[2]
if (!archivo) {
  console.error('Uso: node scripts/import-cedi-manual.mjs <ruta-archivo>')
  process.exit(1)
}

const hoy = new Date().toISOString().slice(0, 10)

async function main() {
  const raw = readFileSync(archivo)
  const wb  = XLSX.read(raw)
  const ws  = wb.Sheets[wb.SheetNames[0]]
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  // Buscar fila de headers (primera con ≥5 celdas no vacías)
  let headerIdx = -1
  for (let i = 0; i < data.length; i++) {
    if (data[i].filter(v => String(v).trim()).length >= 5) {
      headerIdx = i
      break
    }
  }

  if (headerIdx < 0) { console.error('No se encontró fila de headers'); process.exit(1) }

  const headers = data[headerIdx].map(h => String(h).trim())
  console.log('Headers:', headers)

  // Índices de columnas
  const idx = name => headers.findIndex(h => h.toLowerCase() === name.toLowerCase())

  const COL = {
    pais:            idx('Country Code'),
    upc:             idx('UPC'),
    item_nbr:        idx('Item Nbr'),
    descripcion:     idx('Signing Desc'),
    marca_id:        idx('Brand ID'),
    marca:           idx('Brand Desc'),
    proveedor_nbr:   idx('Vendor Nbr'),
    proveedor:       idx('Vendor Name'),
    inv_mano_cajas:  idx('Current WHSE On Hand Cases'),
    inv_orden_cajas: idx('WHSE On Order Cases'),
    wm_week:         idx('WM Week'),
    estado:          idx('Item Status'),
  }

  console.log('Mapeo de columnas:', COL)

  const filas = []
  for (let i = headerIdx + 1; i < data.length; i++) {
    const row = data[i]
    const pais    = String(row[COL.pais] || '').trim()
    const item_nbr = parseInt(row[COL.item_nbr]) || null
    if (!pais || !item_nbr) continue

    filas.push({
      fecha:           hoy,
      pais,
      upc:             String(row[COL.upc] || '').trim(),
      item_nbr,
      descripcion:     String(row[COL.descripcion] || '').trim(),
      marca_id:        String(row[COL.marca_id] || '').trim(),
      marca:           String(row[COL.marca] || '').trim(),
      proveedor_nbr:   String(row[COL.proveedor_nbr] || '').trim(),
      proveedor:       String(row[COL.proveedor] || '').trim(),
      inv_mano_cajas:  parseFloat(row[COL.inv_mano_cajas]) || 0,
      inv_orden_cajas: parseFloat(row[COL.inv_orden_cajas]) || 0,
      wm_week:         String(row[COL.wm_week] || '').trim(),
      estado:          String(row[COL.estado] || '').trim(),
    })
  }

  console.log(`\nTotal filas válidas: ${filas.length}`)

  // Resumen por país
  const porPais = {}
  for (const f of filas) {
    porPais[f.pais] = (porPais[f.pais] || 0) + 1
  }
  console.log('Por país:', porPais)

  if (filas.length === 0) { console.log('Nada que importar'); await pool.end(); return }

  // Upsert en inventario_cedi
  const COLS = ['fecha','pais','upc','item_nbr','descripcion','marca_id','marca',
                'proveedor_nbr','proveedor','inv_mano_cajas','inv_orden_cajas','wm_week','estado']

  const BATCH = 500
  let insertados = 0
  for (let b = 0; b < filas.length; b += BATCH) {
    const batch = filas.slice(b, b + BATCH)
    const vals  = batch.map((_, i) => {
      const base = i * COLS.length
      return `(${COLS.map((_, j) => `$${base + j + 1}`).join(',')})`
    }).join(',')
    const flat = batch.flatMap(f => COLS.map(c => f[c]))

    const res = await pool.query(
      `INSERT INTO inventario_cedi (${COLS.join(',')})
       VALUES ${vals}
       ON CONFLICT (fecha, pais, item_nbr) DO UPDATE SET
         upc             = EXCLUDED.upc,
         descripcion     = EXCLUDED.descripcion,
         inv_mano_cajas  = EXCLUDED.inv_mano_cajas,
         inv_orden_cajas = EXCLUDED.inv_orden_cajas,
         wm_week         = EXCLUDED.wm_week,
         estado          = EXCLUDED.estado`,
      flat
    )
    insertados += res.rowCount ?? 0
  }

  console.log(`\n✓ ${insertados} filas upserted en inventario_cedi (fecha=${hoy})`)
  await pool.end()
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
