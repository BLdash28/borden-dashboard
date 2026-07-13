import pg from 'pg'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const c = new pg.Client({ connectionString: process.env.DATABASE_URL })
await c.connect()

const r = await c.query(`
  SELECT
    COUNT(*)::int total,
    COUNT(*) FILTER (WHERE subformato IS NOT NULL AND subformato <> '')::int con_subformato,
    COUNT(*) FILTER (WHERE subcadena IS NOT NULL AND subcadena <> '')::int con_subcadena,
    COUNT(DISTINCT subformato)::int subformato_distinct,
    COUNT(DISTINCT subcadena)::int subcadena_distinct
  FROM fact_ventas_exito
  WHERE pais='CO' AND ano=2026
`)
console.table(r.rows)

const s = await c.query(`
  SELECT subcadena, COUNT(*)::int filas
  FROM fact_ventas_exito
  WHERE pais='CO' AND ano=2026 AND subcadena IS NOT NULL AND subcadena <> ''
  GROUP BY subcadena ORDER BY filas DESC LIMIT 10
`)
console.log('\n== Subcadena distintos ==')
console.table(s.rows)

await c.end()
