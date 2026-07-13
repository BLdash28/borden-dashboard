/**
 * Carga SELECTOS_MAYSELLOUT26.xlsx → fact_ventas_selectos (Mayo 2026)
 * Uso: node scripts/import-selectos-mayo.mjs
 */
import pg   from 'pg'
import XLSX from 'xlsx'
import { readFileSync } from 'fs'
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
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

const XLSX_PATH = 'C:/Users/IAN/Downloads/SELECTOS_MAYSELLOUT26.xlsx'
const BATCH     = 500

console.log(`📂 Leyendo: ${XLSX_PATH}`)
const wb   = XLSX.readFile(XLSX_PATH)
const ws   = wb.Sheets[wb.SheetNames[0]]
const raw  = XLSX.utils.sheet_to_json(ws, { defval: null })
console.log(`   ${raw.length} filas encontradas`)

// Detect valor column (trimmed = 'venta valor_USD' or 'ventas_valor')
const sampleKeys = Object.keys(raw[0] || {})
const valorKey   = sampleKeys.find(k => /venta.*valor/i.test(k.trim()))
console.log(`   Columna valor: "${valorKey}"`)

const rows = raw.map(r => ({
  fecha:           new Date(r.ano, r.mes - 1, r.dia ?? 1),
  pais:            String(r.pais   || '').trim(),
  cadena:          String(r.cadena || '').trim() || 'SELECTOS',
  nombre_sucursal: r.punto_venta   != null ? String(r.punto_venta).trim()   : null,
  categoria:       r.categoria     != null ? String(r.categoria).trim()     : null,
  subcategoria:    r.subcategoria  != null ? String(r.subcategoria).trim()  : null,
  sku:             r.sku           != null ? String(r.sku)                  : null,
  codigo_barras:   r.codigo_barras != null ? String(r.codigo_barras)        : null,
  descripcion:     r.descripcion   != null ? String(r.descripcion).trim()   : null,
  ventas_unidades: r.ventas_unidades != null ? Number(r.ventas_unidades)    : 0,
  ventas_valor:    valorKey && r[valorKey] != null ? Number(r[valorKey])    : 0,
})).filter(r => r.codigo_barras && r.nombre_sucursal && !isNaN(r.fecha.getTime()))

console.log(`   ${rows.length} filas válidas`)

// Obtener combos pais|cadena para limpiar mayo 2026 antes de insertar
const combos = [...new Set(rows.map(r => `${r.pais}|${r.cadena}`))]
console.log(`Limpiando Mayo 2026 para: ${combos.join(', ')}`)
for (const combo of combos) {
  const [pais, cadena] = combo.split('|')
  const { rowCount } = await pool.query(
    `DELETE FROM fact_ventas_selectos
     WHERE pais = $1 AND cadena = $2
       AND EXTRACT(YEAR  FROM fecha) = 2026
       AND EXTRACT(MONTH FROM fecha) = 5`,
    [pais, cadena]
  )
  console.log(`  Eliminadas ${rowCount} filas previas de ${pais}/${cadena} May-2026`)
}

// Insert in batches
let inserted = 0
const COLS = ['fecha','pais','cadena','nombre_sucursal','categoria','subcategoria',
              'sku','codigo_barras','descripcion','ventas_unidades','ventas_valor','codigo_sucursal']

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
      null // codigo_sucursal
    )
  }

  const res = await pool.query(
    `INSERT INTO fact_ventas_selectos (${COLS.join(',')}) VALUES ${vals.join(',')}
     ON CONFLICT (fecha, nombre_sucursal, codigo_barras)
     DO UPDATE SET
       ventas_unidades = EXCLUDED.ventas_unidades,
       ventas_valor    = EXCLUDED.ventas_valor,
       categoria       = EXCLUDED.categoria,
       subcategoria    = EXCLUDED.subcategoria,
       descripcion     = EXCLUDED.descripcion,
       sku             = EXCLUDED.sku`,
    params
  )
  inserted += res.rowCount ?? batch.length
  process.stdout.write(`\r   Procesados: ${Math.min(i + BATCH, rows.length)} / ${rows.length}`)
}
console.log(`\n✅ Insertadas: ${inserted} filas en fact_ventas_selectos`)

// Verificar
const { rows: check } = await pool.query(`
  SELECT COUNT(*) AS filas, ROUND(SUM(ventas_valor)::numeric,2) AS total_usd, MAX(fecha) AS max_fecha
  FROM fact_ventas_selectos
  WHERE EXTRACT(YEAR FROM fecha) = 2026 AND EXTRACT(MONTH FROM fecha) = 5
`)
const c = check[0]
console.log(`\n📊 Mayo 2026 en fact_ventas_selectos:`)
console.log(`   Filas: ${c.filas}`)
console.log(`   Venta USD: $${Number(c.total_usd).toLocaleString('en-US',{minimumFractionDigits:2})}`)
console.log(`   Última fecha: ${String(c.max_fecha).slice(0,10)}`)

await pool.end()
console.log('\n🏁 Listo.')
