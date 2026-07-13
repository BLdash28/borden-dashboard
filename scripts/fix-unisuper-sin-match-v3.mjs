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

const r = await pool.query(`
  SELECT DISTINCT codigo_barras FROM fact_ventas_unisuper u
  WHERE NOT EXISTS (SELECT 1 FROM dim_producto d WHERE d.codigo_barras = u.codigo_barras)
`)
const mapping = []
for (const x of r.rows) {
  const dim = matchDim(x.codigo_barras)
  if (dim) mapping.push({ from: x.codigo_barras, dim })
}
console.log(`${mapping.length} códigos a resolver\n`)

let totalSumadas = 0, totalUpdate = 0, totalBorrar = 0
for (const m of mapping) {
  // a) Sumar a canónica si ya existe en (fecha, nombre_sucursal)
  const sumQ = await pool.query(`
    UPDATE fact_ventas_unisuper c
    SET ventas_unidades   = c.ventas_unidades + r.und,
        ventas_valor      = c.ventas_valor + r.usd,
        ventas_valor_gtq  = COALESCE(c.ventas_valor_gtq, 0) + COALESCE(r.gtq, 0)
    FROM (
      SELECT fecha, nombre_sucursal,
             SUM(ventas_unidades) AS und,
             SUM(ventas_valor) AS usd,
             SUM(ventas_valor_gtq) AS gtq
      FROM fact_ventas_unisuper
      WHERE codigo_barras = $1
      GROUP BY fecha, nombre_sucursal
    ) r
    WHERE c.fecha = r.fecha
      AND c.nombre_sucursal = r.nombre_sucursal
      AND c.codigo_barras = $2
  `, [m.from, m.dim.codigo_barras])

  // b) Para las (fecha, nombre_sucursal) donde NO existe canónica, UPDATE el crudo al canónico
  const updQ = await pool.query(`
    UPDATE fact_ventas_unisuper u
    SET codigo_barras = $1,
        sku           = $2,
        descripcion   = $3,
        categoria     = $4,
        subcategoria  = $5
    WHERE u.codigo_barras = $6
      AND NOT EXISTS (
        SELECT 1 FROM fact_ventas_unisuper c
        WHERE c.fecha = u.fecha
          AND c.nombre_sucursal = u.nombre_sucursal
          AND c.codigo_barras = $1
      )
  `, [m.dim.codigo_barras, m.dim.sku, m.dim.descripcion, m.dim.categoria, m.dim.subcategoria, m.from])

  // c) DELETE los crudos restantes (ya sumados a la canónica)
  const delQ = await pool.query(`DELETE FROM fact_ventas_unisuper WHERE codigo_barras = $1`, [m.from])

  totalSumadas += sumQ.rowCount
  totalUpdate  += updQ.rowCount
  totalBorrar  += delQ.rowCount
  console.log(`  ${m.from} → ${m.dim.codigo_barras}: sumado(${sumQ.rowCount}) renombrado(${updQ.rowCount}) borrado(${delQ.rowCount})`)
}

console.log(`\nTotal: sumado ${totalSumadas.toLocaleString()} · renombrado ${totalUpdate.toLocaleString()} · borrado ${totalBorrar.toLocaleString()}`)

console.log('\n🔄 Refrescando MVs…')
for (const mv of ['mv_sellout_mensual', 'mv_ventas_agg']) {
  const t0 = Date.now()
  try {
    await pool.query(`REFRESH MATERIALIZED VIEW ${mv}`)
    console.log(`   ✅ ${mv} ${((Date.now()-t0)/1000).toFixed(1)}s`)
  } catch (e) { console.log(`   ⚠️  ${mv}: ${e.message}`) }
}

const v = await pool.query(`SELECT COUNT(*) AS t, COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM dim_producto d WHERE d.codigo_barras = u.codigo_barras)) AS m FROM fact_ventas_unisuper u`)
console.log(`\nUnisuper: ${Number(v.rows[0].t).toLocaleString()} filas · con match dim: ${Number(v.rows[0].m).toLocaleString()}`)

const t2 = await pool.query(`SELECT ano, ROUND(SUM(ventas_valor)::numeric,0) AS usd FROM mv_sellout_mensual WHERE cliente='UNISUPER' GROUP BY ano ORDER BY ano`)
console.log('Unisuper por año:')
for (const x of t2.rows) console.log(`  ${x.ano}: $${Number(x.usd).toLocaleString()}`)

await pool.end()
