import pg from 'pg'
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
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

console.log('📥 Cargando dim_producto…')
const d = await pool.query(`SELECT codigo_barras, sku, descripcion, categoria, subcategoria FROM dim_producto WHERE codigo_barras IS NOT NULL`)
const dimMap = new Map()
for (const r of d.rows) dimMap.set(r.codigo_barras, r)
console.log(`   ${dimMap.size} productos`)

const UPC_OVERRIDE = {
  '5300003502':   '53000003502',
  '53000057253':  '5300005275',
  '53000071884':  '530000718800',
}
const matchDim = (raw) => {
  const stripped = raw.replace(/^0+/, '')
  if (UPC_OVERRIDE[stripped]) {
    const x = dimMap.get(UPC_OVERRIDE[stripped])
    if (x) return x
  }
  if (dimMap.has(stripped)) return dimMap.get(stripped)
  if (dimMap.has(raw)) return dimMap.get(raw)
  for (let dig = 0; dig <= 9; dig++) {
    if (dimMap.has(stripped + String(dig))) return dimMap.get(stripped + String(dig))
  }
  return null
}

// 1. Identificar códigos crudos → canónicos
const r = await pool.query(`
  SELECT DISTINCT codigo_barras
  FROM fact_ventas_unisuper u
  WHERE NOT EXISTS (SELECT 1 FROM dim_producto d WHERE d.codigo_barras = u.codigo_barras)
`)
console.log(`\n${r.rows.length} códigos crudos`)
const mapping = []  // { from, to: dimRow }
for (const x of r.rows) {
  const dim = matchDim(x.codigo_barras)
  if (dim) mapping.push({ from: x.codigo_barras, dim })
}
console.log(`Resolvibles: ${mapping.length}`)

// 2. Para cada uno: UPSERT canónico (sumando ventas) + DELETE crudo
console.log('\n🔄 Aplicando UPSERT + DELETE por código…')
let totMoved = 0, totSummed = 0
const client = await pool.connect()
try {
  for (const m of mapping) {
    await client.query('BEGIN')
    try {
      // UPSERT: insertar canónica, si ya existe sumar ventas
      const up = await client.query(`
        INSERT INTO fact_ventas_unisuper (
          fecha, pais, cadena, codigo_sucursal, nombre_sucursal,
          categoria, subcategoria, marca, sku, codigo_barras, descripcion,
          ventas_unidades, ventas_valor, ventas_valor_gtq, created_at
        )
        SELECT
          fecha, pais, cadena, codigo_sucursal, nombre_sucursal,
          $1, $2, marca, $3, $4, $5,
          ventas_unidades, ventas_valor, ventas_valor_gtq, created_at
        FROM fact_ventas_unisuper
        WHERE codigo_barras = $6
        ON CONFLICT (fecha, nombre_sucursal, codigo_barras) DO UPDATE
        SET ventas_unidades = fact_ventas_unisuper.ventas_unidades + EXCLUDED.ventas_unidades,
            ventas_valor    = fact_ventas_unisuper.ventas_valor + EXCLUDED.ventas_valor,
            ventas_valor_gtq = COALESCE(fact_ventas_unisuper.ventas_valor_gtq, 0) + COALESCE(EXCLUDED.ventas_valor_gtq, 0)
      `, [m.dim.categoria, m.dim.subcategoria, m.dim.sku, m.dim.codigo_barras, m.dim.descripcion, m.from])
      // DELETE crudo
      const del = await client.query(`DELETE FROM fact_ventas_unisuper WHERE codigo_barras = $1`, [m.from])
      await client.query('COMMIT')
      console.log(`   ${m.from} → ${m.dim.codigo_barras}: insert/upsert ${up.rowCount}, delete ${del.rowCount}`)
      totMoved += del.rowCount
    } catch (e) {
      await client.query('ROLLBACK')
      console.log(`   ⚠️  ${m.from}: ${e.message}`)
    }
  }
} finally {
  client.release()
}
console.log(`\nFilas migradas: ${totMoved.toLocaleString()}`)

// 3. Refresh MVs
console.log('\n🔄 Refrescando MVs…')
for (const mv of ['mv_sellout_mensual', 'mv_ventas_agg']) {
  const t0 = Date.now()
  try {
    await pool.query(`REFRESH MATERIALIZED VIEW ${mv}`)
    console.log(`   ✅ ${mv} ${((Date.now()-t0)/1000).toFixed(1)}s`)
  } catch (e) { console.log(`   ⚠️  ${mv}: ${e.message}`) }
}

// 4. Verificación
const v = await pool.query(`
  SELECT COUNT(*) AS total,
    COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM dim_producto d WHERE d.codigo_barras = u.codigo_barras)) AS con_match
  FROM fact_ventas_unisuper u
`)
console.log(`\n🔎 Unisuper final: ${Number(v.rows[0].total).toLocaleString()} filas · con match dim: ${Number(v.rows[0].con_match).toLocaleString()}`)

const t = await pool.query(`SELECT ano, ROUND(SUM(ventas_valor)::numeric, 0) AS usd FROM mv_sellout_mensual WHERE cliente='UNISUPER' GROUP BY ano ORDER BY ano`)
console.log('\nUnisuper por año:')
for (const x of t.rows) console.log(`  ${x.ano}: $${Number(x.usd).toLocaleString()}`)

await pool.end()
