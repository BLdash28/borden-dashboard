/**
 * Recarga dim_producto desde la hoja "BASE MAESTRA PRODUCTOS"
 * de "BASE DE DATOS DASHBOARD.xlsx"
 * Uso: node scripts/import-dim-producto.mjs
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

const XLSX_PATH = join(__dirname, '../BASE DE DATOS DASHBOARD.xlsx')
const SHEET     = 'BASE MAESTRA PRODUCTOS'

async function main() {
  const wb   = XLSX.readFile(XLSX_PATH)
  const ws   = wb.Sheets[SHEET]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
  console.log(`Filas en Excel: ${rows.length}`)

  const productos = rows
    .filter(r => r['COD INTERNO'] || r['COD DE BARRAS'])
    .map(r => ({
      sku:          String(r['COD INTERNO'] || '').trim(),
      codigo_barras: String(r['COD DE BARRAS'] || '').trim(),
      descripcion:  String(r['DESCRIPCION'] || '').trim(),
      categoria:    String(r['categoria'] || '').trim(),
      subcategoria: String(r['SUBCATEGORIA'] || '').trim(),
    }))
    .filter(p => p.descripcion)

  console.log(`Productos válidos: ${productos.length}`)

  // Limpiar tabla
  await pool.query('DELETE FROM dim_producto')
  console.log('Tabla limpiada ✓')

  // Insertar
  let insertados = 0
  for (const p of productos) {
    await pool.query(
      `INSERT INTO dim_producto (sku, codigo_barras, descripcion, categoria, subcategoria, is_active)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [p.sku || null, p.codigo_barras || null, p.descripcion, p.categoria || null, p.subcategoria || null]
    )
    insertados++
  }

  console.log(`✓ Insertados: ${insertados} productos`)
  await pool.end()
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1) })
