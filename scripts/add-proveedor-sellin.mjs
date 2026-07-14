// Migración: agrega columna `proveedor` a las 3 tablas de sell-in y la puebla.
//
// Reglas (según BL FOODS vs Licenciamiento):
//   - fact_sales_sellin (BL Foods base):
//       Quesos  → DFA
//       Leches  → Centrolac
//       (otras) → NULL  (por seguridad; no debería haber otras categorías)
//   - sellin_exito     (Licenciamiento Colombia)     → Centurión
//   - sellin_sensacion (Licenciamiento CR Sensación) → Sensación
//
// Uso:  node --env-file=.env.local scripts/add-proveedor-sellin.mjs

import pg from 'pg'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()

async function migrate(table, updateSql, updateParams = []) {
  console.log(`\n── ${table} ──`)
  await c.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS proveedor TEXT`)
  console.log('[schema] columna proveedor OK')
  const r = await c.query(updateSql, updateParams)
  console.log(`[update] ${r.rowCount} filas`)
  await c.query(`CREATE INDEX IF NOT EXISTS idx_${table}_proveedor ON ${table} (proveedor)`)
  const dist = await c.query(`SELECT proveedor, COUNT(*)::int filas FROM ${table} GROUP BY proveedor ORDER BY filas DESC`)
  console.table(dist.rows)
}

// 1) fact_sales_sellin — deriva de categoria
await migrate(
  'fact_sales_sellin',
  `UPDATE fact_sales_sellin SET proveedor = CASE
     WHEN categoria = 'Quesos' THEN 'DFA'
     WHEN categoria = 'Leches' THEN 'Centrolac'
     ELSE proveedor
   END
   WHERE (proveedor IS DISTINCT FROM CASE
     WHEN categoria = 'Quesos' THEN 'DFA'
     WHEN categoria = 'Leches' THEN 'Centrolac'
     ELSE proveedor
   END)`,
)

// 2) sellin_exito — todo Centurión
await migrate(
  'sellin_exito',
  `UPDATE sellin_exito SET proveedor = 'Centurión' WHERE proveedor IS DISTINCT FROM 'Centurión'`,
)

// 3) sellin_sensacion — todo Sensación
await migrate(
  'sellin_sensacion',
  `UPDATE sellin_sensacion SET proveedor = 'Sensación' WHERE proveedor IS DISTINCT FROM 'Sensación'`,
)

await c.end()
console.log('\n=== DONE ===')
