// Carga la matriz modular Walmart CR desde skuxpdvcr.xlsx
// - Hoja "TIENDAS" → tabla `matriz_modular_walmart` (SKU × TIENDA planificado)
// - Hoja "BL FOODS" → tabla `stock_cedi_walmart` (stock CEDI + DOH por SKU)
//
// Uso:
//   node --env-file=.env.local scripts/cargar-matriz-modular-walmart-cr.mjs [ruta.xlsx]

import XLSX from 'xlsx'
import pg from 'pg'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const XLSX_PATH = process.argv[2] ?? 'C:/Users/IAN/Downloads/skuxpdvcr.xlsx'
const PAIS      = 'CR'

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

// ── 1. Crear tablas ──────────────────────────────────────────────────────────
await client.query(`
  CREATE TABLE IF NOT EXISTS matriz_modular_walmart (
    id            BIGSERIAL PRIMARY KEY,
    pais          TEXT NOT NULL,
    item          TEXT NOT NULL,
    descripcion   TEXT,
    mbm           TEXT,           -- M / B / etc — clasificación modular
    vnpk_qty      INTEGER,        -- unidades por caja
    tienda        TEXT NOT NULL,  -- nro tienda (store_nbr)
    nombre        TEXT,           -- nombre PDV
    formato       TEXT,           -- BODEGA / SUPERMARKET / HYPERMARKET
    ciudad        TEXT,
    archivo_origen TEXT,
    fecha_carga    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (pais, item, tienda)
  );

  CREATE INDEX IF NOT EXISTS idx_matriz_modular_walmart_pais_item ON matriz_modular_walmart (pais, item);
  CREATE INDEX IF NOT EXISTS idx_matriz_modular_walmart_tienda    ON matriz_modular_walmart (tienda);
  CREATE INDEX IF NOT EXISTS idx_matriz_modular_walmart_formato   ON matriz_modular_walmart (formato);
`)
console.log('[OK] tabla matriz_modular_walmart lista')

await client.query(`
  CREATE TABLE IF NOT EXISTS stock_cedi_walmart (
    id                 BIGSERIAL PRIMARY KEY,
    pais               TEXT NOT NULL,
    vendor_stock       TEXT,
    item               TEXT NOT NULL,
    descripcion        TEXT,
    uxc                INTEGER,
    depto              TEXT,
    oh_cedi            NUMERIC,
    venta_cjas_semanal NUMERIC,
    doh_cedi           NUMERIC,
    trans              NUMERIC,
    doh_trans          NUMERIC,
    doh_total          NUMERIC,
    comentario         TEXT,
    tiendas            INTEGER,
    fecha_snapshot     DATE,
    archivo_origen     TEXT,
    fecha_carga        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_stock_cedi_walmart_pais_item ON stock_cedi_walmart (pais, item);
  CREATE INDEX IF NOT EXISTS idx_stock_cedi_walmart_snapshot  ON stock_cedi_walmart (fecha_snapshot);
`)
console.log('[OK] tabla stock_cedi_walmart lista')

// ── 2. Leer Excel ────────────────────────────────────────────────────────────
const wb = XLSX.readFile(XLSX_PATH)
const archivo = XLSX_PATH.split(/[/\\]/).pop() ?? 'excel'

