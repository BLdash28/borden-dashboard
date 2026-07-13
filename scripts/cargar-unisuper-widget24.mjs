// Carga widget (24).csv (últimos 30 días Unisuper GT) → fact_ventas_unisuper
// - Purga las fechas presentes en el CSV antes de insertar (idempotente)
// - Convierte GTQ→USD con la tasa promedio 2026 ≈ 0.130311 (1 USD = 7.67 GTQ)
//
// Uso: node --env-file=.env.local scripts/cargar-unisuper-widget24.mjs [ruta.csv]

import fs from 'node:fs'
import pg from 'pg'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const CSV_PATH = process.argv[2] ?? 'C:/Users/IAN/Downloads/widget (24).csv'
const TASA_GTQ_A_USD = 0.130311

const c = new pg.Client({connectionString: process.env.DATABASE_URL})
await c.connect()

// Leer CSV. El archivo comienza con BOM (﻿) — lo strip-eamos.
let raw = fs.readFileSync(CSV_PATH, 'utf8')
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1)
const lines = raw.split(/\r?\n/).filter(Boolean)
const header = lines.shift()
console.log(`[OK] leídas ${lines.length} filas del CSV`)

// Parser simple de CSV con quotes
function parseCsv(line) {
  const out = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"' && line[i+1] === '"') { cur += '"'; i++ }
      else if (ch === '"') inQ = false
      else cur += ch
    } else {
      if (ch === '"') inQ = true
      else if (ch === ',') { out.push(cur); cur = '' }
      else cur += ch
    }
  }
  out.push(cur)
  return out
}

// Parsear y capturar fechas para purga
const rows = []
const fechasSet = new Set()
for (const line of lines) {
  const p = parseCsv(line)
  if (p.length < 13) continue
  const [fecha, cadena, codsuc, nomsuc, cat, subcat, prov, marca, sku, ean, desc, uds, valorGtqStr] = p
  if (!fecha) continue
  fechasSet.add(fecha)
  const valorGtq = parseFloat(valorGtqStr) || 0
  const valorUsd = valorGtq * TASA_GTQ_A_USD
  rows.push({
    fecha, pais: 'GT',
    cadena: cadena.trim() || null,
    codigo_sucursal: codsuc.trim() || null,
    nombre_sucursal: nomsuc.trim() || null,
    categoria: cat.trim() || null,
    subcategoria: subcat.trim() || null,
    marca: marca.trim() || null,
    sku: sku.trim() || null,
    codigo_barras: ean.trim() || null,
    descripcion: desc.trim() || null,
    ventas_unidades: parseFloat(uds) || 0,
    ventas_valor: valorUsd,
    ventas_valor_gtq: valorGtq,
  })
}
console.log(`[OK] ${rows.length} filas parseadas · ${fechasSet.size} fechas distintas`)
console.log(`   rango: ${[...fechasSet].sort()[0]} → ${[...fechasSet].sort().reverse()[0]}`)

// Purga
const fechas = [...fechasSet]
const del = await c.query(
  `DELETE FROM fact_ventas_unisuper WHERE pais='GT' AND fecha = ANY($1::date[])`,
  [fechas],
)
console.log(`[OK] purgadas ${del.rowCount} filas previas de las fechas del CSV`)

// Insertar en batches
const BATCH = 300
let inserted = 0
for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH)
  const values = []
  const params = []
  let p = 1
  for (const r of chunk) {
    values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`)
    params.push(
      r.fecha, r.pais, r.cadena, r.codigo_sucursal, r.nombre_sucursal,
      r.categoria, r.subcategoria, r.marca, r.sku, r.codigo_barras,
      r.descripcion, r.ventas_unidades, r.ventas_valor, r.ventas_valor_gtq,
    )
  }
  await c.query(`
    INSERT INTO fact_ventas_unisuper
      (fecha, pais, cadena, codigo_sucursal, nombre_sucursal,
       categoria, subcategoria, marca, sku, codigo_barras,
       descripcion, ventas_unidades, ventas_valor, ventas_valor_gtq)
    VALUES ${values.join(',')}
  `, params)
  inserted += chunk.length
}
console.log(`[OK] insertadas ${inserted} filas`)

// Resumen final
const r = await c.query(`
  SELECT EXTRACT(MONTH FROM fecha)::int mes,
    COUNT(DISTINCT EXTRACT(DAY FROM fecha))::int dias_distintos,
    COUNT(*)::int filas,
    SUM(ventas_valor)::numeric(20,2) usd,
    SUM(ventas_valor_gtq)::numeric(20,2) gtq
  FROM fact_ventas_unisuper
  WHERE pais='GT' AND EXTRACT(YEAR FROM fecha)=2026
  GROUP BY 1 ORDER BY 1
`)
console.log('\n[Estado Unisuper 2026 por mes]')
console.table(r.rows)

await c.end()
