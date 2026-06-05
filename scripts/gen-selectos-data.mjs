/**
 * Genera el dashboard HTML de Selectos con datos inyectados.
 * Uso: node scripts/gen-selectos-data.mjs [ruta-template.html]
 * Salida: public/dashboards/selectos_dashboard.html  (+ selectos_data.json)
 */

import pg from 'pg'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const { Pool } = pg
const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Ajustar según el período que se quiere reportar
const CONFIG = {
  CADENA:          'SELECTOS',
  CLIENTE_SELLIN:  'CALLEJA',
  PAIS:            'SV',
  CURRENT_YEAR:    2026,

  // Meses "sanos" usados para calcular VPD baseline (sin quiebres ni picos)
  // Formato: 'YYYY-MM'
  BASELINE_MONTHS: ['2025-11', '2025-12', '2026-01'],

  // Meses a excluir del análisis OOS (se calculan como pérdida vs baseline)
  OOS_MONTHS: [],

  // Thresholds de días de cobertura para clasificar health
  DOH: { QUIEBRE: 0, CRITICO: 7, RIESGO: 14, ATENCION: 21, SALUDABLE: 60 },

  OUTPUT_JSON: join(__dirname, '../public/dashboards/selectos_data.json'),
  OUTPUT_HTML: join(__dirname, '../public/dashboards/selectos_dashboard.html'),
  // Ruta al template — puede pasarse como argumento: node gen-selectos-data.mjs <ruta>
  TEMPLATE: process.argv[2] ?? join(__dirname, '../../../Downloads/TEMPLATE_DASHBOARD (2).html'),

  // Valores para reemplazar los placeholders del template
  PLACEHOLDERS: {
    CHAIN_NAME:     'Super Selectos',
    CLIENT_NAME:    'BL Foods',
    CLIENT_BRAND:   'Borden',
    CLIENT_SLUG:    'selectos',
    COUNTRY:        'El Salvador',
    DIV1_NAME:      'Queso',
    DIV1_SKUS:      '27',
    DIV2_NAME:      'Leche',
    DIV2_SKUS:      '0',
    LECHE_PROVIDER: 'BL Foods',
  },
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const f = (v) => parseFloat(v) || 0
const i = (v) => parseInt(v)  || 0

function daysInMonth(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

function monthKey(ano, mes) {
  return `${ano}-${String(mes).padStart(2, '0')}`
}

// Pareto: recibe array de { sku, val } ordenado desc, devuelve map sku→{pct_individual,pct_cumulative,pareto}
function calcPareto(skuVals) {
  const total = skuVals.reduce((s, x) => s + x.val, 0)
  let cum = 0
  const result = {}
  for (const { sku, val } of skuVals) {
    const pct = total > 0 ? val / total : 0
    cum += pct
    result[sku] = {
      pct_individual: +(pct * 100).toFixed(4),
      pct_cumulative: +(cum * 100).toFixed(4),
      pareto: cum <= 0.80 ? 'A' : cum <= 0.95 ? 'B' : 'C',
    }
  }
  return result
}

// Clasificación de health basada en DOH y cobertura
function calcHealth(doh_pdv, doh_total, cob_num, vpd_uni) {
  if (vpd_uni === 0) return 'Sin datos'
  if (doh_pdv <= CONFIG.DOH.QUIEBRE && cob_num < 5) return 'QUIEBRE'
  if (doh_pdv < CONFIG.DOH.CRITICO)  return 'CRÍTICO'
  if (doh_pdv < CONFIG.DOH.RIESGO)   return 'RIESGO'
  if (doh_total > 90)                return 'SOBRESTOCK'
  if (doh_pdv < CONFIG.DOH.ATENCION) return 'ATENCIÓN'
  if (cob_num < 40)                  return 'COBERTURA ALTA'
  return 'SALUDABLE'
}

// Tendencia basada en crecimiento YTD vs año anterior
function calcTendencia(growth, isInnovation) {
  if (isInnovation) return 'Lanzamiento 2026'
  if (growth === null) return 'Sin datos'
  if (growth >= 10)   return 'Crecimiento'
  if (growth >= -5)   return 'Estable'
  return 'Declive'
}

// ─── DB ──────────────────────────────────────────────────────────────────────
function connect() {
  if (process.env.DATABASE_URL) {
    return new Pool({ connectionString: process.env.DATABASE_URL })
  }
  const raw = readFileSync(join(__dirname, '../.env.local'), 'utf8')
  const env = Object.fromEntries(
    raw.split(/\r?\n/)
      .filter(l => l.includes('=') && !l.startsWith('#'))
      .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
  )
  return new Pool({ connectionString: env.DATABASE_URL })
}

// ─── QUERIES ─────────────────────────────────────────────────────────────────
async function loadAll(pool) {
  console.log('Cargando datos desde DB...')

  const [
    invMeta,
    monthlySellout,
    vpd15d,
    skuInventory,
    storeInventory,
    sellIn,
    dimProducto,
    cediInventory,
  ] = await Promise.all([

    // Metadata de inventario
    pool.query(`
      SELECT
        MAX(fecha)::date             AS inv_date,
        COUNT(DISTINCT tienda)       AS n_stores
      FROM fact_selectos_inventario
      WHERE fecha = (SELECT MAX(fecha) FROM fact_selectos_inventario)
    `),

    // Sellout mensual por SKU (últimos 2 años completos)
    pool.query(`
      SELECT
        codigo_barras        AS barcode,
        descripcion,
        categoria,
        subcategoria,
        ano,
        mes,
        SUM(ventas_valor::numeric)     AS val,
        SUM(ventas_unidades::numeric)  AS uni,
        COUNT(DISTINCT punto_venta)    AS tiendas_con_venta
      FROM mv_sellout_mensual
      WHERE cadena = $1
        AND ano IN ($2, $3)
      GROUP BY codigo_barras, descripcion, categoria, subcategoria, ano, mes
      ORDER BY codigo_barras, ano, mes
    `, [CONFIG.CADENA, CONFIG.CURRENT_YEAR - 1, CONFIG.CURRENT_YEAR]),

    // VPD últimos 15 días disponibles (usa la fecha máxima del archivo, no today)
    pool.query(`
      WITH last_date AS (SELECT MAX(fecha) AS d FROM fact_ventas_selectos WHERE pais = $1)
      SELECT
        codigo_barras                                       AS barcode,
        SUM(ventas_unidades::numeric) / 15.0               AS vpd_uni_15d,
        SUM(ventas_valor::numeric)    / 15.0               AS vpd_val_15d
      FROM fact_ventas_selectos, last_date
      WHERE fecha >= last_date.d - INTERVAL '14 days'
        AND pais = $1
      GROUP BY codigo_barras
    `, [CONFIG.PAIS]),

    // Inventario PDV por SKU (snapshot más reciente)
    pool.query(`
      SELECT
        p.codigo_barras                                                  AS barcode,
        SUM(i.inventario_unidades::numeric)                              AS pdv_uni,
        SUM(i.inventario_valor::numeric)                                 AS pdv_val,
        COUNT(DISTINCT i.tienda)                                         AS stores_active,
        COUNT(DISTINCT i.tienda) FILTER (WHERE i.inventario_unidades::numeric > 0) AS stores_with_stock
      FROM fact_selectos_inventario i
      JOIN dim_producto p ON p.codigo_barras = i.codigo_barra
      WHERE i.fecha = (SELECT MAX(fecha) FROM fact_selectos_inventario)
      GROUP BY p.codigo_barras
    `),

    // Inventario PDV por SKU × tienda
    pool.query(`
      SELECT
        p.codigo_barras                        AS barcode,
        p.descripcion                          AS producto,
        p.categoria,
        p.subcategoria,
        i.tienda,
        COALESCE(i.nse, 'U')                  AS nse,
        SUM(i.inventario_unidades::numeric)    AS inv_uni,
        SUM(i.inventario_valor::numeric)       AS inv_val
      FROM fact_selectos_inventario i
      JOIN dim_producto p ON p.codigo_barras = i.codigo_barra
      WHERE i.fecha = (SELECT MAX(fecha) FROM fact_selectos_inventario)
      GROUP BY p.codigo_barras, p.descripcion, p.categoria, p.subcategoria, i.tienda, i.nse
      ORDER BY p.codigo_barras, i.tienda
    `),

    // Sell-in mensual por categoría (CALLEJA)
    pool.query(`
      SELECT
        ano,
        mes,
        COALESCE(categoria, 'Quesos') AS categoria,
        SUM(venta_neta)      AS val,
        SUM(cantidad_cajas)  AS cajas
      FROM fact_sales_sellin
      WHERE cliente_nombre = $1
        AND pais = $2
        AND ano IN ($3, $4)
      GROUP BY ano, mes, categoria
      ORDER BY ano, mes
    `, [CONFIG.CLIENTE_SELLIN, CONFIG.PAIS, CONFIG.CURRENT_YEAR - 1, CONFIG.CURRENT_YEAR]),

    // Catálogo de productos
    pool.query(`
      SELECT sku, codigo_barras AS barcode, descripcion, categoria, subcategoria
      FROM dim_producto
      WHERE is_active = true
    `),

    // CEDI inventory (SV) — puede estar vacío
    pool.query(`
      SELECT
        upc,
        SUM(inv_mano_cajas::numeric)  AS inv_mano_cajas,
        SUM(inv_orden_cajas::numeric) AS inv_orden_cajas
      FROM inventario_cedi
      WHERE pais = $1
        AND fecha = (SELECT MAX(fecha) FROM inventario_cedi WHERE pais = $1)
      GROUP BY upc
    `, [CONFIG.PAIS]),
  ])

  console.log(`  → ${monthlySellout.rows.length} filas sellout mensual`)
  console.log(`  → ${storeInventory.rows.length} filas inventario tiendas`)
  console.log(`  → ${sellIn.rows.length} filas sell-in`)

  return { invMeta, monthlySellout, vpd15d, skuInventory, storeInventory, sellIn, dimProducto, cediInventory }
}

// ─── BUILD JSON ──────────────────────────────────────────────────────────────
function buildJSON(data) {
  const { invMeta, monthlySellout, vpd15d, skuInventory, storeInventory, sellIn, dimProducto, cediInventory } = data

  const invDate  = invMeta.rows[0]?.inv_date?.toISOString?.().split('T')[0] ?? new Date().toISOString().split('T')[0]
  const nStores  = i(invMeta.rows[0]?.n_stores)

  // ── Índices rápidos ──────────────────────────────────────────────────────
  const skuInvMap  = Object.fromEntries(skuInventory.rows.map(r => [r.barcode, r]))
  const vpd15Map   = Object.fromEntries(vpd15d.rows.map(r => [r.barcode, r]))
  const dimMap     = Object.fromEntries(dimProducto.rows.map(r => [r.barcode, r]))

  // CEDI: match por los primeros 11 dígitos del UPC (quitar leading zeros)
  const cediMap = {}
  for (const r of cediInventory.rows) {
    const normalized = r.upc.replace(/^0+/, '')
    cediMap[normalized] = r
  }

  // ── Sellout: agrupar por barcode + mes ───────────────────────────────────
  // monthlyByBarcode[barcode][YYYY-MM] = { val, uni, tiendas_con_venta }
  const monthlyByBarcode = {}
  const allMonthsSet = new Set()

  for (const r of monthlySellout.rows) {
    const mk = monthKey(r.ano, r.mes)
    allMonthsSet.add(mk)
    if (!monthlyByBarcode[r.barcode]) monthlyByBarcode[r.barcode] = {}
    monthlyByBarcode[r.barcode][mk] = {
      val:              f(r.val),
      uni:              f(r.uni),
      tiendas_con_venta: i(r.tiendas_con_venta),
      categoria:        r.categoria,
      subcategoria:     r.subcategoria,
      descripcion:      r.descripcion,
    }
  }

  const months = [...allMonthsSet].sort()
  const baselineDays = CONFIG.BASELINE_MONTHS.reduce((s, m) => s + daysInMonth(m), 0)

  // ── Active SKUs ──────────────────────────────────────────────────────────
  const activeBarcodesSet = new Set()
  for (const r of monthlySellout.rows) {
    if (r.ano === CONFIG.CURRENT_YEAR) activeBarcodesSet.add(r.barcode)
  }
  const activeBarcodes = [...activeBarcodesSet]

  // ── VPD baseline por SKU ─────────────────────────────────────────────────
  const vpdMap = {}
  for (const barcode of activeBarcodes) {
    const monthly = monthlyByBarcode[barcode] ?? {}
    let sumUni = 0, sumVal = 0
    for (const mk of CONFIG.BASELINE_MONTHS) {
      sumUni += monthly[mk]?.uni ?? 0
      sumVal += monthly[mk]?.val ?? 0
    }
    vpdMap[barcode] = {
      vpd_uni: baselineDays > 0 ? +(sumUni / baselineDays).toFixed(4) : 0,
      vpd_val: baselineDays > 0 ? +(sumVal / baselineDays).toFixed(4) : 0,
    }
  }

  // ── Período activo (val_active, uni_active) ──────────────────────────────
  const activeValMap = {}
  for (const barcode of activeBarcodes) {
    const monthly = monthlyByBarcode[barcode] ?? {}
    let val = 0, uni = 0
    for (const [mk, d] of Object.entries(monthly)) {
      if (mk.startsWith(String(CONFIG.CURRENT_YEAR))) { val += d.val; uni += d.uni }
    }
    activeValMap[barcode] = { val, uni }
  }

  // ── Pareto ───────────────────────────────────────────────────────────────
  const sortedByVal = activeBarcodes
    .map(b => ({ sku: b, val: activeValMap[b]?.val ?? 0 }))
    .sort((a, b) => b.val - a.val)
  const paretoMap = calcPareto(sortedByVal)

  // ── Crecimiento YTD ──────────────────────────────────────────────────────
  const currentYear = CONFIG.CURRENT_YEAR
  const prevYear    = currentYear - 1
  // Usar los mismos meses del año actual disponibles
  const currentMonths = months.filter(m => m.startsWith(String(currentYear)))
  const prevMonths    = currentMonths.map(m => m.replace(String(currentYear), String(prevYear)))

  const growthMap = {}
  for (const barcode of activeBarcodes) {
    const monthly = monthlyByBarcode[barcode] ?? {}
    const curVal  = currentMonths.reduce((s, m) => s + (monthly[m]?.val ?? 0), 0)
    const prevVal = prevMonths.reduce((s, m)  => s + (monthly[m]?.val ?? 0), 0)
    growthMap[barcode] = prevVal > 0 ? +((curVal - prevVal) / prevVal * 100).toFixed(2) : null
  }

  // ── Launch date (primera venta) ──────────────────────────────────────────
  const launchMap = {}
  for (const r of monthlySellout.rows) {
    if (!launchMap[r.barcode] || monthKey(r.ano, r.mes) < launchMap[r.barcode]) {
      launchMap[r.barcode] = monthKey(r.ano, r.mes) + '-01'
    }
  }

  // ─ Innovation: launched in last 4 months ─────────────────────────────────
  const fourMonthsAgo = new Date()
  fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4)
  const isInnovation = (barcode) => {
    const launch = launchMap[barcode]
    if (!launch) return false
    return new Date(launch) >= fourMonthsAgo
  }

  // ── sku_rows ─────────────────────────────────────────────────────────────
  console.log('Construyendo sku_rows...')
  const skuRows = []

  for (const barcode of activeBarcodes) {
    const inv    = skuInvMap[barcode]  ?? {}
    const vpd15  = vpd15Map[barcode]   ?? {}
    const dim    = dimMap[barcode]     ?? {}
    const vpd    = vpdMap[barcode]     ?? {}
    const pareto = paretoMap[barcode]  ?? {}
    const active = activeValMap[barcode] ?? {}
    const monthly = monthlyByBarcode[barcode] ?? {}

    // Get descripcion/categoria from monthly data (most complete source)
    const sample = Object.values(monthly)[0] ?? {}

    const pdv_uni   = f(inv.pdv_uni)
    const pdv_val   = f(inv.pdv_val)
    const cedi_uni  = 0  // CEDI SV actualmente vacío
    const cedi_val  = 0
    const vpd_uni   = vpd.vpd_uni
    const vpd_uni_15d = f(vpd15.vpd_uni_15d)
    const doh_pdv   = vpd_uni > 0 ? +(pdv_uni / vpd_uni).toFixed(1) : 0
    const doh_total = vpd_uni > 0 ? +((pdv_uni + cedi_uni) / vpd_uni).toFixed(1) : 0
    const doh_pdv_15d   = vpd_uni_15d > 0 ? +(pdv_uni / vpd_uni_15d).toFixed(1) : 0
    const doh_total_15d = vpd_uni_15d > 0 ? +((pdv_uni + cedi_uni) / vpd_uni_15d).toFixed(1) : 0
    const stores_with_stock = i(inv.stores_with_stock)
    const stores_active     = i(inv.stores_active)
    const cob_num  = nStores > 0 ? +(stores_with_stock / nStores * 100).toFixed(2) : 0
    const cob_pond = cob_num  // simplificado — misma sin ponderación por ahora
    const growth   = growthMap[barcode]
    const innovation = isInnovation(barcode)

    skuRows.push({
      sku:           barcode,
      producto:      dim.descripcion ?? sample.descripcion ?? barcode,
      division:      dim.categoria   ?? sample.categoria   ?? 'Quesos',
      categoria:     dim.subcategoria ?? sample.subcategoria ?? '',
      is_innovation: innovation,
      launch:        launchMap[barcode] ?? null,

      val_active:  +active.val.toFixed(2),
      uni_active:  +active.uni.toFixed(0),

      vpd_uni:      vpd_uni,
      vpd_val:      vpd.vpd_val,
      vpd_uni_15d:  +vpd_uni_15d.toFixed(4),

      pdv_uni,
      pdv_val:      +pdv_val.toFixed(2),
      cedi_uni,
      cedi_val,
      total_inv_uni: pdv_uni + cedi_uni,
      total_inv_val: +(pdv_val + cedi_val).toFixed(2),

      doh_pdv,
      doh_total,
      doh_pdv_15d,
      doh_total_15d,

      cob_num,
      cob_num_full: stores_active > 0 ? +(stores_with_stock / stores_active * 100).toFixed(2) : 0,
      cob_pond,
      cob_max_pct:   cob_num,    // máximo histórico — sin historial = actual
      cob_max_month: invDate.slice(0, 7),

      stores_active,
      stores_with_stock,
      total_stores: nStores,

      // NSE — datos no disponibles actualmente en Selectos, se rellenan con ceros
      nse_A_stock: { n_stores: 0, pct_actual: 0, pct_max: 0, total: 0 },
      nse_C_stock: { n_stores: 0, pct_actual: 0, pct_max: 0, total: 0 },
      nse_D_stock: { n_stores: 0, pct_actual: 0, pct_max: 0, total: 0 },
      nse_U_stock: { n_stores: stores_with_stock, pct_actual: cob_num, pct_max: cob_num, total: pdv_uni },

      growth_clean: growth,
      tendencia:    calcTendencia(growth, innovation),
      health:       calcHealth(doh_pdv, doh_total, cob_num, vpd_uni),

      ...pareto,

      // Precios — no disponibles en DB aún; dejar en 0 para completar manualmente
      avg_price:         0,
      cost_unit:         0,
      exworks_case:      0,
      pvp_unit:          0,
      pvp_sin_iva:       0,
      margen_bruto_pct:  0,
      precio_fob_case:   0,
      uxc:               0,
      cajas_layer:       0,
      layers_pallet:     0,
      cajas_pallet:      0,

      val_baseline: CONFIG.BASELINE_MONTHS.reduce((s, m) => s + (monthly[m]?.val ?? 0), 0) / CONFIG.BASELINE_MONTHS.length,
      uni_baseline: CONFIG.BASELINE_MONTHS.reduce((s, m) => s + (monthly[m]?.uni ?? 0), 0) / CONFIG.BASELINE_MONTHS.length,

      elasticity:       null,
      elasticity_r2:    null,
      elasticity_note:  'Sin datos',
    })
  }

  // Sort by val_active desc
  skuRows.sort((a, b) => b.val_active - a.val_active)

  // ── sku_store_rows ───────────────────────────────────────────────────────
  const skuStoreRows = storeInventory.rows.map(r => ({
    sku:        r.barcode,
    producto:   r.producto,
    division:   r.categoria,
    categoria:  r.subcategoria,
    tienda:     r.tienda,
    nse:        r.nse,
    inv_uni:    f(r.inv_uni),
    inv_val:    +f(r.inv_val).toFixed(2),
    doh_pdv:    (() => {
      const v = vpdMap[r.barcode]?.vpd_uni ?? 0
      return v > 0 ? +(f(r.inv_uni) / v).toFixed(1) : 0
    })(),
  }))

  // ── all_skus_monthly + months aggregate ─────────────────────────────────
  const allSkusMonthly = {}
  const monthValMap = {}
  const monthUniMap = {}

  for (const mk of months) {
    monthValMap[mk] = 0
    monthUniMap[mk] = 0
  }

  for (const barcode of activeBarcodes) {
    allSkusMonthly[barcode] = { val: [], uni: [] }
    for (const mk of months) {
      const d = monthlyByBarcode[barcode]?.[mk]
      allSkusMonthly[barcode].val.push(d ? +d.val.toFixed(2) : 0)
      allSkusMonthly[barcode].uni.push(d ? Math.round(d.uni) : 0)
      if (d) {
        monthValMap[mk] += d.val
        monthUniMap[mk] += d.uni
      }
    }
  }

  const monthly_val = months.map(m => +monthValMap[m].toFixed(2))
  const monthly_uni = months.map(m => Math.round(monthUniMap[m]))

  // ── top5 ─────────────────────────────────────────────────────────────────
  const top5_skus = skuRows.slice(0, 5).map(r => r.sku)
  const top5_monthly = {}
  const top5_names   = {}
  for (const barcode of top5_skus) {
    top5_monthly[barcode] = allSkusMonthly[barcode]
    top5_names[barcode]   = skuRows.find(r => r.sku === barcode)?.producto ?? barcode
  }

  // ── coverage_kpis ────────────────────────────────────────────────────────
  const cob_vals = skuRows.map(r => r.cob_num).filter(v => v > 0)
  const avg_actual = cob_vals.length ? +(cob_vals.reduce((a, b) => a + b, 0) / cob_vals.length).toFixed(2) : 0
  const coverage_kpis = { avg_actual, avg_pond: avg_actual, avg_max: avg_actual, avg_gap: 0 }

  // ── coverage_sku ─────────────────────────────────────────────────────────
  const coverage_sku = skuRows.map(r => ({
    sku:              r.sku,
    producto:         r.producto,
    division:         r.division,
    categoria:        r.categoria,
    cob_actual_num:   r.cob_num,
    cob_actual_pond:  r.cob_pond,
    cob_max_num:      r.cob_max_pct,
    cob_max_month:    r.cob_max_month,
    gap_pp:           0,
    stores_active:    r.stores_active,
    nse_A: r.nse_A_stock,
    nse_C: r.nse_C_stock,
    nse_D: r.nse_D_stock,
  }))

  // ── coverage_store ───────────────────────────────────────────────────────
  const storeSkuCount = {}
  for (const r of skuStoreRows) {
    if (!storeSkuCount[r.tienda]) storeSkuCount[r.tienda] = { total: 0, con_stock: 0, venta: 0 }
    storeSkuCount[r.tienda].total++
    if (r.inv_uni > 0) storeSkuCount[r.tienda].con_stock++
  }
  const coverage_store = Object.entries(storeSkuCount).map(([tienda, s]) => ({
    tienda,
    nse:               'U',
    n_skus_stock:      s.con_stock,
    n_skus_distribuidos: s.total,
    cobertura_pct:     s.total > 0 ? +(s.con_stock / s.total * 100).toFixed(2) : 0,
    venta_total:       0,
    pareto_class:      'B',
  }))

  // ── coverage_by_nse ──────────────────────────────────────────────────────
  const coverage_by_nse = {
    U: { n_stores: nStores, avg_coverage_pct: avg_actual, avg_max_pct: avg_actual },
    A: { n_stores: 0, avg_coverage_pct: 0, avg_max_pct: 0 },
    C: { n_stores: 0, avg_coverage_pct: 0, avg_max_pct: 0 },
    D: { n_stores: 0, avg_coverage_pct: 0, avg_max_pct: 0 },
  }

  // ── sell_in_monthly ──────────────────────────────────────────────────────
  const sell_in_monthly = {}
  const sell_in_monthly_by_arrival = {}
  for (const r of sellIn.rows) {
    const mk = monthKey(r.ano, r.mes)
    if (!sell_in_monthly[mk]) sell_in_monthly[mk] = { real: 0, projected: null, plan_target: null }
    sell_in_monthly[mk].real += f(r.val)
  }

  // ── division_kpis ────────────────────────────────────────────────────────
  const cyMonths = months.filter(m => m.startsWith(String(currentYear)))
  const pyMonths = cyMonths.map(m => m.replace(String(currentYear), String(prevYear)))

  function divSellout(divFilter) {
    let cy = 0, py = 0
    for (const barcode of activeBarcodes) {
      const dim = dimMap[barcode] ?? {}
      const sample = Object.values(monthlyByBarcode[barcode] ?? {})[0] ?? {}
      const cat = dim.categoria ?? sample.categoria ?? ''
      if (divFilter && cat !== divFilter) continue
      const monthly = monthlyByBarcode[barcode] ?? {}
      cy += cyMonths.reduce((s, m) => s + (monthly[m]?.val ?? 0), 0)
      py += pyMonths.reduce((s, m) => s + (monthly[m]?.val ?? 0), 0)
    }
    return { cy, py }
  }

  function divSellin(divFilter) {
    let cy = 0, py = 0
    for (const r of sellIn.rows) {
      if (divFilter && r.categoria !== divFilter) continue
      const mk = monthKey(r.ano, r.mes)
      if (cyMonths.includes(mk))   cy += f(r.val)
      else if (pyMonths.includes(mk)) py += f(r.val)
    }
    return { cy, py }
  }

  function mkDivKpis(soFilter, siFilter) {
    const so = divSellout(soFilter)
    const si = divSellin(siFilter)
    const soGrowth = so.py > 0 ? +((so.cy - so.py) / so.py * 100).toFixed(2) : 0
    const siGrowth = si.py > 0 ? +((si.cy - si.py) / si.py * 100).toFixed(2) : 0
    return {
      sell_out_ytd_2026:  +so.cy.toFixed(2),
      sell_out_fy_2025:   +so.py.toFixed(2),
      sell_out_growth_fy: soGrowth,
      sell_in_ytd_2026:   +si.cy.toFixed(2),
      sell_in_fy_2025:    +si.py.toFixed(2),
      sell_in_growth_fy:  siGrowth,
      sell_in_target_fy:  0,   // sin meta cargada
      sistema_fy_fob:     0,
      cumplimiento_fy_pct: 0,
      gap_to_target:      0,
    }
  }

  const division_kpis = {
    total: mkDivKpis(null, null),
    queso: mkDivKpis('Quesos', 'Quesos'),
    leche: mkDivKpis('Leches', 'Leches'),
  }

  // ── kpis generales ───────────────────────────────────────────────────────
  const totalVal  = skuRows.reduce((s, r) => s + r.val_active, 0)
  const totalUni  = skuRows.reduce((s, r) => s + r.uni_active, 0)
  const totalInv  = skuRows.reduce((s, r) => s + r.total_inv_val, 0)

  // health_sku: object keyed by health status — requerido por renderInsights
  const health_sku = {}
  for (const r of skuRows) health_sku[r.health] = (health_sku[r.health] ?? 0) + 1

  // baseline avg monthly (sellout)
  const baselineMonthlyVals = CONFIG.BASELINE_MONTHS.map(mk => {
    const idx = months.indexOf(mk)
    return idx >= 0 ? (monthly_val[idx] ?? 0) : 0
  })
  const baseline_avg_monthly     = baselineMonthlyVals.length > 0
    ? +(baselineMonthlyVals.reduce((s, v) => s + v, 0) / baselineMonthlyVals.length).toFixed(2)
    : 0
  const baselineMonthlyUniVals = CONFIG.BASELINE_MONTHS.map(mk => {
    const idx = months.indexOf(mk)
    return idx >= 0 ? (monthly_uni[idx] ?? 0) : 0
  })
  const baseline_avg_monthly_uni = baselineMonthlyUniVals.length > 0
    ? Math.round(baselineMonthlyUniVals.reduce((s, v) => s + v, 0) / baselineMonthlyUniVals.length)
    : 0

  // quiebre_tienda: SKU×Tienda combos con inv=0 que tienen VPD > 0 (activos)
  const quiebre_tienda = skuStoreRows.filter(r => r.inv_uni === 0 && (vpdMap[r.sku]?.vpd_uni ?? 0) > 0).length
  const critico_sala   = skuStoreRows.filter(r => r.doh_pdv > 0 && r.doh_pdv < 7).length

  // pareto counts
  const pareto_a = skuRows.filter(r => r.pareto === 'A').length
  const pareto_b = skuRows.filter(r => r.pareto === 'B').length
  const pareto_c = skuRows.filter(r => r.pareto === 'C').length

  const kpis = {
    total_val_active: +totalVal.toFixed(2),
    total_uni_active: Math.round(totalUni),
    total_inv_val:    +totalInv.toFixed(2),
    n_sku_saludable:  health_sku['SALUDABLE']   ?? 0,
    n_sku_critico:    (health_sku['CRÍTICO'] ?? 0) + (health_sku['QUIEBRE'] ?? 0),
    n_sku_sobrestock: health_sku['SOBRESTOCK']  ?? 0,
    n_sku_riesgo:     health_sku['RIESGO']      ?? 0,
    cob_num_avg:      avg_actual,
    // Campos requeridos por el template
    health_sku,
    quiebre_tienda,
    quiebre_sku_cedi: 0,   // sin CEDI activo
    critico_cedi:     0,
    critico_sala,
    baseline_avg_monthly,
    baseline_avg_monthly_uni,
    total_lost_val:   0,   // se calcula en oos_analysis
    total_lost_uni:   0,
    pareto_a,
    pareto_b,
    pareto_c,
  }

  // ── OOS analysis ─────────────────────────────────────────────────────────
  const baselineAvgVal = CONFIG.BASELINE_MONTHS.length > 0
    ? monthly_val.filter((_, idx) => CONFIG.BASELINE_MONTHS.includes(months[idx]))
        .reduce((s, v) => s + v, 0) / CONFIG.BASELINE_MONTHS.length
    : 0
  const baselineAvgUni = CONFIG.BASELINE_MONTHS.length > 0
    ? monthly_uni.filter((_, idx) => CONFIG.BASELINE_MONTHS.includes(months[idx]))
        .reduce((s, v) => s + v, 0) / CONFIG.BASELINE_MONTHS.length
    : 0

  const oosMonthsData = {}
  let totalLostVal = 0, totalLostUni = 0
  for (const mk of CONFIG.OOS_MONTHS) {
    const idx = months.indexOf(mk)
    if (idx < 0) continue
    const actual    = monthly_val[idx] ?? 0
    const actualUni = monthly_uni[idx] ?? 0
    const lost      = Math.max(0, baselineAvgVal - actual)
    const lostUni   = Math.max(0, baselineAvgUni - actualUni)
    totalLostVal += lost
    totalLostUni += lostUni
    oosMonthsData[mk] = { actual, actual_uni: actualUni, baseline: baselineAvgVal, lost_val: +lost.toFixed(2), lost_uni: Math.round(lostUni) }
  }

  const oos_analysis = {
    baseline_avg_val: +baselineAvgVal.toFixed(2),
    baseline_avg_uni: Math.round(baselineAvgUni),
    total_lost_val:   +totalLostVal.toFixed(2),
    total_lost_uni:   Math.round(totalLostUni),
    months:           oosMonthsData,
  }

  // ── innovations ──────────────────────────────────────────────────────────
  const innovations = skuRows
    .filter(r => r.is_innovation)
    .map(r => {
      const storeDetails = skuStoreRows
        .filter(s => s.sku === r.sku)
        .map(s => ({ tienda: s.tienda, inv_uni: s.inv_uni }))
      const monthlyTrend = months
        .filter(m => m >= (r.launch?.slice(0, 7) ?? ''))
        .map(m => {
          const idx = months.indexOf(m)
          return { month: m, uni: allSkusMonthly[r.sku]?.uni[idx] ?? 0 }
        })
      return {
        sku:               r.sku,
        producto:          r.producto,
        division:          r.division,
        first_sale:        r.launch,
        days_since_launch: r.launch ? Math.floor((Date.now() - new Date(r.launch)) / 86400000) : 0,
        launch_month:      r.launch?.slice(0, 7) ?? null,
        cobertura_pct:     r.cob_num,
        vpd_uni_15d:       r.vpd_uni_15d,
        vpd_uni_baseline:  r.vpd_uni,
        inv_uni:           r.pdv_uni,
        inv_val:           r.pdv_val,
        doh_15d:           r.doh_pdv_15d,
        doh_baseline:      r.doh_pdv,
        stores_with_either: r.stores_active,
        total_stores:      nStores,
        stores_stock_no_sale: 0,
        stores_sale_no_stock: 0,
        store_detail:      storeDetails,
        monthly_trend:     monthlyTrend,
      }
    })

  // ── ofertas (SKUs en sobrestock) ─────────────────────────────────────────
  const ofertas = skuRows
    .filter(r => r.health === 'SOBRESTOCK')
    .map(r => ({
      sku:               r.sku,
      producto:          r.producto,
      pareto:            r.pareto,
      doh_total:         r.doh_total,
      excedente_uni:     Math.max(0, r.total_inv_uni - r.vpd_uni * 60),
      excedente_val:     0,
      descuento_propuesto: 0,
      recupero_post:     0,
      urgencia:          r.doh_total > 120 ? 'Alta' : 'Media',
    }))

  const total_excedente_uni = ofertas.reduce((s, o) => s + o.excedente_uni, 0)
  const total_excedente_val = ofertas.reduce((s, o) => s + (o.excedente_val ?? 0), 0)

  const ofertas_kpis = {
    n_total:             ofertas.length,
    n_criticas:          ofertas.filter(o => o.urgencia === 'Alta').length,
    n_altas:             ofertas.length,
    n_medias:            0,
    n_bajas:             0,
    total_excedente_uni: Math.round(total_excedente_uni),
    total_excedente_val: +total_excedente_val.toFixed(2),
    total_post:          0,
  }

  // ── kpis_by_division ─────────────────────────────────────────────────────
  function kpisForDiv(divFilter) {
    const rows = divFilter ? skuRows.filter(r => r.division === divFilter || (!divFilter)) : skuRows
    const filtRows = divFilter === null ? skuRows : skuRows.filter(r =>
      divFilter === 'Quesos' ? (r.division !== 'Leches') : r.division === divFilter
    )
    const hsku = {}
    for (const r of filtRows) hsku[r.health] = (hsku[r.health] ?? 0) + 1
    const baselineVals = CONFIG.BASELINE_MONTHS.map(mk => {
      let s = 0
      for (const b of filtRows) {
        const idx = months.indexOf(mk)
        if (idx >= 0) s += allSkusMonthly[b.sku]?.val[idx] ?? 0
      }
      return s
    })
    const avgMonthly = baselineVals.length > 0
      ? +(baselineVals.reduce((s, v) => s + v, 0) / baselineVals.length).toFixed(2)
      : 0
    return {
      health_sku:              hsku,
      baseline_avg_monthly:    avgMonthly,
      baseline_avg_monthly_uni: 0,
      quiebre_tienda:          skuStoreRows.filter(r => r.inv_uni === 0 && filtRows.some(s => s.sku === r.sku)).length,
      quiebre_sku_cedi:        0,
      critico_cedi:            0,
      critico_sala:            skuStoreRows.filter(r => r.doh_pdv > 0 && r.doh_pdv < 7 && filtRows.some(s => s.sku === r.sku)).length,
      pareto_a:                filtRows.filter(r => r.pareto === 'A').length,
      pareto_b:                filtRows.filter(r => r.pareto === 'B').length,
      pareto_c:                filtRows.filter(r => r.pareto === 'C').length,
    }
  }

  const kpis_by_division = {
    total: kpisForDiv(null),
    queso: kpisForDiv('Quesos'),
    leche: kpisForDiv('Leches'),
  }

  // ── price_list ───────────────────────────────────────────────────────────
  const price_list = skuRows.map(r => ({
    sku:              r.sku,
    name:             r.producto,
    producto_local:   r.producto,
    categoria:        r.categoria,
    is_innovation:    r.is_innovation,
    units_per_case:   r.uxc,
    exworks_case:     r.exworks_case,
    cost_unit:        r.cost_unit,
    pvp_sin_iva:      r.pvp_sin_iva,
    pvp_unit:         r.pvp_unit,
    margen_bruto_pct: r.margen_bruto_pct,
    margen_bruto_unit: 0,
    precio_fob_case:  r.precio_fob_case,
    precio_fob_unit:  0,
  }))

  // ── metadata ─────────────────────────────────────────────────────────────
  const metadata = {
    inv_date:       invDate,
    n_active_sku:   activeBarcodes.length,
    n_total_sku:    dimProducto.rows.length,
    n_stores:       nStores,
    baseline_months: CONFIG.BASELINE_MONTHS,
    oos_months:     CONFIG.OOS_MONTHS,
    period_start:   months[0] ? months[0] + '-01' : null,
    period_end:     invDate,
    cadena:         CONFIG.CADENA,
    pais:           CONFIG.PAIS,
    generated_at:   new Date().toISOString(),
  }

  // ── dates_daily: rango de fechas para el selector de evolución ──────────
  // Generamos rango diario entre period_start y inv_date
  const dates_daily = []
  {
    const start = new Date(months[0] + '-01')
    const end   = new Date(invDate)
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates_daily.push(d.toISOString().split('T')[0])
    }
  }

  // daily_val y daily_uni: 0 por ahora (requeriría query adicional)
  const daily_val = dates_daily.map(() => 0)
  const daily_uni = dates_daily.map(() => 0)

  // Sync kpis.total_lost_val con oos_analysis
  kpis.total_lost_val = oos_analysis.total_lost_val
  kpis.total_lost_uni = oos_analysis.total_lost_uni

  return {
    metadata,
    sku_rows: skuRows,
    sku_store_rows: skuStoreRows,
    division_kpis,
    kpis_by_division,
    all_skus_monthly: allSkusMonthly,
    months,
    monthly_val,
    monthly_uni,
    dates_daily,
    daily_val,
    daily_uni,
    top5_skus,
    top5_monthly,
    top5_names,
    coverage_kpis,
    coverage_sku,
    coverage_store,
    coverage_by_nse,
    sell_in_monthly,
    sell_in_monthly_by_arrival,
    kpis,
    oos_analysis,
    innovations,
    ofertas,
    ofertas_kpis,
    price_list,
    // Pedidos — sin data por ahora
    order_total_cases: 0,
    order_total_units: 0,
    order_n_skus:      0,
    // Bloques opcionales no disponibles aún
    pedidos_queso_palletizados: {},
    next_order_container:       null,
    annual_orders_unified:      [],
    milk_pedido_sugerido:       null,
    sell_in_bl_foods:           { fy_total: 0, ytd_real: 0, monthly: {} },
    fefo:                       [],
    fefo_kpis:                  { total_cases: 0, total_units: 0, total_lots: 0, n_critical: 0, n_warning: 0, n_safe: 0 },
    quiebres_proyectados:       [],
    depuracion_candidatos:      [],
    depuracion_threshold_uni_mes: 5,
    non_active_info:            [],
    holidays:                   [],
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
const pool = connect()

try {
  const raw  = await loadAll(pool)
  const json = buildJSON(raw)

  mkdirSync(dirname(CONFIG.OUTPUT_JSON), { recursive: true })

  // Escribir JSON separado
  writeFileSync(CONFIG.OUTPUT_JSON, JSON.stringify(json, null, 2), 'utf8')

  // Inyectar JSON en el template HTML y escribir HTML standalone
  let html
  try {
    html = readFileSync(CONFIG.TEMPLATE, 'utf8')
  } catch {
    console.warn(`\n⚠ Template no encontrado: ${CONFIG.TEMPLATE}`)
    console.warn('  Pasá la ruta como argumento: node scripts/gen-selectos-data.mjs <ruta-template.html>')
    html = null
  }

  if (html) {
    // Reemplazar primero el uso de {{CHAIN_NAME}} como identificador JS (sin espacios)
    // Ej: "const margen{{CHAIN_NAME}}" debe quedar "const margenSELECTOS" no "const margenSuper Selectos"
    const chainId = CONFIG.PLACEHOLDERS.CHAIN_NAME.replace(/\s+/g, '').replace(/[^a-zA-Z0-9_$]/g, '')
    html = html.replace(/\bmargen\{\{CHAIN_NAME\}\}/g, `margen${chainId}`)

    // Reemplazar todos los demás placeholders {{KEY}} con valores reales
    for (const [key, val] of Object.entries(CONFIG.PLACEHOLDERS)) {
      html = html.replaceAll(`{{${key}}}`, val)
    }

    // Inyectar JSON en el bloque data-json
    const jsonStr = JSON.stringify(json)
    html = html.replace(
      /(<script\s+id="data-json"[^>]*>)[\s\S]*?(<\/script>)/,
      `$1\n${jsonStr}\n$2`
    )

    // Parchear el bloque INIT para que ningún crash bloquee los tabs
    // Envuelve cada llamada sin try-catch en su propio try-catch
    const UNSAFE_INIT_CALLS = [
      'renderKpiCards()',
      'renderAlerts()',
      'renderSellIn()',
      'renderYtdKpis()',
      'renderNseInsights()',
      'renderInsights()',
      'renderHealthCharts()',
      'renderRecommendations()',
      'renderSkuTable(getFilteredSkuRows())',
      'renderStoreTable(DATA.sku_store_rows)',
    ]
    for (const call of UNSAFE_INIT_CALLS) {
      // Solo envuelve las llamadas que estén en una línea sola (inicio de línea)
      html = html.replace(
        new RegExp(`^(${call.replace(/[()[\].]/g, '\\$&')};?)$`, 'm'),
        `try { ${call}; } catch(_e){ console.error('Init ${call}:', _e); }`
      )
    }
    // También envuelve los addEventListener de init que pueden crashear si el elemento no existe
    html = html.replace(
      /^(document\.getElementById\('filter\w+'\)\.addEventListener\(.*\);)$/mg,
      `try { $1 } catch(_e){}`
    )

    writeFileSync(CONFIG.OUTPUT_HTML, html, 'utf8')
    console.log(`✓ HTML generado: ${CONFIG.OUTPUT_HTML}`)
  }

  const size = (JSON.stringify(json).length / 1024).toFixed(1)
  console.log(`✓ JSON generado: ${CONFIG.OUTPUT_JSON}`)
  console.log(`  ${json.sku_rows.length} SKUs activos | ${json.sku_store_rows.length} filas tienda | ${size} KB`)
  console.log(`  Meses: ${json.months[0]} → ${json.months.at(-1)}`)
  console.log(`  Inv date: ${json.metadata.inv_date} | Tiendas: ${json.metadata.n_stores}`)

  const health = {}
  for (const r of json.sku_rows) health[r.health] = (health[r.health] ?? 0) + 1
  console.log('\n  Health breakdown:')
  for (const [k, v] of Object.entries(health)) console.log(`    ${k}: ${v} SKUs`)

} finally {
  await pool.end()
}
