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

// Datos corregidos para Leches
const LECHES = [
  { cb: '7452105970017', sku: '20201071', cat: 'Leches', sub: 'Entera',                       desc: 'Leche Entera 1000ml' },
  { cb: '7452105970024', sku: '20201072', cat: 'Leches', sub: 'Semidescremada',               desc: 'Leche Semidescremada 1000ml' },
  { cb: '7452105970031', sku: '20201073', cat: 'Leches', sub: 'Descremada',                   desc: 'Leche Descremada 1000ml' },
  { cb: '7452105970048', sku: '20201074', cat: 'Leches', sub: 'Descremada Deslactosada',      desc: 'Leche Descremada Deslactosada 1000ml' },
  { cb: '7452105970055', sku: '20201075', cat: 'Leches', sub: 'Semidescremada Deslactosada',  desc: 'Leche Semidescremada Deslactosada 1000ml' },
  { cb: '7452105970062', sku: '20201076', cat: 'Leches', sub: 'Entera',                       desc: '3 PACK Leche Entera 3000ml' },
  { cb: '7452105970079', sku: '20201077', cat: 'Leches', sub: 'Semidescremada',               desc: '3 PACK Leche Semidescremada 3000ml' },
  { cb: '7452105970086', sku: '20201078', cat: 'Leches', sub: 'Descremada',                   desc: '3 PACK Leche Descremada 3000ml' },
  { cb: '7452105970093', sku: '20201079', cat: 'Leches', sub: 'Descremada Deslactosada',      desc: '3 PACK Leche Descremada Deslactosada 3000ml' },
  { cb: '7452105970109', sku: '20201081', cat: 'Leches', sub: 'Semidescremada Deslactosada',  desc: '3 PACK Leche Semidescremada Deslactosada 3000ml' },
  { cb: '7452105970130', sku: '20201080', cat: 'Leches', sub: 'Descremada',                   desc: '12 PACK Leche Descremada 12000ml' },
  { cb: '7452105970147', sku: '20201083', cat: 'Leches', sub: 'Semidescremada',               desc: '12 PACK Leche Semidescremada 12000ml' },
  { cb: '7452105970314', sku: '20201082', cat: 'Leches', sub: 'Entera',                       desc: '12 PACK Leche Entera 12000ml' },
  { cb: '7452105970321', sku: '20201084', cat: 'Leches', sub: 'Semidescremada Deslactosada',  desc: '12 PACK Leche Semidescremada Deslactosada 12000ml' },
]

// 1. dim_producto
console.log('🔄 UPDATE dim_producto…')
let dim = 0
for (const r of LECHES) {
  const res = await pool.query(`
    UPDATE dim_producto
    SET sku = $1, descripcion = $2, categoria = $3, subcategoria = $4
    WHERE codigo_barras = $5
  `, [r.sku, r.desc, r.cat, r.sub, r.cb])
  if (res.rowCount === 0) {
    // Insert si no existe
    await pool.query(`
      INSERT INTO dim_producto (codigo_barras, sku, descripcion, categoria, subcategoria, is_active)
      VALUES ($1, $2, $3, $4, $5, true)
    `, [r.cb, r.sku, r.desc, r.cat, r.sub])
    console.log(`   +INSERT ${r.cb} → ${r.sku} ${r.desc}`)
  } else {
    dim += res.rowCount
  }
}
console.log(`   ${dim} dim_producto actualizados (+ ${LECHES.length - dim} insertados)`)

// 2. Propagar a fact_ventas_*
console.log('\n🔄 UPDATE fact_ventas_unisuper/walmart/selectos/exito…')
for (const t of ['fact_ventas_unisuper', 'fact_ventas_walmart', 'fact_ventas_selectos', 'fact_ventas_exito']) {
  let total = 0
  for (const r of LECHES) {
    const res = await pool.query(`
      UPDATE ${t}
      SET sku = $1, descripcion = $2, categoria = $3, subcategoria = $4
      WHERE codigo_barras = $5
    `, [r.sku, r.desc, r.cat, r.sub, r.cb])
    total += res.rowCount
  }
  console.log(`   ${t}: ${total.toLocaleString()} filas`)
}

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
console.log('\n🔎 mv_sellout_mensual cat="Leches":')
const r = await pool.query(`
  SELECT subcategoria, COUNT(*) AS n, ROUND(SUM(ventas_valor)::numeric, 0) AS usd
  FROM mv_sellout_mensual
  WHERE categoria = 'Leches'
  GROUP BY subcategoria ORDER BY n DESC
`)
let tot = 0
for (const x of r.rows) {
  console.log(`   ${String(x.subcategoria).padEnd(35)} ${Number(x.n).toLocaleString().padStart(7)} filas · $${Number(x.usd).toLocaleString()}`)
  tot += Number(x.usd)
}
console.log(`   TOTAL Leches: $${tot.toLocaleString()}`)

await pool.end()
