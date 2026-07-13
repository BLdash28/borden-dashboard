/**
 * scrape-precios-crema-dulce.mjs
 * Scraping de precios "crema dulce" en e-commerce:
 *   - Walmart CR/GT/HN/NI/SV (VTEX API)
 *   - Latorre GT - Unisuper (VTEX API)
 *   - Superselectos SV (HTML scraping)
 *
 * Output: C:/Users/IAN/Downloads/Precios_CremaDulce_<fecha>.xlsx
 */
import XLSX from 'xlsx'

const today = new Date()
const fechaIso = today.toISOString().slice(0, 10)
const TERM = 'crema dulce'

// ── Sitios VTEX (mismo formato API) ──────────────────────────────────────
const VTEX_SITES = [
  { id: 'WM-CR',    name: 'Walmart CR',      base: 'https://www.walmart.co.cr',  moneda: 'CRC' },
  { id: 'WM-GT',    name: 'Walmart GT',      base: 'https://www.walmart.com.gt', moneda: 'GTQ' },
  { id: 'WM-HN',    name: 'Walmart HN',      base: 'https://www.walmart.com.hn', moneda: 'HNL' },
  { id: 'WM-NI',    name: 'Walmart NI',      base: 'https://www.walmart.com.ni', moneda: 'NIO' },
  { id: 'WM-SV',    name: 'Walmart SV',      base: 'https://www.walmart.com.sv', moneda: 'USD' },
  { id: 'LATORRE',  name: 'La Torre (Uni)',  base: 'https://www.latorre.com.gt', moneda: 'GTQ' },
]

