// Crea tablas pedidos_walmart y pedidos_walmart_lineas
// Uso: node scripts/create-pedidos-walmart.mjs

import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const env = readFileSync(join(__dirname, '../.env.local'), 'utf8')
  for (const line of env.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch {}

const { Pool } = pg
const connStr = (process.env.DATABASE_URL ?? '').replace('?sslmode=require', '?sslmode=require&uselibpqcompat=true')
const pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false } })

const sql = `
CREATE TABLE IF NOT EXISTS pedidos_walmart (
  id                  SERIAL PRIMARY KEY,
  po_number           TEXT NOT NULL,
  po_date             DATE,
  ship_date           DATE,
  cancel_date         DATE,
  vendor              TEXT,
  country             TEXT,
  location            TEXT,
  status_grid         TEXT,
  tipo                TEXT,
  currency            TEXT,
  department          TEXT,
  order_type          TEXT,
  promotional_event   TEXT,
  payment_terms       TEXT,
  fob                 TEXT,
  carrier             TEXT,
  ship_to             TEXT,
  ship_to_gln         TEXT,
  bill_to             TEXT,
  supplier_name       TEXT,
  supplier_number     TEXT,
  order_instructions  TEXT,
  total_amount        NUMERIC(14,2),
  total_line_items    INTEGER,
  total_units_ordered INTEGER,
  scraped_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (po_number)
);

CREATE TABLE IF NOT EXISTS pedidos_walmart_lineas (
  id               SERIAL PRIMARY KEY,
  po_number        TEXT NOT NULL REFERENCES pedidos_walmart(po_number) ON DELETE CASCADE,
  linea            INTEGER,
  item             TEXT,
  gtin             TEXT,
  supplier_stock   TEXT,
  color            TEXT,
  size_desc        TEXT,
  quantity_ordered INTEGER,
  uom              TEXT,
  pack             TEXT,
  cost             NUMERIC(12,4),
  extended_cost    NUMERIC(14,2),
  UNIQUE (po_number, linea)
);

CREATE INDEX IF NOT EXISTS idx_pedidos_walmart_country  ON pedidos_walmart(country);
CREATE INDEX IF NOT EXISTS idx_pedidos_walmart_po_date  ON pedidos_walmart(po_date);
CREATE INDEX IF NOT EXISTS idx_pedidos_lineas_po_number ON pedidos_walmart_lineas(po_number);
`

const client = await pool.connect()
try {
  await client.query(sql)
  console.log('✅ Tablas pedidos_walmart y pedidos_walmart_lineas creadas')
} finally {
  client.release()
  await pool.end()
}
