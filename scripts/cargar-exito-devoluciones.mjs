// Carga devoluciones Grupo Éxito CO desde 'Bases y Cargue Borden Colombia.xlsx'
// pestaña DEVOLUCIONES → tabla devoluciones_exito.
//
// Uso:  node --env-file=.env.local scripts/cargar-exito-devoluciones.mjs [ruta.xlsx]
//
// Estructura del Excel (8 columnas):
//   AÑO | MES | DIA | GLN | EAN13 | VENTA UNDS | CAUSA DEVOLUCIÓN | DESTINACIÓN

import { readFileSync } from 'node:fs'
import XLSX from 'xlsx'
import pg from 'pg'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const XLSX_PATH = process.argv[2] ?? 'C:/Users/IAN/Downloads/Bases y Cargue Borden Colombia.xlsx'

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

// 1. Crear tabla si no existe
await client.query(`
  CREATE TABLE IF NOT EXISTS devoluciones_exito (
    id             BIGSERIAL PRIMARY KEY,
    pais           TEXT NOT NULL DEFAULT 'CO',
    cliente        TEXT NOT NULL DEFAULT 'GRUPO ÉXITO',
    ano            INTEGER NOT NULL,
    mes            INTEGER NOT NULL,
    dia            INTEGER NOT NULL,
    fecha          DATE GENERATED ALWAYS AS (make_date(ano, mes, dia)) STORED,
    gln            TEXT,
    punto_venta    TEXT,
    cadena         TEXT,
    subcadena      TEXT,
    departamento   TEXT,
    ciudad         TEXT,
    codigo_barras  TEXT,
    sku            TEXT,
    plu            TEXT,
    descripcion    TEXT,
    categoria      TEXT,
    unidades       NUMERIC,
    causa          TEXT,
    destinacion    TEXT,
    archivo_origen TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_devoluciones_exito_fecha    ON devoluciones_exito (ano, mes, dia);
  CREATE INDEX IF NOT EXISTS idx_devoluciones_exito_gln      ON devoluciones_exito (gln);
  CREATE INDEX IF NOT EXISTS idx_devoluciones_exito_sku      ON devoluciones_exito (sku);
  CREATE INDEX IF NOT EXISTS idx_devoluciones_exito_ean      ON devoluciones_exito (codigo_barras);
  CREATE INDEX IF NOT EXISTS idx_devoluciones_exito_causa    ON devoluciones_exito (causa);
`)
console.log('[OK] tabla devoluciones_exito lista')

// 2. Purga previa (permite reruns idempotentes)
const purge = await client.query(`DELETE FROM devoluciones_exito WHERE pais='CO' AND cliente='GRUPO ÉXITO'`)
console.log(`[OK] purgados ${purge.rowCount} registros previos`)

// 3. Leer Excel
const wb = XLSX.readFile(XLSX_PATH)
if (!wb.SheetNames.includes('DEVOLUCIONES')) {
  console.error('No se encontró pestaña DEVOLUCIONES en', XLSX_PATH)
  process.exit(1)
}
const rows = XLSX.utils.sheet_to_json(wb.Sheets['DEVOLUCIONES'], { defval: null })
console.log(`[OK] leídas ${rows.length} filas de ${XLSX_PATH}`)

// 4. Traer diccionarios: dim_producto_co y base pdv (cadena/geografía)
const prodR = await client.query(`SELECT ean13, sku, descripcion, categoria FROM dim_producto_co`)
const bySku       = new Map(prodR.rows.map(r => [String(r.sku), r]))
const byEan       = new Map(prodR.rows.map(r => [String(r.ean13), r]))
// dim_producto también, como fallback (usa codigo_barras en vez de ean13)
const prodGloR = await client.query(`SELECT codigo_barras AS ean13, sku, descripcion, categoria FROM dim_producto`)
for (const r of prodGloR.rows) {
  if (!bySku.has(String(r.sku)))   bySku.set(String(r.sku), r)
  if (!byEan.has(String(r.ean13))) byEan.set(String(r.ean13), r)
}
console.log(`[dim] ${bySku.size} SKUs · ${byEan.size} EAN13`)

