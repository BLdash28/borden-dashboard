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

// ── 1. Cargar dim ────────────────────────────────────────────────────────
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

// ── 2. Códigos sin match en fact_ventas_unisuper ─────────────────────────
const r = await pool.query(`
  SELECT codigo_barras, COUNT(*) AS n, MIN(descripcion) AS desc
  FROM fact_ventas_unisuper u
  WHERE NOT EXISTS (SELECT 1 FROM dim_producto d WHERE d.codigo_barras = u.codigo_barras)
  GROUP BY codigo_barras ORDER BY n DESC
`)
console.log(`\n${r.rows.length} códigos únicos sin match. Resolviendo…\n`)

const updates = []
const unresolved = []
for (const x of r.rows) {
  const dim = matchDim(x.codigo_barras)
  if (dim) {
    updates.push({ from: x.codigo_barras, to: dim, n: Number(x.n) })
  } else {
    unresolved.push({ cb: x.codigo_barras, n: Number(x.n), desc: x.desc })
  }
}

console.log(`Resolvibles: ${updates.length} · sin solución: ${unresolved.length}`)
if (unresolved.length) {
  console.log('\nSin resolver:')
  for (const u of unresolved.slice(0, 10)) console.log(`  cb=${u.cb} n=${u.n} ${u.desc?.slice(0,50)}`)
}

// ── 3. Aplicar UPDATE batch ──────────────────────────────────────────────
console.log('\n🔄 Aplicando UPDATEs…')
let totalUpdated = 0
for (const u of updates) {
  const res = await pool.query(`
    UPDATE fact_ventas_unisuper
    SET codigo_barras = $1,
        sku = $2,
        descripcion = $3,
        categoria = $4,
        subcategoria = $5
    WHERE codigo_barras = $6
  `, [u.to.codigo_barras, u.to.sku, u.to.descripcion, u.to.categoria, u.to.subcategoria, u.from])
  totalUpdated += res.rowCount
  if (res.rowCount > 0) console.log(`   ${u.from} → ${u.to.codigo_barras} (${u.to.sku} - ${u.to.descripcion?.slice(0,35)}): ${res.rowCount}`)
}
console.log(`\nTotal filas actualizadas: ${totalUpdated.toLocaleString()}`)

// ── 4. Refresh MVs ───────────────────────────────────────────────────────
console.log('\n🔄 Refrescando MVs…')
for (const mv of ['mv_sellout_mensual', 'mv_ventas_agg']) {
  const t0 = Date.now()
  try {
    await pool.query(`REFRESH MATERIALIZED VIEW ${mv}`)
    console.log(`   ✅ ${mv} ${((Date.now()-t0)/1000).toFixed(1)}s`)
  } catch (e) { console.log(`   ⚠️  ${mv}: ${e.message}`) }
}

// ── 5. Verificar ─────────────────────────────────────────────────────────
console.log('\n🔎 Verificación final:')
const v = await pool.query(`
  SELECT COUNT(*) AS total,
    COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM dim_producto d WHERE d.codigo_barras = u.codigo_barras)) AS con_match,
    COUNT(DISTINCT codigo_barras) AS u
  FROM fact_ventas_unisuper u
`)
const vx = v.rows[0]
console.log(`  fact_ventas_unisuper: ${Number(vx.total).toLocaleString()} filas · con match: ${Number(vx.con_match).toLocaleString()} · códigos únicos: ${vx.u}`)

await pool.end()
