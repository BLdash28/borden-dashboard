import pg from 'pg'

const DB = 'postgresql://postgres.ntkmokdmpslqbkkqdnxq:Xvz4zjU2EElSr0Pj@aws-1-us-east-2.pooler.supabase.com:6543/postgres'
const pool = new pg.Pool({ connectionString: DB, ssl: { rejectUnauthorized: false } })

const indexes = [
  `CREATE INDEX IF NOT EXISTS idx_fvw_pais_fecha
     ON fact_ventas_walmart (pais, fecha)`,
  `CREATE INDEX IF NOT EXISTS idx_fvw_pais_fecha_cadena
     ON fact_ventas_walmart (pais, fecha, cadena)`,
  `CREATE INDEX IF NOT EXISTS idx_fvw_pais_fecha_categoria
     ON fact_ventas_walmart (pais, fecha, categoria)`,
  `CREATE INDEX IF NOT EXISTS idx_fss_pais_ano_mes
     ON fact_sales_sellin (pais, ano, mes)`,
  `CREATE INDEX IF NOT EXISTS idx_fss_cliente_nombre
     ON fact_sales_sellin (cliente_nombre)`,
]

for (const sql of indexes) {
  const name = sql.match(/idx_\w+/)?.[0] ?? '?'
  process.stdout.write(`Creating ${name}...`)
  try {
    await pool.query(sql)
    console.log(' ✅')
  } catch (e) {
    console.log(` ❌ ${e.message}`)
  }
}

await pool.end()
console.log('Done.')
