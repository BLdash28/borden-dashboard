// Crea tabla sell_in_metas para proyecciones editables
// Uso: node scripts/create-sell-in-metas.mjs

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
CREATE TABLE IF NOT EXISTS sell_in_metas (
  id          SERIAL PRIMARY KEY,
  ano         INTEGER NOT NULL,
  mes         INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  meta_acumulada NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (ano, mes)
);

INSERT INTO sell_in_metas (ano, mes, meta_acumulada)
SELECT 2026, m, 0
FROM generate_series(1,12) AS m
ON CONFLICT DO NOTHING;
`

const client = await pool.connect()
try {
  await client.query(sql)
  console.log('✅ Tabla sell_in_metas creada y filas 2026 inicializadas')
} finally {
  client.release()
  await pool.end()
}