// ── 3. Cargar hoja TIENDAS (matriz modular) ──────────────────────────────────
{
  const purge = await client.query(
    `DELETE FROM matriz_modular_walmart WHERE pais=$1`, [PAIS],
  )
  console.log(`[OK] purgadas ${purge.rowCount} filas previas de matriz CR`)

  const rows = XLSX.utils.sheet_to_json(wb.Sheets['TIENDAS'], { defval: null })
  console.log(`[TIENDAS] leídas ${rows.length} filas`)

  const BATCH = 300
  let inserted = 0, skipped = 0

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const values = []
    const params = []
    let p = 1

    for (const r of chunk) {
      const item    = r['ITEM']       != null ? String(r['ITEM']).trim()    : null
      const tienda  = r['TIENDA']     != null ? String(r['TIENDA']).trim()  : null
      if (!item || !tienda) { skipped++; continue }

      const desc    = r['DESCRIPCION'] ?? null
      const mbm     = r['MBM']         ?? null
      const vnpkQty = r['VNPK_QTY']    != null ? Number(r['VNPK_QTY']) : null
      const nombre  = r['NOMBRE']      ?? null
      const formato = r['FORMATO']     ?? null
      const ciudad  = r['CIUDAD']      ?? null

      values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`)
      params.push(PAIS, item, desc, mbm, vnpkQty, tienda, nombre, formato, ciudad, archivo)
    }
    if (!values.length) continue

    await client.query(`
      INSERT INTO matriz_modular_walmart
        (pais, item, descripcion, mbm, vnpk_qty, tienda, nombre, formato, ciudad, archivo_origen)
      VALUES ${values.join(',')}
      ON CONFLICT (pais, item, tienda) DO UPDATE SET
        descripcion    = EXCLUDED.descripcion,
        mbm            = EXCLUDED.mbm,
        vnpk_qty       = EXCLUDED.vnpk_qty,
        nombre         = EXCLUDED.nombre,
        formato        = EXCLUDED.formato,
        ciudad         = EXCLUDED.ciudad,
        archivo_origen = EXCLUDED.archivo_origen,
        fecha_carga    = NOW()
    `, params)
    inserted += values.length
  }
  console.log(`[OK] insertadas ${inserted} filas de matriz (skipped ${skipped})`)
}

// ── 4. Cargar hoja BL FOODS (stock CEDI) ─────────────────────────────────────
{
  const purge = await client.query(
    `DELETE FROM stock_cedi_walmart WHERE pais=$1 AND fecha_snapshot IS NULL`, [PAIS],
  )
  console.log(`[OK] purgadas ${purge.rowCount} filas previas de stock CEDI CR (sin snapshot)`)

  const rows = XLSX.utils.sheet_to_json(wb.Sheets['BL FOODS'], { defval: null })
  console.log(`[BL FOODS] leídas ${rows.length} filas`)

  const values = []
  const params = []
  let p = 1
  let inserted = 0

  for (const r of rows) {
    const item = r['ITEM'] != null ? String(r['ITEM']).trim() : null
    if (!item) continue

    const vendorStock = r['Vendor stock'] != null ? String(r['Vendor stock']).trim() : null
    const desc        = r['DESC'] ?? null
    const uxc         = r['UXC']  != null ? Number(r['UXC'])  : null
    const depto       = r['DEPTO'] != null ? String(r['DEPTO']).trim() : null
    const ohCedi      = r['OH_CEDI']            != null ? Number(r['OH_CEDI'])            : null
    const vtaSem      = r['VENTA CJAS SEMANAL'] != null ? Number(r['VENTA CJAS SEMANAL']) : null
    const dohCedi     = r['DOH_CEDI']           != null ? Number(r['DOH_CEDI'])           : null
    const trans       = r['TRANS']              != null ? Number(r['TRANS'])              : null
    const dohTrans    = r['DOH TRANS']          != null ? Number(r['DOH TRANS'])          : null
    const dohTotal    = r['DOH TOTAL']          != null ? Number(r['DOH TOTAL'])          : null
    const comentario  = r['COMENTARIO'] ?? null
    const tiendas     = r['TIENDAS']    != null ? Number(r['TIENDAS']) : null

    values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`)
    params.push(PAIS, vendorStock, item, desc, uxc, depto, ohCedi, vtaSem, dohCedi, trans, dohTrans, dohTotal, comentario, tiendas, archivo)
    inserted++
  }
  if (values.length) {
    await client.query(`
      INSERT INTO stock_cedi_walmart
        (pais, vendor_stock, item, descripcion, uxc, depto, oh_cedi, venta_cjas_semanal,
         doh_cedi, trans, doh_trans, doh_total, comentario, tiendas, archivo_origen)
      VALUES ${values.join(',')}
    `, params)
  }
  console.log(`[OK] insertadas ${inserted} filas de stock CEDI`)
}

// ── 5. Resumen ──────────────────────────────────────────────────────────────
const rMatriz = await client.query(`
  SELECT pais,
         COUNT(*)::int        AS filas,
         COUNT(DISTINCT item)::int AS skus,
         COUNT(DISTINCT tienda)::int AS tiendas,
         COUNT(DISTINCT formato)::int AS formatos,
         COUNT(DISTINCT ciudad)::int  AS ciudades
    FROM matriz_modular_walmart WHERE pais=$1 GROUP BY pais
`, [PAIS])
console.log('\n[Matriz modular CR]')
console.table(rMatriz.rows)

const rCedi = await client.query(`
  SELECT pais,
         COUNT(*)::int filas,
         COUNT(DISTINCT item)::int skus,
         SUM(oh_cedi)::numeric(20,0) oh_cedi_total,
         AVG(doh_total)::numeric(10,1) doh_promedio,
         COUNT(*) FILTER (WHERE comentario ILIKE '%descatalog%') descatalogados
    FROM stock_cedi_walmart WHERE pais=$1 GROUP BY pais
`, [PAIS])
console.log('\n[Stock CEDI CR]')
console.table(rCedi.rows)

// Cobertura estimada por formato
const rFormato = await client.query(`
  SELECT formato,
         COUNT(DISTINCT tienda)::int tiendas,
         COUNT(DISTINCT item)::int   skus,
         COUNT(*)::int               combos
    FROM matriz_modular_walmart WHERE pais=$1 AND formato IS NOT NULL
    GROUP BY formato ORDER BY combos DESC
`, [PAIS])
console.log('\n[Matriz por formato]')
console.table(rFormato.rows)

await client.end()
