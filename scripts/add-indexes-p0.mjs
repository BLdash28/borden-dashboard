import pg from 'pg'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const { Pool } = pg
const pool = new Pool({
  connectionString: 'postgresql://postgres.ntkmokdmpslqbkkqdnxq:Xvz4zjU2EElSr0Pj@aws-1-us-east-2.pooler.supabase.com:6543/postgres?sslmode=require',
  ssl: { rejectUnauthorized: false }
})

/**
 * Índices P0 identificados por audit de performance.
 *
 * Motivación:
 *   - fact_ventas_walmart hace queries `WHERE (sku = $1 OR codigo_barras = $2)`
 *     con OR — solo teníamos índice en sku, forzando seq scan por codigo_barras.
 *   - fact_inventario_walmart_pdv no tenía ningún índice tracked → cobertura
 *     e inventario endpoints hacían full scan de millones de filas.
 *   - Composites (pais, X) son los más usados porque toda la app filtra por país.
 *
 * Uso: `node scripts/add-indexes-p0.mjs`. Se puede correr múltiples veces —
 * los IF NOT EXISTS los hacen idempotentes.
 *
 * Nota: pg-pooler no soporta CREATE INDEX CONCURRENTLY en tx implícita, por
 * eso cada CREATE va en su propio round-trip individual.
 */
const INDEXES = [
  // fact_ventas_walmart — codigo_barras + punto_venta faltantes
  { table: 'fact_ventas_walmart',        name: 'idx_fvw_pais_codigo_barras',  cols: '(pais, codigo_barras)' },
  { table: 'fact_ventas_walmart',        name: 'idx_fvw_pais_sku_composite',  cols: '(pais, sku)' },
  { table: 'fact_ventas_walmart',        name: 'idx_fvw_pais_punto_venta',    cols: '(pais, punto_venta)' },
  { table: 'fact_ventas_walmart',        name: 'idx_fvw_pais_fecha',          cols: '(pais, fecha DESC)' },

  // fact_inventario_walmart_pdv — sin índices tracked
  { table: 'fact_inventario_walmart_pdv', name: 'idx_fiwp_pais_fecha',        cols: '(pais, fecha DESC)' },
  { table: 'fact_inventario_walmart_pdv', name: 'idx_fiwp_pais_pdv',          cols: '(pais, punto_venta)' },
  { table: 'fact_inventario_walmart_pdv', name: 'idx_fiwp_pais_cadena',       cols: '(pais, cadena)' },
  { table: 'fact_inventario_walmart_pdv', name: 'idx_fiwp_pais_codigo_barras', cols: '(pais, codigo_barras)' },
  { table: 'fact_inventario_walmart_pdv', name: 'idx_fiwp_pais_sku',          cols: '(pais, sku)' },

  // fact_inventario_walmart_cedi — mismo patrón
  { table: 'fact_inventario_walmart_cedi', name: 'idx_fiwc_pais_fecha',       cols: '(pais, fecha DESC)' },
  { table: 'fact_inventario_walmart_cedi', name: 'idx_fiwc_pais_codigo_barras', cols: '(pais, codigo_barras)' },

  // Otros clientes: codigo_barras faltante
  { table: 'fact_ventas_selectos',       name: 'idx_fvs_codigo_barras',       cols: '(codigo_barras)' },
  { table: 'fact_ventas_unisuper',       name: 'idx_fvu_codigo_barras',       cols: '(codigo_barras)' },
  { table: 'fact_ventas_exito',          name: 'idx_fve_pais_sku',            cols: '(pais, sku)' },
  { table: 'fact_ventas_exito',          name: 'idx_fve_pais_codigo_barras',  cols: '(pais, codigo_barras)' },

  // fact_sales_sellin — filtros comunes por ano_pedido + pais/categoria
  { table: 'fact_sales_sellin',          name: 'idx_fss_ano_pedido',          cols: '(ano_pedido, pais)' },
  { table: 'fact_sales_sellin',          name: 'idx_fss_cliente_ano',         cols: '(cliente_nombre, ano_pedido)' },
]

console.log(`Aplicando ${INDEXES.length} índices...`)
let ok = 0, skipped = 0, failed = 0
const t0 = Date.now()

for (const { table, name, cols } of INDEXES) {
  const t1 = Date.now()
  try {
    // Chequeo si existe la tabla — no todas están garantizadas
    const exists = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = $1`, [table]
    )
    if (exists.rowCount === 0) {
      console.log(`  SKIP (tabla no existe): ${table}`)
      skipped++
      continue
    }
    await pool.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ${name} ON ${table} ${cols}`)
    const ms = Date.now() - t1
    console.log(`  OK   (${ms.toString().padStart(5)} ms) ${table}.${name}`)
    ok++
  } catch (e) {
    console.error(`  FAIL ${table}.${name}: ${e.message}`)
    failed++
  }
}

console.log(`\nResumen: ${ok} creados/existentes, ${skipped} saltados, ${failed} fallidos · ${Math.round((Date.now()-t0)/1000)}s total`)

// Verificación: listar todos los índices creados en fact_*
console.log(`\nÍndices actuales sobre fact_*:`)
const { rows } = await pool.query(`
  SELECT tablename, indexname, indexdef
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename LIKE 'fact_%'
  ORDER BY tablename, indexname
`)
rows.forEach(r => console.log(`  ${r.tablename}.${r.indexname}`))

await pool.end()
