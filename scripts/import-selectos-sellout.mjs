/**
 * Importa datos de sellout Selectos desde XLSX → fact_ventas_selectos
 * y refresca mv_sellout_mensual.
 *
 * Uso: node scripts/import-selectos-sellout.mjs [ruta-del-archivo.xlsx]
 * Ejemplo: node scripts/import-selectos-sellout.mjs "C:/Users/IAN/Downloads/SELECTOS_SELLOUT_25MAY2026.xlsx"
 */

import pg from 'pg'
import { readFileSync } from 'fs'
import { readFile } from 'fs/promises'
import * as XLSX from 'xlsx'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

// ── Config ──────────────────────────────────────────────────────────────────
const XLSX_PATH = process.argv[2] ?? 'C:/Users/IAN/Downloads/SELECTOS_SELLOUT_25MAY2026.xlsx'
const BATCH     = 500

// ── DB ───────────────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(path.join(__dirname, '../.env.local'), 'utf8')
    .split(/\r?\n/)
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const { Pool } = pg
const pool = new Pool({ connectionString: env.DATABASE_URL })

// ── Read XLSX ────────────────────────────────────────────────────────────────
console.log(`📂 Leyendo: ${XLSX_PATH}`)
const buf = await readFile(XLSX_PATH)
const wb  = XLSX.read(buf, { type: 'buffer' })
const ws  = wb.Sheets[wb.SheetNames[0]]
const raw = XLSX.utils.sheet_to_json(ws, { defval: null })

console.log(`   ${raw.length} filas encontradas`)

// ── Map rows ─────────────────────────────────────────────────────────────────
const rows = raw.map(r => ({
  fecha:           new Date(r.ano, r.mes - 1, r.dia),
  pais:            r.pais            ?? 'SV',
  cadena:          r.cadena          ?? 'SELECTOS',
  codigo_sucursal: null,
  nombre_sucursal: r.punto_venta     ?? null,
  categoria:       r.categoria       ?? null,
  subcategoria:    r.subcategoria    ?? null,
  marca:           null,
  sku:             r.sku             != null ? String(r.sku)           : null,
  codigo_barras:   r.codigo_barras   != null ? String(r.codigo_barras) : null,
  descripcion:     r.descripcion     ?? null,
  ventas_unidades: r.ventas_unidades != null ? Number(r.ventas_unidades) : 0,
  ventas_valor:    (() => { const k = Object.keys(r).find(k => k.trim() === 'ventas_valor'); return k ? Number(r[k]) : 0 })(),
})).filter(r => r.codigo_barras && r.nombre_sucursal && r.fecha)

console.log(`   ${rows.length} filas válidas para insertar`)

// ── Upsert in batches ─────────────────────────────────────────────────────────
let inserted = 0, updated = 0

for (let i = 0; i < rows.length; i += BATCH) {
  const batch  = rows.slice(i, i + BATCH)
  const vals   = []
  const params = []
  let   pi     = 1

  for (const r of batch) {
    vals.push(`($${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++},$${pi++})`)
    params.push(
      r.fecha, r.pais, r.cadena, r.nombre_sucursal,
      r.categoria, r.subcategoria,
      r.sku, r.codigo_barras, r.descripcion,
      r.ventas_unidades, r.ventas_valor,
      r.codigo_sucursal,
    )
  }

  const sql = `
    INSERT INTO fact_ventas_selectos
      (fecha, pais, cadena, nombre_sucursal, categoria, subcategoria,
       sku, codigo_barras, descripcion, ventas_unidades, ventas_valor, codigo_sucursal)
    VALUES ${vals.join(',')}
    ON CONFLICT (fecha, nombre_sucursal, codigo_barras)
    DO UPDATE SET
      ventas_unidades = EXCLUDED.ventas_unidades,
      ventas_valor    = EXCLUDED.ventas_valor,
      categoria       = EXCLUDED.categoria,
      subcategoria    = EXCLUDED.subcategoria,
      descripcion     = EXCLUDED.descripcion,
      sku             = EXCLUDED.sku
  `

  const res = await pool.query(sql, params)
  inserted += res.rowCount ?? batch.length
  process.stdout.write(`\r   Procesados: ${Math.min(i + BATCH, rows.length)} / ${rows.length}`)
}
console.log('\n✅ Filas upserted:', inserted)

// ── Refresh MV ───────────────────────────────────────────────────────────────
console.log('🔄 Refrescando mv_sellout_mensual...')
await pool.query('REFRESH MATERIALIZED VIEW mv_sellout_mensual')
console.log('✅ mv_sellout_mensual actualizado')

// ── Verify ───────────────────────────────────────────────────────────────────
const { rows: check } = await pool.query(`
  SELECT COUNT(*) AS filas, SUM(ventas_valor) AS total_valor, MAX(fecha) AS max_fecha
  FROM fact_ventas_selectos
  WHERE fecha >= '2026-05-01' AND fecha < '2026-06-01'
`)
if (check.length) {
  const row = check[0]
  console.log(`\n📊 May 2026 en fact_ventas_selectos:`)
  console.log(`   Filas: ${row.filas}`)
  console.log(`   Venta total: $${Number(row.total_valor).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
  console.log(`   Última fecha: ${String(row.max_fecha).slice(0, 10)}`)
} else {
  console.log('⚠️  No se encontraron filas para mayo 2026 tras la carga')
}

await pool.end()
console.log('\n🏁 Listo.')
