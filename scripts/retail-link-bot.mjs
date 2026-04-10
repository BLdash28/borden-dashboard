/**
 * retail-link-bot.mjs
 * Automatiza la descarga de "Ventas Dia x Dia" desde
 * Walmart Retail Link 2 → Decision Support → My Reports
 * e inserta los datos en fact_sales_sellout (Neon/PostgreSQL).
 *
 * Uso:    node scripts/retail-link-bot.mjs
 * Debug:  RL_HEADLESS=false node scripts/retail-link-bot.mjs
 */

import { chromium }                             from 'playwright'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname, basename }              from 'path'
import { fileURLToPath }                        from 'url'
import { Pool }                                 from 'pg'
import XLSX                                     from 'xlsx'

// ─────────────────────────────────────────────────────────────
//  CONFIGURACIÓN
// ─────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir   = join(__dirname, '..')

const CONFIG = {
  // Credenciales — define en .env.local:
  //   RL_USER=tu.usuario@empresa.com
  //   RL_PASS=TuClave
  usuario:  process.env.RL_USER || '',
  password: process.env.RL_PASS || '',

  // URLs Retail Link 2
  urlLogin:   'https://retaillink.login.wal-mart.com/',
  urlDecSupp: 'https://retaillink2.wal-mart.com/decision_support/',

  // Nombre del reporte en My Reports (búsqueda parcial, case-insensitive)
  reportName: 'Ventas dia',

  // ¿Cuántos días hacia atrás? 1 = ayer
  diasAtras: 1,

  // ──────────────────────────────────────────────────────────
  //  MAPEO PAÍS → cliente + cadena
  //  El reporte cubre todos los países; la columna "País" (o
  //  equivalente) determina qué código usar.
  // ──────────────────────────────────────────────────────────
  paisMap: {
    GT: { cliente: 'WALMART', cadena: 'WALMART' },
    HN: { cliente: 'WALMART', cadena: 'WALMART' },
    CR: { cliente: 'WALMART', cadena: 'WALMART' },
    SV: { cliente: 'WALMART', cadena: 'WALMART' },
    NI: { cliente: 'WALMART', cadena: 'WALMART' },
  },

  // ──────────────────────────────────────────────────────────
  //  DETECCIÓN DE PAÍS + CADENA desde el Store Name
  //  El reporte cubre todos los países. El nombre de la tienda
  //  contiene la cadena (PAIZ, MAS X MENOS, etc.) que identifica
  //  el país. Ajusta si tus nombres de tienda son diferentes.
  // ──────────────────────────────────────────────────────────
  //  Orden importa: pon los más específicos primero.
  //  [ patrón en Store Name (regex, case-insensitive), pais, cadena ]
  storePatterns: [
    [/PAIZ/i,              'GT', 'PAIZ'],
    [/MAXI\s*PALI/i,       'CR', 'MAXI PALI'],
    [/MAS\s*X\s*MENOS/i,   'CR', 'MAS X MENOS'],
    [/PALI/i,              'CR', 'PALI'],
    [/DESPENSA\s*FAMILIAR/i,'SV','DESPENSA FAMILIAR'],
    [/DESPENSA\s*DON/i,    'SV', 'DESPENSA DON JUAN'],
    [/LA\s*UNION/i,        'NI', 'LA UNION'],
    [/WALMART/i,           'GT', 'WALMART'],   // ← ajusta si hay WALMART en otros países
  ],

  downloadDir: join(rootDir, 'data', 'retail-link'),
  logFile:     join(rootDir, 'data', 'retail-link', 'bot.log'),
  maxRetries:  3,
  headless:    process.env.RL_HEADLESS !== 'false',
}

// ─────────────────────────────────────────────────────────────
//  MAPEO DE COLUMNAS — nombres exactos del reporte Retail Link
// ─────────────────────────────────────────────────────────────
const COL = {
  fecha:      ['Daily'],                 // → ano, mes, dia
  upc:        ['UPC'],                   // → codigo_barras
  sku:        ['Item Nbr'],              // → sku (código interno)
  desc:       ['Signing Desc'],          // → descripcion
  brand:      ['Brand Desc'],            // → categoria
  tiendaNum:  ['Store Nbr'],             // → punto_venta (número)
  tiendaNom:  ['Store Name'],            // → punto_venta + detecta pais/cadena
  formato:    ['Financial Rpt Code'],    // → formato (tipo de tienda)
  unidades:   ['POS Qty'],               // → ventas_unidades
  valor:      ['POS Sales US Dollars'],  // → ventas_valor (USD)
  // Ignorados: Brand ID, WM Week, POS Sales, Exchange Rate Date, Exchange Rate Used
}

