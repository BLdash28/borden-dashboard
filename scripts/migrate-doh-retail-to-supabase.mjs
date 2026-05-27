// Migra inventario_walmart de Neon → Supabase
// Uso: node scripts/migrate-doh-retail-to-supabase.mjs

import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
// Cargar .env.local manualmente
try {
  const env = readFileSync(join(__dirname, '../.env.local'), 'utf8')
  for (const line of env.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch { /* no .env.local */ }

const connStr = (process.env.DATABASE_URL ?? '')
  .replace(/([?&])sslmode=[^&]*/g, '$1')
  .replace(/[?&]$/, '')

const pool = new pg.Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false } })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
  console.log('Leyendo inventario_walmart desde Neon...')
  const { rows } = await pool.query(
    `SELECT semana, pais, item_nbr, item, item_type, item_status,
            inventario, ordenes, transito, wharehouse,
            inv_cedi_cajas, inv_cedi_unds, ventas_periodo, dias_periodo
     FROM inventario_walmart
     ORDER BY semana, pais, item_nbr`
  )
  console.log(`${rows.length} filas leídas.`)

  if (rows.length === 0) { console.log('Nada que migrar.'); return }

  // Insertar en Supabase por batches
  const BATCH = 500
  let total = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await supabase
      .from('inventario_walmart')
      .upsert(batch, { onConflict: 'semana,pais,item_nbr' })
    if (error) { console.error('Error en batch:', error.message); process.exit(1) }
    total += batch.length
    console.log(`  ${total}/${rows.length}...`)
  }

  console.log(`✅ Migración completa: ${total} filas en Supabase.`)
  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