// ── VTEX scraping ────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function scrapeVtex(site) {
  const out = []
  let from = 0
  const PAGE = 50
  // Hasta 5 páginas (250 productos) máximo
  for (let p = 0; p < 5; p++) {
    const url = `${site.base}/api/catalog_system/pub/products/search/${encodeURIComponent(TERM)}?_from=${from}&_to=${from + PAGE - 1}`
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json,*/*',
        },
        signal: AbortSignal.timeout(20000),
      })
      if (!r.ok) {
        console.log(`   ⚠️  ${site.id} HTTP ${r.status} ${r.statusText}`)
        break
      }
      const data = await r.json()
      if (!Array.isArray(data) || data.length === 0) break
      for (const prod of data) {
        const item    = prod.items?.[0] ?? {}
        const seller  = item.sellers?.[0] ?? prod.sellers?.[0] ?? {}
        const offer   = seller.commertialOffer ?? {}
        const price   = offer.Price ?? offer.PriceWithoutDiscount ?? null
        const listP   = offer.ListPrice ?? null
        // Contenido neto: VTEX a veces lo trae en prod["Contenido Neto"] o specs
        const presentacion = prod['Contenido Neto']?.[0] ?? prod['Presentación']?.[0] ?? ''
        out.push({
          cadena:        site.name,
          pais:          site.id.split('-')[1] ?? '',
          moneda:        site.moneda,
          productId:     prod.productId,
          producto:      prod.productName,
          marca:         prod.brand ?? '',
          presentacion,
          ean:           item.ean ?? '',
          precio:        price,
          precio_lista:  listP,
          disponible:    offer.IsAvailable ?? null,
          url:           prod.link ? site.base + '/' + prod.linkText + '/p' : (prod.linkText ? `${site.base}/${prod.linkText}/p` : ''),
          imagen:        item.images?.[0]?.imageUrl ?? '',
        })
      }
      if (data.length < PAGE) break
      from += PAGE
      await sleep(500)
    } catch (e) {
      console.log(`   ⚠️  ${site.id} error: ${e.message}`)
      break
    }
  }
  return out
}

// ── Superselectos: HTML scraping de la categoría Cremas (01526) ──────────
async function scrapeSelectos() {
  const base = 'https://www.superselectos.com'
  // Categoría 01526 = Cremas
  const CATEGORIAS_CREMAS = ['01526']
  const out = []
  const seen = new Set()
  for (const cat of CATEGORIAS_CREMAS) {
    for (let page = 1; page <= 10; page++) {
      try {
        const url = `${base}/products?category=${cat}&page=${page}`
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          signal: AbortSignal.timeout(20000),
        })
        if (!r.ok) { console.log(`   ⚠️  Selectos cat=${cat} p${page} HTTP ${r.status}`); break }
        const html = await r.text()
        const reBlock = /<div class="info-prod">[\s\S]*?<strong class="precio"[^>]*>([^<]+)<\/strong>[\s\S]*?<h5 class="prod-nombre">\s*<a[^>]*href="([^"]*productId=(\d+)[^"]*)"[^>]*>([^<]+)<\/a>\s*<\/h5>/g
        let m, nuevos = 0, totalEnPagina = 0
        while ((m = reBlock.exec(html))) {
          totalEnPagina++
          const id = m[3]
          if (seen.has(id)) continue
          seen.add(id)
          const precio = parseFloat(m[1].trim().replace('$', '').replace(',', ''))
          const u      = m[2].replace(/&amp;/g, '&')
          const nombre = m[4].trim()
          out.push({
            cadena: 'Selectos', pais: 'SV', moneda: 'USD',
            productId: id, producto: nombre, marca: '',
            presentacion: '', ean: '', precio,
            precio_lista: null, disponible: true,
            url: u.startsWith('http') ? u : `${base}${u}`,
            imagen: '',
          })
          nuevos++
        }
        // Si no hay productos nuevos o la página devuelve los mismos de antes, parar
        if (totalEnPagina === 0 || nuevos === 0) break
        await sleep(500)
      } catch (e) { console.log(`   ⚠️  Selectos cat=${cat} p${page}: ${e.message}`); break }
    }
  }
  return out
}

// ── Main ─────────────────────────────────────────────────────────────────
const all = []
for (const site of VTEX_SITES) {
  console.log(`\n📂 ${site.name}…`)
  const rows = await scrapeVtex(site)
  console.log(`   ${rows.length} productos`)
  all.push(...rows)
}
console.log(`\n📂 Selectos…`)
const sel = await scrapeSelectos()
console.log(`   ${sel.length} productos`)
all.push(...sel)

// Filtrar productos que mencionen "crema" (algunos sitios traen ruido)
const filtered = all.filter(r => /crema/i.test(r.producto ?? ''))

console.log(`\n📊 Total productos: ${all.length} · con "crema" en nombre: ${filtered.length}`)

// ── Excel ────────────────────────────────────────────────────────────────
const cols = ['cadena','pais','moneda','marca','producto','presentacion','ean','precio','precio_lista','disponible','url','productId']
const aoa = [
  [`Precios "crema dulce" — ${fechaIso}`],
  [`Fuentes: Walmart CR/GT/HN/NI/SV (VTEX API) · La Torre GT · Superselectos SV`],
  cols,
  ...filtered.map(r => cols.map(c => r[c] ?? '')),
]
const ws = XLSX.utils.aoa_to_sheet(aoa)
ws['!merges'] = [
  { s: { r: 0, c: 0 }, e: { r: 0, c: cols.length - 1 } },
  { s: { r: 1, c: 0 }, e: { r: 1, c: cols.length - 1 } },
]
ws['!cols'] = [
  { wch: 16 }, { wch: 6 }, { wch: 8 }, { wch: 18 }, { wch: 50 },
  { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 60 }, { wch: 10 },
]
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, 'Precios')

// Sheet adicional: resumen por cadena
const resumen = {}
for (const r of filtered) {
  const k = r.cadena
  if (!resumen[k]) resumen[k] = { cadena: k, pais: r.pais, productos: 0, con_precio: 0 }
  resumen[k].productos++
  if (r.precio != null) resumen[k].con_precio++
}
const resumenRows = Object.values(resumen).sort((a, b) => a.cadena.localeCompare(b.cadena))
const wsR = XLSX.utils.aoa_to_sheet([
  ['Resumen'],
  [`Fecha: ${fechaIso}`],
  ['Cadena','País','Productos encontrados','Con precio'],
  ...resumenRows.map(r => [r.cadena, r.pais, r.productos, r.con_precio]),
])
wsR['!cols'] = [{ wch: 16 }, { wch: 6 }, { wch: 22 }, { wch: 12 }]
XLSX.utils.book_append_sheet(wb, wsR, 'Resumen')

const ts = today.toISOString().slice(11, 16).replace(':', '')
const outPath = `C:/Users/IAN/Downloads/Precios_CremaDulce_${fechaIso}_${ts}.xlsx`
XLSX.writeFile(wb, outPath)
console.log(`\n📄 ${outPath}`)

// Print resumen
console.log('\n=== Resumen ===')
for (const r of resumenRows) console.log(`  ${r.cadena}: ${r.productos} productos (${r.con_precio} con precio)`)
