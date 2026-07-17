/**
 * recargar-co-sellout-2026.mjs
 * Recarga fact_ventas_exito para pais=CO ano=2026 desde el archivo CORREGIDO.
 * Usa los valores pre-calculados (COP, USD, tasa_cambio) del Excel directamente.
 * Mantiene el año 2025 intacto.
 *
 * Uso: node --env-file=.env.local scripts/recargar-co-sellout-2026.mjs
 */
import pg from 'pg'
import XLSX from 'xlsx'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const PATH = 'C:/Users/IAN/Downloads/BASE_COLOMBIA_Sellout.xlsx'
const ANO_RELOAD = 2026

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 })

// ─── 1. Leer Excel ─────────────────────────────────────────────────────────
console.log(`📂 ${PATH.split('/').pop()}`)
const wb = XLSX.readFile(PATH)
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { defval: null })
console.log(`   ${rows.length.toLocaleString()} filas leídas`)

// Trim keys (el archivo tiene columnas con espacios: ' ventas_valorUSD ', ' venta_valorCOP ')
const num = (v) => {
  if (v == null || v === '') return 0
  const n = Number(v)
  return isFinite(n) ? n : 0
}
const s = (v) => (v == null ? null : String(v).trim())

// ─── 2. Filtrar + shape ────────────────────────────────────────────────────
const parsed = []
let skipAno = 0, skipZero = 0
for (const r of rows) {
  const ano = num(r.ano)
  const mes = num(r.mes)
  const dia = num(r.dia)
  if (ano !== ANO_RELOAD || !mes || !dia) { skipAno++; continue }

  const und = num(r.ventas_unidades)
  const usd = num(r[' ventas_valorUSD '] ?? r.ventas_valorUSD ?? r.ventas_valorusd)
  const cop = num(r[' venta_valorCOP '] ?? r.venta_valorCOP ?? r.venta_valorcop)
  const trm = num(r.tasa_cambio)

  if (und === 0 && cop === 0 && usd === 0) { skipZero++; continue }

  parsed.push({
    pais:            s(r.pais) ?? 'CO',
    cliente:         s(r.cliente) ?? 'GRUPO ÉXITO',
    cadena:          s(r.cadena),
    subcadena:       s(r.subcadena),
    formato:         s(r.subcadena),   // formato = subcanal (compat con schema existente)
    subformato:      s(r.subcadena),
    departamento:    s(r.departamento),
    ciudad:          s(r.ciudad),
    categoria:       s(r.categoria),
    subcategoria:    s(r.subcategoria),
    gln:             s(r.gln),
    punto_venta:     s(r.punto_venta),
    codigo_barras:   s(r.codigo_barras),
    sku:             s(r.sku),
    descripcion:     s(r.descripcion),
    ano, mes, dia,
    ventas_unidades: und,
    ventas_valorusd: usd,
    venta_valorcop:  cop,
    tasa_cambio:     trm || null,
  })
}
console.log(`   ✅ ${parsed.length.toLocaleString()} válidas · descartadas: ${skipAno} otro año, ${skipZero} ceros`)

const sumCOP = parsed.reduce((s, r) => s + r.venta_valorcop, 0)
const sumUSD = parsed.reduce((s, r) => s + r.ventas_valorusd, 0)
const sumUND = parsed.reduce((s, r) => s + r.ventas_unidades, 0)
console.log(`   💰 A insertar: ${sumUND.toLocaleString()} und · COP ${sumCOP.toLocaleString('es-CO', {maximumFractionDigits:2})} · USD ${sumUSD.toLocaleString('en-US', {maximumFractionDigits:2})}`)

