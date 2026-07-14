// Carga sellin_sensacion CR 2025-2026 desde VENTAS BORDEN A JUNIO 2026.xlsx
// Sensación es distribuidor CR que revende helados Borden a 5 cadenas:
//   NEGOC AM   → AUTOMERCADO
//   NEGOC AMPM → AM:PM
//   NEGOC CB   → COMPRE BIEN
//   NEGOC SMORA→ ALEMORA
//   NEGOC WM   → WALMART
//
// Uso: node --env-file=.env.local scripts/cargar-sellin-sensacion.mjs

import XLSX from 'xlsx'
import pg from 'pg'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const XLSX_PATH = 'C:/Users/IAN/Downloads/VENTAS BORDEN A JUNIO 2026.xlsx'

// Mes en español → número + año (el archivo dice "A Junio 2026", así que Nov/Dic son 2025)
const MES_MAP = {
  'Enero': 1, 'Febrero': 2, 'Marzo': 3, 'Abril': 4, 'Mayo': 5, 'Junio': 6,
  'Julio': 7, 'Agosto': 8, 'Septiembre': 9, 'Octubre': 10,
  'Noviembre': 11, 'Diciembre': 12,
}
function anoDeMes(nombreMes) {
  const n = MES_MAP[nombreMes]
  if (!n) return null
  return n >= 11 ? 2025 : 2026    // Nov/Dic → 2025; Ene-Jun → 2026
}

// NIVEL_PRECIO → cadena canónica
const CADENA_MAP = {
  'NEGOC AM':    'AUTOMERCADO',
  'NEGOC AMPM':  'AM:PM',
  'NEGOC CB':    'COMPRE BIEN',
  'NEGOC SMORA': 'ALEMORA',
  'NEGOC WM':    'WALMART',
}

// PRODUCTO (nombre en Excel) → EAN canónico (para join a dim_producto)
// Los 4 helados Borden 320gr comparten sku='1234' pero tienen EANs distintos.
const PRODUCTO_MAP = {
  'COOKIES AND CREAM':            '7441134017855',
  'EXPLOSION DE FRESA':           '7441134017824',
  'CHOCO BROWNIE CON ALMENDRAS':  '7441134017848',
  'VANILLA CARAMEL CRUNCH':       '7441134017831',
}
const DESC_MAP = {
  'COOKIES AND CREAM':            'Helado Cookie And Cream Borden 320gr',
  'EXPLOSION DE FRESA':           'Helado Explosion De Fresa Borden 320gr',
  'CHOCO BROWNIE CON ALMENDRAS':  'Helado Triple Choco Brownie Almendra Borden 320gr',
  'VANILLA CARAMEL CRUNCH':       'Helado Vainilla Caramel Cruch Borden 320gr',
}

// Tasa CRC → USD promedio mensual (BCCR — provisto por finanzas Borden).
const TASA_CRC = {
  '2025-11': 500.98, '2025-12': 496.00,
  '2026-01': 494.65, '2026-02': 486.10, '2026-03': 468.76,
  '2026-04': 459.39, '2026-05': 454.44, '2026-06': 455.91,
}
const TASA_DEFAULT = 470

const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()

// ─── 1. Crear tabla si no existe ─────────────────────────────────────────────
await c.query(`
  CREATE TABLE IF NOT EXISTS sellin_sensacion (
    id                BIGSERIAL PRIMARY KEY,
    pais              TEXT NOT NULL DEFAULT 'CR',
    distribuidor      TEXT NOT NULL DEFAULT 'SENSACIÓN',
    ano               INTEGER NOT NULL,
    mes               INTEGER NOT NULL,
    zona              TEXT,
    ruta              TEXT,
    cliente_codigo    TEXT,
    cliente_nombre    TEXT,
    cadena            TEXT,
    nivel_precio      TEXT,
    categoria_cliente TEXT,
    producto          TEXT,
    sku               TEXT,
    codigo_barras     TEXT,
    descripcion       TEXT,
    categoria         TEXT DEFAULT 'Helados',
    subcategoria      TEXT DEFAULT 'Helados 320gr',
    venta_con_iva_crc NUMERIC(14,2) DEFAULT 0,
    venta_neta_crc    NUMERIC(14,2) DEFAULT 0,
    venta_neta_usd    NUMERIC(14,4) DEFAULT 0,
    unidades          NUMERIC(12,2) DEFAULT 0,
    precio_crc        NUMERIC(14,4) DEFAULT 0,
    unid_fact         NUMERIC(12,2) DEFAULT 0,
    tasa_cambio       NUMERIC(10,2),
    archivo_origen    TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW()
  )
`)
await c.query('CREATE INDEX IF NOT EXISTS idx_sellin_sensacion_ano_mes ON sellin_sensacion (ano, mes)')
await c.query('CREATE INDEX IF NOT EXISTS idx_sellin_sensacion_cadena  ON sellin_sensacion (cadena)')
await c.query('CREATE INDEX IF NOT EXISTS idx_sellin_sensacion_ean     ON sellin_sensacion (codigo_barras)')
await c.query('CREATE INDEX IF NOT EXISTS idx_sellin_sensacion_cliente ON sellin_sensacion (cliente_codigo)')
console.log('[schema] tabla sellin_sensacion lista')