// ─────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────
function loadEnv() {
  try {
    const content = readFileSync(join(rootDir, '.env.local'), 'utf8')
    for (const line of content.split(/\r?\n/)) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq === -1) continue
      const k = t.substring(0, eq).trim()
      const v = t.substring(eq + 1).trim()
      if (!process.env[k]) process.env[k] = v
    }
    // Re-aplicar al config (se carga después de que CONFIG fue inicializado)
    if (process.env.RL_USER)     CONFIG.usuario  = process.env.RL_USER
    if (process.env.RL_PASS)     CONFIG.password = process.env.RL_PASS
    if (process.env.RL_PAIS)     CONFIG.pais     = process.env.RL_PAIS
    if (process.env.RL_HEADLESS) CONFIG.headless = process.env.RL_HEADLESS !== 'false'
  } catch (e) {
    console.warn('⚠️   No se pudo leer .env.local:', e.message)
  }
}

function log(msg) {
  const ts   = new Date().toISOString().replace('T',' ').slice(0,19)
  const line = `[${ts}] ${msg}`
  console.log(line)
  try {
    mkdirSync(CONFIG.downloadDir, { recursive: true })
    writeFileSync(CONFIG.logFile, line + '\n', { flag: 'a' })
  } catch (_) {}
}

function pick(row, aliases) {
  for (const a of aliases) {
    if (row[a] !== undefined && row[a] !== null && row[a] !== '') return row[a]
  }
  return null
}

function toNum(v) {
  if (v == null || v === '') return 0
  const n = parseFloat(String(v).replace(/[$,\s]/g,''))
  return isNaN(n) ? 0 : n
}

function parseDate(v) {
  if (!v) return null
  // Si es objeto Date de xlsx
  if (v instanceof Date) return { ano: v.getFullYear(), mes: v.getMonth()+1, dia: v.getDate() }
  const s = String(v).trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return { ano:+m[1], mes:+m[2], dia:+m[3] }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return { ano:+m[3], mes:+m[1], dia:+m[2] }
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (m) return { ano:+m[3], mes:+m[2], dia:+m[1] }
  const MONTH = {ENE:1,FEB:2,MAR:3,ABR:4,MAY:5,JUN:6,JUL:7,AGO:8,SEP:9,OCT:10,NOV:11,DIC:12,
                 JAN:1,APR:4,AUG:8,DEC:12}
  m = s.match(/^(\d{1,2})-([A-Z]{3})-(\d{4})$/i)
  if (m) return { ano:+m[3], mes: MONTH[m[2].toUpperCase()]??1, dia:+m[1] }
  return null
}

// ─────────────────────────────────────────────────────────────
//  PARSEAR ARCHIVO DESCARGADO
// ─────────────────────────────────────────────────────────────
function parseReport(filePath) {
  log(`📂  Parseando: ${basename(filePath)}`)
  const wb  = XLSX.readFile(filePath, { raw: false, cellDates: true })
  const ws  = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
  log(`📊  Filas brutas: ${raw.length}`)
  if (raw.length === 0) throw new Error('Reporte vacío')

  log(`📋  Columnas: ${Object.keys(raw[0]).join(' | ')}`)

  const rows = []
  const tiendaSinMapeo = new Set()

  for (const r of raw) {
    // ── Fecha — "Daily" ────────────────────────────────────
    const d = parseDate(pick(r, COL.fecha))
    if (!d) continue
    const { ano, mes, dia } = d

    // ── Tienda — Store Nbr + Store Name ───────────────────
    const tNum        = String(pick(r, COL.tiendaNum) || '').trim().replace(/\.0$/,'')
    const tNom        = String(pick(r, COL.tiendaNom) || '').trim()
    const punto_venta = tNum && tNom ? `${tNum}-${tNom}` : tNum || tNom || ''

    // ── País + Cadena — detectados desde Store Name ────────
    let pais = null, cadena = null
    for (const [pattern, p, c] of CONFIG.storePatterns) {
      if (pattern.test(tNom)) { pais = p; cadena = c; break }
    }
    if (!pais) {
      if (tNom) tiendaSinMapeo.add(tNom.substring(0, 40))
      continue
    }
    const cliente = 'WALMART'

    // ── Formato — Financial Rpt Code ──────────────────────
    const formato = String(pick(r, COL.formato) || cadena).trim()

    // ── Producto ───────────────────────────────────────────
    const codigo_barras = String(pick(r, COL.upc)   || '').trim().replace(/\.0$/,'')
    const sku           = String(pick(r, COL.sku)   || '').trim().replace(/\.0$/,'')
    const descripcion   = String(pick(r, COL.desc)  || '').trim().toUpperCase()
    const categoria     = String(pick(r, COL.brand) || '').trim().toUpperCase()

    if (!descripcion && !codigo_barras) continue

    // ── Ventas ─────────────────────────────────────────────
    const ventas_unidades = toNum(pick(r, COL.unidades))
    const ventas_valor    = toNum(pick(r, COL.valor))
    if (ventas_unidades === 0 && ventas_valor === 0) continue
    const precio_promedio = ventas_unidades > 0 ? ventas_valor / ventas_unidades : 0

    rows.push({
      pais, cliente, cadena, formato,
      categoria, subcategoria: '', punto_venta, codigo_barras, sku, descripcion,
      ano, mes, dia, ventas_unidades, ventas_valor, precio_promedio,
      archivo_origen: basename(filePath),
    })
  }

  if (tiendaSinMapeo.size > 0) {
    log(`⚠️   Tiendas sin mapeo de país (agrega patrón a storePatterns):`)
    tiendaSinMapeo.forEach(t => log(`     "${t}"`))
  }

  // Resumen por país
  const resumen = {}
  rows.forEach(r => { resumen[r.pais] = (resumen[r.pais] || 0) + 1 })
  log(`   Por país: ${Object.entries(resumen).map(([p,n]) => `${p}=${n}`).join(' | ')}`)
  log(`   Tiendas únicas: ${new Set(rows.map(r => r.punto_venta)).size}`)
  log(`   Productos únicos: ${new Set(rows.map(r => r.codigo_barras)).size}`)

  log(`✅  Filas válidas: ${rows.length}`)
  return rows
}