// ─── 3. Detectar columnas disponibles en la tabla ──────────────────────────
const colRes = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='fact_ventas_exito'`)
const availCols = new Set(colRes.rows.map(r => r.column_name))
const hasDepto = availCols.has('departamento')
const hasCiudad = availCols.has('ciudad')
const hasGln    = availCols.has('gln')
const hasSubcadena = availCols.has('subcadena')
console.log(`   Columnas extra en tabla: depto=${hasDepto} ciudad=${hasCiudad} gln=${hasGln} subcadena=${hasSubcadena}`)

// ─── 4. DELETE 2026 CO ─────────────────────────────────────────────────────
console.log(`\n🗑️  Borrando fact_ventas_exito WHERE pais='CO' AND ano=${ANO_RELOAD}…`)
const del = await pool.query(`DELETE FROM fact_ventas_exito WHERE pais='CO' AND ano=$1`, [ANO_RELOAD])
console.log(`   ${del.rowCount.toLocaleString()} filas borradas`)

// ─── 5. INSERT batch ───────────────────────────────────────────────────────
console.log(`\n📥 Insertando ${parsed.length.toLocaleString()} filas…`)
const baseCols = ['pais','cliente','cadena','formato','subformato','categoria','subcategoria','punto_venta','codigo_barras','sku','descripcion','ano','mes','dia','ventas_unidades','ventas_valorusd','venta_valorcop','tasa_cambio']
const extraCols = [
  ...(hasDepto ? ['departamento'] : []),
  ...(hasCiudad ? ['ciudad'] : []),
  ...(hasGln ? ['gln'] : []),
  ...(hasSubcadena ? ['subcadena'] : []),
]
const allCols = [...baseCols, ...extraCols]
const rowValues = (r) => allCols.map(c => r[c])

// Tipos explícitos por columna — evita "inconsistent types deduced for parameter" cuando el file mezcla
// number/string (ej: sku a veces viene como 10318 y a veces como "10318")
const COL_TYPES = {
  pais: 'text', cliente: 'text', cadena: 'text', formato: 'text', subformato: 'text',
  categoria: 'text', subcategoria: 'text', punto_venta: 'text', codigo_barras: 'text',
  sku: 'text', descripcion: 'text',
  ano: 'int', mes: 'int', dia: 'int',
  ventas_unidades: 'numeric', ventas_valorusd: 'numeric', venta_valorcop: 'numeric', tasa_cambio: 'numeric',
  departamento: 'text', ciudad: 'text', gln: 'text', subcadena: 'text',
}

const BATCH = 800
for (let i = 0; i < parsed.length; i += BATCH) {
  const chunk = parsed.slice(i, i + BATCH)
  const params = []
  const vals = chunk.map((r) => {
    const placeholders = allCols.map((c) => {
      params.push(rowValues(r)[allCols.indexOf(c)])
      return `$${params.length}::${COL_TYPES[c]}`
    })
    return `(${placeholders.join(',')})`
  })
  await pool.query(
    `INSERT INTO fact_ventas_exito (${allCols.join(',')}) VALUES ${vals.join(',')}`,
    params,
  )
  process.stdout.write(`\r   ${(i + chunk.length).toLocaleString()}/${parsed.length.toLocaleString()}`)
}
console.log(`\n   ✅ insertado`)

// ─── 6. Refresh MVs ────────────────────────────────────────────────────────
console.log('\n🔄 Refrescando MVs…')
for (const mv of ['mv_exito_mensual', 'mv_sellout_mensual', 'mv_ventas_agg']) {
  const t0 = Date.now()
  try {
    await pool.query(`REFRESH MATERIALIZED VIEW ${mv}`)
    console.log(`   ✅ ${mv} (${((Date.now()-t0)/1000).toFixed(1)}s)`)
  } catch (e) { console.log(`   ⚠️  ${mv}: ${e.message}`) }
}

// ─── 7. Verificación ───────────────────────────────────────────────────────
const ver = await pool.query(`
  SELECT ano, mes, COUNT(*) n,
    ROUND(SUM(venta_valorcop)::numeric, 2) cop,
    ROUND(SUM(ventas_valorusd)::numeric, 2) usd
  FROM fact_ventas_exito
  WHERE pais='CO' AND ano=$1
  GROUP BY ano, mes ORDER BY ano, mes`, [ANO_RELOAD])
console.log('\n🔎 fact_ventas_exito CO 2026 por mes:')
let TN=0, TC=0, TV=0
for (const x of ver.rows) {
  console.log(`   ${x.ano}-${String(x.mes).padStart(2,'0')}: ${Number(x.n).toLocaleString().padStart(7)} · COP ${Number(x.cop).toLocaleString('es-CO')} · $${Number(x.usd).toLocaleString('en-US')}`)
  TN += Number(x.n); TC += Number(x.cop); TV += Number(x.usd)
}
console.log(`   TOT: ${TN.toLocaleString()} · COP ${TC.toLocaleString('es-CO')} · $${TV.toLocaleString('en-US')}`)
console.log(`\n   🎯 Target COP: 1.866.188.816,08`)
console.log(`   📊 Actual COP: ${TC.toLocaleString('es-CO')}`)
console.log(`   Δ:             ${(1866188816.08 - TC).toLocaleString('es-CO')}`)

await pool.end()
console.log('\n=== DONE ===')
