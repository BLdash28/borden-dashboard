// Reporta días faltantes por cargar en 2026 por cliente en las fact tables de sellout
import pg from 'pg'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const c = new pg.Client({connectionString: process.env.DATABASE_URL})
await c.connect()

// Cada tabla tiene distinto esquema (columna de fecha, cliente/país, etc.)
const CLIENTES = [
  { nombre: 'SELECTOS (SV)',      tabla: 'fact_ventas_selectos',    colFecha: 'fecha' },
  { nombre: 'WALMART (CA)',       tabla: 'fact_ventas_walmart',     colFecha: 'fecha' },
  { nombre: 'UNISUPER (GT)',      tabla: 'fact_ventas_unisuper',    colFecha: 'fecha' },
  { nombre: 'GRUPO ÉXITO (CO)',   tabla: 'fact_ventas_exito',       colYear: 'ano', colMes: 'mes', colDia: 'dia' },
  { nombre: 'COSTA DAIRY (CR)',   tabla: 'fact_ventas_costa_dairy', colFecha: 'fecha' },
]

const HOY  = new Date()
const HOY_MES = HOY.getMonth() + 1  // 1..12
const HOY_DIA = HOY.getDate()

const MESES_LBL = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const DIAS_MES = { 1:31, 2:29, 3:31, 4:30, 5:31, 6:30, 7:31, 8:31, 9:30, 10:31, 11:30, 12:31 } // 2026 no es bisiesto

async function reporte(cliente) {
  // Detectar cómo obtener año/mes/día según el esquema
  let sql
  if (cliente.colFecha) {
    // Tabla con columna fecha (date)
    let where = `EXTRACT(YEAR FROM ${cliente.colFecha})=2026`
    if (cliente.paisFilter) where += ` AND pais='${cliente.paisFilter}'`
    sql = `
      SELECT EXTRACT(MONTH FROM ${cliente.colFecha})::int AS mes,
             array_agg(DISTINCT EXTRACT(DAY FROM ${cliente.colFecha})::int ORDER BY EXTRACT(DAY FROM ${cliente.colFecha})::int) AS dias_cargados
      FROM ${cliente.tabla}
      WHERE ${where}
      GROUP BY 1 ORDER BY 1
    `
  } else {
    sql = `
      SELECT ${cliente.colMes}::int AS mes,
             array_agg(DISTINCT ${cliente.colDia}::int ORDER BY ${cliente.colDia}::int) AS dias_cargados
      FROM ${cliente.tabla}
      WHERE ${cliente.colYear}=2026
      GROUP BY 1 ORDER BY 1
    `
  }

  let rows
  try {
    const r = await c.query(sql)
    rows = r.rows
  } catch (e) {
    console.log(`\n=== ${cliente.nombre} ===  (${cliente.tabla})`)
    console.log(`  ⚠️  Error: ${e.message.split('\n')[0]}`)
    return
  }

  console.log(`\n=== ${cliente.nombre} · ${cliente.tabla} ===`)
  if (!rows.length) {
    console.log('  ❌ Sin datos 2026')
    return
  }

  const porMes = Object.fromEntries(rows.map(r => [Number(r.mes), r.dias_cargados.map(Number)]))
  const salida = []
  for (let m = 1; m <= 12; m++) {
    const totalDias = m === HOY_MES ? HOY_DIA : (m < HOY_MES ? DIAS_MES[m] : 0)
    if (totalDias === 0) continue  // meses futuros no cuentan

    const cargados = porMes[m] ?? []
    const faltantes = []
    for (let d = 1; d <= totalDias; d++) {
      if (!cargados.includes(d)) faltantes.push(d)
    }

    // Comprimir rangos: [1,2,3,7,8,10] → "1-3, 7-8, 10"
    function comprimir(arr) {
      if (!arr.length) return '—'
      const rangos = []
      let start = arr[0], prev = arr[0]
      for (let i = 1; i <= arr.length; i++) {
        if (i === arr.length || arr[i] !== prev + 1) {
          rangos.push(start === prev ? String(start) : `${start}-${prev}`)
          if (i < arr.length) { start = arr[i]; prev = arr[i] }
        } else {
          prev = arr[i]
        }
      }
      return rangos.join(', ')
    }

    const status = faltantes.length === 0 ? '✅ Completo'
                 : faltantes.length === totalDias ? '❌ Sin datos'
                 : `⚠️  Faltan ${faltantes.length}/${totalDias}`
    const rango = comprimir(cargados)
    const gap   = comprimir(faltantes)
    salida.push({
      mes: MESES_LBL[m],
      cargados: `${cargados.length}/${totalDias}`,
      dias_cargados: rango,
      dias_faltantes: gap,
      status,
    })
  }
  console.table(salida)
}

for (const cli of CLIENTES) {
  await reporte(cli)
}

await c.end()