// 5. Base PDV para enriquecer cadena/subcadena/departamento/ciudad
const pdvR = await client.query(`
  SELECT gln, punto_venta, cadena, subcadena, departamento, ciudad
  FROM inventario_exito
  WHERE pais='CO' AND cliente='GRUPO ÉXITO'
  GROUP BY gln, punto_venta, cadena, subcadena, departamento, ciudad
`)
const byGln = new Map()
for (const r of pdvR.rows) {
  if (!byGln.has(String(r.gln))) byGln.set(String(r.gln), r)
}
console.log(`[pdv] ${byGln.size} GLNs de referencia`)

// 6. Insertar en batches
const BATCH = 500
let inserted = 0, skipped = 0
const archivo = XLSX_PATH.split(/[/\\]/).pop() ?? 'excel'

for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH)
  const values = []
  const params = []
  let p = 1

  for (const r of chunk) {
    const ano = parseInt(r['AÑO'])
    const mes = parseInt(r['MES'])
    const dia = parseInt(r['DIA'])
    if (!ano || !mes || !dia) { skipped++; continue }
    const gln  = r['GLN']   != null ? String(r['GLN']).trim()   : null
    const ean  = r['EAN13'] != null ? String(r['EAN13']).trim() : null
    const uds  = parseFloat(r['VENTA UNDS'] ?? '0')
    const causa      = (r['CAUSA DEVOLUCIÓN'] ?? '').toString().trim() || null
    const destinacion= (r['DESTINACIÓN']      ?? '').toString().trim() || null

    // Match producto
    const prod = (ean && byEan.get(ean)) || null
    const sku  = prod?.sku ?? null
    const desc = prod?.descripcion ?? null
    const cat  = prod?.categoria ?? null

    // Match PDV
    const pdv  = gln ? byGln.get(gln) : null

    values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`)
    params.push(
      ano, mes, dia,
      gln,
      pdv?.punto_venta ?? null,
      pdv?.cadena ?? null,
      pdv?.subcadena ?? null,
      pdv?.departamento ?? null,
      pdv?.ciudad ?? null,
      ean, sku, sku, desc, cat,
      uds, causa, destinacion, archivo,
    )
  }
  if (values.length === 0) continue

  await client.query(`
    INSERT INTO devoluciones_exito
      (ano, mes, dia, gln, punto_venta, cadena, subcadena, departamento, ciudad,
       codigo_barras, sku, plu, descripcion, categoria, unidades, causa, destinacion, archivo_origen)
    VALUES ${values.join(',')}
  `, params)
  inserted += chunk.length - (skipped % chunk.length)
}
console.log(`[OK] insertadas ${inserted} filas (skipped ${skipped})`)

// 7. Resumen
const q = await client.query(`
  SELECT
    COUNT(*)::int                    AS total,
    SUM(unidades)::int               AS unds_totales,
    COUNT(DISTINCT gln)::int         AS pdvs,
    COUNT(DISTINCT sku)::int         AS skus,
    MIN(ano*10000+mes*100+dia)::text AS min_fecha,
    MAX(ano*10000+mes*100+dia)::text AS max_fecha
  FROM devoluciones_exito WHERE pais='CO' AND cliente='GRUPO ÉXITO'
`)
console.log('[resumen]', q.rows[0])

const causasR = await client.query(`
  SELECT causa, COUNT(*)::int AS n, SUM(unidades)::int AS uds
  FROM devoluciones_exito WHERE pais='CO' AND cliente='GRUPO ÉXITO'
  GROUP BY causa ORDER BY uds DESC
`)
console.log('[por causa]')
console.table(causasR.rows)

await client.end()
