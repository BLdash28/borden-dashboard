import pg from 'pg'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

const cols = await client.query(`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'fact_ventas_exito'
  ORDER BY ordinal_position
`)
console.log('== Schema fact_ventas_exito ==')
console.table(cols.rows)

const years = await client.query(`
  SELECT ano,
         COUNT(*)::int filas,
         SUM(ventas_unidades)::int uds,
         SUM(venta_valorcop)::numeric(20,2) venta_cop,
         MIN(mes) mes_min, MAX(mes) mes_max
  FROM fact_ventas_exito
  WHERE pais='CO'
  GROUP BY ano
  ORDER BY ano
`)
console.log('\n== fact_ventas_exito por año ==')
console.table(years.rows)

await client.end()