// ─────────────────────────────────────────────────────────────
//  UPSERT A NEON
// ─────────────────────────────────────────────────────────────
async function upsertRows(rows) {
  if (!rows.length) { log('ℹ️   Sin filas para insertar'); return }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL_NEON, ssl:{rejectUnauthorized:false}, max:5 })
  const c    = await pool.connect()

  // Crear índice único si no existe (previene duplicados al correr 2 veces el mismo día)
  await c.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_sellout_daily
    ON fact_sales_sellout (pais, cadena, punto_venta, codigo_barras, ano, mes, dia)
    WHERE codigo_barras IS NOT NULL AND codigo_barras <> ''
  `).catch(e => log(`⚠️   Index: ${e.message}`))

  let done = 0
  const BATCH = 500
  for (let i=0; i<rows.length; i+=BATCH) {
    const batch = rows.slice(i, i+BATCH)
    const vals  = [], params = []
    let   p     = 1
    for (const r of batch) {
      vals.push(`($${p},$${p+1},$${p+2},$${p+3},$${p+4},$${p+5},$${p+6},$${p+7},$${p+8},$${p+9},$${p+10},$${p+11},$${p+12},$${p+13},$${p+14},$${p+15},$${p+16})`)
      params.push(r.pais,r.cliente,r.cadena,r.formato,r.categoria,r.subcategoria,
                  r.punto_venta,r.codigo_barras,r.sku,r.descripcion,
                  r.ano,r.mes,r.dia,r.ventas_unidades,r.ventas_valor,r.precio_promedio,r.archivo_origen)
      p+=17
    }
    await c.query(`
      INSERT INTO fact_sales_sellout
        (pais,cliente,cadena,formato,categoria,subcategoria,punto_venta,codigo_barras,sku,descripcion,
         ano,mes,dia,ventas_unidades,ventas_valor,precio_promedio,archivo_origen)
      VALUES ${vals.join(',')}
      ON CONFLICT (pais,cadena,punto_venta,codigo_barras,ano,mes,dia)
        WHERE codigo_barras IS NOT NULL AND codigo_barras <> ''
      DO UPDATE SET
        ventas_unidades = EXCLUDED.ventas_unidades,
        ventas_valor    = EXCLUDED.ventas_valor,
        precio_promedio = EXCLUDED.precio_promedio,
        archivo_origen  = EXCLUDED.archivo_origen
    `, params)
    done += batch.length
    process.stdout.write(`\r⬆️   ${done}/${rows.length}`)
  }
  c.release()
  await pool.end()
  log(`\n🎉  ${done} filas upserted en fact_sales_sellout`)
}

// ─────────────────────────────────────────────────────────────
//  LOGIN + DECISION SUPPORT + DESCARGA
// ─────────────────────────────────────────────────────────────
async function runBot() {
  log(`🤖  Iniciando... Pais=${CONFIG.pais} | Headless=${CONFIG.headless}`)
  if (!CONFIG.usuario || !CONFIG.password) throw new Error('Define RL_USER y RL_PASS en .env.local')

  mkdirSync(CONFIG.downloadDir, { recursive: true })

  const browser = await chromium.launch({
    headless: CONFIG.headless,
    args: ['--no-sandbox','--disable-dev-shm-usage'],
  })

  try {
    const ctx  = await browser.newContext({ acceptDownloads:true, viewport:{width:1440,height:900}, locale:'es-GT' })
    const page = await ctx.newPage()

    // ── LOGIN ───────────────────────────────────────────────
    log('🔐  Abriendo Retail Link Login...')
    await page.goto(CONFIG.urlLogin, { waitUntil:'domcontentloaded', timeout:60_000 })
    await page.waitForTimeout(2000)

    // Screenshot para debug
    await page.screenshot({ path: join(CONFIG.downloadDir,'01-login-page.png') })

    // Usuario
    const userSel = 'input[type="text"], input[type="email"], input[name*="user"], input[id*="user"], input[id*="email"], input[name*="email"]'
    await page.waitForSelector(userSel, { timeout:30_000 })
    await page.locator(userSel).first().fill(CONFIG.usuario)
    await page.keyboard.press('Tab')
    await page.waitForTimeout(300)

    // Password
    await page.locator('input[type="password"]').first().fill(CONFIG.password)
    await page.screenshot({ path: join(CONFIG.downloadDir,'02-credentials-filled.png') })

    // Submit
    const submitSel = 'button[type="submit"], input[type="submit"], button:has-text("Log"), button:has-text("Sign"), button:has-text("Iniciar")'
    await page.locator(submitSel).first().click()

    // Esperar post-login
    try {
      await page.waitForURL(url => !url.includes('login.wal-mart.com'), { timeout:30_000 })
    } catch {
      await page.waitForTimeout(5000)
    }
    await page.screenshot({ path: join(CONFIG.downloadDir,'03-post-login.png') })

    // ── MFA DETECTADO ───────────────────────────────────────
    const mfaVisible = await page.locator('input[name*="code"],input[name*="otp"],input[placeholder*="code"],input[placeholder*="código"]').isVisible().catch(()=>false)
    if (mfaVisible) {
      if (!CONFIG.headless) {
        log('⚠️   MFA detectado — completa el código en el browser. Tienes 90 segundos...')
        await page.waitForTimeout(90_000)
      } else {
        throw new Error('MFA requerido. Corre con RL_HEADLESS=false para completarlo manualmente la primera vez.')
      }
    }

    const finalUrl = page.url()
    log(`   URL tras login: ${finalUrl}`)
    if (finalUrl.includes('login')) {
      throw new Error(`Login falló. Revisa usuario/contraseña. URL: ${finalUrl}`)
    }
    log('✅  Login exitoso')

    // ── NAVEGAR A DECISION SUPPORT ──────────────────────────
    log('🗂️   Abriendo Decision Support...')
    await page.goto(CONFIG.urlDecSupp, { waitUntil:'domcontentloaded', timeout:60_000 })
    await page.waitForTimeout(3000)
    await page.screenshot({ path: join(CONFIG.downloadDir,'04-decision-support.png') })

    // ── MY REPORTS ──────────────────────────────────────────
    log('📂  Buscando "My Reports"...')
    const myReportsLink = page.locator('a:has-text("My Reports"), span:has-text("My Reports"), li:has-text("My Reports")').first()
    const mrVisible = await myReportsLink.isVisible({ timeout:10_000 }).catch(()=>false)
    if (mrVisible) {
      await myReportsLink.click()
      await page.waitForTimeout(2000)
    }
    await page.screenshot({ path: join(CONFIG.downloadDir,'05-my-reports.png') })

    // ── REPORTS (sub-menú) ──────────────────────────────────
    const reportsLink = page.locator('a:has-text("Reports"), span:has-text("Reports")').first()
    const repVisible  = await reportsLink.isVisible({ timeout:5_000 }).catch(()=>false)
    if (repVisible) {
      await reportsLink.click()
      await page.waitForTimeout(2000)
    }

    // ── BUSCAR "VENTAS DIA X DIA" ───────────────────────────
    log(`🔍  Buscando reporte: "${CONFIG.reportName}"...`)

    // Esperar lista de reportes
    await page.waitForTimeout(3000)
    await page.screenshot({ path: join(CONFIG.downloadDir,'06-reports-list.png') })

    // Intentar buscar en tabla/lista de reportes
    const reportLink = page.locator(`a:has-text("${CONFIG.reportName}"), td:has-text("${CONFIG.reportName}"), span:has-text("${CONFIG.reportName}")`).first()
    const rlVisible  = await reportLink.isVisible({ timeout:10_000 }).catch(()=>false)

    if (!rlVisible) {
      log(`⚠️   No se encontró "${CONFIG.reportName}" en la lista visible.`)
      log('   Screenshots guardados en data/retail-link/ para diagnóstico.')
      log('   Ajusta CONFIG.reportName en el script con el nombre exacto del reporte.')
      throw new Error(`Reporte "${CONFIG.reportName}" no encontrado`)
    }

    // Click al reporte
    await reportLink.click()
    await page.waitForTimeout(3000)
    await page.screenshot({ path: join(CONFIG.downloadDir,'07-report-opened.png') })

    // ── AJUSTAR FECHA (si hay date picker) ─────────────────
    const ayer = new Date()
    ayer.setDate(ayer.getDate() - CONFIG.diasAtras)
    const yyyy = ayer.getFullYear()
    const mm   = String(ayer.getMonth()+1).padStart(2,'0')
    const dd   = String(ayer.getDate()).padStart(2,'0')
    log(`📅  Fecha: ${dd}/${mm}/${yyyy}`)

    // Intentar setear fechas si existen inputs
    const dateInputs = page.locator('input[type="date"]')
    const nDates     = await dateInputs.count()
    if (nDates > 0) {
      const isoDate = `${yyyy}-${mm}-${dd}`
      for (let i=0; i<Math.min(nDates,2); i++) {
        await dateInputs.nth(i).fill(isoDate).catch(()=>{})
      }
      log(`   Fecha seteada en ${nDates} campo(s)`)
    }

    // ── EJECUTAR / DESCARGAR ────────────────────────────────
    log('▶️   Ejecutando reporte y esperando descarga...')
    const downloadPromise = ctx.waitForEvent('download', { timeout:180_000 })

    // Probar múltiples botones posibles
    const btnSelectors = [
      'button:has-text("Descargar")',
      'button:has-text("Download")',
      'button:has-text("Export")',
      'button:has-text("Exportar")',
      'button:has-text("Run")',
      'a:has-text("Excel")',
      'a:has-text("CSV")',
      'a[href*="download"]',
      'a[href*="export"]',
      'input[value="Run"]',
      'input[value="Download"]',
    ]

    let clicked = false
    for (const sel of btnSelectors) {
      const btn = page.locator(sel).first()
      const vis = await btn.isVisible().catch(()=>false)
      if (vis) {
        log(`   Clickeando: ${sel}`)
        await btn.click()
        clicked = true
        break
      }
    }

    if (!clicked) {
      await page.screenshot({ path: join(CONFIG.downloadDir,'08-no-button.png') })
      throw new Error('No se encontró botón de descarga. Screenshot en data/retail-link/08-no-button.png')
    }

    const download = await downloadPromise
    const fileName = download.suggestedFilename() || `ventas-dia-${yyyy}${mm}${dd}.xlsx`
    const savePath = join(CONFIG.downloadDir, fileName)
    await download.saveAs(savePath)
    log(`✅  Descargado: ${fileName}`)

    await browser.close()
    return savePath

  } catch (err) {
    await browser.close()
    throw err
  }
}

// ─────────────────────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────────────────────
async function main() {
  loadEnv()
  log('═'.repeat(60))
  log('🚀  Retail Link Bot — BL Dashboard Sellout')

  if (!process.env.DATABASE_URL_NEON) {
    log('❌  DATABASE_URL_NEON no encontrado en .env.local'); process.exit(1)
  }

  for (let attempt=1; attempt<=CONFIG.maxRetries; attempt++) {
    try {
      if (attempt > 1) log(`🔄  Reintento ${attempt}/${CONFIG.maxRetries}`)
      const filePath = await runBot()
      const rows     = parseReport(filePath)
      await upsertRows(rows)
      log('✅  Completado exitosamente')
      log('═'.repeat(60))
      process.exit(0)
    } catch(err) {
      log(`❌  Error intento ${attempt}: ${err.message}`)
      if (attempt === CONFIG.maxRetries) { log('💀  Abortado.'); log('═'.repeat(60)); process.exit(1) }
      log('⏸️   Reintentando en 30s...')
      await new Promise(r => setTimeout(r, 30_000))
    }
  }
}

main()