// ─── 2. Leer Excel ───────────────────────────────────────────────────────────
const wb = XLSX.readFile(XLSX_PATH)
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Ventas'], { defval: null })
console.log(`[Excel] leídas ${rows.length} filas`)
const archivo = XLSX_PATH.split(/[/\\]/).pop()

// ─── 3. Purgar todo (idempotente por reload) ────────────────────────────────
const del = await c.query(`DELETE FROM sellin_sensacion`)
console.log(`[purge] ${del.rowCount} filas previas borradas`)

// ─── 4. Insertar en batch ────────────────────────────────────────────────────
const BATCH = 300
let inserted = 0, skipped = 0, sinCadena = 0, sinProducto = 0
for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH)
  const values = []
  const params = []
  let p = 1
  for (const r of chunk) {
    const ano = anoDeMes(r['Mes'])
    const mes = MES_MAP[r['Mes']]
    if (!ano || !mes) { skipped++; continue }

    const nivel = (r['NIVEL_PRECIO'] ?? '').trim()
    const cadena = CADENA_MAP[nivel]
    if (!cadena) sinCadena++

    const prodNom = (r['PRODUCTO'] ?? '').trim().toUpperCase()
    const ean     = PRODUCTO_MAP[prodNom] ?? null
    const desc    = DESC_MAP[prodNom] ?? r['PRODUCTO'] ?? null
    if (!ean) sinProducto++

    const key = `${ano}-${String(mes).padStart(2,'0')}`
    const tasa = TASA_CRC[key] ?? TASA_DEFAULT

    const ventaNetaCrc = Number(r['VENTA NETA']) || 0
    const ventaIvaCrc  = Number(r['VENTA CON IVA']) || 0
    const uds          = Number(r['UNIDADES']) || 0
    const precio       = Number(r['PRECIO']) || 0
    const udsFact      = Number(r['UNID. FACT']) || 0
    const ventaNetaUsd = tasa > 0 ? ventaNetaCrc / tasa : 0

    values.push(`('CR','SENSACIÓN',$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`)
    params.push(
      ano, mes,
      r['ZONA'] || null,
      r['RUTA'] != null ? String(r['RUTA']).trim() : null,
      r['CLIENTE'] != null ? String(r['CLIENTE']).trim() : null,
      r['NOMBRE CLIENTE'] || null,
      cadena || null,
      nivel || null,
      r['NOMBRE CAT CLIENTE'] || null,
      r['PRODUCTO'] || null,
      '1234',           // sku canónico (todos los helados Borden 320gr comparten sku en dim_producto)
      ean,
      desc,
      ventaIvaCrc,
      ventaNetaCrc,
      ventaNetaUsd,
      uds,
      precio,
      udsFact,
      tasa,
      archivo,
    )
  }
  if (!values.length) continue
  await c.query(`
    INSERT INTO sellin_sensacion (
      pais, distribuidor, ano, mes, zona, ruta, cliente_codigo, cliente_nombre,
      cadena, nivel_precio, categoria_cliente, producto,
      sku, codigo_barras, descripcion,
      venta_con_iva_crc, venta_neta_crc, venta_neta_usd,
      unidades, precio_crc, unid_fact, tasa_cambio, archivo_origen
    ) VALUES ${values.join(',')}
  `, params)
  inserted += values.length
  process.stdout.write(`\r  → ${inserted}/${rows.length}`)
}
console.log(`\n[insert] ✅ ${inserted} filas (skipped=${skipped}, sin_cadena=${sinCadena}, sin_producto=${sinProducto})`)

// ─── 5. Verificación ─────────────────────────────────────────────────────────
const t = await c.query(`
  SELECT
    COUNT(*)::int filas,
    ROUND(SUM(venta_neta_crc)::numeric,0) neta_crc,
    ROUND(SUM(venta_neta_usd)::numeric,2) neta_usd,
    SUM(unidades)::int uds,
    COUNT(DISTINCT cliente_codigo) pdvs,
    COUNT(DISTINCT cadena)          cadenas,
    MIN(ano*100+mes) desde, MAX(ano*100+mes) hasta
  FROM sellin_sensacion
`)
console.log('\n[total]:', t.rows[0])

const cad = await c.query(`
  SELECT cadena, COUNT(*) filas,
    ROUND(SUM(venta_neta_usd)::numeric,2) neta_usd,
    SUM(unidades)::int uds
  FROM sellin_sensacion GROUP BY cadena ORDER BY neta_usd DESC
`)
console.log('\n[por cadena]:'); console.table(cad.rows)

await c.end()
console.log('=== DONE ===')
